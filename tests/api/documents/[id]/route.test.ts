import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

vi.mock('@/lib/finance/auth', () => ({
  authenticateRequest: vi.fn().mockResolvedValue({ userId: 'user-1' }),
  isAuthError: vi.fn().mockReturnValue(false),
}))

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
  getSignedUrl: vi.fn().mockResolvedValue('https://test.url/download'),
  deleteFile: vi.fn().mockResolvedValue(undefined),
}))

import { authenticateRequest, isAuthError } from '@/lib/finance/auth'
import { getSignedUrl, deleteFile } from '@/lib/documents/storage'

const params = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  vi.clearAllMocks()
  ;(authenticateRequest as ReturnType<typeof vi.fn>).mockResolvedValue({ userId: 'user-1' })
  ;(isAuthError as ReturnType<typeof vi.fn>).mockReturnValue(false)
  ;(getSignedUrl as ReturnType<typeof vi.fn>).mockResolvedValue('https://test.url/download')
  ;(deleteFile as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
})

// ----- GET ---------------------------------------------------------------

describe('GET /api/documents/[id]', () => {
  it('returns document and signed view URL for ready docs', async () => {
    mockClient.from.mockReturnValue(
      makeChain({
        data: {
          id: 'd-1', name: 'Doc', description: null, doc_type: 'pdf',
          mime_type: 'application/pdf', file_size: 100, tags: [],
          status: 'ready', storage_path: 'user-1/x.pdf',
          created_at: '2026-04-01T00:00:00Z',
        },
        error: null,
      }),
    )

    const { GET } = await import('@/app/api/documents/[id]/route')
    const req = new NextRequest('http://localhost/api/documents/d-1', {
      method: 'GET',
      headers: { Authorization: 'Bearer test-token' },
    })
    const res = await GET(req, params('d-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.document.id).toBe('d-1')
    expect(body.view_url).toBe('https://test.url/download')
    expect(body.view_error).toBeNull()
  })

  it('returns view_error when getSignedUrl throws', async () => {
    mockClient.from.mockReturnValue(
      makeChain({
        data: {
          id: 'd-1', name: 'Doc', status: 'pending', storage_path: 'p',
        },
        error: null,
      }),
    )
    ;(getSignedUrl as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('no url'))

    const { GET } = await import('@/app/api/documents/[id]/route')
    const req = new NextRequest('http://localhost/api/documents/d-1', {
      method: 'GET',
      headers: { Authorization: 'Bearer test-token' },
    })
    const res = await GET(req, params('d-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.view_url).toBeNull()
    expect(body.view_error).toBe('no url')
  })

  it('returns 404 when document not found', async () => {
    mockClient.from.mockReturnValue(
      makeChain({ data: null, error: { message: 'not found' } }),
    )

    const { GET } = await import('@/app/api/documents/[id]/route')
    const req = new NextRequest('http://localhost/api/documents/d-bad', {
      method: 'GET',
      headers: { Authorization: 'Bearer test-token' },
    })
    const res = await GET(req, params('d-bad'))
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'Not found' })
  })

  it('returns 401 when unauthenticated', async () => {
    const resp = NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    ;(authenticateRequest as ReturnType<typeof vi.fn>).mockResolvedValueOnce(resp)
    ;(isAuthError as ReturnType<typeof vi.fn>).mockReturnValueOnce(true)

    const { GET } = await import('@/app/api/documents/[id]/route')
    const req = new NextRequest('http://localhost/api/documents/d-1', { method: 'GET' })
    const res = await GET(req, params('d-1'))
    expect(res.status).toBe(401)
  })
})

// ----- PATCH -------------------------------------------------------------

describe('PATCH /api/documents/[id]', () => {
  it('updates status=ready and file_size', async () => {
    mockClient.from.mockReturnValue(
      makeChain({
        data: { id: 'd-1', status: 'ready', file_size: 2048 },
        error: null,
      }),
    )

    const { PATCH } = await import('@/app/api/documents/[id]/route')
    const req = new NextRequest('http://localhost/api/documents/d-1', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'ready', file_size: 2048 }),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
    })
    const res = await PATCH(req, params('d-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.document.status).toBe('ready')
  })

  it('returns 400 for invalid JSON', async () => {
    const { PATCH } = await import('@/app/api/documents/[id]/route')
    const req = new NextRequest('http://localhost/api/documents/d-1', {
      method: 'PATCH',
      body: 'junk',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
    })
    const res = await PATCH(req, params('d-1'))
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid JSON' })
  })

  it('returns 500 when DB update fails', async () => {
    mockClient.from.mockReturnValue(
      makeChain({ data: null, error: { message: 'update failed' } }),
    )
    const { PATCH } = await import('@/app/api/documents/[id]/route')
    const req = new NextRequest('http://localhost/api/documents/d-1', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'ready' }),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
    })
    const res = await PATCH(req, params('d-1'))
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ error: 'update failed' })
  })

  it('returns 401 when unauthenticated', async () => {
    const resp = NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    ;(authenticateRequest as ReturnType<typeof vi.fn>).mockResolvedValueOnce(resp)
    ;(isAuthError as ReturnType<typeof vi.fn>).mockReturnValueOnce(true)

    const { PATCH } = await import('@/app/api/documents/[id]/route')
    const req = new NextRequest('http://localhost/api/documents/d-1', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'ready' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PATCH(req, params('d-1'))
    expect(res.status).toBe(401)
  })
})

// ----- DELETE ------------------------------------------------------------

describe('DELETE /api/documents/[id]', () => {
  it('deletes document and storage file', async () => {
    // First from() call = fetch. Second = delete.
    let call = 0
    mockClient.from.mockImplementation(() => {
      call++
      if (call === 1) {
        return makeChain({
          data: { storage_path: 'user-1/x.pdf' },
          error: null,
        })
      }
      return makeChain({ data: null, error: null })
    })

    const { DELETE } = await import('@/app/api/documents/[id]/route')
    const req = new NextRequest('http://localhost/api/documents/d-1', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer test-token' },
    })
    const res = await DELETE(req, params('d-1'))
    expect(res.status).toBe(204)
    expect(deleteFile).toHaveBeenCalledWith('user-1/x.pdf')
  })

  it('continues even if storage removal fails', async () => {
    let call = 0
    mockClient.from.mockImplementation(() => {
      call++
      if (call === 1) {
        return makeChain({ data: { storage_path: 'user-1/x.pdf' }, error: null })
      }
      return makeChain({ data: null, error: null })
    })
    ;(deleteFile as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('fs'))

    const { DELETE } = await import('@/app/api/documents/[id]/route')
    const req = new NextRequest('http://localhost/api/documents/d-1', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer test-token' },
    })
    const res = await DELETE(req, params('d-1'))
    expect(res.status).toBe(204)
  })

  it('returns 404 when document missing', async () => {
    mockClient.from.mockReturnValue(makeChain({ data: null, error: { message: 'nope' } }))

    const { DELETE } = await import('@/app/api/documents/[id]/route')
    const req = new NextRequest('http://localhost/api/documents/d-x', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer test-token' },
    })
    const res = await DELETE(req, params('d-x'))
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'Not found' })
  })

  it('returns 500 when row deletion fails', async () => {
    let call = 0
    mockClient.from.mockImplementation(() => {
      call++
      if (call === 1) return makeChain({ data: { storage_path: 'p' }, error: null })
      return makeChain({ data: null, error: { message: 'delete failed' } })
    })

    const { DELETE } = await import('@/app/api/documents/[id]/route')
    const req = new NextRequest('http://localhost/api/documents/d-1', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer test-token' },
    })
    const res = await DELETE(req, params('d-1'))
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ error: 'delete failed' })
  })

  it('returns 401 when unauthenticated', async () => {
    const resp = NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    ;(authenticateRequest as ReturnType<typeof vi.fn>).mockResolvedValueOnce(resp)
    ;(isAuthError as ReturnType<typeof vi.fn>).mockReturnValueOnce(true)

    const { DELETE } = await import('@/app/api/documents/[id]/route')
    const req = new NextRequest('http://localhost/api/documents/d-1', { method: 'DELETE' })
    const res = await DELETE(req, params('d-1'))
    expect(res.status).toBe(401)
  })
})
