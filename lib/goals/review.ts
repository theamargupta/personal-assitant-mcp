import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { computeGoalProgress, listGoals } from './goals'
import type { PeriodReview, ReviewHighlights } from '@/types'

export async function generateReview(
  userId: string,
  startDate: string,
  endDate: string,
  label: string
): Promise<PeriodReview> {
  const supabase = createServiceRoleClient()
  const startISO = startDate + 'T00:00:00+05:30'
  const endISO = endDate + 'T23:59:59+05:30'

  // ── Habits ────────────────────────────────────────────
  const { data: habits } = await supabase
    .from('habits')
    .select('id, name')
    .eq('user_id', userId)
    .eq('archived', false)

  const totalDays = Math.ceil(
    (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)
  ) + 1

  const habitStreaks: Array<{ name: string; current_streak: number; completion_pct: number }> = []

  for (const habit of habits || []) {
    const { data: logs } = await supabase
      .from('habit_logs')
      .select('logged_date')
      .eq('habit_id', habit.id)
      .gte('logged_date', startDate)
      .lte('logged_date', endDate)
      .order('logged_date', { ascending: false })

    const completions = logs?.length || 0
    const pct = totalDays > 0 ? Math.round((completions / totalDays) * 100 * 10) / 10 : 0

    // Calculate current streak within period
    let streak = 0
    if (logs && logs.length > 0) {
      streak = 1
      for (let i = 1; i < logs.length; i++) {
        const prev = new Date(logs[i - 1].logged_date)
        const curr = new Date(logs[i].logged_date)
        const diff = (prev.getTime() - curr.getTime()) / (1000 * 60 * 60 * 24)
        if (diff === 1) streak++
        else break
      }
    }

    habitStreaks.push({ name: habit.name, current_streak: streak, completion_pct: pct })
  }

  const avgCompletionPct = habitStreaks.length > 0
    ? Math.round(habitStreaks.reduce((sum, h) => sum + h.completion_pct, 0) / habitStreaks.length * 10) / 10
    : 0

  // ── Tasks ─────────────────────────────────────────────
  const { count: tasksCompleted } = await supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'completed')
    .gte('completed_at', startISO)
    .lte('completed_at', endISO)

  const { count: tasksPending } = await supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'pending')

  const { count: tasksOverdue } = await supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .neq('status', 'completed')
    .lt('due_date', endDate)

  const { count: tasksCreated } = await supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', startISO)
    .lte('created_at', endISO)

  // ── Finance ───────────────────────────────────────────
  const { data: spendingData } = await supabase.rpc('get_spending_summary', {
    target_user_id: userId,
    start_date: startISO,
    end_date: endISO,
  })

  const financeBreakdown = (spendingData || []).map((row: {
    category_name: string; category_icon: string; total_amount: number; transaction_count: number
  }) => ({
    category: row.category_name,
    icon: row.category_icon,
    amount: Number(row.total_amount),
    count: Number(row.transaction_count),
  }))

  const totalSpent = financeBreakdown.reduce((sum: number, b: { amount: number }) => sum + b.amount, 0)

  // Biggest single spend
  const { data: biggestSpend } = await supabase
    .from('transactions')
    .select('amount, merchant, transaction_date')
    .eq('user_id', userId)
    .gte('transaction_date', startISO)
    .lte('transaction_date', endISO)
    .order('amount', { ascending: false })
    .limit(1)
    .maybeSingle()

  // ── Goals ─────────────────────────────────────────────
  const allGoals = await listGoals(userId)
  const periodGoals = allGoals.filter(g => {
    return g.start_date <= endDate && g.end_date >= startDate
  })

  const goalDetails: Array<{
    title: string; goal_type: string; progress_pct: number;
    status: string; current_value: number; target_value: number | null
  }> = []

  let goalsHit = 0
  let goalsMissed = 0

  for (const goal of periodGoals) {
    const progress = await computeGoalProgress(userId, goal.id)
    goalDetails.push({
      title: goal.title,
      goal_type: goal.goal_type,
      progress_pct: progress.progressPct,
      status: goal.status,
      current_value: progress.currentValue,
      target_value: goal.target_value,
    })

    if (goal.status === 'completed' || progress.progressPct >= 100) goalsHit++
    if (goal.status === 'failed') goalsMissed++
  }

  const activeGoals = periodGoals.filter(g => g.status === 'active').length
  const completedGoals = periodGoals.filter(g => g.status === 'completed').length
  const failedGoals = periodGoals.filter(g => g.status === 'failed').length

  // ── Highlights ────────────────────────────────────────
  const sortedByStreak = [...habitStreaks].sort((a, b) => b.current_streak - a.current_streak)
  const sortedByCompletion = [...habitStreaks].sort((a, b) => a.completion_pct - b.completion_pct)

  const highlights: ReviewHighlights = {
    best_habit: sortedByStreak.length > 0
      ? { name: sortedByStreak[0].name, streak: sortedByStreak[0].current_streak }
      : null,
    worst_habit: sortedByCompletion.length > 0 && sortedByCompletion[0].completion_pct < 50
      ? { name: sortedByCompletion[0].name, completion_pct: sortedByCompletion[0].completion_pct }
      : null,
    top_spending_category: financeBreakdown.length > 0
      ? { name: financeBreakdown[0].category, icon: financeBreakdown[0].icon, amount: financeBreakdown[0].amount }
      : null,
    biggest_single_spend: biggestSpend
      ? {
        amount: Number(biggestSpend.amount),
        merchant: biggestSpend.merchant || 'Unknown',
        date: new Date(biggestSpend.transaction_date).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }),
      }
      : null,
    goals_hit: goalsHit,
    goals_missed: goalsMissed,
    tasks_completed: tasksCompleted || 0,
    tasks_pending: tasksPending || 0,
  }

  return {
    period: { start: startDate, end: endDate, label },
    habits: {
      total_tracked: habitStreaks.length,
      avg_completion_pct: avgCompletionPct,
      streaks: habitStreaks.sort((a, b) => b.current_streak - a.current_streak),
    },
    tasks: {
      completed: tasksCompleted || 0,
      pending: tasksPending || 0,
      overdue: tasksOverdue || 0,
      total_created: tasksCreated || 0,
    },
    finance: {
      total_spent: totalSpent,
      breakdown: financeBreakdown,
    },
    goals: {
      active: activeGoals,
      completed: completedGoals,
      failed: failedGoals,
      details: goalDetails,
    },
    highlights,
  }
}
