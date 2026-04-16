import { describe, expect, it, vi, beforeEach } from 'vitest'
import { todayISTDate } from '@/types'

const methods = ['select', 'insert', 'update', 'delete', 'eq', 'gte', 'order', 'limit', 'single', 'maybeSingle']

function createChain(resolveValue: unknown = { data: null, error: null }) {
  const chain: Record<string, unknown> = {}
  for (const method of methods) chain[method] = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn().mockResolvedValue(resolveValue)
  chain.maybeSingle = vi.fn().mockResolvedValue(resolveValue)
  chain.then = (resolve: (value: unknown) => void) => { resolve(resolveValue) }
  return chain
}

const mockClient = { from: vi.fn() }

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => mockClient),
}))

vi.mock('@/lib/finance/transactions', () => ({
  createTransaction: vi.fn(),
  listTransactions: vi.fn(),
  updateTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
  getSpendingSummary: vi.fn().mockResolvedValue({
    total_spent: 3000,
    breakdown: [
      { category_name: 'Food', category_icon: 'F', total_amount: 2000, transaction_count: 2 },
      { category_name: 'Transport', category_icon: 'T', total_amount: 1000, transaction_count: 1 },
    ],
  }),
}))

vi.mock('@/lib/finance/categories', () => ({
  ensurePresetCategories: vi.fn(),
}))

const registeredTools: Record<string, { handler: Function }> = {}

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: class {
    tool(name: string, _description: string, _schema: unknown, handler: Function) {
      registeredTools[name] = { handler }
    }

    registerTool(name: string, _config: unknown, handler: Function) {
      registeredTools[name] = { handler }
    }
  },
}))

import { registerHabitTools } from '@/lib/mcp/tools/habits'
import { registerFinanceTools } from '@/lib/mcp/tools/finance'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

const server = new McpServer({ name: 'test', version: '0.0.0' })
registerHabitTools(server)
registerFinanceTools(server)

const authInfo = { extra: { userId: 'user-1' } }

function expectSvgImage(result: { content: Array<{ type: string; data?: string; mimeType?: string }> }) {
  const imageContent = result.content.find(content => content.type === 'image')
  expect(imageContent).toBeDefined()
  expect(imageContent?.mimeType).toBe('image/svg+xml')

  const decoded = Buffer.from(imageContent?.data || '', 'base64').toString('utf8')
  expect(decoded).toContain('<svg')
  expect(decoded).toContain('</svg>')
}

describe('visual MCP image content', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('adds base64 SVG image content to habit analytics without removing text', async () => {
    const today = todayISTDate()
    mockClient.from.mockImplementation((table: string) => {
      if (table === 'habits') {
        return createChain({ data: { id: 'h-1', name: 'Workout', created_at: '2026-01-01T00:00:00Z' }, error: null })
      }
      return createChain({ data: [{ logged_date: today }], error: null })
    })

    const result = await registeredTools['get_habit_analytics'].handler(
      { habit_id: 'h-1', days: 30 },
      { authInfo },
    )

    expect(result.content[0].type).toBe('text')
    expectSvgImage(result)
  })

  it('adds base64 SVG image content to spending summary without removing text', async () => {
    const result = await registeredTools['get_spending_summary'].handler(
      { start_date: '2026-04-01', end_date: '2026-04-30' },
      { authInfo },
    )

    expect(result.content[0].type).toBe('text')
    expectSvgImage(result)
  })
})
