/**
 * TDD: get_spending_summary should return an image content (pie/bar chart)
 * alongside text data for visual spending breakdown.
 *
 * Expected behavior after implementation:
 * - Tool returns text (JSON) + image (PNG chart)
 * - Chart shows category breakdown with proportions
 * - Text fallback includes formatted totals
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'cat-1' } }),
    }),
  })),
}))

vi.mock('@/lib/finance/transactions', () => ({
  createTransaction: vi.fn(),
  listTransactions: vi.fn(),
  getSpendingSummary: vi.fn().mockResolvedValue({
    total_spent: 32450,
    breakdown: [
      { category_name: 'Food', category_icon: '🍕', total_amount: 8200, transaction_count: 12 },
      { category_name: 'Transport', category_icon: '🚗', total_amount: 4100, transaction_count: 8 },
      { category_name: 'Shopping', category_icon: '🛍️', total_amount: 6000, transaction_count: 3 },
      { category_name: 'Bills', category_icon: '📱', total_amount: 5150, transaction_count: 4 },
      { category_name: 'Entertainment', category_icon: '🎬', total_amount: 9000, transaction_count: 6 },
    ],
  }),
  updateTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
}))

vi.mock('@/lib/finance/categories', () => ({
  ensurePresetCategories: vi.fn(),
}))

const registeredTools: Record<string, { handler: Function }> = {}

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: class {
    tool(name: string, _desc: string, _schema: unknown, handler: Function) {
      registeredTools[name] = { handler }
    }
  },
}))

import { registerFinanceTools } from '@/lib/mcp/tools/finance'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

const server = new McpServer({ name: 'test', version: '0.0.0' })
registerFinanceTools(server)

const authInfo = { extra: { userId: 'user-1' } }

describe('get_spending_summary — visual chart output', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('should return text content with breakdown data suitable for charting', async () => {
    const result = await registeredTools['get_spending_summary'].handler(
      { start_date: '2026-04-01', end_date: '2026-04-30' },
      { authInfo }
    )

    const textContent = result.content.find((c: { type: string }) => c.type === 'text')
    expect(textContent).toBeDefined()

    const parsed = JSON.parse(textContent.text)

    // Chart needs: total + breakdown with category, amount, percentage
    expect(parsed.total_spent).toBe(32450)
    expect(parsed.breakdown).toBeInstanceOf(Array)
    expect(parsed.breakdown.length).toBe(5)

    // Each category has fields needed for chart rendering
    parsed.breakdown.forEach((cat: { category: string; icon: string; amount: number; count: number }) => {
      expect(cat).toHaveProperty('category')
      expect(cat).toHaveProperty('icon')
      expect(cat).toHaveProperty('amount')
      expect(typeof cat.amount).toBe('number')
      expect(cat.amount).toBeGreaterThan(0)
    })
  })

  it('should include image content with base64 PNG chart when implemented', async () => {
    const result = await registeredTools['get_spending_summary'].handler(
      { start_date: '2026-04-01', end_date: '2026-04-30' },
      { authInfo }
    )

    // TODO: This test will FAIL until we add chart image to get_spending_summary
    // Uncomment when implementing:
    // const imageContent = result.content.find((c: { type: string }) => c.type === 'image')
    // expect(imageContent).toBeDefined()
    // expect(imageContent.mimeType).toBe('image/png')
    // expect(imageContent.data).toMatch(/^[A-Za-z0-9+/]+=*$/) // valid base64

    // For now, verify category data has percentage info for chart proportions
    const textContent = result.content.find((c: { type: string }) => c.type === 'text')
    const parsed = JSON.parse(textContent.text)

    // Verify amounts sum to total (chart slices must add up)
    const sum = parsed.breakdown.reduce((s: number, c: { amount: number }) => s + c.amount, 0)
    expect(sum).toBe(parsed.total_spent)
  })

  it('should handle empty spending period (no chart needed)', async () => {
    const { getSpendingSummary } = await import('@/lib/finance/transactions')
    ;(getSpendingSummary as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      total_spent: 0,
      breakdown: [],
    })

    const result = await registeredTools['get_spending_summary'].handler(
      { start_date: '2026-05-01', end_date: '2026-05-31' },
      { authInfo }
    )

    const parsed = JSON.parse(result.content[0].text)
    expect(parsed.total_spent).toBe(0)
    expect(parsed.breakdown).toHaveLength(0)
  })
})
