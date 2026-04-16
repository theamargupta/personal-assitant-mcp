import { describe, it, expect, vi, beforeEach } from 'vitest'

// Set up multi-call mock infrastructure for habit tool handlers
function createChain(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {}
  const methods = ['select', 'insert', 'update', 'delete', 'eq', 'neq', 'gte', 'lte', 'order', 'limit', 'range', 'single', 'maybeSingle', 'head', 'is']
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain)
  }
  chain.single = vi.fn().mockResolvedValue({ data: null, error: null })
  chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
  for (const [k, v] of Object.entries(overrides)) {
    chain[k] = vi.fn().mockReturnValue(v)
  }
  return chain
}

const mockClient = { from: vi.fn() }

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => mockClient),
}))

const registeredTools: Record<string, { handler: Function }> = {}

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: class {
    tool(name: string, _desc: string, _schema: unknown, handler: Function) {
      registeredTools[name] = { handler }
    }
  },
}))

import { registerHabitTools } from '@/lib/mcp/tools/habits'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

const server = new McpServer({ name: 'test', version: '0.0.0' })
registerHabitTools(server)

const authInfo = { extra: { userId: 'user-1' } }

describe('log_habit_completion (success flow)', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('logs completion and returns streak', async () => {
    let callNum = 0
    mockClient.from.mockImplementation((table: string) => {
      callNum++
      if (callNum === 1) {
        // habits lookup
        const c = createChain()
        c.single = vi.fn().mockResolvedValue({ data: { id: 'h-1' }, error: null })
        return c
      }
      if (callNum === 2) {
        // habit_logs insert
        const c = createChain()
        ;(c as Record<string, unknown>)['then'] = (r: (v: unknown) => void) => r({ error: null })
        return c
      }
      // calculateCurrentStreak and completionPercentage calls
      const c = createChain()
      if (table === 'habit_logs') {
        ;(c as Record<string, unknown>)['then'] = (r: (v: unknown) => void) => r({ data: [], count: 0 })
      }
      return c
    })

    const result = await registeredTools['log_habit_completion'].handler(
      { habit_id: 'h-1', date: '2025-01-15', notes: 'Great workout' },
      { authInfo }
    )

    const parsed = JSON.parse(result.content[0].text)
    expect(parsed.date).toBe('2025-01-15')
    expect(parsed.new_streak).toBeDefined()
    expect(parsed.completion_percentage_30d).toBeDefined()
  })
})

describe('get_habit_streak (success flow)', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns full streak info', async () => {
    let callNum = 0
    mockClient.from.mockImplementation(() => {
      callNum++
      if (callNum === 1) {
        // habit name lookup
        const c = createChain()
        c.single = vi.fn().mockResolvedValue({ data: { name: 'Workout' }, error: null })
        return c
      }
      // All subsequent calls are habit_logs queries
      const c = createChain()
      c.maybeSingle = vi.fn().mockResolvedValue({ data: { logged_date: '2025-01-15' }, error: null })
      ;(c as Record<string, unknown>)['then'] = (r: (v: unknown) => void) => r({
        data: [{ logged_date: '2025-01-15' }, { logged_date: '2025-01-14' }]
      })
      return c
    })

    const result = await registeredTools['get_habit_streak'].handler(
      { habit_id: 'h-1' },
      { authInfo }
    )

    const parsed = JSON.parse(result.content[0].text)
    expect(parsed.name).toBe('Workout')
    expect(typeof parsed.current_streak).toBe('number')
    expect(typeof parsed.best_streak).toBe('number')
  })
})

describe('get_habit_analytics (success flow)', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns analytics with day-by-day breakdown', async () => {
    let callNum = 0
    mockClient.from.mockImplementation(() => {
      callNum++
      if (callNum === 1) {
        // habit lookup
        const c = createChain()
        c.single = vi.fn().mockResolvedValue({
          data: { name: 'Workout', created_at: '2025-01-01T00:00:00Z' },
          error: null,
        })
        return c
      }
      // habit_logs queries (analytics, current streak, best streak)
      const c = createChain()
      ;(c as Record<string, unknown>)['then'] = (r: (v: unknown) => void) => r({
        data: [{ logged_date: '2025-01-10' }, { logged_date: '2025-01-11' }],
        count: 2,
      })
      return c
    })

    const result = await registeredTools['get_habit_analytics'].handler(
      { habit_id: 'h-1', days: 30 },
      { authInfo }
    )

    const parsed = JSON.parse(result.content[0].text)
    expect(parsed.name).toBe('Workout')
    expect(parsed.period_days).toBe(30)
    expect(typeof parsed.completion_percentage).toBe('number')
    expect(parsed.day_by_day).toBeDefined()
    expect(Array.isArray(parsed.day_by_day)).toBe(true)
  })
})
