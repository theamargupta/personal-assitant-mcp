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
  registeredTools: {} as Record<string, { handler: Function }>,
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => mocks.mockClient),
}))

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: class {
    tool(name: string, _desc: string, _schema: unknown, handler: Function) {
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
const methods = ['select', 'insert', 'update', 'delete', 'eq', 'neq', 'gte', 'lte', 'order', 'limit', 'range', 'single', 'maybeSingle']

function createQuery(result: QueryResult = { data: null, error: null }): QueryChain {
  const chain = {} as QueryChain
  for (const method of methods) chain[method] = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn().mockResolvedValue(result)
  chain.maybeSingle = vi.fn().mockResolvedValue(result)
  chain.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject)
  return chain
}

function createTaskListQuery(rows: any[]): QueryChain {
  const filters: Array<{ column: string; value: unknown; op: 'eq' | 'gte' | 'lte' }> = []
  const chain = createQuery({ data: rows, count: rows.length, error: null })
  chain.eq = vi.fn((column: string, value: unknown) => {
    filters.push({ column, value, op: 'eq' })
    return chain
  })
  chain.gte = vi.fn((column: string, value: unknown) => {
    filters.push({ column, value, op: 'gte' })
    return chain
  })
  chain.lte = vi.fn((column: string, value: unknown) => {
    filters.push({ column, value, op: 'lte' })
    return chain
  })
  chain.range = vi.fn(async (from: number, to: number) => {
    let filtered = rows
    for (const filter of filters) {
      if (filter.column === 'user_id') continue
      if (filter.op === 'eq') filtered = filtered.filter((row) => row[filter.column] === filter.value)
      if (filter.op === 'gte') filtered = filtered.filter((row) => row[filter.column] >= filter.value)
      if (filter.op === 'lte') filtered = filtered.filter((row) => row[filter.column] <= filter.value)
    }
    return { data: filtered.slice(from, to + 1), count: filtered.length, error: null }
  })
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

function task(overrides: Record<string, unknown> = {}) {
  return {
    id: 't-1',
    title: 'Write tests',
    description: null,
    status: 'pending',
    priority: 'medium',
    due_date: null,
    tags: [],
    created_at: '2026-04-11T06:30:00.000Z',
    completed_at: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-04-16T06:30:00.000Z'))
  mocks.queues = new Map()
  setupFromQueues()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('create_task', () => {
  it('throws when unauthorized', async () => {
    await expect(mocks.registeredTools['create_task'].handler(
      { title: 'Test', priority: 'medium', tags: [] },
      { authInfo: noAuth }
    )).rejects.toThrow('Unauthorized')
  })

  it('creates task with normalized input fields', async () => {
    const insertChain = createQuery({
      data: task({ title: 'Buy milk', priority: 'high', due_date: '2026-04-20', tags: ['shopping'] }),
      error: null,
    })
    queue('tasks', insertChain)

    const result = await mocks.registeredTools['create_task'].handler(
      { title: ' Buy milk ', description: ' dairy ', due_date: '2026-04-20', priority: 'high', tags: ['shopping'] },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(insertChain.insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      title: 'Buy milk',
      description: 'dairy',
      status: 'pending',
      priority: 'high',
      due_date: '2026-04-20',
      tags: ['shopping'],
    })
    expect(parsed.task_id).toBe('t-1')
    expect(parsed.title).toBe('Buy milk')
    expect(parsed.status).toBe('pending')
    expect(parsed.priority).toBe('high')
  })

  it('returns DB errors as tool errors', async () => {
    queue('tasks', createQuery({ data: null, error: { message: 'DB error' } }))

    const result = await mocks.registeredTools['create_task'].handler(
      { title: 'Test', priority: 'high', tags: [] },
      { authInfo }
    )

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: DB error')
  })
})

describe('list_tasks', () => {
  it('throws when unauthorized', async () => {
    await expect(mocks.registeredTools['list_tasks'].handler(
      { limit: 50, offset: 0 },
      { authInfo: noAuth }
    )).rejects.toThrow('Unauthorized')
  })

  it('filters by status correctly', async () => {
    const listChain = createTaskListQuery([
      task({ id: 't-pending', title: 'Pending task', status: 'pending' }),
      task({ id: 't-progress', title: 'Progress task', status: 'in_progress' }),
      task({ id: 't-done', title: 'Done task', status: 'completed', completed_at: '2026-04-15T06:30:00.000Z' }),
    ])
    queue('tasks', listChain)

    const result = await mocks.registeredTools['list_tasks'].handler(
      { status: 'completed', limit: 50, offset: 0 },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(listChain.eq).toHaveBeenCalledWith('status', 'completed')
    expect(parsed.total).toBe(1)
    expect(parsed.tasks.map((row: { task_id: string }) => row.task_id)).toEqual(['t-done'])
    expect(parsed.tasks[0].status).toBe('completed')
  })

  it('applies due date and priority filters to query shape', async () => {
    const listChain = createTaskListQuery([
      task({ id: 't-1', priority: 'high', due_date: '2026-04-18' }),
      task({ id: 't-2', priority: 'low', due_date: '2026-04-25' }),
    ])
    queue('tasks', listChain)

    const result = await mocks.registeredTools['list_tasks'].handler(
      { priority: 'high', due_date_before: '2026-04-20', due_date_after: '2026-04-01', limit: 10, offset: 0 },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(listChain.eq).toHaveBeenCalledWith('priority', 'high')
    expect(listChain.gte).toHaveBeenCalledWith('due_date', '2026-04-01')
    expect(listChain.lte).toHaveBeenCalledWith('due_date', '2026-04-20')
    expect(parsed.tasks).toHaveLength(1)
    expect(parsed.tasks[0].task_id).toBe('t-1')
  })
})

describe('update_task_status', () => {
  it('throws when unauthorized', async () => {
    await expect(mocks.registeredTools['update_task_status'].handler(
      { task_id: 't-1', status: 'completed' },
      { authInfo: noAuth }
    )).rejects.toThrow('Unauthorized')
  })

  it.each([
    ['pending', null],
    ['in_progress', null],
    ['completed', '2026-04-16T06:30:00.000Z'],
  ])('transitions task status to %s with correct completion timestamp', async (status, expectedCompletedAt) => {
    const updateChain = createQuery({
      data: { id: 't-1', title: 'Task', status, updated_at: '2026-04-16T06:30:00.000Z' },
      error: null,
    })
    queue('tasks', updateChain)

    const result = await mocks.registeredTools['update_task_status'].handler(
      { task_id: 't-1', status },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(updateChain.update).toHaveBeenCalledWith(expect.objectContaining({
      status,
      completed_at: expectedCompletedAt,
    }))
    expect(parsed.status).toBe(status)
    expect(parsed.task_id).toBe('t-1')
  })

  it('returns error when task is not found', async () => {
    queue('tasks', createQuery({ data: null, error: null }))

    const result = await mocks.registeredTools['update_task_status'].handler(
      { task_id: 't-bad', status: 'completed' },
      { authInfo }
    )

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: Task not found')
  })
})

describe('complete_task', () => {
  it('throws when unauthorized', async () => {
    await expect(mocks.registeredTools['complete_task'].handler(
      { task_id: 't-1' },
      { authInfo: noAuth }
    )).rejects.toThrow('Unauthorized')
  })

  it('returns error when task not found', async () => {
    queue('tasks', createQuery({ data: null, error: { message: 'not found' } }))

    const result = await mocks.registeredTools['complete_task'].handler(
      { task_id: 't-bad' },
      { authInfo }
    )

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: Task not found')
  })

  it('calculates days_to_complete', async () => {
    queue('tasks', createQuery({
      data: task({ id: 't-1', title: 'Five day task', created_at: '2026-04-11T06:30:00.000Z', due_date: '2026-04-20' }),
      error: null,
    }))
    const updateChain = createQuery({ error: null })
    queue('tasks', updateChain)

    const result = await mocks.registeredTools['complete_task'].handler(
      { task_id: 't-1' },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(updateChain.update).toHaveBeenCalledWith({
      status: 'completed',
      completed_at: '2026-04-16T06:30:00.000Z',
      updated_at: '2026-04-16T06:30:00.000Z',
    })
    expect(parsed.days_to_complete).toBe(5)
    expect(parsed.was_overdue).toBe(false)
  })

  it('detects overdue task completion', async () => {
    queue('tasks', createQuery({
      data: task({ id: 't-overdue', title: 'Past due task', created_at: '2026-04-10T06:30:00.000Z', due_date: '2026-04-15' }),
      error: null,
    }))
    queue('tasks', createQuery({ error: null }))

    const result = await mocks.registeredTools['complete_task'].handler(
      { task_id: 't-overdue' },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(parsed.status).toBe('completed')
    expect(parsed.was_overdue).toBe(true)
    expect(parsed.days_to_complete).toBe(6)
  })

  it('is not overdue when completed on time', async () => {
    queue('tasks', createQuery({
      data: task({ id: 't-on-time', title: 'Future due task', created_at: '2026-04-14T06:30:00.000Z', due_date: '2026-04-17' }),
      error: null,
    }))
    queue('tasks', createQuery({ error: null }))

    const result = await mocks.registeredTools['complete_task'].handler(
      { task_id: 't-on-time' },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(parsed.was_overdue).toBe(false)
    expect(parsed.days_to_complete).toBe(2)
  })

  it('does not update an already completed task', async () => {
    queue('tasks', createQuery({
      data: task({ status: 'completed', completed_at: '2026-04-15T06:30:00.000Z' }),
      error: null,
    }))

    const result = await mocks.registeredTools['complete_task'].handler(
      { task_id: 't-1' },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(parsed).toEqual({
      message: 'Task is already completed',
      task_id: 't-1',
      completed_at: '2026-04-15T06:30:00.000Z',
    })
    expect(mocks.mockClient.from).toHaveBeenCalledTimes(1)
  })
})
