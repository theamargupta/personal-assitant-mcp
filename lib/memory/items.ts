import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { generateEmbedding } from '@/lib/documents/embed'
import { ensureDefaultSpaces, resolveSpaceId } from './spaces'
import type { MemoryItem, MemoryCategory } from './types'

export async function saveMemory(params: {
  userId: string
  spaceSlug: string
  title: string
  content: string
  category: MemoryCategory
  tags: string[]
  project?: string
}): Promise<MemoryItem> {
  const { userId, spaceSlug, title, content, category, tags, project } = params

  await ensureDefaultSpaces(userId)

  const spaceId = await resolveSpaceId(userId, spaceSlug)
  if (!spaceId) throw new Error(`Space "${spaceSlug}" not found`)

  const embeddingText = `${title}\n\n${content}`
  const embedding = await generateEmbedding(embeddingText)

  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('memory_items')
    .insert({
      space_id: spaceId,
      user_id: userId,
      title: title.trim(),
      content: content.trim(),
      category,
      tags,
      project: project?.trim() || null,
      embedding: JSON.stringify(embedding),
      source: 'manual',
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to save memory: ${error.message}`)
  return data as MemoryItem
}

export async function searchMemories(params: {
  userId: string
  query: string
  spaceSlug?: string
  category?: string
  project?: string
  limit: number
}): Promise<Array<MemoryItem & { similarity: number; space_slug: string }>> {
  const { userId, query, spaceSlug, category, project, limit } = params

  await ensureDefaultSpaces(userId)

  const queryEmbedding = await generateEmbedding(query)

  const supabase = createServiceRoleClient()
  const { data, error } = await supabase.rpc('match_memories', {
    query_embedding: JSON.stringify(queryEmbedding),
    filter_user_id: userId,
    filter_space_slug: spaceSlug || null,
    filter_category: category || null,
    filter_project: project || null,
    match_count: limit,
    match_threshold: 0.3,
  })

  if (error) throw new Error(`Search failed: ${error.message}`)

  const rows = (data ?? []) as Array<MemoryItem & { similarity: number; space_slug: string }>
  const ids = rows.map((r) => r.id)
  if (ids.length > 0) {
    void (async () => {
      try {
        await supabase.rpc('increment_memory_importance', { memory_ids: ids, boost: 0.1 })
      } catch {
        /* non-fatal */
      }
    })()
  }

  return rows
}

export async function listMemories(params: {
  userId: string
  spaceSlug?: string
  category?: string
  project?: string
  tag?: string
  limit: number
  offset: number
}): Promise<MemoryItem[]> {
  const { userId, spaceSlug, category, project, tag, limit, offset } = params

  await ensureDefaultSpaces(userId)

  const supabase = createServiceRoleClient()
  let query = supabase
    .from('memory_items')
    .select('*, memory_spaces!inner(slug)')
    .eq('user_id', userId)
    .eq('is_active', true)
    .is('invalid_at', null)
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (spaceSlug) {
    query = query.eq('memory_spaces.slug', spaceSlug)
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
  return (data ?? []) as MemoryItem[]
}

export async function getMemory(
  userId: string,
  memoryId: string
): Promise<MemoryItem | null> {
  const supabase = createServiceRoleClient()

  const { data } = await supabase
    .from('memory_items')
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
    .from('memory_items')
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
    .from('memory_items')
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
    .from('memory_items')
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
    .from('memory_items')
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
