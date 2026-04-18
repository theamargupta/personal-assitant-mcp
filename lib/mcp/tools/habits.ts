import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server'
import { z } from 'zod'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { todayISTDate, toIST } from '@/types'
import { createHabitHeatmapImage } from '@/lib/mcp/images'
import { WIDGET_URIS } from '@/lib/mcp/widgets'

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

  // ── list_habits ──────────────────────────────────────
  server.tool(
    'list_habits',
    'List all habits with optional filters for frequency and archived status. Includes current streak for each habit.',
    {
      frequency: z.enum(['daily', 'weekly', 'monthly']).optional().describe('Filter by frequency'),
      archived: z.boolean().default(false).describe('Include archived habits (default: false = active only)'),
      limit: z.number().int().min(1).max(100).default(50).describe('Max results (default: 50)'),
      offset: z.number().int().min(0).default(0).describe('Offset for pagination'),
    },
    async ({ frequency, archived, limit, offset }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      const supabase = createServiceRoleClient()
      let query = supabase
        .from('habits')
        .select('id, name, frequency, description, color, reminder_time, archived, created_at', { count: 'exact' })
        .eq('user_id', userId)
        .eq('archived', archived)

      if (frequency) query = query.eq('frequency', frequency)

      const { data, count, error } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

      if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

      const habits = await Promise.all((data || []).map(async (h) => ({
        habit_id: h.id,
        name: h.name,
        frequency: h.frequency,
        description: h.description,
        color: h.color,
        reminder_time: h.reminder_time,
        archived: h.archived,
        current_streak: await calculateCurrentStreak(h.id),
        created_at: toIST(new Date(h.created_at)),
      })))

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ habits, total: count || 0, returned: habits.length }),
        }],
      }
    }
  )

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

  // ── update_habit_log ─────────────────────────────────
  server.tool(
    'update_habit_log',
    'Edit a habit log (change logged_date or notes). Errors if the new date collides with an existing log for the same habit.',
    {
      log_id: z.string().uuid().describe('UUID of the habit_log row'),
      logged_date: z.string().date().optional().describe('New date YYYY-MM-DD'),
      notes: z.string().max(500).nullable().optional().describe('New notes or null to clear'),
    },
    async ({ log_id, logged_date, notes }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      const supabase = createServiceRoleClient()

      const { data: existing, error: fetchErr } = await supabase
        .from('habit_logs')
        .select('id, habit_id, logged_date')
        .eq('id', log_id)
        .eq('user_id', userId)
        .single()

      if (fetchErr || !existing) {
        return { content: [{ type: 'text' as const, text: 'Error: Habit log not found' }], isError: true }
      }

      const updates: Record<string, unknown> = {}
      if (logged_date !== undefined) updates.logged_date = logged_date
      if (notes !== undefined) updates.notes = notes === null ? null : notes.trim()

      if (Object.keys(updates).length === 0) {
        return { content: [{ type: 'text' as const, text: 'Error: No fields to update' }], isError: true }
      }

      const { data, error } = await supabase
        .from('habit_logs')
        .update(updates)
        .eq('id', log_id)
        .eq('user_id', userId)
        .select('id, habit_id, logged_date, notes')
        .single()

      if (error || !data) {
        if (error?.code === '23505' || error?.message?.includes('duplicate')) {
          return { content: [{ type: 'text' as const, text: `Error: Already logged for ${logged_date}` }], isError: true }
        }
        return { content: [{ type: 'text' as const, text: `Error: ${error?.message ?? 'update failed'}` }], isError: true }
      }

      const newStreak = await calculateCurrentStreak(data.habit_id)

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            log_id: data.id,
            habit_id: data.habit_id,
            logged_date: data.logged_date,
            notes: data.notes,
            current_streak: newStreak,
          }),
        }],
      }
    }
  )

  // ── delete_habit_log ─────────────────────────────────
  server.tool(
    'delete_habit_log',
    'Un-log a habit completion. Pass either log_id OR (habit_id + date). Returns the new current streak.',
    {
      log_id: z.string().uuid().optional().describe('UUID of the log row'),
      habit_id: z.string().uuid().optional().describe('UUID of the habit (when using habit_id + date lookup)'),
      date: z.string().date().optional().describe('Date to un-log (YYYY-MM-DD); requires habit_id'),
    },
    async ({ log_id, habit_id, date }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      if (!log_id && !(habit_id && date)) {
        return { content: [{ type: 'text' as const, text: 'Error: Pass log_id or (habit_id + date)' }], isError: true }
      }

      const supabase = createServiceRoleClient()

      let existing: { id: string; habit_id: string; logged_date: string } | null = null
      if (log_id) {
        const { data, error } = await supabase
          .from('habit_logs')
          .select('id, habit_id, logged_date')
          .eq('id', log_id)
          .eq('user_id', userId)
          .single()
        if (error || !data) {
          return { content: [{ type: 'text' as const, text: 'Error: Habit log not found' }], isError: true }
        }
        existing = data as typeof existing
      } else if (habit_id && date) {
        const { data, error } = await supabase
          .from('habit_logs')
          .select('id, habit_id, logged_date')
          .eq('habit_id', habit_id)
          .eq('user_id', userId)
          .eq('logged_date', date)
          .maybeSingle()
        if (error || !data) {
          return { content: [{ type: 'text' as const, text: 'Error: Habit log not found' }], isError: true }
        }
        existing = data as typeof existing
      }

      if (!existing) {
        return { content: [{ type: 'text' as const, text: 'Error: Habit log not found' }], isError: true }
      }

      const { error: delErr } = await supabase
        .from('habit_logs')
        .delete()
        .eq('id', existing.id)
        .eq('user_id', userId)

      if (delErr) {
        return { content: [{ type: 'text' as const, text: `Error: ${delErr.message}` }], isError: true }
      }

      const newStreak = await calculateCurrentStreak(existing.habit_id)

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            deleted: true,
            log_id: existing.id,
            habit_id: existing.habit_id,
            logged_date: existing.logged_date,
            current_streak: newStreak,
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
  registerAppTool(
    server,
    'get_habit_analytics',
    {
      description: 'Get completion percentage, trends, and analytics for a habit over N days.',
      inputSchema: {
        habit_id: z.string().uuid().describe('UUID of the habit'),
        days: z.number().int().min(1).max(365).default(30).describe('Number of days to analyze (default: 30)'),
      },
      _meta: { ui: { resourceUri: WIDGET_URIS.habitHeatmap } },
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

      const response = {
        habit_id,
        name: habit.name,
        period_days: days,
        completion_percentage: pct,
        total_completions: totalCompletions,
        current_streak: currentStreak,
        best_streak: bestStreak,
        day_by_day: dayByDay,
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(response),
        },
          await createHabitHeatmapImage({
            name: response.name,
            periodDays: response.period_days,
            completionPercentage: response.completion_percentage,
            currentStreak: response.current_streak,
            bestStreak: response.best_streak,
            dayByDay: response.day_by_day,
          })],
      }
    }
  )

  // ── get_habit ────────────────────────────────────────
  server.tool(
    'get_habit',
    'Fetch a single habit with current/best streak and last log date.',
    {
      habit_id: z.string().uuid().describe('UUID of the habit'),
    },
    async ({ habit_id }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      const supabase = createServiceRoleClient()
      const { data: habit, error } = await supabase
        .from('habits')
        .select('id, name, frequency, description, color, reminder_time, archived, created_at, updated_at')
        .eq('id', habit_id)
        .eq('user_id', userId)
        .single()

      if (error || !habit) {
        return { content: [{ type: 'text' as const, text: 'Error: Habit not found' }], isError: true }
      }

      const [currentStreak, bestStreak, lastLogResult] = await Promise.all([
        calculateCurrentStreak(habit_id),
        calculateBestStreak(habit_id),
        supabase
          .from('habit_logs')
          .select('logged_date')
          .eq('habit_id', habit_id)
          .order('logged_date', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            habit_id: habit.id,
            name: habit.name,
            frequency: habit.frequency,
            description: habit.description,
            color: habit.color,
            reminder_time: habit.reminder_time,
            archived: habit.archived,
            current_streak: currentStreak,
            best_streak: bestStreak,
            last_logged_date: (lastLogResult.data as { logged_date: string } | null)?.logged_date ?? null,
            created_at: toIST(new Date(habit.created_at)),
            updated_at: toIST(new Date(habit.updated_at)),
          }),
        }],
      }
    }
  )

  // ── delete_habit ─────────────────────────────────────
  server.tool(
    'delete_habit',
    'Permanently delete a habit. All habit_logs cascade-delete via FK. Prefer archive (update_habit archived=true) for soft removal.',
    {
      habit_id: z.string().uuid().describe('UUID of the habit to delete'),
    },
    async ({ habit_id }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      const supabase = createServiceRoleClient()

      const { data: habit, error: fetchErr } = await supabase
        .from('habits')
        .select('id, name')
        .eq('id', habit_id)
        .eq('user_id', userId)
        .single()

      if (fetchErr || !habit) {
        return { content: [{ type: 'text' as const, text: 'Error: Habit not found' }], isError: true }
      }

      const { count: logCount } = await supabase
        .from('habit_logs')
        .select('id', { count: 'exact', head: true })
        .eq('habit_id', habit_id)
        .eq('user_id', userId)

      const { error: delErr } = await supabase
        .from('habits')
        .delete()
        .eq('id', habit_id)
        .eq('user_id', userId)

      if (delErr) {
        return { content: [{ type: 'text' as const, text: `Error: ${delErr.message}` }], isError: true }
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            deleted: true,
            habit_id,
            name: habit.name,
            cascaded_logs: logCount ?? 0,
            message: 'Habit permanently deleted',
          }),
        }],
      }
    }
  )

  // ── update_habit ─────────────────────────────────────
  server.tool(
    'update_habit',
    'Update habit details (name, frequency, color, description, reminder_time) or archive it.',
    {
      habit_id: z.string().uuid().describe('UUID of the habit'),
      name: z.string().min(1).max(255).optional().describe('New name'),
      frequency: z.enum(['daily', 'weekly', 'monthly']).optional().describe('New frequency'),
      description: z.string().max(1000).nullable().optional().describe('New description or null to clear'),
      color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().describe('New hex color'),
      reminder_time: z.string().nullable().optional().describe('New reminder time (HH:mm) or null to clear'),
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
      if (fields.reminder_time !== undefined) updates.reminder_time = fields.reminder_time || null
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
