import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { todayISTDate, toIST } from '@/types'

// ── streak helpers ───────────────────────────────────────

function addDaysToDateString(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().split('T')[0]
}

async function calculateCurrentStreak(habitId: string): Promise<number> {
  const supabase = createServiceRoleClient()
  const { data: logs } = await supabase
    .from('habit_logs')
    .select('logged_date')
    .eq('habit_id', habitId)
    .order('logged_date', { ascending: false })

  if (!logs || logs.length === 0) return 0

  const today = todayISTDate()
  const loggedDates = new Set(logs.map(log => log.logged_date))
  let cursor = today
  let streak = 0

  if (!loggedDates.has(cursor)) {
    const yesterday = addDaysToDateString(today, -1)
    if (!loggedDates.has(yesterday)) return 0
    cursor = yesterday
  }

  while (loggedDates.has(cursor)) {
    streak++
    cursor = addDaysToDateString(cursor, -1)
  }

  return streak
}

async function calculateBestStreak(habitId: string): Promise<number> {
  const supabase = createServiceRoleClient()
  const { data: logs } = await supabase
    .from('habit_logs')
    .select('logged_date')
    .eq('habit_id', habitId)
    .order('logged_date', { ascending: true })

  if (!logs || logs.length === 0) return 0

  let maxStreak = 1
  let currentStreak = 1

  for (let i = 1; i < logs.length; i++) {
    const prev = new Date(logs[i - 1].logged_date)
    const curr = new Date(logs[i].logged_date)
    const dayDiff = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24)

    if (dayDiff === 1) {
      currentStreak++
      maxStreak = Math.max(maxStreak, currentStreak)
    } else {
      currentStreak = 1
    }
  }

  return maxStreak
}

async function completionPercentage(habitId: string, days: number): Promise<number> {
  const supabase = createServiceRoleClient()
  const sinceStr = addDaysToDateString(todayISTDate(), -(days - 1))

  const { count } = await supabase
    .from('habit_logs')
    .select('*', { count: 'exact', head: true })
    .eq('habit_id', habitId)
    .gte('logged_date', sinceStr)

  return days === 0 ? 0 : Math.round(((count || 0) / days) * 100 * 10) / 10
}

// ── tool registration ────────────────────────────────────

export function registerHabitTools(server: McpServer) {

  // ── create_habit ─────────────────────────────────────
  server.tool(
    'create_habit',
    'Create a new habit to track with streak and analytics support.',
    {
      name: z.string().min(1).max(255).describe('Habit name, e.g. "Morning Workout"'),
      frequency: z.enum(['daily', 'weekly', 'monthly']).describe('How often the habit should be done'),
      description: z.string().max(1000).optional().describe('Optional description'),
      color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#3b82f6').describe('Hex color (default: #3b82f6)'),
      reminder_time: z.string().optional().describe('Optional reminder time (HH:mm)'),
    },
    async ({ name, frequency, description, color, reminder_time }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      const supabase = createServiceRoleClient()
      const { data, error } = await supabase
        .from('habits')
        .insert({
          user_id: userId,
          name: name.trim(),
          frequency,
          description: description?.trim() || null,
          color,
          reminder_time: reminder_time || null,
        })
        .select('id, name, created_at')
        .single()

      if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            habit_id: data.id,
            name: data.name,
            created_at: toIST(new Date(data.created_at)),
            streak: 0,
            last_logged: null,
          }),
        }],
      }
    }
  )

  // ── log_habit_completion ─────────────────────────────
  server.tool(
    'log_habit_completion',
    'Mark a habit as completed for a specific day.',
    {
      habit_id: z.string().uuid().describe('UUID of the habit'),
      date: z.string().date().optional().describe('Date (YYYY-MM-DD), defaults to today IST'),
      notes: z.string().max(500).optional().describe('Optional notes'),
    },
    async ({ habit_id, date, notes }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      const logDate = date || todayISTDate()
      const supabase = createServiceRoleClient()

      // Verify habit belongs to user
      const { data: habit, error: habitErr } = await supabase
        .from('habits')
        .select('id')
        .eq('id', habit_id)
        .eq('user_id', userId)
        .single()

      if (habitErr || !habit) {
        return { content: [{ type: 'text' as const, text: 'Error: Habit not found' }], isError: true }
      }

      const { error: insertErr } = await supabase.from('habit_logs').insert({
        habit_id,
        user_id: userId,
        logged_date: logDate,
        notes: notes?.trim() || null,
      })

      if (insertErr) {
        if (insertErr.message.includes('duplicate') || insertErr.code === '23505') {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ message: 'Already logged for this date', date: logDate }) }] }
        }
        return { content: [{ type: 'text' as const, text: `Error: ${insertErr.message}` }], isError: true }
      }

      const newStreak = await calculateCurrentStreak(habit_id)
      const pct = await completionPercentage(habit_id, 30)

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            logged_at: toIST(),
            date: logDate,
            new_streak: newStreak,
            completion_percentage_30d: pct,
          }),
        }],
      }
    }
  )

  // ── get_habit_streak ─────────────────────────────────
  server.tool(
    'get_habit_streak',
    'Get current and best streak for a habit.',
    {
      habit_id: z.string().uuid().describe('UUID of the habit'),
    },
    async ({ habit_id }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      const supabase = createServiceRoleClient()
      const { data: habit, error } = await supabase
        .from('habits')
        .select('name')
        .eq('id', habit_id)
        .eq('user_id', userId)
        .single()

      if (error || !habit) {
        return { content: [{ type: 'text' as const, text: 'Error: Habit not found' }], isError: true }
      }

      const currentStreak = await calculateCurrentStreak(habit_id)
      const bestStreak = await calculateBestStreak(habit_id)

      const { data: lastLog } = await supabase
        .from('habit_logs')
        .select('logged_date')
        .eq('habit_id', habit_id)
        .order('logged_date', { ascending: false })
        .limit(1)
        .maybeSingle()

      const today = todayISTDate()

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            habit_id,
            name: habit.name,
            current_streak: currentStreak,
            best_streak: bestStreak,
            last_logged_date: lastLog?.logged_date || null,
            is_active_today: lastLog?.logged_date === today,
          }),
        }],
      }
    }
  )

  // ── get_habit_analytics ──────────────────────────────
  server.tool(
    'get_habit_analytics',
    'Get completion percentage, trends, and analytics for a habit over N days.',
    {
      habit_id: z.string().uuid().describe('UUID of the habit'),
      days: z.number().int().min(1).max(365).default(30).describe('Number of days to analyze (default: 30)'),
    },
    async ({ habit_id, days }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      const supabase = createServiceRoleClient()
      const { data: habit, error } = await supabase
        .from('habits')
        .select('name, created_at')
        .eq('id', habit_id)
        .eq('user_id', userId)
        .single()

      if (error || !habit) {
        return { content: [{ type: 'text' as const, text: 'Error: Habit not found' }], isError: true }
      }

      // Use IST today to avoid UTC boundary issues
      const todayStr = todayISTDate()
      const sinceStr = addDaysToDateString(todayStr, -(days - 1)) // -29 for 30-day range that includes today

      const { data: logs } = await supabase
        .from('habit_logs')
        .select('logged_date')
        .eq('habit_id', habit_id)
        .gte('logged_date', sinceStr)
        .order('logged_date', { ascending: true })

      const loggedDates = new Set((logs || []).map(l => l.logged_date))
      const totalCompletions = loggedDates.size
      const pct = Math.round((totalCompletions / days) * 100 * 10) / 10

      // Build day-by-day breakdown (since → today inclusive)
      const dayByDay: { date: string; completed: boolean }[] = []
      for (let i = 0; i < days; i++) {
        const dateStr = addDaysToDateString(sinceStr, i)
        dayByDay.push({ date: dateStr, completed: loggedDates.has(dateStr) })
      }

      const currentStreak = await calculateCurrentStreak(habit_id)
      const bestStreak = await calculateBestStreak(habit_id)

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            habit_id,
            name: habit.name,
            period_days: days,
            completion_percentage: pct,
            total_completions: totalCompletions,
            current_streak: currentStreak,
            best_streak: bestStreak,
            day_by_day: dayByDay,
          }),
        }],
      }
    }
  )

  // ── update_habit ─────────────────────────────────────
  server.tool(
    'update_habit',
    'Update habit details (name, frequency, color, description) or archive it.',
    {
      habit_id: z.string().uuid().describe('UUID of the habit'),
      name: z.string().min(1).max(255).optional().describe('New name'),
      frequency: z.enum(['daily', 'weekly', 'monthly']).optional().describe('New frequency'),
      description: z.string().max(1000).nullable().optional().describe('New description or null to clear'),
      color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().describe('New hex color'),
      archived: z.boolean().optional().describe('Set true to archive'),
    },
    async ({ habit_id, ...fields }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      const updates: Record<string, unknown> = {}
      if (fields.name !== undefined) updates.name = fields.name.trim()
      if (fields.frequency !== undefined) updates.frequency = fields.frequency
      if (fields.description !== undefined) updates.description = fields.description?.trim() || null
      if (fields.color !== undefined) updates.color = fields.color
      if (fields.archived !== undefined) updates.archived = fields.archived

      if (Object.keys(updates).length === 0) {
        return { content: [{ type: 'text' as const, text: 'Error: No fields to update' }], isError: true }
      }

      const supabase = createServiceRoleClient()
      const { data, error } = await supabase
        .from('habits')
        .update(updates)
        .eq('id', habit_id)
        .eq('user_id', userId)
        .select('id, name, archived, updated_at')
        .single()

      if (error || !data) {
        return { content: [{ type: 'text' as const, text: 'Error: Habit not found' }], isError: true }
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            habit_id: data.id,
            name: data.name,
            archived: data.archived,
            updated_at: toIST(new Date(data.updated_at)),
          }),
        }],
      }
    }
  )
}
