import type Anthropic from '@anthropic-ai/sdk'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import {
  createTransaction,
  listTransactions,
  getSpendingSummary,
} from '@/lib/finance/transactions'
import { ensurePresetCategories } from '@/lib/finance/categories'
import { saveMemory, searchMemories } from '@/lib/memory/items'
import type { MemoryCategory } from '@/lib/memory/types'

type Tool = Anthropic.Tool
type ToolResult = { summary: string; data?: unknown }

interface Ctx {
  userId: string
}

/**
 * Tool schemas shown to Claude, plus their executors.
 *
 * Each executor returns:
 *   - `summary` — one-line string rendered as a chip in the mobile UI
 *   - `data` — JSON the model sees as tool_result content
 *
 * The model sees a stringified `{summary, data}`, so both are useful.
 */

export const CHAT_TOOLS: Tool[] = [
  {
    name: 'add_transaction',
    description:
      'Record a spending transaction. Use when the user says things like "add ₹200 coffee", "I spent 450 on uber", "log 1200 groceries". Amount is required; merchant is whatever the money was paid to.',
    input_schema: {
      type: 'object',
      properties: {
        amount: {
          type: 'number',
          description: 'Amount spent, in rupees. Must be positive.',
        },
        merchant: {
          type: 'string',
          description: 'Where the money was spent, e.g. "Starbucks", "Uber", "Swiggy"',
        },
        category: {
          type: 'string',
          description:
            'Category name, e.g. "Food", "Transport", "Shopping", "Bills". Will be matched to the user\'s categories.',
        },
        note: { type: 'string', description: 'Optional free-form note.' },
      },
      required: ['amount'],
    },
  },
  {
    name: 'list_transactions',
    description:
      'List recent transactions. Use for "show my expenses", "what did I spend today", "recent transactions".',
    input_schema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Filter by category name' },
        start_date: { type: 'string', description: 'YYYY-MM-DD inclusive' },
        end_date: { type: 'string', description: 'YYYY-MM-DD inclusive' },
        limit: { type: 'number', description: 'Max rows (default 10, max 50)' },
      },
    },
  },
  {
    name: 'get_spending_summary',
    description:
      'Get total spend + category breakdown for a date range. Use for "how much did I spend this week/month".',
    input_schema: {
      type: 'object',
      properties: {
        start_date: { type: 'string', description: 'YYYY-MM-DD' },
        end_date: { type: 'string', description: 'YYYY-MM-DD' },
      },
      required: ['start_date', 'end_date'],
    },
  },
  {
    name: 'create_task',
    description:
      'Create a task. Use when the user says "remind me to X", "add a task", "I need to Y by tomorrow".',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        due_date: { type: 'string', description: 'YYYY-MM-DD' },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: 'Default medium',
        },
      },
      required: ['title'],
    },
  },
  {
    name: 'list_tasks',
    description: 'List tasks. Use for "what\'s on my plate", "pending tasks", "what do I need to do".',
    input_schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['pending', 'in_progress', 'completed'],
        },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'complete_task',
    description: 'Mark a task as completed.',
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'UUID of the task' },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'list_habits',
    description: 'List habits with today\'s log status and current streak.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'log_habit',
    description:
      'Log a habit as done for today. Use when the user says "I meditated", "log my workout", "did my reading".',
    input_schema: {
      type: 'object',
      properties: {
        habit_id: { type: 'string' },
        habit_name: {
          type: 'string',
          description:
            'If habit_id is unknown, pass a name and the tool will resolve it.',
        },
        notes: { type: 'string' },
      },
    },
  },
  {
    name: 'save_memory',
    description:
      'Store a durable memory about the user — preferences, facts, rules, decisions, project context. Use when the user says "remember that…", "I prefer X", "note this", or reveals a stable fact worth recalling later. Do NOT use for transient task-level info.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short label, ≤80 chars' },
        content: { type: 'string', description: 'The full knowledge to store' },
        category: {
          type: 'string',
          enum: ['preference', 'rule', 'project', 'decision', 'context', 'snippet', 'note', 'persona'],
          description: 'Default "note".',
        },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['title', 'content'],
    },
  },
  {
    name: 'search_memory',
    description:
      'Recall what the user has saved. Use when the user asks about their own preferences, past decisions, or anything that might be in their memory vault ("what do I think about X", "my rule for Y").',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'number', description: 'Default 5, max 20' },
      },
      required: ['query'],
    },
  },
]

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  ctx: Ctx
): Promise<ToolResult> {
  switch (name) {
    case 'add_transaction':
      return addTransaction(input, ctx)
    case 'list_transactions':
      return listTransactionsTool(input, ctx)
    case 'get_spending_summary':
      return spendingSummary(input, ctx)
    case 'create_task':
      return createTask(input, ctx)
    case 'list_tasks':
      return listTasksTool(input, ctx)
    case 'complete_task':
      return completeTask(input, ctx)
    case 'list_habits':
      return listHabitsTool(ctx)
    case 'log_habit':
      return logHabitTool(input, ctx)
    case 'save_memory':
      return saveMemoryTool(input, ctx)
    case 'search_memory':
      return searchMemoryTool(input, ctx)
    default:
      return { summary: `Unknown tool: ${name}` }
  }
}

// ── Memory ──────────────────────────────────────────

const MEMORY_CATEGORIES: MemoryCategory[] = [
  'preference', 'rule', 'project', 'decision', 'context', 'snippet', 'note', 'persona',
]

async function saveMemoryTool(
  input: Record<string, unknown>,
  { userId }: Ctx
): Promise<ToolResult> {
  const title = String(input.title || '').trim()
  const content = String(input.content || '').trim()
  if (!title || !content) return { summary: 'title and content required' }

  const rawCategory = (input.category as string) || 'note'
  const category: MemoryCategory = MEMORY_CATEGORIES.includes(rawCategory as MemoryCategory)
    ? (rawCategory as MemoryCategory)
    : 'note'

  const result = await saveMemory({
    userId,
    spaceSlug: 'personal',
    title,
    content,
    category,
    tags: Array.isArray(input.tags) ? (input.tags as string[]) : [],
    force: true,
  })

  if (result.status === 'saved') {
    return { summary: `Remembered · ${title}`, data: result.memory }
  }
  return { summary: `Similar memory exists — not saved`, data: result }
}

async function searchMemoryTool(
  input: Record<string, unknown>,
  { userId }: Ctx
): Promise<ToolResult> {
  const query = String(input.query || '').trim()
  if (!query) return { summary: 'query required' }

  const results = await searchMemories({
    userId,
    query,
    limit: Math.min(Number(input.limit) || 5, 20),
  })

  if (!results.length) return { summary: `No memories for "${query}"`, data: [] }

  return {
    summary: `Found ${results.length} memor${results.length === 1 ? 'y' : 'ies'}`,
    data: results.map((r) => ({
      id: r.id,
      title: r.title,
      content: r.content,
      category: r.category,
      tags: r.tags,
      score: r.final_score,
    })),
  }
}

// ── Finance ─────────────────────────────────────────

async function addTransaction(
  input: Record<string, unknown>,
  { userId }: Ctx
): Promise<ToolResult> {
  const amount = Number(input.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    return { summary: 'Invalid amount' }
  }

  let categoryId: string | undefined
  if (input.category) {
    await ensurePresetCategories(userId)
    const supabase = createServiceRoleClient()
    const { data } = await supabase
      .from('spending_categories')
      .select('id')
      .eq('user_id', userId)
      .ilike('name', String(input.category))
      .maybeSingle()
    categoryId = data?.id
  }

  const tx = await createTransaction({
    userId,
    amount,
    merchant: input.merchant ? String(input.merchant) : undefined,
    note: input.note ? String(input.note) : undefined,
    categoryId,
  })

  const label = input.merchant
    ? `Added ₹${amount} · ${String(input.merchant)}`
    : `Added ₹${amount}`
  return {
    summary: input.category ? `${label} (${input.category})` : label,
    data: tx,
  }
}

async function listTransactionsTool(
  input: Record<string, unknown>,
  { userId }: Ctx
): Promise<ToolResult> {
  const startDate = input.start_date
    ? new Date(`${input.start_date}T00:00:00+05:30`).toISOString()
    : undefined
  const endDate = input.end_date
    ? new Date(`${input.end_date}T23:59:59+05:30`).toISOString()
    : undefined

  let categoryId: string | undefined
  if (input.category) {
    const supabase = createServiceRoleClient()
    const { data } = await supabase
      .from('spending_categories')
      .select('id')
      .eq('user_id', userId)
      .ilike('name', String(input.category))
      .maybeSingle()
    categoryId = data?.id
  }

  const result = await listTransactions({
    userId,
    categoryId,
    startDate,
    endDate,
    limit: Math.min(Number(input.limit) || 10, 50),
  })

  return {
    summary: `${result.transactions.length} transactions`,
    data: result.transactions,
  }
}

async function spendingSummary(
  input: Record<string, unknown>,
  { userId }: Ctx
): Promise<ToolResult> {
  const start = String(input.start_date)
  const end = String(input.end_date)
  const startISO = new Date(`${start}T00:00:00+05:30`).toISOString()
  const endISO = new Date(`${end}T23:59:59+05:30`).toISOString()

  const summary = await getSpendingSummary(userId, startISO, endISO)
  return {
    summary: `Spent ₹${Math.round(summary.total_spent).toLocaleString('en-IN')} from ${start} to ${end}`,
    data: summary,
  }
}

// ── Tasks ───────────────────────────────────────────

async function createTask(
  input: Record<string, unknown>,
  { userId }: Ctx
): Promise<ToolResult> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      user_id: userId,
      title: String(input.title).trim(),
      description: input.description ? String(input.description).trim() : null,
      due_date: input.due_date ? String(input.due_date) : null,
      priority: (input.priority as string) || 'medium',
      status: 'pending',
      tags: [],
    })
    .select('id, title, priority, due_date')
    .single()

  if (error) return { summary: `Task failed: ${error.message}` }

  return {
    summary: `Created task · ${data.title}`,
    data,
  }
}

async function listTasksTool(
  input: Record<string, unknown>,
  { userId }: Ctx
): Promise<ToolResult> {
  const supabase = createServiceRoleClient()
  let q = supabase
    .from('tasks')
    .select('id, title, status, priority, due_date, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(Math.min(Number(input.limit) || 20, 100))

  if (input.status) q = q.eq('status', String(input.status))

  const { data, error } = await q
  if (error) return { summary: `Failed to list tasks: ${error.message}` }
  return { summary: `${data?.length || 0} tasks`, data }
}

async function completeTask(
  input: Record<string, unknown>,
  { userId }: Ctx
): Promise<ToolResult> {
  const taskId = String(input.task_id)
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('tasks')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', taskId)
    .eq('user_id', userId)
    .select('id, title')
    .single()

  if (error) return { summary: `Failed: ${error.message}` }
  return { summary: `Completed · ${data.title}`, data }
}

// ── Habits ──────────────────────────────────────────

async function listHabitsTool({ userId }: Ctx): Promise<ToolResult> {
  const supabase = createServiceRoleClient()
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

  const { data: habits, error } = await supabase
    .from('habits')
    .select('id, name, frequency, color')
    .eq('user_id', userId)
    .eq('archived', false)
    .order('created_at', { ascending: true })

  if (error) return { summary: `Failed: ${error.message}` }

  const habitList = habits || []
  if (!habitList.length) return { summary: 'No habits yet', data: [] }

  const ids = habitList.map((h) => h.id)
  const { data: todaysLogs } = await supabase
    .from('habit_logs')
    .select('habit_id')
    .in('habit_id', ids)
    .eq('logged_date', today)

  const loggedToday = new Set((todaysLogs || []).map((log) => log.habit_id))

  const enriched = habitList.map((h) => ({
    habit_id: h.id,
    name: h.name,
    frequency: h.frequency,
    logged_today: loggedToday.has(h.id),
  }))

  return { summary: `${enriched.length} habits`, data: enriched }
}

async function logHabitTool(
  input: Record<string, unknown>,
  { userId }: Ctx
): Promise<ToolResult> {
  const supabase = createServiceRoleClient()
  let habitId = input.habit_id ? String(input.habit_id) : undefined
  let habitName = input.habit_name ? String(input.habit_name) : undefined

  if (!habitId && habitName) {
    const { data: habit } = await supabase
      .from('habits')
      .select('id, name')
      .eq('user_id', userId)
      .eq('archived', false)
      .ilike('name', `%${habitName}%`)
      .limit(1)
      .maybeSingle()
    if (!habit) return { summary: `No habit matching "${habitName}"` }
    habitId = habit.id
    habitName = habit.name
  }

  if (!habitId) return { summary: 'habit_id or habit_name required' }

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  const { data, error } = await supabase
    .from('habit_logs')
    .upsert(
      {
        habit_id: habitId,
        logged_date: today,
        notes: input.notes ? String(input.notes) : null,
      },
      { onConflict: 'habit_id,logged_date' }
    )
    .select('id')
    .single()

  if (error) return { summary: `Failed: ${error.message}` }

  if (!habitName) {
    const { data: h } = await supabase
      .from('habits')
      .select('name')
      .eq('id', habitId)
      .single()
    habitName = h?.name || 'habit'
  }

  return { summary: `Logged · ${habitName}`, data }
}
