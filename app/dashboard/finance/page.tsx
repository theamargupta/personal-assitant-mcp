'use client'

import { useEffect, useState, useCallback, type FormEvent } from 'react'
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

interface Category {
  id: string
  name: string
  icon: string
  is_preset: boolean
}

interface CategorySummary {
  name: string
  icon: string
  total: number
  pct: number
}

interface TransactionForm {
  amount: string
  merchant: string
  category_id: string
  note: string
  transaction_date: string
}

const emptyTx = { amount: '', merchant: '', category_id: '', note: '' }
const inputClass = 'w-full px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.06] text-text-primary text-[14px] placeholder:text-text-muted focus:outline-none focus:border-neon/30 focus:ring-1 focus:ring-neon/20'

function toDateInputValue(date: string) {
  return new Date(date).toISOString().split('T')[0]
}

export default function FinancePage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<CategorySummary[]>([])
  const [totalSpent, setTotalSpent] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [showCategories, setShowCategories] = useState(false)
  const [catList, setCatList] = useState<Category[]>([])
  const [newTx, setNewTx] = useState(emptyTx)
  const [editingTx, setEditingTx] = useState<Transaction | null>(null)
  const [editTxForm, setEditTxForm] = useState<TransactionForm>({
    amount: '',
    merchant: '',
    category_id: '',
    note: '',
    transaction_date: '',
  })
  const [deleteTxTarget, setDeleteTxTarget] = useState<Transaction | null>(null)
  const [newCategory, setNewCategory] = useState({ name: '', icon: '💰' })
  const [txFilter, setTxFilter] = useState<'all' | 'uncategorized'>('all')
  const [toast, setToast] = useState('')

  const showToast = useCallback((message: string) => {
    setToast(message)
    setTimeout(() => setToast(''), 2000)
  }, [])

  const loadData = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }

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
        .select('id, name, icon, is_preset')
        .eq('user_id', user.id)
        .order('is_preset', { ascending: false })
        .order('name', { ascending: true }),
    ])

    const txs = (txRes.data ?? []) as Transaction[]
    setCatList((catRes.data ?? []) as Category[])
    setTransactions(txs)

    const total = txs.reduce((sum, tx) => sum + Number(tx.amount), 0)
    setTotalSpent(total)

    const map = new Map<string, { name: string; icon: string; total: number }>()
    txs.forEach((tx) => {
      const name = tx.spending_categories?.name ?? 'Uncategorized'
      const icon = tx.spending_categories?.icon ?? '❓'
      const existing = map.get(name) ?? { name, icon, total: 0 }
      existing.total += Number(tx.amount)
      map.set(name, existing)
    })
    const sorted = [...map.values()].sort((a, b) => b.total - a.total)
    setCategories(sorted.map((category) => ({ ...category, pct: total > 0 ? Math.round((category.total / total) * 100) : 0 })))
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  async function addExpense(e: FormEvent) {
    e.preventDefault()
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase.from('transactions').insert({
      user_id: user.id,
      amount: parseFloat(newTx.amount),
      merchant: newTx.merchant.trim() || null,
      category_id: newTx.category_id || null,
      note: newTx.note.trim() || null,
      transaction_date: new Date().toISOString(),
      source_app: 'manual',
    })

    if (error) {
      showToast(error.message)
      return
    }

    setNewTx(emptyTx)
    setShowAdd(false)
    await loadData()
    showToast('Expense added')
  }

  function openEditTransaction(transaction: Transaction) {
    setEditingTx(transaction)
    setEditTxForm({
      amount: String(Number(transaction.amount)),
      merchant: transaction.merchant ?? '',
      category_id: transaction.category_id ?? '',
      note: transaction.note ?? '',
      transaction_date: toDateInputValue(transaction.transaction_date),
    })
  }

  async function updateTransaction(e: FormEvent) {
    e.preventDefault()
    if (!editingTx) return

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase
      .from('transactions')
      .update({
        amount: parseFloat(editTxForm.amount),
        merchant: editTxForm.merchant.trim() || null,
        category_id: editTxForm.category_id || null,
        note: editTxForm.note.trim() || null,
        transaction_date: new Date(`${editTxForm.transaction_date}T00:00:00.000Z`).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', editingTx.id)
      .eq('user_id', user.id)

    if (error) {
      showToast(error.message)
      return
    }

    setEditingTx(null)
    await loadData()
    showToast('Transaction updated')
  }

  async function deleteTransaction() {
    if (!deleteTxTarget) return
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', deleteTxTarget.id)
      .eq('user_id', user.id)

    if (error) {
      showToast(error.message)
      return
    }

    setDeleteTxTarget(null)
    await loadData()
    showToast('Transaction deleted')
  }

  async function assignCategory(transactionId: string, categoryId: string) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase
      .from('transactions')
      .update({ category_id: categoryId || null, updated_at: new Date().toISOString() })
      .eq('id', transactionId)
      .eq('user_id', user.id)

    if (error) {
      showToast(error.message)
      return
    }

    await loadData()
    showToast('Category assigned')
  }

  async function addCategory(e: FormEvent) {
    e.preventDefault()
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase.from('spending_categories').insert({
      user_id: user.id,
      name: newCategory.name.trim(),
      icon: newCategory.icon.trim() || '💰',
      is_preset: false,
    })

    if (error) {
      showToast(error.message.includes('duplicate') ? 'Category already exists' : error.message)
      return
    }

    setNewCategory({ name: '', icon: '💰' })
    await loadData()
    showToast('Category added')
  }

  async function deleteCategory(category: Category) {
    if (category.is_preset) {
      showToast('Preset categories cannot be deleted')
      return
    }

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase
      .from('spending_categories')
      .delete()
      .eq('id', category.id)
      .eq('user_id', user.id)
      .eq('is_preset', false)

    if (error) {
      showToast(error.message)
      return
    }

    await loadData()
    showToast('Category deleted')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-neon border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const displayedTransactions = txFilter === 'uncategorized'
    ? transactions.filter((transaction) => !transaction.category_id)
    : transactions

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-[22px] font-bold text-text-primary tracking-[-0.02em]">Finance</h1>
        <button
          onClick={() => setShowAdd(true)}
          className="px-4 py-2 rounded-lg bg-neon text-bg-primary hover:bg-neon-muted text-sm font-semibold transition-all"
        >
          Add Expense
        </button>
      </div>

      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 mb-8">
        <p className="text-[11px] font-semibold text-neon uppercase tracking-[0.15em] mb-2">Spent this month</p>
        <p className="text-3xl font-bold text-text-primary">₹{totalSpent.toLocaleString('en-IN')}</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[11px] font-semibold text-neon uppercase tracking-[0.15em]">By Category</h3>
            <button
              onClick={() => setShowCategories(true)}
              className="h-8 w-8 rounded-lg border border-white/[0.08] text-text-secondary hover:text-text-primary hover:border-white/[0.12] transition-all"
              aria-label="Manage categories"
            >
              ⚙
            </button>
          </div>
          {categories.length === 0 ? (
            <p className="text-text-muted text-xs">No spending this month</p>
          ) : (
            <div className="space-y-3">
              {categories.map((category) => (
                <div key={category.name} className="space-y-1">
                  <div className="flex justify-between gap-3 text-xs">
                    <span className="text-text-secondary truncate">{category.icon} {category.name}</span>
                    <span className="text-text-muted whitespace-nowrap">₹{category.total.toLocaleString('en-IN')} ({category.pct}%)</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/[0.04]">
                    <motion.div
                      className="h-full rounded-full bg-neon"
                      initial={{ width: 0 }}
                      animate={{ width: `${category.pct}%` }}
                      transition={{ duration: 0.8 }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <h3 className="text-[11px] font-semibold text-neon uppercase tracking-[0.15em]">Recent Transactions</h3>
            <div className="flex gap-2">
              {(['all', 'uncategorized'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setTxFilter(filter)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize ${
                    txFilter === filter ? 'bg-neon/[0.1] text-neon' : 'text-text-muted hover:text-text-secondary'
                  }`}
                >
                  {filter === 'all' ? 'All' : 'Uncategorized'}
                </button>
              ))}
            </div>
          </div>
          {displayedTransactions.length === 0 ? (
            <p className="text-text-muted text-xs">No transactions found</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {displayedTransactions.slice(0, 30).map((transaction) => (
                <div
                  key={transaction.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openEditTransaction(transaction)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      openEditTransaction(transaction)
                    }
                  }}
                  className="w-full flex items-center justify-between gap-3 py-2 border-b border-white/[0.04] last:border-0 text-left group"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm">{transaction.spending_categories?.icon ?? '💰'}</span>
                    <div className="min-w-0">
                      <p className="text-sm text-text-primary truncate">{transaction.merchant ?? transaction.note ?? 'Transaction'}</p>
                      <p className="text-xs text-text-muted">{new Date(transaction.transaction_date).toLocaleDateString('en-IN')}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {txFilter === 'uncategorized' && (
                      <select
                        value={transaction.category_id ?? ''}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => assignCategory(transaction.id, e.target.value)}
                        className="max-w-36 px-2 py-1 rounded-lg bg-white/[0.02] border border-white/[0.06] text-text-primary text-xs focus:outline-none focus:border-neon/30"
                      >
                        <option value="">Category</option>
                        {catList.map((category) => (
                          <option key={category.id} value={category.id}>{category.icon} {category.name}</option>
                        ))}
                      </select>
                    )}
                    <span className="text-sm font-medium text-text-primary whitespace-nowrap">₹{Number(transaction.amount).toLocaleString('en-IN')}</span>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeleteTxTarget(transaction)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          e.stopPropagation()
                          setDeleteTxTarget(transaction)
                        }
                      }}
                      className="h-8 w-8 rounded-lg bg-red-500/[0.1] text-red-400 border border-red-500/[0.15] hover:bg-red-500/[0.2] transition-all opacity-100 sm:opacity-0 sm:group-hover:opacity-100 flex items-center justify-center"
                      aria-label="Delete transaction"
                    >
                      🗑
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showAdd && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
            onClick={() => setShowAdd(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="rounded-2xl border border-white/[0.06] bg-bg-surface p-6 w-full max-w-sm"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-semibold text-text-primary mb-4">Add Expense</h2>
              <form onSubmit={addExpense} className="space-y-3">
                <input type="number" step="0.01" placeholder="Amount (₹)" value={newTx.amount} onChange={(e) => setNewTx({ ...newTx, amount: e.target.value })} required className={inputClass} />
                <input type="text" placeholder="Merchant" value={newTx.merchant} onChange={(e) => setNewTx({ ...newTx, merchant: e.target.value })} className={inputClass} />
                <select value={newTx.category_id} onChange={(e) => setNewTx({ ...newTx, category_id: e.target.value })} className={inputClass}>
                  <option value="">Select category</option>
                  {catList.map((category) => (
                    <option key={category.id} value={category.id}>{category.icon} {category.name}</option>
                  ))}
                </select>
                <input type="text" placeholder="Note" value={newTx.note} onChange={(e) => setNewTx({ ...newTx, note: e.target.value })} className={inputClass} />
                <div className="flex gap-2 pt-2">
                  <button type="submit" className="flex-1 py-2 rounded-lg bg-neon text-bg-primary hover:bg-neon-muted text-sm font-semibold transition-all">Save</button>
                  <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-lg border border-white/[0.08] text-text-secondary hover:text-text-primary text-sm transition-all">Cancel</button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editingTx && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
            onClick={() => setEditingTx(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="rounded-2xl border border-white/[0.06] bg-bg-surface p-6 w-full max-w-sm"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-semibold text-text-primary mb-4">Edit Transaction</h2>
              <form onSubmit={updateTransaction} className="space-y-3">
                <input type="number" step="0.01" placeholder="Amount (₹)" value={editTxForm.amount} onChange={(e) => setEditTxForm({ ...editTxForm, amount: e.target.value })} required className={inputClass} />
                <input type="text" placeholder="Merchant" value={editTxForm.merchant} onChange={(e) => setEditTxForm({ ...editTxForm, merchant: e.target.value })} className={inputClass} />
                <select value={editTxForm.category_id} onChange={(e) => setEditTxForm({ ...editTxForm, category_id: e.target.value })} className={inputClass}>
                  <option value="">Uncategorized</option>
                  {catList.map((category) => (
                    <option key={category.id} value={category.id}>{category.icon} {category.name}</option>
                  ))}
                </select>
                <input type="text" placeholder="Note" value={editTxForm.note} onChange={(e) => setEditTxForm({ ...editTxForm, note: e.target.value })} className={inputClass} />
                <input type="date" value={editTxForm.transaction_date} onChange={(e) => setEditTxForm({ ...editTxForm, transaction_date: e.target.value })} required className={inputClass} />
                <div className="flex gap-2 pt-2">
                  <button type="submit" className="flex-1 py-2 rounded-lg bg-neon text-bg-primary hover:bg-neon-muted text-sm font-semibold transition-all">Save</button>
                  <button type="button" onClick={() => setEditingTx(null)} className="px-4 py-2 rounded-lg border border-white/[0.08] text-text-secondary hover:text-text-primary text-sm transition-all">Cancel</button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCategories && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
            onClick={() => setShowCategories(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="rounded-2xl border border-white/[0.06] bg-bg-surface p-6 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-semibold text-text-primary mb-4">Manage Categories</h2>
              <div className="space-y-2 max-h-64 overflow-y-auto mb-4">
                {catList.map((category) => (
                  <div key={category.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.04] bg-white/[0.01] px-3 py-2">
                    <span className="text-sm text-text-primary truncate">{category.icon} {category.name}</span>
                    {category.is_preset ? (
                      <span className="text-xs text-text-muted">Preset</span>
                    ) : (
                      <button
                        onClick={() => deleteCategory(category)}
                        className="px-2.5 py-1 rounded-lg bg-red-500/[0.1] text-red-400 border border-red-500/[0.15] hover:bg-red-500/[0.2] text-xs transition-all"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <form onSubmit={addCategory} className="grid grid-cols-[64px_1fr_auto] gap-2">
                <input
                  type="text"
                  value={newCategory.icon}
                  onChange={(e) => setNewCategory({ ...newCategory, icon: e.target.value })}
                  className={inputClass}
                  aria-label="Category icon"
                />
                <input
                  type="text"
                  placeholder="Category name"
                  value={newCategory.name}
                  onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                  required
                  className={inputClass}
                />
                <button type="submit" className="px-4 py-2 rounded-lg bg-neon text-bg-primary hover:bg-neon-muted text-sm font-semibold transition-all">Add</button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteTxTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
            onClick={() => setDeleteTxTarget(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="rounded-2xl border border-white/[0.06] bg-bg-surface p-6 w-full max-w-sm"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-semibold text-text-primary mb-2">Delete this transaction?</h2>
              <p className="text-sm text-text-muted mb-5">₹{Number(deleteTxTarget.amount).toLocaleString('en-IN')} {deleteTxTarget.merchant ?? deleteTxTarget.note ?? ''}</p>
              <div className="flex gap-2">
                <button onClick={deleteTransaction} className="flex-1 py-2 rounded-lg bg-red-500/[0.1] text-red-400 border border-red-500/[0.15] hover:bg-red-500/[0.2] text-sm transition-all">Delete</button>
                <button onClick={() => setDeleteTxTarget(null)} className="px-4 py-2 rounded-lg border border-white/[0.08] text-text-secondary hover:text-text-primary text-sm transition-all">Cancel</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {toast && (
        <div className="fixed bottom-6 right-6 bg-bg-surface border border-white/[0.06] text-text-primary px-4 py-2.5 rounded-xl text-sm shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}
