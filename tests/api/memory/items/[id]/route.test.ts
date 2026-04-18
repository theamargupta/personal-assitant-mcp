import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

vi.mock('@/lib/finance/auth', () => ({
  authenticateRequest: vi.fn().mockResolvedValue({ userId: 'user-1' }),
  isAuthError: vi.fn().mockReturnValue(false),
}))

vi.mock('@/lib/memory/items', () => ({
  updateMemory: vi.fn(),
  deleteMemory: vi.fn(),
}))

import { authenticateRequest, isAuthError } from '@/lib/finance/auth'
import { updateMemory, deleteMemory } from '@/lib/memory/items'

const params = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  vi.clearAllMocks()
  ;(authenticateRequest as ReturnType<typeof vi.fn>).mockResolvedValue({ userId: 'user-1' })
  ;(isAuthError as ReturnType<typeof vi.fn>).mockReturnValue(false)
})

// ---------- PATCH ----------

describe('PATCH /api/memory/items/[id]', () => {
  it('updates a memory on happy path', async () => {
    ;(updateMemory as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'm-1', title: 'New', content: 'Body',
    })

    const { PATCH } = await import('@/app/api/memory/items/[id]/route')
    const req = new NextRequest('http://localhost/api/memory/items/m-1', {
      method: 'PATCH',
      body: JSON.stringify({
        title: 'New', content: 'Body', category: 'rule', tags: ['a'],
        project: 'sathi', space: 'personal',
      }),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
    })
    const res = await PATCH(req, params('m-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.memory.id).toBe('m-1')
    expect(updateMemory).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      memoryId: 'm-1',
      title: 'New',
      content: 'Body',
      category: 'rule',
      tags: ['a'],
      project: 'sathi',
      spaceSlug: 'personal',
    }))
  })

  it('allows clearing project with null', async () => {
    ;(updateMemory as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'm-1' })
    const { PATCH } = await import('@/app/api/memory/items/[id]/route')
    const req = new NextRequest('http://localhost/api/memory/items/m-1', {
      method: 'PATCH',
      body: JSON.stringify({ project: null }),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
    })
    await PATCH(req, params('m-1'))
    expect(updateMemory).toHaveBeenCalledWith(expect.objectContaining({ project: null }))
  })

  it('ignores unknown category (does not set it)', async () => {
    ;(updateMemory as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'm-1' })
    const { PATCH } = await import('@/app/api/memory/items/[id]/route')
    const req = new NextRequest('http://localhost/api/memory/items/m-1', {
      method: 'PATCH',
      body: JSON.stringify({ category: 'bogus' }),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
    })
    await PATCH(req, params('m-1'))
    const callArg = (updateMemory as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(callArg.category).toBeUndefined()
  })

  it('returns 400 for invalid JSON', async () => {
    const { PATCH } = await import('@/app/api/memory/items/[id]/route')
    const req = new NextRequest('http://localhost/api/memory/items/m-1', {
      method: 'PATCH',
      body: 'garbage',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
    })
    const res = await PATCH(req, params('m-1'))
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid JSON' })
  })

  it('returns 500 when updateMemory throws', async () => {
    ;(updateMemory as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('no row'))
    const { PATCH } = await import('@/app/api/memory/items/[id]/route')
    const req = new NextRequest('http://localhost/api/memory/items/m-1', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'x' }),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
    })
    const res = await PATCH(req, params('m-1'))
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ error: 'no row' })
  })

  it('returns 401 when unauthenticated', async () => {
    const resp = NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    ;(authenticateRequest as ReturnType<typeof vi.fn>).mockResolvedValueOnce(resp)
    ;(isAuthError as ReturnType<typeof vi.fn>).mockReturnValueOnce(true)
    const { PATCH } = await import('@/app/api/memory/items/[id]/route')
    const req = new NextRequest('http://localhost/api/memory/items/m-1', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'x' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PATCH(req, params('m-1'))
    expect(res.status).toBe(401)
    expect(updateMemory).not.toHaveBeenCalled()
  })
})

// ---------- DELETE ----------

describe('DELETE /api/memory/items/[id]', () => {
  it('deletes a memory (204)', async () => {
    ;(deleteMemory as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined)
    const { DELETE } = await import('@/app/api/memory/items/[id]/route')
    const req = new NextRequest('http://localhost/api/memory/items/m-1', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer test-token' },
    })
    const res = await DELETE(req, params('m-1'))
    expect(res.status).toBe(204)
    expect(deleteMemory).toHaveBeenCalledWith('user-1', 'm-1')
  })

  it('returns 500 when deleteMemory throws', async () => {
    ;(deleteMemory as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('locked'))
    const { DELETE } = await import('@/app/api/memory/items/[id]/route')
    const req = new NextRequest('http://localhost/api/memory/items/m-1', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer test-token' },
    })
    const res = await DELETE(req, params('m-1'))
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ error: 'locked' })
  })

  it('returns 500 with fallback message for non-Error', async () => {
    ;(deleteMemory as ReturnType<typeof vi.fn>).mockRejectedValueOnce('opaque')
    const { DELETE } = await import('@/app/api/memory/items/[id]/route')
    const req = new NextRequest('http://localhost/api/memory/items/m-1', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer test-token' },
    })
    const res = await DELETE(req, params('m-1'))
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ error: 'Delete failed' })
  })

  it('returns 401 when unauthenticated', async () => {
    const resp = NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    ;(authenticateRequest as ReturnType<typeof vi.fn>).mockResolvedValueOnce(resp)
    ;(isAuthError as ReturnType<typeof vi.fn>).mockReturnValueOnce(true)
    const { DELETE } = await import('@/app/api/memory/items/[id]/route')
    const req = new NextRequest('http://localhost/api/memory/items/m-1', {
      method: 'DELETE',
    })
    const res = await DELETE(req, params('m-1'))
    expect(res.status).toBe(401)
    expect(deleteMemory).not.toHaveBeenCalled()
  })
})
