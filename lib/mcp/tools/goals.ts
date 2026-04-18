import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server'
import { z } from 'zod'
import { toIST, todayISTDate } from '@/types'
import {
  createGoal,
  listGoals,
  updateGoal,
  addMilestone,
  toggleMilestone,
  updateMilestone,
  deleteMilestone,
  computeGoalProgress,
} from '@/lib/goals/goals'
import { generateReview } from '@/lib/goals/review'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { WIDGET_URIS } from '@/lib/mcp/widgets'

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
  registerAppTool(
    server,
    'get_review',
    {
      description: 'Get a comprehensive personal review for a period. Pulls habits, tasks, finance, and goals together with highlights. Perfect for "mera April review do" or "is hafte ka summary bata".',
      inputSchema: {
        period: z.enum(['this_week', 'last_week', 'this_month', 'last_month', 'custom']).default('this_month')
          .describe('Review period'),
        start_date: z.string().date().optional().describe('Custom start date (YYYY-MM-DD), required if period=custom'),
        end_date: z.string().date().optional().describe('Custom end date (YYYY-MM-DD), required if period=custom'),
      },
      _meta: { ui: { resourceUri: WIDGET_URIS.reviewDashboard } },
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

  // ── delete_goal ─────────────────────────────────────────
  server.tool(
    'delete_goal',
    'Permanently delete a goal and all its milestones. Use for test/cleanup workflows — this cannot be undone.',
    {
      goal_id: z.string().uuid().describe('UUID of the goal to delete'),
    },
    async ({ goal_id }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      const supabase = createServiceRoleClient()

      // Verify goal belongs to user
      const { data: goal, error: fetchErr } = await supabase
        .from('goals')
        .select('id, title')
        .eq('id', goal_id)
        .eq('user_id', userId)
        .single()

      if (fetchErr || !goal) {
        return { content: [{ type: 'text' as const, text: 'Error: Goal not found' }], isError: true }
      }

      // Delete milestones first (FK constraint)
      await supabase.from('goal_milestones').delete().eq('goal_id', goal_id)

      // Delete goal
      const { error: delErr } = await supabase.from('goals').delete().eq('id', goal_id)
      if (delErr) {
        return { content: [{ type: 'text' as const, text: `Error: ${delErr.message}` }], isError: true }
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            deleted: true,
            goal_id: goal.id,
            title: goal.title,
          }),
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

  // ── update_milestone ────────────────────────────────────
  server.tool(
    'update_milestone',
    'Edit a milestone (title, sort_order, completed). Marking the last pending milestone as completed auto-completes the parent goal.',
    {
      milestone_id: z.string().uuid().describe('UUID of the milestone'),
      title: z.string().min(1).max(255).optional().describe('New title'),
      sort_order: z.number().int().min(0).optional().describe('New sort order (0-based)'),
      completed: z.boolean().optional().describe('Mark complete or un-complete'),
    },
    async ({ milestone_id, title, sort_order, completed }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      try {
        const ms = await updateMilestone(userId, milestone_id, {
          title,
          sortOrder: sort_order,
          completed,
        })

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              milestone_id: ms.id,
              goal_id: ms.goal_id,
              title: ms.title,
              sort_order: ms.sort_order,
              completed: ms.completed,
              completed_at: ms.completed_at ? toIST(new Date(ms.completed_at)) : null,
            }),
          }],
        }
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : 'Update failed'}` }],
          isError: true,
        }
      }
    }
  )

  // ── delete_milestone ────────────────────────────────────
  server.tool(
    'delete_milestone',
    'Permanently delete a milestone. The parent goal is untouched.',
    {
      milestone_id: z.string().uuid().describe('UUID of the milestone'),
    },
    async ({ milestone_id }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      try {
        const ms = await deleteMilestone(userId, milestone_id)
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              deleted: true,
              milestone_id: ms.id,
              goal_id: ms.goal_id,
              title: ms.title,
              message: 'Milestone permanently deleted',
            }),
          }],
        }
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : 'Delete failed'}` }],
          isError: true,
        }
      }
    }
  )
}
