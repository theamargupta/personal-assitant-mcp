import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { toIST } from '@/types'
import { searchMemories, getRules } from '@/lib/memory/items'

export function registerTaskTools(server: McpServer) {

  // ── create_task ──────────────────────────────────────
  server.tool(
    'create_task',
    'Create a one-time task with title, description, due date, and priority.',
    {
      title: z.string().min(1).max(255).describe('Task title'),
      description: z.string().max(10000).optional().describe('Task description (up to 10000 chars)'),
      due_date: z.string().date().optional().describe('Due date (YYYY-MM-DD)'),
      priority: z.enum(['low', 'medium', 'high']).default('medium').describe('Priority (default: medium)'),
      tags: z.array(z.string()).default([]).describe('Tags for organizing'),
      task_type: z.enum(['personal', 'project']).default('personal').describe('Task type (default: personal). "project" tasks enable get_task context retrieval.'),
      project: z.string().min(1).max(100).optional().describe('Project name — required when task_type="project". Joins to pa_memory_items.project.'),
    },
    async ({ title, description, due_date, priority, tags, task_type = 'personal', project }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      if (task_type === 'project' && !project) {
        return {
          content: [{ type: 'text' as const, text: "Error: project is required when task_type is 'project'" }],
          isError: true,
        }
      }

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
          task_type,
          project: project ?? null,
        })
        .select('id, title, status, priority, due_date, task_type, project, created_at')
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
            task_type: data.task_type,
            project: data.project,
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
      task_type: z.enum(['personal', 'project']).optional().describe('Filter by task type'),
      project: z.string().optional().describe('Filter by project name'),
      limit: z.number().int().min(1).max(100).default(50).describe('Max results (default: 50)'),
      offset: z.number().int().min(0).default(0).describe('Offset for pagination'),
    },
    async ({ status, priority, due_date_before, due_date_after, task_type, project, limit, offset }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      const supabase = createServiceRoleClient()
      let query = supabase
        .from('tasks')
        .select('id, title, description, status, priority, due_date, tags, task_type, project, created_at, completed_at', { count: 'exact' })
        .eq('user_id', userId)

      if (status) query = query.eq('status', status)
      if (priority) query = query.eq('priority', priority)
      if (task_type) query = query.eq('task_type', task_type)
      if (project) query = query.eq('project', project)
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
        task_type: task.task_type,
        project: task.project,
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

  // ── delete_task ─────────────────────────────────────────
  server.tool(
    'delete_task',
    'Permanently delete a task. Use when user says "wo task delete kar do" or "galat task bana diya, hata do".',
    {
      task_id: z.string().uuid().describe('UUID of the task to delete'),
    },
    async ({ task_id }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      const supabase = createServiceRoleClient()

      // Verify task exists and belongs to user
      const { data: task, error: fetchErr } = await supabase
        .from('tasks')
        .select('id, title')
        .eq('id', task_id)
        .eq('user_id', userId)
        .single()

      if (fetchErr || !task) {
        return { content: [{ type: 'text' as const, text: 'Error: Task not found' }], isError: true }
      }

      const { error: deleteErr } = await supabase
        .from('tasks')
        .delete()
        .eq('id', task_id)
        .eq('user_id', userId)

      if (deleteErr) {
        return { content: [{ type: 'text' as const, text: `Error: ${deleteErr.message}` }], isError: true }
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            deleted: true,
            task_id,
            title: task.title,
            message: 'Task permanently deleted',
          }),
        }],
      }
    }
  )

  // ── get_task ────────────────────────────────────────────
  server.tool(
    'get_task',
    'Get a task by id. For task_type="project" tasks, also returns project_context: { summary, rules (all), relevant (top-10 hybrid search), claude_md_hint } — ready to paste into a new Claude Code session. Personal tasks return project_context: null.',
    {
      task_id: z.string().uuid().describe('UUID of the task'),
    },
    async ({ task_id }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      const supabase = createServiceRoleClient()
      const { data: taskRow, error } = await supabase
        .from('tasks')
        .select('id, title, description, status, priority, due_date, tags, task_type, project, created_at, updated_at, completed_at')
        .eq('id', task_id)
        .eq('user_id', userId)
        .single()

      if (error || !taskRow) {
        return { content: [{ type: 'text' as const, text: 'Error: Task not found' }], isError: true }
      }

      const task = {
        task_id: taskRow.id,
        title: taskRow.title,
        description: taskRow.description,
        status: taskRow.status,
        priority: taskRow.priority,
        due_date: taskRow.due_date,
        tags: taskRow.tags,
        task_type: taskRow.task_type,
        project: taskRow.project,
        created_at: toIST(new Date(taskRow.created_at)),
        completed_at: taskRow.completed_at ? toIST(new Date(taskRow.completed_at)) : null,
      }

      if (taskRow.task_type !== 'project' || !taskRow.project) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ task, project_context: null }) }],
        }
      }

      const projectName = taskRow.project as string

      const { data: memoryRows } = await supabase
        .from('pa_memory_items')
        .select('category')
        .eq('user_id', userId)
        .eq('project', projectName)
        .eq('is_active', true)

      const byCategory: Record<string, number> = {}
      for (const row of memoryRows ?? []) {
        const cat = (row as { category: string }).category
        byCategory[cat] = (byCategory[cat] ?? 0) + 1
      }

      const queryText = [taskRow.title, taskRow.description].filter(Boolean).join(' — ').slice(0, 500)

      const [rules, relevant] = await Promise.all([
        getRules(userId, projectName),
        searchMemories({ userId, query: queryText, project: projectName, limit: 10 }),
      ])

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            task,
            project_context: {
              summary: {
                total_memories: memoryRows?.length ?? 0,
                by_category: byCategory,
              },
              rules: rules.map(r => ({
                id: r.id,
                title: r.title,
                content: r.content,
                tags: r.tags,
              })),
              relevant: relevant.map(r => ({
                id: r.id,
                title: r.title,
                content: r.content,
                category: r.category,
                tags: r.tags,
                semantic_score: Math.round(r.semantic_score * 1000) / 1000,
                keyword_score: Math.round(r.keyword_score * 1000) / 1000,
                final_score: Math.round(r.final_score * 1000) / 1000,
              })),
              claude_md_hint: `Load the project CLAUDE.md and any nested CLAUDE.md files touching this task. See project='${projectName}' rules above for hard constraints.`,
            },
          }),
        }],
      }
    }
  )
}
