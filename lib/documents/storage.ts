import { createServiceRoleClient } from '@/lib/supabase/service-role'

const BUCKET = 'documents'

export async function uploadFile(
  userId: string,
  fileName: string,
  fileBuffer: Buffer,
  mimeType: string
): Promise<string> {
  const supabase = createServiceRoleClient()
  const storagePath = `${userId}/${Date.now()}-${fileName}`

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, fileBuffer, {
      contentType: mimeType,
      upsert: false,
    })

  if (error) throw new Error(`Upload failed: ${error.message}`)
  return storagePath
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
