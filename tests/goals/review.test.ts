import { describe, it, expect, vi, beforeEach } from 'vitest'

// We need complex multi-call mock setup for generateReview
// Test the module exports and basic invocation

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => {
    const chain: Record<string, unknown> = {}
    const methods = ['select', 'insert', 'update', 'delete', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'is', 'order', 'limit', 'range', 'maybeSingle', 'contains']
    for (const m of methods) {
      chain[m] = vi.fn().mockReturnValue(chain)
    }
    chain['single'] = vi.fn().mockResolvedValue({ data: null })
    ;(chain as Record<string, unknown>)['then'] = (r: (v: unknown) => void) => r({ data: [], count: 0, error: null })
    return {
      from: vi.fn().mockReturnValue(chain),
      rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    }
  }),
}))

import { generateReview } from '@/lib/goals/review'

describe('generateReview', () => {
  it('is a function', () => {
    expect(typeof generateReview).toBe('function')
  })

  it('returns a review object with all sections', async () => {
    const review = await generateReview('user-1', '2025-01-01', '2025-01-31', 'January 2025')

    expect(review).toHaveProperty('period')
    expect(review.period.start).toBe('2025-01-01')
    expect(review.period.end).toBe('2025-01-31')
    expect(review.period.label).toBe('January 2025')

    expect(review).toHaveProperty('habits')
    expect(review.habits).toHaveProperty('total_tracked')
    expect(review.habits).toHaveProperty('avg_completion_pct')
    expect(review.habits).toHaveProperty('streaks')

    expect(review).toHaveProperty('tasks')
    expect(review.tasks).toHaveProperty('completed')
    expect(review.tasks).toHaveProperty('pending')
    expect(review.tasks).toHaveProperty('overdue')
    expect(review.tasks).toHaveProperty('total_created')

    expect(review).toHaveProperty('finance')
    expect(review.finance).toHaveProperty('total_spent')
    expect(review.finance).toHaveProperty('breakdown')

    expect(review).toHaveProperty('goals')
    expect(review.goals).toHaveProperty('active')
    expect(review.goals).toHaveProperty('completed')
    expect(review.goals).toHaveProperty('failed')

    expect(review).toHaveProperty('highlights')
    expect(review.highlights).toHaveProperty('goals_hit')
    expect(review.highlights).toHaveProperty('goals_missed')
    expect(review.highlights).toHaveProperty('tasks_completed')
    expect(review.highlights).toHaveProperty('tasks_pending')
  })
})
