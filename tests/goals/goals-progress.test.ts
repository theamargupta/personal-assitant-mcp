import { describe, it, expect, vi, beforeEach } from 'vitest'

function createChain(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {}
  const methods = ['select', 'insert', 'update', 'delete', 'eq', 'neq', 'gte', 'lte', 'order', 'limit', 'range', 'single', 'maybeSingle', 'head', 'is']
  for (const m of methods) chain[m] = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn().mockResolvedValue({ data: null, error: null })
  for (const [k, v] of Object.entries(overrides)) chain[k] = v as ReturnType<typeof vi.fn>
  return chain
}

const mockClient = { from: vi.fn() }

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => mockClient),
}))

import { computeGoalProgress } from '@/lib/goals/goals'

describe('computeGoalProgress - outcome goals', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('computes habit_streak progress', async () => {
    let callNum = 0
    mockClient.from.mockImplementation(() => {
      callNum++
      if (callNum === 1) {
        // Goal lookup
        const c = createChain()
        c.single = vi.fn().mockResolvedValue({
          data: {
            id: 'g-1', goal_type: 'outcome', metric_type: 'habit_streak',
            metric_ref_id: 'h-1', target_value: 7,
            start_date: '2025-01-01', end_date: '2025-01-31',
          }
        })
        return c
      }
      // habit_logs query
      const c = createChain()
      ;(c as Record<string, unknown>)['then'] = (r: (v: unknown) => void) => r({
        data: [
          { logged_date: '2025-01-15' },
          { logged_date: '2025-01-14' },
          { logged_date: '2025-01-13' },
        ]
      })
      return c
    })

    const result = await computeGoalProgress('user-1', 'g-1')
    expect(result.targetValue).toBe(7)
    expect(result.currentValue).toBe(3)
    expect(result.progressPct).toBe(43)
  })

  it('computes tasks_completed progress', async () => {
    let callNum = 0
    mockClient.from.mockImplementation(() => {
      callNum++
      if (callNum === 1) {
        const c = createChain()
        c.single = vi.fn().mockResolvedValue({
          data: {
            id: 'g-1', goal_type: 'outcome', metric_type: 'tasks_completed',
            target_value: 20, start_date: '2025-01-01', end_date: '2025-01-31',
          }
        })
        return c
      }
      // tasks count
      const c = createChain()
      ;(c as Record<string, unknown>)['then'] = (r: (v: unknown) => void) => r({ count: 10 })
      return c
    })

    const result = await computeGoalProgress('user-1', 'g-1')
    expect(result.currentValue).toBe(10)
    expect(result.targetValue).toBe(20)
    expect(result.progressPct).toBe(50)
  })

  it('computes spending_limit progress (inverse)', async () => {
    let callNum = 0
    mockClient.from.mockImplementation(() => {
      callNum++
      if (callNum === 1) {
        const c = createChain()
        c.single = vi.fn().mockResolvedValue({
          data: {
            id: 'g-1', goal_type: 'outcome', metric_type: 'spending_limit',
            metric_ref_id: null, target_value: 10000,
            start_date: '2025-01-01', end_date: '2025-01-31',
          }
        })
        return c
      }
      // transactions query
      const c = createChain()
      ;(c as Record<string, unknown>)['then'] = (r: (v: unknown) => void) => r({
        data: [{ amount: 3000 }, { amount: 2000 }]
      })
      return c
    })

    const result = await computeGoalProgress('user-1', 'g-1')
    expect(result.currentValue).toBe(5000)
    expect(result.targetValue).toBe(10000)
    // Spending limit: (1 - 5000/10000) * 100 = 50%
    expect(result.progressPct).toBe(50)
  })

  it('computes habit_completion progress', async () => {
    let callNum = 0
    mockClient.from.mockImplementation(() => {
      callNum++
      if (callNum === 1) {
        const c = createChain()
        c.single = vi.fn().mockResolvedValue({
          data: {
            id: 'g-1', goal_type: 'outcome', metric_type: 'habit_completion',
            metric_ref_id: 'h-1', target_value: 80,
            start_date: '2025-01-01', end_date: '2025-01-31',
          }
        })
        return c
      }
      // habit_logs count
      const c = createChain()
      ;(c as Record<string, unknown>)['then'] = (r: (v: unknown) => void) => r({ count: 25 })
      return c
    })

    const result = await computeGoalProgress('user-1', 'g-1')
    expect(result.targetValue).toBe(80)
    expect(result.currentValue).toBeGreaterThan(0) // 25/31 * 100
    expect(typeof result.progressPct).toBe('number')
  })

  it('handles zero milestones', async () => {
    let callNum = 0
    mockClient.from.mockImplementation(() => {
      callNum++
      if (callNum === 1) {
        const c = createChain()
        c.single = vi.fn().mockResolvedValue({
          data: { id: 'g-1', goal_type: 'milestone' }
        })
        return c
      }
      const c = createChain()
      ;(c as Record<string, unknown>)['then'] = (r: (v: unknown) => void) => r({ data: [] })
      return c
    })

    const result = await computeGoalProgress('user-1', 'g-1')
    expect(result.currentValue).toBe(0)
    expect(result.targetValue).toBe(0)
    expect(result.progressPct).toBe(0)
  })
})
