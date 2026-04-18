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
const methods = ['select', 'insert', 'update', 'delete', 'eq', 'neq', 'gte', 'lte', 'order', 'limit', 'range', 'single', 'maybeSingle']

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

const baseRow = {
  id: 't-1',
  title: 'Original',
  description: 'orig desc',
  status: 'pending',
  priority: 'medium',
  due_date: null,
  tags: [],
  task_type: 'personal',
  project: null,
  created_at: '2026-04-17T06:30:00.000Z',
  updated_at: '2026-04-17T06:30:00.000Z',
  completed_at: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.queues = new Map()
  setupFromQueues()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('update_task', () => {
  it('partial update — title only, leaves task_type/project untouched', async () => {
    const fetchChain = createQuery({ data: { id: 't-1', task_type: 'personal', project: null }, error: null })
    const updateChain = createQuery({
      data: { ...baseRow, title: 'New title', updated_at: '2026-04-18T10:00:00.000Z' },
      error: null,
    })
    queue('tasks', fetchChain, updateChain)

    const result = await mocks.registeredTools['update_task'].handler(
      { task_id: 't-1', title: 'New title' },
      { authInfo }
    )

    const callArg = (updateChain.update.mock.calls[0] as [Record<string, unknown>])[0]
    expect(callArg).toMatchObject({ title: 'New title' })
    expect(callArg).not.toHaveProperty('task_type')
    expect(callArg).not.toHaveProperty('project')
    expect(callArg).toHaveProperty('updated_at')

    const parsed = parseToolResult(result)
    expect(parsed.title).toBe('New title')
    expect(parsed.task_type).toBe('personal')
  })

  it('personal → project migration with project field', async () => {
    const fetchChain = createQuery({ data: { id: 't-1', task_type: 'personal', project: null }, error: null })
    const updateChain = createQuery({
      data: { ...baseRow, task_type: 'project', project: 'sathi' },
      error: null,
    })
    queue('tasks', fetchChain, updateChain)

    const result = await mocks.registeredTools['update_task'].handler(
      { task_id: 't-1', task_type: 'project', project: 'sathi' },
      { authInfo }
    )

    const callArg = (updateChain.update.mock.calls[0] as [Record<string, unknown>])[0]
    expect(callArg).toMatchObject({ task_type: 'project', project: 'sathi' })
    const parsed = parseToolResult(result)
    expect(parsed.task_type).toBe('project')
    expect(parsed.project).toBe('sathi')
  })

  it("rejects switch to task_type='project' without project (and no existing project)", async () => {
    const fetchChain = createQuery({ data: { id: 't-1', task_type: 'personal', project: null }, error: null })
    queue('tasks', fetchChain)

    const result = await mocks.registeredTools['update_task'].handler(
      { task_id: 't-1', task_type: 'project' },
      { authInfo }
    )

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe("Error: project is required when task_type is 'project'")
  })

  it("allows switch to task_type='project' when row already has a project value", async () => {
    const fetchChain = createQuery({ data: { id: 't-1', task_type: 'personal', project: 'sathi' }, error: null })
    const updateChain = createQuery({
      data: { ...baseRow, task_type: 'project', project: 'sathi' },
      error: null,
    })
    queue('tasks', fetchChain, updateChain)

    await mocks.registeredTools['update_task'].handler(
      { task_id: 't-1', task_type: 'project' },
      { authInfo }
    )

    const callArg = (updateChain.update.mock.calls[0] as [Record<string, unknown>])[0]
    expect(callArg).toMatchObject({ task_type: 'project', project: 'sathi' })
  })

  it("project → personal auto-clears project", async () => {
    const fetchChain = createQuery({ data: { id: 't-1', task_type: 'project', project: 'sathi' }, error: null })
    const updateChain = createQuery({
      data: { ...baseRow, task_type: 'personal', project: null },
      error: null,
    })
    queue('tasks', fetchChain, updateChain)

    const result = await mocks.registeredTools['update_task'].handler(
      { task_id: 't-1', task_type: 'personal' },
      { authInfo }
    )

    const callArg = (updateChain.update.mock.calls[0] as [Record<string, unknown>])[0]
    expect(callArg).toMatchObject({ task_type: 'personal', project: null })
    const parsed = parseToolResult(result)
    expect(parsed.task_type).toBe('personal')
    expect(parsed.project).toBeNull()
  })

  it("rejects task_type='personal' combined with a project value", async () => {
    const fetchChain = createQuery({ data: { id: 't-1', task_type: 'project', project: 'sathi' }, error: null })
    queue('tasks', fetchChain)

    const result = await mocks.registeredTools['update_task'].handler(
      { task_id: 't-1', task_type: 'personal', project: 'sathi' },
      { authInfo }
    )

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe("Error: cannot set project when task_type='personal'")
  })

  it('clears due_date when null is passed', async () => {
    const fetchChain = createQuery({ data: { id: 't-1', task_type: 'personal', project: null }, error: null })
    const updateChain = createQuery({
      data: { ...baseRow, due_date: null },
      error: null,
    })
    queue('tasks', fetchChain, updateChain)

    await mocks.registeredTools['update_task'].handler(
      { task_id: 't-1', due_date: null },
      { authInfo }
    )

    const callArg = (updateChain.update.mock.calls[0] as [Record<string, unknown>])[0]
    expect(callArg).toHaveProperty('due_date', null)
  })

  it('replaces (not merges) tags when provided', async () => {
    const fetchChain = createQuery({ data: { id: 't-1', task_type: 'personal', project: null }, error: null })
    const updateChain = createQuery({
      data: { ...baseRow, tags: ['only', 'these'] },
      error: null,
    })
    queue('tasks', fetchChain, updateChain)

    await mocks.registeredTools['update_task'].handler(
      { task_id: 't-1', tags: ['only', 'these'] },
      { authInfo }
    )

    const callArg = (updateChain.update.mock.calls[0] as [Record<string, unknown>])[0]
    expect(callArg).toMatchObject({ tags: ['only', 'these'] })
  })

  it('returns error when task is not found', async () => {
    queue('tasks', createQuery({ data: null, error: { message: 'not found' } }))

    const result = await mocks.registeredTools['update_task'].handler(
      { task_id: 't-missing', title: 'X' },
      { authInfo }
    )

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: Task not found')
  })

  it('rejects empty patch (only task_id provided)', async () => {
    const fetchChain = createQuery({ data: { id: 't-1', task_type: 'personal', project: null }, error: null })
    queue('tasks', fetchChain)

    const result = await mocks.registeredTools['update_task'].handler(
      { task_id: 't-1' },
      { authInfo }
    )

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: no fields provided to update')
  })

  it('throws when unauthorized', async () => {
    await expect(mocks.registeredTools['update_task'].handler(
      { task_id: 't-1', title: 'X' },
      { authInfo: { extra: {} } }
    )).rejects.toThrow('Unauthorized')
  })
})
