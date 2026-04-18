import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Supabase chain mock (shared) ───────────────────────────
// IMPORTANT: This file intentionally does NOT mock @/lib/memory/*.
// The real lib/memory/items.ts and lib/memory/spaces.ts are exercised,
// and we only mock the Supabase client + the embedding function.

interface QueryResult {
  data?: unknown
  error?: { message: string } | null
  count?: number | null
}

interface Chain {
  select: ReturnType<typeof vi.fn>
  insert: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  is: ReturnType<typeof vi.fn>
  contains: ReturnType<typeof vi.fn>
  order: ReturnType<typeof vi.fn>
  range: ReturnType<typeof vi.fn>
  maybeSingle: ReturnType<typeof vi.fn>
  single: ReturnType<typeof vi.fn>
  then: (resolve: (v: QueryResult) => unknown) => Promise<unknown>
}

function createChain(result: QueryResult = { data: null, error: null }): Chain {
  const chain = {} as Chain
  const methods: (keyof Chain)[] = ['select', 'insert', 'update', 'delete', 'eq', 'is', 'contains', 'order', 'range']
  for (const m of methods) {
    ;(chain as Record<string, unknown>)[m] = vi.fn().mockReturnValue(chain)
  }
  chain.single = vi.fn().mockResolvedValue(result)
  chain.maybeSingle = vi.fn().mockResolvedValue(result)
  chain.then = (resolve) => Promise.resolve(result).then(resolve)
  return chain
}

const mocks = vi.hoisted(() => ({
  fromQueues: new Map<string, unknown[]>(),
  rpcQueues: new Map<string, unknown[]>(),
  client: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
  registeredTools: {} as Record<string, { handler: (args: unknown, ctx: unknown) => Promise<unknown> }>,
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => mocks.client),
}))

// Avoid real OPENAI calls — generateEmbedding returns a deterministic vector.
vi.mock('@/lib/documents/embed', () => ({
  generateEmbedding: vi.fn().mockResolvedValue(new Array(1536).fill(0.1)),
  generateEmbeddings: vi.fn().mockResolvedValue([new Array(1536).fill(0.1)]),
}))

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: class {
    tool(name: string, _desc: string, _schema: unknown, handler: (...args: unknown[]) => unknown) {
      mocks.registeredTools[name] = { handler: handler as never }
    }
    registerTool(name: string, _config: unknown, handler: (...args: unknown[]) => unknown) {
      mocks.registeredTools[name] = { handler: handler as never }
    }
  },
}))

import { registerMemoryTools } from '@/lib/mcp/tools/memory'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

const server = new McpServer({ name: 'test', version: '0.0.0' })
registerMemoryTools(server)

const authInfo = { extra: { userId: 'user-1' } }

function parseToolResult(result: unknown) {
  const r = result as { content: Array<{ text: string }>; isError?: boolean }
  return { parsed: JSON.parse(r.content[0].text), isError: r.isError, text: r.content[0].text }
}

function queueFrom(table: string, chain: Chain) {
  const list = (mocks.fromQueues.get(table) ?? []) as Chain[]
  list.push(chain)
  mocks.fromQueues.set(table, list)
}

function queueRpc(name: string, result: QueryResult) {
  const list = (mocks.rpcQueues.get(name) ?? []) as QueryResult[]
  list.push(result)
  mocks.rpcQueues.set(name, list)
}

// Helper: seed "ensureDefaultSpaces" with non-empty count so it skips seeding,
// then "resolveSpaceId" for the provided slug returning the given id.
function seedEnsureAndResolve(slug: string, spaceId: string) {
  queueFrom('pa_memory_spaces', createChain({ count: 2, error: null }))
  queueFrom('pa_memory_spaces', createChain({ data: { id: spaceId }, error: null }))
  void slug
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.fromQueues = new Map()
  mocks.rpcQueues = new Map()

  mocks.client.from.mockImplementation((table: string) => {
    const list = (mocks.fromQueues.get(table) ?? []) as Chain[]
    if (list.length > 0) return list.shift()!
    // Default no-op chain (for logAccess best-effort inserts).
    return createChain()
  })

  mocks.client.rpc.mockImplementation((name: string, _args: unknown) => {
    const list = (mocks.rpcQueues.get(name) ?? []) as QueryResult[]
    if (list.length > 0) return Promise.resolve(list.shift())
    return Promise.resolve({ data: null, error: null })
  })
})

// ── save_memory ────────────────────────────────────────────

describe('save_memory (integration)', () => {
  it('saves a new memory when no duplicates found', async () => {
    seedEnsureAndResolve('personal', 'space-p')
    queueRpc('pa_match_memories', { data: [], error: null })
    const saved = {
      id: 'mem-new',
      title: 'First',
      category: 'note',
      project: null,
      created_at: '2026-04-16T00:00:00Z',
    }
    queueFrom('pa_memory_items', createChain({ data: saved, error: null }))

    const result = await mocks.registeredTools['save_memory'].handler(
      { space: 'personal', title: 'First', content: 'Hello', category: 'note', tags: [], importance: 5, force: false },
      { authInfo },
    )
    const { parsed } = parseToolResult(result)
    expect(parsed.status).toBe('saved')
    expect(parsed.memory_id).toBe('mem-new')
  })

  it('returns duplicates_found at ≥0.9 similarity when force=false', async () => {
    seedEnsureAndResolve('personal', 'space-p')
    queueRpc('pa_match_memories', {
      data: [{
        id: 'mem-existing',
        title: 'Exists',
        content: 'Similar',
        category: 'note',
        similarity: 0.95,
        updated_at: '2026-04-10T00:00:00Z',
        space_slug: 'personal',
      }],
      error: null,
    })

    const result = await mocks.registeredTools['save_memory'].handler(
      { space: 'personal', title: 'New', content: 'Similar new', category: 'note', tags: [], importance: 5, force: false },
      { authInfo },
    )
    const { parsed } = parseToolResult(result)
    expect(parsed.status).toBe('duplicates_found')
    expect(parsed.similar_memories).toHaveLength(1)
    expect(parsed.similar_memories[0].id).toBe('mem-existing')
    expect(parsed.suggestion).toContain('Use force=true')
  })

  it('bypasses duplicate check when force=true', async () => {
    seedEnsureAndResolve('personal', 'space-p')
    // With force=true, pa_match_memories is not called — only insert.
    const saved = { id: 'mem-forced', title: 'Forced', category: 'note', project: null, created_at: '2026-04-16T00:00:00Z' }
    queueFrom('pa_memory_items', createChain({ data: saved, error: null }))

    const result = await mocks.registeredTools['save_memory'].handler(
      { space: 'personal', title: 'Forced', content: 'anyway', category: 'note', tags: [], importance: 5, force: true },
      { authInfo },
    )
    const { parsed } = parseToolResult(result)
    expect(parsed.status).toBe('saved')
    expect(mocks.client.rpc).not.toHaveBeenCalledWith('pa_match_memories', expect.anything())
  })

  it('returns error when space cannot be resolved', async () => {
    queueFrom('pa_memory_spaces', createChain({ count: 5, error: null })) // ensureDefaultSpaces short-circuit
    queueFrom('pa_memory_spaces', createChain({ data: null, error: null })) // resolveSpaceId -> null

    const result = (await mocks.registeredTools['save_memory'].handler(
      { space: 'ghost', title: 't', content: 'c', category: 'note', tags: [], importance: 5, force: false },
      { authInfo },
    )) as { isError?: boolean; content: Array<{ text: string }> }
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('Space "ghost" not found')
  })

  it('throws Unauthorized when no userId', async () => {
    await expect(
      mocks.registeredTools['save_memory'].handler(
        { space: 'personal', title: 't', content: 'c', category: 'note', tags: [], importance: 5, force: false },
        { authInfo: { extra: {} } },
      ),
    ).rejects.toThrow('Unauthorized')
  })
})

// ── search_memory ──────────────────────────────────────────

describe('search_memory (integration)', () => {
  const hit = {
    id: 'mem-1',
    user_id: 'user-1',
    space_id: 's-1',
    title: 'Budget',
    content: 'Monthly budget is 50k',
    category: 'rule',
    tags: [],
    project: null,
    valid_at: new Date().toISOString(),
    invalid_at: null,
    source: 'manual',
    importance: 3,
    space_slug: 'personal',
    semantic_score: 0.85,
    keyword_score: 0.6,
    final_score: 0.73,
  }

  it('defaults to space="personal" and passes it to RPC', async () => {
    queueFrom('pa_memory_spaces', createChain({ count: 2, error: null })) // ensureDefaultSpaces
    queueRpc('pa_hybrid_search', { data: [hit], error: null })

    await mocks.registeredTools['search_memory'].handler(
      { query: 'budget', space: 'personal', limit: 5 },
      { authInfo },
    )

    expect(mocks.client.rpc).toHaveBeenCalledWith('pa_hybrid_search', expect.objectContaining({
      filter_user_id: 'user-1',
      filter_space_slug: 'personal',
      query_text: 'budget',
    }))
  })

  it('passes space=undefined when space="all"', async () => {
    queueFrom('pa_memory_spaces', createChain({ count: 2, error: null }))
    queueRpc('pa_hybrid_search', { data: [hit], error: null })

    await mocks.registeredTools['search_memory'].handler(
      { query: 'q', space: 'all', limit: 5 },
      { authInfo },
    )

    expect(mocks.client.rpc).toHaveBeenCalledWith('pa_hybrid_search', expect.objectContaining({
      filter_space_slug: null,
    }))
  })

  it('passes the specific slug when given', async () => {
    queueFrom('pa_memory_spaces', createChain({ count: 2, error: null }))
    queueRpc('pa_hybrid_search', { data: [hit], error: null })

    const result = await mocks.registeredTools['search_memory'].handler(
      { query: 'q', space: 'work', limit: 5 },
      { authInfo },
    )
    const { parsed } = parseToolResult(result)
    expect(mocks.client.rpc).toHaveBeenCalledWith('pa_hybrid_search', expect.objectContaining({
      filter_space_slug: 'work',
    }))
    expect(parsed.results[0].id).toBe('mem-1')
    expect(parsed.results[0].semantic_score).toBe(0.85)
  })

  it('returns error payload on RPC failure', async () => {
    queueFrom('pa_memory_spaces', createChain({ count: 2, error: null }))
    queueRpc('pa_hybrid_search', { data: null, error: { message: 'boom' } })

    const result = (await mocks.registeredTools['search_memory'].handler(
      { query: 'q', space: 'personal', limit: 5 },
      { authInfo },
    )) as { isError?: boolean; content: Array<{ text: string }> }
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('boom')
  })
})

// ── list_memories ──────────────────────────────────────────

describe('list_memories (integration)', () => {
  function seedListQuery(rows: unknown[], onCall?: (chain: Chain) => void) {
    queueFrom('pa_memory_spaces', createChain({ count: 2, error: null })) // ensureDefaultSpaces
    const chain = createChain({ data: rows, error: null })
    queueFrom('pa_memory_items', chain)
    onCall?.(chain)
    return chain
  }

  it('defaults to space="personal" slug filter on items join', async () => {
    const chain = seedListQuery([])

    await mocks.registeredTools['list_memories'].handler(
      { space: 'personal', limit: 20, offset: 0 },
      { authInfo },
    )

    // The spaceSlug filter on the joined table
    expect(chain.eq).toHaveBeenCalledWith('pa_memory_spaces.slug', 'personal')
  })

  it('skips the slug filter when space="all"', async () => {
    const chain = seedListQuery([])

    await mocks.registeredTools['list_memories'].handler(
      { space: 'all', limit: 20, offset: 0 },
      { authInfo },
    )

    const slugCalls = (chain.eq.mock.calls as Array<[string, unknown]>).filter(c => c[0] === 'pa_memory_spaces.slug')
    expect(slugCalls.length).toBe(0)
  })

  it('applies a custom space slug when provided', async () => {
    const chain = seedListQuery([])

    await mocks.registeredTools['list_memories'].handler(
      { space: 'work', limit: 20, offset: 0 },
      { authInfo },
    )

    expect(chain.eq).toHaveBeenCalledWith('pa_memory_spaces.slug', 'work')
  })

  it('returns serialized rows with stale_hint', async () => {
    const row = {
      id: 'm-1', user_id: 'user-1', space_id: 's', title: 't', content: 'c',
      category: 'note', tags: [], project: null,
      valid_at: new Date().toISOString(), invalid_at: null, source: 'manual',
      importance: 5, parent_id: null, is_active: true,
      created_at: '2026-04-16T00:00:00Z', updated_at: '2026-04-16T00:00:00Z',
      pa_memory_spaces: { slug: 'personal' },
    }
    seedListQuery([row])

    const result = await mocks.registeredTools['list_memories'].handler(
      { space: 'personal', limit: 20, offset: 0 },
      { authInfo },
    )
    const { parsed } = parseToolResult(result)
    expect(parsed.count).toBe(1)
    expect(parsed.memories[0].id).toBe('m-1')
    expect(parsed.memories[0].stale_hint).toBeNull()
  })
})

// ── get_memory ─────────────────────────────────────────────

describe('get_memory (integration)', () => {
  const memoryRow = {
    id: '11111111-1111-1111-1111-111111111111',
    user_id: 'user-1', space_id: 's', title: 'Mem', content: 'Content',
    category: 'note', tags: ['a'], project: null,
    valid_at: '2026-04-16T00:00:00Z', invalid_at: null, source: 'manual',
    importance: 3, parent_id: null, is_active: true,
    created_at: '2026-04-16T00:00:00Z', updated_at: '2026-04-16T00:00:00Z',
  }

  it('returns memory by id', async () => {
    queueFrom('pa_memory_items', createChain({ data: memoryRow, error: null }))

    const result = await mocks.registeredTools['get_memory'].handler(
      { memory_id: memoryRow.id },
      { authInfo },
    )
    const { parsed } = parseToolResult(result)
    expect(parsed.id).toBe(memoryRow.id)
    expect(parsed.title).toBe('Mem')
  })

  it('returns not-found error when missing', async () => {
    queueFrom('pa_memory_items', createChain({ data: null, error: null }))

    const result = (await mocks.registeredTools['get_memory'].handler(
      { memory_id: '22222222-2222-2222-2222-222222222222' },
      { authInfo },
    )) as { isError?: boolean; content: Array<{ text: string }> }
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: Memory not found')
  })
})

// ── update_memory ──────────────────────────────────────────

describe('update_memory (integration)', () => {
  const id = '33333333-3333-3333-3333-333333333333'

  it('patches title only (no embedding regen)', async () => {
    const updated = { id, title: 'New title', category: 'note', updated_at: '2026-04-16T00:00:00Z' }
    // First from('pa_memory_items') is the update itself (title+content not both but title provided => getMemory called)
    // Actually updateMemory calls getMemory when title or content changes, then updates.
    // getMemory: from('pa_memory_items') maybeSingle → existing
    queueFrom('pa_memory_items', createChain({
      data: { id, title: 'Old', content: 'Original content' } as unknown,
      error: null,
    }))
    // The update call
    queueFrom('pa_memory_items', createChain({ data: updated, error: null }))

    const result = await mocks.registeredTools['update_memory'].handler(
      { memory_id: id, title: 'New title' },
      { authInfo },
    )
    const { parsed } = parseToolResult(result)
    expect(parsed.memory_id).toBe(id)
    expect(parsed.title).toBe('New title')
  })

  it('resolves space when provided', async () => {
    // spaceSlug given → resolveSpaceId runs first → from('pa_memory_spaces')
    queueFrom('pa_memory_spaces', createChain({ data: { id: 'new-space' }, error: null }))
    // No title/content change → no getMemory call
    queueFrom('pa_memory_items', createChain({
      data: { id, title: 't', category: 'note', updated_at: '2026-04-16T00:00:00Z' },
      error: null,
    }))

    const result = await mocks.registeredTools['update_memory'].handler(
      { memory_id: id, space: 'work' },
      { authInfo },
    )
    const { parsed } = parseToolResult(result)
    expect(parsed.memory_id).toBe(id)
  })

  it('errors when space slug unknown', async () => {
    queueFrom('pa_memory_spaces', createChain({ data: null, error: null }))

    const result = (await mocks.registeredTools['update_memory'].handler(
      { memory_id: id, space: 'ghost' },
      { authInfo },
    )) as { isError?: boolean; content: Array<{ text: string }> }
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('Space "ghost" not found')
  })

  it('surfaces supabase update errors', async () => {
    queueFrom('pa_memory_items', createChain({ data: null, error: { message: 'db-err' } }))

    const result = (await mocks.registeredTools['update_memory'].handler(
      { memory_id: id, tags: ['x'] },
      { authInfo },
    )) as { isError?: boolean; content: Array<{ text: string }> }
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('db-err')
  })
})

// ── delete_memory ──────────────────────────────────────────

describe('delete_memory (integration)', () => {
  const id = '44444444-4444-4444-4444-444444444444'

  it('soft-deletes by setting is_active=false', async () => {
    const chain = createChain({ data: null, error: null })
    queueFrom('pa_memory_items', chain)

    const result = await mocks.registeredTools['delete_memory'].handler(
      { memory_id: id },
      { authInfo },
    )
    const { parsed } = parseToolResult(result)
    expect(parsed).toEqual({ deleted: true, memory_id: id })
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ is_active: false }),
    )
  })

  it('surfaces delete errors', async () => {
    queueFrom('pa_memory_items', createChain({ data: null, error: { message: 'nope' } }))

    const result = (await mocks.registeredTools['delete_memory'].handler(
      { memory_id: id },
      { authInfo },
    )) as { isError?: boolean; content: Array<{ text: string }> }
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('nope')
  })
})

// ── get_context ────────────────────────────────────────────

describe('get_context (integration)', () => {
  it('returns memories for a project', async () => {
    const rows = [
      { id: 'm1', title: 't1', content: 'c1', category: 'rule', tags: [], importance: 3 },
      { id: 'm2', title: 't2', content: 'c2', category: 'note', tags: ['a'], importance: 2 },
    ]
    queueFrom('pa_memory_items', createChain({ data: rows, error: null }))

    const result = await mocks.registeredTools['get_context'].handler(
      { project: 'sathi' },
      { authInfo },
    )
    const { parsed } = parseToolResult(result)
    expect(parsed.project).toBe('sathi')
    expect(parsed.count).toBe(2)
    expect(parsed.memories[0].id).toBe('m1')
  })
})

// ── get_rules ──────────────────────────────────────────────

describe('get_rules (integration)', () => {
  it('returns all rule memories when no project', async () => {
    const rows = [{ id: 'r1', title: 'Rule', content: 'Body', project: null, tags: [] }]
    const chain = createChain({ data: rows, error: null })
    queueFrom('pa_memory_items', chain)

    const result = await mocks.registeredTools['get_rules'].handler({}, { authInfo })
    const { parsed } = parseToolResult(result)
    expect(parsed.count).toBe(1)
    expect(chain.eq).toHaveBeenCalledWith('category', 'rule')
  })

  it('scopes by project when given', async () => {
    const chain = createChain({ data: [], error: null })
    queueFrom('pa_memory_items', chain)

    await mocks.registeredTools['get_rules'].handler(
      { project: 'sathi' },
      { authInfo },
    )
    expect(chain.eq).toHaveBeenCalledWith('project', 'sathi')
  })
})

// ── consolidate_memories ───────────────────────────────────

describe('consolidate_memories (integration)', () => {
  it('returns duplicate groups from pa_match_memories', async () => {
    // ensureDefaultSpaces is not called in consolidateMemories, but duplicates mode runs:
    //   from('pa_memory_items') → list memories
    queueFrom('pa_memory_items', createChain({
      data: [
        { id: 'a', title: 'A', content: 'x', category: 'note', importance: 5, created_at: '2026-01-01', embedding: 'vec' },
        { id: 'b', title: 'B', content: 'y', category: 'note', importance: 3, created_at: '2026-01-02', embedding: 'vec' },
      ],
      error: null,
    }))
    // pa_match_memories called for "a" → returns [a, b]
    queueRpc('pa_match_memories', {
      data: [
        { id: 'a', similarity: 1.0, title: 'A', content: 'x', category: 'note', importance: 5 },
        { id: 'b', similarity: 0.95, title: 'B', content: 'y', category: 'note', importance: 3 },
      ],
      error: null,
    })

    const result = await mocks.registeredTools['consolidate_memories'].handler(
      { mode: 'duplicates' },
      { authInfo },
    )
    const { parsed } = parseToolResult(result)
    expect(parsed.total_groups).toBe(1)
    expect(parsed.duplicate_groups[0].memories).toHaveLength(2)
    expect(parsed.duplicate_groups[0].max_similarity).toBe(0.95)
  })

  it('returns stale memories for mode=stale', async () => {
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

    queueFrom('pa_memory_items', createChain({
      data: [
        {
          id: 'old', title: 'Old', valid_at: sixMonthsAgo.toISOString(),
          invalid_at: null, importance: 0.3, category: 'context',
        },
      ],
      error: null,
    }))

    const result = await mocks.registeredTools['consolidate_memories'].handler(
      { mode: 'stale' },
      { authInfo },
    )
    const { parsed } = parseToolResult(result)
    expect(parsed.total_stale).toBe(1)
    expect(parsed.stale_memories[0].id).toBe('old')
  })

  it('filters by space slug when provided', async () => {
    // mode=stale with space → from('pa_memory_items').select(...).eq.eq.eq(pa_memory_spaces.slug, 'work').order
    const chain = createChain({ data: [], error: null })
    queueFrom('pa_memory_items', chain)

    await mocks.registeredTools['consolidate_memories'].handler(
      { space: 'work', mode: 'stale' },
      { authInfo },
    )

    expect(chain.eq).toHaveBeenCalledWith('pa_memory_spaces.slug', 'work')
  })
})

// ── create_space ───────────────────────────────────────────

describe('create_space (integration)', () => {
  it('creates and returns a space', async () => {
    const created = {
      id: 's-new', user_id: 'user-1', name: 'Work', slug: 'work',
      description: 'Stuff', icon: '💼', settings: {},
      created_at: '2026-04-16T00:00:00Z', updated_at: '2026-04-16T00:00:00Z',
    }
    queueFrom('pa_memory_spaces', createChain({ data: created, error: null }))

    const result = await mocks.registeredTools['create_space'].handler(
      { name: 'Work', slug: 'work', description: 'Stuff', icon: '💼' },
      { authInfo },
    )
    const { parsed } = parseToolResult(result)
    expect(parsed.space_id).toBe('s-new')
    expect(parsed.slug).toBe('work')
  })

  it('returns error when create fails', async () => {
    queueFrom('pa_memory_spaces', createChain({ data: null, error: { message: 'dup' } }))

    const result = (await mocks.registeredTools['create_space'].handler(
      { name: 'X', slug: 'x', icon: '🧠' },
      { authInfo },
    )) as { isError?: boolean; content: Array<{ text: string }> }
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('dup')
  })
})

// ── list_spaces ────────────────────────────────────────────

describe('list_spaces (integration)', () => {
  it('lists all spaces', async () => {
    const rows = [
      { id: 's1', name: 'Personal', slug: 'personal', description: null, icon: '👤' },
      { id: 's2', name: 'Projects', slug: 'projects', description: null, icon: '📁' },
    ]
    queueFrom('pa_memory_spaces', createChain({ data: rows, error: null }))

    const result = await mocks.registeredTools['list_spaces'].handler({}, { authInfo })
    const { parsed } = parseToolResult(result)
    expect(parsed.count).toBe(2)
    expect(parsed.spaces.map((s: { slug: string }) => s.slug)).toEqual(['personal', 'projects'])
  })
})

// ── get_space ──────────────────────────────────────────────

describe('get_space (integration)', () => {
  it('returns space with active_item_count', async () => {
    // getSpace uses from('pa_memory_spaces')
    queueFrom('pa_memory_spaces', createChain({
      data: {
        id: 's-1', name: 'Personal', slug: 'personal',
        description: 'd', icon: '👤', settings: {}, user_id: 'user-1',
        created_at: '2026-04-01T00:00:00Z', updated_at: '2026-04-01T00:00:00Z',
      },
      error: null,
    }))
    // countSpaceItems uses from('pa_memory_items')
    queueFrom('pa_memory_items', createChain({ count: 7, error: null }))

    const result = await mocks.registeredTools['get_space'].handler(
      { id_or_slug: 'personal' },
      { authInfo },
    )
    const { parsed } = parseToolResult(result)
    expect(parsed.space_id).toBe('s-1')
    expect(parsed.active_item_count).toBe(7)
  })

  it('returns not-found error when missing', async () => {
    queueFrom('pa_memory_spaces', createChain({ data: null, error: null }))

    const result = (await mocks.registeredTools['get_space'].handler(
      { id_or_slug: 'ghost' },
      { authInfo },
    )) as { isError?: boolean; content: Array<{ text: string }> }
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: Space not found')
  })
})

// ── update_space ───────────────────────────────────────────

describe('update_space (integration)', () => {
  it('updates name + icon through the real lib', async () => {
    const existing = {
      id: 's-1', user_id: 'user-1', name: 'Old', slug: 'x',
      description: null, icon: '🧠', settings: {},
      created_at: '', updated_at: '',
    }
    // getSpace lookup
    queueFrom('pa_memory_spaces', createChain({ data: existing, error: null }))
    // update
    queueFrom('pa_memory_spaces', createChain({ data: { ...existing, name: 'New', icon: '✨' }, error: null }))

    const result = await mocks.registeredTools['update_space'].handler(
      { id_or_slug: 'x', name: 'New', icon: '✨' },
      { authInfo },
    )
    const { parsed } = parseToolResult(result)
    expect(parsed.name).toBe('New')
    expect(parsed.icon).toBe('✨')
  })

  it('returns error when no fields given', async () => {
    const existing = {
      id: 's-1', user_id: 'user-1', name: 'X', slug: 'x',
      description: null, icon: '🧠', settings: {},
      created_at: '', updated_at: '',
    }
    queueFrom('pa_memory_spaces', createChain({ data: existing, error: null }))

    const result = (await mocks.registeredTools['update_space'].handler(
      { id_or_slug: 'x' },
      { authInfo },
    )) as { isError?: boolean; content: Array<{ text: string }> }
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('No fields to update')
  })
})

// ── delete_space ───────────────────────────────────────────

describe('delete_space (integration)', () => {
  it('blocks deleting default "personal"', async () => {
    const result = (await mocks.registeredTools['delete_space'].handler(
      { slug: 'personal' },
      { authInfo },
    )) as { isError?: boolean; content: Array<{ text: string }> }
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('Cannot delete default space')
  })

  it('blocks deleting default "projects"', async () => {
    const result = (await mocks.registeredTools['delete_space'].handler(
      { slug: 'projects' },
      { authInfo },
    )) as { isError?: boolean; content: Array<{ text: string }> }
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('Cannot delete default space')
  })

  it('deletes a custom space', async () => {
    // lookup + delete
    queueFrom('pa_memory_spaces', createChain({ data: { id: 's-7' }, error: null }))
    queueFrom('pa_memory_spaces', createChain({ data: null, error: null }))

    const result = await mocks.registeredTools['delete_space'].handler(
      { slug: 'work' },
      { authInfo },
    )
    const { parsed } = parseToolResult(result)
    expect(parsed).toEqual({ deleted: true, slug: 'work' })
  })

  it('returns error when space not found', async () => {
    queueFrom('pa_memory_spaces', createChain({ data: null, error: null }))

    const result = (await mocks.registeredTools['delete_space'].handler(
      { slug: 'ghost' },
      { authInfo },
    )) as { isError?: boolean; content: Array<{ text: string }> }
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('Space "ghost" not found')
  })
})
