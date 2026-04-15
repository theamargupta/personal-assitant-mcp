import { createServiceRoleClient } from '@/lib/supabase/service-role'

export async function ensurePresetCategories(userId: string): Promise<void> {
  const supabase = createServiceRoleClient()

  const { count } = await supabase
    .from('spending_categories')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_preset', true)

  if ((count || 0) === 0) {
    await supabase.rpc('seed_preset_categories', { target_user_id: userId })
  }
}

export async function listCategories(userId: string) {
  await ensurePresetCategories(userId)

  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('spending_categories')
    .select('id, name, icon, is_preset, created_at')
    .eq('user_id', userId)
    .order('is_preset', { ascending: false })
    .order('name', { ascending: true })

  if (error) throw new Error(error.message)
  return data || []
}

export async function createCategory(
  userId: string,
  name: string,
  icon: string
) {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('spending_categories')
    .insert({
      user_id: userId,
      name: name.trim(),
      icon,
      is_preset: false,
    })
    .select('id, name, icon, is_preset, created_at')
    .single()

  if (error) {
    if (error.code === '23505') throw new Error('Category already exists')
    throw new Error(error.message)
  }
  return data
}

export async function deleteCategory(userId: string, categoryId: string) {
  const supabase = createServiceRoleClient()

  // Prevent deleting presets
  const { data: cat } = await supabase
    .from('spending_categories')
    .select('is_preset')
    .eq('id', categoryId)
    .eq('user_id', userId)
    .single()

  if (!cat) throw new Error('Category not found')
  if (cat.is_preset) throw new Error('Cannot delete preset categories')

  const { error } = await supabase
    .from('spending_categories')
    .delete()
    .eq('id', categoryId)
    .eq('user_id', userId)

  if (error) throw new Error(error.message)
}
