import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { SourceApp } from '@/types'

interface CreateTransactionInput {
  userId: string
  amount: number
  merchant?: string
  sourceApp?: SourceApp
  categoryId?: string
  note?: string
  transactionDate?: string
  rawSms?: string
  isAutoDetected?: boolean
}

export async function createTransaction(input: CreateTransactionInput) {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('transactions')
    .insert({
      user_id: input.userId,
      amount: input.amount,
      merchant: input.merchant || null,
      source_app: input.sourceApp || null,
      category_id: input.categoryId || null,
      note: input.note || null,
      transaction_date: input.transactionDate || new Date().toISOString(),
      raw_sms: input.rawSms || null,
      is_auto_detected: input.isAutoDetected || false,
    })
    .select('id, amount, merchant, source_app, category_id, transaction_date, is_auto_detected, created_at')
    .single()

  if (error) throw new Error(error.message)
  return data
}

interface UpdateTransactionInput {
  categoryId?: string
  note?: string
  merchant?: string
  amount?: number
}

export async function updateTransaction(
  userId: string,
  transactionId: string,
  updates: UpdateTransactionInput
) {
  const supabase = createServiceRoleClient()
  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (updates.categoryId !== undefined) updateData.category_id = updates.categoryId
  if (updates.note !== undefined) updateData.note = updates.note
  if (updates.merchant !== undefined) updateData.merchant = updates.merchant
  if (updates.amount !== undefined) updateData.amount = updates.amount

  const { data, error } = await supabase
    .from('transactions')
    .update(updateData)
    .eq('id', transactionId)
    .eq('user_id', userId)
    .select('id, amount, merchant, source_app, category_id, note, transaction_date, updated_at')
    .single()

  if (error || !data) throw new Error('Transaction not found')
  return data
}

export async function deleteTransaction(userId: string, transactionId: string) {
  const supabase = createServiceRoleClient()
  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', transactionId)
    .eq('user_id', userId)

  if (error) throw new Error(error.message)
}

interface ListTransactionsInput {
  userId: string
  categoryId?: string
  startDate?: string
  endDate?: string
  uncategorizedOnly?: boolean
  limit?: number
  offset?: number
}

export async function listTransactions(input: ListTransactionsInput) {
  const supabase = createServiceRoleClient()
  let query = supabase
    .from('transactions')
    .select(`
      id, amount, merchant, source_app, category_id, note,
      transaction_date, is_auto_detected, created_at,
      spending_categories(name, icon)
    `, { count: 'exact' })
    .eq('user_id', input.userId)

  if (input.categoryId) query = query.eq('category_id', input.categoryId)
  if (input.startDate) query = query.gte('transaction_date', input.startDate)
  if (input.endDate) query = query.lte('transaction_date', input.endDate)
  if (input.uncategorizedOnly) query = query.is('category_id', null)

  const limit = input.limit || 50
  const offset = input.offset || 0

  const { data, count, error } = await query
    .order('transaction_date', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) throw new Error(error.message)
  return { transactions: data || [], total: count || 0 }
}

export async function getSpendingSummary(
  userId: string,
  startDate: string,
  endDate: string
) {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase.rpc('get_spending_summary', {
    target_user_id: userId,
    start_date: startDate,
    end_date: endDate,
  })

  if (error) throw new Error(error.message)

  const total = (data || []).reduce(
    (sum: number, row: { total_amount: number }) => sum + Number(row.total_amount),
    0
  )

  return { breakdown: data || [], total_spent: total }
}
