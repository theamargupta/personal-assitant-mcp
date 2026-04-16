import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockClient = { from: vi.fn() }

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => mockClient),
}))

import { addMilestone, toggleMilestone, computeGoalProgress } from '@/lib/goals/goals'

function createChain(result: unknown = { data: null, error: null, count: 0 }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {}
  const methods = ['select', 'insert', 'update', 'eq', 'gte', 'lte', 'order']
  for (const method of methods) chain[method] = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn().mockResolvedValue(result)
  ;(chain as Record<string, unknown>).then = (resolve: (value: unknown) => void) => resolve(result)
  return chain
}

describe('goal milestones success paths', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('adds a milestone to a milestone-type goal', async () => {
    const inserted = {
      id: 'ms-1',
      title: 'First step',
      sort_order: 1,
      completed: false,
      created_at: '2025-01-01T00:00:00Z',
    }
    const goalLookup = createChain({ data: { id: 'g-1', goal_type: 'milestone' }, error: null })
    const insertMilestone = createChain({ data: inserted, error: null })

    let call = 0
    mockClient.from.mockImplementation(() => {
      call++
      return call === 1 ? goalLookup : insertMilestone
    })

    const result = await addMilestone('user-1', 'g-1', ' First step ', 1)

    expect(result).toEqual(inserted)
    expect(insertMilestone.insert).toHaveBeenCalledWith({
      goal_id: 'g-1',
      user_id: 'user-1',
      title: 'First step',
      sort_order: 1,
    })
  })

  it('toggles a milestone to completed without auto-completing when others remain', async () => {
    const updated = {
      id: 'ms-1',
      title: 'First step',
      completed: true,
      completed_at: '2025-01-01T00:00:00Z',
    }
    const lookup = createChain({ data: { id: 'ms-1', completed: false, goal_id: 'g-1' }, error: null })
    const update = createChain({ data: updated, error: null })
    const remainingCount = createChain({ data: null, count: 2, error: null })

    let call = 0
    mockClient.from.mockImplementation((table: string) => {
      call++
      if (call === 1) return lookup
      if (call === 2) return update
      if (call === 3) return remainingCount
      throw new Error(`Unexpected ${table} query`)
    })

    const result = await toggleMilestone('user-1', 'ms-1')

    expect(result).toEqual(updated)
    expect(update.update).toHaveBeenCalledWith({
      completed: true,
      completed_at: expect.any(String),
    })
    expect(mockClient.from).toHaveBeenCalledTimes(3)
  })

  it('auto-completes the goal when the last milestone is toggled complete', async () => {
    const updated = {
      id: 'ms-1',
      title: 'Last step',
      completed: true,
      completed_at: '2025-01-01T00:00:00Z',
    }
    const lookup = createChain({ data: { id: 'ms-1', completed: false, goal_id: 'g-1' }, error: null })
    const update = createChain({ data: updated, error: null })
    const remainingCount = createChain({ data: null, count: 0, error: null })
    const completeGoal = createChain({ error: null })

    let call = 0
    mockClient.from.mockImplementation(() => {
      call++
      if (call === 1) return lookup
      if (call === 2) return update
      if (call === 3) return remainingCount
      return completeGoal
    })

    const result = await toggleMilestone('user-1', 'ms-1')

    expect(result).toEqual(updated)
    expect(completeGoal.update).toHaveBeenCalledWith({
      status: 'completed',
      updated_at: expect.any(String),
    })
  })

  it('toggles a completed milestone back to incomplete without checking auto-complete', async () => {
    const updated = {
      id: 'ms-1',
      title: 'First step',
      completed: false,
      completed_at: null,
    }
    const lookup = createChain({ data: { id: 'ms-1', completed: true, goal_id: 'g-1' }, error: null })
    const update = createChain({ data: updated, error: null })

    let call = 0
    mockClient.from.mockImplementation(() => {
      call++
      return call === 1 ? lookup : update
    })

    const result = await toggleMilestone('user-1', 'ms-1')

    expect(result).toEqual(updated)
    expect(update.update).toHaveBeenCalledWith({
      completed: false,
      completed_at: null,
    })
    expect(mockClient.from).toHaveBeenCalledTimes(2)
  })

  it('stops habit streak progress at the first non-consecutive log', async () => {
    const goalLookup = createChain({
      data: {
        id: 'g-1',
        goal_type: 'outcome',
        metric_type: 'habit_streak',
        metric_ref_id: 'h-1',
        target_value: 5,
        start_date: '2025-01-01',
        end_date: '2025-01-31',
      },
      error: null,
    })
    const logs = createChain({
      data: [
        { logged_date: '2025-01-10' },
        { logged_date: '2025-01-08' },
      ],
      error: null,
    })

    let call = 0
    mockClient.from.mockImplementation(() => {
      call++
      return call === 1 ? goalLookup : logs
    })

    const result = await computeGoalProgress('user-1', 'g-1')

    expect(result).toEqual({ currentValue: 1, targetValue: 5, progressPct: 20 })
  })

  it('applies a category filter when computing spending limit progress', async () => {
    const goalLookup = createChain({
      data: {
        id: 'g-1',
        goal_type: 'outcome',
        metric_type: 'spending_limit',
        metric_ref_id: 'cat-1',
        target_value: 1000,
        start_date: '2025-01-01',
        end_date: '2025-01-31',
      },
      error: null,
    })
    const transactions = createChain({
      data: [{ amount: 250 }],
      error: null,
    })

    let call = 0
    mockClient.from.mockImplementation(() => {
      call++
      return call === 1 ? goalLookup : transactions
    })

    const result = await computeGoalProgress('user-1', 'g-1')

    expect(transactions.eq).toHaveBeenCalledWith('category_id', 'cat-1')
    expect(result).toEqual({ currentValue: 250, targetValue: 1000, progressPct: 75 })
  })

  it('returns zero progress for non-spending goals with a zero target', async () => {
    const goalLookup = createChain({
      data: {
        id: 'g-1',
        goal_type: 'outcome',
        metric_type: 'tasks_completed',
        target_value: 0,
        start_date: '2025-01-01',
        end_date: '2025-01-31',
      },
      error: null,
    })
    const tasks = createChain({ count: 5, error: null })

    let call = 0
    mockClient.from.mockImplementation(() => {
      call++
      return call === 1 ? goalLookup : tasks
    })

    const result = await computeGoalProgress('user-1', 'g-1')

    expect(result).toEqual({ currentValue: 5, targetValue: 0, progressPct: 0 })
  })
})
