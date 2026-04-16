import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabaseClient } from '../setup'

const mockClient = createMockSupabaseClient()

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => mockClient),
}))

import { createGoal, listGoals, updateGoal, addMilestone, toggleMilestone, computeGoalProgress } from '@/lib/goals/goals'

function createProgressChain(result: { data?: any; error?: { message: string } | null; count?: number | null }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {}
  const methods = ['select', 'insert', 'update', 'delete', 'eq', 'gte', 'lte', 'order', 'limit', 'range', 'single', 'maybeSingle', 'head', 'is']
  for (const method of methods) chain[method] = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn().mockResolvedValue(result)
  chain.maybeSingle = vi.fn().mockResolvedValue(result)
  ;(chain as Record<string, unknown>).then = (
    resolve: (value: typeof result) => unknown,
    reject?: (reason: unknown) => unknown
  ) => Promise.resolve(result).then(resolve, reject)
  return chain
}

function createGoalLookup(overrides: Record<string, unknown>) {
  return createProgressChain({
    data: {
      id: 'g-1',
      goal_type: 'outcome',
      metric_type: 'tasks_completed',
      metric_ref_id: null,
      target_value: 10,
      start_date: '2026-04-01',
      end_date: '2026-04-30',
      ...overrides,
    },
    error: null,
  })
}

describe('createGoal', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('inserts a goal and returns data', async () => {
    const goal = { id: 'g-1', title: 'Test Goal', goal_type: 'outcome', status: 'active', start_date: '2025-01-01', end_date: '2025-12-31', created_at: '2025-01-01' }
    const chain: Record<string, ReturnType<typeof vi.fn>> = {}
    chain.insert = vi.fn().mockReturnValue(chain)
    chain.select = vi.fn().mockReturnValue(chain)
    chain.single = vi.fn().mockResolvedValue({ data: goal, error: null })
    mockClient.from.mockReturnValue(chain)

    const result = await createGoal({
      userId: 'user-1',
      title: ' Test Goal ',
      goalType: 'outcome',
      startDate: '2025-01-01',
      endDate: '2025-12-31',
    })
    expect(result).toEqual(goal)
    expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Test Goal',
      status: 'active',
    }))
  })

  it('throws on error', async () => {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {}
    chain.insert = vi.fn().mockReturnValue(chain)
    chain.select = vi.fn().mockReturnValue(chain)
    chain.single = vi.fn().mockResolvedValue({ data: null, error: { message: 'Insert failed' } })
    mockClient.from.mockReturnValue(chain)

    await expect(createGoal({
      userId: 'u', title: 't', goalType: 'outcome', startDate: '2025-01-01', endDate: '2025-12-31'
    })).rejects.toThrow('Insert failed')
  })
})

describe('listGoals', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns all goals for user', async () => {
    const goals = [{ id: 'g-1', title: 'Goal 1' }, { id: 'g-2', title: 'Goal 2' }]
    const chain: Record<string, ReturnType<typeof vi.fn>> = {}
    chain.select = vi.fn().mockReturnValue(chain)
    chain.eq = vi.fn().mockReturnValue(chain)
    chain.order = vi.fn().mockResolvedValue({ data: goals, error: null })
    mockClient.from.mockReturnValue(chain)

    const result = await listGoals('user-1')
    expect(result).toEqual(goals)
  })

  it('applies status filter', async () => {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {}
    chain.select = vi.fn().mockReturnValue(chain)
    chain.eq = vi.fn().mockReturnValue(chain)
    chain.order = vi.fn().mockResolvedValue({ data: [], error: null })
    mockClient.from.mockReturnValue(chain)

    await listGoals('user-1', 'active')
    // eq called for user_id and status
    expect(chain.eq).toHaveBeenCalledTimes(2)
  })

  it('applies goal type filter', async () => {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {}
    chain.select = vi.fn().mockReturnValue(chain)
    chain.eq = vi.fn().mockReturnValue(chain)
    chain.order = vi.fn().mockResolvedValue({ data: [], error: null })
    mockClient.from.mockReturnValue(chain)

    await listGoals('user-1', undefined, 'milestone')
    expect(chain.eq).toHaveBeenCalledTimes(2)
  })

  it('returns empty array on null data', async () => {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {}
    chain.select = vi.fn().mockReturnValue(chain)
    chain.eq = vi.fn().mockReturnValue(chain)
    chain.order = vi.fn().mockResolvedValue({ data: null, error: null })
    mockClient.from.mockReturnValue(chain)

    const result = await listGoals('user-1')
    expect(result).toEqual([])
  })
})

describe('updateGoal', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('updates and returns goal', async () => {
    const updated = { id: 'g-1', title: 'Updated', status: 'active', updated_at: '2025-01-02' }
    const chain: Record<string, ReturnType<typeof vi.fn>> = {}
    chain.update = vi.fn().mockReturnValue(chain)
    chain.eq = vi.fn().mockReturnValue(chain)
    chain.select = vi.fn().mockReturnValue(chain)
    chain.single = vi.fn().mockResolvedValue({ data: updated, error: null })
    mockClient.from.mockReturnValue(chain)

    const result = await updateGoal('user-1', 'g-1', { title: ' Updated ' })
    expect(result).toEqual(updated)
  })

  it('throws when goal not found', async () => {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {}
    chain.update = vi.fn().mockReturnValue(chain)
    chain.eq = vi.fn().mockReturnValue(chain)
    chain.select = vi.fn().mockReturnValue(chain)
    chain.single = vi.fn().mockResolvedValue({ data: null, error: null })
    mockClient.from.mockReturnValue(chain)

    await expect(updateGoal('user-1', 'g-bad', {})).rejects.toThrow('Goal not found')
  })
})

describe('addMilestone', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('throws when goal not found', async () => {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {}
    chain.select = vi.fn().mockReturnValue(chain)
    chain.eq = vi.fn().mockReturnValue(chain)
    chain.single = vi.fn().mockResolvedValue({ data: null })
    mockClient.from.mockReturnValue(chain)

    await expect(addMilestone('user-1', 'g-bad', 'Step 1', 0)).rejects.toThrow('Goal not found')
  })

  it('throws when goal is not milestone type', async () => {
    const goalChain: Record<string, ReturnType<typeof vi.fn>> = {}
    goalChain.select = vi.fn().mockReturnValue(goalChain)
    goalChain.eq = vi.fn().mockReturnValue(goalChain)
    goalChain.single = vi.fn().mockResolvedValue({ data: { id: 'g-1', goal_type: 'outcome' } })
    mockClient.from.mockReturnValue(goalChain)

    await expect(addMilestone('user-1', 'g-1', 'Step 1', 0))
      .rejects.toThrow('Can only add milestones to milestone-type goals')
  })
})

describe('toggleMilestone', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('throws when milestone not found', async () => {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {}
    chain.select = vi.fn().mockReturnValue(chain)
    chain.eq = vi.fn().mockReturnValue(chain)
    chain.single = vi.fn().mockResolvedValue({ data: null })
    mockClient.from.mockReturnValue(chain)

    await expect(toggleMilestone('user-1', 'ms-bad')).rejects.toThrow('Milestone not found')
  })
})

describe('computeGoalProgress', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('throws when goal not found', async () => {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {}
    chain.select = vi.fn().mockReturnValue(chain)
    chain.eq = vi.fn().mockReturnValue(chain)
    chain.single = vi.fn().mockResolvedValue({ data: null })
    mockClient.from.mockReturnValue(chain)

    await expect(computeGoalProgress('user-1', 'g-bad')).rejects.toThrow('Goal not found')
  })

  it('computes milestone progress correctly', async () => {
    let callCount = 0
    mockClient.from.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        // Goal lookup
        const chain: Record<string, ReturnType<typeof vi.fn>> = {}
        chain.select = vi.fn().mockReturnValue(chain)
        chain.eq = vi.fn().mockReturnValue(chain)
        chain.single = vi.fn().mockResolvedValue({
          data: { id: 'g-1', goal_type: 'milestone', user_id: 'user-1' }
        })
        return chain
      }
      // Milestones lookup
      const chain: Record<string, ReturnType<typeof vi.fn>> = {}
      chain.select = vi.fn().mockReturnValue(chain)
      chain.eq = vi.fn().mockResolvedValue({
        data: [
          { completed: true },
          { completed: true },
          { completed: false },
          { completed: false },
        ]
      })
      return chain
    })

    const result = await computeGoalProgress('user-1', 'g-1')
    expect(result.currentValue).toBe(2)
    expect(result.targetValue).toBe(4)
    expect(result.progressPct).toBe(50)
  })

  it('computes milestone progress as 2 of 5 completed milestones', async () => {
    const goalLookup = createGoalLookup({ goal_type: 'milestone' })
    const milestones = createProgressChain({
      data: [
        { completed: true },
        { completed: true },
        { completed: false },
        { completed: false },
        { completed: false },
      ],
      error: null,
    })
    let call = 0
    mockClient.from.mockImplementation(() => {
      call++
      return call === 1 ? goalLookup : milestones
    })

    const result = await computeGoalProgress('user-1', 'g-1')

    expect(result).toEqual({ currentValue: 2, targetValue: 5, progressPct: 40 })
  })

  it('returns zero progress for milestone goals with no milestones', async () => {
    const goalLookup = createGoalLookup({ goal_type: 'milestone' })
    const milestones = createProgressChain({ data: [], error: null })
    let call = 0
    mockClient.from.mockImplementation(() => {
      call++
      return call === 1 ? goalLookup : milestones
    })

    const result = await computeGoalProgress('user-1', 'g-1')

    expect(result).toEqual({ currentValue: 0, targetValue: 0, progressPct: 0 })
  })

  it('computes outcome progress for habit streak goals', async () => {
    const goalLookup = createGoalLookup({
      metric_type: 'habit_streak',
      metric_ref_id: 'habit-1',
      target_value: 5,
    })
    const logs = createProgressChain({
      data: [
        { logged_date: '2026-04-10' },
        { logged_date: '2026-04-09' },
        { logged_date: '2026-04-08' },
      ],
      error: null,
    })
    let call = 0
    mockClient.from.mockImplementation(() => {
      call++
      return call === 1 ? goalLookup : logs
    })

    const result = await computeGoalProgress('user-1', 'g-1')

    expect(result).toEqual({ currentValue: 3, targetValue: 5, progressPct: 60 })
    expect(logs.eq).toHaveBeenCalledWith('habit_id', 'habit-1')
  })

  it('returns zero streak when habit streak logs are empty', async () => {
    const goalLookup = createGoalLookup({
      metric_type: 'habit_streak',
      metric_ref_id: 'habit-1',
      target_value: 5,
    })
    const logs = createProgressChain({ data: [], error: null })
    let call = 0
    mockClient.from.mockImplementation(() => {
      call++
      return call === 1 ? goalLookup : logs
    })

    const result = await computeGoalProgress('user-1', 'g-1')

    expect(result).toEqual({ currentValue: 0, targetValue: 5, progressPct: 0 })
  })

  it('guards habit streak goals with a null metric_ref_id', async () => {
    const goalLookup = createGoalLookup({
      metric_type: 'habit_streak',
      metric_ref_id: null,
      target_value: 5,
    })
    mockClient.from.mockReturnValue(goalLookup)

    const result = await computeGoalProgress('user-1', 'g-1')

    expect(result).toEqual({ currentValue: 0, targetValue: 5, progressPct: 0 })
    expect(mockClient.from).toHaveBeenCalledTimes(1)
  })

  it('computes outcome progress for habit completion percentage goals', async () => {
    const goalLookup = createGoalLookup({
      metric_type: 'habit_completion',
      metric_ref_id: 'habit-1',
      target_value: 100,
    })
    const logsCount = createProgressChain({ count: 15, error: null })
    let call = 0
    mockClient.from.mockImplementation(() => {
      call++
      return call === 1 ? goalLookup : logsCount
    })

    const result = await computeGoalProgress('user-1', 'g-1')

    expect(result).toEqual({ currentValue: 50, targetValue: 100, progressPct: 50 })
    expect(logsCount.eq).toHaveBeenCalledWith('habit_id', 'habit-1')
  })

  it('guards habit completion goals with a null metric_ref_id', async () => {
    const goalLookup = createGoalLookup({
      metric_type: 'habit_completion',
      metric_ref_id: null,
      target_value: 100,
    })
    mockClient.from.mockReturnValue(goalLookup)

    const result = await computeGoalProgress('user-1', 'g-1')

    expect(result).toEqual({ currentValue: 0, targetValue: 100, progressPct: 0 })
    expect(mockClient.from).toHaveBeenCalledTimes(1)
  })

  it('computes outcome progress for completed task count goals', async () => {
    const goalLookup = createGoalLookup({
      metric_type: 'tasks_completed',
      target_value: 10,
    })
    const taskCount = createProgressChain({ count: 8, error: null })
    let call = 0
    mockClient.from.mockImplementation(() => {
      call++
      return call === 1 ? goalLookup : taskCount
    })

    const result = await computeGoalProgress('user-1', 'g-1')

    expect(result).toEqual({ currentValue: 8, targetValue: 10, progressPct: 80 })
    expect(taskCount.eq).toHaveBeenCalledWith('status', 'completed')
  })

  it('treats null completed task counts as zero', async () => {
    const goalLookup = createGoalLookup({
      metric_type: 'tasks_completed',
      target_value: 10,
    })
    const taskCount = createProgressChain({ count: null, error: null })
    let call = 0
    mockClient.from.mockImplementation(() => {
      call++
      return call === 1 ? goalLookup : taskCount
    })

    const result = await computeGoalProgress('user-1', 'g-1')

    expect(result).toEqual({ currentValue: 0, targetValue: 10, progressPct: 0 })
  })

  it('caps non-spending progress at 100 percent', async () => {
    const goalLookup = createGoalLookup({
      metric_type: 'tasks_completed',
      target_value: 10,
    })
    const taskCount = createProgressChain({ count: 15, error: null })
    let call = 0
    mockClient.from.mockImplementation(() => {
      call++
      return call === 1 ? goalLookup : taskCount
    })

    const result = await computeGoalProgress('user-1', 'g-1')

    expect(result).toEqual({ currentValue: 15, targetValue: 10, progressPct: 100 })
  })

  it('computes inverse progress for spending limit goals', async () => {
    const goalLookup = createGoalLookup({
      metric_type: 'spending_limit',
      target_value: 20000,
    })
    const transactions = createProgressChain({
      data: [{ amount: 10000 }, { amount: '5000' }],
      error: null,
    })
    let call = 0
    mockClient.from.mockImplementation(() => {
      call++
      return call === 1 ? goalLookup : transactions
    })

    const result = await computeGoalProgress('user-1', 'g-1')

    expect(result).toEqual({ currentValue: 15000, targetValue: 20000, progressPct: 25 })
  })

  it('applies category filters for spending limit goals with a metric_ref_id', async () => {
    const goalLookup = createGoalLookup({
      metric_type: 'spending_limit',
      metric_ref_id: 'cat-1',
      target_value: 20000,
    })
    const transactions = createProgressChain({
      data: [{ amount: 5000 }],
      error: null,
    })
    let call = 0
    mockClient.from.mockImplementation(() => {
      call++
      return call === 1 ? goalLookup : transactions
    })

    const result = await computeGoalProgress('user-1', 'g-1')

    expect(transactions.eq).toHaveBeenCalledWith('category_id', 'cat-1')
    expect(result).toEqual({ currentValue: 5000, targetValue: 20000, progressPct: 75 })
  })

  it('returns zero progress for spending limits with a zero target', async () => {
    const goalLookup = createGoalLookup({
      metric_type: 'spending_limit',
      target_value: 0,
    })
    const transactions = createProgressChain({
      data: [{ amount: 5000 }],
      error: null,
    })
    let call = 0
    mockClient.from.mockImplementation(() => {
      call++
      return call === 1 ? goalLookup : transactions
    })

    const result = await computeGoalProgress('user-1', 'g-1')

    expect(result).toEqual({ currentValue: 5000, targetValue: 0, progressPct: 0 })
  })

  it('does not allow spending limit progress to go below zero', async () => {
    const goalLookup = createGoalLookup({
      metric_type: 'spending_limit',
      target_value: 10000,
    })
    const transactions = createProgressChain({
      data: [{ amount: 12000 }],
      error: null,
    })
    let call = 0
    mockClient.from.mockImplementation(() => {
      call++
      return call === 1 ? goalLookup : transactions
    })

    const result = await computeGoalProgress('user-1', 'g-1')

    expect(result).toEqual({ currentValue: 12000, targetValue: 10000, progressPct: 0 })
  })

  it('returns zero current value for unknown outcome metric types', async () => {
    mockClient.from.mockReturnValue(createGoalLookup({
      metric_type: 'unsupported_metric',
      target_value: 10,
    }))

    const result = await computeGoalProgress('user-1', 'g-1')

    expect(result).toEqual({ currentValue: 0, targetValue: 10, progressPct: 0 })
    expect(mockClient.from).toHaveBeenCalledTimes(1)
  })
})
