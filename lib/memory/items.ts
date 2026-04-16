import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { generateEmbedding } from '@/lib/documents/embed'
import { ensureDefaultSpaces, resolveSpaceId } from './spaces'
import type { MemoryItem, MemoryCategory } from './types'

function embeddingStringForRpc(embedding: unknown): string {
  if (embedding == null) return JSON.stringify([])
  if (typeof embedding === 'string') return embedding
  return JSON.stringify(embedding)
}

export type SaveMemoryResult =
  | { status: 'saved'; memory: MemoryItem }
  | {
      status: 'duplicates_found'
      pending_memory: {
        title: string
        content: string
        category: string
        tags: string[]
        project: string | null
        space: string
      }
      similar_memories: Array<{
        id: string
        title: string
        content: string
        category: string
        similarity: number
        updated_at: string
        space_slug: string
      }>
      suggestion: string
    }

export async function saveMemory(params: {
  userId: string
  spaceSlug: string
  title: string
  content: string
  category: MemoryCategory
  tags: string[]
  project?: string
  importance?: number
  force?: boolean
}): Promise<SaveMemoryResult> {
  const { userId, spaceSlug, title, content, category, tags, project, importance = 5, force = false } = params

  await ensureDefaultSpaces(userId)

  const spaceId = await resolveSpaceId(userId, spaceSlug)
  if (!spaceId) throw new Error(`Space "${spaceSlug}" not found`)

  const embeddingText = `${title}\n\n${content}`
  const embedding = await generateEmbedding(embeddingText)

  if (!force) {
    const supabase = createServiceRoleClient()
    const { data: matches, error: matchError } = await supabase.rpc('pa_match_memories', {
      query_embedding: JSON.stringify(embedding),
      filter_user_id: userId,
      filter_space_slug: null,
      filter_category: null,
      filter_project: null,
      match_count: 5,
      match_threshold: 0.9,
    })

    if (!matchError && matches && (matches as unknown[]).length > 0) {
      const rows = matches as Array<{
        id: string
        title: string
        content: string
        category: string
        similarity: number
        updated_at: string
        space_slug: string
      }>
      return {
        status: 'duplicates_found',
        pending_memory: {
          title,
          content,
          category,
          tags,
          project: project?.trim() || null,
          space: spaceSlug,
        },
        similar_memories: rows.map((m) => ({
          id: m.id,
          title: m.title,
          content: m.content,
          category: m.category,
          similarity: Math.round(m.similarity * 1000) / 1000,
          updated_at: m.updated_at,
          space_slug: m.space_slug,
        })),
        suggestion: `Found ${rows.length} similar memor${rows.length === 1 ? 'y' : 'ies'} (≥90% match). Review before saving. Use force=true to save anyway.`,
      }
    }
  }

  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('pa_memory_items')
    .insert({
      space_id: spaceId,
      user_id: userId,
      title: title.trim(),
      content: content.trim(),
      category,
      tags,
      project: project?.trim() || null,
      embedding: JSON.stringify(embedding),
      importance,
      source: 'manual',
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to save memory: ${error.message}`)
  return { status: 'saved', memory: data as MemoryItem }
}

export type HybridSearchResult = MemoryItem & {
  space_slug: string
  semantic_score: number
  keyword_score: number
  final_score: number
  stale_hint: string | null
}

export async function searchMemories(params: {
  userId: string
  query: string
  spaceSlug?: string
  category?: string
  project?: string
  limit: number
}): Promise<HybridSearchResult[]> {
  const { userId, query, spaceSlug, category, project, limit } = params

  await ensureDefaultSpaces(userId)

  const queryEmbedding = await generateEmbedding(query)

  const supabase = createServiceRoleClient()
  const { data, error } = await supabase.rpc('pa_hybrid_search', {
    query_embedding: JSON.stringify(queryEmbedding),
    query_text: query,
    filter_user_id: userId,
    filter_space_slug: spaceSlug || null,
    filter_category: category || null,
    filter_project: project || null,
    match_count: limit,
  })

  if (error) throw new Error(`Search failed: ${error.message}`)

  const rows = (data ?? []) as Array<
    MemoryItem & {
      space_slug: string
      semantic_score: number
      keyword_score: number
      final_score: number
    }
  >
  const ids = rows.map((r) => r.id)
  if (ids.length > 0) {
    void (async () => {
      try {
        await supabase.rpc('pa_increment_memory_importance', { memory_ids: ids, boost: 0.1 })
      } catch {
        /* non-fatal */
      }
    })()
  }

  return rows.map((r) => ({
    ...r,
    stale_hint: computeStaleHint(r),
  }))
}

export function computeStaleHint(memory: {
  valid_at: string
  invalid_at: string | null
  importance: number
}): string | null {
  if (memory.invalid_at) {
    return 'This memory has been superseded.'
  }

  const now = new Date()
  const validAt = new Date(memory.valid_at)
  const daysSinceValid = Math.floor((now.getTime() - validAt.getTime()) / (1000 * 60 * 60 * 24))

  if (daysSinceValid > 90 && memory.importance < 2.0) {
    const months = Math.floor(daysSinceValid / 30)
    return `This memory is ${months} month${months > 1 ? 's' : ''} old with low access (importance: ${memory.importance.toFixed(1)}). May be outdated.`
  }

  return null
}

export async function listMemories(params: {
  userId: string
  spaceSlug?: string
  category?: string
  project?: string
  tag?: string
  limit: number
  offset: number
}): Promise<Array<MemoryItem & { stale_hint: string | null }>> {
  const { userId, spaceSlug, category, project, tag, limit, offset } = params

  await ensureDefaultSpaces(userId)

  const supabase = createServiceRoleClient()
  let query = supabase
    .from('pa_memory_items')
    .select('*, pa_memory_spaces!inner(slug)')
    .eq('user_id', userId)
    .eq('is_active', true)
    .is('invalid_at', null)
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (spaceSlug) {
    query = query.eq('pa_memory_spaces.slug', spaceSlug)
  }
  if (category) {
    query = query.eq('category', category)
  }
  if (project) {
    query = query.eq('project', project)
  }
  if (tag) {
    query = query.contains('tags', [tag])
  }

  const { data } = await query
  return ((data ?? []) as MemoryItem[]).map((m) => ({
    ...m,
    stale_hint: computeStaleHint(m),
  }))
}

export async function getMemory(
  userId: string,
  memoryId: string
): Promise<MemoryItem | null> {
  const supabase = createServiceRoleClient()

  const { data } = await supabase
    .from('pa_memory_items')
    .select('*')
    .eq('id', memoryId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle()

  return data as MemoryItem | null
}

export async function updateMemory(params: {
  userId: string
  memoryId: string
  title?: string
  content?: string
  category?: MemoryCategory
  tags?: string[]
  project?: string | null
  spaceSlug?: string
}): Promise<MemoryItem> {
  const { userId, memoryId, title, content, category, tags, project, spaceSlug } = params

  const supabase = createServiceRoleClient()

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (title !== undefined) updates.title = title.trim()
  if (content !== undefined) updates.content = content.trim()
  if (category !== undefined) updates.category = category
  if (tags !== undefined) updates.tags = tags
  if (project !== undefined) updates.project = project?.trim() || null

  if (spaceSlug) {
    const spaceId = await resolveSpaceId(userId, spaceSlug)
    if (!spaceId) throw new Error(`Space "${spaceSlug}" not found`)
    updates.space_id = spaceId
  }

  if (title !== undefined || content !== undefined) {
    const existing = await getMemory(userId, memoryId)
    if (!existing) throw new Error('Memory not found')

    const newTitle = title ?? existing.title
    const newContent = content ?? existing.content
    const embedding = await generateEmbedding(`${newTitle}\n\n${newContent}`)
    updates.embedding = JSON.stringify(embedding)
  }

  const { data, error } = await supabase
    .from('pa_memory_items')
    .update(updates)
    .eq('id', memoryId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .select()
    .single()

  if (error) throw new Error(`Update failed: ${error.message}`)
  return data as MemoryItem
}

export async function deleteMemory(
  userId: string,
  memoryId: string
): Promise<void> {
  const supabase = createServiceRoleClient()

  const { error } = await supabase
    .from('pa_memory_items')
    .update({
      is_active: false,
      invalid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', memoryId)
    .eq('user_id', userId)

  if (error) throw new Error(`Delete failed: ${error.message}`)
}

export async function getContext(
  userId: string,
  project: string
): Promise<MemoryItem[]> {
  const supabase = createServiceRoleClient()

  const { data } = await supabase
    .from('pa_memory_items')
    .select('*')
    .eq('user_id', userId)
    .eq('project', project)
    .eq('is_active', true)
    .is('invalid_at', null)
    .order('category', { ascending: true })
    .order('importance', { ascending: false })

  return (data ?? []) as MemoryItem[]
}

export async function getRules(
  userId: string,
  project?: string
): Promise<MemoryItem[]> {
  const supabase = createServiceRoleClient()

  let query = supabase
    .from('pa_memory_items')
    .select('*')
    .eq('user_id', userId)
    .eq('category', 'rule')
    .eq('is_active', true)
    .is('invalid_at', null)
    .order('importance', { ascending: false })

  if (project) {
    query = query.eq('project', project)
  }

  const { data } = await query
  return (data ?? []) as MemoryItem[]
}

export interface ConsolidateResult {
  duplicate_groups: Array<{
    memories: Array<{
      id: string
      title: string
      content: string
      category: string
      importance: number
      created_at: string
    }>
    max_similarity: number
  }>
  stale_memories: Array<{
    id: string
    title: string
    valid_at: string
    importance: number
    category: string
    reason: string
  }>
  total_groups: number
  total_stale: number
}

export async function consolidateMemories(params: {
  userId: string
  spaceSlug?: string
  mode: 'duplicates' | 'stale' | 'both'
}): Promise<ConsolidateResult> {
  const { userId, spaceSlug, mode } = params
  const supabase = createServiceRoleClient()

  const result: ConsolidateResult = {
    duplicate_groups: [],
    stale_memories: [],
    total_groups: 0,
    total_stale: 0,
  }

  if (mode === 'duplicates' || mode === 'both') {
    const baseSelect =
      'id, title, content, category, importance, created_at, valid_at, invalid_at, embedding'

    const { data: allMemories } = spaceSlug
      ? await supabase
          .from('pa_memory_items')
          .select(
            `${baseSelect}, pa_memory_spaces!inner(slug)`,
          )
          .eq('user_id', userId)
          .eq('is_active', true)
          .is('invalid_at', null)
          .eq('pa_memory_spaces.slug', spaceSlug)
          .order('created_at', { ascending: true })
      : await supabase
          .from('pa_memory_items')
          .select(baseSelect)
          .eq('user_id', userId)
          .eq('is_active', true)
          .is('invalid_at', null)
          .order('created_at', { ascending: true })
    const memories = (allMemories ?? []) as Array<{
      id: string
      title: string
      content: string
      category: string
      importance: number
      created_at: string
      embedding: unknown
    }>

    const byId = new Map(memories.map((m) => [m.id, m]))
    const seen = new Set<string>()

    for (const mem of memories) {
      if (seen.has(mem.id)) continue
      if (mem.embedding == null) continue

      const { data: matches } = await supabase.rpc('pa_match_memories', {
        query_embedding: embeddingStringForRpc(mem.embedding),
        filter_user_id: userId,
        filter_space_slug: spaceSlug || null,
        filter_category: null,
        filter_project: null,
        match_count: 10,
        match_threshold: 0.9,
      })

      const matchRows = (matches ?? []) as Array<{
        id: string
        similarity: number
        title: string
        content: string
        category: string
        importance: number
      }>

      const others = matchRows.filter((m) => m.id !== mem.id && !seen.has(m.id))
      if (others.length === 0) continue

      const maxSimilarity = Math.max(...others.map((o) => o.similarity))
      const groupMemories = [
        {
          id: mem.id,
          title: mem.title,
          content: mem.content,
          category: mem.category,
          importance: mem.importance,
          created_at: mem.created_at,
        },
        ...others.map((o) => {
          const full = byId.get(o.id)
          return {
            id: o.id,
            title: full?.title ?? o.title,
            content: full?.content ?? o.content,
            category: full?.category ?? o.category,
            importance: full?.importance ?? o.importance,
            created_at: full?.created_at ?? '',
          }
        }),
      ]

      result.duplicate_groups.push({
        memories: groupMemories,
        max_similarity: Math.round(maxSimilarity * 1000) / 1000,
      })

      seen.add(mem.id)
      for (const o of others) seen.add(o.id)
    }

    result.total_groups = result.duplicate_groups.length
  }

  if (mode === 'stale' || mode === 'both') {
    const staleSelect = 'id, title, valid_at, invalid_at, importance, category'

    const { data: candidates } = spaceSlug
      ? await supabase
          .from('pa_memory_items')
          .select(`${staleSelect}, pa_memory_spaces!inner(slug)`)
          .eq('user_id', userId)
          .eq('is_active', true)
          .eq('pa_memory_spaces.slug', spaceSlug)
          .order('valid_at', { ascending: true })
      : await supabase
          .from('pa_memory_items')
          .select(staleSelect)
          .eq('user_id', userId)
          .eq('is_active', true)
          .order('valid_at', { ascending: true })
    for (const mem of (candidates ?? []) as Array<{
      id: string
      title: string
      valid_at: string
      invalid_at: string | null
      importance: number
      category: string
    }>) {
      const hint = computeStaleHint(mem)
      if (hint) {
        result.stale_memories.push({
          id: mem.id,
          title: mem.title,
          valid_at: mem.valid_at,
          importance: mem.importance,
          category: mem.category,
          reason: hint,
        })
      }
    }
    result.total_stale = result.stale_memories.length
  }

  return result
}
