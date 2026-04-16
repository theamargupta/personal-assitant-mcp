import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type QueryResult = {
  data?: any
  error?: { message: string } | null
  count?: number | null
}

type QueryChain = Record<string, ReturnType<typeof vi.fn>> & {
  then: (resolve: (value: QueryResult) => unknown, reject?: (reason: unknown) => unknown) => Promise<unknown>
}

const mocks = vi.hoisted(() => ({
  queues: new Map<string, any[]>(),
  mockClient: { from: vi.fn() },
  createGoal: vi.fn(async (input: any) => ({
    id: 'g-1',
    title: input.title.trim(),
    goal_type: input.goalType,
    status: 'active',
    start_date: input.startDate,
    end_date: input.endDate,
    created_at: '2026-04-01T06:30:00.000Z',
  })),
  listGoals: vi.fn(async () => [
    {
      id: 'g-1',
      title: 'Ship project',
      goal_type: 'outcome',
      status: 'active',
      start_date: '2026-04-01',
      end_date: '2026-04-30',
      target_value: 20,
      is_recurring: false,
    },
  ]),
  updateGoal: vi.fn(async (_userId: string, goalId: string, updates: any) => ({
    id: goalId,
    title: updates.title?.trim() ?? 'Updated Goal',
    status: updates.status ?? 'active',
    updated_at: '2026-04-16T06:30:00.000Z',
  })),
  addMilestone: vi.fn(async (_userId: string, goalId: string, title: string, sortOrder: number) => ({
    id: `ms-${sortOrder}`,
    goal_id: goalId,
    title: title.trim(),
    sort_order: sortOrder,
    completed: false,
    created_at: '2026-04-01T06:30:00.000Z',
  })),
  toggleMilestone: vi.fn(async () => ({
    id: 'ms-1',
    title: 'Step 1',
    completed: true,
    completed_at: '2026-04-15T06:30:00.000Z',
  })),
  computeGoalProgress: vi.fn(async () => ({
    currentValue: 10,
    targetValue: 20,
    progressPct: 50,
  })),
  generateReview: vi.fn(async () => ({
    period: { start: '2026-04-01', end: '2026-04-16', label: 'April 2026' },
    habits: { total_tracked: 1, avg_completion_pct: 75, streaks: [] },
    tasks: { completed: 4, pending: 2, overdue: 1, total_created: 6 },
    finance: { total_spent: 3200, breakdown: [{ category: 'Food', icon: '🍕', amount: 3200, count: 8 }] },
    goals: { active: 1, completed: 1, failed: 0, details: [] },
    highlights: {
      best_habit: null,
      worst_habit: null,
      top_spending_category: { name: 'Food', icon: '🍕', amount: 3200 },
      biggest_single_spend: null,
      goals_hit: 1,
      goals_missed: 0,
      tasks_completed: 4,
      tasks_pending: 2,
    },
  })),
  registeredTools: {} as Record<string, { handler: Function }>,
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => mocks.mockClient),
}))

vi.mock('@/lib/goals/goals', () => ({
  createGoal: mocks.createGoal,
  listGoals: mocks.listGoals,
  updateGoal: mocks.updateGoal,
  addMilestone: mocks.addMilestone,
  toggleMilestone: mocks.toggleMilestone,
  computeGoalProgress: mocks.computeGoalProgress,
}))

vi.mock('@/lib/goals/review', () => ({
  generateReview: mocks.generateReview,
}))

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: class {
    tool(name: string, _desc: string, _schema: unknown, handler: Function) {
      mocks.registeredTools[name] = { handler }
    }
  },
}))

import { registerGoalTools } from '@/lib/mcp/tools/goals'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

const server = new McpServer({ name: 'test', version: '0.0.0' })
registerGoalTools(server)

const authInfo = { extra: { userId: 'user-1' } }
const noAuth = { extra: {} }
const methods = ['select', 'insert', 'update', 'delete', 'eq', 'neq', 'gte', 'lte', 'order', 'limit', 'range', 'single', 'maybeSingle']

function createQuery(result: QueryResult = { data: null, error: null }): QueryChain {
  const chain = {} as QueryChain
  for (const method of methods) chain[method] = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn().mockResolvedValue(result)
  chain.maybeSingle = vi.fn().mockResolvedValue(result)
  chain.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject)
  return chain
}

function queue(table: string, ...chains: QueryChain[]) {
  mocks.queues.set(table, [...(mocks.queues.get(table) ?? []), ...chains])
}

function setupFromQueues() {
  mocks.mockClient.from.mockImplementation((table: string) => {
    const chains = mocks.queues.get(table) ?? []
    if (chains.length > 0) return chains.shift()
    return createQuery({ data: null, error: null })
  })
}

function parseToolResult(result: { content: Array<{ text: string }> }) {
  return JSON.parse(result.content[0].text)
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.queues = new Map()
  setupFromQueues()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('create_goal', () => {
  it('throws when unauthorized', async () => {
    await expect(mocks.registeredTools['create_goal'].handler(
      { title: 'Goal', goal_type: 'outcome', start_date: '2026-04-01', end_date: '2026-04-30' },
      { authInfo: noAuth }
    )).rejects.toThrow('Unauthorized')
  })

  it('creates an outcome goal with metric fields', async () => {
    const result = await mocks.registeredTools['create_goal'].handler(
      {
        title: ' Ship project ',
        description: ' finish release ',
        goal_type: 'outcome',
        metric_type: 'tasks_completed',
        target_value: 20,
        start_date: '2026-04-01',
        end_date: '2026-04-30',
        is_recurring: false,
      },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(mocks.createGoal).toHaveBeenCalledWith({
      userId: 'user-1',
      title: ' Ship project ',
      description: ' finish release ',
      goalType: 'outcome',
      metricType: 'tasks_completed',
      metricRefId: undefined,
      targetValue: 20,
      isRecurring: false,
      recurrence: undefined,
      startDate: '2026-04-01',
      endDate: '2026-04-30',
    })
    expect(parsed.goal_id).toBe('g-1')
    expect(parsed.title).toBe('Ship project')
    expect(parsed.goal_type).toBe('outcome')
    expect(parsed.milestones_created).toBe(0)
  })

  it('creates milestone goal and auto-creates provided milestones with sort order', async () => {
    const result = await mocks.registeredTools['create_goal'].handler(
      {
        title: 'Launch checklist',
        description: 'Prepare, ship, review',
        goal_type: 'milestone',
        start_date: '2026-04-01',
        end_date: '2026-04-30',
        milestones: [' Draft spec ', 'Build feature', 'Ship'],
      },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(parsed.goal_type).toBe('milestone')
    expect(parsed.milestones_created).toBe(3)
    expect(mocks.addMilestone).toHaveBeenNthCalledWith(1, 'user-1', 'g-1', ' Draft spec ', 0)
    expect(mocks.addMilestone).toHaveBeenNthCalledWith(2, 'user-1', 'g-1', 'Build feature', 1)
    expect(mocks.addMilestone).toHaveBeenNthCalledWith(3, 'user-1', 'g-1', 'Ship', 2)
  })
})

describe('list_goals', () => {
  it('throws when unauthorized', async () => {
    await expect(mocks.registeredTools['list_goals'].handler(
      {},
      { authInfo: noAuth }
    )).rejects.toThrow('Unauthorized')
  })

  it('lists goals with computed progress values', async () => {
    const result = await mocks.registeredTools['list_goals'].handler(
      { status: 'active', goal_type: 'outcome' },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(mocks.listGoals).toHaveBeenCalledWith('user-1', 'active', 'outcome')
    expect(parsed.total).toBe(1)
    expect(parsed.goals[0]).toEqual({
      goal_id: 'g-1',
      title: 'Ship project',
      goal_type: 'outcome',
      status: 'active',
      start_date: '2026-04-01',
      end_date: '2026-04-30',
      progress_pct: 50,
      current_value: 10,
      target_value: 20,
      is_recurring: false,
    })
  })
})

describe('update_goal', () => {
  it('throws when unauthorized', async () => {
    await expect(mocks.registeredTools['update_goal'].handler(
      { goal_id: 'g-1', title: 'New' },
      { authInfo: noAuth }
    )).rejects.toThrow('Unauthorized')
  })

  it.each(['completed', 'failed'] as const)('updates goal status to %s', async (status) => {
    const result = await mocks.registeredTools['update_goal'].handler(
      { goal_id: 'g-1', status },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(mocks.updateGoal).toHaveBeenCalledWith('user-1', 'g-1', {
      title: undefined,
      description: undefined,
      status,
      targetValue: undefined,
    })
    expect(parsed.goal_id).toBe('g-1')
    expect(parsed.status).toBe(status)
  })

  it('toggles milestone and returns completion state', async () => {
    const result = await mocks.registeredTools['update_goal'].handler(
      { milestone_id: 'ms-1' },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(mocks.toggleMilestone).toHaveBeenCalledWith('user-1', 'ms-1')
    expect(parsed.milestone_id).toBe('ms-1')
    expect(parsed.completed).toBe(true)
    expect(parsed.completed_at).toBeTruthy()
  })

  it('returns error when neither goal_id nor milestone_id is provided', async () => {
    const result = await mocks.registeredTools['update_goal'].handler(
      { title: 'No ID' },
      { authInfo }
    )

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: Provide goal_id or milestone_id')
  })
})

describe('get_goal_progress', () => {
  it('throws when unauthorized', async () => {
    await expect(mocks.registeredTools['get_goal_progress'].handler(
      { goal_id: 'g-1' },
      { authInfo: noAuth }
    )).rejects.toThrow('Unauthorized')
  })

  it('returns error when goal is not found', async () => {
    queue('goals', createQuery({ data: null, error: null }))

    const result = await mocks.registeredTools['get_goal_progress'].handler(
      { goal_id: 'g-bad' },
      { authInfo }
    )

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: Goal not found')
  })

  it('computes milestone progress percentage and returns milestone values', async () => {
    mocks.computeGoalProgress.mockResolvedValueOnce({ currentValue: 2, targetValue: 5, progressPct: 40 })
    queue('goals', createQuery({
      data: {
        id: 'g-1',
        title: 'Milestone goal',
        goal_type: 'milestone',
        metric_type: null,
        status: 'active',
        start_date: '2026-04-01',
        end_date: '2026-04-30',
      },
      error: null,
    }))
    queue('goal_milestones', createQuery({
      data: [
        { id: 'ms-1', title: 'Step 1', completed: true, completed_at: '2026-04-10T06:30:00.000Z', sort_order: 1 },
        { id: 'ms-2', title: 'Step 2', completed: true, completed_at: '2026-04-12T06:30:00.000Z', sort_order: 2 },
        { id: 'ms-3', title: 'Step 3', completed: false, completed_at: null, sort_order: 3 },
        { id: 'ms-4', title: 'Step 4', completed: false, completed_at: null, sort_order: 4 },
        { id: 'ms-5', title: 'Step 5', completed: false, completed_at: null, sort_order: 5 },
      ],
      error: null,
    }))

    const result = await mocks.registeredTools['get_goal_progress'].handler(
      { goal_id: 'g-1' },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(parsed.goal_type).toBe('milestone')
    expect(parsed.current_value).toBe(2)
    expect(parsed.target_value).toBe(5)
    expect(parsed.progress_pct).toBe(40)
    expect(parsed.milestones.map((milestone: { title: string; completed: boolean }) => ({
      title: milestone.title,
      completed: milestone.completed,
    }))).toEqual([
      { title: 'Step 1', completed: true },
      { title: 'Step 2', completed: true },
      { title: 'Step 3', completed: false },
      { title: 'Step 4', completed: false },
      { title: 'Step 5', completed: false },
    ])
  })

  it('computes outcome progress from linked data values', async () => {
    mocks.computeGoalProgress.mockResolvedValueOnce({ currentValue: 12, targetValue: 20, progressPct: 60 })
    queue('goals', createQuery({
      data: {
        id: 'g-2',
        title: 'Complete tasks',
        goal_type: 'outcome',
        metric_type: 'tasks_completed',
        status: 'active',
        start_date: '2026-04-01',
        end_date: '2026-04-30',
      },
      error: null,
    }))

    const result = await mocks.registeredTools['get_goal_progress'].handler(
      { goal_id: 'g-2' },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(mocks.computeGoalProgress).toHaveBeenCalledWith('user-1', 'g-2')
    expect(parsed.metric_type).toBe('tasks_completed')
    expect(parsed.current_value).toBe(12)
    expect(parsed.target_value).toBe(20)
    expect(parsed.progress_pct).toBe(60)
    expect(parsed.milestones).toBeNull()
  })
})

describe('get_review', () => {
  it('throws when unauthorized', async () => {
    await expect(mocks.registeredTools['get_review'].handler(
      { period: 'this_month' },
      { authInfo: noAuth }
    )).rejects.toThrow('Unauthorized')
  })

  it('returns review for a custom period with concrete values', async () => {
    const result = await mocks.registeredTools['get_review'].handler(
      { period: 'custom', start_date: '2026-04-01', end_date: '2026-04-16' },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(mocks.generateReview).toHaveBeenCalledWith('user-1', '2026-04-01', '2026-04-16', '2026-04-01 to 2026-04-16')
    expect(parsed.tasks.completed).toBe(4)
    expect(parsed.finance.total_spent).toBe(3200)
    expect(parsed.highlights.top_spending_category).toEqual({ name: 'Food', icon: '🍕', amount: 3200 })
  })

  it('returns error for custom period without dates', async () => {
    const result = await mocks.registeredTools['get_review'].handler(
      { period: 'custom' },
      { authInfo }
    )

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: start_date and end_date required for custom period')
  })

  it.each([
    ['this_week', '2026-04-13', '2026-04-16', 'This Week'],
    ['last_week', '2026-04-06', '2026-04-12', 'Last Week'],
    ['this_month', '2026-04-01', '2026-04-16', 'April 2026'],
  ] as const)('returns review for %s with concrete date range', async (period, start, end, label) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-16T06:30:00.000Z'))

    const result = await mocks.registeredTools['get_review'].handler(
      { period },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(mocks.generateReview).toHaveBeenCalledWith('user-1', start, end, label)
    expect(parsed.period.start).toBe('2026-04-01')
    expect(parsed.tasks.completed).toBe(4)
  })

  it('returns review for last_month branch', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-16T06:30:00.000Z'))

    const result = await mocks.registeredTools['get_review'].handler(
      { period: 'last_month' },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(mocks.generateReview).toHaveBeenCalledWith('user-1', expect.any(String), expect.any(String), 'March 2026')
    expect(parsed.finance.total_spent).toBe(3200)
  })
})

describe('add_milestone', () => {
  it('throws when unauthorized', async () => {
    await expect(mocks.registeredTools['add_milestone'].handler(
      { goal_id: 'g-1', title: 'Step', sort_order: 3 },
      { authInfo: noAuth }
    )).rejects.toThrow('Unauthorized')
  })

  it('adds milestone at the requested incremented sort order', async () => {
    const result = await mocks.registeredTools['add_milestone'].handler(
      { goal_id: 'g-1', title: ' Third step ', sort_order: 3 },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(mocks.addMilestone).toHaveBeenCalledWith('user-1', 'g-1', ' Third step ', 3)
    expect(parsed.milestone_id).toBe('ms-3')
    expect(parsed.title).toBe('Third step')
    expect(parsed.sort_order).toBe(3)
  })
})
