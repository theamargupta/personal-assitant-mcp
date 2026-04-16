'use client'

import { useEffect, useState, useCallback, type FormEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'

type GoalType = 'outcome' | 'milestone'
type GoalStatus = 'active' | 'completed' | 'failed'
type DbMetricType = 'habit_streak' | 'habit_completion' | 'tasks_completed' | 'spending_limit'
type GoalMetricForm = 'tasks_completed' | 'habit_streak' | 'savings' | 'custom'

interface Goal {
  id: string
  title: string
  description: string | null
  goal_type: GoalType
  metric_type: DbMetricType | null
  target_value: number | null
  start_date: string
  end_date: string
  status: GoalStatus
}

interface Milestone {
  id: string
  goal_id: string
  title: string
  sort_order: number
  completed: boolean
}

interface GoalForm {
  title: string
  description: string
  goal_type: GoalType
  metric_type: GoalMetricForm
  target_value: string
  start_date: string
  end_date: string
  status: GoalStatus
}

const statusTabs = ['active', 'completed', 'failed'] as const
const inputClass = 'w-full px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.06] text-text-primary text-[14px] placeholder:text-text-muted focus:outline-none focus:border-neon/30 focus:ring-1 focus:ring-neon/20'
const statusBadgeClasses: Record<GoalStatus, string> = {
  active: 'bg-white/[0.04] text-text-secondary border border-white/[0.06]',
  completed: 'bg-neon/[0.08] text-neon border border-neon/[0.12]',
  failed: 'bg-red-500/[0.06] text-red-400 border border-red-500/[0.1]',
}

function todayDate() {
  return new Date().toISOString().split('T')[0]
}

function defaultEndDate() {
  const date = new Date()
  date.setDate(date.getDate() + 30)
  return date.toISOString().split('T')[0]
}

function emptyGoalForm(): GoalForm {
  return {
    title: '',
    description: '',
    goal_type: 'outcome',
    metric_type: 'tasks_completed',
    target_value: '',
    start_date: todayDate(),
    end_date: defaultEndDate(),
    status: 'active',
  }
}

function toDbMetric(metric: GoalMetricForm): DbMetricType | null {
  if (metric === 'savings') return 'spending_limit'
  if (metric === 'custom') return null
  return metric
}

function fromDbMetric(metric: DbMetricType | null): GoalMetricForm {
  if (metric === 'spending_limit') return 'savings'
  if (metric === 'habit_streak' || metric === 'tasks_completed') return metric
  return 'custom'
}

function ProgressRing({ pct, size = 80 }: { pct: number; size?: number }) {
  const r = (size - 10) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (pct / 100) * circ

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="6" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#c8ff00"
          strokeWidth="6"
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
  const [tab, setTab] = useState<GoalStatus>('active')
  const [loading, setLoading] = useState(true)
  const [showGoalModal, setShowGoalModal] = useState(false)
  const [goalForm, setGoalForm] = useState<GoalForm>(emptyGoalForm)
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null)
  const [deleteGoalTarget, setDeleteGoalTarget] = useState<Goal | null>(null)
  const [milestoneInputs, setMilestoneInputs] = useState<Record<string, string>>({})
  const [toast, setToast] = useState('')

  const showToast = useCallback((message: string) => {
    setToast(message)
    setTimeout(() => setToast(''), 2000)
  }, [])

  const loadGoals = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }

    const { data: goalsData } = await supabase
      .from('goals')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', tab)
      .order('created_at', { ascending: false })

    const loadedGoals = (goalsData ?? []) as Goal[]
    setGoals(loadedGoals)

    const milestoneGoals = loadedGoals.filter((goal) => goal.goal_type === 'milestone')
    if (milestoneGoals.length > 0) {
      const { data: msData } = await supabase
        .from('goal_milestones')
        .select('*')
        .eq('user_id', user.id)
        .in('goal_id', milestoneGoals.map((goal) => goal.id))
        .order('sort_order', { ascending: true })

      const grouped: Record<string, Milestone[]> = {}
      ;((msData ?? []) as Milestone[]).forEach((milestone) => {
        if (!grouped[milestone.goal_id]) grouped[milestone.goal_id] = []
        grouped[milestone.goal_id].push(milestone)
      })
      setMilestones(grouped)
    } else {
      setMilestones({})
    }

    setLoading(false)
  }, [tab])

  useEffect(() => { loadGoals() }, [loadGoals])

  function openCreateModal() {
    setEditingGoal(null)
    setGoalForm(emptyGoalForm())
    setShowGoalModal(true)
  }

  function openEditModal(goal: Goal) {
    setEditingGoal(goal)
    setGoalForm({
      title: goal.title,
      description: goal.description ?? '',
      goal_type: goal.goal_type,
      metric_type: fromDbMetric(goal.metric_type),
      target_value: goal.target_value != null ? String(Number(goal.target_value)) : '',
      start_date: goal.start_date,
      end_date: goal.end_date,
      status: goal.status,
    })
    setShowGoalModal(true)
  }

  async function saveGoal(e: FormEvent) {
    e.preventDefault()
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const targetValue = goalForm.target_value ? parseFloat(goalForm.target_value) : null

    const { error } = editingGoal
      ? await supabase
        .from('goals')
        .update({
          title: goalForm.title.trim(),
          description: goalForm.description.trim() || null,
          status: goalForm.status,
          target_value: editingGoal.goal_type === 'outcome' ? targetValue : null,
          end_date: goalForm.end_date,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingGoal.id)
        .eq('user_id', user.id)
      : await supabase
        .from('goals')
        .insert({
          user_id: user.id,
          title: goalForm.title.trim(),
          description: goalForm.description.trim() || null,
          goal_type: goalForm.goal_type,
          metric_type: goalForm.goal_type === 'outcome' ? toDbMetric(goalForm.metric_type) : null,
          target_value: goalForm.goal_type === 'outcome' ? targetValue : null,
          start_date: goalForm.start_date,
          end_date: goalForm.end_date,
          status: 'active',
        })

    if (error) {
      showToast(error.message)
      return
    }

    setShowGoalModal(false)
    setEditingGoal(null)
    setGoalForm(emptyGoalForm())
    await loadGoals()
    showToast(editingGoal ? 'Goal updated' : 'Goal created')
  }

  async function toggleMilestone(milestone: Milestone) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase
      .from('goal_milestones')
      .update({
        completed: !milestone.completed,
        completed_at: !milestone.completed ? new Date().toISOString() : null,
      })
      .eq('id', milestone.id)
      .eq('user_id', user.id)

    if (error) {
      showToast(error.message)
      return
    }

    await loadGoals()
    showToast('Milestone updated')
  }

  async function addMilestone(goal: Goal) {
    const title = (milestoneInputs[goal.id] ?? '').trim()
    if (!title) return

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase.from('goal_milestones').insert({
      goal_id: goal.id,
      user_id: user.id,
      title,
      sort_order: (milestones[goal.id]?.length ?? 0) + 1,
      completed: false,
    })

    if (error) {
      showToast(error.message)
      return
    }

    setMilestoneInputs((current) => ({ ...current, [goal.id]: '' }))
    await loadGoals()
    showToast('Milestone added')
  }

  async function deleteGoal() {
    if (!deleteGoalTarget) return

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error: milestonesError } = await supabase
      .from('goal_milestones')
      .delete()
      .eq('goal_id', deleteGoalTarget.id)
      .eq('user_id', user.id)

    if (milestonesError) {
      showToast(milestonesError.message)
      return
    }

    const { error: goalError } = await supabase
      .from('goals')
      .delete()
      .eq('id', deleteGoalTarget.id)
      .eq('user_id', user.id)

    if (goalError) {
      showToast(goalError.message)
      return
    }

    setDeleteGoalTarget(null)
    await loadGoals()
    showToast('Goal deleted')
  }

  function getOutcomeProgress(goal: Goal): number {
    const now = new Date()
    const start = new Date(goal.start_date)
    const end = new Date(goal.end_date)
    const elapsed = now.getTime() - start.getTime()
    const total = end.getTime() - start.getTime()
    if (total <= 0) return 0
    return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)))
  }

  function getMilestoneProgress(goalId: string): number {
    const goalMilestones = milestones[goalId]
    if (!goalMilestones || goalMilestones.length === 0) return 0
    return Math.round((goalMilestones.filter((milestone) => milestone.completed).length / goalMilestones.length) * 100)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-neon border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[22px] font-bold text-text-primary tracking-[-0.02em]">Goals</h1>
        <button
          onClick={openCreateModal}
          className="px-4 py-2 rounded-lg bg-neon text-bg-primary hover:bg-neon-muted text-sm font-semibold transition-all"
        >
          New Goal
        </button>
      </div>

      <div className="flex gap-2 mb-6">
        {statusTabs.map((status) => (
          <button
            key={status}
            onClick={() => setTab(status)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize ${
              tab === status ? 'bg-neon/[0.1] text-neon' : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            {status}
          </button>
        ))}
      </div>

      {goals.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-12 text-center">
          <p className="text-text-muted">No {tab} goals. Create one to start tracking.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {goals.map((goal, i) => {
            const progress = goal.goal_type === 'milestone' ? getMilestoneProgress(goal.id) : getOutcomeProgress(goal)
            return (
              <motion.div
                key={goal.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5"
              >
                <div className="flex items-start gap-4">
                  <ProgressRing pct={progress} />

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h3 className="font-semibold text-text-primary">{goal.title}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${
                        goal.goal_type === 'outcome'
                          ? 'bg-neon/[0.08] text-neon border-neon/[0.12]'
                          : 'bg-white/[0.04] text-text-secondary border-white/[0.06]'
                      }`}>
                        {goal.goal_type}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${statusBadgeClasses[goal.status]}`}>
                        {goal.status}
                      </span>
                    </div>

                    {goal.description && <p className="text-xs text-text-muted mb-2">{goal.description}</p>}

                    <div className="flex flex-wrap gap-3 text-xs text-text-muted mb-3">
                      {goal.metric_type && <span className="capitalize">{fromDbMetric(goal.metric_type).replace('_', ' ')}</span>}
                      {goal.target_value != null && <span>Target: {Number(goal.target_value).toLocaleString('en-IN')}</span>}
                      <span>{new Date(goal.start_date).toLocaleDateString('en-IN')} - {new Date(goal.end_date).toLocaleDateString('en-IN')}</span>
                    </div>

                    {goal.goal_type === 'milestone' && (
                      <div className="space-y-2">
                        {(milestones[goal.id] ?? []).map((milestone) => (
                          <label key={milestone.id} className="flex items-center gap-2 cursor-pointer group">
                            <input
                              type="checkbox"
                              checked={milestone.completed}
                              onChange={() => toggleMilestone(milestone)}
                              className="w-4 h-4 rounded border-white/[0.12] bg-white/[0.04] text-neon focus:ring-neon/20"
                            />
                            <span className={`text-sm ${milestone.completed ? 'line-through text-text-muted' : 'text-text-secondary group-hover:text-text-primary'}`}>
                              {milestone.title}
                            </span>
                          </label>
                        ))}
                        <form
                          onSubmit={(event) => {
                            event.preventDefault()
                            addMilestone(goal)
                          }}
                          className="flex gap-2 pt-2"
                        >
                          <input
                            type="text"
                            placeholder="Add milestone"
                            value={milestoneInputs[goal.id] ?? ''}
                            onChange={(e) => setMilestoneInputs((current) => ({ ...current, [goal.id]: e.target.value }))}
                            className={inputClass}
                          />
                          <button type="submit" className="h-10 w-10 rounded-lg bg-neon text-bg-primary hover:bg-neon-muted text-lg font-semibold transition-all">+</button>
                        </form>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => openEditModal(goal)}
                      aria-label={`Edit ${goal.title}`}
                      className="h-8 w-8 rounded-lg border border-white/[0.08] text-text-secondary hover:text-text-primary hover:border-white/[0.12] transition-all"
                    >
                      ✎
                    </button>
                    <button
                      onClick={() => setDeleteGoalTarget(goal)}
                      aria-label={`Delete ${goal.title}`}
                      className="h-8 w-8 rounded-lg bg-red-500/[0.1] text-red-400 border border-red-500/[0.15] hover:bg-red-500/[0.2] transition-all"
                    >
                      🗑
                    </button>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      <AnimatePresence>
        {showGoalModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
            onClick={() => setShowGoalModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="rounded-2xl border border-white/[0.06] bg-bg-surface p-6 w-full max-w-md max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-semibold text-text-primary mb-4">{editingGoal ? 'Edit Goal' : 'New Goal'}</h2>
              <form onSubmit={saveGoal} className="space-y-3">
                <input type="text" placeholder="Title" value={goalForm.title} onChange={(e) => setGoalForm({ ...goalForm, title: e.target.value })} required className={inputClass} />
                <textarea placeholder="Description (optional)" value={goalForm.description} onChange={(e) => setGoalForm({ ...goalForm, description: e.target.value })} rows={3} className={`${inputClass} resize-none`} />

                {!editingGoal && (
                  <div className="grid grid-cols-2 gap-2">
                    {(['outcome', 'milestone'] as const).map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setGoalForm({ ...goalForm, goal_type: type })}
                        className={`px-3 py-2 rounded-lg text-sm capitalize transition-all ${
                          goalForm.goal_type === type
                            ? 'bg-neon/[0.1] text-neon'
                            : 'border border-white/[0.08] text-text-secondary hover:text-text-primary'
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                )}

                {goalForm.goal_type === 'outcome' && (
                  <div className="grid grid-cols-2 gap-3">
                    <select value={goalForm.metric_type} onChange={(e) => setGoalForm({ ...goalForm, metric_type: e.target.value as GoalMetricForm })} disabled={!!editingGoal} className={inputClass}>
                      <option value="tasks_completed">tasks_completed</option>
                      <option value="habit_streak">habit_streak</option>
                      <option value="savings">savings</option>
                      <option value="custom">custom</option>
                    </select>
                    <input type="number" placeholder="Target value" value={goalForm.target_value} onChange={(e) => setGoalForm({ ...goalForm, target_value: e.target.value })} className={inputClass} />
                  </div>
                )}

                {editingGoal && (
                  <select value={goalForm.status} onChange={(e) => setGoalForm({ ...goalForm, status: e.target.value as GoalStatus })} className={inputClass}>
                    <option value="active">Active</option>
                    <option value="completed">Completed</option>
                    <option value="failed">Failed</option>
                  </select>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <input type="date" value={goalForm.start_date} onChange={(e) => setGoalForm({ ...goalForm, start_date: e.target.value })} disabled={!!editingGoal} className={inputClass} />
                  <input type="date" value={goalForm.end_date} onChange={(e) => setGoalForm({ ...goalForm, end_date: e.target.value })} required className={inputClass} />
                </div>

                <div className="flex gap-2 pt-2">
                  <button type="submit" className="flex-1 py-2 rounded-lg bg-neon text-bg-primary hover:bg-neon-muted text-sm font-semibold transition-all">
                    {editingGoal ? 'Save' : 'Create'}
                  </button>
                  <button type="button" onClick={() => setShowGoalModal(false)} className="px-4 py-2 rounded-lg border border-white/[0.08] text-text-secondary hover:text-text-primary text-sm transition-all">Cancel</button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteGoalTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
            onClick={() => setDeleteGoalTarget(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="rounded-2xl border border-white/[0.06] bg-bg-surface p-6 w-full max-w-sm"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-semibold text-text-primary mb-2">Delete this goal?</h2>
              <p className="text-sm text-text-muted mb-5">{deleteGoalTarget.title}</p>
              <div className="flex gap-2">
                <button onClick={deleteGoal} className="flex-1 py-2 rounded-lg bg-red-500/[0.1] text-red-400 border border-red-500/[0.15] hover:bg-red-500/[0.2] text-sm transition-all">Delete</button>
                <button onClick={() => setDeleteGoalTarget(null)} className="px-4 py-2 rounded-lg border border-white/[0.08] text-text-secondary hover:text-text-primary text-sm transition-all">Cancel</button>
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
