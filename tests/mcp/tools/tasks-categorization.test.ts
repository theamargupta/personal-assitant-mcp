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
const methods = ['select', 'insert', 'update', 'delete', 'eq', 'neq', 'gte', 'lte', 'is', 'in', 'order', 'limit', 'range', 'single', 'maybeSingle']

function createQuery(result: QueryResult = { data: null, error: null }): QueryChain {
  const chain = {} as QueryChain
  for (const method of methods) chain[method] = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn().mockResolvedValue(result)
  chain.maybeSingle = vi.fn().mockResolvedValue(result)
  chain.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject)
  return chain
}

function createFilteredChain(rows: any[]): QueryChain {
  const filters: Array<{ column: string; value: unknown }> = []
  const chain = createQuery({ data: rows, count: rows.length, error: null })
  chain.eq = vi.fn((column: string, value: unknown) => {
    filters.push({ column, value })
    return chain
  })
  chain.range = vi.fn(async (from: number, to: number) => {
    const filtered = rows.filter((row) => {
      for (const f of filters) {
        if (f.column === 'user_id') continue
        if (row[f.column] !== f.value) return false
      }
      return true
    })
    return { data: filtered.slice(from, to + 1), count: filtered.length, error: null }
  })
  chain.then = (resolve, reject) => {
    const filtered = rows.filter((row) => {
      for (const f of filters) {
        if (f.column === 'user_id') continue
        if (row[f.column] !== f.value) return false
      }
      return true
    })
    return Promise.resolve({ data: filtered, count: filtered.length, error: null }).then(resolve, reject)
  }
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
  mocks.queues = new Map()
  setupFromQueues()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('create_task — categorization', () => {
  it("rejects task_type='project' with missing project", async () => {
    const result = await mocks.registeredTools['create_task'].handler(
      { title: 'X', priority: 'medium', tags: [], task_type: 'project' },
      { authInfo }
    )
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe("Error: project is required when task_type is 'project'")
    expect(mocks.mockClient.from).not.toHaveBeenCalled()
  })

  it("accepts task_type='personal' with a project value (loosely allowed)", async () => {
    const insertChain = createQuery({
      data: { id: 't-p1', title: 'Buy milk', status: 'pending', priority: 'medium', due_date: null, task_type: 'personal', project: 'sathi', created_at: '2026-04-17T06:30:00.000Z' },
      error: null,
    })
    queue('tasks', insertChain)

    const result = await mocks.registeredTools['create_task'].handler(
      { title: 'Buy milk', priority: 'medium', tags: [], task_type: 'personal', project: 'sathi' },
      { authInfo }
    )

    expect(insertChain.insert).toHaveBeenCalledWith(expect.objectContaining({
      task_type: 'personal',
      project: 'sathi',
    }))
    const parsed = parseToolResult(result)
    expect(parsed.task_type).toBe('personal')
    expect(parsed.project).toBe('sathi')
  })

  it("persists task_type='project' + project and returns them", async () => {
    const insertChain = createQuery({
      data: { id: 't-pj', title: 'Fix bug', status: 'pending', priority: 'high', due_date: null, task_type: 'project', project: 'sathi', created_at: '2026-04-17T06:30:00.000Z' },
      error: null,
    })
    queue('tasks', insertChain)

    const result = await mocks.registeredTools['create_task'].handler(
      { title: 'Fix bug', priority: 'high', tags: [], task_type: 'project', project: 'sathi' },
      { authInfo }
    )

    expect(insertChain.insert).toHaveBeenCalledWith(expect.objectContaining({
      task_type: 'project',
      project: 'sathi',
    }))
    const parsed = parseToolResult(result)
    expect(parsed.task_type).toBe('project')
    expect(parsed.project).toBe('sathi')
  })

  it('accepts a 10000-char description', async () => {
    const insertChain = createQuery({
      data: { id: 't-big', title: 'Big', status: 'pending', priority: 'medium', due_date: null, task_type: 'personal', project: null, created_at: '2026-04-17T06:30:00.000Z' },
      error: null,
    })
    queue('tasks', insertChain)

    const longDesc = 'a'.repeat(10000)
    await mocks.registeredTools['create_task'].handler(
      { title: 'Big', description: longDesc, priority: 'medium', tags: [], task_type: 'personal' },
      { authInfo }
    )

    expect(insertChain.insert).toHaveBeenCalledWith(expect.objectContaining({
      description: longDesc,
    }))
  })
})

describe('list_tasks — categorization filters', () => {
  it('filters by task_type and project', async () => {
    const rows = [
      { id: 't-1', title: 'Personal', status: 'pending', priority: 'medium', due_date: null, tags: [], task_type: 'personal', project: null, created_at: '2026-04-17T06:30:00.000Z', completed_at: null },
      { id: 't-2', title: 'Sathi bug', status: 'pending', priority: 'high', due_date: null, tags: [], task_type: 'project', project: 'sathi', created_at: '2026-04-17T06:30:00.000Z', completed_at: null },
      { id: 't-3', title: 'Sathi feat', status: 'pending', priority: 'high', due_date: null, tags: [], task_type: 'project', project: 'sathi', created_at: '2026-04-17T06:30:00.000Z', completed_at: null },
      { id: 't-4', title: 'Other', status: 'pending', priority: 'high', due_date: null, tags: [], task_type: 'project', project: 'memory-mcp', created_at: '2026-04-17T06:30:00.000Z', completed_at: null },
    ]
    const listChain = createFilteredChain(rows)
    queue('tasks', listChain)

    const result = await mocks.registeredTools['list_tasks'].handler(
      { task_type: 'project', project: 'sathi', limit: 50, offset: 0 },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(listChain.eq).toHaveBeenCalledWith('task_type', 'project')
    expect(listChain.eq).toHaveBeenCalledWith('project', 'sathi')
    expect(parsed.tasks.map((t: { task_id: string }) => t.task_id)).toEqual(['t-2', 't-3'])
    expect(parsed.tasks[0].task_type).toBe('project')
    expect(parsed.tasks[0].project).toBe('sathi')
  })
})

describe('get_task', () => {
  it('returns project_context=null for personal tasks', async () => {
    const fetchChain = createQuery({
      data: {
        id: 't-personal',
        title: 'Buy milk',
        description: 'dairy',
        status: 'pending',
        priority: 'medium',
        due_date: null,
        tags: [],
        task_type: 'personal',
        project: null,
        created_at: '2026-04-17T06:30:00.000Z',
        updated_at: '2026-04-17T06:30:00.000Z',
        completed_at: null,
      },
      error: null,
    })
    queue('tasks', fetchChain)

    const result = await mocks.registeredTools['get_task'].handler(
      { task_id: 't-personal' },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(parsed.project_context).toBeNull()
    expect(parsed.task.task_id).toBe('t-personal')
    expect(parsed.task.task_type).toBe('personal')
    expect(mocks.getRules).not.toHaveBeenCalled()
    expect(mocks.searchMemories).not.toHaveBeenCalled()
  })

  it('returns summary + rules + relevant + claude_md_hint for project tasks', async () => {
    const fetchChain = createQuery({
      data: {
        id: 't-proj',
        title: 'Fix streak bug',
        description: 'IST boundary issue',
        status: 'pending',
        priority: 'high',
        due_date: null,
        tags: [],
        task_type: 'project',
        project: 'sathi',
        created_at: '2026-04-17T06:30:00.000Z',
        updated_at: '2026-04-17T06:30:00.000Z',
        completed_at: null,
      },
      error: null,
    })
    queue('tasks', fetchChain)

    const memSummary = createQuery({
      data: [{ category: 'rule' }, { category: 'decision' }, { category: 'rule' }, { category: 'context' }],
      error: null,
    })
    queue('pa_memory_items', memSummary)

    mocks.getRules.mockResolvedValueOnce([
      { id: 'r-1', title: 'Stateless server', content: 'No module-level state.', tags: ['rules'] },
    ])
    mocks.searchMemories.mockResolvedValueOnce([
      { id: 'm-1', title: 'IST helpers', content: 'Use toIST', category: 'decision', tags: [], semantic_score: 0.812, keyword_score: 0.5, final_score: 0.75 },
    ])

    const result = await mocks.registeredTools['get_task'].handler(
      { task_id: 't-proj' },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(parsed.task.task_type).toBe('project')
    expect(parsed.task.project).toBe('sathi')
    expect(parsed.project_context.summary.total_memories).toBe(4)
    expect(parsed.project_context.summary.by_category).toEqual({ rule: 2, decision: 1, context: 1 })
    expect(parsed.project_context.rules).toHaveLength(1)
    expect(parsed.project_context.rules[0].id).toBe('r-1')
    expect(parsed.project_context.relevant).toHaveLength(1)
    expect(parsed.project_context.relevant[0].semantic_score).toBe(0.812)
    expect(parsed.project_context.claude_md_hint).toContain("project='sathi'")

    expect(mocks.getRules).toHaveBeenCalledWith('user-1', 'sathi')
    expect(mocks.searchMemories).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      project: 'sathi',
      limit: 10,
    }))
    const callArg = (mocks.searchMemories.mock.calls[0] as [{ query: string }])[0]
    expect(callArg.query).toContain('Fix streak bug')
    expect(callArg.query).toContain('IST boundary issue')
  })

  it('returns tool error when task not found', async () => {
    queue('tasks', createQuery({ data: null, error: { message: 'not found' } }))

    const result = await mocks.registeredTools['get_task'].handler(
      { task_id: 't-missing' },
      { authInfo }
    )

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: Task not found')
  })

  it('throws when unauthorized', async () => {
    await expect(mocks.registeredTools['get_task'].handler(
      { task_id: 't-1' },
      { authInfo: { extra: {} } }
    )).rejects.toThrow('Unauthorized')
  })
})
