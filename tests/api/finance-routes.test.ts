import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock auth module
vi.mock('@/lib/finance/auth', () => ({
  authenticateRequest: vi.fn().mockResolvedValue({ userId: 'user-1' }),
  isAuthError: vi.fn().mockReturnValue(false),
}))

vi.mock('@/lib/finance/transactions', () => ({
  createTransaction: vi.fn().mockResolvedValue({ id: 'tx-1', amount: 100 }),
  listTransactions: vi.fn().mockResolvedValue({ transactions: [], total: 0 }),
  updateTransaction: vi.fn().mockResolvedValue({ id: 'tx-1', amount: 200 }),
  deleteTransaction: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/finance/categories', () => ({
  listCategories: vi.fn().mockResolvedValue([{ id: 'c-1', name: 'Food' }]),
  createCategory: vi.fn().mockResolvedValue({ id: 'c-2', name: 'Custom' }),
  deleteCategory: vi.fn().mockResolvedValue(undefined),
}))

import { authenticateRequest, isAuthError } from '@/lib/finance/auth'
import {
  createTransaction,
  deleteTransaction,
  listTransactions,
  updateTransaction,
} from '@/lib/finance/transactions'
import { createCategory, deleteCategory, listCategories } from '@/lib/finance/categories'

beforeEach(() => {
  vi.clearAllMocks()
  ;(authenticateRequest as ReturnType<typeof vi.fn>).mockResolvedValue({ userId: 'user-1' })
  ;(isAuthError as ReturnType<typeof vi.fn>).mockReturnValue(false)
  ;(createTransaction as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'tx-1', amount: 100 })
  ;(listTransactions as ReturnType<typeof vi.fn>).mockResolvedValue({ transactions: [], total: 0 })
  ;(updateTransaction as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'tx-1', amount: 200 })
  ;(deleteTransaction as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
  ;(listCategories as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'c-1', name: 'Food' }])
  ;(createCategory as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'c-2', name: 'Custom' })
  ;(deleteCategory as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
})

describe('POST /api/finance/transactions', () => {
  it('creates a transaction', async () => {
    const { POST } = await import('@/app/api/finance/transactions/route')
    const req = new NextRequest('http://localhost/api/finance/transactions', {
      method: 'POST',
      body: JSON.stringify({ amount: 100, merchant: 'Test' }),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
    })

    const response = await POST(req)
    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.id).toBe('tx-1')
  })

  it('returns 400 with the create error when transaction body handling fails', async () => {
    ;(createTransaction as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Invalid transaction body'))
    const { POST } = await import('@/app/api/finance/transactions/route')
    const req = new NextRequest('http://localhost/api/finance/transactions', {
      method: 'POST',
      body: JSON.stringify({ amount: 'bad', merchant: 'Test' }),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
    })

    const response = await POST(req)
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Invalid transaction body' })
  })

  it('returns Unknown error when transaction creation throws a non-Error value', async () => {
    ;(createTransaction as ReturnType<typeof vi.fn>).mockRejectedValueOnce('bad input')
    const { POST } = await import('@/app/api/finance/transactions/route')
    const req = new NextRequest('http://localhost/api/finance/transactions', {
      method: 'POST',
      body: JSON.stringify({ amount: 100, merchant: 'Test' }),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
    })

    const response = await POST(req)
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Unknown error' })
  })

  it('returns auth errors before creating a transaction', async () => {
    const authResponse = Response.json({ error: 'Unauthorized' }, { status: 401 })
    ;(authenticateRequest as ReturnType<typeof vi.fn>).mockResolvedValueOnce(authResponse)
    ;(isAuthError as ReturnType<typeof vi.fn>).mockReturnValueOnce(true)
    const { POST } = await import('@/app/api/finance/transactions/route')
    const req = new NextRequest('http://localhost/api/finance/transactions', {
      method: 'POST',
      body: JSON.stringify({ amount: 100 }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(req)
    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
    expect(createTransaction).not.toHaveBeenCalled()
  })
})

describe('GET /api/finance/transactions', () => {
  it('lists transactions', async () => {
    const { GET } = await import('@/app/api/finance/transactions/route')
    const req = new NextRequest('http://localhost/api/finance/transactions', {
      method: 'GET',
      headers: { Authorization: 'Bearer test-token' },
    })

    const response = await GET(req)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.transactions).toEqual([])
  })

  it('returns 400 when listing transactions fails', async () => {
    ;(listTransactions as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('List failed'))
    const { GET } = await import('@/app/api/finance/transactions/route')
    const req = new NextRequest('http://localhost/api/finance/transactions?uncategorized=true&limit=10', {
      method: 'GET',
      headers: { Authorization: 'Bearer test-token' },
    })

    const response = await GET(req)
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'List failed' })
    expect(listTransactions).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      uncategorizedOnly: true,
      limit: 10,
    }))
  })

  it('passes all supported query parameters when listing transactions', async () => {
    ;(listTransactions as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      transactions: [{ id: 'tx-1', amount: 100 }],
      total: 1,
    })
    const { GET } = await import('@/app/api/finance/transactions/route')
    const req = new NextRequest(
      'http://localhost/api/finance/transactions?category_id=cat-1&start_date=2026-04-01&end_date=2026-04-30&uncategorized=false&limit=25&offset=50',
      {
        method: 'GET',
        headers: { Authorization: 'Bearer test-token' },
      }
    )

    const response = await GET(req)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      transactions: [{ id: 'tx-1', amount: 100 }],
      total: 1,
    })
    expect(listTransactions).toHaveBeenCalledWith({
      userId: 'user-1',
      categoryId: 'cat-1',
      startDate: '2026-04-01',
      endDate: '2026-04-30',
      uncategorizedOnly: false,
      limit: 25,
      offset: 50,
    })
  })

  it('returns Unknown error when listing transactions throws a non-Error value', async () => {
    ;(listTransactions as ReturnType<typeof vi.fn>).mockRejectedValueOnce('list failed')
    const { GET } = await import('@/app/api/finance/transactions/route')
    const req = new NextRequest('http://localhost/api/finance/transactions', {
      method: 'GET',
      headers: { Authorization: 'Bearer test-token' },
    })

    const response = await GET(req)
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Unknown error' })
  })

  it('returns auth errors before listing transactions', async () => {
    const authResponse = Response.json({ error: 'Unauthorized' }, { status: 401 })
    ;(authenticateRequest as ReturnType<typeof vi.fn>).mockResolvedValueOnce(authResponse)
    ;(isAuthError as ReturnType<typeof vi.fn>).mockReturnValueOnce(true)
    const { GET } = await import('@/app/api/finance/transactions/route')
    const req = new NextRequest('http://localhost/api/finance/transactions', {
      method: 'GET',
      headers: { Authorization: 'Bearer test-token' },
    })

    const response = await GET(req)
    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
    expect(listTransactions).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/finance/transactions/[id]', () => {
  it('updates a transaction', async () => {
    const { PATCH } = await import('@/app/api/finance/transactions/[id]/route')
    const req = new NextRequest('http://localhost/api/finance/transactions/tx-1', {
      method: 'PATCH',
      body: JSON.stringify({ amount: 200 }),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
    })

    const response = await PATCH(req, { params: Promise.resolve({ id: 'tx-1' }) })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.amount).toBe(200)
  })
})

describe('DELETE /api/finance/transactions/[id]', () => {
  it('deletes a transaction', async () => {
    const { DELETE } = await import('@/app/api/finance/transactions/[id]/route')
    const req = new NextRequest('http://localhost/api/finance/transactions/tx-1', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer test-token' },
    })

    const response = await DELETE(req, { params: Promise.resolve({ id: 'tx-1' }) })
    expect(response.status).toBe(204)
  })
})

describe('GET /api/finance/categories', () => {
  it('lists categories', async () => {
    const { GET } = await import('@/app/api/finance/categories/route')
    const req = new NextRequest('http://localhost/api/finance/categories', {
      method: 'GET',
      headers: { Authorization: 'Bearer test-token' },
    })

    const response = await GET(req)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.categories).toHaveLength(1)
  })
})

describe('POST /api/finance/categories', () => {
  it('creates a category', async () => {
    const { POST } = await import('@/app/api/finance/categories/route')
    const req = new NextRequest('http://localhost/api/finance/categories', {
      method: 'POST',
      body: JSON.stringify({ name: 'Custom', icon: '🎯' }),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
    })

    const response = await POST(req)
    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body).toEqual({ id: 'c-2', name: 'Custom' })
  })

  it('returns 400 when name is missing', async () => {
    const { POST } = await import('@/app/api/finance/categories/route')
    const req = new NextRequest('http://localhost/api/finance/categories', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
    })

    const response = await POST(req)
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'name is required' })
  })
})

describe('DELETE /api/finance/categories/[id]', () => {
  it('deletes a category', async () => {
    const { DELETE } = await import('@/app/api/finance/categories/[id]/route')
    const req = new NextRequest('http://localhost/api/finance/categories/c-1', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer test-token' },
    })

    const response = await DELETE(req, { params: Promise.resolve({ id: 'c-1' }) })
    expect(response.status).toBe(204)
  })
})
