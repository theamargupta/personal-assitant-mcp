import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/memory/spaces', () => ({
  ensureDefaultSpaces: vi.fn(),
}))

const mockRpc = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({
    rpc: mockRpc,
    from: mockFrom,
  })),
}))

import { consolidateMemories } from '@/lib/memory/items'

describe('consolidateMemories', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should find stale memories in "stale" mode', async () => {
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [
          {
            id: 'mem-old',
            title: 'Old project',
            valid_at: sixMonthsAgo.toISOString(),
            invalid_at: null,
            importance: 0.3,
            category: 'context',
          },
        ],
        error: null,
      }),
    }
    mockFrom.mockReturnValue(chain)

    const result = await consolidateMemories({ userId: 'user-1', mode: 'stale' })

    expect(result.stale_memories.length).toBe(1)
    expect(result.stale_memories[0].id).toBe('mem-old')
    expect(result.stale_memories[0].reason).toContain('months old')
  })

  it('should return empty stale list when nothing qualifies', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [
          {
            id: 'fresh',
            title: 'Fresh',
            valid_at: new Date().toISOString(),
            invalid_at: null,
            importance: 5.0,
            category: 'note',
          },
        ],
        error: null,
      }),
    }
    mockFrom.mockReturnValue(chain)

    const result = await consolidateMemories({ userId: 'user-1', mode: 'stale' })
    expect(result.stale_memories.length).toBe(0)
  })
})
