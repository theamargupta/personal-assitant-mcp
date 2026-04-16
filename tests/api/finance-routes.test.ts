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
