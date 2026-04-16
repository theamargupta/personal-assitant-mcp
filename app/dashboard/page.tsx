'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { SummaryCard } from '@/components/dashboard/SummaryCard'

interface RecentItem {
  type: string
  icon: string
  text: string
  time: string
}

export default function DashboardOverview() {
  const [stats, setStats] = useState({ bestStreak: 0, tasksThisWeek: 0, spentThisMonth: 0, activeGoals: 0 })
  const [recent, setRecent] = useState<RecentItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const now = new Date()
      const weekAgo = new Date(now)
      weekAgo.setDate(weekAgo.getDate() - 7)
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

      const [habitsRes, tasksRes, spendRes, goalsRes, recentTasksRes, recentLogsRes] = await Promise.all([
        // Best streak: count consecutive days of any habit log
        supabase.from('habit_logs').select('logged_date').eq('user_id', user.id).order('logged_date', { ascending: false }).limit(100),
        // Tasks completed this week
        supabase.from('tasks').select('id').eq('user_id', user.id).eq('status', 'completed').gte('completed_at', weekAgo.toISOString()),
        // Spending this month
        supabase.from('transactions').select('amount').eq('user_id', user.id).gte('transaction_date', monthStart.toISOString()),
        // Active goals
        supabase.from('goals').select('id').eq('user_id', user.id).eq('status', 'active'),
        // Recent tasks
        supabase.from('tasks').select('title, status, updated_at').eq('user_id', user.id).order('updated_at', { ascending: false }).limit(5),
        // Recent habit logs
        supabase.from('habit_logs').select('notes, logged_date, habits(name)').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5),
      ])

      // Calculate best streak from habit logs
      let bestStreak = 0
      if (habitsRes.data && habitsRes.data.length > 0) {
        const dates = [...new Set(habitsRes.data.map(l => l.logged_date))].sort().reverse()
        let streak = 1
        for (let i = 1; i < dates.length; i++) {
          const prev = new Date(dates[i - 1])
          const curr = new Date(dates[i])
          const diffDays = (prev.getTime() - curr.getTime()) / (1000 * 60 * 60 * 24)
          if (diffDays === 1) { streak++; bestStreak = Math.max(bestStreak, streak) }
          else streak = 1
        }
        bestStreak = Math.max(bestStreak, streak)
      }

      const totalSpent = spendRes.data?.reduce((sum, t) => sum + Number(t.amount), 0) ?? 0

      setStats({
        bestStreak,
        tasksThisWeek: tasksRes.data?.length ?? 0,
        spentThisMonth: totalSpent,
        activeGoals: goalsRes.data?.length ?? 0,
      })

      // Build recent activity
      const items: RecentItem[] = []
      recentTasksRes.data?.forEach(t => {
        items.push({ type: 'task', icon: '✅', text: `${t.title} — ${t.status}`, time: new Date(t.updated_at).toLocaleDateString('en-IN') })
      })
      recentLogsRes.data?.forEach(l => {
        const habitName = (l.habits as unknown as { name: string } | null)?.name ?? 'Habit'
        items.push({ type: 'habit', icon: '🔥', text: `Logged ${habitName}`, time: l.logged_date })
      })
      setRecent(items.slice(0, 10))
      setLoading(false)
    }
    load()
  }, [])

  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Kolkata' })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-neon border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-5xl">
      <div className="mb-8">
        <h1 className="text-[22px] font-bold text-text-primary tracking-[-0.02em]">Welcome back</h1>
        <p className="text-text-secondary text-sm mt-1">{today}</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <SummaryCard icon="🔥" label="Best Streak" value={stats.bestStreak} suffix=" days" />
        <SummaryCard icon="✅" label="Tasks This Week" value={stats.tasksThisWeek} />
        <SummaryCard icon="💰" label="Spent This Month" value={stats.spentThisMonth} prefix="₹" />
        <SummaryCard icon="🎯" label="Active Goals" value={stats.activeGoals} />
      </div>

      {/* Recent activity */}
      <div>
        <h2 className="text-[11px] font-semibold text-neon uppercase tracking-[0.15em] mb-4">Recent Activity</h2>
        {recent.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-12 text-center">
            <p className="text-text-muted text-sm">No recent activity yet. Start tracking!</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recent.map((item, i) => (
              <div key={i} className="rounded-xl border border-white/[0.04] bg-white/[0.01] px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span>{item.icon}</span>
                  <span className="text-sm text-text-primary">{item.text}</span>
                </div>
                <span className="text-xs text-text-muted">{item.time}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
