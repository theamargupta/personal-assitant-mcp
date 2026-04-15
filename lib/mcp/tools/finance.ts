import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { toIST } from '@/types'
import { createTransaction, listTransactions, getSpendingSummary } from '@/lib/finance/transactions'
import { ensurePresetCategories } from '@/lib/finance/categories'

export function registerFinanceTools(server: McpServer) {

  // ── get_spending_summary ────────────────────────────────
  server.tool(
    'get_spending_summary',
    'Get total spending broken down by category for a date range. Use for questions like "is hafte kitna kharch hua?" or "how much did I spend on food this month?"',
    {
      start_date: z.string().describe('Start date (YYYY-MM-DD or ISO 8601)'),
      end_date: z.string().describe('End date (YYYY-MM-DD or ISO 8601)'),
    },
    async ({ start_date, end_date }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      const startISO = new Date(start_date + (start_date.includes('T') ? '' : 'T00:00:00+05:30')).toISOString()
      const endISO = new Date(end_date + (end_date.includes('T') ? '' : 'T23:59:59+05:30')).toISOString()

      const summary = await getSpendingSummary(userId, startISO, endISO)

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            period: { start: start_date, end: end_date },
            total_spent: summary.total_spent,
            breakdown: summary.breakdown.map((row: { category_name: string; category_icon: string; total_amount: number; transaction_count: number }) => ({
              category: row.category_name,
              icon: row.category_icon,
              amount: Number(row.total_amount),
              count: Number(row.transaction_count),
            })),
          }),
        }],
      }
    }
  )

  // ── list_transactions ───────────────────────────────────
  server.tool(
    'list_transactions',
    'List spending transactions with optional filters. Use for "show me my food expenses this week" or "last 10 transactions".',
    {
      category: z.string().optional().describe('Filter by category name (e.g. "Food", "Transport")'),
      start_date: z.string().optional().describe('Start date (YYYY-MM-DD)'),
      end_date: z.string().optional().describe('End date (YYYY-MM-DD)'),
      merchant: z.string().optional().describe('Filter by merchant name (partial match)'),
      limit: z.number().int().min(1).max(100).default(20).describe('Max results (default: 20)'),
    },
    async ({ category, start_date, end_date, merchant, limit }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      // Resolve category name to ID if provided
      let categoryId: string | undefined
      if (category) {
        const supabase = createServiceRoleClient()
        const { data: cat } = await supabase
          .from('spending_categories')
          .select('id')
          .eq('user_id', userId)
          .ilike('name', category)
          .maybeSingle()

        categoryId = cat?.id
      }

      const startISO = start_date
        ? new Date(start_date + 'T00:00:00+05:30').toISOString()
        : undefined
      const endISO = end_date
        ? new Date(end_date + 'T23:59:59+05:30').toISOString()
        : undefined

      const result = await listTransactions({
        userId,
        categoryId,
        startDate: startISO,
        endDate: endISO,
        limit,
      })

      let transactions = result.transactions

      // Client-side merchant filter (partial match)
      if (merchant) {
        const lower = merchant.toLowerCase()
        transactions = transactions.filter(
          (t: { merchant: string | null }) => t.merchant?.toLowerCase().includes(lower)
        )
      }

      const mapped = transactions.map((t: {
        id: string; amount: number; merchant: string | null;
        source_app: string | null; note: string | null;
        transaction_date: string; spending_categories: { name: string; icon: string }[] | null
      }) => ({
        transaction_id: t.id,
        amount: Number(t.amount),
        merchant: t.merchant,
        source: t.source_app,
        category: t.spending_categories?.[0]?.name || 'Uncategorized',
        icon: t.spending_categories?.[0]?.icon || '❓',
        note: t.note,
        date: toIST(new Date(t.transaction_date)),
      }))

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ transactions: mapped, total: result.total, returned: mapped.length }),
        }],
      }
    }
  )

  // ── add_transaction ─────────────────────────────────────
  server.tool(
    'add_transaction',
    'Manually add a spending transaction via chat. Use when user says "I spent 200 on chai" or "add 1500 rent payment".',
    {
      amount: z.number().positive().describe('Amount spent (in ₹)'),
      merchant: z.string().optional().describe('Where the money was spent'),
      category: z.string().optional().describe('Category name (e.g. "Food", "Bills")'),
      note: z.string().max(500).optional().describe('Optional note'),
      date: z.string().date().optional().describe('Transaction date (YYYY-MM-DD), defaults to today'),
    },
    async ({ amount, merchant, category, note, date }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      await ensurePresetCategories(userId)

      // Resolve category name to ID
      let categoryId: string | undefined
      if (category) {
        const supabase = createServiceRoleClient()
        const { data: cat } = await supabase
          .from('spending_categories')
          .select('id')
          .eq('user_id', userId)
          .ilike('name', category)
          .maybeSingle()

        categoryId = cat?.id
      }

      const txDate = date
        ? new Date(date + 'T12:00:00+05:30').toISOString()
        : new Date().toISOString()

      const transaction = await createTransaction({
        userId,
        amount,
        merchant: merchant?.trim(),
        sourceApp: 'manual',
        categoryId,
        note: note?.trim(),
        transactionDate: txDate,
        isAutoDetected: false,
      })

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            transaction_id: transaction.id,
            amount: Number(transaction.amount),
            merchant: transaction.merchant,
            category: category || 'Uncategorized',
            date: toIST(new Date(transaction.transaction_date)),
            message: `₹${amount} recorded${merchant ? ` at ${merchant}` : ''}`,
          }),
        }],
      }
    }
  )

  // ── get_uncategorized ───────────────────────────────────
  server.tool(
    'get_uncategorized',
    'Get transactions that have not been categorized yet. Useful for reminding user to categorize pending spends.',
    {
      limit: z.number().int().min(1).max(50).default(10).describe('Max results (default: 10)'),
    },
    async ({ limit }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      const result = await listTransactions({
        userId,
        uncategorizedOnly: true,
        limit,
      })

      const transactions = result.transactions.map((t: {
        id: string; amount: number; merchant: string | null;
        source_app: string | null; transaction_date: string
      }) => ({
        transaction_id: t.id,
        amount: Number(t.amount),
        merchant: t.merchant,
        source: t.source_app,
        date: toIST(new Date(t.transaction_date)),
      }))

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            uncategorized_count: result.total,
            transactions,
            message: result.total > 0
              ? `${result.total} transactions need categorization`
              : 'All transactions are categorized! 🎉',
          }),
        }],
      }
    }
  )
}
