/**
 * TDD: Tools should return well-formatted text that Claude can display nicely.
 *
 * Tests for:
 * 1. get_habit_streak — unicode progress bar + streak display
 * 2. list_tasks — structured task data with priority/status info
 * 3. list_transactions — structured transaction data with totals
 *
 * These tools don't need image/widget content — just better structured JSON
 * that Claude can format into markdown tables, progress bars, etc.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Common mock setup ──────────────────────────────────

const methods = ['select', 'insert', 'update', 'delete', 'eq', 'neq', 'gte', 'lte', 'order', 'limit', 'range', 'single', 'maybeSingle', 'head', 'is']

function createChain(val: unknown = { data: null, error: null }) {
  const c: Record<string, unknown> = {}
  for (const m of methods) c[m] = vi.fn().mockReturnValue(c)
  c.single = vi.fn().mockResolvedValue(val)
  c.maybeSingle = vi.fn().mockResolvedValue(val)
  c.then = (resolve: (v: unknown) => void) => { resolve(val) }
  return c
}

// ══════════════════════════════════════════════════════════
// TEST 1: get_habit_streak — formatted streak output
// ══════════════════════════════════════════════════════════

describe('get_habit_streak — formatted output', () => {
  const mockClient = { from: vi.fn() }
  const registeredTools: Record<string, { handler: Function }> = {}

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()

    vi.doMock('@/lib/supabase/service-role', () => ({
      createServiceRoleClient: vi.fn(() => mockClient),
    }))

    vi.doMock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
      McpServer: class {
        tool(name: string, _desc: string, _schema: unknown, handler: Function) {
          registeredTools[name] = { handler }
        }
      },
    }))

    const { registerHabitTools } = await import('@/lib/mcp/tools/habits')
    const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js')
    const server = new McpServer({ name: 'test', version: '0.0.0' })
    registerHabitTools(server)
  })

  it('should return streak data with all fields needed for visual display', async () => {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

    mockClient.from.mockImplementation((table: string) => {
      if (table === 'habits') {
        return createChain({ data: { name: 'Workout' }, error: null })
      }
      // habit_logs — today and yesterday logged
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const yesterdayStr = yesterday.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
      return createChain({
        data: [{ logged_date: today }, { logged_date: yesterdayStr }],
        error: null,
      })
    })

    const result = await registeredTools['get_habit_streak'].handler(
      { habit_id: 'h-1' },
      { authInfo: { extra: { userId: 'user-1' } } }
    )

    const parsed = JSON.parse(result.content[0].text)

    // Must include all fields for formatted display
    expect(parsed).toHaveProperty('habit_id')
    expect(parsed).toHaveProperty('name')
    expect(parsed).toHaveProperty('current_streak')
    expect(parsed).toHaveProperty('best_streak')
    expect(parsed).toHaveProperty('last_logged_date')
    expect(parsed).toHaveProperty('is_active_today')

    // Streak should be a positive number
    expect(typeof parsed.current_streak).toBe('number')
    expect(typeof parsed.best_streak).toBe('number')
    expect(typeof parsed.is_active_today).toBe('boolean')

    // Name should be present for display header
    expect(parsed.name).toBe('Workout')
  })
})

// ══════════════════════════════════════════════════════════
// TEST 2: list_tasks — formatted task list
// ══════════════════════════════════════════════════════════

describe('list_tasks — formatted output', () => {
  const mockClient = { from: vi.fn() }
  const registeredTools: Record<string, { handler: Function }> = {}

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()

    vi.doMock('@/lib/supabase/service-role', () => ({
      createServiceRoleClient: vi.fn(() => mockClient),
    }))

    vi.doMock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
      McpServer: class {
        tool(name: string, _desc: string, _schema: unknown, handler: Function) {
          registeredTools[name] = { handler }
        }
      },
    }))

    const { registerTaskTools } = await import('@/lib/mcp/tools/tasks')
    const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js')
    const server = new McpServer({ name: 'test', version: '0.0.0' })
    registerTaskTools(server)
  })

  it('should return tasks with all fields needed for table display', async () => {
    mockClient.from.mockReturnValue(createChain({
      data: [
        {
          id: 't-1', title: 'Ship MCP v2', description: 'Final release',
          status: 'in_progress', priority: 'high',
          due_date: '2026-04-20', tags: ['dev', 'release'],
          created_at: '2026-04-10T10:00:00Z', completed_at: null,
        },
        {
          id: 't-2', title: 'Write tests', description: null,
          status: 'completed', priority: 'medium',
          due_date: null, tags: ['testing'],
          created_at: '2026-04-08T10:00:00Z', completed_at: '2026-04-15T14:00:00Z',
        },
      ],
      count: 2,
      error: null,
    }))

    const result = await registeredTools['list_tasks'].handler(
      { limit: 50, offset: 0 },
      { authInfo: { extra: { userId: 'user-1' } } }
    )

    const parsed = JSON.parse(result.content[0].text)

    expect(parsed.tasks).toHaveLength(2)
    expect(parsed.total).toBe(2)
    expect(parsed.returned).toBe(2)

    // Each task has fields for markdown table rendering
    const task = parsed.tasks[0]
    expect(task).toHaveProperty('task_id')
    expect(task).toHaveProperty('title')
    expect(task).toHaveProperty('status')
    expect(task).toHaveProperty('priority')
    expect(task).toHaveProperty('due_date')
    expect(task).toHaveProperty('tags')
    expect(task).toHaveProperty('created_at')

    // Priority is one of low/medium/high (for color coding)
    expect(['low', 'medium', 'high']).toContain(task.priority)

    // Status is one of pending/in_progress/completed
    expect(['pending', 'in_progress', 'completed']).toContain(task.status)
  })

  it('should include completed_at for completed tasks', async () => {
    mockClient.from.mockReturnValue(createChain({
      data: [{
        id: 't-2', title: 'Done task', description: null,
        status: 'completed', priority: 'low',
        due_date: null, tags: [],
        created_at: '2026-04-08T10:00:00Z', completed_at: '2026-04-15T14:00:00Z',
      }],
      count: 1,
      error: null,
    }))

    const result = await registeredTools['list_tasks'].handler(
      { status: 'completed', limit: 50, offset: 0 },
      { authInfo: { extra: { userId: 'user-1' } } }
    )

    const parsed = JSON.parse(result.content[0].text)
    expect(parsed.tasks[0].completed_at).toBeDefined()
    expect(parsed.tasks[0].completed_at).not.toBeNull()
  })
})

// ══════════════════════════════════════════════════════════
// TEST 3: list_transactions — formatted transaction list
// ══════════════════════════════════════════════════════════

describe('list_transactions — formatted output', () => {
  const registeredTools: Record<string, { handler: Function }> = {}

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()

    vi.doMock('@/lib/supabase/service-role', () => ({
      createServiceRoleClient: vi.fn(() => ({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          ilike: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'cat-1' } }),
        }),
      })),
    }))

    vi.doMock('@/lib/finance/transactions', () => ({
      createTransaction: vi.fn(),
      listTransactions: vi.fn().mockResolvedValue({
        transactions: [
          {
            id: 'tx-1', amount: 299, merchant: 'Swiggy',
            source_app: 'sms', note: 'lunch',
            transaction_date: '2026-04-15T12:00:00Z',
            spending_categories: { name: 'Food', icon: '🍕' },
          },
          {
            id: 'tx-2', amount: 150, merchant: 'Metro',
            source_app: 'manual', note: null,
            transaction_date: '2026-04-15T08:00:00Z',
            spending_categories: { name: 'Transport', icon: '🚗' },
          },
          {
            id: 'tx-3', amount: 1500, merchant: null,
            source_app: 'sms', note: 'UPI',
            transaction_date: '2026-04-14T20:00:00Z',
            spending_categories: null,
          },
        ],
        total: 3,
      }),
      getSpendingSummary: vi.fn(),
      updateTransaction: vi.fn(),
      deleteTransaction: vi.fn(),
    }))

    vi.doMock('@/lib/finance/categories', () => ({
      ensurePresetCategories: vi.fn(),
    }))

    vi.doMock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
      McpServer: class {
        tool(name: string, _desc: string, _schema: unknown, handler: Function) {
          registeredTools[name] = { handler }
        }
      },
    }))

    const { registerFinanceTools } = await import('@/lib/mcp/tools/finance')
    const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js')
    const server = new McpServer({ name: 'test', version: '0.0.0' })
    registerFinanceTools(server)
  })

  it('should return transactions with all fields for table display', async () => {
    const result = await registeredTools['list_transactions'].handler(
      { limit: 20 },
      { authInfo: { extra: { userId: 'user-1' } } }
    )

    const parsed = JSON.parse(result.content[0].text)

    expect(parsed.transactions).toHaveLength(3)
    expect(parsed.total).toBe(3)

    // Each transaction has fields for table rendering
    const tx = parsed.transactions[0]
    expect(tx).toHaveProperty('transaction_id')
    expect(tx).toHaveProperty('amount')
    expect(tx).toHaveProperty('merchant')
    expect(tx).toHaveProperty('category')
    expect(tx).toHaveProperty('icon')
    expect(tx).toHaveProperty('date')
    expect(typeof tx.amount).toBe('number')
  })

  it('should show correct category from FK join (object shape)', async () => {
    const result = await registeredTools['list_transactions'].handler(
      { limit: 20 },
      { authInfo: { extra: { userId: 'user-1' } } }
    )

    const parsed = JSON.parse(result.content[0].text)

    // First tx has Food category (FK join returns object, not array)
    expect(parsed.transactions[0].category).toBe('Food')
    expect(parsed.transactions[0].icon).toBe('🍕')

    // Second tx has Transport
    expect(parsed.transactions[1].category).toBe('Transport')

    // Third tx is uncategorized
    expect(parsed.transactions[2].category).toBe('Uncategorized')
    expect(parsed.transactions[2].icon).toBe('❓')
  })

  it('should include total count for pagination info', async () => {
    const result = await registeredTools['list_transactions'].handler(
      { limit: 20 },
      { authInfo: { extra: { userId: 'user-1' } } }
    )

    const parsed = JSON.parse(result.content[0].text)
    expect(parsed.total).toBe(3)
    expect(parsed.returned).toBe(3)
  })
})
