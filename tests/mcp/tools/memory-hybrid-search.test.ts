import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/memory/spaces', () => ({
  ensureDefaultSpaces: vi.fn(),
  resolveSpaceId: vi.fn(),
}))

vi.mock('@/lib/documents/embed', () => ({
  generateEmbedding: vi.fn().mockResolvedValue(new Array(1536).fill(0.1)),
}))

const mockRpc = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({
    rpc: mockRpc,
    from: mockFrom,
  })),
}))

import { computeStaleHint, searchMemories, listMemories } from '@/lib/memory/items'

describe('computeStaleHint', () => {
  it('should return null for fresh high-importance memory', () => {
    const hint = computeStaleHint({
      valid_at: new Date().toISOString(),
      invalid_at: null,
      importance: 5.0,
    })
    expect(hint).toBeNull()
  })

  it('should return stale hint for old low-importance memory', () => {
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

    const hint = computeStaleHint({
      valid_at: sixMonthsAgo.toISOString(),
      invalid_at: null,
      importance: 0.3,
    })
    expect(hint).toContain('months old')
    expect(hint).toContain('low access')
    expect(hint).toContain('0.3')
  })

  it('should return superseded hint when invalid_at is set', () => {
    const hint = computeStaleHint({
      valid_at: new Date().toISOString(),
      invalid_at: new Date().toISOString(),
      importance: 8.0,
    })
    expect(hint).toBe('This memory has been superseded.')
  })

  it('should return null for old but high-importance memory', () => {
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

    const hint = computeStaleHint({
      valid_at: sixMonthsAgo.toISOString(),
      invalid_at: null,
      importance: 5.0,
    })
    expect(hint).toBeNull()
  })

  it('should return null for new low-importance memory (< 90 days)', () => {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const hint = computeStaleHint({
      valid_at: thirtyDaysAgo.toISOString(),
      invalid_at: null,
      importance: 0.1,
    })
    expect(hint).toBeNull()
  })
})

describe('searchMemories — hybrid search', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should call pa_hybrid_search with query_text and query_embedding', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{
        id: 'mem-1',
        user_id: 'user-1',
        space_id: 's1',
        title: 'Budget rule',
        content: 'Monthly budget is 50k',
        category: 'rule',
        tags: [],
        project: null,
        valid_at: new Date().toISOString(),
        invalid_at: null,
        source: 'manual',
        importance: 3.0,
        space_slug: 'personal',
        semantic_score: 0.85,
        keyword_score: 0.6,
        final_score: 0.73,
      }],
      error: null,
    })
    mockRpc.mockResolvedValueOnce({ data: null, error: null })

    const results = await searchMemories({
      userId: 'user-1',
      query: 'budget rule',
      limit: 5,
    })

    expect(mockRpc).toHaveBeenCalledWith('pa_hybrid_search', expect.objectContaining({
      query_text: 'budget rule',
      query_embedding: expect.any(String),
      filter_user_id: 'user-1',
    }))

    expect(results[0]).toHaveProperty('semantic_score', 0.85)
    expect(results[0]).toHaveProperty('keyword_score', 0.6)
    expect(results[0]).toHaveProperty('final_score', 0.73)
  })

  it('should include stale_hint in results for old low-importance memories', async () => {
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

    mockRpc.mockResolvedValueOnce({
      data: [{
        id: 'mem-old',
        user_id: 'user-1',
        space_id: 's1',
        title: 'Old project',
        content: 'Working on project X',
        category: 'context',
        tags: [],
        project: 'project-x',
        valid_at: sixMonthsAgo.toISOString(),
        invalid_at: null,
        source: 'manual',
        importance: 0.3,
        space_slug: 'projects',
        semantic_score: 0.7,
        keyword_score: 0.0,
        final_score: 0.36,
      }],
      error: null,
    })
    mockRpc.mockResolvedValueOnce({ data: null, error: null })

    const results = await searchMemories({
      userId: 'user-1',
      query: 'project X',
      limit: 5,
    })

    expect(results[0]).toHaveProperty('stale_hint')
    expect(results[0].stale_hint).toContain('months old')
  })

  it('should return null stale_hint for fresh memories', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{
        id: 'mem-fresh',
        user_id: 'user-1',
        space_id: 's1',
        title: 'Fresh memory',
        content: 'Just created',
        category: 'note',
        tags: [],
        project: null,
        valid_at: new Date().toISOString(),
        invalid_at: null,
        source: 'manual',
        importance: 5.0,
        space_slug: 'personal',
        semantic_score: 0.9,
        keyword_score: 0.8,
        final_score: 0.79,
      }],
      error: null,
    })
    mockRpc.mockResolvedValueOnce({ data: null, error: null })

    const results = await searchMemories({
      userId: 'user-1',
      query: 'fresh',
      limit: 5,
    })

    expect(results[0].stale_hint).toBeNull()
  })
})

describe('listMemories — stale hints', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('attaches stale_hint to listed rows', async () => {
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

    const chain: Record<string, unknown> = {}
    const terminal = Promise.resolve({
      data: [{
        id: '1',
        user_id: 'user-1',
        space_id: 's',
        title: 't',
        content: 'c',
        category: 'note',
        tags: [],
        project: null,
        valid_at: sixMonthsAgo.toISOString(),
        invalid_at: null,
        importance: 0.3,
        source: 'manual',
        parent_id: null,
        is_active: true,
        created_at: sixMonthsAgo.toISOString(),
        updated_at: sixMonthsAgo.toISOString(),
        pa_memory_spaces: { slug: 'personal' },
      }],
      error: null,
    })
    chain.select = vi.fn().mockReturnValue(chain)
    chain.eq = vi.fn().mockReturnValue(chain)
    chain.is = vi.fn().mockReturnValue(chain)
    chain.order = vi.fn().mockReturnValue(chain)
    chain.range = vi.fn().mockReturnValue(terminal)
    mockFrom.mockReturnValue(chain)

    const rows = await listMemories({
      userId: 'user-1',
      limit: 20,
      offset: 0,
    })

    expect(rows[0].stale_hint).toContain('months old')
  })
})
