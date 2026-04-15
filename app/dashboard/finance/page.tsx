'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'

interface Transaction {
  id: string
  amount: number
  merchant: string | null
  category_id: string | null
  note: string | null
  transaction_date: string
  spending_categories: { name: string; icon: string } | null
}

interface CategorySummary {
  name: string
  icon: string
  total: number
  pct: number
}

export default function FinancePage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<CategorySummary[]>([])
  const [totalSpent, setTotalSpent] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [catList, setCatList] = useState<{ id: string; name: string; icon: string }[]>([])
  const [newTx, setNewTx] = useState({ amount: '', merchant: '', category_id: '', note: '' })

  const loadData = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)

    const [txRes, catRes] = await Promise.all([
      supabase
        .from('transactions')
        .select('*, spending_categories(name, icon)')
        .eq('user_id', user.id)
        .gte('transaction_date', monthStart.toISOString())
        .order('transaction_date', { ascending: false }),
      supabase
        .from('spending_categories')
        .select('id, name, icon')
        .eq('user_id', user.id)
        .order('name'),
    ])

    const txs = (txRes.data ?? []) as Transaction[]
    setCatList(catRes.data ?? [])
    setTransactions(txs)

    const total = txs.reduce((s, t) => s + Number(t.amount), 0)
    setTotalSpent(total)

    // Group by category
    const map = new Map<string, { name: string; icon: string; total: number }>()
    txs.forEach(t => {
      const name = t.spending_categories?.name ?? 'Uncategorized'
      const icon = t.spending_categories?.icon ?? '❓'
      const existing = map.get(name) ?? { name, icon, total: 0 }
      existing.total += Number(t.amount)
      map.set(name, existing)
    })
    const sorted = [...map.values()].sort((a, b) => b.total - a.total)
    setCategories(sorted.map(c => ({ ...c, pct: total > 0 ? Math.round((c.total / total) * 100) : 0 })))
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  async function addExpense(e: React.FormEvent) {
    e.preventDefault()
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase.from('transactions').insert({
      user_id: user.id,
      amount: parseFloat(newTx.amount),
      merchant: newTx.merchant || null,
      category_id: newTx.category_id || null,
      note: newTx.note || null,
      transaction_date: new Date().toISOString(),
      source_app: 'manual',
    })

    setNewTx({ amount: '', merchant: '', category_id: '', note: '' })
    setShowAdd(false)
    loadData()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">Finance</h1>
        <button
          onClick={() => setShowAdd(true)}
          className="px-4 py-2 rounded-lg bg-accent-blue hover:bg-accent-blue/90 text-white text-sm font-medium transition-all"
        >
          Add Expense
        </button>
      </div>

      {/* Total spent */}
      <div className="glass rounded-2xl p-6 mb-8">
        <p className="text-xs text-text-secondary mb-1">Spent this month</p>
        <p className="text-3xl font-bold text-text-primary">₹{totalSpent.toLocaleString('en-IN')}</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        {/* By category */}
        <div className="glass rounded-2xl p-5">
          <h3 className="text-sm font-semibold mb-4">By Category</h3>
          {categories.length === 0 ? (
            <p className="text-text-muted text-xs">No spending this month</p>
          ) : (
            <div className="space-y-3">
              {categories.map(c => (
                <div key={c.name} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-text-secondary">{c.icon} {c.name}</span>
                    <span className="text-text-muted">₹{c.total.toLocaleString('en-IN')} ({c.pct}%)</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/5">
                    <motion.div
                      className="h-full rounded-full bg-accent-cyan"
                      initial={{ width: 0 }}
                      animate={{ width: `${c.pct}%` }}
                      transition={{ duration: 0.8 }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent transactions */}
        <div className="glass rounded-2xl p-5">
          <h3 className="text-sm font-semibold mb-4">Recent Transactions</h3>
          {transactions.length === 0 ? (
            <p className="text-text-muted text-xs">No transactions yet</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {transactions.slice(0, 15).map(t => (
                <div key={t.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm">{t.spending_categories?.icon ?? '💰'}</span>
                    <div className="min-w-0">
                      <p className="text-sm text-text-primary truncate">{t.merchant ?? t.note ?? 'Transaction'}</p>
                      <p className="text-xs text-text-muted">{new Date(t.transaction_date).toLocaleDateString('en-IN')}</p>
                    </div>
                  </div>
                  <span className="text-sm font-medium text-text-primary ml-2 whitespace-nowrap">₹{Number(t.amount).toLocaleString('en-IN')}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add expense modal */}
      <AnimatePresence>
        {showAdd && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
            onClick={() => setShowAdd(false)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="glass rounded-2xl p-6 w-full max-w-sm"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-semibold mb-4">Add Expense</h2>
              <form onSubmit={addExpense} className="space-y-3">
                <input
                  type="number"
                  step="0.01"
                  placeholder="Amount (₹)"
                  value={newTx.amount}
                  onChange={(e) => setNewTx({ ...newTx, amount: e.target.value })}
                  required
                  className="w-full px-3 py-2 rounded-lg bg-[#1f2937] border border-white/10 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-blue/50"
                />
                <input
                  type="text"
                  placeholder="Merchant"
                  value={newTx.merchant}
                  onChange={(e) => setNewTx({ ...newTx, merchant: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-[#1f2937] border border-white/10 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-blue/50"
                />
                <select
                  value={newTx.category_id}
                  onChange={(e) => setNewTx({ ...newTx, category_id: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-[#1f2937] border border-white/10 text-sm text-text-primary focus:outline-none"
                >
                  <option value="">Select category</option>
                  {catList.map(c => (
                    <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Note"
                  value={newTx.note}
                  onChange={(e) => setNewTx({ ...newTx, note: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-[#1f2937] border border-white/10 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-blue/50"
                />
                <div className="flex gap-2 pt-2">
                  <button type="submit" className="flex-1 py-2 rounded-lg bg-accent-blue text-white text-sm font-medium">Save</button>
                  <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-lg border border-white/10 text-text-secondary text-sm">Cancel</button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
