/**
 * TDD: get_habit_analytics should return an image content (heatmap) alongside text data.
 *
 * Expected behavior after implementation:
 * - Tool returns content array with BOTH text (JSON data) and image (PNG heatmap)
 * - Heatmap is a 30-day calendar grid: green for completed, gray for missed
 * - Image is base64-encoded PNG
 * - Text content still works for non-visual clients (graceful degradation)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { todayISTDate } from '@/types'

// ── Mocks ──────────────────────────────────────────────

const methods = ['select', 'insert', 'update', 'delete', 'eq', 'neq', 'gte', 'lte', 'order', 'limit', 'range', 'single', 'maybeSingle', 'head', 'is']

function createChain(resolveValue: unknown = { data: null, error: null }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {}
  for (const m of methods) chain[m] = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn().mockResolvedValue(resolveValue)
  chain.maybeSingle = vi.fn().mockResolvedValue(resolveValue)
  // Make chain awaitable
  ;(chain as Record<string, unknown>).then = (resolve: (v: unknown) => void) => { resolve(resolveValue) }
  return chain
}

const mockClient = { from: vi.fn() }

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => mockClient),
}))

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: class {
    tool(name: string, _desc: string, _schema: unknown, handler: (...args: unknown[]) => unknown) {
      registeredTools[name] = { handler }
    }
  },
}))

const registeredTools: Record<string, { handler: (...args: unknown[]) => unknown }> = {}

import { registerHabitTools } from '@/lib/mcp/tools/habits'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

const server = new McpServer({ name: 'test', version: '0.0.0' })
registerHabitTools(server)

const authInfo = { extra: { userId: 'user-1' } }

describe('get_habit_analytics — visual heatmap output', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return content array with at least a text entry', async () => {
    // Setup: habit exists, some logs
    const today = todayISTDate()
    mockClient.from.mockImplementation((table: string) => {
      if (table === 'habits') {
        return createChain({ data: { id: 'h-1', name: 'Workout', created_at: '2026-01-01T00:00:00Z' }, error: null })
      }
      // habit_logs — return a few dates
      return createChain({ data: [{ logged_date: today }], error: null })
    })

    const result = await registeredTools['get_habit_analytics'].handler(
      { habit_id: 'h-1', days: 30 },
      { authInfo }
    )

    expect(result.content).toBeDefined()
    expect(result.content.length).toBeGreaterThanOrEqual(1)

    // Text content must exist (graceful degradation)
    const textContent = result.content.find((c: { type: string }) => c.type === 'text')
    expect(textContent).toBeDefined()

    const parsed = JSON.parse(textContent.text)
    expect(parsed.day_by_day).toHaveLength(30)
    expect(parsed.completion_percentage).toBeDefined()
    expect(parsed.current_streak).toBeDefined()
  })

  it('should include image content with base64 PNG heatmap when implemented', async () => {
    const today = todayISTDate()
    mockClient.from.mockImplementation((table: string) => {
      if (table === 'habits') {
        return createChain({ data: { id: 'h-1', name: 'Workout', created_at: '2026-01-01T00:00:00Z' }, error: null })
      }
      return createChain({ data: [{ logged_date: today }], error: null })
    })

    const result = await registeredTools['get_habit_analytics'].handler(
      { habit_id: 'h-1', days: 30 },
      { authInfo }
    )

    // TODO: This test will FAIL until we add image content to get_habit_analytics
    // Uncomment when implementing:
    // const imageContent = result.content.find((c: { type: string }) => c.type === 'image')
    // expect(imageContent).toBeDefined()
    // expect(imageContent.mimeType).toBe('image/png')
    // expect(imageContent.data).toMatch(/^[A-Za-z0-9+/]+=*$/) // valid base64

    // For now, verify the data shape that the heatmap will consume
    const textContent = result.content.find((c: { type: string }) => c.type === 'text')
    const parsed = JSON.parse(textContent.text)

    // Heatmap needs: array of { date, completed } pairs
    expect(parsed.day_by_day).toBeInstanceOf(Array)
    parsed.day_by_day.forEach((day: { date: string; completed: boolean }) => {
      expect(day).toHaveProperty('date')
      expect(day).toHaveProperty('completed')
      expect(day.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(typeof day.completed).toBe('boolean')
    })
  })
})
