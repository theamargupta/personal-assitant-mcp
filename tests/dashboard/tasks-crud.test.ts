import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@/lib/supabase/client'

type QueryResult = { data?: any; error?: { message: string } | null }
type QueryChain = Record<string, ReturnType<typeof vi.fn>> & {
  then: (resolve: (value: QueryResult) => unknown, reject?: (reason: unknown) => unknown) => Promise<unknown>
}

const mocks = vi.hoisted(() => ({
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

const methods = ['select', 'insert', 'update', 'delete', 'eq', 'order', 'single', 'maybeSingle']

function createQuery(result: QueryResult = { data: null, error: null }): QueryChain {
  const chain = {} as QueryChain
  for (const method of methods) chain[method] = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn().mockResolvedValue(result)
  chain.maybeSingle = vi.fn().mockResolvedValue(result)
  chain.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject)
  return chain
}

const statusCycle = {
  pending: 'in_progress',
  in_progress: 'completed',
  completed: 'pending',
} as const

async function createTask(form: {
  title: string
  description: string
  priority: 'low' | 'medium' | 'high'
  due_date: string
  tags: string
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const payload = {
    title: form.title.trim(),
    description: form.description.trim() || null,
    priority: form.priority,
    due_date: form.due_date || null,
    tags: form.tags ? form.tags.split(',').map((tag) => tag.trim()).filter(Boolean) : [],
    updated_at: new Date().toISOString(),
  }
  return supabase.from('tasks').insert({ ...payload, user_id: user.id })
}

async function cycleStatus(task: { id: string; status: keyof typeof statusCycle }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const newStatus = statusCycle[task.status]
  const updates = {
    status: newStatus,
    updated_at: new Date().toISOString(),
    completed_at: newStatus === 'completed' ? new Date().toISOString() : null,
  }
  return supabase.from('tasks').update(updates).eq('id', task.id).eq('user_id', user.id)
}

async function completeTask(taskId: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const now = new Date().toISOString()
  return supabase
    .from('tasks')
    .update({ status: 'completed', completed_at: now, updated_at: now })
    .eq('id', taskId)
    .eq('user_id', user.id)
}

async function deleteTask(taskId: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return supabase.from('tasks').delete().eq('id', taskId).eq('user_id', user.id)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-04-16T06:30:00.000Z'))
  mocks.supabase.from.mockReturnValue(createQuery({ error: null }))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('dashboard tasks CRUD logic', () => {
  it('create task includes all fields', async () => {
    const chain = createQuery({ error: null })
    mocks.supabase.from.mockReturnValue(chain)

    await createTask({
      title: ' Buy milk ',
      description: ' organic ',
      priority: 'high',
      due_date: '2026-04-20',
      tags: 'shopping, dairy, ',
    })

    expect(mocks.supabase.from).toHaveBeenCalledWith('tasks')
    expect(chain.insert).toHaveBeenCalledWith({
      user_id: 'test-user',
      title: 'Buy milk',
      description: 'organic',
      priority: 'high',
      due_date: '2026-04-20',
      tags: ['shopping', 'dairy'],
      updated_at: '2026-04-16T06:30:00.000Z',
    })
  })

  it('cycle status follows correct order', async () => {
    expect(statusCycle.pending).toBe('in_progress')
    expect(statusCycle.in_progress).toBe('completed')
    expect(statusCycle.completed).toBe('pending')

    const chain = createQuery({ error: null })
    mocks.supabase.from.mockReturnValue(chain)
    await cycleStatus({ id: 't-1', status: 'pending' })

    expect(chain.update).toHaveBeenCalledWith({
      status: 'in_progress',
      updated_at: '2026-04-16T06:30:00.000Z',
      completed_at: null,
    })
  })

  it('complete task sets completed_at', async () => {
    const chain = createQuery({ error: null })
    mocks.supabase.from.mockReturnValue(chain)

    await completeTask('t-1')

    expect(chain.update).toHaveBeenCalledWith({
      status: 'completed',
      completed_at: '2026-04-16T06:30:00.000Z',
      updated_at: '2026-04-16T06:30:00.000Z',
    })
    expect(chain.eq).toHaveBeenCalledWith('id', 't-1')
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'test-user')
  })

  it('delete task calls delete with correct id', async () => {
    const chain = createQuery({ error: null })
    mocks.supabase.from.mockReturnValue(chain)

    await deleteTask('t-delete')

    expect(chain.delete).toHaveBeenCalled()
    expect(chain.eq).toHaveBeenCalledWith('id', 't-delete')
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'test-user')
  })
})
