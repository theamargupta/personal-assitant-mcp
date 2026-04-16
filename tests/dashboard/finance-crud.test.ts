import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@/lib/supabase/client'

type QueryResult = { data?: any; error?: { message: string } | null }
type QueryChain = Record<string, ReturnType<typeof vi.fn>> & {
  then: (resolve: (value: QueryResult) => unknown, reject?: (reason: unknown) => unknown) => Promise<unknown>
}

type Transaction = {
  id: string
  amount: number
  merchant: string | null
  category_id: string | null
  note: string | null
  transaction_date: string
  spending_categories: { name: string; icon: string } | null
}

const mocks = vi.hoisted(() => ({
  supabase: {
    from: vi.fn(),
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'test-user' } }, error: null })),
    },
  },
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => mocks.supabase),
}))

const methods = ['select', 'insert', 'update', 'delete', 'eq', 'is', 'gte', 'order', 'single', 'maybeSingle']

function createQuery(result: QueryResult = { data: null, error: null }): QueryChain {
  const chain = {} as QueryChain
  for (const method of methods) chain[method] = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn().mockResolvedValue(result)
  chain.maybeSingle = vi.fn().mockResolvedValue(result)
  chain.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject)
  return chain
}

async function addExpense(form: {
  amount: string
  merchant: string
  category_id: string
  note: string
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return supabase.from('transactions').insert({
    user_id: user.id,
    amount: parseFloat(form.amount),
    merchant: form.merchant.trim() || null,
    category_id: form.category_id || null,
    note: form.note.trim() || null,
    transaction_date: new Date().toISOString(),
    source_app: 'manual',
  })
}

async function deleteTransaction(transactionId: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return supabase.from('transactions').delete().eq('id', transactionId).eq('user_id', user.id)
}

async function loadUncategorizedTransactions() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return supabase
    .from('transactions')
    .select('*, spending_categories(name, icon)')
    .eq('user_id', user.id)
    .is('category_id', null)
    .order('transaction_date', { ascending: false })
}

function groupByCategory(transactions: Transaction[]) {
  const total = transactions.reduce((sum, tx) => sum + Number(tx.amount), 0)
  const map = new Map<string, { name: string; icon: string; total: number }>()

  for (const tx of transactions) {
    const name = tx.spending_categories?.name ?? 'Uncategorized'
    const icon = tx.spending_categories?.icon ?? '❓'
    const existing = map.get(name) ?? { name, icon, total: 0 }
    existing.total += Number(tx.amount)
    map.set(name, existing)
  }

  return [...map.values()]
    .sort((a, b) => b.total - a.total)
    .map((category) => ({
      ...category,
      pct: total > 0 ? Math.round((category.total / total) * 100) : 0,
    }))
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-04-16T06:30:00.000Z'))
  mocks.supabase.from.mockReturnValue(createQuery({ error: null }))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('dashboard finance CRUD logic', () => {
  it('add expense includes all fields', async () => {
    const chain = createQuery({ error: null })
    mocks.supabase.from.mockReturnValue(chain)

    await addExpense({
      amount: '250.50',
      merchant: ' Chai Point ',
      category_id: 'cat-food',
      note: ' masala chai ',
    })

    expect(mocks.supabase.from).toHaveBeenCalledWith('transactions')
    expect(chain.insert).toHaveBeenCalledWith({
      user_id: 'test-user',
      amount: 250.5,
      merchant: 'Chai Point',
      category_id: 'cat-food',
      note: 'masala chai',
      transaction_date: '2026-04-16T06:30:00.000Z',
      source_app: 'manual',
    })
  })

  it('delete transaction calls correct endpoint', async () => {
    const chain = createQuery({ error: null })
    mocks.supabase.from.mockReturnValue(chain)

    await deleteTransaction('tx-1')

    expect(mocks.supabase.from).toHaveBeenCalledWith('transactions')
    expect(chain.delete).toHaveBeenCalled()
    expect(chain.eq).toHaveBeenCalledWith('id', 'tx-1')
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'test-user')
  })

  it('category grouping math', () => {
    const grouped = groupByCategory([
      { id: 'tx-1', amount: 300, merchant: 'Cafe', category_id: 'cat-food', note: null, transaction_date: '2026-04-01T00:00:00Z', spending_categories: { name: 'Food', icon: '🍕' } },
      { id: 'tx-2', amount: 200, merchant: 'Snacks', category_id: 'cat-food', note: null, transaction_date: '2026-04-02T00:00:00Z', spending_categories: { name: 'Food', icon: '🍕' } },
      { id: 'tx-3', amount: 500, merchant: 'Metro', category_id: 'cat-transport', note: null, transaction_date: '2026-04-03T00:00:00Z', spending_categories: { name: 'Transport', icon: '🚗' } },
    ])

    expect(grouped).toEqual([
      { name: 'Food', icon: '🍕', total: 500, pct: 50 },
      { name: 'Transport', icon: '🚗', total: 500, pct: 50 },
    ])
  })

  it('uncategorized filter shows null category_id transactions', async () => {
    const chain = createQuery({ data: [], error: null })
    mocks.supabase.from.mockReturnValue(chain)

    await loadUncategorizedTransactions()

    expect(chain.select).toHaveBeenCalledWith('*, spending_categories(name, icon)')
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'test-user')
    expect(chain.is).toHaveBeenCalledWith('category_id', null)
  })
})
