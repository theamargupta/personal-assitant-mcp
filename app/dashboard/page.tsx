'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { ActivityItem, AskSathiBar, Card, Chip, DashboardHero, EmptyState, SectionHeader, StatCard } from '@/components/dashboard/kit'
import { istMonthStartISO, istWeekRange, maxCurrentStreak } from '@/types'

interface RecentItem {
  type: string
  icon: string
  text: string
  time: string
}

interface FocusTask {
  title: string
  status: string
  time: string
}

interface Ritual {
  name: string
  date: string
}

interface SpendBucket {
  name: string
  total: number
  pct: number
}

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.08 } },
}

const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
}

function rupees(value: number) {
  return `₹${Math.round(value).toLocaleString('en-IN')}`
}

function greeting() {
  const hour = Number(new Intl.DateTimeFormat('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date()))
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function bucketSpend(amounts: number[]): SpendBucket[] {
  const buckets = [
    { name: 'Small spends', total: 0 },
    { name: 'Planned spends', total: 0 },
    { name: 'Big spends', total: 0 },
  ]
  amounts.forEach((amount) => {
    if (amount < 500) buckets[0].total += amount
    else if (amount < 2500) buckets[1].total += amount
    else buckets[2].total += amount
  })
  const total = buckets.reduce((sum, bucket) => sum + bucket.total, 0)
  return buckets
    .filter((bucket) => bucket.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 3)
    .map((bucket) => ({ ...bucket, pct: total > 0 ? Math.round((bucket.total / total) * 100) : 0 }))
}

export default function DashboardOverview() {
  const [stats, setStats] = useState({ bestStreak: 0, tasksThisWeek: 0, spentThisMonth: 0, activeGoals: 0 })
  const [recent, setRecent] = useState<RecentItem[]>([])
  const [focusTasks, setFocusTasks] = useState<FocusTask[]>([])
  const [rituals, setRituals] = useState<Ritual[]>([])
  const [spendBuckets, setSpendBuckets] = useState<SpendBucket[]>([])
  const [firstName, setFirstName] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const meta = (user.user_metadata || {}) as { first_name?: string; full_name?: string }
      setFirstName(meta.first_name || meta.full_name?.split(' ')[0] || user.email?.split('@')[0] || '')

      const { startDate: weekStart, endDate: weekEnd } = istWeekRange()
      const monthStartISO = istMonthStartISO()

      const [habitsRes, habitLogsRes, tasksRes, spendRes, goalsRes, recentTasksRes, recentLogsRes] = await Promise.all([
        supabase.from('habits').select('id, archived').eq('user_id', user.id).eq('archived', false),
        supabase.from('habit_logs').select('habit_id, logged_date').eq('user_id', user.id),
        supabase.from('tasks').select('id').eq('user_id', user.id).in('status', ['pending', 'in_progress']).gte('due_date', weekStart).lte('due_date', weekEnd),
        supabase.from('transactions').select('amount').eq('user_id', user.id).gte('transaction_date', monthStartISO),
        supabase.from('goals').select('id').eq('user_id', user.id).eq('status', 'active'),
        supabase.from('tasks').select('title, status, updated_at').eq('user_id', user.id).order('updated_at', { ascending: false }).limit(5),
        supabase.from('habit_logs').select('notes, logged_date, habits(name)').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5),
      ])

      const logsByHabit = new Map<string, Set<string>>()
      for (const log of habitLogsRes.data ?? []) {
        const set = logsByHabit.get(log.habit_id) ?? new Set<string>()
        set.add(log.logged_date)
        logsByHabit.set(log.habit_id, set)
      }

      const amounts = (spendRes.data ?? []).map((transaction) => Number(transaction.amount))
      const totalSpent = amounts.reduce((sum, amount) => sum + amount, 0)

      setStats({
        bestStreak: maxCurrentStreak(habitsRes.data ?? [], logsByHabit),
        tasksThisWeek: tasksRes.data?.length ?? 0,
        spentThisMonth: totalSpent,
        activeGoals: goalsRes.data?.length ?? 0,
      })
      setSpendBuckets(bucketSpend(amounts))

      const items: RecentItem[] = []
      const nextTasks: FocusTask[] = []
      recentTasksRes.data?.forEach((task) => {
        const time = new Date(task.updated_at).toLocaleDateString('en-IN')
        items.push({ type: 'task', icon: '✓', text: `${task.title} - ${task.status.replace('_', ' ')}`, time })
        if (task.status !== 'completed' && nextTasks.length < 3) nextTasks.push({ title: task.title, status: task.status, time })
      })
      setFocusTasks(nextTasks)

      const ritualMap = new Map<string, Ritual>()
      recentLogsRes.data?.forEach((log) => {
        const habitName = (log.habits as unknown as { name: string } | null)?.name ?? 'Habit'
        items.push({ type: 'habit', icon: '•', text: `Logged ${habitName}`, time: log.logged_date })
        if (!ritualMap.has(habitName)) ritualMap.set(habitName, { name: habitName, date: log.logged_date })
      })
      setRituals([...ritualMap.values()].slice(0, 3))
      setRecent(items.slice(0, 10))
      setLoading(false)
    }
    load()
  }, [])

  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Kolkata' })

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-neon border-t-transparent" />
      </div>
    )
  }

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-8">
      <DashboardHero
        eyebrow={today}
        title={`${greeting()}${firstName ? `, ${firstName}` : ''}`}
        subtitle="Aaj ka control room: rituals, work, money, and the few signals worth checking before the day runs away."
        right={
          <div className="rounded-2xl border border-neon/[0.12] bg-neon/[0.035] p-4">
            <p className="text-[10px] uppercase tracking-[0.24em] text-text-muted">Today</p>
            <p className="mt-2 text-3xl font-bold tracking-[-0.03em] text-neon">{stats.tasksThisWeek}</p>
            <p className="mt-1 text-xs text-text-muted">open tasks due this week</p>
          </div>
        }
      />

      <div className="md:hidden">
        <AskSathiBar />
      </div>

      <motion.div variants={item} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Best Streak" value={`${stats.bestStreak}d`} hint="current best ritual" accent="neon" icon="•" />
        <StatCard label="Tasks This Week" value={stats.tasksThisWeek} hint="pending or moving" accent="blue" icon="✓" />
        <StatCard label="Spent This Month" value={rupees(stats.spentThisMonth)} hint="from tracked transactions" accent="orange" icon="₹" />
        <StatCard label="Active Goals" value={stats.activeGoals} hint="still in play" accent="muted" icon="◎" />
      </motion.div>

      <motion.section variants={item}>
        <SectionHeader eyebrow="TODAY'S FOCUS" title="Start here" />
        <div className="grid gap-3 lg:grid-cols-3">
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-text-primary">Rituals Today</h3>
            <div className="mt-4 space-y-2">
              {rituals.length === 0 ? (
                <EmptyState title="No ritual signal yet" copy="Log one habit and this list gets smarter." />
              ) : rituals.map((ritual, index) => (
                <Link key={ritual.name} href="/dashboard/habits" className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-white/[0.02]">
                  <span className={`h-2.5 w-2.5 rounded-full ${index === 0 ? 'bg-neon' : index === 1 ? 'bg-blue-400' : 'bg-orange-400'}`} />
                  <span className="min-w-0 flex-1 truncate text-sm text-text-primary">{ritual.name}</span>
                  <span className="rounded-full border border-neon/[0.14] bg-neon/[0.06] px-3 py-1 text-xs font-medium text-neon">Log</span>
                </Link>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="text-sm font-semibold text-text-primary">On Your Plate</h3>
            <div className="mt-4 space-y-2">
              {focusTasks.length === 0 ? (
                <EmptyState title="No open task signal" copy="Your latest tasks are either complete or not due this week." />
              ) : focusTasks.map((task) => (
                <Link key={`${task.title}-${task.time}`} href="/dashboard/tasks" className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-white/[0.02]">
                  <span className="h-4 w-4 shrink-0 rounded border border-white/[0.14]" />
                  <span className="min-w-0 flex-1 truncate text-sm text-text-primary">{task.title}</span>
                  <Chip variant={task.status === 'in_progress' ? 'status-in-progress' : 'status-pending'}>{task.status.replace('_', ' ')}</Chip>
                </Link>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-start justify-between gap-4">
              <h3 className="text-sm font-semibold text-text-primary">Spending Snapshot</h3>
              <span className="font-mono text-sm text-neon">{rupees(stats.spentThisMonth)}</span>
            </div>
            <div className="mt-4 space-y-3">
              {spendBuckets.length === 0 ? (
                <EmptyState title="No spend logged" copy="Add transactions to see a live month snapshot." />
              ) : spendBuckets.map((bucket) => (
                <div key={bucket.name}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                    <span className="text-text-secondary">{bucket.name}</span>
                    <span className="text-text-muted">{rupees(bucket.total)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/[0.04]">
                    <div className="h-full rounded-full bg-neon/70" style={{ width: `${bucket.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </motion.section>

      <motion.section variants={item}>
        <SectionHeader eyebrow="RECENT ACTIVITY" title="Latest signals" />
        <Card className="p-2">
          {recent.length === 0 ? (
            <EmptyState title="Nothing recent yet" copy="Track a habit, close a task, or add spend to build the timeline." />
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {recent.map((entry, index) => (
                <ActivityItem
                  key={`${entry.type}-${entry.text}-${index}`}
                  icon={<span className="text-sm">{entry.icon}</span>}
                  title={entry.text}
                  meta={index < 3 ? 'Today' : index < 6 ? 'Yesterday' : 'Earlier'}
                  time={entry.time}
                  dot={entry.type === 'habit' ? 'neon' : 'blue'}
                />
              ))}
            </div>
          )}
        </Card>
      </motion.section>
    </motion.div>
  )
}
