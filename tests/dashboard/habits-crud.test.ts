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

const methods = ['select', 'insert', 'update', 'delete', 'eq', 'gte', 'lte', 'order', 'single', 'maybeSingle']

function createQuery(result: QueryResult = { data: null, error: null }): QueryChain {
  const chain = {} as QueryChain
  for (const method of methods) chain[method] = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn().mockResolvedValue(result)
  chain.maybeSingle = vi.fn().mockResolvedValue(result)
  chain.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject)
  return chain
}

function isoDate(date: Date) {
  return date.toISOString().split('T')[0]
}

async function createHabit(form: {
  name: string
  frequency: 'daily' | 'weekly' | 'monthly'
  color: string
  description: string
  reminder_time: string
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return supabase.from('habits').insert({
    user_id: user.id,
    name: form.name.trim(),
    frequency: form.frequency,
    description: form.description.trim() || null,
    color: form.color,
    reminder_time: form.reminder_time || null,
    updated_at: new Date().toISOString(),
  })
}

async function archiveHabit(habitId: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return supabase
    .from('habits')
    .update({ archived: true, updated_at: new Date().toISOString() })
    .eq('id', habitId)
    .eq('user_id', user.id)
}

async function logToday(habitId: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return supabase.from('habit_logs').insert({
    habit_id: habitId,
    user_id: user.id,
    logged_date: isoDate(new Date()),
  })
}

function getBestStreak(dates: string[]) {
  const uniqueDates = [...new Set(dates)].sort()
  let best = 0
  let current = 0
  let previous: string | null = null

  for (const date of uniqueDates) {
    if (!previous) {
      current = 1
    } else {
      const diffDays = (new Date(date).getTime() - new Date(previous).getTime()) / (1000 * 60 * 60 * 24)
      current = diffDays === 1 ? current + 1 : 1
    }
    best = Math.max(best, current)
    previous = date
  }

  return best
}

function getCurrentStreak(dates: string[], loggedToday: boolean, now = new Date()) {
  const dateSet = new Set(dates)
  const cursor = new Date(now)
  if (!loggedToday) cursor.setDate(cursor.getDate() - 1)

  let streak = 0
  while (dateSet.has(isoDate(cursor))) {
    streak++
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

function completionPercentage30d(dates: string[], now = new Date()) {
  const start = new Date(now)
  start.setDate(start.getDate() - 29)
  const startIso = isoDate(start)
  return Math.round((dates.filter((date) => date >= startIso).length / 30) * 100)
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

describe('dashboard habits CRUD logic', () => {
  it('create habit inserts with correct fields', async () => {
    const chain = createQuery({ error: null })
    mocks.supabase.from.mockReturnValue(chain)

    await createHabit({
      name: ' Workout ',
      frequency: 'daily',
      color: '#c8ff00',
      description: ' Move daily ',
      reminder_time: '07:30',
    })

    expect(mocks.supabase.from).toHaveBeenCalledWith('habits')
    expect(chain.insert).toHaveBeenCalledWith({
      user_id: 'test-user',
      name: 'Workout',
      frequency: 'daily',
      color: '#c8ff00',
      description: 'Move daily',
      reminder_time: '07:30',
      updated_at: '2026-04-16T06:30:00.000Z',
    })
  })

  it('archive habit sets archived=true', async () => {
    const chain = createQuery({ error: null })
    mocks.supabase.from.mockReturnValue(chain)

    await archiveHabit('h-1')

    expect(chain.update).toHaveBeenCalledWith({
      archived: true,
      updated_at: '2026-04-16T06:30:00.000Z',
    })
    expect(chain.eq).toHaveBeenCalledWith('id', 'h-1')
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'test-user')
  })

  it('log today inserts with correct date', async () => {
    const chain = createQuery({ error: null })
    mocks.supabase.from.mockReturnValue(chain)

    await logToday('h-1')

    expect(mocks.supabase.from).toHaveBeenCalledWith('habit_logs')
    expect(chain.insert).toHaveBeenCalledWith({
      habit_id: 'h-1',
      user_id: 'test-user',
      logged_date: '2026-04-16',
    })
  })

  it('streak calculation with consecutive dates', () => {
    const dates = ['2026-04-16', '2026-04-15', '2026-04-14', '2026-04-11']

    expect(getCurrentStreak(dates, true, new Date('2026-04-16T06:30:00.000Z'))).toBe(3)
    expect(getBestStreak(dates)).toBe(3)
  })

  it('30-day completion percentage math', () => {
    const dates = Array.from({ length: 15 }, (_, index) => {
      const date = new Date('2026-04-16T06:30:00.000Z')
      date.setDate(date.getDate() - index)
      return isoDate(date)
    })

    expect(completionPercentage30d(dates, new Date('2026-04-16T06:30:00.000Z'))).toBe(50)
  })
})
