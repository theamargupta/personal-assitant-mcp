import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type QueryResult = {
  data?: any
  error?: { message: string } | null
  count?: number | null
}

type QueryChain = Record<string, ReturnType<typeof vi.fn>> & {
  then: (resolve: (value: QueryResult) => unknown, reject?: (reason: unknown) => unknown) => Promise<unknown>
}

const mocks = vi.hoisted(() => {
  const state = {
    habits: [] as Array<{ id: string; name: string }>,
    habitLogs: {} as Record<string, Array<{ logged_date: string }>>,
    taskCounts: [0, 0, 0, 0] as number[],
    taskCall: 0,
    spendingData: [] as Array<{
      category_name: string
      category_icon: string
      total_amount: number
      transaction_count: number
    }>,
    biggestSpend: null as { amount: number; merchant: string | null; transaction_date: string } | null,
    goals: [] as any[],
    progress: {} as Record<string, { currentValue: number; targetValue: number; progressPct: number }>,
  }

  return {
    state,
    mockClient: { from: vi.fn(), rpc: vi.fn() },
    listGoals: vi.fn(async () => state.goals),
    computeGoalProgress: vi.fn(async (_userId: string, goalId: string) => state.progress[goalId] ?? {
      currentValue: 0,
      targetValue: 0,
      progressPct: 0,
    }),
    createGoal: vi.fn(),
    updateGoal: vi.fn(),
    addMilestone: vi.fn(),
    toggleMilestone: vi.fn(),
    registeredTools: {} as Record<string, { handler: (...args: unknown[]) => unknown }>,
  }
})

vi.mock('@/lib/goals/goals', () => ({
  createGoal: mocks.createGoal,
  listGoals: mocks.listGoals,
  updateGoal: mocks.updateGoal,
  addMilestone: mocks.addMilestone,
  toggleMilestone: mocks.toggleMilestone,
  computeGoalProgress: mocks.computeGoalProgress,
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => mocks.mockClient),
}))

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: class {
    tool(name: string, _desc: string, _schema: unknown, handler: (...args: unknown[]) => unknown) {
      mocks.registeredTools[name] = { handler }
    }
  },
}))

import { registerGoalTools } from '@/lib/mcp/tools/goals'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

const server = new McpServer({ name: 'test', version: '0.0.0' })
registerGoalTools(server)

const authInfo = { extra: { userId: 'user-1' } }
const noAuth = { extra: {} }
const methods = ['select', 'insert', 'update', 'delete', 'eq', 'neq', 'lt', 'gte', 'lte', 'order', 'limit', 'range', 'single', 'maybeSingle']

function createQuery(result: QueryResult = { data: [], count: 0, error: null }): QueryChain {
  const chain = {} as QueryChain
  for (const method of methods) chain[method] = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn().mockResolvedValue(result)
  chain.maybeSingle = vi.fn().mockResolvedValue(result)
  chain.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject)
  return chain
}

function setupReviewMock() {
  mocks.state.taskCall = 0
  mocks.mockClient.rpc.mockResolvedValue({ data: mocks.state.spendingData, error: null })
  mocks.mockClient.from.mockImplementation((table: string) => {
    if (table === 'habits') return createQuery({ data: mocks.state.habits, error: null })

    if (table === 'habit_logs') {
      const chain = createQuery({ data: [], error: null })
      chain.eq = vi.fn((column: string, value: string) => {
        if (column === 'habit_id') {
          chain.then = (resolve, reject) => Promise.resolve({
            data: mocks.state.habitLogs[value] ?? [],
            error: null,
          }).then(resolve, reject)
        }
        return chain
      })
      return chain
    }

    if (table === 'tasks') {
      return createQuery({ data: [], count: mocks.state.taskCounts[mocks.state.taskCall++] ?? 0, error: null })
    }

    if (table === 'transactions') {
      return createQuery({ data: mocks.state.biggestSpend, error: null })
    }

    return createQuery()
  })
}

function resetState() {
  mocks.state.habits = []
  mocks.state.habitLogs = {}
  mocks.state.taskCounts = [0, 0, 0, 0]
  mocks.state.taskCall = 0
  mocks.state.spendingData = []
  mocks.state.biggestSpend = null
  mocks.state.goals = []
  mocks.state.progress = {}
}

function parseToolResult(result: { content: Array<{ text: string }> }) {
  return JSON.parse(result.content[0].text)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-04-16T06:30:00.000Z'))
  resetState()
  setupReviewMock()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('get_review aggregation', () => {
  it('throws when unauthorized', async () => {
    await expect(mocks.registeredTools['get_review'].handler(
      { period: 'custom', start_date: '2026-04-01', end_date: '2026-04-16' },
      { authInfo: noAuth }
    )).rejects.toThrow('Unauthorized')
  })

  it('aggregates all modules', async () => {
    mocks.state.habits = [
      { id: 'h-1', name: 'Workout' },
      { id: 'h-2', name: 'Read' },
    ]
    mocks.state.habitLogs = {
      'h-1': [{ logged_date: '2026-04-16' }, { logged_date: '2026-04-15' }],
      'h-2': [{ logged_date: '2026-04-14' }],
    }
    mocks.state.taskCounts = [5, 3, 1, 8]
    mocks.state.spendingData = [
      { category_name: 'Food', category_icon: '🍕', total_amount: 2500, transaction_count: 5 },
      { category_name: 'Transport', category_icon: '🚗', total_amount: 700, transaction_count: 2 },
    ]
    mocks.state.biggestSpend = {
      amount: 1800,
      merchant: 'Cafe',
      transaction_date: '2026-04-12T10:00:00+05:30',
    }
    mocks.state.goals = [
      { id: 'g-1', title: 'Ship project', goal_type: 'outcome', status: 'active', start_date: '2026-04-01', end_date: '2026-04-30', target_value: 10 },
      { id: 'g-2', title: 'Checklist', goal_type: 'milestone', status: 'completed', start_date: '2026-04-01', end_date: '2026-04-10', target_value: null },
    ]
    mocks.state.progress = {
      'g-1': { currentValue: 7, targetValue: 10, progressPct: 70 },
      'g-2': { currentValue: 4, targetValue: 4, progressPct: 100 },
    }
    setupReviewMock()

    const result = await mocks.registeredTools['get_review'].handler(
      { period: 'custom', start_date: '2026-04-01', end_date: '2026-04-16' },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(parsed.period).toEqual({ start: '2026-04-01', end: '2026-04-16', label: '2026-04-01 to 2026-04-16' })
    expect(parsed.habits.total_tracked).toBe(2)
    expect(parsed.habits.avg_completion_pct).toBe(9.4)
    expect(parsed.tasks).toEqual({ completed: 5, pending: 3, overdue: 1, total_created: 8 })
    expect(parsed.finance.total_spent).toBe(3200)
    expect(parsed.finance.breakdown).toEqual([
      { category: 'Food', icon: '🍕', amount: 2500, count: 5 },
      { category: 'Transport', icon: '🚗', amount: 700, count: 2 },
    ])
    expect(parsed.goals.active).toBe(1)
    expect(parsed.goals.completed).toBe(1)
    expect(parsed.highlights.top_spending_category).toEqual({ name: 'Food', icon: '🍕', amount: 2500 })
    expect(parsed.highlights.biggest_single_spend.merchant).toBe('Cafe')
  })

  it('handles empty modules with zero values', async () => {
    setupReviewMock()

    const result = await mocks.registeredTools['get_review'].handler(
      { period: 'custom', start_date: '2026-04-01', end_date: '2026-04-16' },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(parsed.habits).toEqual({ total_tracked: 0, avg_completion_pct: 0, streaks: [] })
    expect(parsed.tasks).toEqual({ completed: 0, pending: 0, overdue: 0, total_created: 0 })
    expect(parsed.finance).toEqual({ total_spent: 0, breakdown: [] })
    expect(parsed.goals).toEqual({ active: 0, completed: 0, failed: 0, details: [] })
    expect(parsed.highlights.top_spending_category).toBeNull()
    expect(parsed.highlights.tasks_pending).toBe(0)
  })

  it('date range uses IST boundaries for this_month', async () => {
    vi.setSystemTime(new Date('2026-03-31T19:00:00.000Z'))
    setupReviewMock()

    const result = await mocks.registeredTools['get_review'].handler(
      { period: 'this_month' },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(parsed.period.start).toBe('2026-04-01')
    expect(parsed.period.end).toBe('2026-04-01')
    expect(mocks.mockClient.rpc).toHaveBeenCalledWith('get_spending_summary', {
      target_user_id: 'user-1',
      start_date: '2026-04-01T00:00:00+05:30',
      end_date: '2026-04-01T23:59:59+05:30',
    })
  })
})
