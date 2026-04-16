import { createServiceRoleClient } from '@/lib/supabase/service-role'

const BUCKET = 'documents'

export function buildStoragePath(userId: string, fileName: string): string {
  return `${userId}/${Date.now()}-${fileName}`
}

export async function createSignedUploadUrl(storagePath: string): Promise<string> {
  const supabase = createServiceRoleClient()

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(storagePath)

  if (error) throw new Error(`Signed upload URL failed: ${error.message}`)
  return data.signedUrl
}

export async function getSignedUrl(storagePath: string, expiresInSeconds = 3600): Promise<string> {
  const supabase = createServiceRoleClient()

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds)

  if (error) throw new Error(`Signed URL failed: ${error.message}`)
  return data.signedUrl
}

export async function downloadFile(storagePath: string): Promise<Buffer> {
  const supabase = createServiceRoleClient()

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(storagePath)

  if (error) throw new Error(`Download failed: ${error.message}`)
  return Buffer.from(await data.arrayBuffer())
}

export async function deleteFile(storagePath: string): Promise<void> {
  const supabase = createServiceRoleClient()

  const { error } = await supabase.storage
    .from(BUCKET)
    .remove([storagePath])

  if (error) throw new Error(`Delete failed: ${error.message}`)
}
