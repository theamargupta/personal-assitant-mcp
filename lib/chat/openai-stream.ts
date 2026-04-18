import OpenAI from 'openai'
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions'
import { CHAT_TOOLS, executeTool } from '@/lib/chat/tools'
import { SYSTEM_PROMPT } from '@/lib/chat/system-prompt'

const MAX_ITERATIONS = 6

export const OPENAI_CHAT_MODEL = process.env.OPENAI_CHAT_MODEL ?? 'gpt-4o-mini'

function buildOpenAITools(): ChatCompletionTool[] {
  return CHAT_TOOLS.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description ?? '',
      parameters: t.input_schema as unknown as Record<string, unknown>,
    },
  }))
}

type Inbound = { role: 'user' | 'assistant'; content: string }

/**
 * Same SSE contract as the Anthropic path: text_delta, tool_use_start, tool_use_done, done, error.
 */
export async function runOpenAIChatLoop(
  openai: OpenAI,
  inbound: Inbound[],
  userId: string,
  send: (event: string, data: unknown) => void
): Promise<void> {
  const tools = buildOpenAITools()

  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...inbound.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  ]

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const stream = await openai.chat.completions.create({
      model: OPENAI_CHAT_MODEL,
      messages,
      tools,
      stream: true,
      max_tokens: 2048,
    })

    let assistantContent = ''
    const toolParts = new Map<
      number,
      { id: string; name: string; arguments: string; started: boolean }
    >()
    let finishReason: string | null = null

    for await (const chunk of stream) {
      const choice = chunk.choices[0]
      if (!choice) continue
      if (choice.finish_reason) finishReason = choice.finish_reason

      const delta = choice.delta
      if (delta.content) {
        send('text_delta', { text: delta.content })
        assistantContent += delta.content
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0
          const cur = toolParts.get(idx) ?? {
            id: '',
            name: '',
            arguments: '',
            started: false,
          }
          if (tc.id) cur.id = tc.id
          if (tc.function?.name) cur.name = tc.function.name
          if (tc.function?.arguments) cur.arguments += tc.function.arguments

          if (cur.name && cur.id && !cur.started) {
            send('tool_use_start', { id: cur.id, name: cur.name })
            cur.started = true
          }
          toolParts.set(idx, cur)
        }
      }
    }

    const sorted = Array.from(toolParts.entries()).sort((a, b) => a[0] - b[0])
    for (const [, p] of sorted) {
      if (p.name && p.id && !p.started) {
        send('tool_use_start', { id: p.id, name: p.name })
        p.started = true
      }
    }

    if (finishReason !== 'tool_calls' || sorted.length === 0) {
      send('done', { stop_reason: finishReason })
      return
    }

    const toolUses = sorted
      .map(([, p]) => {
        let input: Record<string, unknown> = {}
        try {
          input = JSON.parse(p.arguments || '{}') as Record<string, unknown>
        } catch {
          input = { _parse_error: true }
        }
        const id = p.id || `call_${iter}_${Math.random().toString(36).slice(2)}`
        return { id, name: p.name, arguments: p.arguments, input }
      })
      .filter((u) => u.name.length > 0)

    if (toolUses.length === 0) {
      send('done', { stop_reason: finishReason })
      return
    }

    const tool_calls = toolUses.map((u) => ({
      id: u.id,
      type: 'function' as const,
      function: {
        name: u.name,
        arguments: u.arguments,
      },
    }))

    messages.push({
      role: 'assistant',
      content: assistantContent || null,
      tool_calls,
    })

    const toolResults = await Promise.all(
      toolUses.map(async (use) => {
        try {
          const result = await executeTool(use.name, use.input, { userId })
          send('tool_use_done', {
            id: use.id,
            name: use.name,
            summary: result.summary,
          })
          return {
            role: 'tool' as const,
            tool_call_id: use.id,
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
            role: 'tool' as const,
            tool_call_id: use.id,
            content: JSON.stringify({ error: message }),
          }
        }
      })
    )

    messages.push(...toolResults)
  }

  send('done', { stop_reason: 'max_iterations' })
}
