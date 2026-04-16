import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/goals/goals', () => ({
  listGoals: vi.fn(),
  computeGoalProgress: vi.fn(),
}))

const mockClient = { from: vi.fn(), rpc: vi.fn() }

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => mockClient),
}))

import { generateReview } from '@/lib/goals/review'
import { listGoals, computeGoalProgress } from '@/lib/goals/goals'

function createChain(result: unknown = { data: [], count: 0, error: null }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {}
  const methods = ['select', 'insert', 'update', 'delete', 'eq', 'neq', 'gte', 'lte', 'lt', 'order', 'limit']
  for (const method of methods) chain[method] = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn().mockResolvedValue(result)
  chain.maybeSingle = vi.fn().mockResolvedValue(result)
  ;(chain as Record<string, unknown>).then = (resolve: (value: unknown) => void) => resolve(result)
  return chain
}

function setupReviewMock(options: {
  habits?: Array<{ id: string; name: string }>
  habitLogs?: Record<string, Array<{ logged_date: string }>>
  taskCounts?: number[]
  spendingData?: Array<{
    category_name: string
    category_icon: string
    total_amount: number
    transaction_count: number
  }>
  biggestSpend?: { amount: number; merchant: string | null; transaction_date: string } | null
} = {}) {
  const habits = options.habits ?? []
  const habitLogs = options.habitLogs ?? {}
  const taskCounts = options.taskCounts ?? [0, 0, 0, 0]
  let taskCall = 0

  mockClient.from.mockImplementation((table: string) => {
    if (table === 'habits') return createChain({ data: habits, error: null })

    if (table === 'habit_logs') {
      const chain = createChain({ data: [], error: null })
      chain.eq = vi.fn((column: string, value: string) => {
        if (column === 'habit_id') {
          ;(chain as Record<string, unknown>).then = (resolve: (result: unknown) => void) => {
            resolve({ data: habitLogs[value] ?? [], error: null })
          }
        }
        return chain
      })
      return chain
    }

    if (table === 'tasks') {
      const count = taskCounts[taskCall++] ?? 0
      return createChain({ data: [], count, error: null })
    }

    if (table === 'transactions') {
      return createChain({ data: options.biggestSpend ?? null, error: null })
    }

    return createChain()
  })

  mockClient.rpc.mockResolvedValue({ data: options.spendingData ?? [], error: null })
}

describe('generateReview - full coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupReviewMock()
    ;(listGoals as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(computeGoalProgress as ReturnType<typeof vi.fn>).mockResolvedValue({
      currentValue: 0,
      targetValue: 0,
      progressPct: 0,
    })
  })

  it('calculates habit streaks and average completion percentage', async () => {
    setupReviewMock({
      habits: [
        { id: 'h-1', name: 'Workout' },
        { id: 'h-2', name: 'Read' },
      ],
      habitLogs: {
        'h-1': [
          { logged_date: '2025-01-07' },
          { logged_date: '2025-01-06' },
          { logged_date: '2025-01-05' },
        ],
        'h-2': [
          { logged_date: '2025-01-07' },
          { logged_date: '2025-01-04' },
        ],
      },
    })

    const review = await generateReview('user-1', '2025-01-01', '2025-01-07', 'Week 1')

    expect(review.habits.total_tracked).toBe(2)
    expect(review.habits.streaks).toEqual([
      { name: 'Workout', current_streak: 3, completion_pct: 42.9 },
      { name: 'Read', current_streak: 1, completion_pct: 28.6 },
    ])
    expect(review.habits.avg_completion_pct).toBe(35.8)
  })

  it('populates best and worst habit highlights', async () => {
    setupReviewMock({
      habits: [
        { id: 'h-1', name: 'Meditate' },
        { id: 'h-2', name: 'Journal' },
      ],
      habitLogs: {
        'h-1': [
          { logged_date: '2025-01-07' },
          { logged_date: '2025-01-06' },
          { logged_date: '2025-01-05' },
          { logged_date: '2025-01-04' },
        ],
        'h-2': [{ logged_date: '2025-01-07' }],
      },
    })

    const review = await generateReview('user-1', '2025-01-01', '2025-01-07', 'Week 1')

    expect(review.highlights.best_habit).toEqual({ name: 'Meditate', streak: 4 })
    expect(review.highlights.worst_habit).toEqual({ name: 'Journal', completion_pct: 14.3 })
  })

  it('summarizes finance data and biggest spend highlights', async () => {
    const transactionDate = '2025-01-05T12:00:00+05:30'
    setupReviewMock({
      spendingData: [
        { category_name: 'Food', category_icon: 'food', total_amount: 2500, transaction_count: 4 },
        { category_name: 'Travel', category_icon: 'train', total_amount: 1200, transaction_count: 2 },
      ],
      biggestSpend: {
        amount: 1800,
        merchant: 'Cafe',
        transaction_date: transactionDate,
      },
    })

    const review = await generateReview('user-1', '2025-01-01', '2025-01-31', 'January')

    expect(review.finance.total_spent).toBe(3700)
    expect(review.finance.breakdown).toEqual([
      { category: 'Food', icon: 'food', amount: 2500, count: 4 },
      { category: 'Travel', icon: 'train', amount: 1200, count: 2 },
    ])
    expect(review.highlights.top_spending_category).toEqual({
      name: 'Food',
      icon: 'food',
      amount: 2500,
    })
    expect(review.highlights.biggest_single_spend).toEqual({
      amount: 1800,
      merchant: 'Cafe',
      date: new Date(transactionDate).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }),
    })
  })

  it('filters period goals, computes progress, and sets goal highlights', async () => {
    ;(listGoals as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'g-1',
        title: 'Ship project',
        goal_type: 'outcome',
        status: 'active',
        start_date: '2025-01-01',
        end_date: '2025-01-31',
        target_value: 10,
      },
      {
        id: 'g-2',
        title: 'Complete checklist',
        goal_type: 'milestone',
        status: 'completed',
        start_date: '2024-12-20',
        end_date: '2025-01-10',
        target_value: null,
      },
      {
        id: 'g-3',
        title: 'Stay under budget',
        goal_type: 'outcome',
        status: 'failed',
        start_date: '2025-01-15',
        end_date: '2025-02-15',
        target_value: 5000,
      },
      {
        id: 'g-outside',
        title: 'Ignored',
        goal_type: 'outcome',
        status: 'active',
        start_date: '2025-02-01',
        end_date: '2025-02-28',
        target_value: 1,
      },
    ])
    ;(computeGoalProgress as ReturnType<typeof vi.fn>).mockImplementation((_userId: string, goalId: string) => {
      const progress: Record<string, { currentValue: number; progressPct: number }> = {
        'g-1': { currentValue: 10, progressPct: 100 },
        'g-2': { currentValue: 4, progressPct: 80 },
        'g-3': { currentValue: 6500, progressPct: 0 },
      }
      return Promise.resolve(progress[goalId])
    })

    const review = await generateReview('user-1', '2025-01-01', '2025-01-31', 'January')

    expect(review.goals.active).toBe(1)
    expect(review.goals.completed).toBe(1)
    expect(review.goals.failed).toBe(1)
    expect(review.goals.details).toEqual([
      {
        title: 'Ship project',
        goal_type: 'outcome',
        progress_pct: 100,
        status: 'active',
        current_value: 10,
        target_value: 10,
      },
      {
        title: 'Complete checklist',
        goal_type: 'milestone',
        progress_pct: 80,
        status: 'completed',
        current_value: 4,
        target_value: null,
      },
      {
        title: 'Stay under budget',
        goal_type: 'outcome',
        progress_pct: 0,
        status: 'failed',
        current_value: 6500,
        target_value: 5000,
      },
    ])
    expect(review.highlights.goals_hit).toBe(2)
    expect(review.highlights.goals_missed).toBe(1)
    expect(computeGoalProgress).toHaveBeenCalledTimes(3)
  })
})
