import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/finance/auth', () => ({
  authenticateRequest: vi.fn().mockResolvedValue({ userId: 'user-1' }),
  isAuthError: vi.fn().mockReturnValue(false),
}))

vi.mock('@/lib/finance/transactions', () => ({
  createTransaction: vi.fn(),
  listTransactions: vi.fn(),
  updateTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
}))

vi.mock('@/lib/finance/categories', () => ({
  listCategories: vi.fn(),
  createCategory: vi.fn(),
  deleteCategory: vi.fn(),
}))

import { authenticateRequest, isAuthError } from '@/lib/finance/auth'
import {
  createTransaction,
  listTransactions,
  updateTransaction,
  deleteTransaction,
} from '@/lib/finance/transactions'
import { listCategories, createCategory, deleteCategory } from '@/lib/finance/categories'

describe('finance route error paths', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns auth errors from transaction POST before creating', async () => {
    const authResponse = Response.json({ error: 'Unauthorized' }, { status: 401 })
    ;(authenticateRequest as ReturnType<typeof vi.fn>).mockResolvedValueOnce(authResponse)
    ;(isAuthError as ReturnType<typeof vi.fn>).mockReturnValueOnce(true)
    const { POST } = await import('@/app/api/finance/transactions/route')
    const request = new NextRequest('http://localhost/api/finance/transactions', {
      method: 'POST',
      body: JSON.stringify({ amount: 100 }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request)
    expect(response.status).toBe(401)
    expect(createTransaction).not.toHaveBeenCalled()
  })

  it('returns 400 when creating a transaction fails', async () => {
    ;(createTransaction as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('DB error'))
    const { POST } = await import('@/app/api/finance/transactions/route')
    const request = new NextRequest('http://localhost/api/finance/transactions', {
      method: 'POST',
      body: JSON.stringify({ amount: 100, merchant: 'Test' }),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    })

    const response = await POST(request)
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'DB error' })
  })

  it('returns 400 when listing transactions fails', async () => {
    ;(listTransactions as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('List failed'))
    const { GET } = await import('@/app/api/finance/transactions/route')
    const request = new NextRequest('http://localhost/api/finance/transactions?limit=10', {
      method: 'GET',
      headers: { Authorization: 'Bearer token' },
    })

    const response = await GET(request)
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'List failed' })
  })

  it('returns auth errors from transaction PATCH before updating', async () => {
    const authResponse = Response.json({ error: 'Unauthorized' }, { status: 401 })
    ;(authenticateRequest as ReturnType<typeof vi.fn>).mockResolvedValueOnce(authResponse)
    ;(isAuthError as ReturnType<typeof vi.fn>).mockReturnValueOnce(true)
    const { PATCH } = await import('@/app/api/finance/transactions/[id]/route')
    const request = new NextRequest('http://localhost/api/finance/transactions/tx-1', {
      method: 'PATCH',
      body: JSON.stringify({ amount: 200 }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await PATCH(request, { params: Promise.resolve({ id: 'tx-1' }) })
    expect(response.status).toBe(401)
    expect(updateTransaction).not.toHaveBeenCalled()
  })

  it('returns 404 when patching a missing transaction', async () => {
    ;(updateTransaction as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Transaction not found'))
    const { PATCH } = await import('@/app/api/finance/transactions/[id]/route')
    const request = new NextRequest('http://localhost/api/finance/transactions/tx-1', {
      method: 'PATCH',
      body: JSON.stringify({ amount: 200 }),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    })

    const response = await PATCH(request, { params: Promise.resolve({ id: 'tx-1' }) })
    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Transaction not found' })
  })

  it('returns 400 when patching a transaction fails generically', async () => {
    ;(updateTransaction as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Update failed'))
    const { PATCH } = await import('@/app/api/finance/transactions/[id]/route')
    const request = new NextRequest('http://localhost/api/finance/transactions/tx-1', {
      method: 'PATCH',
      body: JSON.stringify({ amount: 200 }),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    })

    const response = await PATCH(request, { params: Promise.resolve({ id: 'tx-1' }) })
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Update failed' })
  })

  it('returns Unknown error when patching throws a non-Error value', async () => {
    ;(updateTransaction as ReturnType<typeof vi.fn>).mockRejectedValueOnce('bad patch')
    const { PATCH } = await import('@/app/api/finance/transactions/[id]/route')
    const request = new NextRequest('http://localhost/api/finance/transactions/tx-1', {
      method: 'PATCH',
      body: JSON.stringify({ amount: 200 }),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    })

    const response = await PATCH(request, { params: Promise.resolve({ id: 'tx-1' }) })
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Unknown error' })
  })

  it('returns 400 when deleting a transaction fails', async () => {
    ;(deleteTransaction as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Delete failed'))
    const { DELETE } = await import('@/app/api/finance/transactions/[id]/route')
    const request = new NextRequest('http://localhost/api/finance/transactions/tx-1', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer token' },
    })

    const response = await DELETE(request, { params: Promise.resolve({ id: 'tx-1' }) })
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Delete failed' })
  })

  it('returns Unknown error when deleting a transaction throws a non-Error value', async () => {
    ;(deleteTransaction as ReturnType<typeof vi.fn>).mockRejectedValueOnce('delete failed')
    const { DELETE } = await import('@/app/api/finance/transactions/[id]/route')
    const request = new NextRequest('http://localhost/api/finance/transactions/tx-1', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer token' },
    })

    const response = await DELETE(request, { params: Promise.resolve({ id: 'tx-1' }) })
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Unknown error' })
  })

  it('returns auth errors from transaction DELETE before deleting', async () => {
    const authResponse = Response.json({ error: 'Unauthorized' }, { status: 401 })
    ;(authenticateRequest as ReturnType<typeof vi.fn>).mockResolvedValueOnce(authResponse)
    ;(isAuthError as ReturnType<typeof vi.fn>).mockReturnValueOnce(true)
    const { DELETE } = await import('@/app/api/finance/transactions/[id]/route')
    const request = new NextRequest('http://localhost/api/finance/transactions/tx-1', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer token' },
    })

    const response = await DELETE(request, { params: Promise.resolve({ id: 'tx-1' }) })
    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
    expect(deleteTransaction).not.toHaveBeenCalled()
  })

  it('returns auth errors from category GET before listing', async () => {
    const authResponse = Response.json({ error: 'Unauthorized' }, { status: 401 })
    ;(authenticateRequest as ReturnType<typeof vi.fn>).mockResolvedValueOnce(authResponse)
    ;(isAuthError as ReturnType<typeof vi.fn>).mockReturnValueOnce(true)
    const { GET } = await import('@/app/api/finance/categories/route')
    const request = new NextRequest('http://localhost/api/finance/categories', {
      method: 'GET',
    })

    const response = await GET(request)
    expect(response.status).toBe(401)
    expect(listCategories).not.toHaveBeenCalled()
  })

  it('returns 400 when listing categories fails', async () => {
    ;(listCategories as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Category list failed'))
    const { GET } = await import('@/app/api/finance/categories/route')
    const request = new NextRequest('http://localhost/api/finance/categories', {
      method: 'GET',
      headers: { Authorization: 'Bearer token' },
    })

    const response = await GET(request)
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Category list failed' })
  })

  it('returns 409 when creating a duplicate category', async () => {
    ;(createCategory as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Category already exists'))
    const { POST } = await import('@/app/api/finance/categories/route')
    const request = new NextRequest('http://localhost/api/finance/categories', {
      method: 'POST',
      body: JSON.stringify({ name: 'Food', icon: 'food' }),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    })

    const response = await POST(request)
    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({ error: 'Category already exists' })
  })

  it('returns 400 when creating a category fails generically', async () => {
    ;(createCategory as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Create failed'))
    const { POST } = await import('@/app/api/finance/categories/route')
    const request = new NextRequest('http://localhost/api/finance/categories', {
      method: 'POST',
      body: JSON.stringify({ name: 'Food' }),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    })

    const response = await POST(request)
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Create failed' })
  })

  it('returns auth errors from category DELETE before deleting', async () => {
    const authResponse = Response.json({ error: 'Unauthorized' }, { status: 401 })
    ;(authenticateRequest as ReturnType<typeof vi.fn>).mockResolvedValueOnce(authResponse)
    ;(isAuthError as ReturnType<typeof vi.fn>).mockReturnValueOnce(true)
    const { DELETE } = await import('@/app/api/finance/categories/[id]/route')
    const request = new NextRequest('http://localhost/api/finance/categories/c-1', {
      method: 'DELETE',
    })

    const response = await DELETE(request, { params: Promise.resolve({ id: 'c-1' }) })
    expect(response.status).toBe(401)
    expect(deleteCategory).not.toHaveBeenCalled()
  })

  it('returns 404 when deleting a missing category', async () => {
    ;(deleteCategory as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Category not found'))
    const { DELETE } = await import('@/app/api/finance/categories/[id]/route')
    const request = new NextRequest('http://localhost/api/finance/categories/c-1', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer token' },
    })

    const response = await DELETE(request, { params: Promise.resolve({ id: 'c-1' }) })
    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Category not found' })
  })

  it('returns 400 when deleting a preset category', async () => {
    ;(deleteCategory as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Cannot delete preset categories'))
    const { DELETE } = await import('@/app/api/finance/categories/[id]/route')
    const request = new NextRequest('http://localhost/api/finance/categories/c-1', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer token' },
    })

    const response = await DELETE(request, { params: Promise.resolve({ id: 'c-1' }) })
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Cannot delete preset categories' })
  })
})
