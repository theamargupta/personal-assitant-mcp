import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabaseClient } from '../setup'

const mockClient = createMockSupabaseClient()

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => mockClient),
}))

import { createGoal, listGoals, updateGoal, addMilestone, toggleMilestone, computeGoalProgress } from '@/lib/goals/goals'

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
})
