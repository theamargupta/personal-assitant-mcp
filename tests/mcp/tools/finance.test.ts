import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFKJoinMock } from '../../setup'

type TransactionRow = {
  id: string
  amount: number
  merchant: string | null
  source_app: string | null
  note: string | null
  category_id: string | null
  transaction_date: string
  spending_categories: { name: string; icon: string } | Array<{ name: string; icon: string }> | null
}

const mocks = vi.hoisted(() => {
  const state: {
    categoryLookup: { id: string } | null
    transactionRows: TransactionRow[]
    summaryRows: Array<{
      category_name: string
      category_icon: string
      total_amount: number
      transaction_count: number
    }>
  } = {
    categoryLookup: { id: 'cat-food' },
    transactionRows: [],
    summaryRows: [],
  }

  return {
    state,
    mockClient: {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        ilike: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(async () => ({ data: state.categoryLookup, error: null })),
      })),
    },
    createTransaction: vi.fn(async (input: {
      userId: string
      amount: number
      merchant?: string
      sourceApp?: string
      categoryId?: string
      note?: string
      transactionDate?: string
      isAutoDetected?: boolean
    }) => ({
      id: 'tx-created',
      amount: input.amount,
      merchant: input.merchant ?? null,
      source_app: input.sourceApp ?? null,
      category_id: input.categoryId ?? null,
      transaction_date: input.transactionDate ?? '2025-01-15T06:30:00.000Z',
      is_auto_detected: input.isAutoDetected ?? false,
      created_at: '2025-01-15T06:30:00.000Z',
    })),
    listTransactions: vi.fn(async (input: {
      categoryId?: string
      startDate?: string
      endDate?: string
      uncategorizedOnly?: boolean
      limit?: number
      offset?: number
    }) => {
      let rows = [...state.transactionRows]
      if (input.categoryId) rows = rows.filter((row) => row.category_id === input.categoryId)
      if (input.uncategorizedOnly) rows = rows.filter((row) => row.category_id === null)
      if (input.startDate) rows = rows.filter((row) => row.transaction_date >= input.startDate!)
      if (input.endDate) rows = rows.filter((row) => row.transaction_date <= input.endDate!)

      const offset = input.offset ?? 0
      const limit = input.limit ?? 50
      return {
        transactions: rows.slice(offset, offset + limit),
        total: rows.length,
      }
    }),
    getSpendingSummary: vi.fn(async () => ({
      total_spent: state.summaryRows.reduce((sum, row) => sum + Number(row.total_amount), 0),
      breakdown: state.summaryRows,
    })),
    updateTransaction: vi.fn(async (_userId: string, transactionId: string, input: {
      categoryId?: string
      merchant?: string
      amount?: number
      note?: string
    }) => ({
      id: transactionId,
      amount: input.amount ?? 450,
      merchant: input.merchant ?? 'Updated Merchant',
      note: input.note ?? null,
      updated_at: '2025-01-16T06:30:00.000Z',
    })),
    deleteTransaction: vi.fn(async () => undefined),
    getTransaction: vi.fn(async (_userId: string, _transactionId: string) => null as unknown),
    ensurePresetCategories: vi.fn(),
    listCategories: vi.fn(async () => [] as Array<{ id: string; name: string; icon: string; is_preset: boolean; created_at: string }>),
    createCategory: vi.fn(async (_userId: string, name: string, icon: string) => ({
      id: 'cat-new',
      name,
      icon,
      is_preset: false,
      created_at: '2026-04-15T06:30:00.000Z',
    })),
    updateCategory: vi.fn(async (_userId: string, categoryId: string, updates: { name?: string; icon?: string }) => ({
      id: categoryId,
      name: updates.name ?? 'Original',
      icon: updates.icon ?? '🛒',
      is_preset: false,
      created_at: '2026-04-15T06:30:00.000Z',
    })),
    deleteCategory: vi.fn(async () => undefined),
    registeredTools: {} as Record<string, { handler: (...args: unknown[]) => unknown }>,
  }
})

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => mocks.mockClient),
}))

vi.mock('@/lib/finance/transactions', () => ({
  createTransaction: mocks.createTransaction,
  listTransactions: mocks.listTransactions,
  getSpendingSummary: mocks.getSpendingSummary,
  updateTransaction: mocks.updateTransaction,
  deleteTransaction: mocks.deleteTransaction,
  getTransaction: mocks.getTransaction,
}))

vi.mock('@/lib/finance/categories', () => ({
  ensurePresetCategories: mocks.ensurePresetCategories,
  listCategories: mocks.listCategories,
  createCategory: mocks.createCategory,
  updateCategory: mocks.updateCategory,
  deleteCategory: mocks.deleteCategory,
}))

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: class {
    tool(name: string, _desc: string, _schema: unknown, handler: (...args: unknown[]) => unknown) {
      mocks.registeredTools[name] = { handler }
    }
  },
}))

import { registerFinanceTools } from '@/lib/mcp/tools/finance'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

const server = new McpServer({ name: 'test', version: '0.0.0' })
registerFinanceTools(server)

const authInfo = { extra: { userId: 'user-1' } }
const noAuth = { extra: {} }

function tx(overrides: Partial<TransactionRow> = {}): TransactionRow {
  return {
    id: 'tx-1',
    amount: 200,
    merchant: 'Chai Point',
    source_app: 'manual',
    note: null,
    category_id: 'cat-food',
    transaction_date: '2025-01-15T06:30:00.000Z',
    spending_categories: { name: 'Food', icon: '🍕' },
    ...overrides,
  }
}

function parseToolResult(result: { content: Array<{ text: string }> }) {
  return JSON.parse(result.content[0].text)
}

describe('get_spending_summary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.state.summaryRows = [
      { category_name: 'Food', category_icon: '🍕', total_amount: 3000, transaction_count: 10 },
      { category_name: 'Transport', category_icon: '🚗', total_amount: 2000, transaction_count: 5 },
    ]
  })

  it('throws when unauthorized', async () => {
    await expect(mocks.registeredTools['get_spending_summary'].handler(
      { start_date: '2025-01-01', end_date: '2025-01-31' },
      { authInfo: noAuth }
    )).rejects.toThrow('Unauthorized')
  })

  it('computes totals and category amounts from realistic summary rows', async () => {
    const result = await mocks.registeredTools['get_spending_summary'].handler(
      { start_date: '2025-01-01', end_date: '2025-01-31' },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(parsed.period).toEqual({ start: '2025-01-01', end: '2025-01-31' })
    expect(parsed.total_spent).toBe(5000)
    expect(parsed.breakdown).toEqual([
      { category: 'Food', icon: '🍕', amount: 3000, count: 10 },
      { category: 'Transport', icon: '🚗', amount: 2000, count: 5 },
    ])
    expect(Math.round((parsed.breakdown[0].amount / parsed.total_spent) * 100)).toBe(60)
    expect(Math.round((parsed.breakdown[1].amount / parsed.total_spent) * 100)).toBe(40)
  })

  it('accepts ISO date-time inputs without appending IST boundaries', async () => {
    const result = await mocks.registeredTools['get_spending_summary'].handler(
      { start_date: '2025-01-01T00:00:00.000Z', end_date: '2025-01-31T23:59:59.000Z' },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(parsed.period).toEqual({
      start: '2025-01-01T00:00:00.000Z',
      end: '2025-01-31T23:59:59.000Z',
    })
    expect(mocks.getSpendingSummary).toHaveBeenCalledWith(
      'user-1',
      '2025-01-01T00:00:00.000Z',
      '2025-01-31T23:59:59.000Z'
    )
  })
})

describe('list_transactions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.state.categoryLookup = { id: 'cat-food' }
    mocks.state.transactionRows = [tx()]
  })

  it('throws when unauthorized', async () => {
    await expect(mocks.registeredTools['list_transactions'].handler(
      { limit: 20 },
      { authInfo: noAuth }
    )).rejects.toThrow('Unauthorized')
  })

  it('returns correct category name from FK join object', async () => {
    mocks.state.transactionRows = [tx({
      spending_categories: { name: 'Food', icon: '🍕' },
    })]

    const result = await mocks.registeredTools['list_transactions'].handler(
      { limit: 20 },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(parsed.transactions).toHaveLength(1)
    expect(parsed.transactions[0].transaction_id).toBe('tx-1')
    expect(parsed.transactions[0].category).toBe('Food')
    expect(parsed.transactions[0].icon).toBe('🍕')
    expect(parsed.returned).toBe(1)
  })

  it('handles null category as Uncategorized', async () => {
    mocks.state.transactionRows = [tx({
      category_id: null,
      spending_categories: null,
    })]

    const result = await mocks.registeredTools['list_transactions'].handler(
      { limit: 20 },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(parsed.transactions[0].category).toBe('Uncategorized')
    expect(parsed.transactions[0].icon).toBe('❓')
  })

  it('handles array-shaped category fallback gracefully', async () => {
    mocks.state.transactionRows = createFKJoinMock([
      tx({
        spending_categories: [{ name: 'Food', icon: '🍕' }],
      }),
    ]) as TransactionRow[]

    const result = await mocks.registeredTools['list_transactions'].handler(
      { limit: 20 },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(parsed.transactions[0].category).toBe('Food')
    expect(parsed.transactions[0].icon).toBe('🍕')
  })

  it('filters by merchant after data transformation', async () => {
    mocks.state.transactionRows = [
      tx({ id: 'tx-1', merchant: 'Chai Point', amount: 120 }),
      tx({ id: 'tx-2', merchant: 'Metro Rail', amount: 80, category_id: 'cat-transport', spending_categories: { name: 'Transport', icon: '🚗' } }),
    ]

    const result = await mocks.registeredTools['list_transactions'].handler(
      { limit: 20, merchant: 'chai' },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(parsed.transactions).toHaveLength(1)
    expect(parsed.transactions[0].merchant).toBe('Chai Point')
    expect(parsed.transactions[0].amount).toBe(120)
  })

  it('resolves category filter to category id before listing', async () => {
    const result = await mocks.registeredTools['list_transactions'].handler(
      { limit: 20, category: 'Food' },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(mocks.listTransactions).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      categoryId: 'cat-food',
      limit: 20,
    }))
    expect(parsed.transactions[0].category).toBe('Food')
  })

  it('passes undefined category id when category lookup has no match', async () => {
    mocks.state.categoryLookup = null

    const result = await mocks.registeredTools['list_transactions'].handler(
      { limit: 20, category: 'Missing' },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(mocks.listTransactions).toHaveBeenCalledWith(expect.objectContaining({
      categoryId: undefined,
    }))
    expect(parsed.total).toBe(1)
  })
})

describe('add_transaction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.state.categoryLookup = { id: 'cat-food' }
  })

  it('throws when unauthorized', async () => {
    await expect(mocks.registeredTools['add_transaction'].handler(
      { amount: 100 },
      { authInfo: noAuth }
    )).rejects.toThrow('Unauthorized')
  })

  it('maps category name correctly in response', async () => {
    const result = await mocks.registeredTools['add_transaction'].handler(
      { amount: 200, merchant: ' Chai Point ', category: 'Food', note: ' masala chai ', date: '2025-01-15' },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(parsed.transaction_id).toBe('tx-created')
    expect(parsed.amount).toBe(200)
    expect(parsed.merchant).toBe('Chai Point')
    expect(parsed.category).toBe('Food')
    expect(parsed.message).toBe('₹200 recorded at  Chai Point ')
    expect(mocks.createTransaction).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      amount: 200,
      merchant: 'Chai Point',
      categoryId: 'cat-food',
      note: 'masala chai',
      sourceApp: 'manual',
      isAutoDetected: false,
    }))
  })

  it('uses Uncategorized when no category is provided', async () => {
    const result = await mocks.registeredTools['add_transaction'].handler(
      { amount: 75, merchant: 'Cash' },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(parsed.category).toBe('Uncategorized')
    expect(mocks.createTransaction).toHaveBeenCalledWith(expect.objectContaining({
      categoryId: undefined,
    }))
  })

  it('uses the current date when no transaction date is provided', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-20T10:00:00.000Z'))

    await mocks.registeredTools['add_transaction'].handler(
      { amount: 125 },
      { authInfo }
    )

    expect(mocks.createTransaction).toHaveBeenCalledWith(expect.objectContaining({
      transactionDate: '2025-01-20T10:00:00.000Z',
    }))
    vi.useRealTimers()
  })
})

describe('get_uncategorized', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.state.transactionRows = [
      tx({ id: 'tx-food', category_id: 'cat-food', spending_categories: { name: 'Food', icon: '🍕' } }),
      tx({ id: 'tx-null-1', amount: 99, category_id: null, spending_categories: null }),
      tx({ id: 'tx-null-2', amount: 149, merchant: 'Unknown Store', category_id: null, spending_categories: null }),
    ]
  })

  it('throws when unauthorized', async () => {
    await expect(mocks.registeredTools['get_uncategorized'].handler(
      { limit: 10 },
      { authInfo: noAuth }
    )).rejects.toThrow('Unauthorized')
  })

  it('returns only null-category transactions', async () => {
    const result = await mocks.registeredTools['get_uncategorized'].handler(
      { limit: 10 },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(mocks.listTransactions).toHaveBeenCalledWith({
      userId: 'user-1',
      uncategorizedOnly: true,
      limit: 10,
    })
    expect(parsed.uncategorized_count).toBe(2)
    expect(parsed.transactions.map((row: { transaction_id: string }) => row.transaction_id)).toEqual(['tx-null-1', 'tx-null-2'])
    expect(parsed.transactions[0].amount).toBe(99)
    expect(parsed.message).toBe('2 transactions need categorization')
  })

  it('returns the all categorized message when no uncategorized transactions remain', async () => {
    mocks.state.transactionRows = [
      tx({ id: 'tx-food', category_id: 'cat-food', spending_categories: { name: 'Food', icon: '🍕' } }),
    ]

    const result = await mocks.registeredTools['get_uncategorized'].handler(
      { limit: 10 },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(parsed.uncategorized_count).toBe(0)
    expect(parsed.transactions).toEqual([])
    expect(parsed.message).toBe('All transactions are categorized! 🎉')
  })
})

describe('update_transaction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.state.categoryLookup = { id: 'cat-food' }
  })

  it('throws when unauthorized', async () => {
    await expect(mocks.registeredTools['update_transaction'].handler(
      { transaction_id: 'tx-1', amount: 450 },
      { authInfo: noAuth }
    )).rejects.toThrow('Unauthorized')
  })

  it('updates transaction fields after resolving category name', async () => {
    const result = await mocks.registeredTools['update_transaction'].handler(
      { transaction_id: 'tx-1', category: 'Food', merchant: 'Cafe', amount: 450, note: 'Lunch' },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(mocks.updateTransaction).toHaveBeenCalledWith('user-1', 'tx-1', {
      categoryId: 'cat-food',
      merchant: 'Cafe',
      amount: 450,
      note: 'Lunch',
    })
    expect(parsed).toEqual(expect.objectContaining({
      transaction_id: 'tx-1',
      amount: 450,
      merchant: 'Cafe',
      note: 'Lunch',
      message: 'Transaction updated',
    }))
  })

  it('updates transaction without category lookup when category is omitted', async () => {
    const result = await mocks.registeredTools['update_transaction'].handler(
      { transaction_id: 'tx-2', merchant: 'Cafe' },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(mocks.mockClient.from).not.toHaveBeenCalled()
    expect(mocks.updateTransaction).toHaveBeenCalledWith('user-1', 'tx-2', {
      categoryId: undefined,
      merchant: 'Cafe',
      amount: undefined,
      note: undefined,
    })
    expect(parsed.transaction_id).toBe('tx-2')
  })
})

describe('delete_transaction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws when unauthorized', async () => {
    await expect(mocks.registeredTools['delete_transaction'].handler(
      { transaction_id: 'tx-1' },
      { authInfo: noAuth }
    )).rejects.toThrow('Unauthorized')
  })

  it('deletes a transaction and returns confirmation', async () => {
    const result = await mocks.registeredTools['delete_transaction'].handler(
      { transaction_id: 'tx-1' },
      { authInfo }
    )

    expect(mocks.deleteTransaction).toHaveBeenCalledWith('user-1', 'tx-1')
    expect(parseToolResult(result)).toEqual({
      deleted: true,
      transaction_id: 'tx-1',
      message: 'Transaction permanently deleted',
    })
  })

  it('returns tool error when deleting fails with an Error', async () => {
    mocks.deleteTransaction.mockRejectedValueOnce(new Error('Transaction not found'))

    const result = await mocks.registeredTools['delete_transaction'].handler(
      { transaction_id: 'tx-missing' },
      { authInfo }
    )

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: Transaction not found')
  })

  it('returns fallback not found message when deleting throws a non-Error value', async () => {
    mocks.deleteTransaction.mockRejectedValueOnce('missing')

    const result = await mocks.registeredTools['delete_transaction'].handler(
      { transaction_id: 'tx-missing' },
      { authInfo }
    )

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: Transaction not found')
  })
})

describe('get_transaction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws when unauthorized', async () => {
    await expect(mocks.registeredTools['get_transaction'].handler(
      { transaction_id: 'tx-1' },
      { authInfo: noAuth }
    )).rejects.toThrow('Unauthorized')
  })

  it('returns error when transaction not found', async () => {
    mocks.getTransaction.mockResolvedValue(null)

    const result = await mocks.registeredTools['get_transaction'].handler(
      { transaction_id: '00000000-0000-0000-0000-000000000000' },
      { authInfo }
    )

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: Transaction not found')
  })

  it('returns transaction with category', async () => {
    mocks.getTransaction.mockResolvedValue({
      id: 'tx-1',
      amount: 200,
      merchant: 'Chai Point',
      source_app: 'manual',
      note: 'Morning chai',
      category_id: 'cat-food',
      is_auto_detected: false,
      raw_sms: null,
      transaction_date: '2026-04-15T06:30:00.000Z',
      created_at: '2026-04-15T06:30:00.000Z',
      updated_at: '2026-04-15T06:30:00.000Z',
      spending_categories: { name: 'Food', icon: '🍕' },
    })

    const result = await mocks.registeredTools['get_transaction'].handler(
      { transaction_id: 'tx-1' },
      { authInfo }
    )
    const parsed = parseToolResult(result)

    expect(mocks.getTransaction).toHaveBeenCalledWith('user-1', 'tx-1')
    expect(parsed.transaction_id).toBe('tx-1')
    expect(parsed.amount).toBe(200)
    expect(parsed.category).toBe('Food')
    expect(parsed.icon).toBe('🍕')
  })

  it('returns null category when uncategorized', async () => {
    mocks.getTransaction.mockResolvedValue({
      id: 'tx-2',
      amount: 500,
      merchant: null,
      source_app: null,
      note: null,
      category_id: null,
      is_auto_detected: false,
      raw_sms: null,
      transaction_date: '2026-04-15T06:30:00.000Z',
      created_at: '2026-04-15T06:30:00.000Z',
      updated_at: null,
      spending_categories: null,
    })

    const result = await mocks.registeredTools['get_transaction'].handler(
      { transaction_id: 'tx-2' },
      { authInfo }
    )
    const parsed = parseToolResult(result)

    expect(parsed.category).toBeNull()
    expect(parsed.icon).toBeNull()
    expect(parsed.updated_at).toBeNull()
  })
})

describe('list_categories', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listCategories.mockResolvedValue([
      { id: 'cat-food', name: 'Food', icon: '🍕', is_preset: true, created_at: '2026-04-01T00:00:00.000Z' },
      { id: 'cat-custom', name: 'Pets', icon: '🐶', is_preset: false, created_at: '2026-04-10T00:00:00.000Z' },
    ])
  })

  it('throws when unauthorized', async () => {
    await expect(mocks.registeredTools['list_categories'].handler({}, { authInfo: noAuth }))
      .rejects.toThrow('Unauthorized')
  })

  it('returns categories with preset flag', async () => {
    const result = await mocks.registeredTools['list_categories'].handler({}, { authInfo })
    const parsed = parseToolResult(result)

    expect(mocks.listCategories).toHaveBeenCalledWith('user-1')
    expect(parsed.total).toBe(2)
    expect(parsed.categories[0].name).toBe('Food')
    expect(parsed.categories[0].is_preset).toBe(true)
    expect(parsed.categories[1].is_preset).toBe(false)
  })

  it('surfaces library errors', async () => {
    mocks.listCategories.mockRejectedValue(new Error('DB down'))

    const result = await mocks.registeredTools['list_categories'].handler({}, { authInfo })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: DB down')
  })
})

describe('create_category', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws when unauthorized', async () => {
    await expect(mocks.registeredTools['create_category'].handler(
      { name: 'Pets', icon: '🐶' },
      { authInfo: noAuth }
    )).rejects.toThrow('Unauthorized')
  })

  it('creates a category', async () => {
    const result = await mocks.registeredTools['create_category'].handler(
      { name: 'Pets', icon: '🐶' },
      { authInfo }
    )
    const parsed = parseToolResult(result)

    expect(mocks.createCategory).toHaveBeenCalledWith('user-1', 'Pets', '🐶')
    expect(parsed.category_id).toBe('cat-new')
    expect(parsed.name).toBe('Pets')
    expect(parsed.is_preset).toBe(false)
  })

  it('surfaces duplicate-name error', async () => {
    mocks.createCategory.mockRejectedValue(new Error('Category already exists'))

    const result = await mocks.registeredTools['create_category'].handler(
      { name: 'Food', icon: '🍕' },
      { authInfo }
    )
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: Category already exists')
  })
})

describe('update_category', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws when unauthorized', async () => {
    await expect(mocks.registeredTools['update_category'].handler(
      { category_id: 'cat-1', name: 'New' },
      { authInfo: noAuth }
    )).rejects.toThrow('Unauthorized')
  })

  it('renames a category', async () => {
    const result = await mocks.registeredTools['update_category'].handler(
      { category_id: 'cat-custom', name: 'Dogs', icon: '🐕' },
      { authInfo }
    )
    const parsed = parseToolResult(result)

    expect(mocks.updateCategory).toHaveBeenCalledWith('user-1', 'cat-custom', { name: 'Dogs', icon: '🐕' })
    expect(parsed.name).toBe('Dogs')
    expect(parsed.icon).toBe('🐕')
  })

  it('blocks edits on preset categories', async () => {
    mocks.updateCategory.mockRejectedValue(new Error('Cannot edit preset categories'))

    const result = await mocks.registeredTools['update_category'].handler(
      { category_id: 'cat-food', name: 'X' },
      { authInfo }
    )
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: Cannot edit preset categories')
  })
})

describe('delete_category', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws when unauthorized', async () => {
    await expect(mocks.registeredTools['delete_category'].handler(
      { category_id: 'cat-1' },
      { authInfo: noAuth }
    )).rejects.toThrow('Unauthorized')
  })

  it('deletes a user category', async () => {
    const result = await mocks.registeredTools['delete_category'].handler(
      { category_id: 'cat-custom' },
      { authInfo }
    )
    const parsed = parseToolResult(result)

    expect(mocks.deleteCategory).toHaveBeenCalledWith('user-1', 'cat-custom')
    expect(parsed).toEqual({
      deleted: true,
      category_id: 'cat-custom',
      message: 'Category deleted',
    })
  })

  it('blocks preset deletion', async () => {
    mocks.deleteCategory.mockRejectedValue(new Error('Cannot delete preset categories'))

    const result = await mocks.registeredTools['delete_category'].handler(
      { category_id: 'cat-food' },
      { authInfo }
    )
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: Cannot delete preset categories')
  })
})
