import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/finance/auth', () => ({
  authenticateRequest: vi.fn(),
  isAuthError: vi.fn(),
}))

vi.mock('@/lib/finance/categories', () => ({
  listCategories: vi.fn(),
  createCategory: vi.fn(),
  deleteCategory: vi.fn(),
}))

import { authenticateRequest, isAuthError } from '@/lib/finance/auth'
import { createCategory, deleteCategory, listCategories } from '@/lib/finance/categories'
import { GET, POST } from '@/app/api/finance/categories/route'
import { DELETE } from '@/app/api/finance/categories/[id]/route'

beforeEach(() => {
  vi.clearAllMocks()
  ;(authenticateRequest as ReturnType<typeof vi.fn>).mockResolvedValue({ userId: 'user-1' })
  ;(isAuthError as ReturnType<typeof vi.fn>).mockReturnValue(false)
  ;(listCategories as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'cat-1', name: 'Food' }])
  ;(createCategory as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'cat-2', name: 'Travel', icon: 'plane' })
  ;(deleteCategory as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
})

describe('finance category route edge cases', () => {
  it('returns an empty category array when the user has no categories', async () => {
    ;(listCategories as ReturnType<typeof vi.fn>).mockResolvedValueOnce([])
    const request = new NextRequest('http://localhost/api/finance/categories', {
      method: 'GET',
      headers: { Authorization: 'Bearer token' },
    })

    const response = await GET(request)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ categories: [] })
    expect(listCategories).toHaveBeenCalledWith('user-1')
  })

  it('returns the create category error response when insertion fails', async () => {
    ;(createCategory as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Insert failed'))
    const request = new NextRequest('http://localhost/api/finance/categories', {
      method: 'POST',
      body: JSON.stringify({ name: 'Travel', icon: 'plane' }),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    })

    const response = await POST(request)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Insert failed' })
    expect(createCategory).toHaveBeenCalledWith('user-1', 'Travel', 'plane')
  })

  it('uses the default icon when creating a category without an icon', async () => {
    const request = new NextRequest('http://localhost/api/finance/categories', {
      method: 'POST',
      body: JSON.stringify({ name: 'Fuel' }),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    })

    const response = await POST(request)

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({ id: 'cat-2', name: 'Travel', icon: 'plane' })
    expect(createCategory).toHaveBeenCalledWith('user-1', 'Fuel', '💰')
  })

  it('returns Unknown error when listing categories throws a non-Error value', async () => {
    ;(listCategories as ReturnType<typeof vi.fn>).mockRejectedValueOnce('db unavailable')
    const request = new NextRequest('http://localhost/api/finance/categories', {
      method: 'GET',
      headers: { Authorization: 'Bearer token' },
    })

    const response = await GET(request)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Unknown error' })
  })

  it('returns Unknown error when category creation throws a non-Error value', async () => {
    ;(createCategory as ReturnType<typeof vi.fn>).mockRejectedValueOnce('insert failed')
    const request = new NextRequest('http://localhost/api/finance/categories', {
      method: 'POST',
      body: JSON.stringify({ name: 'Fuel' }),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    })

    const response = await POST(request)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Unknown error' })
  })

  it('refuses to delete preset categories through the category library guard', async () => {
    ;(deleteCategory as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Cannot delete preset categories'))
    const request = new NextRequest('http://localhost/api/finance/categories/c-preset', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer token' },
    })

    const response = await DELETE(request, { params: Promise.resolve({ id: 'c-preset' }) })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Cannot delete preset categories' })
    expect(deleteCategory).toHaveBeenCalledWith('user-1', 'c-preset')
  })

  it('returns Unknown error when category deletion throws a non-Error value', async () => {
    ;(deleteCategory as ReturnType<typeof vi.fn>).mockRejectedValueOnce('delete failed')
    const request = new NextRequest('http://localhost/api/finance/categories/c-1', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer token' },
    })

    const response = await DELETE(request, { params: Promise.resolve({ id: 'c-1' }) })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Unknown error' })
  })
})
