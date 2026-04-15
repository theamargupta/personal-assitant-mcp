'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'

interface Habit {
  id: string
  name: string
  color: string
  frequency: string
  created_at: string
}

interface HabitWithStats extends Habit {
  currentStreak: number
  completionPct: number
  lastLogged: string | null
  loggedToday: boolean
}

export default function HabitsPage() {
  const [habits, setHabits] = useState<HabitWithStats[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')

  const loadHabits = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: habitsData } = await supabase
      .from('habits')
      .select('*')
      .eq('user_id', user.id)
      .eq('archived', false)
      .order('created_at', { ascending: false })

    if (!habitsData) { setLoading(false); return }

    const today = new Date().toISOString().split('T')[0]
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const enriched = await Promise.all(habitsData.map(async (h) => {
      const { data: logs } = await supabase
        .from('habit_logs')
        .select('logged_date')
        .eq('habit_id', h.id)
        .gte('logged_date', thirtyDaysAgo.toISOString().split('T')[0])
        .order('logged_date', { ascending: false })

      const dates = logs?.map(l => l.logged_date) ?? []
      const loggedToday = dates.includes(today)

      // Current streak
      let streak = 0
      const d = new Date()
      if (!loggedToday) d.setDate(d.getDate() - 1) // start from yesterday if not logged today
      while (dates.includes(d.toISOString().split('T')[0])) {
        streak++
        d.setDate(d.getDate() - 1)
      }
      if (loggedToday) streak++ // add today

      const completionPct = Math.round((dates.length / 30) * 100)

      return {
        ...h,
        currentStreak: streak,
        completionPct,
        lastLogged: dates[0] ?? null,
        loggedToday,
      }
    }))

    setHabits(enriched)
    setLoading(false)
  }, [])

  useEffect(() => { loadHabits() }, [loadHabits])

  async function logToday(habitId: string) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const today = new Date().toISOString().split('T')[0]
    const { error } = await supabase.from('habit_logs').insert({
      habit_id: habitId,
      user_id: user.id,
      logged_date: today,
    })

    if (error) {
      setToast(error.message.includes('duplicate') ? 'Already logged today!' : error.message)
    } else {
      setToast('Logged! 🔥')
      loadHabits()
    }
    setTimeout(() => setToast(''), 2000)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">Habits</h1>
      </div>

      {habits.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <p className="text-text-muted">No habits yet. Create one via Claude!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {habits.map((h, i) => (
            <motion.div
              key={h.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="glass rounded-2xl p-5"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: h.color }} />
                  <div>
                    <h3 className="font-semibold text-text-primary">{h.name}</h3>
                    <span className="text-xs text-text-muted capitalize">{h.frequency}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium bg-orange-500/20 text-orange-400 px-2.5 py-0.5 rounded-full">
                    🔥 {h.currentStreak} days
                  </span>
                  {!h.loggedToday && (
                    <button
                      onClick={() => logToday(h.id)}
                      className="px-3 py-1.5 rounded-lg bg-accent-blue/20 text-accent-blue text-xs font-medium hover:bg-accent-blue/30 transition-all"
                    >
                      Log Today
                    </button>
                  )}
                  {h.loggedToday && (
                    <span className="text-xs text-green-400 bg-green-500/20 px-2.5 py-1 rounded-full">Done ✓</span>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-text-muted">
                  <span>30-day completion</span>
                  <span>{h.completionPct}%</span>
                </div>
                <div className="h-2 rounded-full bg-white/5">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: h.color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${h.completionPct}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                  />
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-bg-surface border border-white/10 text-text-primary px-4 py-2.5 rounded-xl text-sm shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}
