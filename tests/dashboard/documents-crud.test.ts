import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@/lib/supabase/client'

type QueryResult = { data?: any; error?: { message: string } | null }
type QueryChain = Record<string, ReturnType<typeof vi.fn>> & {
  then: (resolve: (value: QueryResult) => unknown, reject?: (reason: unknown) => unknown) => Promise<unknown>
}

const mocks = vi.hoisted(() => ({
  deleteOrder: [] as string[],
  storageBucket: {
    upload: vi.fn(async () => ({ data: { path: 'test-user/file.pdf' }, error: null })),
    remove: vi.fn(async () => ({ error: null })),
    createSignedUrl: vi.fn(async () => ({ data: { signedUrl: 'https://signed.example/doc.pdf' }, error: null })),
  },
  supabase: {
    from: vi.fn(),
    storage: {
      from: vi.fn(),
    },
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'test-user' } }, error: null })),
    },
  },
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => mocks.supabase),
}))

const methods = ['select', 'insert', 'update', 'delete', 'eq', 'order', 'single', 'maybeSingle']

function createQuery(result: QueryResult = { data: null, error: null }, table?: string): QueryChain {
  const chain = {} as QueryChain
  for (const method of methods) chain[method] = vi.fn().mockReturnValue(chain)
  chain.delete = vi.fn(() => {
    if (table) mocks.deleteOrder.push(table)
    return chain
  })
  chain.single = vi.fn().mockResolvedValue(result)
  chain.maybeSingle = vi.fn().mockResolvedValue(result)
  chain.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject)
  return chain
}

function detectDocType(mimeType: string) {
  if (mimeType === 'application/pdf') return 'pdf'
  if (mimeType.startsWith('image/')) return 'image'
  return 'other'
}

async function uploadDocument(file: { name: string; type: string; size: number }, form: {
  name: string
  description: string
  tags: string
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const storagePath = `${user.id}/uuid-1_${safeName}`
  const tags = form.tags ? form.tags.split(',').map((tag) => tag.trim()).filter(Boolean) : []

  const { data: docRow, error: insertError } = await supabase
    .from('wallet_documents')
    .insert({
      user_id: user.id,
      name: form.name.trim() || file.name,
      description: form.description.trim() || null,
      doc_type: detectDocType(file.type),
      mime_type: file.type || 'application/octet-stream',
      file_size: file.size,
      storage_path: storagePath,
      tags,
      status: 'pending',
    })
    .select('id')
    .single()

  if (insertError || !docRow) return { error: insertError }

  await supabase.storage
    .from('documents')
    .upload(storagePath, file, { contentType: file.type || 'application/octet-stream' })

  return { storagePath, docRow }
}

async function deleteDocument(doc: { id: string; storage_path: string }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  await supabase.storage.from('documents').remove([doc.storage_path])
  await supabase.from('wallet_document_chunks').delete().eq('document_id', doc.id).eq('user_id', user.id)
  await supabase.from('wallet_documents').delete().eq('id', doc.id).eq('user_id', user.id)
}

async function downloadDocument(doc: { storage_path: string }) {
  const supabase = createClient()
  return supabase.storage.from('documents').createSignedUrl(doc.storage_path, 3600)
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.deleteOrder = []
  mocks.supabase.storage.from.mockReturnValue(mocks.storageBucket)
  mocks.storageBucket.remove.mockImplementation(async () => {
    mocks.deleteOrder.push('storage')
    return { error: null }
  })
  mocks.supabase.from.mockImplementation((table: string) => {
    if (table === 'wallet_documents') {
      return createQuery({ data: { id: 'doc-1' }, error: null }, table)
    }
    return createQuery({ error: null }, table)
  })
})

describe('dashboard documents CRUD logic', () => {
  it('upload creates document record with pending status', async () => {
    const docChain = createQuery({ data: { id: 'doc-1' }, error: null }, 'wallet_documents')
    mocks.supabase.from.mockReturnValue(docChain)

    await uploadDocument(
      { name: 'bill april.pdf', type: 'application/pdf', size: 2048 },
      { name: ' April Bill ', description: ' electricity ', tags: 'bill, electricity' }
    )

    expect(docChain.insert).toHaveBeenCalledWith({
      user_id: 'test-user',
      name: 'April Bill',
      description: 'electricity',
      doc_type: 'pdf',
      mime_type: 'application/pdf',
      file_size: 2048,
      storage_path: 'test-user/uuid-1_bill_april.pdf',
      tags: ['bill', 'electricity'],
      status: 'pending',
    })
  })

  it('upload calls storage.upload with correct path', async () => {
    await uploadDocument(
      { name: 'scan.png', type: 'image/png', size: 1024 },
      { name: 'Scan', description: '', tags: '' }
    )

    expect(mocks.supabase.storage.from).toHaveBeenCalledWith('documents')
    expect(mocks.storageBucket.upload).toHaveBeenCalledWith(
      'test-user/uuid-1_scan.png',
      { name: 'scan.png', type: 'image/png', size: 1024 },
      { contentType: 'image/png' }
    )
  })

  it('delete removes storage file, chunks, and document in order', async () => {
    await deleteDocument({ id: 'doc-1', storage_path: 'test-user/doc.pdf' })

    expect(mocks.storageBucket.remove).toHaveBeenCalledWith(['test-user/doc.pdf'])
    expect(mocks.deleteOrder).toEqual(['storage', 'wallet_document_chunks', 'wallet_documents'])
    expect(mocks.supabase.from).toHaveBeenNthCalledWith(1, 'wallet_document_chunks')
    expect(mocks.supabase.from).toHaveBeenNthCalledWith(2, 'wallet_documents')
  })

  it('download creates signed URL with 1hr expiry', async () => {
    const result = await downloadDocument({ storage_path: 'test-user/doc.pdf' })

    expect(mocks.storageBucket.createSignedUrl).toHaveBeenCalledWith('test-user/doc.pdf', 3600)
    expect(result.data.signedUrl).toBe('https://signed.example/doc.pdf')
  })
})
