import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, isAuthError } from '@/lib/finance/auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getSignedUrl, deleteFile } from '@/lib/documents/storage'

export const runtime = 'nodejs'

type Params = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  const auth = await authenticateRequest(request)
  if (isAuthError(auth)) return auth

  const { id } = await params

  const supabase = createServiceRoleClient()
  const { data: doc, error } = await supabase
    .from('wallet_documents')
    .select('id, name, description, doc_type, mime_type, file_size, tags, status, storage_path, created_at')
    .eq('id', id)
    .eq('user_id', auth.userId)
    .single()

  if (error || !doc) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  let viewUrl: string | null = null
  try {
    if (doc.status === 'ready' || doc.status === 'pending') {
      viewUrl = await getSignedUrl(doc.storage_path, 3600)
    }
  } catch {
    viewUrl = null
  }

  return NextResponse.json({ document: doc, view_url: viewUrl })
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await authenticateRequest(request)
  if (isAuthError(auth)) return auth

  const { id } = await params
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const supabase = createServiceRoleClient()

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.status === 'ready') updates.status = 'ready'
  if (typeof body.file_size === 'number') updates.file_size = body.file_size

  const { data, error } = await supabase
    .from('wallet_documents')
    .update(updates)
    .eq('id', id)
    .eq('user_id', auth.userId)
    .select('id, status, file_size')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ document: data })
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await authenticateRequest(request)
  if (isAuthError(auth)) return auth

  const { id } = await params
  const supabase = createServiceRoleClient()

  const { data: doc, error: fetchErr } = await supabase
    .from('wallet_documents')
    .select('storage_path')
    .eq('id', id)
    .eq('user_id', auth.userId)
    .single()

  if (fetchErr || !doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    await deleteFile(doc.storage_path)
  } catch {
    // Non-fatal — continue with row deletion even if storage removal failed.
  }

  const { error } = await supabase
    .from('wallet_documents')
    .delete()
    .eq('id', id)
    .eq('user_id', auth.userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return new NextResponse(null, { status: 204 })
}
