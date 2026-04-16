import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, isAuthError } from '@/lib/finance/auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { buildStoragePath, createSignedUploadUrl } from '@/lib/documents/storage'

export const runtime = 'nodejs'

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
])

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request)
  if (isAuthError(auth)) return auth

  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('wallet_documents')
    .select('id, name, description, doc_type, mime_type, file_size, tags, status, created_at')
    .eq('user_id', auth.userId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ documents: data || [] })
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request)
  if (isAuthError(auth)) return auth

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const mimeType = typeof body.mime_type === 'string' ? body.mime_type : ''
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })
  if (!ALLOWED_MIME.has(mimeType)) {
    return NextResponse.json({ error: `unsupported mime_type: ${mimeType}` }, { status: 400 })
  }

  const docType: 'pdf' | 'image' | 'other' =
    mimeType === 'application/pdf' ? 'pdf' : mimeType.startsWith('image/') ? 'image' : 'other'

  const storagePath = buildStoragePath(auth.userId, name.replace(/\s+/g, '-'))

  const supabase = createServiceRoleClient()
  const { data: doc, error: docErr } = await supabase
    .from('wallet_documents')
    .insert({
      user_id: auth.userId,
      name,
      description: typeof body.description === 'string' ? body.description : null,
      doc_type: docType,
      mime_type: mimeType,
      file_size: Number(body.file_size) || 0,
      storage_path: storagePath,
      tags: Array.isArray(body.tags) ? (body.tags as string[]) : [],
      extracted_text: null,
      status: 'pending',
    })
    .select('id, name, created_at, storage_path')
    .single()

  if (docErr) return NextResponse.json({ error: docErr.message }, { status: 500 })

  let uploadUrl: string
  try {
    uploadUrl = await createSignedUploadUrl(storagePath)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Signed URL failed' },
      { status: 500 }
    )
  }

  return NextResponse.json(
    {
      document: doc,
      upload_url: uploadUrl,
      storage_path: storagePath,
      mime_type: mimeType,
    },
    { status: 201 }
  )
}
