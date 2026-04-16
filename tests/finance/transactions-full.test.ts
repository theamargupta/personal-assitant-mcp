import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockClient = { from: vi.fn() }

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => mockClient),
}))

import { updateTransaction, deleteTransaction } from '@/lib/finance/transactions'

function createChain(result: unknown = { data: null, error: null }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {}
  const methods = ['update', 'delete', 'eq', 'select']
  for (const method of methods) chain[method] = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn().mockResolvedValue(result)
  ;(chain as Record<string, unknown>).then = (resolve: (value: unknown) => void) => resolve(result)
  return chain
}

describe('finance transactions additional paths', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates category and note fields when provided', async () => {
    const updated = {
      id: 'tx-1',
      amount: 100,
      merchant: 'Store',
      category_id: 'cat-1',
      note: 'Lunch',
      updated_at: '2025-01-01T00:00:00Z',
    }
    const chain = createChain({ data: updated, error: null })
    mockClient.from.mockReturnValue(chain)

    const result = await updateTransaction('user-1', 'tx-1', {
      categoryId: 'cat-1',
      note: 'Lunch',
    })

    expect(result).toEqual(updated)
    expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({
      category_id: 'cat-1',
      note: 'Lunch',
    }))
  })

  it('throws when deleting a transaction fails', async () => {
    const chain = createChain({ error: { message: 'Delete failed' } })
    mockClient.from.mockReturnValue(chain)

    await expect(deleteTransaction('user-1', 'tx-1')).rejects.toThrow('Delete failed')
  })
})
