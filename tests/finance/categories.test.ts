import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabaseClient } from '../setup'

// Create specific mocks per test
const mockClient = createMockSupabaseClient()

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => mockClient),
}))

import { ensurePresetCategories, listCategories, createCategory, deleteCategory } from '@/lib/finance/categories'

describe('ensurePresetCategories', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls rpc when no presets exist', async () => {
    // select with count returns { count: 0 }
    mockClient.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ count: 0 }),
        }),
      }),
    })
    mockClient.rpc.mockResolvedValue({ data: null, error: null })

    await ensurePresetCategories('user-1')

    expect(mockClient.rpc).toHaveBeenCalledWith('seed_preset_categories', { target_user_id: 'user-1' })
  })

  it('skips rpc when presets already exist', async () => {
    mockClient.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ count: 5 }),
        }),
      }),
    })

    await ensurePresetCategories('user-1')

    expect(mockClient.rpc).not.toHaveBeenCalled()
  })
})

describe('listCategories', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns categories for user', async () => {
    const mockCats = [
      { id: '1', name: 'Food', icon: '🍕', is_preset: true, created_at: '2025-01-01' },
    ]

    // First call: ensurePresetCategories check
    const ensureChain = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ count: 5 }),
        }),
      }),
    }

    // Second call: actual listing
    const listChain: Record<string, ReturnType<typeof vi.fn>> = {}
    listChain.select = vi.fn().mockReturnValue(listChain)
    listChain.eq = vi.fn().mockReturnValue(listChain)
    listChain.order = vi.fn().mockReturnValue(listChain)
    listChain.then = ((resolve: (v: unknown) => void) => resolve({ data: mockCats, error: null })) as ReturnType<typeof vi.fn>

    let callCount = 0
    mockClient.from.mockImplementation(() => {
      callCount++
      return callCount === 1 ? ensureChain : listChain
    })

    const result = await listCategories('user-1')
    expect(result).toEqual(mockCats)
  })
})

describe('createCategory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('inserts and returns new category', async () => {
    const newCat = { id: '2', name: 'Custom', icon: '🎯', is_preset: false, created_at: '2025-01-01' }

    const chain: Record<string, ReturnType<typeof vi.fn>> = {}
    chain.insert = vi.fn().mockReturnValue(chain)
    chain.select = vi.fn().mockReturnValue(chain)
    chain.single = vi.fn().mockResolvedValue({ data: newCat, error: null })

    mockClient.from.mockReturnValue(chain)

    const result = await createCategory('user-1', ' Custom ', '🎯')
    expect(result).toEqual(newCat)
    expect(chain.insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      name: 'Custom',
      icon: '🎯',
      is_preset: false,
    })
  })

  it('throws on duplicate category', async () => {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {}
    chain.insert = vi.fn().mockReturnValue(chain)
    chain.select = vi.fn().mockReturnValue(chain)
    chain.single = vi.fn().mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate' } })

    mockClient.from.mockReturnValue(chain)

    await expect(createCategory('user-1', 'Existing', '🎯')).rejects.toThrow('Category already exists')
  })
})

describe('deleteCategory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws when category not found', async () => {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {}
    chain.select = vi.fn().mockReturnValue(chain)
    chain.eq = vi.fn().mockReturnValue(chain)
    chain.single = vi.fn().mockResolvedValue({ data: null })

    mockClient.from.mockReturnValue(chain)

    await expect(deleteCategory('user-1', 'nonexistent')).rejects.toThrow('Category not found')
  })

  it('throws when trying to delete preset', async () => {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {}
    chain.select = vi.fn().mockReturnValue(chain)
    chain.eq = vi.fn().mockReturnValue(chain)
    chain.single = vi.fn().mockResolvedValue({ data: { is_preset: true } })

    mockClient.from.mockReturnValue(chain)

    await expect(deleteCategory('user-1', 'preset-id')).rejects.toThrow('Cannot delete preset categories')
  })
})
