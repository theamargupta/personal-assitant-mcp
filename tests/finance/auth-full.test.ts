import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock @supabase/supabase-js for the auth module
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn().mockReturnValue({
    auth: {
      getUser: vi.fn(),
    },
  }),
}))

import { authenticateRequest, isAuthError } from '@/lib/finance/auth'
import { createClient } from '@supabase/supabase-js'

const mockCreateClient = createClient as ReturnType<typeof vi.fn>

describe('authenticateRequest', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns 401 when no Authorization header', async () => {
    const req = new NextRequest('http://localhost/api/test', { method: 'GET' })
    const result = await authenticateRequest(req)
    expect(isAuthError(result)).toBe(true)
  })

  it('returns 401 when Authorization is not Bearer', async () => {
    const req = new NextRequest('http://localhost/api/test', {
      method: 'GET',
      headers: { Authorization: 'Basic abc123' },
    })
    const result = await authenticateRequest(req)
    expect(isAuthError(result)).toBe(true)
  })

  it('returns 401 when token is invalid', async () => {
    const mockAuth = { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: new Error('Invalid') }) }
    mockCreateClient.mockReturnValue({ auth: mockAuth })

    const req = new NextRequest('http://localhost/api/test', {
      method: 'GET',
      headers: { Authorization: 'Bearer invalid-token' },
    })

    const result = await authenticateRequest(req)
    expect(isAuthError(result)).toBe(true)
  })

  it('returns userId for valid token', async () => {
    const mockAuth = { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null }) }
    mockCreateClient.mockReturnValue({ auth: mockAuth })

    const req = new NextRequest('http://localhost/api/test', {
      method: 'GET',
      headers: { Authorization: 'Bearer valid-token' },
    })

    const result = await authenticateRequest(req)
    expect(isAuthError(result)).toBe(false)
    if (!isAuthError(result)) {
      expect(result.userId).toBe('user-123')
    }
  })
})
