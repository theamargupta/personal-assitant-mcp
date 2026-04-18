'use client'

import { useEffect, useState, useCallback, type FormEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { Card, Chip, DashboardHero, EmptyState, ProgressBar, SectionHeader, StatCard } from '@/components/dashboard/kit'

interface Habit {
  id: string
  name: string
  color: string
  frequency: 'daily' | 'weekly' | 'monthly'
  description: string | null
  reminder_time: string | null
  created_at: string
}

interface HabitWithStats extends Habit {
  currentStreak: number
  completionPct: number
  bestStreak: number
  lastLogged: string | null
  loggedToday: boolean
  recentDates: string[]
  allDates: string[]
}

interface HabitForm {
  name: string
  frequency: 'daily' | 'weekly' | 'monthly'
  description: string
  color: string
  reminder_time: string
}

const presetColors = ['#c8ff00', '#fafafa', '#22c55e', '#38bdf8', '#f97316', '#ef4444']
const emptyHabitForm: HabitForm = { name: '', frequency: 'daily', description: '', color: '#c8ff00', reminder_time: '' }
const inputClass = 'w-full rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[14px] text-text-primary placeholder:text-text-muted focus:border-neon/30 focus:outline-none focus:ring-1 focus:ring-neon/20'
const frequencies = ['all', 'daily', 'weekly', 'monthly'] as const

function isoDate(date: Date) {
  return date.toISOString().split('T')[0]
}

function getLastThirtyDays() {
  return Array.from({ length: 30 }, (_, index) => {
    const date = new Date()
    date.setDate(date.getDate() - (29 - index))
    return isoDate(date)
  })
}

function getBestStreak(dates: string[]) {
  const uniqueDates = [...new Set(dates)].sort()
  let best = 0
  let current = 0
  let previous: string | null = null

  uniqueDates.forEach((date) => {
    if (!previous) current = 1
    else current = (new Date(date).getTime() - new Date(previous).getTime()) / (1000 * 60 * 60 * 24) === 1 ? current + 1 : 1
    best = Math.max(best, current)
    previous = date
  })

  return best
}

function getCurrentStreak(dates: string[], loggedToday: boolean) {
  const dateSet = new Set(dates)
  const cursor = new Date()
  if (!loggedToday) cursor.setDate(cursor.getDate() - 1)

  let streak = 0
  while (dateSet.has(isoDate(cursor))) {
    streak++
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

export default function HabitsPage() {
  const [habits, setHabits] = useState<HabitWithStats[]>([])
  const [filter, setFilter] = useState<(typeof frequencies)[number]>('all')
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [showHabitModal, setShowHabitModal] = useState(false)
  const [habitForm, setHabitForm] = useState<HabitForm>(emptyHabitForm)
  const [editingHabit, setEditingHabit] = useState<HabitWithStats | null>(null)
  const [confirmArchive, setConfirmArchive] = useState<string | null>(null)
  const [analyticsOpen, setAnalyticsOpen] = useState<string | null>(null)

  const showToast = useCallback((message: string) => {
    setToast(message)
    setTimeout(() => setToast(''), 2000)
  }, [])

  const loadHabits = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: habitsData, error } = await supabase
      .from('habits')
      .select('*')
      .eq('user_id', user.id)
      .eq('archived', false)
      .order('created_at', { ascending: false })

    if (error || !habitsData) { setHabits([]); setLoading(false); return }

    const today = isoDate(new Date())
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29)
    const thirtyDaysAgoIso = isoDate(thirtyDaysAgo)

    const enriched = await Promise.all(habitsData.map(async (habit) => {
      const { data: logs } = await supabase
        .from('habit_logs')
        .select('logged_date')
        .eq('habit_id', habit.id)
        .eq('user_id', user.id)
        .order('logged_date', { ascending: false })

      const allDates = [...new Set((logs ?? []).map((log) => log.logged_date as string))]
      const recentDates = allDates.filter((date) => date >= thirtyDaysAgoIso)
      const loggedToday = allDates.includes(today)

      return {
        ...habit,
        currentStreak: getCurrentStreak(allDates, loggedToday),
        completionPct: Math.round((recentDates.length / 30) * 100),
        bestStreak: getBestStreak(allDates),
        lastLogged: allDates[0] ?? null,
        loggedToday,
        recentDates,
        allDates,
      } as HabitWithStats
    }))

    setHabits(enriched)
    setLoading(false)
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadHabits() }, [loadHabits])

  function openCreateModal() {
    setEditingHabit(null)
    setHabitForm(emptyHabitForm)
    setShowHabitModal(true)
  }

  function openEditModal(habit: HabitWithStats) {
    setEditingHabit(habit)
    setHabitForm({
      name: habit.name,
      frequency: habit.frequency,
      description: habit.description ?? '',
      color: habit.color ?? '#c8ff00',
      reminder_time: habit.reminder_time ?? '',
    })
    setShowHabitModal(true)
  }

  async function saveHabit(e: FormEvent) {
    e.preventDefault()
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const payload = {
      name: habitForm.name.trim(),
      frequency: habitForm.frequency,
      description: habitForm.description.trim() || null,
      color: habitForm.color,
      reminder_time: habitForm.reminder_time || null,
      updated_at: new Date().toISOString(),
    }

    const { error } = editingHabit
      ? await supabase.from('habits').update(payload).eq('id', editingHabit.id).eq('user_id', user.id)
      : await supabase.from('habits').insert({ ...payload, user_id: user.id })

    if (error) { showToast(error.message); return }

    setShowHabitModal(false)
    setEditingHabit(null)
    setHabitForm(emptyHabitForm)
    await loadHabits()
    showToast(editingHabit ? 'Habit updated' : 'Habit created')
  }

  async function logToday(habitId: string) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase.from('habit_logs').insert({ habit_id: habitId, user_id: user.id, logged_date: isoDate(new Date()) })
    if (error) { showToast(error.message.includes('duplicate') ? 'Already logged today' : error.message); return }

    await loadHabits()
    showToast('Logged')
  }

  async function archiveHabit(habitId: string) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase.from('habits').update({ archived: true, updated_at: new Date().toISOString() }).eq('id', habitId).eq('user_id', user.id)
    if (error) { showToast(error.message); return }

    setConfirmArchive(null)
    await loadHabits()
    showToast('Habit archived')
  }

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-neon border-t-transparent" /></div>
  }

  const heatmapDays = getLastThirtyDays()
  const filteredHabits = filter === 'all' ? habits : habits.filter((habit) => habit.frequency === filter)
  const longest = habits.reduce((max, habit) => Math.max(max, habit.currentStreak), 0)
  const completions = habits.reduce((sum, habit) => sum + habit.recentDates.slice(-7).length, 0)
  const onTrack = habits.length === 0 ? 0 : Math.round(habits.reduce((sum, habit) => sum + habit.completionPct, 0) / habits.length)

  return (
    <div className="space-y-8">
      <DashboardHero
        eyebrow="HABITS"
        title="Your rhythm"
        subtitle="Colored dots, quick logs, streaks that feel alive. Aaj ka ritual bas ek tap door."
        right={<button onClick={openCreateModal} className="rounded-full bg-neon px-5 py-3 text-sm font-semibold text-bg-primary transition-transform hover:scale-[1.02]">+ New habit</button>}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active Habits" value={habits.length} hint="not archived" accent="neon" />
        <StatCard label="Longest Current" value={`${longest}d`} hint="best streak right now" accent="orange" />
        <StatCard label="This Week" value={completions} hint="logs in last 7 entries" accent="blue" />
        <StatCard label="On Track" value={`${onTrack}%`} hint="30-day average" accent="muted" />
      </div>

      <section>
        <SectionHeader
          eyebrow="FILTERS"
          title="Ritual board"
          right={
            <div className="flex flex-wrap gap-2">
              {frequencies.map((frequency) => (
                <button
                  key={frequency}
                  onClick={() => setFilter(frequency)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition-all ${filter === frequency ? 'border-neon/20 bg-neon/[0.08] text-neon' : 'border-white/[0.05] text-text-muted hover:text-text-primary'}`}
                >
                  {frequency}
                </button>
              ))}
            </div>
          }
        />

        {filteredHabits.length === 0 ? (
          <EmptyState title="No habits in this view" copy="Create a ritual or switch filters to see your active rhythm." action={<button onClick={openCreateModal} className="rounded-full bg-neon px-4 py-2 text-xs font-semibold text-bg-primary">Create habit</button>} />
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {filteredHabits.map((habit, index) => {
              const completionText = `${habit.recentDates.length}/30 days`
              return (
                <motion.div key={habit.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }}>
                  <Card hoverable className="p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-3">
                          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: habit.color }} />
                          <h3 className="truncate text-lg font-semibold tracking-[-0.02em] text-text-primary">{habit.name}</h3>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Chip variant="tag">{habit.frequency}</Chip>
                          {habit.reminder_time && <Chip variant="tag">{habit.reminder_time}</Chip>}
                          <Chip variant={habit.loggedToday ? 'status-completed' : 'status-pending'}>{habit.loggedToday ? 'done today' : 'not logged'}</Chip>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {!habit.loggedToday ? (
                          <button onClick={() => logToday(habit.id)} className="rounded-full bg-neon px-4 py-2 text-xs font-semibold text-bg-primary">Log today</button>
                        ) : (
                          <span className="rounded-full border border-neon/15 bg-neon/[0.08] px-4 py-2 text-xs font-medium text-neon">Logged</span>
                        )}
                        <button onClick={() => setAnalyticsOpen(analyticsOpen === habit.id ? null : habit.id)} className="rounded-full border border-white/[0.06] px-3 py-2 text-xs text-text-secondary hover:text-text-primary">Analytics</button>
                        <button onClick={() => openEditModal(habit)} aria-label={`Edit ${habit.name}`} className="h-9 w-9 rounded-full border border-white/[0.06] text-text-secondary hover:text-text-primary">✎</button>
                        <button onClick={() => setConfirmArchive(habit.id)} aria-label={`Archive ${habit.name}`} className="h-9 w-9 rounded-full border border-white/[0.06] text-text-secondary hover:text-text-primary">□</button>
                      </div>
                    </div>

                    {habit.description && <p className="mt-4 text-sm leading-6 text-text-muted">{habit.description}</p>}
                    {confirmArchive === habit.id && (
                      <div className="mt-4 flex flex-col gap-3 rounded-xl border border-red-400/10 bg-red-500/[0.05] p-3 sm:flex-row sm:items-center sm:justify-between">
                        <span className="text-sm text-text-secondary">Archive this habit?</span>
                        <div className="flex gap-2">
                          <button onClick={() => archiveHabit(habit.id)} className="rounded-full bg-red-500/[0.12] px-3 py-1.5 text-xs text-red-300">Archive</button>
                          <button onClick={() => setConfirmArchive(null)} className="rounded-full border border-white/[0.06] px-3 py-1.5 text-xs text-text-secondary">Cancel</button>
                        </div>
                      </div>
                    )}

                    <ProgressBar className="mt-5" value={habit.completionPct} label="30-day completion" />

                    <AnimatePresence>
                      {analyticsOpen === habit.id && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                          <div className="mt-5 border-t border-white/[0.04] pt-5">
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                              <MiniMetric label="Completion" value={completionText} />
                              <MiniMetric label="Current" value={`${habit.currentStreak}d`} neon />
                              <MiniMetric label="Best" value={`${habit.bestStreak}d`} />
                              <MiniMetric label="Last" value={habit.lastLogged ?? 'Never'} />
                            </div>
                            <div className="mt-4 grid grid-cols-10 gap-1">
                              {heatmapDays.map((day) => (
                                <div key={day} title={day} className={`aspect-square rounded-[4px] border ${habit.recentDates.includes(day) ? 'border-neon bg-neon' : 'border-white/[0.04] bg-white/[0.035]'}`} />
                              ))}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </Card>
                </motion.div>
              )
            })}
          </div>
        )}
      </section>

      <HabitModal
        open={showHabitModal}
        editing={Boolean(editingHabit)}
        form={habitForm}
        setForm={setHabitForm}
        onClose={() => setShowHabitModal(false)}
        onSubmit={saveHabit}
      />

      {toast && <div className="fixed bottom-6 right-6 rounded-xl border border-white/[0.06] bg-bg-surface px-4 py-2.5 text-sm text-text-primary shadow-lg">{toast}</div>}
    </div>
  )
}

function MiniMetric({ label, value, neon = false }: { label: string; value: string; neon?: boolean }) {
  return (
    <div className="rounded-xl border border-white/[0.04] bg-white/[0.01] p-3">
      <p className="text-xs text-text-muted">{label}</p>
      <p className={`mt-1 truncate text-sm font-semibold ${neon ? 'text-neon' : 'text-text-primary'}`}>{value}</p>
    </div>
  )
}

function HabitModal({
  open,
  editing,
  form,
  setForm,
  onClose,
  onSubmit,
}: {
  open: boolean
  editing: boolean
  form: HabitForm
  setForm: (form: HabitForm) => void
  onClose: () => void
  onSubmit: (event: FormEvent) => void
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="w-full max-w-md rounded-2xl border border-white/[0.06] bg-bg-surface p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-semibold text-text-primary">{editing ? 'Edit Habit' : 'New Habit'}</h2>
            <form onSubmit={onSubmit} className="space-y-3">
              <input type="text" placeholder="Habit name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className={inputClass} />
              <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value as HabitForm['frequency'] })} className={inputClass}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
              <textarea placeholder="Description (optional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className={`${inputClass} resize-none`} />
              <input type="time" value={form.reminder_time} onChange={(e) => setForm({ ...form, reminder_time: e.target.value })} className={inputClass} />
              <div>
                <p className="mb-2 text-xs text-text-muted">Color</p>
                <div className="flex gap-2">
                  {presetColors.map((color) => (
                    <button key={color} type="button" onClick={() => setForm({ ...form, color })} className={`h-8 w-8 rounded-full border transition-all ${form.color === color ? 'border-neon ring-2 ring-neon/20' : 'border-white/[0.08]'}`} style={{ backgroundColor: color }} aria-label={`Set color ${color}`} />
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="submit" className="flex-1 rounded-full bg-neon py-2 text-sm font-semibold text-bg-primary">{editing ? 'Save' : 'Create'}</button>
                <button type="button" onClick={onClose} className="rounded-full border border-white/[0.08] px-4 py-2 text-sm text-text-secondary">Cancel</button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
