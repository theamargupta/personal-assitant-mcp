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

// ── update_task cascade to subtasks ───────────────────────────────────────

describe('update_task — cascade to subtasks', () => {
  const baseRow = {
    id: 't-1', title: 'T', description: null, status: 'pending', priority: 'medium',
    due_date: null, tags: [], parent_task_id: null, position: null,
    created_at: '2026-04-17T06:30:00.000Z', updated_at: '2026-04-17T06:30:00.000Z', completed_at: null,
  }

  it('cascades task_type + project when top-level task_type changes', async () => {
    const fetchChain = createQuery({ data: { id: 't-1', task_type: 'personal', project: null, parent_task_id: null }, error: null })
    const updateChain = createQuery({
      data: { ...baseRow, task_type: 'project', project: 'sathi' },
      error: null,
    })
    const cascadeChain = createQuery({ error: null })
    queue('tasks', fetchChain, updateChain, cascadeChain)

    await mocks.registeredTools['update_task'].handler(
      { task_id: 't-1', task_type: 'project', project: 'sathi' },
      { authInfo }
    )

    expect(cascadeChain.update).toHaveBeenCalledWith(expect.objectContaining({
      task_type: 'project',
      project: 'sathi',
    }))
    expect(cascadeChain.eq).toHaveBeenCalledWith('parent_task_id', 't-1')
    expect(cascadeChain.eq).toHaveBeenCalledWith('user_id', 'user-1')
  })

  it('cascades null project when switching project → personal', async () => {
    const fetchChain = createQuery({ data: { id: 't-1', task_type: 'project', project: 'sathi', parent_task_id: null }, error: null })
    const updateChain = createQuery({
      data: { ...baseRow, task_type: 'personal', project: null },
      error: null,
    })
    const cascadeChain = createQuery({ error: null })
    queue('tasks', fetchChain, updateChain, cascadeChain)

    await mocks.registeredTools['update_task'].handler(
      { task_id: 't-1', task_type: 'personal' },
      { authInfo }
    )

    const callArg = (cascadeChain.update.mock.calls[0] as [Record<string, unknown>])[0]
    expect(callArg).toMatchObject({ task_type: 'personal', project: null })
  })

  it('cascades when project changes on project-type task', async () => {
    const fetchChain = createQuery({ data: { id: 't-1', task_type: 'project', project: 'sathi', parent_task_id: null }, error: null })
    const updateChain = createQuery({
      data: { ...baseRow, task_type: 'project', project: 'memory-mcp' },
      error: null,
    })
    const cascadeChain = createQuery({ error: null })
    queue('tasks', fetchChain, updateChain, cascadeChain)

    await mocks.registeredTools['update_task'].handler(
      { task_id: 't-1', project: 'memory-mcp' },
      { authInfo }
    )

    expect(cascadeChain.update).toHaveBeenCalledWith(expect.objectContaining({
      task_type: 'project',
      project: 'memory-mcp',
    }))
  })

  it('does NOT cascade when only title is updated', async () => {
    const fetchChain = createQuery({ data: { id: 't-1', task_type: 'project', project: 'sathi', parent_task_id: null }, error: null })
    const updateChain = createQuery({
      data: { ...baseRow, title: 'new', task_type: 'project', project: 'sathi' },
      error: null,
    })
    queue('tasks', fetchChain, updateChain)

    await mocks.registeredTools['update_task'].handler(
      { task_id: 't-1', title: 'new' },
      { authInfo }
    )

    // Only 2 calls (fetch + update). No 3rd cascade.
    expect(mocks.mockClient.from).toHaveBeenCalledTimes(2)
  })

  it('surfaces cascade failure as tool error', async () => {
    const fetchChain = createQuery({ data: { id: 't-1', task_type: 'personal', project: null, parent_task_id: null }, error: null })
    const updateChain = createQuery({
      data: { ...baseRow, task_type: 'project', project: 'sathi' },
      error: null,
    })
    const cascadeChain = createQuery({ error: { message: 'cascade boom' } })
    queue('tasks', fetchChain, updateChain, cascadeChain)

    const result = await mocks.registeredTools['update_task'].handler(
      { task_id: 't-1', task_type: 'project', project: 'sathi' },
      { authInfo }
    )

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error cascading to subtasks: cascade boom')
  })

  it('rejects attempt to change task_type on a subtask (blocked)', async () => {
    const fetchChain = createQuery({ data: { id: 's-1', task_type: 'project', project: 'sathi', parent_task_id: 'p-1' }, error: null })
    queue('tasks', fetchChain)

    const result = await mocks.registeredTools['update_task'].handler(
      { task_id: 's-1', task_type: 'personal' },
      { authInfo }
    )

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe(
      'Error: cannot change task_type or project on a subtask — these are inherited from parent'
    )
  })

  it('rejects attempt to change project on a subtask (blocked)', async () => {
    const fetchChain = createQuery({ data: { id: 's-1', task_type: 'project', project: 'sathi', parent_task_id: 'p-1' }, error: null })
    queue('tasks', fetchChain)

    const result = await mocks.registeredTools['update_task'].handler(
      { task_id: 's-1', project: 'memory-mcp' },
      { authInfo }
    )

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe(
      'Error: cannot change task_type or project on a subtask — these are inherited from parent'
    )
  })

  it('allows editing other fields on a subtask via update_task', async () => {
    const fetchChain = createQuery({ data: { id: 's-1', task_type: 'project', project: 'sathi', parent_task_id: 'p-1' }, error: null })
    const updateChain = createQuery({
      data: {
        ...baseRow,
        id: 's-1', title: 'Renamed', parent_task_id: 'p-1',
        task_type: 'project', project: 'sathi', position: 0,
      },
      error: null,
    })
    queue('tasks', fetchChain, updateChain)

    const result = await mocks.registeredTools['update_task'].handler(
      { task_id: 's-1', title: 'Renamed' },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(parsed.title).toBe('Renamed')
    expect(parsed.parent_task_id).toBe('p-1')
    // No cascade on subtask (parent_task_id !== null short-circuits the block)
    expect(mocks.mockClient.from).toHaveBeenCalledTimes(2)
  })

  it('surfaces update DB error', async () => {
    const fetchChain = createQuery({ data: { id: 't-1', task_type: 'personal', project: null, parent_task_id: null }, error: null })
    const updateChain = createQuery({ data: null, error: { message: 'update failed' } })
    queue('tasks', fetchChain, updateChain)

    const result = await mocks.registeredTools['update_task'].handler(
      { task_id: 't-1', title: 'X' },
      { authInfo }
    )

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: update failed')
  })
})

// ── get_task project_context subtasks + shape ────────────────────────────

describe('get_task — project_context shape', () => {
  it('includes subtasks list + subtask_progress for project task', async () => {
    const taskFetch = createQuery({
      data: {
        id: 't-proj', title: 'Work', description: 'do stuff',
        status: 'pending', priority: 'medium', due_date: null, tags: [],
        task_type: 'project', project: 'sathi',
        parent_task_id: null, position: null,
        created_at: '2026-04-17T06:30:00.000Z', updated_at: '2026-04-17T06:30:00.000Z', completed_at: null,
      },
      error: null,
    })
    const subRows = createQuery({
      data: [
        { id: 's-1', title: 'sub1', status: 'completed', priority: 'low', due_date: null, tags: [], position: 0, created_at: '2026-04-17T06:30:00.000Z', completed_at: '2026-04-17T07:00:00.000Z' },
        { id: 's-2', title: 'sub2', status: 'pending', priority: 'medium', due_date: null, tags: [], position: 1, created_at: '2026-04-17T06:30:00.000Z', completed_at: null },
      ],
      error: null,
    })
    const memorySummary = createQuery({
      data: [{ category: 'rule' }, { category: 'decision' }],
      error: null,
    })
    queue('tasks', taskFetch, subRows)
    queue('pa_memory_items', memorySummary)

    mocks.getRules.mockResolvedValueOnce([
      { id: 'r-1', title: 'Rule 1', content: 'must do', tags: ['rule'] },
      { id: 'r-2', title: 'Rule 2', content: 'do not', tags: [] },
    ])
    mocks.searchMemories.mockResolvedValueOnce([
      { id: 'm-1', title: 'ctx', content: 'c', category: 'context', tags: [], semantic_score: 0.9876, keyword_score: 0.1234, final_score: 0.5555 },
    ])

    const result = await mocks.registeredTools['get_task'].handler(
      { task_id: 't-proj' },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(parsed.subtasks).toHaveLength(2)
    expect(parsed.subtasks[0].completed_at).not.toBeNull()
    expect(parsed.subtasks[1].completed_at).toBeNull()
    expect(parsed.subtask_progress).toEqual({ completed: 1, total: 2, pct: 50 })

    const ctx = parsed.project_context
    expect(ctx.summary.total_memories).toBe(2)
    expect(ctx.summary.by_category).toEqual({ rule: 1, decision: 1 })
    expect(ctx.rules).toHaveLength(2)
    expect(ctx.rules[0]).toEqual({ id: 'r-1', title: 'Rule 1', content: 'must do', tags: ['rule'] })

    expect(ctx.relevant).toHaveLength(1)
    expect(ctx.relevant[0].id).toBe('m-1')
    // Scores rounded to 3 decimals
    expect(ctx.relevant[0].semantic_score).toBe(0.988)
    expect(ctx.relevant[0].keyword_score).toBe(0.123)
    expect(ctx.relevant[0].final_score).toBe(0.556)

    expect(ctx.claude_md_hint).toContain("project='sathi'")
    expect(ctx.claude_md_hint).toContain('CLAUDE.md')
  })

  it('treats project task with null project as non-project (project_context=null)', async () => {
    // task_type='project' but project is null — defensive path short-circuits.
    const taskFetch = createQuery({
      data: {
        id: 't-weird', title: 'orphan', description: null,
        status: 'pending', priority: 'medium', due_date: null, tags: [],
        task_type: 'project', project: null,
        parent_task_id: null, position: null,
        created_at: '2026-04-17T06:30:00.000Z', updated_at: '2026-04-17T06:30:00.000Z', completed_at: null,
      },
      error: null,
    })
    const subRows = createQuery({ data: [], error: null })
    queue('tasks', taskFetch, subRows)

    const result = await mocks.registeredTools['get_task'].handler(
      { task_id: 't-weird' },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(parsed.project_context).toBeNull()
    expect(mocks.getRules).not.toHaveBeenCalled()
    expect(mocks.searchMemories).not.toHaveBeenCalled()
  })

  it('handles empty memory summary (total=0, by_category={})', async () => {
    const taskFetch = createQuery({
      data: {
        id: 't-proj', title: 'Work', description: null,
        status: 'pending', priority: 'medium', due_date: null, tags: [],
        task_type: 'project', project: 'sathi',
        parent_task_id: null, position: null,
        created_at: '2026-04-17T06:30:00.000Z', updated_at: '2026-04-17T06:30:00.000Z', completed_at: null,
      },
      error: null,
    })
    const subRows = createQuery({ data: [], error: null })
    const memorySummary = createQuery({ data: [], error: null })
    queue('tasks', taskFetch, subRows)
    queue('pa_memory_items', memorySummary)

    mocks.getRules.mockResolvedValueOnce([])
    mocks.searchMemories.mockResolvedValueOnce([])

    const result = await mocks.registeredTools['get_task'].handler(
      { task_id: 't-proj' },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(parsed.project_context.summary).toEqual({ total_memories: 0, by_category: {} })
    expect(parsed.project_context.rules).toEqual([])
    expect(parsed.project_context.relevant).toEqual([])
  })

  it('truncates long query text to 500 chars when building search query', async () => {
    const longDesc = 'x'.repeat(600)
    const taskFetch = createQuery({
      data: {
        id: 't-proj', title: 'Short', description: longDesc,
        status: 'pending', priority: 'medium', due_date: null, tags: [],
        task_type: 'project', project: 'sathi',
        parent_task_id: null, position: null,
        created_at: '2026-04-17T06:30:00.000Z', updated_at: '2026-04-17T06:30:00.000Z', completed_at: null,
      },
      error: null,
    })
    const subRows = createQuery({ data: [], error: null })
    const memorySummary = createQuery({ data: [], error: null })
    queue('tasks', taskFetch, subRows)
    queue('pa_memory_items', memorySummary)

    mocks.getRules.mockResolvedValueOnce([])
    mocks.searchMemories.mockResolvedValueOnce([])

    await mocks.registeredTools['get_task'].handler(
      { task_id: 't-proj' },
      { authInfo }
    )

    const callArg = (mocks.searchMemories.mock.calls[0] as [{ query: string }])[0]
    expect(callArg.query.length).toBe(500)
  })
})
