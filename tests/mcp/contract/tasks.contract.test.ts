import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { connectClient, createSupabaseMock, createQuery, type SupabaseMock } from './_helpers'

const mocks = vi.hoisted(() => ({ client: null as any }))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => mocks.client),
}))

vi.mock('@/lib/mcp/images', () => ({
  createHabitHeatmapImage: vi.fn().mockResolvedValue({ type: 'image', data: 'ZmFrZQ==', mimeType: 'image/png' }),
  createSpendingChartImage: vi.fn().mockResolvedValue({ type: 'image', data: 'ZmFrZQ==', mimeType: 'image/png' }),
}))

describe('MCP contract — task tools', () => {
  let supa: SupabaseMock
  let close: () => Promise<void>
  let client: Awaited<ReturnType<typeof connectClient>>['client']

  beforeEach(async () => {
    supa = createSupabaseMock()
    mocks.client = supa
    const connection = await connectClient({ userId: 'user-1' })
    client = connection.client
    close = connection.close
  })

  afterEach(async () => {
    await close()
    vi.clearAllMocks()
  })

  it('advertises every expected task tool via listTools', async () => {
    const { tools } = await client.listTools()
    const names = tools.map((t) => t.name)

    for (const expected of [
      'create_task',
      'list_tasks',
      'update_task_status',
      'update_task',
      'complete_task',
      'delete_task',
      'get_task',
      'add_subtask',
      'get_subtask',
      'list_subtasks',
      'update_subtask',
      'delete_subtask',
      'reorder_subtasks',
    ]) {
      expect(names, `${expected} should be registered`).toContain(expected)
      const tool = tools.find((t) => t.name === expected)!
      expect(tool.description).toBeTruthy()
      expect(tool.inputSchema).toBeDefined()
    }
  })

  it('list_tasks happy path returns JSON content with no isError flag', async () => {
    supa.queue(
      'tasks',
      createQuery({
        data: [{
          id: 't-1',
          title: 'Task A',
          description: null,
          status: 'pending',
          priority: 'medium',
          due_date: null,
          tags: [],
          task_type: 'personal',
          project: null,
          parent_task_id: null,
          position: 0,
          created_at: '2026-04-01T00:00:00.000Z',
          completed_at: null,
        }],
        count: 1,
        error: null,
      }),
      createQuery({ data: [], error: null }),
    )

    const result: any = await client.callTool({ name: 'list_tasks', arguments: {} })
    expect(result.isError).toBeFalsy()
    expect(Array.isArray(result.content)).toBe(true)
    const parsed = JSON.parse(result.content[0].text)
    expect(parsed.tasks[0].title).toBe('Task A')
    expect(parsed.total).toBe(1)
  })

  it('create_task with project but no project name surfaces a tool error', async () => {
    // Zod validation allows this; handler enforces the constraint.
    const result: any = await client.callTool({
      name: 'create_task',
      arguments: { title: 'X', task_type: 'project' } as any,
    })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toMatch(/project/i)
  })

  it('invalid priority enum returns isError=true (validation)', async () => {
    const result: any = await client.callTool({
      name: 'create_task',
      arguments: { title: 'X', priority: 'urgent' } as any,
    })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toMatch(/validation|priority/i)
  })
})
