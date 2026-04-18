import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@/lib/supabase/client'

type QueryResult = { data?: any; error?: { message: string } | null }
type QueryChain = Record<string, ReturnType<typeof vi.fn>> & {
  then: (resolve: (value: QueryResult) => unknown, reject?: (reason: unknown) => unknown) => Promise<unknown>
}

type GoalType = 'outcome' | 'milestone'
type GoalMetricForm = 'tasks_completed' | 'habit_streak' | 'savings' | 'custom'
type DbMetricType = 'habit_streak' | 'habit_completion' | 'tasks_completed' | 'spending_limit'

const mocks = vi.hoisted(() => ({
  deleteOrder: [] as string[],
  supabase: {
    from: vi.fn(),
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'test-user' } }, error: null })),
    },
  },
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => mocks.supabase),
}))

const methods = ['select', 'insert', 'update', 'delete', 'eq', 'in', 'order', 'single', 'maybeSingle']

function createQuery(result: QueryResult = { data: null, error: null }, table?: string): QueryChain {
  const chain = {} as QueryChain
  for (const method of methods) chain[method] = vi.fn().mockReturnValue(chain)
  chain.delete = vi.fn(() => {
    if (table) mocks.deleteOrder.push(table)
    return chain
  })
  chain.single = vi.fn().mockResolvedValue(result)
  chain.maybeSingle = vi.fn().mockResolvedValue(result)
  chain.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject)
  return chain
}

function toDbMetric(metric: GoalMetricForm): DbMetricType | null {
  if (metric === 'savings') return 'spending_limit'
  if (metric === 'custom') return null
  return metric
}

async function createGoal(form: {
  title: string
  description: string
  goal_type: GoalType
  metric_type: GoalMetricForm
  target_value: string
  start_date: string
  end_date: string
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const targetValue = form.target_value ? parseFloat(form.target_value) : null
  return supabase.from('goals').insert({
    user_id: user.id,
    title: form.title.trim(),
    description: form.description.trim() || null,
    goal_type: form.goal_type,
    metric_type: form.goal_type === 'outcome' ? toDbMetric(form.metric_type) : null,
    target_value: form.goal_type === 'outcome' ? targetValue : null,
    start_date: form.start_date,
    end_date: form.end_date,
    status: 'active',
  })
}

async function addMilestone(goalId: string, title: string, existingCount: number) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return supabase.from('goal_milestones').insert({
    goal_id: goalId,
    user_id: user.id,
    title: title.trim(),
    sort_order: existingCount + 1,
    completed: false,
  })
}

async function toggleMilestone(milestone: { id: string; completed: boolean }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return supabase
    .from('goal_milestones')
    .update({
      completed: !milestone.completed,
      completed_at: !milestone.completed ? new Date().toISOString() : null,
    })
    .eq('id', milestone.id)
    .eq('user_id', user.id)
}

async function deleteGoal(goalId: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  await supabase.from('goal_milestones').delete().eq('goal_id', goalId).eq('user_id', user.id)
  await supabase.from('goals').delete().eq('id', goalId).eq('user_id', user.id)
}

function milestoneProgress(milestones: Array<{ completed: boolean }>) {
  if (milestones.length === 0) return 0
  return Math.round((milestones.filter((milestone) => milestone.completed).length / milestones.length) * 100)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-04-16T06:30:00.000Z'))
  mocks.deleteOrder = []
  mocks.supabase.from.mockImplementation((table: string) => createQuery({ error: null }, table))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('dashboard goals CRUD logic', () => {
  it('create goal inserts with correct outcome type', async () => {
    const chain = createQuery({ error: null }, 'goals')
    mocks.supabase.from.mockReturnValue(chain)

    await createGoal({
      title: ' Ship release ',
      description: ' v1 ',
      goal_type: 'outcome',
      metric_type: 'tasks_completed',
      target_value: '20',
      start_date: '2026-04-01',
      end_date: '2026-04-30',
    })

    expect(chain.insert).toHaveBeenCalledWith({
      user_id: 'test-user',
      title: 'Ship release',
      description: 'v1',
      goal_type: 'outcome',
      metric_type: 'tasks_completed',
      target_value: 20,
      start_date: '2026-04-01',
      end_date: '2026-04-30',
      status: 'active',
    })
  })

  it('create goal inserts with correct milestone type', async () => {
    const chain = createQuery({ error: null }, 'goals')
    mocks.supabase.from.mockReturnValue(chain)

    await createGoal({
      title: 'Checklist',
      description: '',
      goal_type: 'milestone',
      metric_type: 'tasks_completed',
      target_value: '20',
      start_date: '2026-04-01',
      end_date: '2026-04-30',
    })

    expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({
      goal_type: 'milestone',
      metric_type: null,
      target_value: null,
      status: 'active',
    }))
  })

  it('add milestone inserts with incremented sort_order', async () => {
    const chain = createQuery({ error: null }, 'goal_milestones')
    mocks.supabase.from.mockReturnValue(chain)

    await addMilestone('g-1', ' Third step ', 2)

    expect(chain.insert).toHaveBeenCalledWith({
      goal_id: 'g-1',
      user_id: 'test-user',
      title: 'Third step',
      sort_order: 3,
      completed: false,
    })
  })

  it('toggle milestone flips completed boolean', async () => {
    const chain = createQuery({ error: null }, 'goal_milestones')
    mocks.supabase.from.mockReturnValue(chain)

    await toggleMilestone({ id: 'ms-1', completed: false })

    expect(chain.update).toHaveBeenCalledWith({
      completed: true,
      completed_at: '2026-04-16T06:30:00.000Z',
    })
    expect(chain.eq).toHaveBeenCalledWith('id', 'ms-1')
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'test-user')
  })

  it('delete goal removes milestones first then goal', async () => {
    await deleteGoal('g-1')

    expect(mocks.deleteOrder).toEqual(['goal_milestones', 'goals'])
  })

  it('milestone progress = completed/total * 100', () => {
    expect(milestoneProgress([
      { completed: true },
      { completed: true },
      { completed: true },
      { completed: false },
      { completed: false },
    ])).toBe(60)
  })
})
