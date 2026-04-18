import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

vi.mock('@/lib/finance/auth', () => ({
  authenticateRequest: vi.fn().mockResolvedValue({ userId: 'user-1' }),
  isAuthError: vi.fn().mockReturnValue(false),
}))

vi.mock('@/lib/memory/items', () => ({
  searchMemories: vi.fn(),
}))

import { authenticateRequest, isAuthError } from '@/lib/finance/auth'
import { searchMemories } from '@/lib/memory/items'

beforeEach(() => {
  vi.clearAllMocks()
  ;(authenticateRequest as ReturnType<typeof vi.fn>).mockResolvedValue({ userId: 'user-1' })
  ;(isAuthError as ReturnType<typeof vi.fn>).mockReturnValue(false)
})

describe('GET /api/memory/search', () => {
  it('returns search results on happy path', async () => {
    ;(searchMemories as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: 'm-1', title: 'Hit', final_score: 0.9 },
    ])

    const { GET } = await import('@/app/api/memory/search/route')
    const req = new NextRequest(
      'http://localhost/api/memory/search?q=claude&space=personal&category=note&project=sathi&limit=4',
      { method: 'GET', headers: { Authorization: 'Bearer test-token' } },
    )
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.results).toHaveLength(1)
    expect(searchMemories).toHaveBeenCalledWith({
      userId: 'user-1',
      query: 'claude',
      spaceSlug: 'personal',
      category: 'note',
      project: 'sathi',
      limit: 4,
    })
  })

  it('clamps limit to 20', async () => {
    ;(searchMemories as ReturnType<typeof vi.fn>).mockResolvedValueOnce([])
    const { GET } = await import('@/app/api/memory/search/route')
    const req = new NextRequest('http://localhost/api/memory/search?q=hi&limit=9999', {
      method: 'GET',
      headers: { Authorization: 'Bearer test-token' },
    })
    await GET(req)
    expect(searchMemories).toHaveBeenCalledWith(expect.objectContaining({ limit: 20 }))
  })

  it('returns 400 when q is missing', async () => {
    const { GET } = await import('@/app/api/memory/search/route')
    const req = new NextRequest('http://localhost/api/memory/search', {
      method: 'GET',
      headers: { Authorization: 'Bearer test-token' },
    })
    const res = await GET(req)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'query `q` is required' })
    expect(searchMemories).not.toHaveBeenCalled()
  })

  it('returns 400 when q is empty/whitespace', async () => {
    const { GET } = await import('@/app/api/memory/search/route')
    const req = new NextRequest('http://localhost/api/memory/search?q=%20%20', {
      method: 'GET',
      headers: { Authorization: 'Bearer test-token' },
    })
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it('returns 500 when searchMemories throws', async () => {
    ;(searchMemories as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('rpc down'))
    const { GET } = await import('@/app/api/memory/search/route')
    const req = new NextRequest('http://localhost/api/memory/search?q=anything', {
      method: 'GET',
      headers: { Authorization: 'Bearer test-token' },
    })
    const res = await GET(req)
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ error: 'rpc down' })
  })

  it('returns 500 with fallback for non-Error', async () => {
    ;(searchMemories as ReturnType<typeof vi.fn>).mockRejectedValueOnce('opaque')
    const { GET } = await import('@/app/api/memory/search/route')
    const req = new NextRequest('http://localhost/api/memory/search?q=hi', {
      method: 'GET',
      headers: { Authorization: 'Bearer test-token' },
    })
    const res = await GET(req)
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ error: 'Search failed' })
  })

  it('returns 401 when unauthenticated', async () => {
    const resp = NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    ;(authenticateRequest as ReturnType<typeof vi.fn>).mockResolvedValueOnce(resp)
    ;(isAuthError as ReturnType<typeof vi.fn>).mockReturnValueOnce(true)
    const { GET } = await import('@/app/api/memory/search/route')
    const req = new NextRequest('http://localhost/api/memory/search?q=hi', { method: 'GET' })
    const res = await GET(req)
    expect(res.status).toBe(401)
    expect(searchMemories).not.toHaveBeenCalled()
  })
})
