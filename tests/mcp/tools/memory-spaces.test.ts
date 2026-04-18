import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  createSpace: vi.fn(),
  listSpaces: vi.fn(),
  deleteSpace: vi.fn(),
  getSpace: vi.fn(),
  updateSpace: vi.fn(),
  countSpaceItems: vi.fn(),
  registeredTools: {} as Record<string, { handler: (...args: unknown[]) => unknown }>,
  registeredAppTools: {} as Record<string, { handler: (...args: unknown[]) => unknown }>,
  mockClient: {
    from: vi.fn(() => ({
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  },
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => mocks.mockClient),
}))

vi.mock('@/lib/memory/spaces', () => ({
  createSpace: mocks.createSpace,
  listSpaces: mocks.listSpaces,
  deleteSpace: mocks.deleteSpace,
  getSpace: mocks.getSpace,
  updateSpace: mocks.updateSpace,
  countSpaceItems: mocks.countSpaceItems,
  ensureDefaultSpaces: vi.fn(),
  resolveSpaceId: vi.fn(),
}))

vi.mock('@/lib/memory/items', () => ({
  saveMemory: vi.fn(),
  searchMemories: vi.fn(),
  listMemories: vi.fn(),
  getMemory: vi.fn(),
  updateMemory: vi.fn(),
  deleteMemory: vi.fn(),
  getContext: vi.fn(),
  getRules: vi.fn(),
  consolidateMemories: vi.fn(),
}))

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: class {
    tool(name: string, _desc: string, _schema: unknown, handler: (...args: unknown[]) => unknown) {
      mocks.registeredTools[name] = { handler }
    }
  },
}))

vi.mock('@modelcontextprotocol/ext-apps/server', () => ({
  registerAppTool: (_server: unknown, name: string, opts: { description?: string; inputSchema?: unknown }, handler: (...args: unknown[]) => unknown) => {
    void opts
    mocks.registeredAppTools[name] = { handler }
  },
}))

import { registerMemoryTools } from '@/lib/mcp/tools/memory'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

const server = new McpServer({ name: 'test', version: '0.0.0' })
registerMemoryTools(server)

const authInfo = { extra: { userId: 'user-1' } }
const noAuth = { extra: {} }

function parseToolResult(result: { content: Array<{ text: string }> }) {
  return JSON.parse(result.content[0].text)
}

describe('get_space', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws when unauthorized', async () => {
    await expect(mocks.registeredTools['get_space'].handler(
      { id_or_slug: 'personal' },
      { authInfo: noAuth }
    )).rejects.toThrow('Unauthorized')
  })

  it('returns error when space not found', async () => {
    mocks.getSpace.mockResolvedValue(null)

    const result = await mocks.registeredTools['get_space'].handler(
      { id_or_slug: 'missing' },
      { authInfo }
    )

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: Space not found')
  })

  it('returns space with active_item_count', async () => {
    mocks.getSpace.mockResolvedValue({
      id: 'space-1',
      name: 'Personal',
      slug: 'personal',
      description: 'Default',
      icon: '🧠',
      created_at: '2026-04-01T00:00:00.000Z',
    })
    mocks.countSpaceItems.mockResolvedValue(42)

    const result = await mocks.registeredTools['get_space'].handler(
      { id_or_slug: 'personal' },
      { authInfo }
    )
    const parsed = parseToolResult(result)

    expect(mocks.getSpace).toHaveBeenCalledWith('user-1', 'personal')
    expect(mocks.countSpaceItems).toHaveBeenCalledWith('user-1', 'space-1')
    expect(parsed.space_id).toBe('space-1')
    expect(parsed.slug).toBe('personal')
    expect(parsed.active_item_count).toBe(42)
  })
})

describe('update_space', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws when unauthorized', async () => {
    await expect(mocks.registeredTools['update_space'].handler(
      { id_or_slug: 'personal', name: 'x' },
      { authInfo: noAuth }
    )).rejects.toThrow('Unauthorized')
  })

  it('updates name and icon', async () => {
    mocks.updateSpace.mockResolvedValue({
      id: 'space-1',
      name: 'Renamed',
      slug: 'personal',
      description: null,
      icon: '✨',
    })

    const result = await mocks.registeredTools['update_space'].handler(
      { id_or_slug: 'personal', name: 'Renamed', icon: '✨' },
      { authInfo }
    )
    const parsed = parseToolResult(result)

    expect(mocks.updateSpace).toHaveBeenCalledWith('user-1', 'personal', {
      name: 'Renamed',
      description: undefined,
      icon: '✨',
    })
    expect(parsed.name).toBe('Renamed')
    expect(parsed.icon).toBe('✨')
  })

  it('clears description when null is passed', async () => {
    mocks.updateSpace.mockResolvedValue({
      id: 'space-1',
      name: 'Personal',
      slug: 'personal',
      description: null,
      icon: '🧠',
    })

    await mocks.registeredTools['update_space'].handler(
      { id_or_slug: 'personal', description: null },
      { authInfo }
    )

    expect(mocks.updateSpace).toHaveBeenCalledWith('user-1', 'personal', {
      name: undefined,
      description: null,
      icon: undefined,
    })
  })

  it('surfaces library errors', async () => {
    mocks.updateSpace.mockRejectedValue(new Error('Space not found'))

    const result = await mocks.registeredTools['update_space'].handler(
      { id_or_slug: 'missing', name: 'x' },
      { authInfo }
    )

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: Space not found')
  })
})

describe('delete_space', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws when unauthorized', async () => {
    await expect(mocks.registeredTools['delete_space'].handler(
      { slug: 'custom' },
      { authInfo: noAuth }
    )).rejects.toThrow('Unauthorized')
  })

  it('deletes space', async () => {
    mocks.deleteSpace.mockResolvedValue(undefined)

    const result = await mocks.registeredTools['delete_space'].handler(
      { slug: 'custom' },
      { authInfo }
    )
    const parsed = parseToolResult(result)

    expect(mocks.deleteSpace).toHaveBeenCalledWith('user-1', 'custom')
    expect(parsed).toEqual({ deleted: true, slug: 'custom' })
  })

  it('blocks deletion of default spaces', async () => {
    mocks.deleteSpace.mockRejectedValue(new Error('Cannot delete default space "personal"'))

    const result = await mocks.registeredTools['delete_space'].handler(
      { slug: 'personal' },
      { authInfo }
    )

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: Cannot delete default space "personal"')
  })
})
