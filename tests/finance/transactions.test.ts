import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabaseClient } from '../setup'

const mockClient = createMockSupabaseClient()

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => mockClient),
}))

import {
  createTransaction,
  updateTransaction,
  deleteTransaction,
  listTransactions,
  getSpendingSummary,
} from '@/lib/finance/transactions'

describe('createTransaction', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('inserts a transaction with defaults', async () => {
    const txn = { id: 'tx-1', amount: 100, merchant: null, created_at: '2025-01-01' }
    const chain: Record<string, ReturnType<typeof vi.fn>> = {}
    chain.insert = vi.fn().mockReturnValue(chain)
    chain.select = vi.fn().mockReturnValue(chain)
    chain.single = vi.fn().mockResolvedValue({ data: txn, error: null })
    mockClient.from.mockReturnValue(chain)

    const result = await createTransaction({ userId: 'user-1', amount: 100 })
    expect(result).toEqual(txn)
    expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'user-1',
      amount: 100,
      merchant: null,
      is_auto_detected: false,
    }))
  })

  it('uses provided optional fields', async () => {
    const txn = { id: 'tx-2', amount: 500, merchant: 'Chai Point', created_at: '2025-01-01' }
    const chain: Record<string, ReturnType<typeof vi.fn>> = {}
    chain.insert = vi.fn().mockReturnValue(chain)
    chain.select = vi.fn().mockReturnValue(chain)
    chain.single = vi.fn().mockResolvedValue({ data: txn, error: null })
    mockClient.from.mockReturnValue(chain)

    await createTransaction({
      userId: 'user-1',
      amount: 500,
      merchant: 'Chai Point',
      sourceApp: 'gpay',
      note: 'Morning chai',
    })

    expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({
      merchant: 'Chai Point',
      source_app: 'gpay',
      note: 'Morning chai',
    }))
  })

  it('throws on DB error', async () => {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {}
    chain.insert = vi.fn().mockReturnValue(chain)
    chain.select = vi.fn().mockReturnValue(chain)
    chain.single = vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } })
    mockClient.from.mockReturnValue(chain)

    await expect(createTransaction({ userId: 'u', amount: 10 })).rejects.toThrow('DB error')
  })
})

describe('updateTransaction', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('updates specified fields', async () => {
    const updated = { id: 'tx-1', amount: 200, merchant: 'Updated', updated_at: '2025-01-02' }
    const chain: Record<string, ReturnType<typeof vi.fn>> = {}
    chain.update = vi.fn().mockReturnValue(chain)
    chain.eq = vi.fn().mockReturnValue(chain)
    chain.select = vi.fn().mockReturnValue(chain)
    chain.single = vi.fn().mockResolvedValue({ data: updated, error: null })
    mockClient.from.mockReturnValue(chain)

    const result = await updateTransaction('user-1', 'tx-1', { amount: 200, merchant: 'Updated' })
    expect(result).toEqual(updated)
  })

  it('throws when transaction not found', async () => {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {}
    chain.update = vi.fn().mockReturnValue(chain)
    chain.eq = vi.fn().mockReturnValue(chain)
    chain.select = vi.fn().mockReturnValue(chain)
    chain.single = vi.fn().mockResolvedValue({ data: null, error: null })
    mockClient.from.mockReturnValue(chain)

    await expect(updateTransaction('user-1', 'bad-id', {})).rejects.toThrow('Transaction not found')
  })
})

describe('deleteTransaction', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('deletes a transaction', async () => {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {}
    chain.delete = vi.fn().mockReturnValue(chain)
    chain.eq = vi.fn().mockReturnValue(chain)
    // Make the chain resolve
    ;(chain as Record<string, unknown>)['then'] = (resolve: (v: unknown) => void) => resolve({ error: null })
    mockClient.from.mockReturnValue(chain)

    await expect(deleteTransaction('user-1', 'tx-1')).resolves.toBeUndefined()
  })
})

describe('listTransactions', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns transactions with count', async () => {
    const txns = [{ id: 'tx-1', amount: 100 }]
    const chain: Record<string, ReturnType<typeof vi.fn>> = {}
    chain.select = vi.fn().mockReturnValue(chain)
    chain.eq = vi.fn().mockReturnValue(chain)
    chain.gte = vi.fn().mockReturnValue(chain)
    chain.lte = vi.fn().mockReturnValue(chain)
    chain.is = vi.fn().mockReturnValue(chain)
    chain.order = vi.fn().mockReturnValue(chain)
    chain.range = vi.fn().mockResolvedValue({ data: txns, count: 1, error: null })
    mockClient.from.mockReturnValue(chain)

    const result = await listTransactions({ userId: 'user-1' })
    expect(result.transactions).toEqual(txns)
    expect(result.total).toBe(1)
  })

  it('applies optional filters', async () => {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {}
    chain.select = vi.fn().mockReturnValue(chain)
    chain.eq = vi.fn().mockReturnValue(chain)
    chain.gte = vi.fn().mockReturnValue(chain)
    chain.lte = vi.fn().mockReturnValue(chain)
    chain.is = vi.fn().mockReturnValue(chain)
    chain.order = vi.fn().mockReturnValue(chain)
    chain.range = vi.fn().mockResolvedValue({ data: [], count: 0, error: null })
    mockClient.from.mockReturnValue(chain)

    await listTransactions({
      userId: 'user-1',
      categoryId: 'cat-1',
      startDate: '2025-01-01',
      endDate: '2025-12-31',
      uncategorizedOnly: true,
      limit: 10,
      offset: 5,
    })

    // Verify filters were applied
    expect(chain.eq).toHaveBeenCalled()
    expect(chain.gte).toHaveBeenCalled()
    expect(chain.lte).toHaveBeenCalled()
    expect(chain.is).toHaveBeenCalled()
  })
})

describe('getSpendingSummary', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns breakdown and total', async () => {
    const rpcData = [
      { category_name: 'Food', total_amount: 1000, transaction_count: 5 },
      { category_name: 'Transport', total_amount: 500, transaction_count: 3 },
    ]
    mockClient.rpc.mockResolvedValue({ data: rpcData, error: null })

    const result = await getSpendingSummary('user-1', '2025-01-01', '2025-01-31')
    expect(result.total_spent).toBe(1500)
    expect(result.breakdown).toEqual(rpcData)
  })

  it('handles empty data', async () => {
    mockClient.rpc.mockResolvedValue({ data: [], error: null })

    const result = await getSpendingSummary('user-1', '2025-01-01', '2025-01-31')
    expect(result.total_spent).toBe(0)
    expect(result.breakdown).toEqual([])
  })

  it('handles null data', async () => {
    mockClient.rpc.mockResolvedValue({ data: null, error: null })

    const result = await getSpendingSummary('user-1', '2025-01-01', '2025-01-31')
    expect(result.total_spent).toBe(0)
    expect(result.breakdown).toEqual([])
  })

  it('throws on RPC error', async () => {
    mockClient.rpc.mockResolvedValue({ data: null, error: { message: 'RPC failed' } })

    await expect(getSpendingSummary('user-1', '2025-01-01', '2025-01-31'))
      .rejects.toThrow('RPC failed')
  })
})
