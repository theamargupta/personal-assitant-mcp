import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { toIST } from '@/types'
import { searchMemories, getRules } from '@/lib/memory/items'

type SupabaseClient = ReturnType<typeof createServiceRoleClient>

async function computeSubtaskProgress(
  supabase: SupabaseClient,
  parentId: string,
  userId: string
): Promise<{ completed: number; total: number; pct: number }> {
  const { data } = await supabase
    .from('tasks')
    .select('status')
    .eq('parent_task_id', parentId)
    .eq('user_id', userId)

  const rows = data ?? []
  const total = rows.length
  const completed = rows.filter(r => (r as { status: string }).status === 'completed').length
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100)
  return { completed, total, pct }
}

export function registerTaskTools(server: McpServer) {

  // ── create_task ──────────────────────────────────────
  server.tool(
    'create_task',
    'Create a task with title, description, due date, priority. Pass parent_task_id to create as a subtask (inherits task_type + project from parent, 1 level only).',
    {
      title: z.string().min(1).max(255).describe('Task title'),
      description: z.string().max(10000).optional().describe('Task description (up to 10000 chars)'),
      due_date: z.string().date().optional().describe('Due date (YYYY-MM-DD)'),
      priority: z.enum(['low', 'medium', 'high']).default('medium').describe('Priority (default: medium)'),
      tags: z.array(z.string()).default([]).describe('Tags for organizing'),
      task_type: z.enum(['personal', 'project']).default('personal').describe('Task type (default: personal). Ignored when parent_task_id is set — inherited from parent.'),
      project: z.string().min(1).max(100).optional().describe('Project name — required when task_type="project". Ignored when parent_task_id is set.'),
      parent_task_id: z.string().uuid().optional().describe('Optional parent task id. Creates this row as a subtask (1 level only). task_type + project are inherited from parent.'),
    },
    async ({ title, description, due_date, priority, tags, task_type = 'personal', project, parent_task_id }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      const supabase = createServiceRoleClient()

      let finalTaskType: 'personal' | 'project' = task_type
      let finalProject: string | null = project ?? null
      let position: number | null = null

      if (parent_task_id) {
        const { data: parent, error: parentErr } = await supabase
          .from('tasks')
          .select('id, task_type, project, parent_task_id, user_id')
          .eq('id', parent_task_id)
          .eq('user_id', userId)
          .single()

        if (parentErr || !parent) {
          return { content: [{ type: 'text' as const, text: 'Error: Parent task not found' }], isError: true }
        }
        if (parent.parent_task_id) {
          return { content: [{ type: 'text' as const, text: 'Error: Cannot nest subtasks (1-level only)' }], isError: true }
        }

        finalTaskType = parent.task_type as 'personal' | 'project'
        finalProject = (parent.project as string | null) ?? null

        const { data: maxRow } = await supabase
          .from('tasks')
          .select('position')
          .eq('parent_task_id', parent_task_id)
          .eq('user_id', userId)
          .order('position', { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle()

        const maxPos = (maxRow as { position: number | null } | null)?.position
        position = typeof maxPos === 'number' ? maxPos + 1 : 0
      } else if (finalTaskType === 'project' && !finalProject) {
        return {
          content: [{ type: 'text' as const, text: "Error: project is required when task_type is 'project'" }],
          isError: true,
        }
      }

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
          task_type: finalTaskType,
          project: finalProject,
          parent_task_id: parent_task_id ?? null,
          position,
        })
        .select('id, title, status, priority, due_date, task_type, project, parent_task_id, position, created_at')
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
            parent_task_id: data.parent_task_id,
            position: data.position,
            created_at: toIST(new Date(data.created_at)),
          }),
        }],
      }
    }
  )

  // ── add_subtask ──────────────────────────────────────
  server.tool(
    'add_subtask',
    'Add a subtask under a parent task. Inherits task_type + project from parent. Position auto-assigned to the end unless specified.',
    {
      parent_task_id: z.string().uuid().describe('UUID of the parent task'),
      title: z.string().min(1).max(255).describe('Subtask title'),
      description: z.string().max(10000).optional().describe('Subtask description'),
      due_date: z.string().date().optional().describe('Due date (YYYY-MM-DD)'),
      priority: z.enum(['low', 'medium', 'high']).default('medium').describe('Priority (default: medium)'),
      tags: z.array(z.string()).default([]).describe('Tags'),
      position: z.number().int().min(0).optional().describe('Explicit position (0-based). Defaults to end.'),
    },
    async ({ parent_task_id, title, description, due_date, priority, tags, position }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      const supabase = createServiceRoleClient()

      const { data: parent, error: parentErr } = await supabase
        .from('tasks')
        .select('id, task_type, project, parent_task_id')
        .eq('id', parent_task_id)
        .eq('user_id', userId)
        .single()

      if (parentErr || !parent) {
        return { content: [{ type: 'text' as const, text: 'Error: Parent task not found' }], isError: true }
      }
      if (parent.parent_task_id) {
        return { content: [{ type: 'text' as const, text: 'Error: Cannot nest subtasks (1-level only)' }], isError: true }
      }

      let finalPosition = position
      if (finalPosition === undefined) {
        const { data: maxRow } = await supabase
          .from('tasks')
          .select('position')
          .eq('parent_task_id', parent_task_id)
          .eq('user_id', userId)
          .order('position', { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle()
        const maxPos = (maxRow as { position: number | null } | null)?.position
        finalPosition = typeof maxPos === 'number' ? maxPos + 1 : 0
      }

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
          task_type: parent.task_type,
          project: parent.project,
          parent_task_id,
          position: finalPosition,
        })
        .select('id, title, status, priority, due_date, task_type, project, parent_task_id, position, created_at')
        .single()

      if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            subtask_id: data.id,
            parent_task_id: data.parent_task_id,
            title: data.title,
            status: data.status,
            position: data.position,
            task_type: data.task_type,
            project: data.project,
            created_at: toIST(new Date(data.created_at)),
          }),
        }],
      }
    }
  )

  // ── list_subtasks ────────────────────────────────────
  server.tool(
    'list_subtasks',
    'List subtasks of a parent task, ordered by position. Returns progress { completed, total, pct }.',
    {
      parent_task_id: z.string().uuid().describe('UUID of the parent task'),
    },
    async ({ parent_task_id }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      const supabase = createServiceRoleClient()

      const { data, error } = await supabase
        .from('tasks')
        .select('id, title, description, status, priority, due_date, tags, position, created_at, completed_at')
        .eq('parent_task_id', parent_task_id)
        .eq('user_id', userId)
        .order('position', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true })

      if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

      const subtasks = (data ?? []).map(row => ({
        subtask_id: row.id,
        title: row.title,
        description: row.description,
        status: row.status,
        priority: row.priority,
        due_date: row.due_date,
        tags: row.tags,
        position: row.position,
        created_at: toIST(new Date(row.created_at)),
        completed_at: row.completed_at ? toIST(new Date(row.completed_at)) : null,
      }))

      const total = subtasks.length
      const completed = subtasks.filter(s => s.status === 'completed').length
      const pct = total === 0 ? 0 : Math.round((completed / total) * 100)

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            parent_task_id,
            subtasks,
            progress: { completed, total, pct },
          }),
        }],
      }
    }
  )

  // ── get_subtask ──────────────────────────────────────
  server.tool(
    'get_subtask',
    'Fetch a single subtask by id. Errors if the row is not a subtask (has no parent).',
    {
      subtask_id: z.string().uuid().describe('UUID of the subtask'),
    },
    async ({ subtask_id }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      const supabase = createServiceRoleClient()
      const { data, error } = await supabase
        .from('tasks')
        .select('id, title, description, status, priority, due_date, tags, task_type, project, parent_task_id, position, created_at, updated_at, completed_at')
        .eq('id', subtask_id)
        .eq('user_id', userId)
        .single()

      if (error || !data) {
        return { content: [{ type: 'text' as const, text: 'Error: Subtask not found' }], isError: true }
      }
      if (!data.parent_task_id) {
        return { content: [{ type: 'text' as const, text: 'Error: Row is a top-level task, not a subtask — use get_task instead' }], isError: true }
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            subtask_id: data.id,
            parent_task_id: data.parent_task_id,
            title: data.title,
            description: data.description,
            status: data.status,
            priority: data.priority,
            due_date: data.due_date,
            tags: data.tags,
            task_type: data.task_type,
            project: data.project,
            position: data.position,
            created_at: toIST(new Date(data.created_at)),
            updated_at: toIST(new Date(data.updated_at)),
            completed_at: data.completed_at ? toIST(new Date(data.completed_at)) : null,
          }),
        }],
      }
    }
  )

  // ── update_subtask ───────────────────────────────────
  server.tool(
    'update_subtask',
    'Edit a subtask. Pass only fields you want to change. task_type/project/parent_task_id are inherited from parent and cannot be modified here. Use update_task_status or complete_task to change status.',
    {
      subtask_id: z.string().uuid().describe('UUID of the subtask'),
      title: z.string().min(1).max(255).optional().describe('New title'),
      description: z.string().max(10000).nullable().optional().describe('New description (null clears)'),
      due_date: z.string().date().nullable().optional().describe('New due date YYYY-MM-DD (null clears)'),
      priority: z.enum(['low', 'medium', 'high']).optional().describe('New priority'),
      tags: z.array(z.string()).optional().describe('Replaces tag list entirely'),
    },
    async (input, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      const supabase = createServiceRoleClient()

      const { data: existing, error: fetchErr } = await supabase
        .from('tasks')
        .select('id, parent_task_id')
        .eq('id', input.subtask_id)
        .eq('user_id', userId)
        .single()

      if (fetchErr || !existing) {
        return { content: [{ type: 'text' as const, text: 'Error: Subtask not found' }], isError: true }
      }
      if (!existing.parent_task_id) {
        return { content: [{ type: 'text' as const, text: 'Error: Row is a top-level task — use update_task instead' }], isError: true }
      }

      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (input.title !== undefined) patch.title = input.title.trim()
      if (input.description !== undefined) patch.description = input.description === null ? null : input.description.trim()
      if (input.due_date !== undefined) patch.due_date = input.due_date
      if (input.priority !== undefined) patch.priority = input.priority
      if (input.tags !== undefined) patch.tags = input.tags

      if (Object.keys(patch).length === 1) {
        return {
          content: [{ type: 'text' as const, text: 'Error: no fields provided to update' }],
          isError: true,
        }
      }

      const { data, error } = await supabase
        .from('tasks')
        .update(patch)
        .eq('id', input.subtask_id)
        .eq('user_id', userId)
        .select('id, title, description, status, priority, due_date, tags, task_type, project, parent_task_id, position, created_at, updated_at, completed_at')
        .single()

      if (error || !data) {
        return { content: [{ type: 'text' as const, text: `Error: ${error?.message ?? 'update failed'}` }], isError: true }
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            subtask_id: data.id,
            parent_task_id: data.parent_task_id,
            title: data.title,
            description: data.description,
            status: data.status,
            priority: data.priority,
            due_date: data.due_date,
            tags: data.tags,
            task_type: data.task_type,
            project: data.project,
            position: data.position,
            updated_at: toIST(new Date(data.updated_at)),
            completed_at: data.completed_at ? toIST(new Date(data.completed_at)) : null,
          }),
        }],
      }
    }
  )

  // ── delete_subtask ───────────────────────────────────
  server.tool(
    'delete_subtask',
    'Permanently delete a subtask. Errors if the id refers to a top-level task (use delete_task there). Does not reorder surviving siblings — positions may become non-contiguous.',
    {
      subtask_id: z.string().uuid().describe('UUID of the subtask to delete'),
    },
    async ({ subtask_id }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      const supabase = createServiceRoleClient()

      const { data: existing, error: fetchErr } = await supabase
        .from('tasks')
        .select('id, title, parent_task_id')
        .eq('id', subtask_id)
        .eq('user_id', userId)
        .single()

      if (fetchErr || !existing) {
        return { content: [{ type: 'text' as const, text: 'Error: Subtask not found' }], isError: true }
      }
      if (!existing.parent_task_id) {
        return { content: [{ type: 'text' as const, text: 'Error: Row is a top-level task — use delete_task instead' }], isError: true }
      }

      const { error: delErr } = await supabase
        .from('tasks')
        .delete()
        .eq('id', subtask_id)
        .eq('user_id', userId)

      if (delErr) {
        return { content: [{ type: 'text' as const, text: `Error: ${delErr.message}` }], isError: true }
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            deleted: true,
            subtask_id,
            parent_task_id: existing.parent_task_id,
            title: existing.title,
            message: 'Subtask permanently deleted',
          }),
        }],
      }
    }
  )

  // ── reorder_subtasks ─────────────────────────────────
  server.tool(
    'reorder_subtasks',
    'Reorder subtasks of a parent by passing an ordered list of subtask ids. Positions are assigned 0..n-1 in the given order. All current subtasks must be included.',
    {
      parent_task_id: z.string().uuid().describe('UUID of the parent task'),
      ordered_subtask_ids: z.array(z.string().uuid()).min(1).describe('Subtask ids in desired order'),
    },
    async ({ parent_task_id, ordered_subtask_ids }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      const supabase = createServiceRoleClient()

      const { data: existing, error: fetchErr } = await supabase
        .from('tasks')
        .select('id')
        .eq('parent_task_id', parent_task_id)
        .eq('user_id', userId)

      if (fetchErr) return { content: [{ type: 'text' as const, text: `Error: ${fetchErr.message}` }], isError: true }

      const existingIds = new Set((existing ?? []).map(r => (r as { id: string }).id))
      if (existingIds.size !== ordered_subtask_ids.length) {
        return { content: [{ type: 'text' as const, text: `Error: ordered_subtask_ids must include all ${existingIds.size} subtasks of this parent` }], isError: true }
      }
      for (const id of ordered_subtask_ids) {
        if (!existingIds.has(id)) {
          return { content: [{ type: 'text' as const, text: `Error: subtask ${id} is not a child of parent ${parent_task_id}` }], isError: true }
        }
      }

      for (let i = 0; i < ordered_subtask_ids.length; i++) {
        const { error: updErr } = await supabase
          .from('tasks')
          .update({ position: i, updated_at: new Date().toISOString() })
          .eq('id', ordered_subtask_ids[i])
          .eq('user_id', userId)
        if (updErr) {
          return { content: [{ type: 'text' as const, text: `Error reordering: ${updErr.message}` }], isError: true }
        }
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            parent_task_id,
            reordered: ordered_subtask_ids.length,
            order: ordered_subtask_ids,
          }),
        }],
      }
    }
  )

  // ── list_tasks ───────────────────────────────────────
  server.tool(
    'list_tasks',
    'List top-level tasks with optional filters. By default excludes subtasks — pass include_subtasks:true to include them. Each top-level task row includes subtask_progress.',
    {
      status: z.enum(['pending', 'in_progress', 'completed']).optional().describe('Filter by status'),
      priority: z.enum(['low', 'medium', 'high']).optional().describe('Filter by priority'),
      due_date_before: z.string().date().optional().describe('Tasks due before this date'),
      due_date_after: z.string().date().optional().describe('Tasks due after this date'),
      task_type: z.enum(['personal', 'project']).optional().describe('Filter by task type'),
      project: z.string().optional().describe('Filter by project name'),
      include_subtasks: z.boolean().default(false).describe('If true, subtasks are included as flat rows. Default: false (top-level only).'),
      limit: z.number().int().min(1).max(100).default(50).describe('Max results (default: 50)'),
      offset: z.number().int().min(0).default(0).describe('Offset for pagination'),
    },
    async ({ status, priority, due_date_before, due_date_after, task_type, project, include_subtasks, limit, offset }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      const supabase = createServiceRoleClient()
      let query = supabase
        .from('tasks')
        .select('id, title, description, status, priority, due_date, tags, task_type, project, parent_task_id, position, created_at, completed_at', { count: 'exact' })
        .eq('user_id', userId)

      if (!include_subtasks) query = query.is('parent_task_id', null)
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

      const topLevelIds = (data ?? [])
        .filter(t => t.parent_task_id === null)
        .map(t => t.id as string)

      const progressByParent = new Map<string, { completed: number; total: number; pct: number }>()
      if (topLevelIds.length > 0) {
        const { data: subRows } = await supabase
          .from('tasks')
          .select('parent_task_id, status')
          .in('parent_task_id', topLevelIds)
          .eq('user_id', userId)

        const grouped = new Map<string, { completed: number; total: number }>()
        for (const row of subRows ?? []) {
          const pid = (row as { parent_task_id: string }).parent_task_id
          const st = (row as { status: string }).status
          const agg = grouped.get(pid) ?? { completed: 0, total: 0 }
          agg.total += 1
          if (st === 'completed') agg.completed += 1
          grouped.set(pid, agg)
        }
        for (const [pid, agg] of grouped) {
          progressByParent.set(pid, {
            completed: agg.completed,
            total: agg.total,
            pct: agg.total === 0 ? 0 : Math.round((agg.completed / agg.total) * 100),
          })
        }
      }

      const tasks = (data || []).map(task => ({
        task_id: task.id,
        title: task.title,
        status: task.status,
        priority: task.priority,
        due_date: task.due_date,
        tags: task.tags,
        task_type: task.task_type,
        project: task.project,
        parent_task_id: task.parent_task_id,
        position: task.position,
        subtask_progress: task.parent_task_id === null
          ? (progressByParent.get(task.id as string) ?? { completed: 0, total: 0, pct: 0 })
          : null,
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
    async ({ task_id, status }, { authInfo }) => {
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

  // ── update_task ──────────────────────────────────────
  server.tool(
    'update_task',
    'Generic task edit. Pass only the fields you want to change. due_date and project accept null to clear. tags replaces (does not merge). Switching task_type to "personal" auto-clears project; switching to "project" requires project to be set (now or already). Cannot be used to move subtasks between parents — task_type/project on a subtask is locked to the parent by a DB trigger.',
    {
      task_id: z.string().uuid().describe('UUID of the task to update'),
      title: z.string().min(1).max(255).optional().describe('New title'),
      description: z.string().max(10000).nullable().optional().describe('New description (null clears)'),
      due_date: z.string().date().nullable().optional().describe('New due date YYYY-MM-DD (null clears)'),
      priority: z.enum(['low', 'medium', 'high']).optional().describe('New priority'),
      tags: z.array(z.string()).optional().describe('Replaces tag list entirely'),
      task_type: z.enum(['personal', 'project']).optional().describe('Switch task type (only valid on top-level tasks)'),
      project: z.string().min(1).max(100).nullable().optional().describe('Project name (required when final task_type is "project"; null clears)'),
    },
    async (input, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      const supabase = createServiceRoleClient()

      const { data: existing, error: fetchErr } = await supabase
        .from('tasks')
        .select('id, task_type, project, parent_task_id')
        .eq('id', input.task_id)
        .eq('user_id', userId)
        .single()

      if (fetchErr || !existing) {
        return { content: [{ type: 'text' as const, text: 'Error: Task not found' }], isError: true }
      }

      if (existing.parent_task_id && (input.task_type !== undefined || input.project !== undefined)) {
        return {
          content: [{ type: 'text' as const, text: 'Error: cannot change task_type or project on a subtask — these are inherited from parent' }],
          isError: true,
        }
      }

      const finalType = input.task_type ?? existing.task_type
      let finalProject: string | null
      if (input.task_type === 'personal') {
        if (input.project) {
          return {
            content: [{ type: 'text' as const, text: "Error: cannot set project when task_type='personal'" }],
            isError: true,
          }
        }
        finalProject = null
      } else if (input.project !== undefined) {
        finalProject = input.project
      } else {
        finalProject = existing.project
      }

      if (finalType === 'project' && !finalProject) {
        return {
          content: [{ type: 'text' as const, text: "Error: project is required when task_type is 'project'" }],
          isError: true,
        }
      }

      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (input.title !== undefined) patch.title = input.title.trim()
      if (input.description !== undefined) patch.description = input.description === null ? null : input.description.trim()
      if (input.due_date !== undefined) patch.due_date = input.due_date
      if (input.priority !== undefined) patch.priority = input.priority
      if (input.tags !== undefined) patch.tags = input.tags
      if (input.task_type !== undefined) patch.task_type = finalType
      if (input.task_type !== undefined || input.project !== undefined) patch.project = finalProject

      if (Object.keys(patch).length === 1) {
        return {
          content: [{ type: 'text' as const, text: 'Error: no fields provided to update' }],
          isError: true,
        }
      }

      const { data, error } = await supabase
        .from('tasks')
        .update(patch)
        .eq('id', input.task_id)
        .eq('user_id', userId)
        .select('id, title, description, status, priority, due_date, tags, task_type, project, parent_task_id, position, created_at, updated_at, completed_at')
        .single()

      if (error || !data) {
        return { content: [{ type: 'text' as const, text: `Error: ${error?.message ?? 'update failed'}` }], isError: true }
      }

      // Cascade task_type/project to subtasks AFTER parent update so the trigger
      // sees the parent already on the new values. Only runs on top-level tasks.
      if (existing.parent_task_id === null) {
        const typeChanged = input.task_type !== undefined && finalType !== existing.task_type
        const projectChanged =
          finalType === 'project' &&
          input.project !== undefined &&
          finalProject !== existing.project

        if (typeChanged || projectChanged) {
          const cascadePatch: Record<string, unknown> = { updated_at: new Date().toISOString() }
          cascadePatch.task_type = finalType
          cascadePatch.project = finalType === 'personal' ? null : finalProject
          const { error: cascadeErr } = await supabase
            .from('tasks')
            .update(cascadePatch)
            .eq('parent_task_id', input.task_id)
            .eq('user_id', userId)
          if (cascadeErr) {
            return { content: [{ type: 'text' as const, text: `Error cascading to subtasks: ${cascadeErr.message}` }], isError: true }
          }
        }
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            task_id: data.id,
            title: data.title,
            description: data.description,
            status: data.status,
            priority: data.priority,
            due_date: data.due_date,
            tags: data.tags,
            task_type: data.task_type,
            project: data.project,
            parent_task_id: data.parent_task_id,
            position: data.position,
            created_at: toIST(new Date(data.created_at)),
            updated_at: toIST(new Date(data.updated_at)),
            completed_at: data.completed_at ? toIST(new Date(data.completed_at)) : null,
          }),
        }],
      }
    }
  )

  // ── complete_task ────────────────────────────────────
  server.tool(
    'complete_task',
    'Mark task as completed. Returns summary (time taken, overdue). If this was a subtask and completing it makes all siblings complete, returns parent_auto_complete_hint so the caller can prompt the user to close the parent.',
    {
      task_id: z.string().uuid().describe('UUID of the task'),
    },
    async ({ task_id }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      const supabase = createServiceRoleClient()

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

      const createdDate = new Date(task.created_at)
      const completedDate = new Date(completedAt)
      const daysToComplete = Math.ceil(
        (completedDate.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24)
      )

      let wasOverdue = false
      if (task.due_date) {
        const dueDate = new Date(task.due_date + 'T23:59:59+05:30')
        wasOverdue = completedDate > dueDate
      }

      let parentAutoCompleteHint: { parent_task_id: string; all_subtasks_complete: boolean } | null = null
      if (task.parent_task_id) {
        const progress = await computeSubtaskProgress(supabase, task.parent_task_id as string, userId)
        if (progress.total > 0 && progress.completed === progress.total) {
          const { data: parentRow } = await supabase
            .from('tasks')
            .select('id, status')
            .eq('id', task.parent_task_id)
            .eq('user_id', userId)
            .single()
          if (parentRow && (parentRow as { status: string }).status !== 'completed') {
            parentAutoCompleteHint = {
              parent_task_id: task.parent_task_id as string,
              all_subtasks_complete: true,
            }
          }
        }
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
            parent_auto_complete_hint: parentAutoCompleteHint,
          }),
        }],
      }
    }
  )

  // ── delete_task ─────────────────────────────────────────
  server.tool(
    'delete_task',
    'Permanently delete a task. Subtasks are cascade-deleted via FK. Returns cascaded_subtasks count.',
    {
      task_id: z.string().uuid().describe('UUID of the task to delete'),
    },
    async ({ task_id }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      const supabase = createServiceRoleClient()

      const { data: task, error: fetchErr } = await supabase
        .from('tasks')
        .select('id, title')
        .eq('id', task_id)
        .eq('user_id', userId)
        .single()

      if (fetchErr || !task) {
        return { content: [{ type: 'text' as const, text: 'Error: Task not found' }], isError: true }
      }

      const { count: subtaskCount } = await supabase
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('parent_task_id', task_id)
        .eq('user_id', userId)

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
            cascaded_subtasks: subtaskCount ?? 0,
            message: 'Task permanently deleted',
          }),
        }],
      }
    }
  )

  // ── get_task ────────────────────────────────────────────
  server.tool(
    'get_task',
    'Get a task by id. Includes subtasks + subtask_progress. For task_type="project" tasks, also returns project_context: { summary, rules (all), relevant (top-10 hybrid search), claude_md_hint } — ready to paste into a new Claude Code session. Personal tasks return project_context: null.',
    {
      task_id: z.string().uuid().describe('UUID of the task'),
    },
    async ({ task_id }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      const supabase = createServiceRoleClient()
      const { data: taskRow, error } = await supabase
        .from('tasks')
        .select('id, title, description, status, priority, due_date, tags, task_type, project, parent_task_id, position, created_at, updated_at, completed_at')
        .eq('id', task_id)
        .eq('user_id', userId)
        .single()

      if (error || !taskRow) {
        return { content: [{ type: 'text' as const, text: 'Error: Task not found' }], isError: true }
      }

      const { data: subRows } = await supabase
        .from('tasks')
        .select('id, title, status, priority, due_date, tags, position, created_at, completed_at')
        .eq('parent_task_id', taskRow.id)
        .eq('user_id', userId)
        .order('position', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true })

      const subtasks = (subRows ?? []).map(row => ({
        subtask_id: row.id,
        title: row.title,
        status: row.status,
        priority: row.priority,
        due_date: row.due_date,
        tags: row.tags,
        position: row.position,
        created_at: toIST(new Date(row.created_at)),
        completed_at: row.completed_at ? toIST(new Date(row.completed_at)) : null,
      }))
      const subtaskTotal = subtasks.length
      const subtaskCompleted = subtasks.filter(s => s.status === 'completed').length
      const subtaskProgress = {
        completed: subtaskCompleted,
        total: subtaskTotal,
        pct: subtaskTotal === 0 ? 0 : Math.round((subtaskCompleted / subtaskTotal) * 100),
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
        parent_task_id: taskRow.parent_task_id,
        position: taskRow.position,
        created_at: toIST(new Date(taskRow.created_at)),
        completed_at: taskRow.completed_at ? toIST(new Date(taskRow.completed_at)) : null,
      }

      if (taskRow.task_type !== 'project' || !taskRow.project) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ task, subtasks, subtask_progress: subtaskProgress, project_context: null }),
          }],
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
            subtasks,
            subtask_progress: subtaskProgress,
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
