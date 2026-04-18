import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ── Hoisted mocks ─────────────────────────────────────────
const mocks = vi.hoisted(() => ({
  state: {
    categoryLookup: null as { id: string } | null,
  },
  createTransaction: vi.fn(),
  listTransactions: vi.fn(),
  getSpendingSummary: vi.fn(),
  ensurePresetCategories: vi.fn(async () => undefined),
  saveMemory: vi.fn(),
  searchMemories: vi.fn(),
  mockClient: {
    from: vi.fn(),
  },
}))

vi.mock('@/lib/finance/transactions', () => ({
  createTransaction: mocks.createTransaction,
  listTransactions: mocks.listTransactions,
  getSpendingSummary: mocks.getSpendingSummary,
}))

vi.mock('@/lib/finance/categories', () => ({
  ensurePresetCategories: mocks.ensurePresetCategories,
}))

vi.mock('@/lib/memory/items', () => ({
  saveMemory: mocks.saveMemory,
  searchMemories: mocks.searchMemories,
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => mocks.mockClient),
}))

// ── Helpers ───────────────────────────────────────────────
type ChainResult = { data?: any; error?: { message: string } | null }

function makeChain(terminalResult: ChainResult) {
  const chain: any = {}
  const methods = [
    'select', 'insert', 'update', 'delete', 'upsert',
    'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'is', 'ilike', 'in',
    'order', 'limit', 'range',
  ]
  for (const m of methods) chain[m] = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn().mockResolvedValue(terminalResult)
  chain.maybeSingle = vi.fn().mockResolvedValue(terminalResult)
  chain.then = (resolve: (v: any) => unknown, reject?: (r: unknown) => unknown) =>
    Promise.resolve(terminalResult).then(resolve, reject)
  return chain
}

function queueFrom(chains: any[]) {
  mocks.mockClient.from = vi.fn(() => chains.shift()) as any
}

// ── Import AFTER mocks ────────────────────────────────────
import { CHAT_TOOLS, executeTool } from '@/lib/chat/tools'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.state.categoryLookup = null
  mocks.ensurePresetCategories.mockImplementation(async () => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('CHAT_TOOLS', () => {
  it('exports an array of tools with required Anthropic Tool fields', () => {
    expect(Array.isArray(CHAT_TOOLS)).toBe(true)
    expect(CHAT_TOOLS.length).toBeGreaterThan(0)
    for (const t of CHAT_TOOLS) {
      expect(typeof t.name).toBe('string')
      expect(typeof t.description).toBe('string')
      expect(t.input_schema).toBeTruthy()
      expect((t.input_schema as any).type).toBe('object')
    }
  })

  it('includes all expected tool names', () => {
    const names = CHAT_TOOLS.map((t) => t.name).sort()
    expect(names).toEqual(
      [
        'add_transaction',
        'complete_task',
        'create_task',
        'get_spending_summary',
        'list_habits',
        'list_tasks',
        'list_transactions',
        'log_habit',
        'save_memory',
        'search_memory',
      ].sort()
    )
  })
})

describe('executeTool — unknown', () => {
  it('returns a summary for unknown tool', async () => {
    const result = await executeTool('nonexistent', {}, { userId: 'u1' })
    expect(result.summary).toContain('Unknown tool: nonexistent')
  })
})

describe('executeTool — add_transaction', () => {
  it('rejects non-finite or non-positive amount', async () => {
    const a = await executeTool('add_transaction', { amount: 'abc' }, { userId: 'u1' })
    expect(a.summary).toBe('Invalid amount')
    const b = await executeTool('add_transaction', { amount: 0 }, { userId: 'u1' })
    expect(b.summary).toBe('Invalid amount')
    const c = await executeTool('add_transaction', { amount: -10 }, { userId: 'u1' })
    expect(c.summary).toBe('Invalid amount')
    expect(mocks.createTransaction).not.toHaveBeenCalled()
  })

  it('creates a transaction without category', async () => {
    mocks.createTransaction.mockResolvedValue({ id: 'tx1', amount: 200 })
    const result = await executeTool(
      'add_transaction',
      { amount: 200, merchant: 'Starbucks' },
      { userId: 'u1' }
    )
    expect(mocks.ensurePresetCategories).not.toHaveBeenCalled()
    expect(mocks.createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', amount: 200, merchant: 'Starbucks' })
    )
    expect(result.summary).toBe('Added ₹200 · Starbucks')
    expect(result.data).toEqual({ id: 'tx1', amount: 200 })
  })

  it('creates a transaction with only amount', async () => {
    mocks.createTransaction.mockResolvedValue({ id: 'tx2', amount: 100 })
    const result = await executeTool(
      'add_transaction',
      { amount: 100 },
      { userId: 'u1' }
    )
    expect(result.summary).toBe('Added ₹100')
  })

  it('looks up category by name and includes it', async () => {
    mocks.state.categoryLookup = { id: 'cat-food' }
    queueFrom([makeChain({ data: { id: 'cat-food' }, error: null })])
    mocks.createTransaction.mockResolvedValue({ id: 'tx3' })

    const result = await executeTool(
      'add_transaction',
      { amount: 450, merchant: 'Uber', category: 'Transport' },
      { userId: 'u1' }
    )
    expect(mocks.ensurePresetCategories).toHaveBeenCalledWith('u1')
    expect(mocks.createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: 'cat-food' })
    )
    expect(result.summary).toContain('(Transport)')
    expect(result.summary).toContain('Uber')
  })

  it('passes note through', async () => {
    mocks.createTransaction.mockResolvedValue({ id: 'tx4' })
    await executeTool(
      'add_transaction',
      { amount: 30, note: 'coffee run' },
      { userId: 'u1' }
    )
    expect(mocks.createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ note: 'coffee run' })
    )
  })
})

describe('executeTool — list_transactions', () => {
  it('lists without filters', async () => {
    mocks.listTransactions.mockResolvedValue({ transactions: [{ id: 'a' }, { id: 'b' }], total: 2 })
    const result = await executeTool('list_transactions', {}, { userId: 'u1' })
    expect(result.summary).toBe('2 transactions')
    expect(result.data).toEqual([{ id: 'a' }, { id: 'b' }])
    expect(mocks.listTransactions).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', limit: 10 })
    )
  })

  it('applies start/end date filters as IST ISO', async () => {
    mocks.listTransactions.mockResolvedValue({ transactions: [], total: 0 })
    await executeTool(
      'list_transactions',
      { start_date: '2026-01-01', end_date: '2026-01-31', limit: 5 },
      { userId: 'u1' }
    )
    const call = mocks.listTransactions.mock.calls[0][0] as any
    expect(call.startDate).toContain('2025') // IST 2026-01-01 00:00 => 2025-12-31 UTC
    expect(call.endDate).toBeDefined()
    expect(call.limit).toBe(5)
  })

  it('caps limit at 50', async () => {
    mocks.listTransactions.mockResolvedValue({ transactions: [], total: 0 })
    await executeTool('list_transactions', { limit: 9999 }, { userId: 'u1' })
    expect((mocks.listTransactions.mock.calls[0][0] as any).limit).toBe(50)
  })

  it('resolves category filter via supabase lookup', async () => {
    queueFrom([makeChain({ data: { id: 'cat-xyz' }, error: null })])
    mocks.listTransactions.mockResolvedValue({ transactions: [], total: 0 })
    await executeTool('list_transactions', { category: 'Food' }, { userId: 'u1' })
    expect((mocks.listTransactions.mock.calls[0][0] as any).categoryId).toBe('cat-xyz')
  })

  it('handles missing category lookup gracefully', async () => {
    queueFrom([makeChain({ data: null, error: null })])
    mocks.listTransactions.mockResolvedValue({ transactions: [], total: 0 })
    await executeTool('list_transactions', { category: 'Unknown' }, { userId: 'u1' })
    expect((mocks.listTransactions.mock.calls[0][0] as any).categoryId).toBeUndefined()
  })
})

describe('executeTool — get_spending_summary', () => {
  it('formats a spending summary', async () => {
    mocks.getSpendingSummary.mockResolvedValue({ total_spent: 12345.67, by_category: [] })
    const result = await executeTool(
      'get_spending_summary',
      { start_date: '2026-04-01', end_date: '2026-04-30' },
      { userId: 'u1' }
    )
    expect(result.summary).toContain('₹12,346')
    expect(result.summary).toContain('2026-04-01')
    expect(result.summary).toContain('2026-04-30')
    expect(result.data).toEqual({ total_spent: 12345.67, by_category: [] })
  })
})

describe('executeTool — create_task', () => {
  it('inserts and returns created task', async () => {
    queueFrom([makeChain({ data: { id: 't1', title: 'Write report', priority: 'high', due_date: '2026-04-20' }, error: null })])
    const result = await executeTool(
      'create_task',
      { title: 'Write report', description: 'quarter review', due_date: '2026-04-20', priority: 'high' },
      { userId: 'u1' }
    )
    expect(result.summary).toBe('Created task · Write report')
    expect(result.data).toMatchObject({ id: 't1', title: 'Write report' })
  })

  it('returns failure summary on error', async () => {
    queueFrom([makeChain({ data: null, error: { message: 'nope' } })])
    const result = await executeTool('create_task', { title: 'Broken' }, { userId: 'u1' })
    expect(result.summary).toContain('Task failed: nope')
  })

  it('defaults priority to medium', async () => {
    const chain = makeChain({ data: { id: 't2', title: 'Default', priority: 'medium', due_date: null }, error: null })
    const insertSpy = vi.fn().mockReturnValue(chain)
    chain.insert = insertSpy
    queueFrom([chain])
    await executeTool('create_task', { title: 'Default' }, { userId: 'u1' })
    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({ priority: 'medium', status: 'pending' }))
  })
})

describe('executeTool — list_tasks', () => {
  it('returns rows', async () => {
    queueFrom([makeChain({ data: [{ id: 't1' }, { id: 't2' }], error: null })])
    const result = await executeTool('list_tasks', { status: 'pending', limit: 5 }, { userId: 'u1' })
    expect(result.summary).toBe('2 tasks')
    expect(result.data).toHaveLength(2)
  })

  it('returns 0 tasks on null data', async () => {
    queueFrom([makeChain({ data: null, error: null })])
    const result = await executeTool('list_tasks', {}, { userId: 'u1' })
    expect(result.summary).toBe('0 tasks')
  })

  it('returns error summary on DB failure', async () => {
    queueFrom([makeChain({ data: null, error: { message: 'bad' } })])
    const result = await executeTool('list_tasks', {}, { userId: 'u1' })
    expect(result.summary).toContain('Failed to list tasks: bad')
  })
})

describe('executeTool — complete_task', () => {
  it('marks task completed', async () => {
    queueFrom([makeChain({ data: { id: 't1', title: 'Finish PR' }, error: null })])
    const result = await executeTool('complete_task', { task_id: 't1' }, { userId: 'u1' })
    expect(result.summary).toBe('Completed · Finish PR')
    expect(result.data).toMatchObject({ id: 't1' })
  })

  it('returns failure summary on error', async () => {
    queueFrom([makeChain({ data: null, error: { message: 'not found' } })])
    const result = await executeTool('complete_task', { task_id: 'missing' }, { userId: 'u1' })
    expect(result.summary).toContain('Failed: not found')
  })
})

describe('executeTool — list_habits', () => {
  it('returns empty list when no habits', async () => {
    queueFrom([makeChain({ data: [], error: null })])
    const result = await executeTool('list_habits', {}, { userId: 'u1' })
    expect(result.summary).toBe('No habits yet')
    expect(result.data).toEqual([])
  })

  it('returns error from habits table', async () => {
    queueFrom([makeChain({ data: null, error: { message: 'boom' } })])
    const result = await executeTool('list_habits', {}, { userId: 'u1' })
    expect(result.summary).toContain('Failed: boom')
  })

  it('enriches with logged_today flags', async () => {
    queueFrom([
      makeChain({ data: [{ id: 'h1', name: 'Read', frequency: 'daily', color: '#fff' }, { id: 'h2', name: 'Walk', frequency: 'daily', color: '#000' }], error: null }),
      makeChain({ data: [{ habit_id: 'h1' }], error: null }),
    ])
    const result = await executeTool('list_habits', {}, { userId: 'u1' })
    expect(result.summary).toBe('2 habits')
    const rows = result.data as any[]
    expect(rows.find((r) => r.habit_id === 'h1').logged_today).toBe(true)
    expect(rows.find((r) => r.habit_id === 'h2').logged_today).toBe(false)
  })
})

describe('executeTool — log_habit', () => {
  it('requires an identifier', async () => {
    const result = await executeTool('log_habit', {}, { userId: 'u1' })
    expect(result.summary).toContain('habit_id or habit_name required')
  })

  it('resolves habit by name (not found)', async () => {
    queueFrom([makeChain({ data: null, error: null })])
    const result = await executeTool('log_habit', { habit_name: 'Meditate' }, { userId: 'u1' })
    expect(result.summary).toContain('No habit matching "Meditate"')
  })

  it('logs by habit_name (resolved)', async () => {
    queueFrom([
      makeChain({ data: { id: 'h1', name: 'Meditate' }, error: null }),
      makeChain({ data: { id: 'log1' }, error: null }),
    ])
    const result = await executeTool('log_habit', { habit_name: 'Medit', notes: 'morning' }, { userId: 'u1' })
    expect(result.summary).toBe('Logged · Meditate')
    expect(result.data).toEqual({ id: 'log1' })
  })

  it('logs by habit_id and fetches name afterward', async () => {
    queueFrom([
      makeChain({ data: { id: 'log2' }, error: null }), // upsert
      makeChain({ data: { name: 'Workout' }, error: null }), // habit name fetch
    ])
    const result = await executeTool('log_habit', { habit_id: 'h9' }, { userId: 'u1' })
    expect(result.summary).toBe('Logged · Workout')
  })

  it('falls back to "habit" when name cannot be fetched', async () => {
    queueFrom([
      makeChain({ data: { id: 'log3' }, error: null }),
      makeChain({ data: null, error: null }),
    ])
    const result = await executeTool('log_habit', { habit_id: 'h9' }, { userId: 'u1' })
    expect(result.summary).toBe('Logged · habit')
  })

  it('returns failure on upsert error', async () => {
    queueFrom([makeChain({ data: null, error: { message: 'db dead' } })])
    const result = await executeTool('log_habit', { habit_id: 'h1' }, { userId: 'u1' })
    expect(result.summary).toContain('Failed: db dead')
  })
})

describe('executeTool — save_memory', () => {
  it('requires title and content', async () => {
    const a = await executeTool('save_memory', { title: '', content: 'x' }, { userId: 'u1' })
    expect(a.summary).toBe('title and content required')
    const b = await executeTool('save_memory', { title: 'x' }, { userId: 'u1' })
    expect(b.summary).toBe('title and content required')
  })

  it('saves a memory with default category', async () => {
    mocks.saveMemory.mockResolvedValue({ status: 'saved', memory: { id: 'm1', title: 't' } })
    const result = await executeTool(
      'save_memory',
      { title: 'hello', content: 'world' },
      { userId: 'u1' }
    )
    expect(mocks.saveMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        spaceSlug: 'personal',
        title: 'hello',
        content: 'world',
        category: 'note',
        tags: [],
        force: true,
      })
    )
    expect(result.summary).toBe('Remembered · hello')
    expect(result.data).toEqual({ id: 'm1', title: 't' })
  })

  it('accepts a valid category and tags', async () => {
    mocks.saveMemory.mockResolvedValue({ status: 'saved', memory: { id: 'm2' } })
    await executeTool(
      'save_memory',
      { title: 't', content: 'c', category: 'rule', tags: ['a', 'b'] },
      { userId: 'u1' }
    )
    const args = mocks.saveMemory.mock.calls[0][0]
    expect(args.category).toBe('rule')
    expect(args.tags).toEqual(['a', 'b'])
  })

  it('falls back to note for invalid category', async () => {
    mocks.saveMemory.mockResolvedValue({ status: 'saved', memory: { id: 'm3' } })
    await executeTool(
      'save_memory',
      { title: 't', content: 'c', category: 'not-a-cat' },
      { userId: 'u1' }
    )
    expect(mocks.saveMemory.mock.calls[0][0].category).toBe('note')
  })

  it('ignores non-array tags', async () => {
    mocks.saveMemory.mockResolvedValue({ status: 'saved', memory: { id: 'm4' } })
    await executeTool(
      'save_memory',
      { title: 't', content: 'c', tags: 'not-array' },
      { userId: 'u1' }
    )
    expect(mocks.saveMemory.mock.calls[0][0].tags).toEqual([])
  })

  it('reports duplicate on non-saved result', async () => {
    const dupPayload = { status: 'duplicates_found', similar_memories: [] }
    mocks.saveMemory.mockResolvedValue(dupPayload)
    const result = await executeTool(
      'save_memory',
      { title: 't', content: 'c' },
      { userId: 'u1' }
    )
    expect(result.summary).toContain('Similar memory exists')
    expect(result.data).toEqual(dupPayload)
  })
})

describe('executeTool — search_memory', () => {
  it('requires a query', async () => {
    const result = await executeTool('search_memory', {}, { userId: 'u1' })
    expect(result.summary).toBe('query required')
  })

  it('returns empty when no memories', async () => {
    mocks.searchMemories.mockResolvedValue([])
    const result = await executeTool('search_memory', { query: 'foo' }, { userId: 'u1' })
    expect(result.summary).toContain('No memories for "foo"')
    expect(result.data).toEqual([])
  })

  it('singular / plural handling', async () => {
    mocks.searchMemories.mockResolvedValue([
      { id: 'x', title: 't1', content: 'c1', category: 'note', tags: [], final_score: 0.8 },
    ])
    const single = await executeTool('search_memory', { query: 'thing' }, { userId: 'u1' })
    expect(single.summary).toBe('Found 1 memory')
    expect((single.data as any[])[0]).toMatchObject({ id: 'x', score: 0.8 })

    mocks.searchMemories.mockResolvedValue([
      { id: 'a', title: 'a', content: 'ac', category: 'note', tags: [], final_score: 0.7 },
      { id: 'b', title: 'b', content: 'bc', category: 'note', tags: [], final_score: 0.6 },
    ])
    const multi = await executeTool('search_memory', { query: 'thing' }, { userId: 'u1' })
    expect(multi.summary).toBe('Found 2 memories')
  })

  it('caps limit at 20', async () => {
    mocks.searchMemories.mockResolvedValue([])
    await executeTool('search_memory', { query: 'q', limit: 500 }, { userId: 'u1' })
    expect((mocks.searchMemories.mock.calls[0][0] as any).limit).toBe(20)
  })

  it('defaults limit to 5', async () => {
    mocks.searchMemories.mockResolvedValue([])
    await executeTool('search_memory', { query: 'q' }, { userId: 'u1' })
    expect((mocks.searchMemories.mock.calls[0][0] as any).limit).toBe(5)
  })
})
