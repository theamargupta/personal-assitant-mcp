import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// --- Mocks ---------------------------------------------------------------

vi.mock('@/lib/finance/auth', () => ({
  authenticateRequest: vi.fn().mockResolvedValue({ userId: 'user-1' }),
  isAuthError: vi.fn().mockReturnValue(false),
}))

// Mock the OpenAI streaming loop at the module boundary — per task spec.
const runOpenAIChatLoopMock = vi.fn()
vi.mock('@/lib/chat/openai-stream', () => ({
  runOpenAIChatLoop: (...args: unknown[]) => runOpenAIChatLoopMock(...args),
}))

// Mock @/lib/chat/tools (used in openai-stream import path, but route doesn't
// import it directly). Keep a harmless stub in case Node resolves it anyway.
const executeToolMock = vi.fn()
vi.mock('@/lib/chat/tools', () => ({
  CHAT_TOOLS: [],
  executeTool: (...args: unknown[]) => executeToolMock(...args),
}))

vi.mock('@/lib/chat/system-prompt', () => ({
  SYSTEM_PROMPT: 'system',
}))

// Mock the Anthropic SDK so the Claude branch is controllable without network.
const anthropicStreamMock = vi.fn()
vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    messages = {
      stream: (...args: unknown[]) => anthropicStreamMock(...args),
    }
  }
  return { default: Anthropic }
})

// Mock OpenAI constructor so we can confirm the "openai" branch flows through.
vi.mock('openai', () => {
  class OpenAI {
    constructor(_: unknown) {}
  }
  return { default: OpenAI }
})

import { authenticateRequest, isAuthError } from '@/lib/finance/auth'

// Utility: drain a ReadableStream<Uint8Array> to a single string.
async function drain(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    if (value) chunks.push(value)
  }
  const total = chunks.reduce((n, c) => n + c.length, 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const c of chunks) {
    out.set(c, off)
    off += c.length
  }
  return new TextDecoder().decode(out)
}

function makeReq(body: unknown, headers: Record<string, string> = { Authorization: 'Bearer test-token' }): NextRequest {
  return new NextRequest('http://localhost/api/chat', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

// Preserve and restore env keys that control which provider branch triggers
// the "not configured" error.
const originalOpenAIKey = process.env.OPENAI_API_KEY
const originalAnthropicKey = process.env.ANTHROPIC_API_KEY

beforeEach(() => {
  vi.clearAllMocks()
  process.env.OPENAI_API_KEY = 'test-openai-key'
  process.env.ANTHROPIC_API_KEY = 'test-anthropic-key'
  ;(authenticateRequest as ReturnType<typeof vi.fn>).mockResolvedValue({ userId: 'user-1' })
  ;(isAuthError as ReturnType<typeof vi.fn>).mockImplementation((r: unknown) => {
    // mimic real isAuthError: only return true for NextResponse-like objects
    return typeof r === 'object' && r !== null && 'status' in r && typeof (r as { json?: unknown }).json === 'function'
  })
})

afterEach(() => {
  process.env.OPENAI_API_KEY = originalOpenAIKey
  process.env.ANTHROPIC_API_KEY = originalAnthropicKey
})

describe('POST /api/chat — auth + validation', () => {
  it('returns auth error (401) when authenticateRequest yields NextResponse', async () => {
    const { NextResponse } = await import('next/server')
    const authResponse = NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    ;(authenticateRequest as ReturnType<typeof vi.fn>).mockResolvedValueOnce(authResponse)
    ;(isAuthError as ReturnType<typeof vi.fn>).mockReturnValueOnce(true)

    const { POST } = await import('@/app/api/chat/route')
    const res = await POST(makeReq({ messages: [{ role: 'user', content: 'hi' }] }))
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('returns 400 for invalid JSON body', async () => {
    const { POST } = await import('@/app/api/chat/route')
    const req = new NextRequest('http://localhost/api/chat', {
      method: 'POST',
      body: 'not-json',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid JSON body' })
  })

  it('returns 400 when no user message provided', async () => {
    const { POST } = await import('@/app/api/chat/route')
    const res = await POST(makeReq({ messages: [] }))
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'At least one user message required' })
  })

  it('returns 500 when OPENAI_API_KEY missing and provider=openai', async () => {
    delete process.env.OPENAI_API_KEY
    const { POST } = await import('@/app/api/chat/route')
    const res = await POST(makeReq({
      messages: [{ role: 'user', content: 'hi' }],
      provider: 'openai',
    }))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toMatch(/OPENAI_API_KEY/)
  })

  it('returns 500 when ANTHROPIC_API_KEY missing and provider defaults to claude', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const { POST } = await import('@/app/api/chat/route')
    const res = await POST(makeReq({
      messages: [{ role: 'user', content: 'hi' }],
    }))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toMatch(/ANTHROPIC_API_KEY/)
  })
})

describe('POST /api/chat — SSE streaming', () => {
  it('returns SSE response and invokes OpenAI loop (openai provider)', async () => {
    runOpenAIChatLoopMock.mockImplementation(async (_openai, _inbound, _userId, send) => {
      send('text_delta', { text: 'hello' })
      send('done', { stop_reason: 'end' })
    })

    const { POST } = await import('@/app/api/chat/route')
    const res = await POST(makeReq({
      messages: [{ role: 'user', content: 'hi' }],
      provider: 'openai',
    }))

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('text/event-stream; charset=utf-8')
    expect(res.headers.get('Cache-Control')).toContain('no-cache')

    const body = await drain(res.body as ReadableStream<Uint8Array>)
    expect(body).toContain('event: text_delta')
    expect(body).toContain('hello')
    expect(body).toContain('event: done')
    expect(runOpenAIChatLoopMock).toHaveBeenCalledTimes(1)
  })

  it('emits error event when OpenAI loop throws', async () => {
    runOpenAIChatLoopMock.mockImplementation(async () => {
      throw new Error('upstream failed')
    })

    const { POST } = await import('@/app/api/chat/route')
    const res = await POST(makeReq({
      messages: [{ role: 'user', content: 'hi' }],
      provider: 'openai',
    }))

    expect(res.status).toBe(200)
    const body = await drain(res.body as ReadableStream<Uint8Array>)
    expect(body).toContain('event: error')
    expect(body).toContain('upstream failed')
  })

  it('streams Claude text deltas and completes normally', async () => {
    // Build a fake async iterable + finalMessage — matching what the route consumes.
    async function* events() {
      yield {
        type: 'content_block_delta',
        delta: { type: 'text_delta', text: 'hi there' },
      }
    }
    const streamObj = {
      [Symbol.asyncIterator]: () => events(),
      finalMessage: async () => ({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'hi there' }],
      }),
    }
    anthropicStreamMock.mockReturnValue(streamObj)

    const { POST } = await import('@/app/api/chat/route')
    const res = await POST(makeReq({
      messages: [{ role: 'user', content: 'hello' }],
      provider: 'claude',
    }))

    expect(res.status).toBe(200)
    const body = await drain(res.body as ReadableStream<Uint8Array>)
    expect(body).toContain('event: text_delta')
    expect(body).toContain('hi there')
    expect(body).toContain('event: done')
  })

  it('executes tool_use loop: emits tool_use_start + tool_use_done then terminates', async () => {
    // 1st stream: model asks for tool, 2nd stream: final text answer.
    let callCount = 0
    anthropicStreamMock.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        async function* events() {
          yield {
            type: 'content_block_start',
            content_block: { type: 'tool_use', id: 't-1', name: 'list_habits' },
          }
        }
        return {
          [Symbol.asyncIterator]: () => events(),
          finalMessage: async () => ({
            stop_reason: 'tool_use',
            content: [{ type: 'tool_use', id: 't-1', name: 'list_habits', input: { limit: 5 } }],
          }),
        }
      }
      async function* events2() {
        yield {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'ok done' },
        }
      }
      return {
        [Symbol.asyncIterator]: () => events2(),
        finalMessage: async () => ({
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: 'ok done' }],
        }),
      }
    })

    executeToolMock.mockResolvedValue({ summary: 'listed habits', data: [] })

    const { POST } = await import('@/app/api/chat/route')
    const res = await POST(makeReq({
      messages: [{ role: 'user', content: 'list my habits' }],
      provider: 'claude',
    }))
    expect(res.status).toBe(200)
    const body = await drain(res.body as ReadableStream<Uint8Array>)
    expect(body).toContain('event: tool_use_start')
    expect(body).toContain('list_habits')
    expect(body).toContain('event: tool_use_done')
    expect(body).toContain('listed habits')
    expect(body).toContain('event: done')
    expect(executeToolMock).toHaveBeenCalledWith('list_habits', { limit: 5 }, { userId: 'user-1' })
  })

  it('handles tool errors (tool_use_done with error: true)', async () => {
    let callCount = 0
    anthropicStreamMock.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        async function* events() {
          yield {
            type: 'content_block_start',
            content_block: { type: 'tool_use', id: 't-2', name: 'bad_tool' },
          }
        }
        return {
          [Symbol.asyncIterator]: () => events(),
          finalMessage: async () => ({
            stop_reason: 'tool_use',
            content: [{ type: 'tool_use', id: 't-2', name: 'bad_tool', input: {} }],
          }),
        }
      }
      async function* events2() { /* no yields */ }
      return {
        [Symbol.asyncIterator]: () => events2(),
        finalMessage: async () => ({ stop_reason: 'end_turn', content: [] }),
      }
    })

    executeToolMock.mockRejectedValue(new Error('tool exploded'))

    const { POST } = await import('@/app/api/chat/route')
    const res = await POST(makeReq({
      messages: [{ role: 'user', content: 'do it' }],
      provider: 'claude',
    }))
    const body = await drain(res.body as ReadableStream<Uint8Array>)
    expect(body).toContain('event: tool_use_done')
    expect(body).toContain('tool exploded')
    expect(body).toContain('"error":true')
  })

  it('emits error event when Anthropic SDK throws', async () => {
    anthropicStreamMock.mockImplementation(() => {
      throw new Error('anthropic boom')
    })

    const { POST } = await import('@/app/api/chat/route')
    const res = await POST(makeReq({
      messages: [{ role: 'user', content: 'hi' }],
      provider: 'claude',
    }))
    expect(res.status).toBe(200)
    const body = await drain(res.body as ReadableStream<Uint8Array>)
    expect(body).toContain('event: error')
    expect(body).toContain('anthropic boom')
  })
})
