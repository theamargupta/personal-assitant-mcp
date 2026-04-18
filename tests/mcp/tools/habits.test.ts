import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { todayISTDate } from '@/types'

type QueryResult = {
  data?: any
  error?: { message: string; code?: string } | null
  count?: number | null
}

type QueryChain = Record<string, ReturnType<typeof vi.fn>> & {
  then: (resolve: (value: QueryResult) => unknown, reject?: (reason: unknown) => unknown) => Promise<unknown>
}

const mocks = vi.hoisted(() => ({
  queues: new Map<string, any[]>(),
  defaultResult: { data: null, error: null } as QueryResult,
  mockClient: {
    from: vi.fn(),
  },
  registeredTools: {} as Record<string, { schema: unknown; handler: Function }>,
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => mocks.mockClient),
}))

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: class {
    tool(name: string, _desc: string, schema: unknown, handler: Function) {
      mocks.registeredTools[name] = { schema, handler }
    }
  },
}))

import { registerHabitTools } from '@/lib/mcp/tools/habits'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

const server = new McpServer({ name: 'test', version: '0.0.0' })
registerHabitTools(server)

const authInfo = { extra: { userId: 'user-1' } }
const noAuth = { extra: {} }
const queryMethods = [
  'select', 'insert', 'update', 'delete', 'eq', 'neq', 'gte', 'lte', 'order',
  'limit', 'range', 'single', 'maybeSingle', 'head', 'is',
]

function createQuery(result: QueryResult = { data: null, error: null }): QueryChain {
  const chain = {} as QueryChain
  for (const method of queryMethods) {
    chain[method] = vi.fn().mockReturnValue(chain)
  }
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
    return createQuery(mocks.defaultResult)
  })
}

function parseToolResult(result: { content: Array<{ text: string }> }) {
  return JSON.parse(result.content[0].text)
}

function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}

function logRows(dates: string[]) {
  return dates.map((logged_date) => ({ logged_date }))
}

function queueHabitLookup(data: QueryResult['data'] = { id: 'h-1', name: 'Workout', created_at: '2026-01-01T00:00:00.000Z' }) {
  queue('habits', createQuery({ data, error: data ? null : { message: 'not found' } }))
}

function queueStreakQueries(datesDesc: string[]) {
  queue(
    'habit_logs',
    createQuery({ data: logRows(datesDesc), error: null }),
    createQuery({ data: logRows([...datesDesc].sort()), error: null }),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-04-16T03:00:00.000Z'))
  mocks.queues = new Map()
  setupFromQueues()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('create_habit', () => {
  it('throws when unauthorized', async () => {
    await expect(mocks.registeredTools['create_habit'].handler(
      { name: 'Test', frequency: 'daily', color: '#3b82f6' },
      { authInfo: noAuth }
    )).rejects.toThrow('Unauthorized')
  })

  it('creates habit with trimmed fields and returned values', async () => {
    const insertChain = createQuery({
      data: { id: 'h-1', name: 'Workout', created_at: '2026-04-01T06:30:00.000Z' },
      error: null,
    })
    queue('habits', insertChain)

    const result = await mocks.registeredTools['create_habit'].handler(
      { name: ' Workout ', frequency: 'daily', description: ' Move ', color: '#3b82f6', reminder_time: '07:30' },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(insertChain.insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      name: 'Workout',
      frequency: 'daily',
      description: 'Move',
      color: '#3b82f6',
      reminder_time: '07:30',
    })
    expect(parsed).toEqual(expect.objectContaining({
      habit_id: 'h-1',
      name: 'Workout',
      streak: 0,
      last_logged: null,
    }))
  })

  it('returns DB error text when insert fails', async () => {
    queue('habits', createQuery({ data: null, error: { message: 'Insert failed' } }))

    const result = await mocks.registeredTools['create_habit'].handler(
      { name: 'Test', frequency: 'daily', color: '#3b82f6' },
      { authInfo }
    )

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: Insert failed')
  })
})

describe('log_habit_completion', () => {
  it('throws when unauthorized', async () => {
    await expect(mocks.registeredTools['log_habit_completion'].handler(
      { habit_id: 'h-1' },
      { authInfo: noAuth }
    )).rejects.toThrow('Unauthorized')
  })

  it('returns error when habit not found', async () => {
    queueHabitLookup(null)

    const result = await mocks.registeredTools['log_habit_completion'].handler(
      { habit_id: 'h-bad' },
      { authInfo }
    )

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: Habit not found')
  })

  it('detects duplicate gracefully', async () => {
    queueHabitLookup({ id: 'h-1' })
    queue('habit_logs', createQuery({ data: null, error: { message: 'duplicate key value violates unique constraint', code: '23505' } }))

    const result = await mocks.registeredTools['log_habit_completion'].handler(
      { habit_id: 'h-1', date: '2026-04-15' },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(parsed).toEqual({ message: 'Already logged for this date', date: '2026-04-15' })
  })

  it('uses IST date when no date provided', async () => {
    vi.setSystemTime(new Date('2026-04-15T19:00:00.000Z'))
    const today = todayISTDate()
    const insertChain = createQuery({ data: null, error: null })

    queueHabitLookup({ id: 'h-1' })
    queue('habit_logs', insertChain)
    queue('habit_logs', createQuery({ data: logRows([today]), error: null }))
    queue('habit_logs', createQuery({ count: 1, data: null, error: null }))

    const result = await mocks.registeredTools['log_habit_completion'].handler(
      { habit_id: 'h-1', notes: ' done ' },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(today).toBe('2026-04-16')
    expect(insertChain.insert).toHaveBeenCalledWith({
      habit_id: 'h-1',
      user_id: 'user-1',
      logged_date: '2026-04-16',
      notes: 'done',
    })
    expect(parsed.date).toBe('2026-04-16')
    expect(parsed.new_streak).toBe(1)
    expect(parsed.completion_percentage_30d).toBe(3.3)
  })
})

describe('get_habit_streak', () => {
  it('throws when unauthorized', async () => {
    await expect(mocks.registeredTools['get_habit_streak'].handler(
      { habit_id: 'h-1' },
      { authInfo: noAuth }
    )).rejects.toThrow('Unauthorized')
  })

  it('returns error when habit not found', async () => {
    queue('habits', createQuery({ data: null, error: { message: 'not found' } }))

    const result = await mocks.registeredTools['get_habit_streak'].handler(
      { habit_id: 'h-bad' },
      { authInfo }
    )

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: Habit not found')
  })

  it.each([
    ['today, yesterday, day-before', () => [todayISTDate(), addDays(todayISTDate(), -1), addDays(todayISTDate(), -2)], 3],
    ['yesterday, day-before', () => [addDays(todayISTDate(), -1), addDays(todayISTDate(), -2)], 2],
    ['three days ago and two days ago', () => [addDays(todayISTDate(), -2), addDays(todayISTDate(), -3)], 0],
    ['no logs', () => [], 0],
  ])('calculateCurrentStreak counts consecutive days correctly for %s', async (_caseName, makeDates, expectedStreak) => {
    const dates = makeDates()
    queue('habits', createQuery({ data: { name: 'Workout' }, error: null }))
    queueStreakQueries(dates)
    queue('habit_logs', createQuery({ data: dates[0] ? { logged_date: dates[0] } : null, error: null }))

    const result = await mocks.registeredTools['get_habit_streak'].handler(
      { habit_id: 'h-1' },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(parsed.current_streak).toBe(expectedStreak)
    expect(parsed.last_logged_date).toBe(dates[0] ?? null)
    expect(parsed.is_active_today).toBe(dates[0] === todayISTDate())
  })

  it('calculateBestStreak finds longest run across gaps', async () => {
    const today = todayISTDate()
    const datesDesc = [
      today,
      addDays(today, -1),
      addDays(today, -4),
      addDays(today, -5),
      addDays(today, -6),
      addDays(today, -9),
    ]
    queue('habits', createQuery({ data: { name: 'Reading' }, error: null }))
    queueStreakQueries(datesDesc)
    queue('habit_logs', createQuery({ data: { logged_date: today }, error: null }))

    const result = await mocks.registeredTools['get_habit_streak'].handler(
      { habit_id: 'h-1' },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(parsed.current_streak).toBe(2)
    expect(parsed.best_streak).toBe(3)
  })
})

describe('get_habit_analytics', () => {
  it('throws when unauthorized', async () => {
    await expect(mocks.registeredTools['get_habit_analytics'].handler(
      { habit_id: 'h-1', days: 30 },
      { authInfo: noAuth }
    )).rejects.toThrow('Unauthorized')
  })

  it('returns error when habit not found', async () => {
    queue('habits', createQuery({ data: null, error: { message: 'not found' } }))

    const result = await mocks.registeredTools['get_habit_analytics'].handler(
      { habit_id: 'h-bad', days: 30 },
      { authInfo }
    )

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: Habit not found')
  })

  it('includes today in day_by_day array', async () => {
    const today = todayISTDate()
    const datesDesc = [today, addDays(today, -1), addDays(today, -4)]
    queue('habits', createQuery({ data: { name: 'Workout', created_at: '2026-01-01T00:00:00.000Z' }, error: null }))
    queue('habit_logs', createQuery({ data: logRows([...datesDesc].sort()), error: null }))
    queueStreakQueries(datesDesc)

    const result = await mocks.registeredTools['get_habit_analytics'].handler(
      { habit_id: 'h-1', days: 30 },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(parsed.day_by_day).toHaveLength(30)
    expect(parsed.day_by_day[0].date).toBe(addDays(today, -29))
    expect(parsed.day_by_day[29].date).toBe(today)
    expect(parsed.day_by_day[29]).toEqual({ date: today, completed: true })
  })

  it('day_by_day range spans exactly N days', async () => {
    const today = todayISTDate()
    queue('habits', createQuery({ data: { name: 'Workout', created_at: '2026-01-01T00:00:00.000Z' }, error: null }))
    queue('habit_logs', createQuery({ data: logRows([today]), error: null }))
    queueStreakQueries([today])

    const result = await mocks.registeredTools['get_habit_analytics'].handler(
      { habit_id: 'h-1', days: 7 },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(parsed.period_days).toBe(7)
    expect(parsed.day_by_day).toHaveLength(7)
    expect(parsed.day_by_day[0].date).toBe(addDays(today, -6))
    expect(parsed.day_by_day[6].date).toBe(today)
  })

  it('completionPercentage calculates correctly from distinct log dates', async () => {
    const today = todayISTDate()
    const dates = Array.from({ length: 15 }, (_, index) => addDays(today, -index))
    queue('habits', createQuery({ data: { name: 'Workout', created_at: '2026-01-01T00:00:00.000Z' }, error: null }))
    queue('habit_logs', createQuery({ data: logRows([...dates].sort()), error: null }))
    queueStreakQueries(dates)

    const result = await mocks.registeredTools['get_habit_analytics'].handler(
      { habit_id: 'h-1', days: 30 },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(parsed.total_completions).toBe(15)
    expect(parsed.completion_percentage).toBe(50)
  })
})

describe('update_habit', () => {
  it('throws when unauthorized', async () => {
    await expect(mocks.registeredTools['update_habit'].handler(
      { habit_id: 'h-1', name: 'New Name' },
      { authInfo: noAuth }
    )).rejects.toThrow('Unauthorized')
  })

  it('returns error when no fields to update', async () => {
    const result = await mocks.registeredTools['update_habit'].handler(
      { habit_id: 'h-1' },
      { authInfo }
    )

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: No fields to update')
  })

  it('updates habit fields and returns persisted values', async () => {
    const updateChain = createQuery({
      data: { id: 'h-1', name: 'Updated', archived: true, updated_at: '2026-04-16T06:30:00.000Z' },
      error: null,
    })
    queue('habits', updateChain)

    const result = await mocks.registeredTools['update_habit'].handler(
      { habit_id: 'h-1', name: ' Updated ', description: ' ', archived: true },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(updateChain.update).toHaveBeenCalledWith({
      name: 'Updated',
      description: null,
      archived: true,
    })
    expect(parsed.habit_id).toBe('h-1')
    expect(parsed.name).toBe('Updated')
    expect(parsed.archived).toBe(true)
  })

  it('updates reminder_time and clears it when null', async () => {
    const setChain = createQuery({
      data: { id: 'h-1', name: 'Upwork Proposals', archived: false, updated_at: '2026-04-18T12:00:00.000Z' },
      error: null,
    })
    queue('habits', setChain)

    await mocks.registeredTools['update_habit'].handler(
      { habit_id: 'h-1', reminder_time: '18:00' },
      { authInfo }
    )

    expect(setChain.update).toHaveBeenCalledWith({ reminder_time: '18:00' })

    const clearChain = createQuery({
      data: { id: 'h-1', name: 'Upwork Proposals', archived: false, updated_at: '2026-04-18T12:01:00.000Z' },
      error: null,
    })
    queue('habits', clearChain)

    await mocks.registeredTools['update_habit'].handler(
      { habit_id: 'h-1', reminder_time: null },
      { authInfo }
    )

    expect(clearChain.update).toHaveBeenCalledWith({ reminder_time: null })
  })
})

describe('get_habit', () => {
  it('throws when unauthorized', async () => {
    await expect(mocks.registeredTools['get_habit'].handler(
      { habit_id: 'h-1' },
      { authInfo: noAuth }
    )).rejects.toThrow('Unauthorized')
  })

  it('returns error when habit not found', async () => {
    queue('habits', createQuery({ data: null, error: { message: 'not found' } }))

    const result = await mocks.registeredTools['get_habit'].handler(
      { habit_id: 'h-bad' },
      { authInfo }
    )

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: Habit not found')
  })

  it('returns habit with streaks and last logged date', async () => {
    const today = todayISTDate()
    queue('habits', createQuery({
      data: {
        id: 'h-1',
        name: 'Workout',
        frequency: 'daily',
        description: null,
        color: '#3b82f6',
        reminder_time: '07:00',
        archived: false,
        created_at: '2026-04-10T06:30:00.000Z',
        updated_at: '2026-04-15T06:30:00.000Z',
      },
      error: null,
    }))
    queue('habit_logs', createQuery({ data: [{ logged_date: today }, { logged_date: addDays(today, -1) }], error: null }))
    queue('habit_logs', createQuery({ data: [{ logged_date: addDays(today, -1) }, { logged_date: today }], error: null }))
    queue('habit_logs', createQuery({ data: { logged_date: today }, error: null }))

    const result = await mocks.registeredTools['get_habit'].handler(
      { habit_id: 'h-1' },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(parsed.habit_id).toBe('h-1')
    expect(parsed.name).toBe('Workout')
    expect(parsed.reminder_time).toBe('07:00')
    expect(parsed.current_streak).toBe(2)
    expect(parsed.best_streak).toBe(2)
    expect(parsed.last_logged_date).toBe(today)
  })
})

describe('delete_habit', () => {
  it('throws when unauthorized', async () => {
    await expect(mocks.registeredTools['delete_habit'].handler(
      { habit_id: 'h-1' },
      { authInfo: noAuth }
    )).rejects.toThrow('Unauthorized')
  })

  it('returns error when habit not found', async () => {
    queue('habits', createQuery({ data: null, error: { message: 'not found' } }))

    const result = await mocks.registeredTools['delete_habit'].handler(
      { habit_id: 'h-bad' },
      { authInfo }
    )

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: Habit not found')
  })

  it('deletes habit and reports cascaded log count', async () => {
    queue('habits', createQuery({ data: { id: 'h-1', name: 'Workout' }, error: null }))
    queue('habit_logs', createQuery({ count: 7, data: null, error: null }))
    const delChain = createQuery({ error: null })
    queue('habits', delChain)

    const result = await mocks.registeredTools['delete_habit'].handler(
      { habit_id: 'h-1' },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(delChain.delete).toHaveBeenCalled()
    expect(parsed).toEqual({
      deleted: true,
      habit_id: 'h-1',
      name: 'Workout',
      cascaded_logs: 7,
      message: 'Habit permanently deleted',
    })
  })

  it('returns tool error when delete fails', async () => {
    queue('habits', createQuery({ data: { id: 'h-1', name: 'Workout' }, error: null }))
    queue('habit_logs', createQuery({ count: 0, data: null, error: null }))
    queue('habits', createQuery({ error: { message: 'FK violation' } }))

    const result = await mocks.registeredTools['delete_habit'].handler(
      { habit_id: 'h-1' },
      { authInfo }
    )

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: FK violation')
  })
})

describe('update_habit_log', () => {
  it('throws when unauthorized', async () => {
    await expect(mocks.registeredTools['update_habit_log'].handler(
      { log_id: 'log-1', notes: 'x' },
      { authInfo: noAuth }
    )).rejects.toThrow('Unauthorized')
  })

  it('returns error when log not found', async () => {
    queue('habit_logs', createQuery({ data: null, error: { message: 'not found' } }))

    const result = await mocks.registeredTools['update_habit_log'].handler(
      { log_id: 'log-bad', notes: 'x' },
      { authInfo }
    )

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: Habit log not found')
  })

  it('returns error when no fields provided', async () => {
    queue('habit_logs', createQuery({ data: { id: 'log-1', habit_id: 'h-1', logged_date: '2026-04-15' }, error: null }))

    const result = await mocks.registeredTools['update_habit_log'].handler(
      { log_id: 'log-1' },
      { authInfo }
    )

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: No fields to update')
  })

  it('updates date and notes', async () => {
    queue('habit_logs', createQuery({ data: { id: 'log-1', habit_id: 'h-1', logged_date: '2026-04-15' }, error: null }))
    const updChain = createQuery({
      data: { id: 'log-1', habit_id: 'h-1', logged_date: '2026-04-16', notes: 'Updated' },
      error: null,
    })
    queue('habit_logs', updChain)
    queue('habit_logs', createQuery({ data: [], error: null }))

    const result = await mocks.registeredTools['update_habit_log'].handler(
      { log_id: 'log-1', logged_date: '2026-04-16', notes: 'Updated' },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(updChain.update).toHaveBeenCalledWith({ logged_date: '2026-04-16', notes: 'Updated' })
    expect(parsed.logged_date).toBe('2026-04-16')
    expect(parsed.notes).toBe('Updated')
  })

  it('detects date collision via unique constraint', async () => {
    queue('habit_logs', createQuery({ data: { id: 'log-1', habit_id: 'h-1', logged_date: '2026-04-15' }, error: null }))
    queue('habit_logs', createQuery({ data: null, error: { message: 'duplicate key', code: '23505' } }))

    const result = await mocks.registeredTools['update_habit_log'].handler(
      { log_id: 'log-1', logged_date: '2026-04-14' },
      { authInfo }
    )

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: Already logged for 2026-04-14')
  })
})

describe('delete_habit_log', () => {
  it('throws when unauthorized', async () => {
    await expect(mocks.registeredTools['delete_habit_log'].handler(
      { log_id: 'log-1' },
      { authInfo: noAuth }
    )).rejects.toThrow('Unauthorized')
  })

  it('requires log_id or (habit_id + date)', async () => {
    const result = await mocks.registeredTools['delete_habit_log'].handler(
      {},
      { authInfo }
    )

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: Pass log_id or (habit_id + date)')
  })

  it('deletes by log_id and returns new streak', async () => {
    queue('habit_logs', createQuery({ data: { id: 'log-1', habit_id: 'h-1', logged_date: '2026-04-15' }, error: null }))
    const delChain = createQuery({ error: null })
    queue('habit_logs', delChain)
    queue('habit_logs', createQuery({ data: [], error: null }))

    const result = await mocks.registeredTools['delete_habit_log'].handler(
      { log_id: 'log-1' },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(delChain.delete).toHaveBeenCalled()
    expect(parsed.deleted).toBe(true)
    expect(parsed.log_id).toBe('log-1')
    expect(parsed.logged_date).toBe('2026-04-15')
    expect(parsed.current_streak).toBe(0)
  })

  it('deletes by habit_id + date', async () => {
    queue('habit_logs', createQuery({ data: { id: 'log-2', habit_id: 'h-1', logged_date: '2026-04-15' }, error: null }))
    queue('habit_logs', createQuery({ error: null }))
    queue('habit_logs', createQuery({ data: [], error: null }))

    const result = await mocks.registeredTools['delete_habit_log'].handler(
      { habit_id: 'h-1', date: '2026-04-15' },
      { authInfo }
    )

    const parsed = parseToolResult(result)
    expect(parsed.deleted).toBe(true)
    expect(parsed.log_id).toBe('log-2')
  })

  it('returns error when log not found', async () => {
    queue('habit_logs', createQuery({ data: null, error: { message: 'not found' } }))

    const result = await mocks.registeredTools['delete_habit_log'].handler(
      { log_id: 'log-bad' },
      { authInfo }
    )

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: Habit log not found')
  })
})
