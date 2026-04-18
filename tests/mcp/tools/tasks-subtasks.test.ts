import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type QueryResult = {
  data?: any
  error?: { message: string } | null
  count?: number | null
}

type QueryChain = Record<string, ReturnType<typeof vi.fn>> & {
  then: (resolve: (value: QueryResult) => unknown, reject?: (reason: unknown) => unknown) => Promise<unknown>
}

const mocks = vi.hoisted(() => ({
  queues: new Map<string, any[]>(),
  mockClient: { from: vi.fn() },
  registeredTools: {} as Record<string, { handler: (...args: unknown[]) => unknown }>,
  getRules: vi.fn(),
  searchMemories: vi.fn(),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => mocks.mockClient),
}))

vi.mock('@/lib/memory/items', () => ({
  getRules: mocks.getRules,
  searchMemories: mocks.searchMemories,
}))

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: class {
    tool(name: string, _desc: string, _schema: unknown, handler: (...args: unknown[]) => unknown) {
      mocks.registeredTools[name] = { handler }
    }
  },
}))

import { registerTaskTools } from '@/lib/mcp/tools/tasks'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

const server = new McpServer({ name: 'test', version: '0.0.0' })
registerTaskTools(server)

const authInfo = { extra: { userId: 'user-1' } }
const noAuth = { extra: {} }
const methods = ['select', 'insert', 'update', 'delete', 'eq', 'neq', 'gte', 'lte', 'is', 'in', 'order', 'limit', 'range', 'single', 'maybeSingle']

function createQuery(result: QueryResult = { data: null, error: null }): QueryChain {
  const chain = {} as QueryChain
  for (const method of methods) chain[method] = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn().mockResolvedValue(result)
  chain.maybeSingle = vi.fn().mockResolvedValue(result)
  chain.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject)
  return chain
}

function queue(table: string, ...chains: QueryChain[]) {
  mocks.queues.set(table, [...(mocks.queues.get(table) ?? []), ...chains])
}

function setupFromQueues() {
  mocks.mockClient.from.mockImplementation((table: string) => {
    const chains = mocks.queues.get(table) ?? []
    if (chains.length > 0) return chains.shift()
    return createQuery({ data: null, error: null })
  })
}

function parseToolResult(result: { content: Array<{ text: string }> }) {
  return JSON.parse(result.content[0].text)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-04-18T06:30:00.000Z'))
  mocks.queues = new Map()
  setupFromQueues()
})

afterEach(() => {
  vi.useRealTimers()
})

// ── create_task with parent_task_id (subtask creation) ─────────────────────

describe('create_task — parent_task_id path', () => {
  it('inherits task_type + project from parent and auto-positions at end', async () => {
    const parentFetch = createQuery({
      data: { id: 'p-1', task_type: 'project', project: 'sathi', parent_task_id: null, user_id: 'user-1' },
      error: null,
    })
    const maxPosRow = createQuery({
      data: { position: 2 },
      error: null,
    })
    const insertChain = createQuery({
      data: {
        id: 'sub-1', title: 'A subtask', status: 'pending', priority: 'medium', due_date: null,
        task_type: 'project', project: 'sathi', parent_task_id: 'p-1', position: 3,
        created_at: '2026-04-18T06:30:00.000Z',
      },
      error: null,
    })
    queue('tasks', parentFetch, maxPosRow, insertChain)

    const result = await mocks.registeredTools['create_task'].handler(
      { title: 'A subtask', priority: 'medium', tags: [], task_type: 'personal', parent_task_id: 'p-1' },
      { authInfo }
    )

    expect(insertChain.insert).toHaveBeenCalledWith(expect.objectContaining({
      task_type: 'project',
      project: 'sathi',
      parent_task_id: 'p-1',
      position: 3,
    }))
    const parsed = parseToolResult(result)
    expect(parsed.task_type).toBe('project')
    expect(parsed.project).toBe('sathi')
    expect(parsed.parent_task_id).toBe('p-1')
    expect(parsed.position).toBe(3)
  })

  it('auto-positions to 0 when parent has no existing subtasks', async () => {
    const parentFetch = createQuery({
      data: { id: 'p-2', task_type: 'personal', project: null, parent_task_id: null },
      error: null,
    })
    const maxPosRow = createQuery({ data: null, error: null })
    const insertChain = createQuery({
      data: {
        id: 'sub-2', title: 'First', status: 'pending', priority: 'medium', due_date: null,
        task_type: 'personal', project: null, parent_task_id: 'p-2', position: 0,
        created_at: '2026-04-18T06:30:00.000Z',
      },
      error: null,
    })
    queue('tasks', parentFetch, maxPosRow, insertChain)

    await mocks.registeredTools['create_task'].handler(
      { title: 'First', priority: 'medium', tags: [], parent_task_id: 'p-2' },
      { authInfo }
    )

    expect(insertChain.insert).toHaveBeenCalledWith(expect.objectContaining({
      parent_task_id: 'p-2',
      position: 0,
      task_type: 'personal',
      project: null,
    }))
  })

  it('errors if parent_task_id does not resolve', async () => {
    queue('tasks', createQuery({ data: null, error: { message: 'no row' } }))

    const result = await mocks.registeredTools['create_task'].handler(
      { title: 'X', priority: 'medium', tags: [], parent_task_id: 'ghost' },
      { authInfo }
    )

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: Parent task not found')
  })

  it('rejects attempt to nest subtask under another subtask', async () => {
    const parentFetch = createQuery({
      data: { id: 's-deep', task_type: 'personal', project: null, parent_task_id: 'p-top' },
      error: null,
    })
    queue('tasks', parentFetch)

    const result = await mocks.registeredTools['create_task'].handler(
      { title: 'X', priority: 'medium', tags: [], parent_task_id: 's-deep' },
      { authInfo }
    )

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: Cannot nest subtasks (1-level only)')
  })
})

// ── add_subtask ──────────────────────────────────────────────────────────

describe('add_subtask', () => {
  it('throws when unauthorized', async () => {
    await expect(mocks.registeredTools['add_subtask'].handler(
      { parent_task_id: '00000000-0000-0000-0000-000000000001', title: 'x', priority: 'medium', tags: [] },
      { authInfo: noAuth }
    )).rejects.toThrow('Unauthorized')
  })

  it('inherits task_type/project from parent and auto-positions at end', async () => {
    const parentFetch = createQuery({
      data: { id: 'p-1', task_type: 'project', project: 'sathi', parent_task_id: null },
      error: null,
    })
    const maxPosRow = createQuery({ data: { position: 1 }, error: null })
    const insertChain = createQuery({
      data: {
        id: 'sub-x', title: 'New sub', status: 'pending', priority: 'high', due_date: null,
        task_type: 'project', project: 'sathi', parent_task_id: 'p-1', position: 2,
        created_at: '2026-04-18T06:30:00.000Z',
      },
      error: null,
    })
    queue('tasks', parentFetch, maxPosRow, insertChain)

    const result = await mocks.registeredTools['add_subtask'].handler(
      { parent_task_id: 'p-1', title: '  New sub  ', description: '  details  ', priority: 'high', tags: [] },
      { authInfo }
    )

    expect(insertChain.insert).toHaveBeenCalledWith(expect.objectContaining({
      title: 'New sub',
      description: 'details',
      task_type: 'project',
      project: 'sathi',
      parent_task_id: 'p-1',
      position: 2,
    }))
    const parsed = parseToolResult(result)
    expect(parsed.subtask_id).toBe('sub-x')
    expect(parsed.parent_task_id).toBe('p-1')
    expect(parsed.task_type).toBe('project')
    expect(parsed.project).toBe('sathi')
    expect(parsed.position).toBe(2)
  })

  it('uses explicit position when provided', async () => {
    const parentFetch = createQuery({
      data: { id: 'p-1', task_type: 'personal', project: null, parent_task_id: null },
      error: null,
    })
    const insertChain = createQuery({
      data: {
        id: 'sub-e', title: 't', status: 'pending', priority: 'medium', due_date: null,
        task_type: 'personal', project: null, parent_task_id: 'p-1', position: 5,
        created_at: '2026-04-18T06:30:00.000Z',
      },
      error: null,
    })
    queue('tasks', parentFetch, insertChain)

    await mocks.registeredTools['add_subtask'].handler(
      { parent_task_id: 'p-1', title: 't', priority: 'medium', tags: [], position: 5 },
      { authInfo }
    )

    expect(insertChain.insert).toHaveBeenCalledWith(expect.objectContaining({ position: 5 }))
  })

  it('rejects when parent row is itself a subtask', async () => {
    queue('tasks', createQuery({
      data: { id: 's-deep', task_type: 'personal', project: null, parent_task_id: 'p-top' },
      error: null,
    }))

    const result = await mocks.registeredTools['add_subtask'].handler(
      { parent_task_id: 's-deep', title: 'x', priority: 'medium', tags: [] },
      { authInfo }
    )

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: Cannot nest subtasks (1-level only)')
  })

  it('returns error when parent not found', async () => {
    queue('tasks', createQuery({ data: null, error: { message: 'no' } }))

    const result = await mocks.registeredTools['add_subtask'].handler(
      { parent_task_id: 'missing', title: 'x', priority: 'medium', tags: [] },
      { authInfo }
    )

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: Parent task not found')
  })

  it('surfaces DB insert error', async () => {
    queue(
      'tasks',
      createQuery({ data: { id: 'p-1', task_type: 'personal', project: null, parent_task_id: null }, error: null }),
      createQuery({ data: { position: 0 }, error: null }),
      createQuery({ data: null, error: { message: 'insert failed' } }),
    )

    const result = await mocks.registeredTools['add_subtask'].handler(
      { parent_task_id: 'p-1', title: 'x', priority: 'medium', tags: [] },
      { authInfo }
    )

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: insert failed')
  })
})

// ── list_subtasks ────────────────────────────────────────────────────────

describe('list_subtasks', () => {
  it('throws when unauthorized', async () => {
    await expect(mocks.registeredTools['list_subtasks'].handler(
      { parent_task_id: 'p-1' },
      { authInfo: noAuth }
    )).rejects.toThrow('Unauthorized')
  })

  it('returns subtasks and progress aggregate', async () => {
    const rows = [
      { id: 's-1', title: 'One', description: null, status: 'completed', priority: 'low', due_date: null, tags: [], position: 0, created_at: '2026-04-18T06:30:00.000Z', completed_at: '2026-04-18T06:31:00.000Z' },
      { id: 's-2', title: 'Two', description: null, status: 'pending', priority: 'medium', due_date: null, tags: [], position: 1, created_at: '2026-04-18T06:30:00.000Z', completed_at: null },
    ]
    queue('tasks', createQuery({ data: rows, error: null }))

    const result = await mocks.registeredTools['list_subtasks'].handler(
      { parent_task_id: 'p-1' },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(parsed.parent_task_id).toBe('p-1')
    expect(parsed.subtasks).toHaveLength(2)
    expect(parsed.subtasks[0].subtask_id).toBe('s-1')
    expect(parsed.subtasks[0].completed_at).not.toBeNull()
    expect(parsed.progress).toEqual({ completed: 1, total: 2, pct: 50 })
  })

  it('returns zero progress for empty subtask list', async () => {
    queue('tasks', createQuery({ data: [], error: null }))

    const result = await mocks.registeredTools['list_subtasks'].handler(
      { parent_task_id: 'p-1' },
      { authInfo }
    )
    const parsed = parseToolResult(result)
    expect(parsed.progress).toEqual({ completed: 0, total: 0, pct: 0 })
  })

  it('returns DB error', async () => {
    queue('tasks', createQuery({ data: null, error: { message: 'boom' } }))

    const result = await mocks.registeredTools['list_subtasks'].handler(
      { parent_task_id: 'p-1' },
      { authInfo }
    )
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: boom')
  })
})

// ── get_subtask ──────────────────────────────────────────────────────────

describe('get_subtask', () => {
  it('throws when unauthorized', async () => {
    await expect(mocks.registeredTools['get_subtask'].handler(
      { subtask_id: 's-1' },
      { authInfo: noAuth }
    )).rejects.toThrow('Unauthorized')
  })

  it('returns subtask payload when row has parent_task_id', async () => {
    queue('tasks', createQuery({
      data: {
        id: 's-1', title: 'sub', description: 'd', status: 'pending', priority: 'medium',
        due_date: null, tags: [], task_type: 'project', project: 'sathi',
        parent_task_id: 'p-1', position: 0,
        created_at: '2026-04-18T06:30:00.000Z', updated_at: '2026-04-18T06:30:00.000Z', completed_at: null,
      },
      error: null,
    }))

    const result = await mocks.registeredTools['get_subtask'].handler(
      { subtask_id: 's-1' },
      { authInfo }
    )
    const parsed = parseToolResult(result)
    expect(parsed.subtask_id).toBe('s-1')
    expect(parsed.parent_task_id).toBe('p-1')
    expect(parsed.task_type).toBe('project')
    expect(parsed.project).toBe('sathi')
    expect(parsed.completed_at).toBeNull()
  })

  it('returns completed_at in IST when present', async () => {
    queue('tasks', createQuery({
      data: {
        id: 's-1', title: 'sub', description: null, status: 'completed', priority: 'low',
        due_date: null, tags: [], task_type: 'personal', project: null,
        parent_task_id: 'p-1', position: 0,
        created_at: '2026-04-18T06:30:00.000Z', updated_at: '2026-04-18T06:30:00.000Z',
        completed_at: '2026-04-18T06:40:00.000Z',
      },
      error: null,
    }))

    const result = await mocks.registeredTools['get_subtask'].handler(
      { subtask_id: 's-1' },
      { authInfo }
    )
    const parsed = parseToolResult(result)
    expect(parsed.completed_at).not.toBeNull()
  })

  it('errors when row is top-level', async () => {
    queue('tasks', createQuery({
      data: {
        id: 't-1', title: 'top', description: null, status: 'pending', priority: 'medium',
        due_date: null, tags: [], task_type: 'personal', project: null,
        parent_task_id: null, position: null,
        created_at: '2026-04-18T06:30:00.000Z', updated_at: '2026-04-18T06:30:00.000Z', completed_at: null,
      },
      error: null,
    }))

    const result = await mocks.registeredTools['get_subtask'].handler(
      { subtask_id: 't-1' },
      { authInfo }
    )
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: Row is a top-level task, not a subtask — use get_task instead')
  })

  it('errors when subtask not found', async () => {
    queue('tasks', createQuery({ data: null, error: { message: 'missing' } }))

    const result = await mocks.registeredTools['get_subtask'].handler(
      { subtask_id: 'nope' },
      { authInfo }
    )
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: Subtask not found')
  })
})

// ── update_subtask ───────────────────────────────────────────────────────

describe('update_subtask', () => {
  it('throws when unauthorized', async () => {
    await expect(mocks.registeredTools['update_subtask'].handler(
      { subtask_id: 's-1', title: 'x' },
      { authInfo: noAuth }
    )).rejects.toThrow('Unauthorized')
  })

  it('updates allowed fields (title/desc/due/priority/tags)', async () => {
    const fetchChain = createQuery({ data: { id: 's-1', parent_task_id: 'p-1' }, error: null })
    const updateChain = createQuery({
      data: {
        id: 's-1', title: 'renamed', description: 'd2', status: 'pending', priority: 'high',
        due_date: '2026-04-20', tags: ['a'], task_type: 'project', project: 'sathi',
        parent_task_id: 'p-1', position: 0,
        created_at: '2026-04-18T06:30:00.000Z', updated_at: '2026-04-18T06:30:00.000Z', completed_at: null,
      },
      error: null,
    })
    queue('tasks', fetchChain, updateChain)

    const result = await mocks.registeredTools['update_subtask'].handler(
      { subtask_id: 's-1', title: ' renamed ', description: ' d2 ', due_date: '2026-04-20', priority: 'high', tags: ['a'] },
      { authInfo }
    )

    const callArg = (updateChain.update.mock.calls[0] as [Record<string, unknown>])[0]
    expect(callArg).toMatchObject({
      title: 'renamed',
      description: 'd2',
      due_date: '2026-04-20',
      priority: 'high',
      tags: ['a'],
    })
    const parsed = parseToolResult(result)
    expect(parsed.subtask_id).toBe('s-1')
    expect(parsed.task_type).toBe('project')
  })

  it('clears description when null passed', async () => {
    const fetchChain = createQuery({ data: { id: 's-1', parent_task_id: 'p-1' }, error: null })
    const updateChain = createQuery({
      data: {
        id: 's-1', title: 't', description: null, status: 'pending', priority: 'medium',
        due_date: null, tags: [], task_type: 'personal', project: null,
        parent_task_id: 'p-1', position: 0,
        created_at: '2026-04-18T06:30:00.000Z', updated_at: '2026-04-18T06:30:00.000Z', completed_at: null,
      },
      error: null,
    })
    queue('tasks', fetchChain, updateChain)

    await mocks.registeredTools['update_subtask'].handler(
      { subtask_id: 's-1', description: null },
      { authInfo }
    )

    const callArg = (updateChain.update.mock.calls[0] as [Record<string, unknown>])[0]
    expect(callArg).toHaveProperty('description', null)
  })

  it('errors if called on a top-level row', async () => {
    queue('tasks', createQuery({ data: { id: 't-1', parent_task_id: null }, error: null }))

    const result = await mocks.registeredTools['update_subtask'].handler(
      { subtask_id: 't-1', title: 'x' },
      { authInfo }
    )
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: Row is a top-level task — use update_task instead')
  })

  it('errors when subtask not found', async () => {
    queue('tasks', createQuery({ data: null, error: { message: 'nope' } }))

    const result = await mocks.registeredTools['update_subtask'].handler(
      { subtask_id: 's-1', title: 'x' },
      { authInfo }
    )
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: Subtask not found')
  })

  it('rejects empty patch (only id provided)', async () => {
    queue('tasks', createQuery({ data: { id: 's-1', parent_task_id: 'p-1' }, error: null }))

    const result = await mocks.registeredTools['update_subtask'].handler(
      { subtask_id: 's-1' },
      { authInfo }
    )
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: no fields provided to update')
  })

  it('surfaces DB update error', async () => {
    queue(
      'tasks',
      createQuery({ data: { id: 's-1', parent_task_id: 'p-1' }, error: null }),
      createQuery({ data: null, error: { message: 'boom' } }),
    )

    const result = await mocks.registeredTools['update_subtask'].handler(
      { subtask_id: 's-1', title: 'x' },
      { authInfo }
    )
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: boom')
  })
})

// ── delete_subtask ───────────────────────────────────────────────────────

describe('delete_subtask', () => {
  it('throws when unauthorized', async () => {
    await expect(mocks.registeredTools['delete_subtask'].handler(
      { subtask_id: 's-1' },
      { authInfo: noAuth }
    )).rejects.toThrow('Unauthorized')
  })

  it('deletes a subtask and returns metadata', async () => {
    const fetchChain = createQuery({ data: { id: 's-1', title: 'gone', parent_task_id: 'p-1' }, error: null })
    const delChain = createQuery({ error: null })
    queue('tasks', fetchChain, delChain)

    const result = await mocks.registeredTools['delete_subtask'].handler(
      { subtask_id: 's-1' },
      { authInfo }
    )

    expect(delChain.delete).toHaveBeenCalled()
    const parsed = parseToolResult(result)
    expect(parsed).toEqual({
      deleted: true,
      subtask_id: 's-1',
      parent_task_id: 'p-1',
      title: 'gone',
      message: 'Subtask permanently deleted',
    })
  })

  it('errors when subtask not found', async () => {
    queue('tasks', createQuery({ data: null, error: { message: 'nope' } }))

    const result = await mocks.registeredTools['delete_subtask'].handler(
      { subtask_id: 's-miss' },
      { authInfo }
    )
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: Subtask not found')
  })

  it('errors when row is top-level', async () => {
    queue('tasks', createQuery({ data: { id: 't-1', title: 'top', parent_task_id: null }, error: null }))

    const result = await mocks.registeredTools['delete_subtask'].handler(
      { subtask_id: 't-1' },
      { authInfo }
    )
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: Row is a top-level task — use delete_task instead')
  })

  it('surfaces DB delete error', async () => {
    queue(
      'tasks',
      createQuery({ data: { id: 's-1', title: 'x', parent_task_id: 'p-1' }, error: null }),
      createQuery({ error: { message: 'delete failed' } }),
    )

    const result = await mocks.registeredTools['delete_subtask'].handler(
      { subtask_id: 's-1' },
      { authInfo }
    )
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: delete failed')
  })
})

// ── reorder_subtasks ────────────────────────────────────────────────────

describe('reorder_subtasks', () => {
  const uuid1 = '11111111-1111-1111-1111-111111111111'
  const uuid2 = '22222222-2222-2222-2222-222222222222'
  const uuid3 = '33333333-3333-3333-3333-333333333333'

  it('throws when unauthorized', async () => {
    await expect(mocks.registeredTools['reorder_subtasks'].handler(
      { parent_task_id: 'p-1', ordered_subtask_ids: [uuid1] },
      { authInfo: noAuth }
    )).rejects.toThrow('Unauthorized')
  })

  it('writes position 0..n-1 to each child in order', async () => {
    const existingChain = createQuery({ data: [{ id: uuid1 }, { id: uuid2 }], error: null })
    const upd0 = createQuery({ error: null })
    const upd1 = createQuery({ error: null })
    queue('tasks', existingChain, upd0, upd1)

    const result = await mocks.registeredTools['reorder_subtasks'].handler(
      { parent_task_id: 'p-1', ordered_subtask_ids: [uuid2, uuid1] },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(parsed).toEqual({ parent_task_id: 'p-1', reordered: 2, order: [uuid2, uuid1] })
    expect(upd0.update).toHaveBeenCalledWith(expect.objectContaining({ position: 0 }))
    expect(upd0.eq).toHaveBeenCalledWith('id', uuid2)
    expect(upd1.update).toHaveBeenCalledWith(expect.objectContaining({ position: 1 }))
    expect(upd1.eq).toHaveBeenCalledWith('id', uuid1)
  })

  it('errors when count does not match', async () => {
    queue('tasks', createQuery({ data: [{ id: uuid1 }, { id: uuid2 }], error: null }))

    const result = await mocks.registeredTools['reorder_subtasks'].handler(
      { parent_task_id: 'p-1', ordered_subtask_ids: [uuid1] },
      { authInfo }
    )
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('must include all 2 subtasks')
  })

  it('errors when an id is not a child of the parent', async () => {
    queue('tasks', createQuery({ data: [{ id: uuid1 }, { id: uuid2 }], error: null }))

    const result = await mocks.registeredTools['reorder_subtasks'].handler(
      { parent_task_id: 'p-1', ordered_subtask_ids: [uuid1, uuid3] },
      { authInfo }
    )
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain(`subtask ${uuid3} is not a child`)
  })

  it('returns DB error when existing fetch fails', async () => {
    queue('tasks', createQuery({ data: null, error: { message: 'boom' } }))

    const result = await mocks.registeredTools['reorder_subtasks'].handler(
      { parent_task_id: 'p-1', ordered_subtask_ids: [uuid1] },
      { authInfo }
    )
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: boom')
  })

  it('returns error when a position update fails', async () => {
    queue(
      'tasks',
      createQuery({ data: [{ id: uuid1 }], error: null }),
      createQuery({ error: { message: 'pos fail' } }),
    )

    const result = await mocks.registeredTools['reorder_subtasks'].handler(
      { parent_task_id: 'p-1', ordered_subtask_ids: [uuid1] },
      { authInfo }
    )
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('Error reordering: pos fail')
  })
})

// ── complete_task parent_auto_complete_hint ─────────────────────────────

describe('complete_task — parent_auto_complete_hint', () => {
  it('emits hint when last sibling completes and parent is still open', async () => {
    // 1) fetch task (subtask)
    queue('tasks', createQuery({
      data: {
        id: 's-last', title: 'Last sub', status: 'pending',
        created_at: '2026-04-16T06:30:00.000Z', due_date: null,
        parent_task_id: 'p-1',
      },
      error: null,
    }))
    // 2) update the task
    queue('tasks', createQuery({ error: null }))
    // 3) computeSubtaskProgress — select status for siblings
    queue('tasks', createQuery({
      data: [{ status: 'completed' }, { status: 'completed' }],
      error: null,
    }))
    // 4) fetch parent row for status
    queue('tasks', createQuery({
      data: { id: 'p-1', status: 'in_progress' },
      error: null,
    }))

    const result = await mocks.registeredTools['complete_task'].handler(
      { task_id: 's-last' },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(parsed.parent_auto_complete_hint).toEqual({
      parent_task_id: 'p-1',
      all_subtasks_complete: true,
    })
  })

  it('does not emit hint when parent is already completed', async () => {
    queue('tasks', createQuery({
      data: {
        id: 's-last', title: 'Last sub', status: 'pending',
        created_at: '2026-04-16T06:30:00.000Z', due_date: null,
        parent_task_id: 'p-1',
      },
      error: null,
    }))
    queue('tasks', createQuery({ error: null }))
    queue('tasks', createQuery({
      data: [{ status: 'completed' }],
      error: null,
    }))
    queue('tasks', createQuery({
      data: { id: 'p-1', status: 'completed' },
      error: null,
    }))

    const result = await mocks.registeredTools['complete_task'].handler(
      { task_id: 's-last' },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(parsed.parent_auto_complete_hint).toBeNull()
  })

  it('hint is null when not all siblings complete', async () => {
    queue('tasks', createQuery({
      data: {
        id: 's-mid', title: 'mid', status: 'pending',
        created_at: '2026-04-16T06:30:00.000Z', due_date: null,
        parent_task_id: 'p-1',
      },
      error: null,
    }))
    queue('tasks', createQuery({ error: null }))
    queue('tasks', createQuery({
      data: [{ status: 'completed' }, { status: 'pending' }],
      error: null,
    }))

    const result = await mocks.registeredTools['complete_task'].handler(
      { task_id: 's-mid' },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(parsed.parent_auto_complete_hint).toBeNull()
  })

  it('hint is null for a top-level task (no parent)', async () => {
    queue('tasks', createQuery({
      data: {
        id: 't-top', title: 'top', status: 'pending',
        created_at: '2026-04-16T06:30:00.000Z', due_date: null,
        parent_task_id: null,
      },
      error: null,
    }))
    queue('tasks', createQuery({ error: null }))

    const result = await mocks.registeredTools['complete_task'].handler(
      { task_id: 't-top' },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(parsed.parent_auto_complete_hint).toBeNull()
  })
})

// ── delete_task cascade count ───────────────────────────────────────────

describe('delete_task — cascade count', () => {
  it('returns cascaded_subtasks when present', async () => {
    queue('tasks', createQuery({ data: { id: 'p-1', title: 'parent' }, error: null }))
    queue('tasks', createQuery({ count: 3, data: null, error: null }))
    queue('tasks', createQuery({ error: null }))

    const result = await mocks.registeredTools['delete_task'].handler(
      { task_id: 'p-1' },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(parsed.cascaded_subtasks).toBe(3)
    expect(parsed.deleted).toBe(true)
    expect(parsed.title).toBe('parent')
  })
})
