import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Supabase chain mock ────────────────────────────────────

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
  maybeSingle: ReturnType<typeof vi.fn>
  single: ReturnType<typeof vi.fn>
  order: ReturnType<typeof vi.fn>
  is: ReturnType<typeof vi.fn>
  then: (resolve: (v: QueryResult) => unknown) => Promise<unknown>
}

function createChain(result: QueryResult = { data: null, error: null }): Chain {
  const chain = {} as Chain
  const methods: (keyof Chain)[] = ['select', 'insert', 'update', 'delete', 'eq', 'order', 'is']
  for (const m of methods) {
    ;(chain as Record<string, unknown>)[m] = vi.fn().mockReturnValue(chain)
  }
  chain.single = vi.fn().mockResolvedValue(result)
  chain.maybeSingle = vi.fn().mockResolvedValue(result)
  chain.then = (resolve) => Promise.resolve(result).then(resolve)
  return chain
}

const mocks = vi.hoisted(() => ({
  queues: new Map<string, unknown[]>(),
  client: { from: vi.fn() },
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => mocks.client),
}))

function queue(table: string, chain: Chain) {
  const list = (mocks.queues.get(table) ?? []) as Chain[]
  list.push(chain)
  mocks.queues.set(table, list)
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.queues = new Map()
  mocks.client.from.mockImplementation((table: string) => {
    const list = (mocks.queues.get(table) ?? []) as Chain[]
    if (list.length > 0) return list.shift()!
    return createChain()
  })
})

import {
  ensureDefaultSpaces,
  resolveSpaceId,
  createSpace,
  deleteSpace,
  getSpace,
  updateSpace,
  countSpaceItems,
  listSpaces,
} from '@/lib/memory/spaces'

describe('ensureDefaultSpaces', () => {
  it('seeds default spaces when user has none', async () => {
    const countChain = createChain({ count: 0, error: null })
    const insertChain = createChain({ data: null, error: null })
    queue('pa_memory_spaces', countChain)
    queue('pa_memory_spaces', insertChain)

    await ensureDefaultSpaces('user-1')

    expect(countChain.select).toHaveBeenCalledWith('*', { count: 'exact', head: true })
    expect(countChain.eq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(insertChain.insert).toHaveBeenCalled()
    const insertArg = insertChain.insert.mock.calls[0][0]
    expect(Array.isArray(insertArg)).toBe(true)
    expect(insertArg).toHaveLength(2)
    expect(insertArg.map((r: { slug: string }) => r.slug)).toEqual(['personal', 'projects'])
  })

  it('skips seeding when user already has spaces', async () => {
    const countChain = createChain({ count: 5, error: null })
    queue('pa_memory_spaces', countChain)

    await ensureDefaultSpaces('user-1')

    expect(countChain.select).toHaveBeenCalled()
    // No second insert chain consumed
    expect((mocks.queues.get('pa_memory_spaces') as Chain[]).length).toBe(0)
  })

  it('treats null count as zero and seeds', async () => {
    const countChain = createChain({ count: null, error: null })
    const insertChain = createChain({ data: null, error: null })
    queue('pa_memory_spaces', countChain)
    queue('pa_memory_spaces', insertChain)

    await ensureDefaultSpaces('user-1')
    expect(insertChain.insert).toHaveBeenCalled()
  })
})

describe('resolveSpaceId', () => {
  it('returns the id when slug exists', async () => {
    const chain = createChain({ data: { id: 'space-123' }, error: null })
    queue('pa_memory_spaces', chain)

    const id = await resolveSpaceId('user-1', 'personal')
    expect(id).toBe('space-123')
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(chain.eq).toHaveBeenCalledWith('slug', 'personal')
  })

  it('returns null when slug does not exist', async () => {
    const chain = createChain({ data: null, error: null })
    queue('pa_memory_spaces', chain)

    const id = await resolveSpaceId('user-1', 'missing')
    expect(id).toBeNull()
  })
})

describe('createSpace', () => {
  it('inserts and returns the new space', async () => {
    const newSpace = {
      id: 's-new',
      user_id: 'user-1',
      name: 'Work',
      slug: 'work',
      description: 'Job stuff',
      icon: '💼',
      settings: {},
      created_at: '2026-04-01',
      updated_at: '2026-04-01',
    }
    const chain = createChain({ data: newSpace, error: null })
    queue('pa_memory_spaces', chain)

    const result = await createSpace('user-1', '  Work  ', 'work', '  Job stuff  ', '💼')
    expect(result).toEqual(newSpace)
    expect(chain.insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      name: 'Work',
      slug: 'work',
      description: 'Job stuff',
      icon: '💼',
    })
  })

  it('defaults icon to brain emoji', async () => {
    const chain = createChain({
      data: { id: 's', user_id: 'user-1', name: 'X', slug: 'x', description: null, icon: '🧠', settings: {}, created_at: '', updated_at: '' },
      error: null,
    })
    queue('pa_memory_spaces', chain)

    await createSpace('user-1', 'X', 'x')
    expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({ icon: '🧠', description: null }))
  })

  it('throws when supabase returns an error', async () => {
    const chain = createChain({ data: null, error: { message: 'duplicate' } })
    queue('pa_memory_spaces', chain)

    await expect(createSpace('user-1', 'X', 'x')).rejects.toThrow('Failed to create space: duplicate')
  })
})

describe('deleteSpace', () => {
  it('blocks deletion of personal default space', async () => {
    await expect(deleteSpace('user-1', 'personal')).rejects.toThrow('Cannot delete default space "personal"')
  })

  it('blocks deletion of projects default space', async () => {
    await expect(deleteSpace('user-1', 'projects')).rejects.toThrow('Cannot delete default space "projects"')
  })

  it('throws when space not found', async () => {
    const lookup = createChain({ data: null, error: null })
    queue('pa_memory_spaces', lookup)

    await expect(deleteSpace('user-1', 'ghost')).rejects.toThrow('Space "ghost" not found')
  })

  it('deletes existing custom space', async () => {
    const lookup = createChain({ data: { id: 'space-7' }, error: null })
    const del = createChain({ data: null, error: null })
    queue('pa_memory_spaces', lookup)
    queue('pa_memory_spaces', del)

    await deleteSpace('user-1', 'work')
    expect(del.delete).toHaveBeenCalled()
    expect(del.eq).toHaveBeenCalledWith('id', 'space-7')
    expect(del.eq).toHaveBeenCalledWith('user_id', 'user-1')
  })

  it('throws when delete fails', async () => {
    const lookup = createChain({ data: { id: 'space-7' }, error: null })
    const del = createChain({ data: null, error: { message: 'oops' } })
    queue('pa_memory_spaces', lookup)
    queue('pa_memory_spaces', del)

    await expect(deleteSpace('user-1', 'work')).rejects.toThrow('Failed to delete space: oops')
  })
})

describe('getSpace', () => {
  it('filters by id when argument looks like a UUID', async () => {
    const uuid = '11111111-2222-3333-4444-555555555555'
    const chain = createChain({
      data: { id: uuid, name: 'X', slug: 'x', user_id: 'user-1', description: null, icon: '🧠', settings: {}, created_at: '', updated_at: '' },
      error: null,
    })
    queue('pa_memory_spaces', chain)

    const space = await getSpace('user-1', uuid)
    expect(space?.id).toBe(uuid)
    expect(chain.eq).toHaveBeenCalledWith('id', uuid)
  })

  it('filters by slug when argument is not a UUID', async () => {
    const chain = createChain({
      data: { id: 's-1', name: 'Personal', slug: 'personal', user_id: 'user-1', description: null, icon: '🧠', settings: {}, created_at: '', updated_at: '' },
      error: null,
    })
    queue('pa_memory_spaces', chain)

    const space = await getSpace('user-1', 'personal')
    expect(space?.slug).toBe('personal')
    expect(chain.eq).toHaveBeenCalledWith('slug', 'personal')
  })

  it('returns null when row is missing', async () => {
    const chain = createChain({ data: null, error: null })
    queue('pa_memory_spaces', chain)
    expect(await getSpace('user-1', 'gone')).toBeNull()
  })
})

describe('updateSpace', () => {
  it('updates name, description, and icon', async () => {
    const existing = { id: 's-1', name: 'Old', slug: 'x', user_id: 'user-1', description: null, icon: '🧠', settings: {}, created_at: '', updated_at: '' }
    const lookup = createChain({ data: existing, error: null })
    const update = createChain({ data: { ...existing, name: 'New', description: 'desc', icon: '✨' }, error: null })
    queue('pa_memory_spaces', lookup)
    queue('pa_memory_spaces', update)

    const result = await updateSpace('user-1', 'x', { name: '  New  ', description: '  desc  ', icon: '✨' })
    expect(result.name).toBe('New')
    expect(update.update).toHaveBeenCalledWith({
      name: 'New',
      description: 'desc',
      icon: '✨',
    })
  })

  it('clears description when null is passed', async () => {
    const existing = { id: 's-1', name: 'X', slug: 'x', user_id: 'user-1', description: 'd', icon: '🧠', settings: {}, created_at: '', updated_at: '' }
    const lookup = createChain({ data: existing, error: null })
    const update = createChain({ data: { ...existing, description: null }, error: null })
    queue('pa_memory_spaces', lookup)
    queue('pa_memory_spaces', update)

    await updateSpace('user-1', 'x', { description: null })
    expect(update.update).toHaveBeenCalledWith({ description: null })
  })

  it('throws when space not found', async () => {
    const lookup = createChain({ data: null, error: null })
    queue('pa_memory_spaces', lookup)

    await expect(updateSpace('user-1', 'ghost', { name: 'X' })).rejects.toThrow('Space not found')
  })

  it('throws when no fields provided', async () => {
    const existing = { id: 's-1', name: 'X', slug: 'x', user_id: 'user-1', description: null, icon: '🧠', settings: {}, created_at: '', updated_at: '' }
    const lookup = createChain({ data: existing, error: null })
    queue('pa_memory_spaces', lookup)

    await expect(updateSpace('user-1', 'x', {})).rejects.toThrow('No fields to update')
  })

  it('throws when update fails', async () => {
    const existing = { id: 's-1', name: 'X', slug: 'x', user_id: 'user-1', description: null, icon: '🧠', settings: {}, created_at: '', updated_at: '' }
    const lookup = createChain({ data: existing, error: null })
    const update = createChain({ data: null, error: { message: 'oops' } })
    queue('pa_memory_spaces', lookup)
    queue('pa_memory_spaces', update)

    await expect(updateSpace('user-1', 'x', { name: 'Y' })).rejects.toThrow('Failed to update space: oops')
  })
})

describe('countSpaceItems', () => {
  it('returns count from supabase', async () => {
    const chain = createChain({ count: 11, error: null })
    queue('pa_memory_items', chain)

    const n = await countSpaceItems('user-1', 'space-1')
    expect(n).toBe(11)
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(chain.eq).toHaveBeenCalledWith('space_id', 'space-1')
    expect(chain.eq).toHaveBeenCalledWith('is_active', true)
  })

  it('returns 0 when count is null', async () => {
    const chain = createChain({ count: null, error: null })
    queue('pa_memory_items', chain)

    expect(await countSpaceItems('user-1', 'space-1')).toBe(0)
  })
})

describe('listSpaces', () => {
  it('returns all user spaces ordered by created_at', async () => {
    const rows = [
      { id: 's-1', user_id: 'user-1', name: 'Personal', slug: 'personal', description: null, icon: '👤', settings: {}, created_at: '2026-01-01', updated_at: '2026-01-01' },
      { id: 's-2', user_id: 'user-1', name: 'Projects', slug: 'projects', description: null, icon: '📁', settings: {}, created_at: '2026-01-02', updated_at: '2026-01-02' },
    ]
    const chain = createChain({ data: rows, error: null })
    queue('pa_memory_spaces', chain)

    const result = await listSpaces('user-1')
    expect(result).toEqual(rows)
    expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: true })
  })

  it('returns empty array when data is null', async () => {
    const chain = createChain({ data: null, error: null })
    queue('pa_memory_spaces', chain)

    expect(await listSpaces('user-1')).toEqual([])
  })
})
