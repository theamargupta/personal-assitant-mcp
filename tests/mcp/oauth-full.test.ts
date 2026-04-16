import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as crypto from 'crypto'

const mockClient = { from: vi.fn() }

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => mockClient),
}))

import {
  exchangeAuthorizationCode,
  exchangeRefreshToken,
  registerOAuthClient,
  validateTokenRequestScopeAndResource,
} from '@/lib/mcp/oauth'

function createChain(result: unknown = { data: null, error: null }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {}
  const methods = ['select', 'insert', 'update', 'eq', 'or']
  for (const method of methods) chain[method] = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn().mockResolvedValue(result)
  chain.maybeSingle = vi.fn().mockResolvedValue(result)
  return chain
}

function authCodeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'code-1',
    client_id: 'client-1',
    user_id: 'user-1',
    redirect_uri: 'https://chatgpt.com/callback',
    code_challenge: 'challenge',
    code_challenge_method: 'S256',
    scopes: ['mcp:tools'],
    resource: null,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    used_at: null,
    ...overrides,
  }
}

function tokenRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'token-1',
    client_id: 'client-1',
    user_id: 'user-1',
    scopes: ['mcp:tools'],
    resource: 'https://example.com/api/mcp',
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    revoked_at: null,
    ...overrides,
  }
}

describe('exchangeAuthorizationCode - full coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws for wrong redirect URI', async () => {
    mockClient.from.mockReturnValue(createChain({
      data: authCodeRow({ redirect_uri: 'https://chatgpt.com/callback' }),
      error: null,
    }))

    await expect(exchangeAuthorizationCode({
      clientId: 'client-1',
      code: 'auth-code',
      codeVerifier: 'verifier',
      redirectUri: 'https://chatgpt.com/other',
    })).rejects.toThrow('Redirect URI does not match authorization code')
  })

  it('throws for expired code', async () => {
    mockClient.from.mockReturnValue(createChain({
      data: authCodeRow({ expires_at: new Date(Date.now() - 1_000).toISOString() }),
      error: null,
    }))

    await expect(exchangeAuthorizationCode({
      clientId: 'client-1',
      code: 'auth-code',
      codeVerifier: 'verifier',
      redirectUri: 'https://chatgpt.com/callback',
    })).rejects.toThrow('Authorization code has expired')
  })

  it('throws for non-S256 method', async () => {
    mockClient.from.mockReturnValue(createChain({
      data: authCodeRow({ code_challenge_method: 'plain' }),
      error: null,
    }))

    await expect(exchangeAuthorizationCode({
      clientId: 'client-1',
      code: 'auth-code',
      codeVerifier: 'verifier',
      redirectUri: 'https://chatgpt.com/callback',
    })).rejects.toThrow('Unsupported PKCE code challenge method')
  })

  it('throws for invalid code verifier', async () => {
    mockClient.from.mockReturnValue(createChain({
      data: authCodeRow({ code_challenge: 'not-the-computed-challenge' }),
      error: null,
    }))

    await expect(exchangeAuthorizationCode({
      clientId: 'client-1',
      code: 'auth-code',
      codeVerifier: 'test-verifier-string-that-is-long-enough',
      redirectUri: 'https://chatgpt.com/callback',
    })).rejects.toThrow('Invalid code verifier')
  })

  it('returns tokens for a valid code and PKCE verifier', async () => {
    const codeVerifier = 'test-verifier-string-that-is-long-enough'
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url')
    const codeLookup = createChain({
      data: authCodeRow({ code_challenge: codeChallenge }),
      error: null,
    })
    const markUsed = createChain({ error: null })
    const insertTokens = createChain({ error: null })
    insertTokens.insert = vi.fn().mockResolvedValue({ error: null })

    let call = 0
    mockClient.from.mockImplementation(() => {
      call++
      if (call === 1) return codeLookup
      if (call === 2) return markUsed
      return insertTokens
    })

    const tokens = await exchangeAuthorizationCode({
      clientId: 'client-1',
      code: 'auth-code',
      codeVerifier,
      redirectUri: 'https://chatgpt.com/callback',
    })

    expect(markUsed.update).toHaveBeenCalledWith({ used_at: expect.any(String) })
    expect(insertTokens.insert).toHaveBeenCalledWith(expect.objectContaining({
      client_id: 'client-1',
      user_id: 'user-1',
      scopes: ['mcp:tools'],
    }))
    expect(tokens.access_token).toMatch(/^mcp_at_/)
    expect(tokens.refresh_token).toMatch(/^mcp_rt_/)
    expect(tokens.token_type).toBe('bearer')
    expect(tokens.scope).toBe('mcp:tools')
  })
})

describe('exchangeRefreshToken - full coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns rotated tokens for a valid refresh token', async () => {
    const tokenLookup = createChain({
      data: tokenRow({ resource: null }),
      error: null,
    })
    const revokeOld = createChain({ error: null })
    const insertTokens = createChain({ error: null })
    insertTokens.insert = vi.fn().mockResolvedValue({ error: null })

    let call = 0
    mockClient.from.mockImplementation(() => {
      call++
      if (call === 1) return tokenLookup
      if (call === 2) return revokeOld
      return insertTokens
    })

    const tokens = await exchangeRefreshToken({
      clientId: 'client-1',
      refreshToken: 'refresh-token',
      scopes: ['mcp:tools'],
      resource: null,
    })

    expect(revokeOld.update).toHaveBeenCalledWith({ revoked_at: expect.any(String) })
    expect(insertTokens.insert).toHaveBeenCalledWith(expect.objectContaining({
      client_id: 'client-1',
      user_id: 'user-1',
      scopes: ['mcp:tools'],
      resource: null,
    }))
    expect(tokens.access_token).toMatch(/^mcp_at_/)
    expect(tokens.refresh_token).toMatch(/^mcp_rt_/)
  })

  it('throws when requested scopes expand the refresh token scopes', async () => {
    mockClient.from.mockReturnValue(createChain({
      data: tokenRow({ scopes: ['mcp:tools'] }),
      error: null,
    }))

    await expect(exchangeRefreshToken({
      clientId: 'client-1',
      refreshToken: 'refresh-token',
      scopes: ['mcp:tools', 'admin:all'],
    })).rejects.toThrow('cannot be expanded')
  })

  it('throws when the requested resource changes', async () => {
    mockClient.from.mockReturnValue(createChain({
      data: tokenRow({ resource: 'https://example.com/api/mcp' }),
      error: null,
    }))

    await expect(exchangeRefreshToken({
      clientId: 'client-1',
      refreshToken: 'refresh-token',
      resource: 'https://other.com/api/mcp',
    })).rejects.toThrow('cannot be changed')
  })
})

describe('OAuth validation edge coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects malformed redirect URIs during dynamic client registration', async () => {
    await expect(registerOAuthClient({
      redirectUris: ['not-a-url'],
    })).rejects.toThrow('not allowed')
  })

  it('normalizes resource identifiers with trailing slashes', () => {
    const result = validateTokenRequestScopeAndResource({
      resource: 'https://example.com/api/mcp/',
      origin: 'https://example.com',
    })

    expect(result.resource).toBe('https://example.com/api/mcp')
  })
})
