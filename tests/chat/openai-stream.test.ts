import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ── Mock `@/lib/chat/tools` — we only care about CHAT_TOOLS shape + executeTool ───
const mocks = vi.hoisted(() => ({
  executeTool: vi.fn(),
  CHAT_TOOLS: [
    {
      name: 'add_transaction',
      description: 'desc',
      input_schema: { type: 'object', properties: { amount: { type: 'number' } } },
    },
    {
      name: 'list_tasks',
      description: 'list tasks',
      input_schema: { type: 'object', properties: {} },
    },
  ],
}))

vi.mock('@/lib/chat/tools', () => ({
  CHAT_TOOLS: mocks.CHAT_TOOLS,
  executeTool: mocks.executeTool,
}))

import { runOpenAIChatLoop, OPENAI_CHAT_MODEL } from '@/lib/chat/openai-stream'

// ── Helpers ────────────────────────────────────────────────
type Chunk = {
  choices: Array<{
    delta: any
    finish_reason?: string | null
  }>
}

function makeStream(chunks: Chunk[] | (() => AsyncIterable<Chunk>)) {
  if (typeof chunks === 'function') return chunks()
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const c of chunks) yield c
    },
  }
}

type Event = { event: string; data: unknown }

function makeCapturingSend() {
  const events: Event[] = []
  const send = (event: string, data: unknown) => {
    events.push({ event, data })
  }
  return { events, send }
}

function makeOpenAI(streams: any[]) {
  const create = vi.fn(async () => {
    const s = streams.shift()
    if (s instanceof Error) throw s
    return s
  })
  return {
    openai: { chat: { completions: { create } } } as any,
    create,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('OPENAI_CHAT_MODEL', () => {
  it('is a string', () => {
    expect(typeof OPENAI_CHAT_MODEL).toBe('string')
  })
})

describe('runOpenAIChatLoop — content-only stream', () => {
  it('emits text_delta frames then done', async () => {
    const stream = makeStream([
      { choices: [{ delta: { content: 'hel' } }] },
      { choices: [{ delta: { content: 'lo' } }] },
      { choices: [{ delta: {}, finish_reason: 'stop' }] },
    ])
    const { openai, create } = makeOpenAI([stream])
    const { events, send } = makeCapturingSend()

    await runOpenAIChatLoop(openai, [{ role: 'user', content: 'hi' }], 'u1', send)

    expect(create).toHaveBeenCalledTimes(1)
    const firstCall = create.mock.calls[0][0] as any
    expect(firstCall.stream).toBe(true)
    expect(firstCall.messages[0]).toEqual({ role: 'system', content: expect.any(String) })
    expect(firstCall.messages[1]).toEqual({ role: 'user', content: 'hi' })
    expect(Array.isArray(firstCall.tools)).toBe(true)
    expect(firstCall.tools[0].type).toBe('function')
    expect(firstCall.tools[0].function.name).toBe('add_transaction')

    const textEvents = events.filter((e) => e.event === 'text_delta')
    expect(textEvents).toHaveLength(2)
    expect(textEvents[0].data).toEqual({ text: 'hel' })
    expect(textEvents[1].data).toEqual({ text: 'lo' })

    const done = events.find((e) => e.event === 'done')
    expect(done).toBeDefined()
    expect(done!.data).toEqual({ stop_reason: 'stop' })
  })

  it('skips chunks without a choice', async () => {
    const stream = makeStream([
      { choices: [] },
      { choices: [{ delta: { content: 'x' } }] },
      { choices: [{ delta: {}, finish_reason: 'stop' }] },
    ])
    const { openai } = makeOpenAI([stream])
    const { events, send } = makeCapturingSend()

    await runOpenAIChatLoop(openai, [{ role: 'user', content: 'hi' }], 'u1', send)
    const texts = events.filter((e) => e.event === 'text_delta')
    expect(texts).toHaveLength(1)
  })
})

describe('runOpenAIChatLoop — tool call bridging', () => {
  it('dispatches a tool call, emits tool_use_start/done, resumes', async () => {
    // Stream 1: tool call deltas + finish_reason=tool_calls
    const stream1 = makeStream([
      {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call-1',
                  function: { name: 'add_transaction', arguments: '{"amo' },
                },
              ],
            },
          },
        ],
      },
      {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  function: { arguments: 'unt":42}' },
                },
              ],
            },
          },
        ],
      },
      { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
    ])

    // Stream 2: normal completion after tool bridge
    const stream2 = makeStream([
      { choices: [{ delta: { content: 'done!' } }] },
      { choices: [{ delta: {}, finish_reason: 'stop' }] },
    ])

    const { openai, create } = makeOpenAI([stream1, stream2])
    mocks.executeTool.mockResolvedValue({ summary: 'Added ₹42', data: { id: 'tx' } })

    const { events, send } = makeCapturingSend()
    await runOpenAIChatLoop(openai, [{ role: 'user', content: 'spent 42' }], 'u1', send)

    expect(create).toHaveBeenCalledTimes(2)

    // tool_use_start emitted once for the tool call
    const starts = events.filter((e) => e.event === 'tool_use_start')
    expect(starts).toHaveLength(1)
    expect(starts[0].data).toEqual({ id: 'call-1', name: 'add_transaction' })

    // executeTool called with parsed args
    expect(mocks.executeTool).toHaveBeenCalledWith(
      'add_transaction',
      { amount: 42 },
      { userId: 'u1' }
    )

    const dones = events.filter((e) => e.event === 'tool_use_done')
    expect(dones).toHaveLength(1)
    expect(dones[0].data).toMatchObject({ id: 'call-1', name: 'add_transaction', summary: 'Added ₹42' })

    // Final done
    const done = events.find((e) => e.event === 'done')
    expect(done!.data).toEqual({ stop_reason: 'stop' })

    // Second call should include tool role messages
    const secondMessages = (create.mock.calls[1][0] as any).messages
    const toolMsg = secondMessages.find((m: any) => m.role === 'tool')
    expect(toolMsg).toBeDefined()
    expect(toolMsg.tool_call_id).toBe('call-1')
    const assistantWithToolCalls = secondMessages.find((m: any) => m.role === 'assistant' && m.tool_calls)
    expect(assistantWithToolCalls).toBeDefined()
    expect(assistantWithToolCalls.tool_calls[0].id).toBe('call-1')
  })

  it('emits tool_use_done with error flag when executeTool throws', async () => {
    const stream1 = makeStream([
      {
        choices: [
          {
            delta: {
              tool_calls: [
                { index: 0, id: 'call-err', function: { name: 'list_tasks', arguments: '{}' } },
              ],
            },
          },
        ],
      },
      { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
    ])
    const stream2 = makeStream([{ choices: [{ delta: {}, finish_reason: 'stop' }] }])

    const { openai } = makeOpenAI([stream1, stream2])
    mocks.executeTool.mockRejectedValueOnce(new Error('kaboom'))

    const { events, send } = makeCapturingSend()
    await runOpenAIChatLoop(openai, [{ role: 'user', content: 'x' }], 'u1', send)

    const dones = events.filter((e) => e.event === 'tool_use_done')
    expect(dones).toHaveLength(1)
    expect(dones[0].data).toMatchObject({
      name: 'list_tasks',
      error: true,
      summary: expect.stringContaining('Failed: kaboom'),
    })
  })

  it('handles non-Error rejections from executeTool', async () => {
    const stream1 = makeStream([
      {
        choices: [
          {
            delta: {
              tool_calls: [
                { index: 0, id: 'call-err2', function: { name: 'list_tasks', arguments: '{}' } },
              ],
            },
          },
        ],
      },
      { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
    ])
    const stream2 = makeStream([{ choices: [{ delta: {}, finish_reason: 'stop' }] }])

    const { openai } = makeOpenAI([stream1, stream2])
    mocks.executeTool.mockRejectedValueOnce('string error')

    const { events, send } = makeCapturingSend()
    await runOpenAIChatLoop(openai, [{ role: 'user', content: 'x' }], 'u1', send)

    const dones = events.filter((e) => e.event === 'tool_use_done')
    expect(dones[0].data).toMatchObject({ summary: 'Failed: Tool failed', error: true })
  })

  it('handles malformed tool arguments JSON (parse error -> _parse_error flag)', async () => {
    const stream1 = makeStream([
      {
        choices: [
          {
            delta: {
              tool_calls: [
                { index: 0, id: 'call-bad', function: { name: 'add_transaction', arguments: '{bad json' } },
              ],
            },
          },
        ],
      },
      { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
    ])
    const stream2 = makeStream([{ choices: [{ delta: {}, finish_reason: 'stop' }] }])

    const { openai } = makeOpenAI([stream1, stream2])
    mocks.executeTool.mockResolvedValue({ summary: 'ok' })

    const { send } = makeCapturingSend()
    await runOpenAIChatLoop(openai, [{ role: 'user', content: 'x' }], 'u1', send)

    expect(mocks.executeTool).toHaveBeenCalledWith(
      'add_transaction',
      { _parse_error: true },
      { userId: 'u1' }
    )
  })

  it('finishes when tool_calls finish_reason arrives with no tool parts', async () => {
    const stream1 = makeStream([
      { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
    ])
    const { openai } = makeOpenAI([stream1])
    const { events, send } = makeCapturingSend()
    await runOpenAIChatLoop(openai, [{ role: 'user', content: 'x' }], 'u1', send)

    const done = events.find((e) => e.event === 'done')
    expect(done!.data).toEqual({ stop_reason: 'tool_calls' })
  })

  it('filters out tool calls with empty names', async () => {
    const stream1 = makeStream([
      {
        choices: [
          {
            delta: {
              tool_calls: [
                { index: 0, id: 'call-no-name', function: { arguments: '{}' } },
              ],
            },
          },
        ],
      },
      { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
    ])
    const { openai } = makeOpenAI([stream1])
    const { events, send } = makeCapturingSend()
    await runOpenAIChatLoop(openai, [{ role: 'user', content: 'x' }], 'u1', send)

    // No tool was dispatched, so loop stops on done
    const done = events.find((e) => e.event === 'done')
    expect(done).toBeDefined()
    expect(mocks.executeTool).not.toHaveBeenCalled()
  })

  it('handles missing tool-call index (defaults to 0)', async () => {
    const stream1 = makeStream([
      {
        choices: [
          {
            delta: {
              tool_calls: [
                { id: 'call-noidx', function: { name: 'list_tasks', arguments: '{}' } },
              ],
            },
          },
        ],
      },
      { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
    ])
    const stream2 = makeStream([{ choices: [{ delta: {}, finish_reason: 'stop' }] }])

    const { openai } = makeOpenAI([stream1, stream2])
    mocks.executeTool.mockResolvedValue({ summary: 'done' })

    const { send } = makeCapturingSend()
    await runOpenAIChatLoop(openai, [{ role: 'user', content: 'x' }], 'u1', send)
    expect(mocks.executeTool).toHaveBeenCalledTimes(1)
  })
})

describe('runOpenAIChatLoop — max iterations', () => {
  it('stops after MAX_ITERATIONS when tool calls keep coming', async () => {
    const buildLoopingStream = () =>
      makeStream([
        {
          choices: [
            {
              delta: {
                tool_calls: [
                  { index: 0, id: 'call-loop', function: { name: 'list_tasks', arguments: '{}' } },
                ],
              },
            },
          ],
        },
        { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
      ])

    // 6 iterations worth of streams
    const streams = Array.from({ length: 6 }, () => buildLoopingStream())
    const { openai, create } = makeOpenAI(streams)
    mocks.executeTool.mockResolvedValue({ summary: 'ok' })

    const { events, send } = makeCapturingSend()
    await runOpenAIChatLoop(openai, [{ role: 'user', content: 'loop' }], 'u1', send)

    expect(create).toHaveBeenCalledTimes(6)
    const done = events.find((e) => e.event === 'done')
    expect(done!.data).toEqual({ stop_reason: 'max_iterations' })
  })
})

describe('runOpenAIChatLoop — upstream error propagation', () => {
  it('throws when OpenAI create() rejects', async () => {
    const { openai } = makeOpenAI([new Error('upstream down')])
    const { send } = makeCapturingSend()
    await expect(
      runOpenAIChatLoop(openai, [{ role: 'user', content: 'x' }], 'u1', send)
    ).rejects.toThrow('upstream down')
  })

  it('propagates iterator errors mid-stream', async () => {
    const errorStream = {
      [Symbol.asyncIterator]: async function* () {
        yield { choices: [{ delta: { content: 'partial' } }] }
        throw new Error('stream broke')
      },
    }
    const { openai } = makeOpenAI([errorStream])
    const { events, send } = makeCapturingSend()
    await expect(
      runOpenAIChatLoop(openai, [{ role: 'user', content: 'x' }], 'u1', send)
    ).rejects.toThrow('stream broke')

    // Partial text got through
    const texts = events.filter((e) => e.event === 'text_delta')
    expect(texts).toHaveLength(1)
  })
})
