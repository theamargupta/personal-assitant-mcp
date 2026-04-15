import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { toIST } from '@/types'

export function registerTaskTools(server: McpServer) {

  // ── create_task ──────────────────────────────────────
  server.tool(
    'create_task',
    'Create a one-time task with title, description, due date, and priority.',
    {
      title: z.string().min(1).max(255).describe('Task title'),
      description: z.string().max(2000).optional().describe('Task description'),
      due_date: z.string().date().optional().describe('Due date (YYYY-MM-DD)'),
      priority: z.enum(['low', 'medium', 'high']).default('medium').describe('Priority (default: medium)'),
      tags: z.array(z.string()).default([]).describe('Tags for organizing'),
    },
    async ({ title, description, due_date, priority, tags }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      const supabase = createServiceRoleClient()
      const { data, error } = await supabase
        .from('tasks')
        .insert({
          user_id: userId,
          title: title.trim(),
          description: description?.trim() || null,
          status: 'pending',
          priority,
          due_date: due_date || null,
          tags,
        })
        .select('id, title, status, priority, due_date, created_at')
        .single()

      if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            task_id: data.id,
            title: data.title,
            status: data.status,
            priority: data.priority,
            due_date: data.due_date,
            created_at: toIST(new Date(data.created_at)),
          }),
        }],
      }
    }
  )

  // ── list_tasks ───────────────────────────────────────
  server.tool(
    'list_tasks',
    'List tasks with optional filters for status, priority, and due dates.',
    {
      status: z.enum(['pending', 'in_progress', 'completed']).optional().describe('Filter by status'),
      priority: z.enum(['low', 'medium', 'high']).optional().describe('Filter by priority'),
      due_date_before: z.string().date().optional().describe('Tasks due before this date'),
      due_date_after: z.string().date().optional().describe('Tasks due after this date'),
      limit: z.number().int().min(1).max(100).default(50).describe('Max results (default: 50)'),
      offset: z.number().int().min(0).default(0).describe('Offset for pagination'),
    },
    async ({ status, priority, due_date_before, due_date_after, limit, offset }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      const supabase = createServiceRoleClient()
      let query = supabase
        .from('tasks')
        .select('id, title, description, status, priority, due_date, tags, created_at, completed_at', { count: 'exact' })
        .eq('user_id', userId)

      if (status) query = query.eq('status', status)
      if (priority) query = query.eq('priority', priority)
      if (due_date_after) query = query.gte('due_date', due_date_after)
      if (due_date_before) query = query.lte('due_date', due_date_before)

      const { data, count, error } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

      if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

      const tasks = (data || []).map(task => ({
        task_id: task.id,
        title: task.title,
        status: task.status,
        priority: task.priority,
        due_date: task.due_date,
        tags: task.tags,
        created_at: toIST(new Date(task.created_at)),
        completed_at: task.completed_at ? toIST(new Date(task.completed_at)) : null,
      }))

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ tasks, total: count || 0, returned: tasks.length }),
        }],
      }
    }
  )

  // ── update_task_status ───────────────────────────────
  server.tool(
    'update_task_status',
    'Change task status: pending → in_progress → completed.',
    {
      task_id: z.string().uuid().describe('UUID of the task'),
      status: z.enum(['pending', 'in_progress', 'completed']).describe('New status'),
      notes: z.string().max(500).optional().describe('Optional status change notes'),
    },
    async ({ task_id, status, notes }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      const supabase = createServiceRoleClient()
      const updateData: Record<string, unknown> = {
        status,
        updated_at: new Date().toISOString(),
      }

      if (status === 'completed') {
        updateData.completed_at = new Date().toISOString()
      } else {
        updateData.completed_at = null
      }

      const { data, error } = await supabase
        .from('tasks')
        .update(updateData)
        .eq('id', task_id)
        .eq('user_id', userId)
        .select('id, title, status, updated_at')
        .single()

      if (error || !data) {
        return { content: [{ type: 'text' as const, text: 'Error: Task not found' }], isError: true }
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            task_id: data.id,
            title: data.title,
            status: data.status,
            updated_at: toIST(new Date(data.updated_at)),
          }),
        }],
      }
    }
  )

  // ── complete_task ────────────────────────────────────
  server.tool(
    'complete_task',
    'Mark task as completed and get a completion summary with time taken and overdue status.',
    {
      task_id: z.string().uuid().describe('UUID of the task'),
    },
    async ({ task_id }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      const supabase = createServiceRoleClient()

      // Fetch task first
      const { data: task, error: fetchErr } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', task_id)
        .eq('user_id', userId)
        .single()

      if (fetchErr || !task) {
        return { content: [{ type: 'text' as const, text: 'Error: Task not found' }], isError: true }
      }

      if (task.status === 'completed') {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ message: 'Task is already completed', task_id, completed_at: task.completed_at }),
          }],
        }
      }

      const completedAt = new Date().toISOString()

      const { error: updateErr } = await supabase
        .from('tasks')
        .update({ status: 'completed', completed_at: completedAt, updated_at: completedAt })
        .eq('id', task_id)
        .eq('user_id', userId)

      if (updateErr) {
        return { content: [{ type: 'text' as const, text: `Error: ${updateErr.message}` }], isError: true }
      }

      // Calculate stats
      const createdDate = new Date(task.created_at)
      const completedDate = new Date(completedAt)
      const daysToComplete = Math.ceil(
        (completedDate.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24)
      )

      let wasOverdue = false
      if (task.due_date) {
        const dueDate = new Date(task.due_date + 'T23:59:59+05:30') // IST end of day
        wasOverdue = completedDate > dueDate
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            task_id,
            title: task.title,
            status: 'completed',
            completed_at: toIST(completedDate),
            was_overdue: wasOverdue,
            days_to_complete: daysToComplete,
          }),
        }],
      }
    }
  )
}
