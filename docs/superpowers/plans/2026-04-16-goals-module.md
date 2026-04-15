# Goals Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Goals module to PA MCP that supports auto-tracked outcome goals (linked to habits/tasks/finance data) and manual milestone goals, plus a comprehensive review tool that pulls everything together — so "mera April review do" gives a complete personal report with highlights.

**Architecture:** Two new tables (`goals`, `goal_milestones`). Outcome goals define a `metric_type` (habit_streak, habit_completion, tasks_completed, spending_limit) and `target_value` — progress is computed live from existing tables, never duplicated. Milestone goals have manually toggled sub-milestones. A `get_review` MCP tool aggregates data from habits, tasks, finance, and goals for any period, pre-computes highlights (best streak, top spending category, goals hit/missed), and returns structured data for Claude to narrate naturally.

**Tech Stack:** Next.js 16.2.3 (existing), Supabase (existing), Zod (existing)

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `supabase/migrations/005_goals.sql` | `goals` + `goal_milestones` tables, RLS, indexes |
| `lib/goals/goals.ts` | Goal CRUD + progress computation from linked data |
| `lib/goals/review.ts` | Cross-module aggregation: habits + tasks + finance + goals → review with highlights |
| `lib/mcp/tools/goals.ts` | 6 MCP tools (create, list, update, progress, review, add_milestone) |

### Modified Files
| File | Change |
|------|--------|
| `lib/mcp/server.ts` | Import and register goal tools |
| `types/index.ts` | Add Goal, GoalMilestone, Review types |
| `CLAUDE.md` | Add goals module section |

---

## Task 1: Database Migration — goals + goal_milestones

**Files:**
- Create: `supabase/migrations/005_goals.sql`

- [ ] **Step 1: Create migration file**

Create `supabase/migrations/005_goals.sql`:

```sql
-- ============================================================
-- PA MCP: Goals module
-- ============================================================

-- ── goals ───────────────────────────────────────────────────

CREATE TABLE goals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT,
  goal_type       TEXT NOT NULL CHECK (goal_type IN ('outcome', 'milestone')),

  -- Outcome goal fields (auto-tracked)
  metric_type     TEXT CHECK (metric_type IN (
    'habit_streak', 'habit_completion', 'tasks_completed', 'spending_limit'
  )),
  metric_ref_id   UUID,              -- habit_id for habit goals, category_id for spending goals, NULL for tasks
  target_value    NUMERIC(12, 2),     -- e.g. streak >= 30, completion >= 90%, tasks >= 10, spending <= 5000

  -- Timeframe
  is_recurring    BOOLEAN DEFAULT false,
  recurrence      TEXT CHECK (recurrence IN ('weekly', 'monthly')),
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,

  -- Status
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'failed', 'archived')),

  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_goals_user_id ON goals(user_id);
CREATE INDEX idx_goals_status ON goals(user_id, status);
CREATE INDEX idx_goals_dates ON goals(user_id, start_date, end_date);
CREATE INDEX idx_goals_type ON goals(user_id, goal_type);

ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own goals"
  ON goals FOR ALL
  USING (user_id = auth.uid());

-- ── goal_milestones ─────────────────────────────────────────

CREATE TABLE goal_milestones (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id     UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  completed   BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_milestones_goal ON goal_milestones(goal_id);
CREATE INDEX idx_milestones_user ON goal_milestones(user_id);

ALTER TABLE goal_milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own milestones"
  ON goal_milestones FOR ALL
  USING (user_id = auth.uid());
```

- [ ] **Step 2: Run migration in Supabase SQL Editor**

Copy the full contents and run in Supabase Dashboard > SQL Editor. Verify both tables exist.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/005_goals.sql
git commit -m "feat(goals): add goals and goal_milestones tables with RLS"
```

---

## Task 2: Add TypeScript Types

**Files:**
- Modify: `types/index.ts`

- [ ] **Step 1: Add goal types**

Append to the end of `types/index.ts`:

```typescript
// ============ GOAL TYPES ============

export type GoalType = 'outcome' | 'milestone'
export type MetricType = 'habit_streak' | 'habit_completion' | 'tasks_completed' | 'spending_limit'
export type GoalStatus = 'active' | 'completed' | 'failed' | 'archived'
export type GoalRecurrence = 'weekly' | 'monthly'

export interface Goal {
  id: string
  user_id: string
  title: string
  description: string | null
  goal_type: GoalType
  metric_type: MetricType | null
  metric_ref_id: string | null
  target_value: number | null
  is_recurring: boolean
  recurrence: GoalRecurrence | null
  start_date: string
  end_date: string
  status: GoalStatus
  created_at: string
  updated_at: string
}

export interface GoalMilestone {
  id: string
  goal_id: string
  user_id: string
  title: string
  sort_order: number
  completed: boolean
  completed_at: string | null
  created_at: string
}

// ============ REVIEW TYPES ============

export interface ReviewHighlights {
  best_habit: { name: string; streak: number } | null
  worst_habit: { name: string; completion_pct: number } | null
  top_spending_category: { name: string; icon: string; amount: number } | null
  biggest_single_spend: { amount: number; merchant: string; date: string } | null
  goals_hit: number
  goals_missed: number
  tasks_completed: number
  tasks_pending: number
}

export interface PeriodReview {
  period: { start: string; end: string; label: string }
  habits: {
    total_tracked: number
    avg_completion_pct: number
    streaks: Array<{ name: string; current_streak: number; completion_pct: number }>
  }
  tasks: {
    completed: number
    pending: number
    overdue: number
    total_created: number
  }
  finance: {
    total_spent: number
    breakdown: Array<{ category: string; icon: string; amount: number; count: number }>
  }
  goals: {
    active: number
    completed: number
    failed: number
    details: Array<{
      title: string
      goal_type: string
      progress_pct: number
      status: string
      current_value: number
      target_value: number | null
    }>
  }
  highlights: ReviewHighlights
}
```

- [ ] **Step 2: Commit**

```bash
git add types/index.ts
git commit -m "feat(goals): add Goal, GoalMilestone, and PeriodReview types"
```

---

## Task 3: Goal CRUD + Progress Computation

**Files:**
- Create: `lib/goals/goals.ts`

- [ ] **Step 1: Create goals module**

Create `lib/goals/goals.ts`:

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add lib/goals/goals.ts
git commit -m "feat(goals): add goal CRUD, milestone management, and live progress computation"
```

---

## Task 4: Review Aggregation Engine

**Files:**
- Create: `lib/goals/review.ts`

- [ ] **Step 1: Create review module**

Create `lib/goals/review.ts`:

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add lib/goals/review.ts
git commit -m "feat(goals): add cross-module review aggregation with highlights"
```

---

## Task 5: MCP Goal Tools

**Files:**
- Create: `lib/mcp/tools/goals.ts`

- [ ] **Step 1: Create goal MCP tools**

Create `lib/mcp/tools/goals.ts`:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { toIST, todayISTDate } from '@/types'
import {
  createGoal,
  listGoals,
  updateGoal,
  addMilestone,
  toggleMilestone,
  computeGoalProgress,
} from '@/lib/goals/goals'
import { generateReview } from '@/lib/goals/review'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export function registerGoalTools(server: McpServer) {

  // ── create_goal ─────────────────────────────────────────
  server.tool(
    'create_goal',
    'Create a new goal. Outcome goals auto-track from habits/tasks/finance. Milestone goals have manual sub-steps.',
    {
      title: z.string().min(1).max(255).describe('Goal title, e.g. "Maintain 90% workout completion"'),
      description: z.string().max(1000).optional().describe('Optional description'),
      goal_type: z.enum(['outcome', 'milestone']).describe('outcome = auto-tracked, milestone = manual sub-steps'),
      metric_type: z.enum(['habit_streak', 'habit_completion', 'tasks_completed', 'spending_limit']).optional()
        .describe('For outcome goals: what metric to track'),
      metric_ref_id: z.string().uuid().optional()
        .describe('For habit/spending goals: the habit_id or category_id to track'),
      target_value: z.number().optional()
        .describe('Target: streak days, completion %, task count, or spending limit in ₹'),
      is_recurring: z.boolean().default(false).describe('Recurring weekly/monthly goal?'),
      recurrence: z.enum(['weekly', 'monthly']).optional().describe('Recurrence period'),
      start_date: z.string().date().describe('Start date (YYYY-MM-DD)'),
      end_date: z.string().date().describe('End date (YYYY-MM-DD)'),
      milestones: z.array(z.string()).optional()
        .describe('For milestone goals: list of milestone titles in order'),
    },
    async ({ title, description, goal_type, metric_type, metric_ref_id, target_value,
      is_recurring, recurrence, start_date, end_date, milestones }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      const goal = await createGoal({
        userId,
        title,
        description,
        goalType: goal_type,
        metricType: metric_type,
        metricRefId: metric_ref_id,
        targetValue: target_value,
        isRecurring: is_recurring,
        recurrence,
        startDate: start_date,
        endDate: end_date,
      })

      // Add milestones if provided
      let milestonesCreated = 0
      if (goal_type === 'milestone' && milestones && milestones.length > 0) {
        for (let i = 0; i < milestones.length; i++) {
          await addMilestone(userId, goal.id, milestones[i], i)
          milestonesCreated++
        }
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            goal_id: goal.id,
            title: goal.title,
            goal_type: goal.goal_type,
            start_date: goal.start_date,
            end_date: goal.end_date,
            milestones_created: milestonesCreated,
            created_at: toIST(new Date(goal.created_at)),
          }),
        }],
      }
    }
  )

  // ── list_goals ──────────────────────────────────────────
  server.tool(
    'list_goals',
    'List goals with optional filters by status and type.',
    {
      status: z.enum(['active', 'completed', 'failed', 'archived']).optional().describe('Filter by status'),
      goal_type: z.enum(['outcome', 'milestone']).optional().describe('Filter by type'),
    },
    async ({ status, goal_type }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      const goals = await listGoals(userId, status, goal_type)

      const goalsWithProgress = await Promise.all(goals.map(async (goal) => {
        const progress = await computeGoalProgress(userId, goal.id)
        return {
          goal_id: goal.id,
          title: goal.title,
          goal_type: goal.goal_type,
          status: goal.status,
          start_date: goal.start_date,
          end_date: goal.end_date,
          progress_pct: progress.progressPct,
          current_value: progress.currentValue,
          target_value: progress.targetValue,
          is_recurring: goal.is_recurring,
        }
      }))

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ goals: goalsWithProgress, total: goalsWithProgress.length }),
        }],
      }
    }
  )

  // ── update_goal ─────────────────────────────────────────
  server.tool(
    'update_goal',
    'Update a goal\'s title, description, status, or target value. Also use to toggle milestone completion.',
    {
      goal_id: z.string().uuid().optional().describe('UUID of the goal to update'),
      milestone_id: z.string().uuid().optional().describe('UUID of a milestone to toggle complete/incomplete'),
      title: z.string().min(1).max(255).optional().describe('New title'),
      description: z.string().max(1000).optional().describe('New description'),
      status: z.enum(['active', 'completed', 'failed', 'archived']).optional().describe('New status'),
      target_value: z.number().optional().describe('New target value'),
    },
    async ({ goal_id, milestone_id, title, description, status, target_value }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      // Toggle milestone
      if (milestone_id) {
        const ms = await toggleMilestone(userId, milestone_id)
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              milestone_id: ms.id,
              title: ms.title,
              completed: ms.completed,
              completed_at: ms.completed_at ? toIST(new Date(ms.completed_at)) : null,
            }),
          }],
        }
      }

      // Update goal
      if (!goal_id) {
        return { content: [{ type: 'text' as const, text: 'Error: Provide goal_id or milestone_id' }], isError: true }
      }

      const goal = await updateGoal(userId, goal_id, { title, description, status, targetValue: target_value })
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            goal_id: goal.id,
            title: goal.title,
            status: goal.status,
            updated_at: toIST(new Date(goal.updated_at)),
          }),
        }],
      }
    }
  )

  // ── get_goal_progress ───────────────────────────────────
  server.tool(
    'get_goal_progress',
    'Get detailed progress for a specific goal including milestones if applicable.',
    {
      goal_id: z.string().uuid().describe('UUID of the goal'),
    },
    async ({ goal_id }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      const supabase = createServiceRoleClient()
      const { data: goal } = await supabase
        .from('goals')
        .select('*')
        .eq('id', goal_id)
        .eq('user_id', userId)
        .single()

      if (!goal) return { content: [{ type: 'text' as const, text: 'Error: Goal not found' }], isError: true }

      const progress = await computeGoalProgress(userId, goal_id)

      let milestones = null
      if (goal.goal_type === 'milestone') {
        const { data } = await supabase
          .from('goal_milestones')
          .select('id, title, completed, completed_at, sort_order')
          .eq('goal_id', goal_id)
          .order('sort_order', { ascending: true })

        milestones = (data || []).map(m => ({
          milestone_id: m.id,
          title: m.title,
          completed: m.completed,
          completed_at: m.completed_at ? toIST(new Date(m.completed_at)) : null,
        }))
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            goal_id: goal.id,
            title: goal.title,
            goal_type: goal.goal_type,
            metric_type: goal.metric_type,
            status: goal.status,
            current_value: progress.currentValue,
            target_value: progress.targetValue,
            progress_pct: progress.progressPct,
            start_date: goal.start_date,
            end_date: goal.end_date,
            milestones,
          }),
        }],
      }
    }
  )

  // ── get_review ──────────────────────────────────────────
  server.tool(
    'get_review',
    'Get a comprehensive personal review for a period. Pulls habits, tasks, finance, and goals together with highlights. Perfect for "mera April review do" or "is hafte ka summary bata".',
    {
      period: z.enum(['this_week', 'last_week', 'this_month', 'last_month', 'custom']).default('this_month')
        .describe('Review period'),
      start_date: z.string().date().optional().describe('Custom start date (YYYY-MM-DD), required if period=custom'),
      end_date: z.string().date().optional().describe('Custom end date (YYYY-MM-DD), required if period=custom'),
    },
    async ({ period, start_date, end_date }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      const now = new Date()
      let startStr: string
      let endStr: string
      let label: string

      switch (period) {
        case 'this_week': {
          const monday = new Date(now)
          monday.setDate(now.getDate() - now.getDay() + 1)
          startStr = monday.toISOString().split('T')[0]
          endStr = todayISTDate()
          label = 'This Week'
          break
        }
        case 'last_week': {
          const lastMonday = new Date(now)
          lastMonday.setDate(now.getDate() - now.getDay() - 6)
          const lastSunday = new Date(lastMonday)
          lastSunday.setDate(lastMonday.getDate() + 6)
          startStr = lastMonday.toISOString().split('T')[0]
          endStr = lastSunday.toISOString().split('T')[0]
          label = 'Last Week'
          break
        }
        case 'this_month': {
          startStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
          endStr = todayISTDate()
          label = now.toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' })
          break
        }
        case 'last_month': {
          const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
          const lastDay = new Date(now.getFullYear(), now.getMonth(), 0)
          startStr = lastMonth.toISOString().split('T')[0]
          endStr = lastDay.toISOString().split('T')[0]
          label = lastMonth.toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' })
          break
        }
        case 'custom': {
          if (!start_date || !end_date) {
            return { content: [{ type: 'text' as const, text: 'Error: start_date and end_date required for custom period' }], isError: true }
          }
          startStr = start_date
          endStr = end_date
          label = `${start_date} to ${end_date}`
          break
        }
        default:
          startStr = todayISTDate()
          endStr = todayISTDate()
          label = 'Today'
      }

      const review = await generateReview(userId, startStr, endStr, label)

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(review),
        }],
      }
    }
  )

  // ── add_milestone ───────────────────────────────────────
  server.tool(
    'add_milestone',
    'Add a new milestone/sub-step to a milestone-type goal.',
    {
      goal_id: z.string().uuid().describe('UUID of the milestone-type goal'),
      title: z.string().min(1).max(255).describe('Milestone title'),
      sort_order: z.number().int().min(0).default(0).describe('Position in the list (0-based)'),
    },
    async ({ goal_id, title, sort_order }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      const milestone = await addMilestone(userId, goal_id, title, sort_order)

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            milestone_id: milestone.id,
            title: milestone.title,
            sort_order: milestone.sort_order,
            created_at: toIST(new Date(milestone.created_at)),
          }),
        }],
      }
    }
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/mcp/tools/goals.ts
git commit -m "feat(goals): add 6 MCP goal tools (create, list, update, progress, review, add_milestone)"
```

---

## Task 6: Register Goal Tools in MCP Server

**Files:**
- Modify: `lib/mcp/server.ts`

- [ ] **Step 1: Update server.ts**

Replace `lib/mcp/server.ts` with:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerHabitTools } from '@/lib/mcp/tools/habits'
import { registerTaskTools } from '@/lib/mcp/tools/tasks'
import { registerDocumentTools } from '@/lib/mcp/tools/documents'
import { registerFinanceTools } from '@/lib/mcp/tools/finance'
import { registerGoalTools } from '@/lib/mcp/tools/goals'

export function createMcpServer() {
  const server = new McpServer({
    name: 'pa-mcp',
    version: '0.1.0',
  })

  registerHabitTools(server)
  registerTaskTools(server)
  registerDocumentTools(server)
  registerFinanceTools(server)
  registerGoalTools(server)

  return server
}
```

Note: Includes `registerDocumentTools` and `registerFinanceTools` assuming those plans have been executed first. Remove any that haven't been built yet.

- [ ] **Step 2: Commit**

```bash
git add lib/mcp/server.ts
git commit -m "feat(goals): register goal tools in MCP server"
```

---

## Task 7: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add goals section to CLAUDE.md**

Add under MCP Tools section:

```markdown
### Goal Tools (6)

| Tool | Description |
|------|-------------|
| `create_goal` | Create outcome (auto-tracked) or milestone (manual) goals |
| `list_goals` | List goals with live progress, filter by status/type |
| `update_goal` | Update goal properties or toggle milestone completion |
| `get_goal_progress` | Detailed progress for a goal including milestones |
| `get_review` | Comprehensive period review: habits + tasks + finance + goals + highlights |
| `add_milestone` | Add sub-steps to milestone-type goals |
```

Add under Database Schema section:

```markdown
### Goal Tables
- **goals** — title, goal_type (outcome/milestone), metric_type, target_value, is_recurring, recurrence, start_date, end_date, status
- **goal_milestones** — goal_id, title, sort_order, completed, completed_at
```

Update the Current Status > Done section to reflect all modules.

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add goals module to CLAUDE.md"
```

---

## Task 8: Build Verification

- [ ] **Step 1: Run type check**

```bash
cd "/Volumes/maersk/amargupta/Documents/Latest Projects/Portfolio Project/devfrend-personal-assitant"
npm run type-check
```

Expected: No TypeScript errors.

- [ ] **Step 2: Run lint**

```bash
npm run lint
```

Expected: No linting errors.

- [ ] **Step 3: Run build**

```bash
npm run build
```

Expected: Build succeeds.

- [ ] **Step 4: Fix any issues, then commit**

```bash
git add -A
git commit -m "fix(goals): resolve build issues"
```

---

## Summary

| # | What | Details |
|---|------|---------|
| 1 | DB Migration | `goals` + `goal_milestones` tables with RLS |
| 2 | Types | `Goal`, `GoalMilestone`, `PeriodReview`, `ReviewHighlights` |
| 3 | Goal Logic | CRUD, milestones with auto-complete, live progress from habits/tasks/finance |
| 4 | Review Engine | Cross-module aggregation with highlights (best habit, worst habit, top spend, goals hit/missed) |
| 5 | MCP Tools | 6 tools: `create_goal`, `list_goals`, `update_goal`, `get_goal_progress`, `get_review`, `add_milestone` |
| 6 | Server Registration | Wire into MCP server |
| 7 | Docs | CLAUDE.md updated |
| 8 | Build | Type check + lint + build verification |

## The "mera April review do" Flow

```
User: "mera April review do"
  → Claude calls get_review(period: "this_month")
    → Review engine queries:
       - Habits: 5 tracked, avg 78% completion, workout streak 21 days
       - Tasks: 12 completed, 3 pending, 1 overdue
       - Finance: ₹32,450 spent — Food ₹8,200, Transport ₹4,100, ...
       - Goals: 2 hit, 1 missed, 1 active at 65%
       - Highlights: best_habit=Workout (21 days), top_spend=Food (₹8.2k), biggest_spend=₹5k at Croma
  → Claude narrates:
     "April kaafi productive raha! Workout streak 21 days strong 💪
      12 tasks done, 3 pending — ek overdue hai dhyan de.
      ₹32k spend — Food pe ₹8.2k gaya (Zomato thoda kam kar 😄).
      Save ₹20k goal 65% pe hai, ₹7k aur bachana hai.
      Biggest spend: Croma pe ₹5k — kya liya tha?"
```
