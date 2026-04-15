'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'

interface Goal {
  id: string
  title: string
  description: string | null
  goal_type: 'outcome' | 'milestone'
  metric_type: string | null
  target_value: number | null
  start_date: string
  end_date: string
  status: string
}

interface Milestone {
  id: string
  goal_id: string
  title: string
  sort_order: number
  completed: boolean
}

const statusTabs = ['active', 'completed', 'failed'] as const

function ProgressRing({ pct, color, size = 80 }: { pct: number; color: string; size?: number }) {
  const r = (size - 10) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (pct / 100) * circ

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-text-primary">
        {pct}%
      </span>
    </div>
  )
}

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([])
  const [milestones, setMilestones] = useState<Record<string, Milestone[]>>({})
  const [tab, setTab] = useState<string>('active')
  const [loading, setLoading] = useState(true)

  const loadGoals = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: goalsData } = await supabase
      .from('goals')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', tab)
      .order('created_at', { ascending: false })

    setGoals(goalsData ?? [])

    // Load milestones for milestone-type goals
    const milestoneGoals = (goalsData ?? []).filter(g => g.goal_type === 'milestone')
    if (milestoneGoals.length > 0) {
      const { data: msData } = await supabase
        .from('goal_milestones')
        .select('*')
        .in('goal_id', milestoneGoals.map(g => g.id))
        .order('sort_order')

      const grouped: Record<string, Milestone[]> = {}
      msData?.forEach(m => {
        if (!grouped[m.goal_id]) grouped[m.goal_id] = []
        grouped[m.goal_id].push(m)
      })
      setMilestones(grouped)
    } else {
      setMilestones({})
    }

    setLoading(false)
  }, [tab])

  useEffect(() => { loadGoals() }, [loadGoals])

  async function toggleMilestone(ms: Milestone) {
    const supabase = createClient()
    await supabase.from('goal_milestones').update({
      completed: !ms.completed,
      completed_at: !ms.completed ? new Date().toISOString() : null,
    }).eq('id', ms.id)
    loadGoals()
  }

  function getOutcomeProgress(goal: Goal): number {
    // For outcome goals, we'd need to compute from linked data.
    // Simplified: show a placeholder based on time elapsed.
    const now = new Date()
    const start = new Date(goal.start_date)
    const end = new Date(goal.end_date)
    const elapsed = now.getTime() - start.getTime()
    const total = end.getTime() - start.getTime()
    if (total <= 0) return 0
    return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)))
  }

  function getMilestoneProgress(goalId: string): number {
    const ms = milestones[goalId]
    if (!ms || ms.length === 0) return 0
    return Math.round((ms.filter(m => m.completed).length / ms.length) * 100)
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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Goals</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {statusTabs.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize ${
              tab === t ? 'bg-accent-blue/20 text-accent-blue' : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {goals.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <p className="text-text-muted">No {tab} goals. Create one via Claude!</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {goals.map((g, i) => (
            <motion.div
              key={g.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="glass rounded-2xl p-5"
            >
              <div className="flex items-start gap-4">
                {/* Progress ring */}
                <ProgressRing
                  pct={g.goal_type === 'milestone' ? getMilestoneProgress(g.id) : getOutcomeProgress(g)}
                  color={g.goal_type === 'milestone' ? '#8b5cf6' : '#3b82f6'}
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-text-primary">{g.title}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      g.goal_type === 'outcome' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'
                    }`}>
                      {g.goal_type}
                    </span>
                  </div>

                  {g.description && <p className="text-xs text-text-muted mb-2">{g.description}</p>}

                  <div className="flex gap-3 text-xs text-text-muted mb-3">
                    {g.metric_type && <span className="capitalize">{g.metric_type.replace('_', ' ')}</span>}
                    {g.target_value && <span>Target: {g.target_value}</span>}
                    <span>{new Date(g.start_date).toLocaleDateString('en-IN')} — {new Date(g.end_date).toLocaleDateString('en-IN')}</span>
                  </div>

                  {/* Milestones */}
                  {g.goal_type === 'milestone' && milestones[g.id] && (
                    <div className="space-y-1.5">
                      {milestones[g.id].map(ms => (
                        <label key={ms.id} className="flex items-center gap-2 cursor-pointer group">
                          <input
                            type="checkbox"
                            checked={ms.completed}
                            onChange={() => toggleMilestone(ms)}
                            className="w-4 h-4 rounded border-white/20 bg-white/5 text-accent-blue focus:ring-accent-blue/50"
                          />
                          <span className={`text-sm ${ms.completed ? 'line-through text-text-muted' : 'text-text-secondary group-hover:text-text-primary'}`}>
                            {ms.title}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
