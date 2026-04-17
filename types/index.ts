// ============ HABIT TYPES ============

export type HabitFrequency = 'daily' | 'weekly' | 'monthly'

export interface Habit {
  id: string
  user_id: string
  name: string
  frequency: HabitFrequency
  description: string | null
  color: string
  reminder_time: string | null
  archived: boolean
  created_at: string
  updated_at: string
}

export interface HabitLog {
  id: string
  habit_id: string
  user_id: string
  logged_date: string
  notes: string | null
  created_at: string
}

// ============ TASK TYPES ============

export type TaskStatus = 'pending' | 'in_progress' | 'completed'
export type TaskPriority = 'low' | 'medium' | 'high'

export interface Task {
  id: string
  user_id: string
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  due_date: string | null
  tags: string[]
  created_at: string
  updated_at: string
  completed_at: string | null
}

// ============ IST HELPERS ============

export function toIST(date: Date = new Date()): string {
  return date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

export function todayISTDate(): string {
  return new Date()
    .toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) // YYYY-MM-DD format
}

export function istWeekRange(today: string = todayISTDate()): { startDate: string; endDate: string } {
  const [y, m, d] = today.split('-').map(Number)
  const anchor = new Date(Date.UTC(y, m - 1, d))
  const dow = anchor.getUTCDay() // 0=Sun..6=Sat
  const mondayOffset = dow === 0 ? -6 : 1 - dow
  const start = new Date(anchor)
  start.setUTCDate(anchor.getUTCDate() + mondayOffset)
  const end = new Date(start)
  end.setUTCDate(start.getUTCDate() + 6)
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) }
}

export function istMonthStartISO(today: string = todayISTDate()): string {
  const [y, m] = today.split('-')
  // IST is UTC+05:30 with no DST
  return new Date(`${y}-${m}-01T00:00:00+05:30`).toISOString()
}

function addDaysISO(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function currentStreakFromLogs(loggedDates: Iterable<string>, today: string = todayISTDate()): number {
  const set = loggedDates instanceof Set ? loggedDates : new Set(loggedDates)
  let cursor = today
  if (!set.has(cursor)) {
    const yesterday = addDaysISO(today, -1)
    if (!set.has(yesterday)) return 0
    cursor = yesterday
  }
  let streak = 0
  while (set.has(cursor)) {
    streak++
    cursor = addDaysISO(cursor, -1)
  }
  return streak
}

export function maxCurrentStreak(
  habits: Array<{ id: string; archived: boolean }>,
  logsByHabit: Map<string, Iterable<string>>,
  today: string = todayISTDate(),
): number {
  let best = 0
  for (const h of habits) {
    if (h.archived) continue
    const logs = logsByHabit.get(h.id)
    if (!logs) continue
    const s = currentStreakFromLogs(logs, today)
    if (s > best) best = s
  }
  return best
}

// ============ DOCUMENT TYPES ============

export type DocType = 'pdf' | 'image' | 'other'

export interface Document {
  id: string
  user_id: string
  name: string
  description: string | null
  doc_type: DocType
  mime_type: string
  file_size: number
  storage_path: string
  tags: string[]
  extracted_text: string | null
  created_at: string
  updated_at: string
}

export interface DocumentChunk {
  id: string
  document_id: string
  user_id: string
  chunk_index: number
  content: string
  token_count: number
  embedding: number[]
  created_at: string
}

// ============ FINANCE TYPES ============

export type SourceApp = 'phonepe' | 'gpay' | 'paytm' | 'bank' | 'manual' | 'other'

export interface SpendingCategory {
  id: string
  user_id: string
  name: string
  icon: string
  is_preset: boolean
  created_at: string
}

export interface Transaction {
  id: string
  user_id: string
  amount: number
  merchant: string | null
  source_app: SourceApp | null
  category_id: string | null
  note: string | null
  transaction_date: string
  raw_sms: string | null
  is_auto_detected: boolean
  created_at: string
  updated_at: string
}

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

// ============ MEMORY TYPES ============

export type { MemoryCategory, MemorySource, MemorySpace, MemoryItem } from '@/lib/memory/types'
