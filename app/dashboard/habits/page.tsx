'use client'

import { useEffect, useState, useCallback, type FormEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'

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
const emptyHabitForm: HabitForm = {
  name: '',
  frequency: 'daily',
  description: '',
  color: '#c8ff00',
  reminder_time: '',
}
const inputClass = 'w-full px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.06] text-text-primary text-[14px] placeholder:text-text-muted focus:outline-none focus:border-neon/30 focus:ring-1 focus:ring-neon/20'

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
    if (!previous) {
      current = 1
    } else {
      const diffDays = (new Date(date).getTime() - new Date(previous).getTime()) / (1000 * 60 * 60 * 24)
      current = diffDays === 1 ? current + 1 : 1
    }
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
    if (!user) {
      setLoading(false)
      return
    }

    const { data: habitsData, error } = await supabase
      .from('habits')
      .select('*')
      .eq('user_id', user.id)
      .eq('archived', false)
      .order('created_at', { ascending: false })

    if (error || !habitsData) {
      setHabits([])
      setLoading(false)
      return
    }

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
      const completionPct = Math.round((recentDates.length / 30) * 100)

      return {
        ...habit,
        currentStreak: getCurrentStreak(allDates, loggedToday),
        completionPct,
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

    if (error) {
      showToast(error.message)
      return
    }

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

    const today = isoDate(new Date())
    const { error } = await supabase.from('habit_logs').insert({
      habit_id: habitId,
      user_id: user.id,
      logged_date: today,
    })

    if (error) {
      showToast(error.message.includes('duplicate') ? 'Already logged today' : error.message)
      return
    }

    await loadHabits()
    showToast('Logged')
  }

  async function archiveHabit(habitId: string) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase
      .from('habits')
      .update({ archived: true, updated_at: new Date().toISOString() })
      .eq('id', habitId)
      .eq('user_id', user.id)

    if (error) {
      showToast(error.message)
      return
    }

    setConfirmArchive(null)
    await loadHabits()
    showToast('Habit archived')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-neon border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const heatmapDays = getLastThirtyDays()

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-[22px] font-bold text-text-primary tracking-[-0.02em]">Habits</h1>
        <button
          onClick={openCreateModal}
          className="px-4 py-2 rounded-lg bg-neon text-bg-primary hover:bg-neon-muted text-sm font-semibold transition-all"
        >
          New Habit
        </button>
      </div>

      {habits.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-12 text-center">
          <p className="text-text-muted">No habits yet. Create one to start tracking.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {habits.map((habit, i) => {
            const completionText = `${habit.recentDates.length}/30 days (${habit.completionPct}%)`
            return (
              <motion.div
                key={habit.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5"
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: habit.color }} />
                    <div className="min-w-0">
                      <h3 className="font-semibold text-text-primary truncate">{habit.name}</h3>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <span className="text-xs text-text-muted capitalize">{habit.frequency}</span>
                        {habit.reminder_time && <span className="text-xs text-text-muted">{habit.reminder_time}</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <span className="text-xs font-medium bg-neon/[0.08] text-neon px-2.5 py-1 rounded-full">
                      {habit.currentStreak} day streak
                    </span>
                    {!habit.loggedToday ? (
                      <button
                        onClick={() => logToday(habit.id)}
                        className="px-3 py-1.5 rounded-lg bg-neon text-bg-primary hover:bg-neon-muted text-xs font-semibold transition-all"
                      >
                        Log Today
                      </button>
                    ) : (
                      <span className="text-xs bg-neon/[0.08] text-neon border border-neon/[0.12] px-2.5 py-1 rounded-full">
                        Done
                      </span>
                    )}
                    <button
                      onClick={() => setAnalyticsOpen(analyticsOpen === habit.id ? null : habit.id)}
                      className="px-3 py-1.5 rounded-lg border border-white/[0.08] text-text-secondary hover:text-text-primary hover:border-white/[0.12] text-xs transition-all"
                    >
                      Analytics
                    </button>
                    <button
                      onClick={() => openEditModal(habit)}
                      aria-label={`Edit ${habit.name}`}
                      className="h-8 w-8 rounded-lg border border-white/[0.08] text-text-secondary hover:text-text-primary hover:border-white/[0.12] transition-all"
                    >
                      ✎
                    </button>
                    <button
                      onClick={() => setConfirmArchive(habit.id)}
                      aria-label={`Archive ${habit.name}`}
                      className="h-8 w-8 rounded-lg border border-white/[0.08] text-text-secondary hover:text-text-primary hover:border-white/[0.12] transition-all"
                    >
                      📦
                    </button>
                  </div>
                </div>

                {habit.description && <p className="text-sm text-text-muted mb-4">{habit.description}</p>}

                {confirmArchive === habit.id && (
                  <div className="mb-4 rounded-xl border border-white/[0.04] bg-white/[0.01] p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <span className="text-sm text-text-secondary">Archive this habit?</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => archiveHabit(habit.id)}
                        className="px-3 py-1.5 rounded-lg bg-red-500/[0.1] text-red-400 border border-red-500/[0.15] hover:bg-red-500/[0.2] text-xs transition-all"
                      >
                        Archive
                      </button>
                      <button
                        onClick={() => setConfirmArchive(null)}
                        className="px-3 py-1.5 rounded-lg border border-white/[0.08] text-text-secondary hover:text-text-primary text-xs transition-all"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-text-muted">
                    <span>30-day completion</span>
                    <span>{habit.completionPct}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/[0.04]">
                    <motion.div
                      className="h-full rounded-full bg-neon"
                      initial={{ width: 0 }}
                      animate={{ width: `${habit.completionPct}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
                    />
                  </div>
                </div>

                <AnimatePresence>
                  {analyticsOpen === habit.id && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-5 pt-5 border-t border-white/[0.04]">
                        <p className="text-[11px] font-semibold text-neon uppercase tracking-[0.15em] mb-3">Analytics</p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                          <div className="rounded-xl border border-white/[0.04] bg-white/[0.01] p-3">
                            <p className="text-xs text-text-muted">Completion</p>
                            <p className="text-sm font-semibold text-text-primary mt-1">{completionText}</p>
                          </div>
                          <div className="rounded-xl border border-white/[0.04] bg-white/[0.01] p-3">
                            <p className="text-xs text-text-muted">Current streak</p>
                            <p className="text-sm font-semibold text-neon mt-1">{habit.currentStreak} days</p>
                          </div>
                          <div className="rounded-xl border border-white/[0.04] bg-white/[0.01] p-3">
                            <p className="text-xs text-text-muted">Best streak</p>
                            <p className="text-sm font-semibold text-text-primary mt-1">{habit.bestStreak} days</p>
                          </div>
                          <div className="rounded-xl border border-white/[0.04] bg-white/[0.01] p-3">
                            <p className="text-xs text-text-muted">Last logged</p>
                            <p className="text-sm font-semibold text-text-primary mt-1">{habit.lastLogged ?? 'Never'}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-10 gap-1">
                          {heatmapDays.map((day) => {
                            const logged = habit.recentDates.includes(day)
                            return (
                              <div
                                key={day}
                                title={day}
                                className={`aspect-square rounded-[4px] border ${
                                  logged
                                    ? 'bg-neon border-neon'
                                    : 'bg-white/[0.04] border-white/[0.04]'
                                }`}
                              />
                            )
                          })}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </div>
      )}

      <AnimatePresence>
        {showHabitModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
            onClick={() => setShowHabitModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="rounded-2xl border border-white/[0.06] bg-bg-surface p-6 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-semibold text-text-primary mb-4">
                {editingHabit ? 'Edit Habit' : 'New Habit'}
              </h2>
              <form onSubmit={saveHabit} className="space-y-3">
                <input
                  type="text"
                  placeholder="Habit name"
                  value={habitForm.name}
                  onChange={(e) => setHabitForm({ ...habitForm, name: e.target.value })}
                  required
                  className={inputClass}
                />
                <select
                  value={habitForm.frequency}
                  onChange={(e) => setHabitForm({ ...habitForm, frequency: e.target.value as HabitForm['frequency'] })}
                  className={inputClass}
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
                <textarea
                  placeholder="Description (optional)"
                  value={habitForm.description}
                  onChange={(e) => setHabitForm({ ...habitForm, description: e.target.value })}
                  rows={3}
                  className={`${inputClass} resize-none`}
                />
                <input
                  type="time"
                  value={habitForm.reminder_time}
                  onChange={(e) => setHabitForm({ ...habitForm, reminder_time: e.target.value })}
                  className={inputClass}
                />
                <div>
                  <p className="text-xs text-text-muted mb-2">Color</p>
                  <div className="flex gap-2">
                    {presetColors.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setHabitForm({ ...habitForm, color })}
                        className={`h-8 w-8 rounded-full border transition-all ${
                          habitForm.color === color ? 'border-neon ring-2 ring-neon/20' : 'border-white/[0.08]'
                        }`}
                        style={{ backgroundColor: color }}
                        aria-label={`Set color ${color}`}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <button type="submit" className="flex-1 py-2 rounded-lg bg-neon text-bg-primary hover:bg-neon-muted text-sm font-semibold transition-all">
                    {editingHabit ? 'Save' : 'Create'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowHabitModal(false)}
                    className="px-4 py-2 rounded-lg border border-white/[0.08] text-text-secondary hover:text-text-primary text-sm transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </form>
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
