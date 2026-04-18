import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

// --- Mocks ---------------------------------------------------------------

vi.mock('@/lib/finance/auth', () => ({
  authenticateRequest: vi.fn().mockResolvedValue({ userId: 'user-1' }),
  isAuthError: vi.fn().mockReturnValue(false),
}))

// Chainable supabase mock for GET / POST (wallet_documents insert + select).
type Chain = Record<string, ReturnType<typeof vi.fn>>
function makeChain(result: unknown = { data: null, error: null }): Chain {
  const chain: Chain = {}
  const methods = ['select', 'insert', 'update', 'delete', 'eq', 'order', 'limit', 'single']
  for (const m of methods) chain[m] = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn().mockResolvedValue(result)
  ;(chain as Record<string, unknown>).then = (resolve: (v: unknown) => void) => resolve(result)
  return chain
}

const mockClient: { from: ReturnType<typeof vi.fn> } = { from: vi.fn() }

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => mockClient,
}))

vi.mock('@/lib/documents/storage', () => ({
  buildStoragePath: vi.fn().mockReturnValue('user-1/12345-doc.pdf'),
  createSignedUploadUrl: vi.fn().mockResolvedValue('https://test.url/upload'),
  getSignedUrl: vi.fn().mockResolvedValue('https://test.url/download'),
  deleteFile: vi.fn().mockResolvedValue(undefined),
}))

import { authenticateRequest, isAuthError } from '@/lib/finance/auth'
import {
  createSignedUploadUrl,
  buildStoragePath,
} from '@/lib/documents/storage'

beforeEach(() => {
  vi.clearAllMocks()
  ;(authenticateRequest as ReturnType<typeof vi.fn>).mockResolvedValue({ userId: 'user-1' })
  ;(isAuthError as ReturnType<typeof vi.fn>).mockReturnValue(false)
  ;(createSignedUploadUrl as ReturnType<typeof vi.fn>).mockResolvedValue('https://test.url/upload')
  ;(buildStoragePath as ReturnType<typeof vi.fn>).mockReturnValue('user-1/12345-doc.pdf')
})

describe('GET /api/documents', () => {
  it('returns documents list on happy path', async () => {
    mockClient.from.mockReturnValue(
      makeChain({
        data: [{ id: 'd-1', name: 'Doc', status: 'ready' }],
        error: null,
      }),
    )

    const { GET } = await import('@/app/api/documents/route')
    const req = new NextRequest('http://localhost/api/documents', {
      method: 'GET',
      headers: { Authorization: 'Bearer test-token' },
    })
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.documents).toHaveLength(1)
  })

  it('returns 500 when supabase errors', async () => {
    mockClient.from.mockReturnValue(
      makeChain({ data: null, error: { message: 'boom' } }),
    )
    const { GET } = await import('@/app/api/documents/route')
    const req = new NextRequest('http://localhost/api/documents', {
      method: 'GET',
      headers: { Authorization: 'Bearer test-token' },
    })
    const res = await GET(req)
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ error: 'boom' })
  })

  it('returns 401 when unauthenticated', async () => {
    const resp = NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    ;(authenticateRequest as ReturnType<typeof vi.fn>).mockResolvedValueOnce(resp)
    ;(isAuthError as ReturnType<typeof vi.fn>).mockReturnValueOnce(true)

    const { GET } = await import('@/app/api/documents/route')
    const req = new NextRequest('http://localhost/api/documents', { method: 'GET' })
    const res = await GET(req)
    expect(res.status).toBe(401)
  })
})

describe('POST /api/documents', () => {
  it('creates pending document and returns signed upload URL', async () => {
    mockClient.from.mockReturnValue(
      makeChain({
        data: { id: 'd-1', name: 'Bill', created_at: '2026-04-01', storage_path: 'user-1/12345-doc.pdf' },
        error: null,
      }),
    )

    const { POST } = await import('@/app/api/documents/route')
    const req = new NextRequest('http://localhost/api/documents', {
      method: 'POST',
      body: JSON.stringify({ name: 'Bill', mime_type: 'application/pdf', tags: ['bill'] }),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
    })
    const res = await POST(req)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.document.id).toBe('d-1')
    expect(body.upload_url).toBe('https://test.url/upload')
    expect(body.storage_path).toBe('user-1/12345-doc.pdf')
  })

  it('returns 400 for invalid JSON', async () => {
    const { POST } = await import('@/app/api/documents/route')
    const req = new NextRequest('http://localhost/api/documents', {
      method: 'POST',
      body: 'garbage',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid JSON' })
  })

  it('returns 400 when name missing', async () => {
    const { POST } = await import('@/app/api/documents/route')
    const req = new NextRequest('http://localhost/api/documents', {
      method: 'POST',
      body: JSON.stringify({ mime_type: 'application/pdf' }),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'name required' })
  })

  it('returns 400 for unsupported mime type', async () => {
    const { POST } = await import('@/app/api/documents/route')
    const req = new NextRequest('http://localhost/api/documents', {
      method: 'POST',
      body: JSON.stringify({ name: 'evil.exe', mime_type: 'application/x-executable' }),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('unsupported mime_type')
  })

  it('returns 500 when DB insert fails', async () => {
    mockClient.from.mockReturnValue(
      makeChain({ data: null, error: { message: 'insert failed' } }),
    )
    const { POST } = await import('@/app/api/documents/route')
    const req = new NextRequest('http://localhost/api/documents', {
      method: 'POST',
      body: JSON.stringify({ name: 'Bill', mime_type: 'application/pdf' }),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
    })
    const res = await POST(req)
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ error: 'insert failed' })
  })

  it('returns 500 when signed URL generation fails', async () => {
    mockClient.from.mockReturnValue(
      makeChain({
        data: { id: 'd-1', name: 'Bill', created_at: '2026-04-01', storage_path: 'p' },
        error: null,
      }),
    )
    ;(createSignedUploadUrl as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('signing failed'))

    const { POST } = await import('@/app/api/documents/route')
    const req = new NextRequest('http://localhost/api/documents', {
      method: 'POST',
      body: JSON.stringify({ name: 'Bill', mime_type: 'application/pdf' }),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
    })
    const res = await POST(req)
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ error: 'signing failed' })
  })

  it('returns 401 when unauthenticated', async () => {
    const resp = NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    ;(authenticateRequest as ReturnType<typeof vi.fn>).mockResolvedValueOnce(resp)
    ;(isAuthError as ReturnType<typeof vi.fn>).mockReturnValueOnce(true)

    const { POST } = await import('@/app/api/documents/route')
    const req = new NextRequest('http://localhost/api/documents', {
      method: 'POST',
      body: JSON.stringify({ name: 'x', mime_type: 'application/pdf' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })
})
