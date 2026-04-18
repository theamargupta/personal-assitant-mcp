/**
 * TDD: get_review should return a rich visual dashboard alongside text data.
 *
 * Expected: text content with all 5 module summaries + highlights,
 * data structured for rendering progress rings, charts, and stats.
 * Image/widget content added later.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock all dependencies
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => mockClient),
}))

vi.mock('@/lib/goals/goals', () => ({
  createGoal: vi.fn(),
  listGoals: vi.fn().mockResolvedValue([
    { id: 'g-1', title: 'Save ₹1L', goal_type: 'outcome', status: 'active', target_value: 100000, start_date: '2026-04-01', end_date: '2026-04-30' },
    { id: 'g-2', title: 'Ship MVP', goal_type: 'milestone', status: 'completed', target_value: null, start_date: '2026-04-01', end_date: '2026-04-30' },
  ]),
  updateGoal: vi.fn(),
  addMilestone: vi.fn(),
  toggleMilestone: vi.fn(),
  computeGoalProgress: vi.fn().mockImplementation((_userId: string, goalId: string) => {
    if (goalId === 'g-1') return Promise.resolve({ currentValue: 65000, targetValue: 100000, progressPct: 65 })
    return Promise.resolve({ currentValue: 5, targetValue: 5, progressPct: 100 })
  }),
}))

vi.mock('@/lib/goals/review', () => ({
  generateReview: vi.fn().mockResolvedValue({
    period: { start: '2026-04-01', end: '2026-04-30', label: 'April 2026' },
    habits: {
      total_tracked: 3,
      avg_completion_pct: 72.3,
      streaks: [
        { name: 'Workout', current_streak: 21, completion_pct: 70 },
        { name: 'Reading', current_streak: 18, completion_pct: 60 },
        { name: 'Meditation', current_streak: 9, completion_pct: 87 },
      ],
    },
    tasks: { completed: 12, pending: 3, overdue: 1, total_created: 16 },
    finance: {
      total_spent: 32450,
      breakdown: [
        { category: 'Food', icon: '🍕', amount: 8200, count: 12 },
        { category: 'Transport', icon: '🚗', amount: 4100, count: 8 },
      ],
    },
    goals: {
      active: 1, completed: 1, failed: 0,
      details: [
        { title: 'Save ₹1L', goal_type: 'outcome', progress_pct: 65, status: 'active', current_value: 65000, target_value: 100000 },
        { title: 'Ship MVP', goal_type: 'milestone', progress_pct: 100, status: 'completed', current_value: 5, target_value: 5 },
      ],
    },
    highlights: {
      best_habit: { name: 'Workout', streak: 21 },
      worst_habit: { name: 'Reading', completion_pct: 60 },
      top_spending_category: { name: 'Food', icon: '🍕', amount: 8200 },
      biggest_single_spend: { amount: 5000, merchant: 'Croma', date: '15/04/2026' },
      goals_hit: 1,
      goals_missed: 0,
      tasks_completed: 12,
      tasks_pending: 3,
    },
  }),
}))

const methods = ['select', 'insert', 'update', 'delete', 'eq', 'neq', 'gte', 'lte', 'order', 'limit', 'range', 'single', 'maybeSingle', 'head', 'is', 'lt', 'contains']
function createChain(val: unknown = { data: null, error: null, count: 0 }) {
  const c: Record<string, unknown> = {}
  for (const m of methods) c[m] = vi.fn().mockReturnValue(c)
  c.single = vi.fn().mockResolvedValue(val)
  c.maybeSingle = vi.fn().mockResolvedValue(val)
  c.then = (resolve: (v: unknown) => void) => { resolve(val) }
  return c
}

const mockClient = {
  from: vi.fn().mockReturnValue(createChain()),
  rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
}

const registeredTools: Record<string, { handler: (...args: unknown[]) => unknown }> = {}

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: class {
    tool(name: string, _desc: string, _schema: unknown, handler: (...args: unknown[]) => unknown) {
      registeredTools[name] = { handler }
    }
  },
}))

import { registerGoalTools } from '@/lib/mcp/tools/goals'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

const server = new McpServer({ name: 'test', version: '0.0.0' })
registerGoalTools(server)

const authInfo = { extra: { userId: 'user-1' } }

describe('get_review — dashboard visual output', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('should return comprehensive review with all 5 modules', async () => {
    const result = await registeredTools['get_review'].handler(
      { start_date: '2026-04-01', end_date: '2026-04-30', label: 'April 2026' },
      { authInfo }
    )

    const textContent = result.content.find((c: { type: string }) => c.type === 'text')
    expect(textContent).toBeDefined()

    const parsed = JSON.parse(textContent.text)

    // All 5 modules present
    expect(parsed).toHaveProperty('habits')
    expect(parsed).toHaveProperty('tasks')
    expect(parsed).toHaveProperty('finance')
    expect(parsed).toHaveProperty('goals')
    expect(parsed).toHaveProperty('highlights')
    expect(parsed).toHaveProperty('period')
  })

  it('should include habit streaks data suitable for progress rings', async () => {
    const result = await registeredTools['get_review'].handler(
      { start_date: '2026-04-01', end_date: '2026-04-30', label: 'April 2026' },
      { authInfo }
    )

    const parsed = JSON.parse(result.content[0].text)

    // Progress ring needs: name, streak count, completion percentage
    expect(parsed.habits.streaks).toBeInstanceOf(Array)
    parsed.habits.streaks.forEach((h: { name: string; current_streak: number; completion_pct: number }) => {
      expect(h).toHaveProperty('name')
      expect(h).toHaveProperty('current_streak')
      expect(h).toHaveProperty('completion_pct')
      expect(typeof h.current_streak).toBe('number')
      expect(typeof h.completion_pct).toBe('number')
    })
  })

  it('should include goal progress data suitable for progress rings', async () => {
    const result = await registeredTools['get_review'].handler(
      { start_date: '2026-04-01', end_date: '2026-04-30', label: 'April 2026' },
      { authInfo }
    )

    const parsed = JSON.parse(result.content[0].text)

    expect(parsed.goals.details).toBeInstanceOf(Array)
    parsed.goals.details.forEach((g: { title: string; progress_pct: number; goal_type: string }) => {
      expect(g).toHaveProperty('title')
      expect(g).toHaveProperty('progress_pct')
      expect(g).toHaveProperty('goal_type')
      expect(g.progress_pct).toBeGreaterThanOrEqual(0)
      expect(g.progress_pct).toBeLessThanOrEqual(100)
    })
  })

  it('should include spending breakdown suitable for chart', async () => {
    const result = await registeredTools['get_review'].handler(
      { start_date: '2026-04-01', end_date: '2026-04-30', label: 'April 2026' },
      { authInfo }
    )

    const parsed = JSON.parse(result.content[0].text)

    expect(parsed.finance.total_spent).toBe(32450)
    expect(parsed.finance.breakdown).toBeInstanceOf(Array)
    parsed.finance.breakdown.forEach((b: { category: string; amount: number }) => {
      expect(b).toHaveProperty('category')
      expect(b).toHaveProperty('amount')
    })
  })

  it('should include highlights for key callouts', async () => {
    const result = await registeredTools['get_review'].handler(
      { start_date: '2026-04-01', end_date: '2026-04-30', label: 'April 2026' },
      { authInfo }
    )

    const parsed = JSON.parse(result.content[0].text)

    expect(parsed.highlights.best_habit).toEqual({ name: 'Workout', streak: 21 })
    expect(parsed.highlights.top_spending_category.name).toBe('Food')
    expect(parsed.highlights.biggest_single_spend.merchant).toBe('Croma')
    expect(parsed.highlights.tasks_completed).toBe(12)
    expect(parsed.highlights.goals_hit).toBe(1)
  })
})
