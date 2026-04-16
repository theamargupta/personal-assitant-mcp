import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { DEFAULT_SPACES, type MemorySpace } from './types'

export async function ensureDefaultSpaces(userId: string): Promise<void> {
  const supabase = createServiceRoleClient()

  const { count } = await supabase
    .from('pa_memory_spaces')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)

  if ((count || 0) > 0) return

  const rows = DEFAULT_SPACES.map((space) => ({
    user_id: userId,
    name: space.name,
    slug: space.slug,
    description: space.description,
    icon: space.icon,
  }))

  await supabase.from('pa_memory_spaces').insert(rows)
}

export async function resolveSpaceId(
  userId: string,
  slug: string
): Promise<string | null> {
  const supabase = createServiceRoleClient()

  const { data } = await supabase
    .from('pa_memory_spaces')
    .select('id')
    .eq('user_id', userId)
    .eq('slug', slug)
    .maybeSingle()

  return data?.id ?? null
}

export async function createSpace(
  userId: string,
  name: string,
  slug: string,
  description?: string,
  icon?: string
): Promise<MemorySpace> {
  const supabase = createServiceRoleClient()

  const { data, error } = await supabase
    .from('pa_memory_spaces')
    .insert({
      user_id: userId,
      name: name.trim(),
      slug,
      description: description?.trim() || null,
      icon: icon || '🧠',
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to create space: ${error.message}`)
  return data as MemorySpace
}

export async function deleteSpace(
  userId: string,
  slug: string
): Promise<void> {
  if (['personal', 'projects'].includes(slug)) {
    throw new Error(`Cannot delete default space "${slug}"`)
  }

  const supabase = createServiceRoleClient()

  // Verify the space exists and belongs to the user
  const { data: space } = await supabase
    .from('pa_memory_spaces')
    .select('id')
    .eq('user_id', userId)
    .eq('slug', slug)
    .maybeSingle()

  if (!space) throw new Error(`Space "${slug}" not found`)

  // Delete the space — pa_memory_items CASCADE will remove all memories in it
  const { error } = await supabase
    .from('pa_memory_spaces')
    .delete()
    .eq('id', space.id)
    .eq('user_id', userId)

  if (error) throw new Error(`Failed to delete space: ${error.message}`)
}

export async function listSpaces(userId: string): Promise<MemorySpace[]> {
  const supabase = createServiceRoleClient()

  const { data } = await supabase
    .from('pa_memory_spaces')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  return (data ?? []) as MemorySpace[]
}
