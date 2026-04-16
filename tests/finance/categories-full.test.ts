import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockClient = { from: vi.fn(), rpc: vi.fn() }

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => mockClient),
}))

import { listCategories, createCategory, deleteCategory } from '@/lib/finance/categories'

function createChain(result: unknown = { data: null, error: null, count: 0 }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {}
  const methods = ['select', 'insert', 'delete', 'eq', 'order']
  for (const method of methods) chain[method] = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn().mockResolvedValue(result)
  ;(chain as Record<string, unknown>).then = (resolve: (value: unknown) => void) => resolve(result)
  return chain
}

describe('finance categories additional paths', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws when listCategories query fails after preset check', async () => {
    const presetCheck = createChain({ count: 1, error: null })
    const categoryList = createChain({ data: null, error: { message: 'List failed' } })

    let call = 0
    mockClient.from.mockImplementation(() => {
      call++
      return call === 1 ? presetCheck : categoryList
    })

    await expect(listCategories('user-1')).rejects.toThrow('List failed')
  })

  it('throws generic create errors that are not duplicate violations', async () => {
    const insert = createChain({ data: null, error: { code: '99999', message: 'Insert failed' } })
    mockClient.from.mockReturnValue(insert)

    await expect(createCategory('user-1', 'Custom', 'icon')).rejects.toThrow('Insert failed')
  })

  it('deletes a non-preset category', async () => {
    const lookup = createChain({ data: { is_preset: false }, error: null })
    const deletion = createChain({ error: null })

    let call = 0
    mockClient.from.mockImplementation(() => {
      call++
      return call === 1 ? lookup : deletion
    })

    await expect(deleteCategory('user-1', 'cat-1')).resolves.toBeUndefined()
    expect(deletion.delete).toHaveBeenCalled()
  })

  it('throws when deleting a non-preset category fails', async () => {
    const lookup = createChain({ data: { is_preset: false }, error: null })
    const deletion = createChain({ error: { message: 'Delete failed' } })

    let call = 0
    mockClient.from.mockImplementation(() => {
      call++
      return call === 1 ? lookup : deletion
    })

    await expect(deleteCategory('user-1', 'cat-1')).rejects.toThrow('Delete failed')
  })
})
