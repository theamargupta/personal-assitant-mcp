/**
 * TDD: get_uncategorized should return data structured for an interactive
 * category picker widget — each transaction needs enough info for the user
 * to identify it and assign a category.
 *
 * Also tests update_transaction for the categorization action.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'cat-food' } }),
    }),
  })),
}))

vi.mock('@/lib/finance/transactions', () => ({
  createTransaction: vi.fn(),
  listTransactions: vi.fn().mockResolvedValue({
    transactions: [
      {
        id: 'tx-1', amount: 299, merchant: 'Swiggy',
        source_app: 'sms', note: null,
        transaction_date: '2026-04-15T12:00:00Z',
        spending_categories: null, // uncategorized!
      },
      {
        id: 'tx-2', amount: 1500, merchant: null,
        source_app: 'sms', note: 'UPI payment',
        transaction_date: '2026-04-14T08:00:00Z',
        spending_categories: null,
      },
    ],
    total: 2,
  }),
  getSpendingSummary: vi.fn().mockResolvedValue({ total_spent: 0, breakdown: [] }),
  updateTransaction: vi.fn().mockResolvedValue({
    id: 'tx-1', amount: 299, merchant: 'Swiggy',
    category_id: 'cat-food', note: null,
    transaction_date: '2026-04-15T12:00:00Z',
    updated_at: '2026-04-16T12:00:00Z',
  }),
  deleteTransaction: vi.fn(),
}))

vi.mock('@/lib/finance/categories', () => ({
  ensurePresetCategories: vi.fn(),
}))

const registeredTools: Record<string, { handler: Function }> = {}

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: class {
    tool(name: string, _desc: string, _schema: unknown, handler: Function) {
      registeredTools[name] = { handler }
    }
  },
}))

import { registerFinanceTools } from '@/lib/mcp/tools/finance'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

const server = new McpServer({ name: 'test', version: '0.0.0' })
registerFinanceTools(server)

const authInfo = { extra: { userId: 'user-1' } }

describe('get_uncategorized — categorizer widget data', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('should return uncategorized transactions with identification info', async () => {
    const result = await registeredTools['get_uncategorized'].handler(
      { limit: 10 },
      { authInfo }
    )

    const parsed = JSON.parse(result.content[0].text)

    expect(parsed.uncategorized_count).toBe(2)
    expect(parsed.transactions).toHaveLength(2)

    // Each transaction must have enough info for the user to identify it
    parsed.transactions.forEach((t: { transaction_id: string; amount: number; merchant: string | null; date: string }) => {
      expect(t).toHaveProperty('transaction_id')
      expect(t).toHaveProperty('amount')
      expect(t).toHaveProperty('date')
      expect(typeof t.amount).toBe('number')
      expect(t.amount).toBeGreaterThan(0)
    })
  })

  it('should include merchant or source for identification', async () => {
    const result = await registeredTools['get_uncategorized'].handler(
      { limit: 10 },
      { authInfo }
    )

    const parsed = JSON.parse(result.content[0].text)

    // First tx has merchant
    expect(parsed.transactions[0].merchant).toBe('Swiggy')

    // Second tx has no merchant but has source
    expect(parsed.transactions[1].source).toBe('sms')
  })

  it('should return actionable message', async () => {
    const result = await registeredTools['get_uncategorized'].handler(
      { limit: 10 },
      { authInfo }
    )

    const parsed = JSON.parse(result.content[0].text)
    expect(parsed.message).toContain('2')
    expect(parsed.message).toContain('categorization')
  })
})

describe('update_transaction — categorization action', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('should update transaction category', async () => {
    const result = await registeredTools['update_transaction'].handler(
      { transaction_id: 'tx-1', category: 'Food' },
      { authInfo }
    )

    const parsed = JSON.parse(result.content[0].text)
    expect(parsed.transaction_id).toBe('tx-1')
    expect(parsed.message).toContain('updated')
  })

  it('should update transaction amount', async () => {
    const result = await registeredTools['update_transaction'].handler(
      { transaction_id: 'tx-1', amount: 500 },
      { authInfo }
    )

    expect(result.content[0].type).toBe('text')
    const parsed = JSON.parse(result.content[0].text)
    expect(parsed.transaction_id).toBe('tx-1')
  })

  it('should throw when unauthorized', async () => {
    await expect(registeredTools['update_transaction'].handler(
      { transaction_id: 'tx-1', category: 'Food' },
      { authInfo: { extra: {} } }
    )).rejects.toThrow('Unauthorized')
  })
})

describe('delete_transaction — cleanup action', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('should delete transaction and return confirmation', async () => {
    const result = await registeredTools['delete_transaction'].handler(
      { transaction_id: 'tx-1' },
      { authInfo }
    )

    const parsed = JSON.parse(result.content[0].text)
    expect(parsed.deleted).toBe(true)
    expect(parsed.transaction_id).toBe('tx-1')
  })

  it('should throw when unauthorized', async () => {
    await expect(registeredTools['delete_transaction'].handler(
      { transaction_id: 'tx-1' },
      { authInfo: { extra: {} } }
    )).rejects.toThrow('Unauthorized')
  })
})
