import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockChain: Record<string, ReturnType<typeof vi.fn>> = {}
const methods = ['select', 'insert', 'update', 'delete', 'eq', 'neq', 'or', 'order', 'single', 'maybeSingle']
for (const m of methods) {
  mockChain[m] = vi.fn().mockReturnValue(mockChain)
}
mockChain.single = vi.fn().mockResolvedValue({ data: null, error: null })
mockChain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })

const mockInsertChain: Record<string, ReturnType<typeof vi.fn>> = {}
mockInsertChain.insert = vi.fn().mockResolvedValue({ error: null })

const mockClient = {
  from: vi.fn().mockReturnValue({ ...mockChain, insert: vi.fn().mockResolvedValue({ error: null }) }),
}

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => mockClient),
}))

import {
  registerOAuthClient,
  getOAuthClient,
  createAuthorizationCode,
  revokeOAuthToken,
  verifyOAuthAccessToken,
  exchangeAuthorizationCode,
  exchangeRefreshToken,
} from '@/lib/mcp/oauth'

describe('registerOAuthClient', () => {
  beforeEach(() => { vi.clearAllMocks(); mockClient.from.mockReturnValue({ ...mockChain, insert: vi.fn().mockResolvedValue({ error: null }) }) })

  it('throws for empty redirect URIs', async () => {
    await expect(registerOAuthClient({ redirectUris: [] }))
      .rejects.toThrow('At least one redirect URI is required')
  })

  it('throws for disallowed redirect URI', async () => {
    await expect(registerOAuthClient({ redirectUris: ['https://evil.com/callback'] }))
      .rejects.toThrow('not allowed')
  })

  it('registers client with valid claude.ai redirect', async () => {
    const result = await registerOAuthClient({
      redirectUris: ['https://claude.ai/callback'],
      clientName: 'Test Client',
    })

    expect(result.client_id).toMatch(/^mcp_client_/)
    expect(result.redirect_uris).toEqual(['https://claude.ai/callback'])
    expect(result.client_name).toBe('Test Client')
    expect(result.grant_types).toEqual(['authorization_code', 'refresh_token'])
  })

  it('registers client with localhost redirect', async () => {
    const result = await registerOAuthClient({
      redirectUris: ['http://localhost:3000/callback'],
    })

    expect(result.client_id).toMatch(/^mcp_client_/)
    expect(result.redirect_uris).toContain('http://localhost:3000/callback')
  })

  it('registers client with chatgpt.com redirect', async () => {
    const result = await registerOAuthClient({
      redirectUris: ['https://chatgpt.com/callback'],
    })
    expect(result.redirect_uris).toContain('https://chatgpt.com/callback')
  })

  it('registers with subdomain of chatgpt.com', async () => {
    const result = await registerOAuthClient({
      redirectUris: ['https://auth.chatgpt.com/callback'],
    })
    expect(result.redirect_uris).toContain('https://auth.chatgpt.com/callback')
  })

  it('throws on DB error', async () => {
    mockClient.from.mockReturnValue({
      ...mockChain,
      insert: vi.fn().mockResolvedValue({ error: { message: 'DB error' } }),
    })

    await expect(registerOAuthClient({
      redirectUris: ['https://claude.ai/callback'],
    })).rejects.toThrow('DB error')
  })
})

describe('getOAuthClient', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns null when client not found', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    mockClient.from.mockReturnValue(mockChain)

    const result = await getOAuthClient('nonexistent')
    expect(result).toBeNull()
  })

  it('returns client data when found', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({
      data: {
        client_id: 'mcp_client_test',
        client_secret_hash: null,
        client_name: 'Test',
        redirect_uris: ['https://claude.ai/callback'],
        grant_types: ['authorization_code'],
        response_types: ['code'],
        scope: 'mcp:tools',
        token_endpoint_auth_method: 'none',
        created_at: '2025-01-01T00:00:00Z',
      },
      error: null,
    })
    mockClient.from.mockReturnValue(mockChain)

    const result = await getOAuthClient('mcp_client_test')
    expect(result).not.toBeNull()
    expect(result!.client_id).toBe('mcp_client_test')
    expect(result!.redirect_uris).toEqual(['https://claude.ai/callback'])
  })
})

describe('createAuthorizationCode', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns an authorization code', async () => {
    mockClient.from.mockReturnValue({
      ...mockChain,
      insert: vi.fn().mockResolvedValue({ error: null }),
    })

    const code = await createAuthorizationCode({
      clientId: 'test-client',
      userId: 'user-1',
      redirectUri: 'https://claude.ai/callback',
      codeChallenge: 'abc',
      codeChallengeMethod: 'S256',
      scopes: ['mcp:tools'],
      resource: null,
    })

    expect(code).toMatch(/^mcp_auth_/)
  })

  it('throws on DB error', async () => {
    mockClient.from.mockReturnValue({
      ...mockChain,
      insert: vi.fn().mockResolvedValue({ error: { message: 'Insert failed' } }),
    })

    await expect(createAuthorizationCode({
      clientId: 'test-client',
      userId: 'user-1',
      redirectUri: 'https://claude.ai/callback',
      codeChallenge: 'abc',
      codeChallengeMethod: 'S256',
      scopes: ['mcp:tools'],
      resource: null,
    })).rejects.toThrow()
  })
})

describe('revokeOAuthToken', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('calls update with token hash', async () => {
    const updateChain: Record<string, ReturnType<typeof vi.fn>> = {}
    updateChain.update = vi.fn().mockReturnValue(updateChain)
    updateChain.or = vi.fn().mockResolvedValue({ error: null })
    mockClient.from.mockReturnValue(updateChain)

    await revokeOAuthToken('mcp_at_test_token')
    expect(updateChain.update).toHaveBeenCalled()
    expect(updateChain.or).toHaveBeenCalled()
  })
})

describe('verifyOAuthAccessToken', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('throws for invalid token', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    mockClient.from.mockReturnValue(mockChain)

    await expect(verifyOAuthAccessToken('invalid')).rejects.toThrow('Invalid access token')
  })

  it('throws for revoked token', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({
      data: {
        id: 'tok-1', client_id: 'c', user_id: 'u',
        scopes: ['mcp:tools'], resource: null,
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        revoked_at: '2025-01-01T00:00:00Z',
      },
      error: null,
    })
    mockClient.from.mockReturnValue(mockChain)

    await expect(verifyOAuthAccessToken('revoked')).rejects.toThrow('revoked')
  })

  it('throws for expired token', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({
      data: {
        id: 'tok-1', client_id: 'c', user_id: 'u',
        scopes: ['mcp:tools'], resource: null,
        expires_at: '2020-01-01T00:00:00Z',
        revoked_at: null,
      },
      error: null,
    })
    mockClient.from.mockReturnValue(mockChain)

    await expect(verifyOAuthAccessToken('expired')).rejects.toThrow('expired')
  })

  it('returns auth info for valid token', async () => {
    const futureDate = new Date(Date.now() + 3600000).toISOString()
    // First maybeSingle for verification
    mockChain.maybeSingle.mockResolvedValueOnce({
      data: {
        id: 'tok-1', client_id: 'client-1', user_id: 'user-1',
        scopes: ['mcp:tools'], resource: null,
        expires_at: futureDate,
        revoked_at: null,
      },
      error: null,
    })
    // Update last_used_at (fire-and-forget)
    const updateChain: Record<string, ReturnType<typeof vi.fn>> = {}
    updateChain.update = vi.fn().mockReturnValue(updateChain)
    updateChain.eq = vi.fn().mockResolvedValue({ error: null })

    let callNum = 0
    mockClient.from.mockImplementation(() => {
      callNum++
      if (callNum === 1) return mockChain
      return updateChain
    })

    const authInfo = await verifyOAuthAccessToken('valid-token')
    expect(authInfo.clientId).toBe('client-1')
    expect(authInfo.scopes).toEqual(['mcp:tools'])
    expect(authInfo.extra).toEqual({ userId: 'user-1' })
  })
})

describe('exchangeAuthorizationCode', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('throws for invalid code', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    mockClient.from.mockReturnValue(mockChain)

    await expect(exchangeAuthorizationCode({
      clientId: 'c', code: 'bad', codeVerifier: 'v', redirectUri: 'https://x.com',
    })).rejects.toThrow('Invalid authorization code')
  })

  it('throws for already used code', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({
      data: {
        id: 'ac-1', client_id: 'c', user_id: 'u',
        redirect_uri: 'https://x.com', code_challenge: 'ch',
        code_challenge_method: 'S256', scopes: ['mcp:tools'],
        resource: null, expires_at: new Date(Date.now() + 60000).toISOString(),
        used_at: '2025-01-01T00:00:00Z',
      },
      error: null,
    })
    mockClient.from.mockReturnValue(mockChain)

    await expect(exchangeAuthorizationCode({
      clientId: 'c', code: 'used', codeVerifier: 'v', redirectUri: 'https://x.com',
    })).rejects.toThrow('already been used')
  })

  it('throws for wrong client ID', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({
      data: {
        id: 'ac-1', client_id: 'other-client', user_id: 'u',
        redirect_uri: 'https://x.com', code_challenge: 'ch',
        code_challenge_method: 'S256', scopes: ['mcp:tools'],
        resource: null, expires_at: new Date(Date.now() + 60000).toISOString(),
        used_at: null,
      },
      error: null,
    })
    mockClient.from.mockReturnValue(mockChain)

    await expect(exchangeAuthorizationCode({
      clientId: 'wrong-client', code: 'code', codeVerifier: 'v', redirectUri: 'https://x.com',
    })).rejects.toThrow('not issued to this client')
  })
})

describe('exchangeRefreshToken', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('throws for invalid refresh token', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    mockClient.from.mockReturnValue(mockChain)

    await expect(exchangeRefreshToken({
      clientId: 'c', refreshToken: 'bad',
    })).rejects.toThrow('Invalid refresh token')
  })

  it('throws for revoked refresh token', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({
      data: {
        id: 'tok-1', client_id: 'c', user_id: 'u',
        scopes: ['mcp:tools'], resource: null,
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        revoked_at: '2025-01-01T00:00:00Z',
      },
      error: null,
    })
    mockClient.from.mockReturnValue(mockChain)

    await expect(exchangeRefreshToken({
      clientId: 'c', refreshToken: 'revoked',
    })).rejects.toThrow('revoked')
  })
})
