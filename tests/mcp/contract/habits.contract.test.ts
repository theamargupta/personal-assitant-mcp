import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { connectClient, createSupabaseMock, createQuery, type SupabaseMock } from './_helpers'

const mocks = vi.hoisted(() => ({ client: null as any }))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => mocks.client),
}))

// Avoid heavy WASM initialisation in image generation for widget tools.
vi.mock('@/lib/mcp/images', () => ({
  createHabitHeatmapImage: vi.fn().mockResolvedValue({
    type: 'image',
    data: 'ZmFrZQ==',
    mimeType: 'image/png',
  }),
  createSpendingChartImage: vi.fn().mockResolvedValue({
    type: 'image',
    data: 'ZmFrZQ==',
    mimeType: 'image/png',
  }),
}))

describe('MCP contract — habit tools', () => {
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

  it('advertises every expected habit tool via listTools', async () => {
    const { tools } = await client.listTools()
    const names = tools.map((t) => t.name).sort()

    const expected = [
      'create_habit',
      'delete_habit',
      'delete_habit_log',
      'get_habit',
      'get_habit_analytics',
      'get_habit_streak',
      'list_habits',
      'log_habit_completion',
      'update_habit',
      'update_habit_log',
    ].sort()

    for (const name of expected) {
      expect(names).toContain(name)
    }

    for (const tool of tools.filter((t) => expected.includes(t.name))) {
      expect(tool.description, `${tool.name} missing description`).toBeTruthy()
      expect(tool.inputSchema, `${tool.name} missing inputSchema`).toBeDefined()
      expect(typeof tool.inputSchema).toBe('object')
    }
  })

  it('exposes widget resourceUri on get_habit_analytics _meta', async () => {
    const { tools } = await client.listTools()
    const analytics = tools.find((t) => t.name === 'get_habit_analytics')
    expect(analytics).toBeDefined()
    const meta = analytics!._meta as Record<string, unknown> | undefined
    // ext-apps normalises both ui.resourceUri (nested) and ui/resourceUri (flat).
    const nested = (meta?.ui as { resourceUri?: string } | undefined)?.resourceUri
    const flat = meta?.['ui/resourceUri'] as string | undefined
    expect(nested || flat).toBe('ui://widgets/habit-heatmap.html')
  })

  it('happy path: list_habits returns a content array without isError', async () => {
    supa.queue(
      'habits',
      createQuery({
        data: [{
          id: 'h-1',
          name: 'Workout',
          frequency: 'daily',
          description: null,
          color: '#3b82f6',
          reminder_time: null,
          archived: false,
          created_at: '2026-01-01T00:00:00.000Z',
        }],
        count: 1,
        error: null,
      }),
      // streak lookup per habit
      createQuery({ data: [], error: null }),
    )

    const result = await client.callTool({ name: 'list_habits', arguments: {} })
    expect(result.isError).toBeFalsy()
    expect(Array.isArray(result.content)).toBe(true)
    expect((result.content as Array<{ type: string }>).length).toBeGreaterThan(0)
    const first = (result.content as Array<{ type: string; text: string }>)[0]
    expect(first.type).toBe('text')
    const parsed = JSON.parse(first.text)
    expect(parsed.habits[0].name).toBe('Workout')
    expect(parsed.habits[0].current_streak).toBe(0)
  })

  it('error path: invalid args (bad frequency enum) surface isError=true with a text explanation', async () => {
    const result: any = await client.callTool({
      name: 'list_habits',
      arguments: { frequency: 'hourly' } as any,
    })
    expect(result.isError).toBe(true)
    expect(result.content[0].type).toBe('text')
    expect(result.content[0].text).toMatch(/Input validation error/i)
  })

  it('error path: create_habit with bad color returns isError=true', async () => {
    const result: any = await client.callTool({
      name: 'create_habit',
      arguments: { name: 'x', frequency: 'daily', color: 'red' } as any,
    })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toMatch(/color/i)
  })
})
