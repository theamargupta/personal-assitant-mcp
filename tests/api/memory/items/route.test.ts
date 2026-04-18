import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

vi.mock('@/lib/finance/auth', () => ({
  authenticateRequest: vi.fn().mockResolvedValue({ userId: 'user-1' }),
  isAuthError: vi.fn().mockReturnValue(false),
}))

vi.mock('@/lib/memory/items', () => ({
  listMemories: vi.fn(),
  saveMemory: vi.fn(),
}))

import { authenticateRequest, isAuthError } from '@/lib/finance/auth'
import { listMemories, saveMemory } from '@/lib/memory/items'

beforeEach(() => {
  vi.clearAllMocks()
  ;(authenticateRequest as ReturnType<typeof vi.fn>).mockResolvedValue({ userId: 'user-1' })
  ;(isAuthError as ReturnType<typeof vi.fn>).mockReturnValue(false)
})

// ---------- GET ----------

describe('GET /api/memory/items', () => {
  it('returns memory list on happy path', async () => {
    ;(listMemories as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: 'm-1', title: 'Hi' },
    ])

    const { GET } = await import('@/app/api/memory/items/route')
    const req = new NextRequest(
      'http://localhost/api/memory/items?space=personal&category=note&limit=5&offset=10',
      { method: 'GET', headers: { Authorization: 'Bearer test-token' } },
    )
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.memories).toHaveLength(1)
    expect(listMemories).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      spaceSlug: 'personal',
      category: 'note',
      limit: 5,
      offset: 10,
    }))
  })

  it('clamps limit to 100', async () => {
    ;(listMemories as ReturnType<typeof vi.fn>).mockResolvedValueOnce([])
    const { GET } = await import('@/app/api/memory/items/route')
    const req = new NextRequest('http://localhost/api/memory/items?limit=9999', {
      method: 'GET',
      headers: { Authorization: 'Bearer test-token' },
    })
    await GET(req)
    expect(listMemories).toHaveBeenCalledWith(expect.objectContaining({ limit: 100 }))
  })

  it('returns 500 when listMemories throws', async () => {
    ;(listMemories as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('db down'))
    const { GET } = await import('@/app/api/memory/items/route')
    const req = new NextRequest('http://localhost/api/memory/items', {
      method: 'GET',
      headers: { Authorization: 'Bearer test-token' },
    })
    const res = await GET(req)
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ error: 'db down' })
  })

  it('returns 500 with fallback message for non-Error throws', async () => {
    ;(listMemories as ReturnType<typeof vi.fn>).mockRejectedValueOnce('opaque')
    const { GET } = await import('@/app/api/memory/items/route')
    const req = new NextRequest('http://localhost/api/memory/items', {
      method: 'GET',
      headers: { Authorization: 'Bearer test-token' },
    })
    const res = await GET(req)
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ error: 'Failed to list memories' })
  })

  it('returns 401 when unauthenticated', async () => {
    const resp = NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    ;(authenticateRequest as ReturnType<typeof vi.fn>).mockResolvedValueOnce(resp)
    ;(isAuthError as ReturnType<typeof vi.fn>).mockReturnValueOnce(true)
    const { GET } = await import('@/app/api/memory/items/route')
    const req = new NextRequest('http://localhost/api/memory/items', { method: 'GET' })
    const res = await GET(req)
    expect(res.status).toBe(401)
    expect(listMemories).not.toHaveBeenCalled()
  })
})

// ---------- POST ----------

describe('POST /api/memory/items', () => {
  it('saves a memory (status=saved → 201)', async () => {
    ;(saveMemory as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: 'saved',
      memory: { id: 'm-1', title: 'Hi' },
    })
    const { POST } = await import('@/app/api/memory/items/route')
    const req = new NextRequest('http://localhost/api/memory/items', {
      method: 'POST',
      body: JSON.stringify({ title: 'Hi', content: 'There', category: 'note', tags: ['x'] }),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
    })
    const res = await POST(req)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.status).toBe('saved')
    expect(saveMemory).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      spaceSlug: 'personal',
      title: 'Hi',
      content: 'There',
      category: 'note',
    }))
  })

  it('returns 200 when duplicates found', async () => {
    ;(saveMemory as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: 'duplicates_found',
      pending_memory: {},
      similar_memories: [],
      suggestion: 'use force=true',
    })
    const { POST } = await import('@/app/api/memory/items/route')
    const req = new NextRequest('http://localhost/api/memory/items', {
      method: 'POST',
      body: JSON.stringify({ title: 'Hi', content: 'There' }),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('duplicates_found')
  })

  it('coerces unknown category to note', async () => {
    ;(saveMemory as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: 'saved', memory: { id: 'm-2' },
    })
    const { POST } = await import('@/app/api/memory/items/route')
    const req = new NextRequest('http://localhost/api/memory/items', {
      method: 'POST',
      body: JSON.stringify({ title: 'Hi', content: 'There', category: 'bogus' }),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
    })
    await POST(req)
    expect(saveMemory).toHaveBeenCalledWith(expect.objectContaining({ category: 'note' }))
  })

  it('returns 400 for invalid JSON', async () => {
    const { POST } = await import('@/app/api/memory/items/route')
    const req = new NextRequest('http://localhost/api/memory/items', {
      method: 'POST',
      body: 'junk',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid JSON' })
  })

  it('returns 400 when title or content missing', async () => {
    const { POST } = await import('@/app/api/memory/items/route')
    const req = new NextRequest('http://localhost/api/memory/items', {
      method: 'POST',
      body: JSON.stringify({ title: '' }),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'title and content are required' })
  })

  it('returns 500 when saveMemory throws', async () => {
    ;(saveMemory as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('vault offline'))
    const { POST } = await import('@/app/api/memory/items/route')
    const req = new NextRequest('http://localhost/api/memory/items', {
      method: 'POST',
      body: JSON.stringify({ title: 'Hi', content: 'There' }),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
    })
    const res = await POST(req)
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ error: 'vault offline' })
  })

  it('returns 401 when unauthenticated', async () => {
    const resp = NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    ;(authenticateRequest as ReturnType<typeof vi.fn>).mockResolvedValueOnce(resp)
    ;(isAuthError as ReturnType<typeof vi.fn>).mockReturnValueOnce(true)
    const { POST } = await import('@/app/api/memory/items/route')
    const req = new NextRequest('http://localhost/api/memory/items', {
      method: 'POST',
      body: JSON.stringify({ title: 'x', content: 'y' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
    expect(saveMemory).not.toHaveBeenCalled()
  })
})
