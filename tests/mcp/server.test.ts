import { describe, it, expect, vi } from 'vitest'

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: class MockMcpServer {
    name: string
    version: string
    tools: Array<{ name: string; description: string }> = []

    constructor(opts: { name: string; version: string }) {
      this.name = opts.name
      this.version = opts.version
    }

    tool(name: string, description: string, _schema: unknown, _handler: unknown) {
      this.tools.push({ name, description })
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

describe('createMcpServer', () => {
  it('creates a server with correct name and version', () => {
    const server = createMcpServer() as unknown as { name: string; version: string }
    expect(server.name).toBe('pa-mcp')
    expect(server.version).toBe('0.1.0')
  })

  it('registers all expected tools', () => {
    const server = createMcpServer() as unknown as { tools: Array<{ name: string }> }
    const toolNames = server.tools.map(t => t.name)

    // Habit tools (5)
    expect(toolNames).toContain('create_habit')
    expect(toolNames).toContain('log_habit_completion')
    expect(toolNames).toContain('get_habit_streak')
    expect(toolNames).toContain('get_habit_analytics')
    expect(toolNames).toContain('update_habit')

    // Task tools (5)
    expect(toolNames).toContain('create_task')
    expect(toolNames).toContain('list_tasks')
    expect(toolNames).toContain('update_task_status')
    expect(toolNames).toContain('complete_task')
    expect(toolNames).toContain('delete_task')

    // Document tools (6)
    expect(toolNames).toContain('upload_document')
    expect(toolNames).toContain('confirm_upload')
    expect(toolNames).toContain('list_documents')
    expect(toolNames).toContain('get_document')
    expect(toolNames).toContain('search_documents')
    expect(toolNames).toContain('delete_document')

    // Finance tools (6)
    expect(toolNames).toContain('get_spending_summary')
    expect(toolNames).toContain('list_transactions')
    expect(toolNames).toContain('add_transaction')
    expect(toolNames).toContain('get_uncategorized')
    expect(toolNames).toContain('update_transaction')
    expect(toolNames).toContain('delete_transaction')

    // Goal tools (6)
    expect(toolNames).toContain('create_goal')
    expect(toolNames).toContain('list_goals')
    expect(toolNames).toContain('update_goal')
    expect(toolNames).toContain('get_goal_progress')
    expect(toolNames).toContain('get_review')
    expect(toolNames).toContain('add_milestone')

    // Memory tools (10)
    expect(toolNames).toContain('save_memory')
    expect(toolNames).toContain('search_memory')
    expect(toolNames).toContain('list_memories')
    expect(toolNames).toContain('get_memory')
    expect(toolNames).toContain('update_memory')
    expect(toolNames).toContain('delete_memory')
    expect(toolNames).toContain('get_context')
    expect(toolNames).toContain('get_rules')
    expect(toolNames).toContain('create_space')
    expect(toolNames).toContain('list_spaces')
    expect(toolNames).toContain('consolidate_memories')
  })

  it('registers exactly 39 tools total', () => {
    const server = createMcpServer() as unknown as { tools: Array<{ name: string }> }
    expect(server.tools).toHaveLength(39)
  })
})
