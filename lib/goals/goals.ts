import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { GoalType, MetricType, GoalRecurrence } from '@/types'

// ── Create ──────────────────────────────────────────────

interface CreateGoalInput {
  userId: string
  title: string
  description?: string
  goalType: GoalType
  metricType?: MetricType
  metricRefId?: string
  targetValue?: number
  isRecurring?: boolean
  recurrence?: GoalRecurrence
  startDate: string
  endDate: string
}

export async function createGoal(input: CreateGoalInput) {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('goals')
    .insert({
      user_id: input.userId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      goal_type: input.goalType,
      metric_type: input.metricType || null,
      metric_ref_id: input.metricRefId || null,
      target_value: input.targetValue || null,
      is_recurring: input.isRecurring || false,
      recurrence: input.recurrence || null,
      start_date: input.startDate,
      end_date: input.endDate,
      status: 'active',
    })
    .select('id, title, goal_type, status, start_date, end_date, created_at')
    .single()

  if (error) throw new Error(error.message)
  return data
}

// ── List ────────────────────────────────────────────────

export async function listGoals(
  userId: string,
  status?: string,
  goalType?: string
) {
  const supabase = createServiceRoleClient()
  let query = supabase
    .from('goals')
    .select('*')
    .eq('user_id', userId)

  if (status) query = query.eq('status', status)
  if (goalType) query = query.eq('goal_type', goalType)

  const { data, error } = await query.order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return data || []
}

// ── Update ──────────────────────────────────────────────

export async function updateGoal(
  userId: string,
  goalId: string,
  updates: { title?: string; description?: string; status?: string; targetValue?: number }
) {
  const supabase = createServiceRoleClient()
  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (updates.title !== undefined) updateData.title = updates.title.trim()
  if (updates.description !== undefined) updateData.description = updates.description?.trim() || null
  if (updates.status !== undefined) updateData.status = updates.status
  if (updates.targetValue !== undefined) updateData.target_value = updates.targetValue

  const { data, error } = await supabase
    .from('goals')
    .update(updateData)
    .eq('id', goalId)
    .eq('user_id', userId)
    .select('id, title, status, updated_at')
    .single()

  if (error || !data) throw new Error('Goal not found')
  return data
}

// ── Milestones ──────────────────────────────────────────

export async function addMilestone(
  userId: string,
  goalId: string,
  title: string,
  sortOrder: number
) {
  const supabase = createServiceRoleClient()

  // Verify goal exists and belongs to user
  const { data: goal } = await supabase
    .from('goals')
    .select('id, goal_type')
    .eq('id', goalId)
    .eq('user_id', userId)
    .single()

  if (!goal) throw new Error('Goal not found')
  if (goal.goal_type !== 'milestone') throw new Error('Can only add milestones to milestone-type goals')

  const { data, error } = await supabase
    .from('goal_milestones')
    .insert({
      goal_id: goalId,
      user_id: userId,
      title: title.trim(),
      sort_order: sortOrder,
    })
    .select('id, title, sort_order, completed, created_at')
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function toggleMilestone(userId: string, milestoneId: string) {
  const supabase = createServiceRoleClient()

  const { data: ms } = await supabase
    .from('goal_milestones')
    .select('id, completed, goal_id')
    .eq('id', milestoneId)
    .eq('user_id', userId)
    .single()

  if (!ms) throw new Error('Milestone not found')

  const newCompleted = !ms.completed

  const { data, error } = await supabase
    .from('goal_milestones')
    .update({
      completed: newCompleted,
      completed_at: newCompleted ? new Date().toISOString() : null,
    })
    .eq('id', milestoneId)
    .eq('user_id', userId)
    .select('id, title, completed, completed_at')
    .single()

  if (error) throw new Error(error.message)

  // Check if all milestones are done → auto-complete the goal
  if (newCompleted) {
    const { count } = await supabase
      .from('goal_milestones')
      .select('*', { count: 'exact', head: true })
      .eq('goal_id', ms.goal_id)
      .eq('completed', false)

    if (count === 0) {
      await supabase
        .from('goals')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', ms.goal_id)
        .eq('user_id', userId)
    }
  }

  return data
}

export async function updateMilestone(
  userId: string,
  milestoneId: string,
  updates: { title?: string; sortOrder?: number; completed?: boolean }
) {
  const supabase = createServiceRoleClient()

  const { data: existing } = await supabase
    .from('goal_milestones')
    .select('id, goal_id, completed')
    .eq('id', milestoneId)
    .eq('user_id', userId)
    .single()

  if (!existing) throw new Error('Milestone not found')

  const patch: Record<string, unknown> = {}
  if (updates.title !== undefined) patch.title = updates.title.trim()
  if (updates.sortOrder !== undefined) patch.sort_order = updates.sortOrder
  if (updates.completed !== undefined) {
    patch.completed = updates.completed
    patch.completed_at = updates.completed ? new Date().toISOString() : null
  }

  if (Object.keys(patch).length === 0) throw new Error('No fields to update')

  const { data, error } = await supabase
    .from('goal_milestones')
    .update(patch)
    .eq('id', milestoneId)
    .eq('user_id', userId)
    .select('id, goal_id, title, sort_order, completed, completed_at')
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Update failed')

  // If newly completed and all siblings done → auto-complete goal
  if (updates.completed === true && !existing.completed) {
    const { count } = await supabase
      .from('goal_milestones')
      .select('*', { count: 'exact', head: true })
      .eq('goal_id', existing.goal_id)
      .eq('completed', false)

    if (count === 0) {
      await supabase
        .from('goals')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', existing.goal_id)
        .eq('user_id', userId)
    }
  }

  return data
}

export async function deleteMilestone(userId: string, milestoneId: string) {
  const supabase = createServiceRoleClient()

  const { data: existing } = await supabase
    .from('goal_milestones')
    .select('id, goal_id, title')
    .eq('id', milestoneId)
    .eq('user_id', userId)
    .single()

  if (!existing) throw new Error('Milestone not found')

  const { error } = await supabase
    .from('goal_milestones')
    .delete()
    .eq('id', milestoneId)
    .eq('user_id', userId)

  if (error) throw new Error(error.message)
  return existing
}

// ── Progress computation ────────────────────────────────

export async function computeGoalProgress(
  userId: string,
  goalId: string
): Promise<{ currentValue: number; targetValue: number; progressPct: number }> {
  const supabase = createServiceRoleClient()

  const { data: goal } = await supabase
    .from('goals')
    .select('*')
    .eq('id', goalId)
    .eq('user_id', userId)
    .single()

  if (!goal) throw new Error('Goal not found')

  // Milestone goals — progress = % milestones completed
  if (goal.goal_type === 'milestone') {
    const { data: milestones } = await supabase
      .from('goal_milestones')
      .select('completed')
      .eq('goal_id', goalId)

    const total = milestones?.length || 0
    const done = milestones?.filter(m => m.completed).length || 0
    const pct = total === 0 ? 0 : Math.round((done / total) * 100)

    return { currentValue: done, targetValue: total, progressPct: pct }
  }

  // Outcome goals — compute from linked data
  const target = goal.target_value || 0
  let currentValue = 0

  const startDate = goal.start_date
  const endDate = goal.end_date

  switch (goal.metric_type) {
    case 'habit_streak': {
      if (!goal.metric_ref_id) break
      const { data: logs } = await supabase
        .from('habit_logs')
        .select('logged_date')
        .eq('habit_id', goal.metric_ref_id)
        .gte('logged_date', startDate)
        .lte('logged_date', endDate)
        .order('logged_date', { ascending: false })

      // Calculate streak within period
      if (logs && logs.length > 0) {
        let streak = 1
        for (let i = 1; i < logs.length; i++) {
          const prev = new Date(logs[i - 1].logged_date)
          const curr = new Date(logs[i].logged_date)
          const diff = (prev.getTime() - curr.getTime()) / (1000 * 60 * 60 * 24)
          if (diff === 1) streak++
          else break
        }
        currentValue = streak
      }
      break
    }

    case 'habit_completion': {
      if (!goal.metric_ref_id) break
      const start = new Date(startDate)
      const end = new Date(endDate)
      const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1

      const { count } = await supabase
        .from('habit_logs')
        .select('*', { count: 'exact', head: true })
        .eq('habit_id', goal.metric_ref_id)
        .gte('logged_date', startDate)
        .lte('logged_date', endDate)

      currentValue = totalDays > 0 ? Math.round(((count || 0) / totalDays) * 100 * 10) / 10 : 0
      break
    }

    case 'tasks_completed': {
      const { count } = await supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'completed')
        .gte('completed_at', startDate + 'T00:00:00+05:30')
        .lte('completed_at', endDate + 'T23:59:59+05:30')

      currentValue = count || 0
      break
    }

    case 'spending_limit': {
      let query = supabase
        .from('transactions')
        .select('amount')
        .eq('user_id', userId)
        .gte('transaction_date', startDate + 'T00:00:00+05:30')
        .lte('transaction_date', endDate + 'T23:59:59+05:30')

      if (goal.metric_ref_id) {
        query = query.eq('category_id', goal.metric_ref_id)
      }

      const { data: txns } = await query
      currentValue = (txns || []).reduce((sum, t) => sum + Number(t.amount), 0)
      break
    }
  }

  // For spending_limit, progress is inverse (lower is better)
  let progressPct: number
  if (goal.metric_type === 'spending_limit') {
    progressPct = target === 0 ? 0 : Math.round(Math.max(0, (1 - currentValue / target)) * 100)
  } else {
    progressPct = target === 0 ? 0 : Math.round(Math.min(100, (currentValue / target) * 100))
  }

  return { currentValue, targetValue: target, progressPct }
}
