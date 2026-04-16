import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { authenticateRequest, isAuthError } from '@/lib/finance/auth'
import { CHAT_TOOLS, executeTool } from '@/lib/chat/tools'
import { SYSTEM_PROMPT } from '@/lib/chat/system-prompt'
import { runOpenAIChatLoop } from '@/lib/chat/openai-stream'

export const runtime = 'nodejs'
export const maxDuration = 60

const MODEL = 'claude-sonnet-4-5-20250929'
const MAX_ITERATIONS = 6

interface InboundMessage {
  role: 'user' | 'assistant'
  content: string
}

type ChatProvider = 'claude' | 'openai'

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request)
  if (isAuthError(auth)) return auth

  let body: { messages?: InboundMessage[]; provider?: ChatProvider }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const provider: ChatProvider = body.provider === 'openai' ? 'openai' : 'claude'

  if (provider === 'openai' && !process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: 'Chat not configured: OPENAI_API_KEY missing on server.' },
      { status: 500 }
    )
  }
  if (provider === 'claude' && !process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'Chat not configured: ANTHROPIC_API_KEY missing on server.' },
      { status: 500 }
    )
  }

  const inbound = body.messages || []
  if (!inbound.length || inbound.every((m) => m.role !== 'user')) {
    return NextResponse.json({ error: 'At least one user message required' }, { status: 400 })
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder()
      const send = (event: string, data: unknown) => {
        const line = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
        controller.enqueue(encoder.encode(line))
      }

      try {
        if (provider === 'openai') {
          const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
          await runOpenAIChatLoop(openai, inbound, auth.userId, send)
          controller.close()
          return
        }

        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

        // Build initial conversation — user/assistant text turns only.
        const conversation: Anthropic.MessageParam[] = inbound.map((m) => ({
          role: m.role,
          content: m.content,
        }))

        for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
          // Stream one Claude response; collect tool uses and text.
          const result = await anthropic.messages.stream({
            model: MODEL,
            max_tokens: 2048,
            system: SYSTEM_PROMPT,
            tools: CHAT_TOOLS,
            messages: conversation,
          })

          const toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }> = []

          for await (const event of result) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              send('text_delta', { text: event.delta.text })
            }
            if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
              send('tool_use_start', {
                id: event.content_block.id,
                name: event.content_block.name,
              })
            }
          }

          const final = await result.finalMessage()

          // Record assistant message in the running conversation.
          conversation.push({ role: 'assistant', content: final.content })

          for (const block of final.content) {
            if (block.type === 'tool_use') {
              toolUses.push({
                id: block.id,
                name: block.name,
                input: (block.input as Record<string, unknown>) || {},
              })
            }
          }

          if (final.stop_reason !== 'tool_use' || toolUses.length === 0) {
            send('done', { stop_reason: final.stop_reason })
            controller.close()
            return
          }

          // Execute every tool use the model requested in parallel, then feed results back.
          const toolResults = await Promise.all(
            toolUses.map(async (use) => {
              try {
                const result = await executeTool(use.name, use.input, { userId: auth.userId })
                send('tool_use_done', {
                  id: use.id,
                  name: use.name,
                  summary: result.summary,
                })
                return {
                  type: 'tool_result' as const,
                  tool_use_id: use.id,
                  content: JSON.stringify(result),
                }
              } catch (error) {
                const message = error instanceof Error ? error.message : 'Tool failed'
                send('tool_use_done', {
                  id: use.id,
                  name: use.name,
                  summary: `Failed: ${message}`,
                  error: true,
                })
                return {
                  type: 'tool_result' as const,
                  tool_use_id: use.id,
                  content: JSON.stringify({ error: message }),
                  is_error: true,
                }
              }
            })
          )

          conversation.push({ role: 'user', content: toolResults })
          // Loop back — Claude will see the tool results and continue.
        }

        send('done', { stop_reason: 'max_iterations' })
        controller.close()
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Chat failed'
        send('error', { message })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
