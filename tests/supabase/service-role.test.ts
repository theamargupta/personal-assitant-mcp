import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Don't use the global mock for this test file — we're testing the actual function
vi.unmock('@/lib/supabase/service-role')

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn().mockReturnValue({ from: vi.fn(), auth: {} }),
}))

describe('createServiceRoleClient', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.resetModules()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('creates client with correct parameters', async () => {
    const { createClient } = await import('@supabase/supabase-js')
    const { createServiceRoleClient } = await import('@/lib/supabase/service-role')

    createServiceRoleClient()

    expect(createClient).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'test-key',
      expect.objectContaining({
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      })
    )
  })

  it('throws when SUPABASE_URL is missing', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    const { createServiceRoleClient } = await import('@/lib/supabase/service-role')

    expect(() => createServiceRoleClient()).toThrow('Missing NEXT_PUBLIC_SUPABASE_URL')
  })

  it('throws when SERVICE_ROLE_KEY is missing', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    const { createServiceRoleClient } = await import('@/lib/supabase/service-role')

    expect(() => createServiceRoleClient()).toThrow('Missing SUPABASE_SERVICE_ROLE_KEY')
  })
})
