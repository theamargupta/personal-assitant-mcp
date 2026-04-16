import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/documents/embed', () => ({
  generateEmbedding: vi.fn().mockResolvedValue(new Array(1536).fill(0.1)),
}))

vi.mock('@/lib/memory/spaces', () => ({
  ensureDefaultSpaces: vi.fn(),
  resolveSpaceId: vi.fn().mockResolvedValue('space-001'),
}))

const mockRpc = vi.fn()
const mockInsert = vi.fn()

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: vi.fn().mockReturnValue({
      insert: mockInsert.mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'mem-new',
              space_id: 'space-001',
              user_id: 'user-1',
              title: 'New memory',
              content: 'New content',
              category: 'note',
              tags: [],
              project: null,
              valid_at: '2026-04-16T00:00:00Z',
              invalid_at: null,
              source: 'manual',
              importance: 0,
              parent_id: null,
              is_active: true,
              created_at: '2026-04-16T00:00:00Z',
              updated_at: '2026-04-16T00:00:00Z',
            },
            error: null,
          }),
        }),
      }),
    }),
    rpc: mockRpc,
  })),
}))

import { saveMemory } from '@/lib/memory/items'

describe('saveMemory — duplicate detection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return duplicates_found when similar memories exist and force=false', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          id: 'mem-existing',
          title: 'Existing memory',
          content: 'Similar content',
          category: 'note',
          similarity: 0.95,
          updated_at: '2026-04-15T00:00:00Z',
          space_slug: 'personal',
        },
      ],
      error: null,
    })

    const result = await saveMemory({
      userId: 'user-1',
      spaceSlug: 'personal',
      title: 'New memory',
      content: 'New content',
      category: 'note',
      tags: [],
      force: false,
    })

    expect(result).toHaveProperty('status', 'duplicates_found')
    expect(result).toHaveProperty('similar_memories')
    if ('similar_memories' in result) {
      expect(result.similar_memories).toHaveLength(1)
      expect(result.similar_memories[0].id).toBe('mem-existing')
      expect(result.similar_memories[0].similarity).toBe(0.95)
    }
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('should save normally when no duplicates found', async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null })

    const result = await saveMemory({
      userId: 'user-1',
      spaceSlug: 'personal',
      title: 'Unique memory',
      content: 'Unique content',
      category: 'note',
      tags: [],
      force: false,
    })

    expect(result).toHaveProperty('status', 'saved')
    expect(result).toHaveProperty('memory')
    expect(mockInsert).toHaveBeenCalled()
  })

  it('should skip duplicate check when force=true', async () => {
    const result = await saveMemory({
      userId: 'user-1',
      spaceSlug: 'personal',
      title: 'Force save',
      content: 'Force content',
      category: 'note',
      tags: [],
      force: true,
    })

    expect(result).toHaveProperty('status', 'saved')
    expect(mockRpc).not.toHaveBeenCalled()
    expect(mockInsert).toHaveBeenCalled()
  })

  it('should default force to false (backward compatible)', async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null })

    const result = await saveMemory({
      userId: 'user-1',
      spaceSlug: 'personal',
      title: 'No force param',
      content: 'Content',
      category: 'note',
      tags: [],
    })

    expect(result).toHaveProperty('status', 'saved')
    expect(mockRpc).toHaveBeenCalled()
  })
})
