'use client'

import { createClient } from '@/lib/supabase/client'

export type ChatRole = 'user' | 'assistant'

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  toolCalls?: ToolCall[]
}

export interface ToolCall {
  id: string
  name: string
  summary?: string
  error?: boolean
  status: 'running' | 'done' | 'error'
}

export type ChatEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_use_start'; id: string; name: string }
  | { type: 'tool_use_done'; id: string; name: string; summary: string; error?: boolean }
  | { type: 'done'; stop_reason: string | null }
  | { type: 'error'; message: string }

export type ChatProvider = 'claude' | 'openai'

export interface SendOptions {
  messages: Array<{ role: ChatRole; content: string }>
  signal?: AbortSignal
  provider?: ChatProvider
}

export async function* streamChat({
  messages,
  signal,
  provider = 'claude',
}: SendOptions): AsyncGenerator<ChatEvent> {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Not authenticated')

  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({ messages, provider }),
    signal,
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(text || `Chat failed with HTTP ${response.status}`)
  }
  if (!response.body) throw new Error('Streaming not available in this browser')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      let boundary = buffer.indexOf('\n\n')
      while (boundary !== -1) {
        const raw = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        const parsed = parseSseBlock(raw)
        if (parsed) yield parsed
        boundary = buffer.indexOf('\n\n')
      }
    }
  } finally {
    reader.releaseLock()
  }
}

export function parseSseBlock(block: string): ChatEvent | null {
  const lines = block.split('\n')
  let event = ''
  let data = ''
  for (const line of lines) {
    if (line.startsWith('event: ')) event = line.slice(7).trim()
    else if (line.startsWith('data: ')) data += line.slice(6)
  }
  if (!event || !data) return null
  try {
    const payload = JSON.parse(data)
    return { type: event, ...payload } as ChatEvent
  } catch {
    return null
  }
}
