import { describe, expect, it, vi } from 'vitest'

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: class MockMcpServer {
    name: string
    version: string
    tools: Array<{ name: string; description?: string; meta?: Record<string, unknown> }> = []
    resources: Array<{
      name: string
      uri: string
      config: Record<string, unknown>
      handler: () => Promise<{ contents: Array<{ uri: string; mimeType?: string; text?: string }> }>
    }> = []

    constructor(opts: { name: string; version: string }) {
      this.name = opts.name
      this.version = opts.version
    }

    tool(name: string, description: string, _schema: unknown, _handler: unknown) {
      this.tools.push({ name, description })
    }

    registerTool(name: string, config: { description?: string; _meta?: Record<string, unknown> }, _handler: unknown) {
      this.tools.push({ name, description: config.description, meta: config._meta })
    }

    registerResource(
      name: string,
      uri: string,
      config: Record<string, unknown>,
      handler: () => Promise<{ contents: Array<{ uri: string; mimeType?: string; text?: string }> }>,
    ) {
      this.resources.push({ name, uri, config, handler })
    }
  },
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({})),
}))

vi.mock('@/lib/documents/storage', () => ({
  buildStoragePath: vi.fn(),
  createSignedUploadUrl: vi.fn(),
  getSignedUrl: vi.fn(),
  deleteFile: vi.fn(),
}))

vi.mock('@/lib/documents/chunk', () => ({
  chunkText: vi.fn(() => []),
}))

vi.mock('@/lib/documents/embed', () => ({
  generateEmbeddings: vi.fn(async () => []),
  generateEmbedding: vi.fn(async () => []),
}))

vi.mock('@/lib/finance/transactions', () => ({
  createTransaction: vi.fn(),
  listTransactions: vi.fn(),
  getSpendingSummary: vi.fn(),
  updateTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
}))

vi.mock('@/lib/finance/categories', () => ({
  ensurePresetCategories: vi.fn(),
}))

vi.mock('@/lib/goals/goals', () => ({
  createGoal: vi.fn(),
  listGoals: vi.fn(async () => []),
  updateGoal: vi.fn(),
  addMilestone: vi.fn(),
  toggleMilestone: vi.fn(),
  computeGoalProgress: vi.fn(),
}))

vi.mock('@/lib/goals/review', () => ({
  generateReview: vi.fn(),
}))

import { createMcpServer } from '@/lib/mcp/server'

const widgetToolUris: Record<string, string> = {
  get_habit_analytics: 'ui://widgets/habit-heatmap.html',
  get_spending_summary: 'ui://widgets/spending-chart.html',
  get_uncategorized: 'ui://widgets/transaction-categorizer.html',
  get_review: 'ui://widgets/review-dashboard.html',
  get_document: 'ui://widgets/document-viewer.html',
}

describe('MCP app widget registration', () => {
  it('registers five widget resources as MCP app HTML', async () => {
    const server = createMcpServer() as unknown as {
      resources: Array<{
        name: string
        uri: string
        config: Record<string, unknown>
        handler: () => Promise<{ contents: Array<{ uri: string; mimeType?: string; text?: string }> }>
      }>
    }

    expect(server.resources.map(resource => resource.uri)).toEqual([
      'ui://widgets/habit-heatmap.html',
      'ui://widgets/spending-chart.html',
      'ui://widgets/review-dashboard.html',
      'ui://widgets/transaction-categorizer.html',
      'ui://widgets/document-viewer.html',
    ])

    const heatmap = server.resources[0]
    expect(heatmap.config.mimeType).toBe('text/html;profile=mcp-app')

    const readResult = await heatmap.handler()
    expect(readResult.contents[0].uri).toBe('ui://widgets/habit-heatmap.html')
    expect(readResult.contents[0].mimeType).toBe('text/html;profile=mcp-app')
    expect(readResult.contents[0].text).toContain('HabitHeatmap')
    expect(readResult.contents[0].text).not.toContain('__EXT_APPS_BUNDLE__')
  })

  it('adds UI resource metadata only to the five widget-backed tools', () => {
    const server = createMcpServer() as unknown as {
      tools: Array<{ name: string; meta?: Record<string, unknown> & { ui?: { resourceUri?: string } } }>
    }

    for (const [toolName, uri] of Object.entries(widgetToolUris)) {
      const tool = server.tools.find(candidate => candidate.name === toolName)
      expect(tool?.meta?.ui?.resourceUri).toBe(uri)
      expect(tool?.meta?.['ui/resourceUri']).toBe(uri)
    }

    const plainToolNames = server.tools
      .filter(tool => !Object.hasOwn(widgetToolUris, tool.name))
      .map(tool => tool.name)
    expect(plainToolNames.length).toBeGreaterThan(0)
    for (const toolName of plainToolNames) {
      const tool = server.tools.find(candidate => candidate.name === toolName)
      expect(tool?.meta).toBeUndefined()
    }
  })
})
