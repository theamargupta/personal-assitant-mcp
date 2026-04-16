import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mockClient: {
    from: vi.fn(),
  },
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => mocks.mockClient),
}))

import {
  buildMcpResourceUrl,
  buildProtectedResourceMetadata,
  buildOAuthMetadata,
  buildResourceMetadataUrl,
  exchangeAuthorizationCode,
  exchangeRefreshToken,
  parseBearerToken,
  validateAuthorizeRequest,
  validateTokenRequestScopeAndResource,
  verifyOAuthAccessToken,
} from '@/lib/mcp/oauth'

const ORIGIN = 'https://sathi.devfrend.com'

describe('buildMcpResourceUrl', () => {
  it('builds correct URL', () => {
    expect(buildMcpResourceUrl(ORIGIN)).toBe('https://sathi.devfrend.com/api/mcp')
  })

  it('handles trailing slash', () => {
    expect(buildMcpResourceUrl('https://example.com')).toBe('https://example.com/api/mcp')
  })
})

describe('buildProtectedResourceMetadata', () => {
  it('returns correct metadata shape', () => {
    const meta = buildProtectedResourceMetadata(ORIGIN)
    expect(meta.resource).toBe('https://sathi.devfrend.com/api/mcp')
    expect(meta.authorization_servers).toEqual([ORIGIN])
    expect(meta.scopes_supported).toEqual(['mcp:tools', 'mcp:openai'])
    expect(meta.bearer_methods_supported).toEqual(['header'])
    expect(meta.resource_name).toBe('Sathi — Personal Assistant')
  })
})

describe('buildOAuthMetadata', () => {
  it('returns correct metadata', () => {
    const meta = buildOAuthMetadata(ORIGIN)
    expect(meta.issuer).toBe(ORIGIN)
    expect(meta.authorization_endpoint).toBe(`${ORIGIN}/oauth/authorize`)
    expect(meta.token_endpoint).toBe(`${ORIGIN}/oauth/token`)
    expect(meta.registration_endpoint).toBe(`${ORIGIN}/oauth/register`)
    expect(meta.revocation_endpoint).toBe(`${ORIGIN}/oauth/revoke`)
    expect(meta.scopes_supported).toEqual(['mcp:tools', 'mcp:openai'])
    expect(meta.response_types_supported).toEqual(['code'])
    expect(meta.grant_types_supported).toEqual(['authorization_code', 'refresh_token'])
    expect(meta.code_challenge_methods_supported).toEqual(['S256'])
    expect(meta.token_endpoint_auth_methods_supported).toEqual(['none', 'client_secret_post'])
  })
})

describe('buildResourceMetadataUrl', () => {
  it('builds correct well-known URL', () => {
    expect(buildResourceMetadataUrl(ORIGIN))
      .toBe('https://sathi.devfrend.com/.well-known/oauth-protected-resource/api/mcp')
  })
})

describe('parseBearerToken', () => {
  it('returns null for null header', () => {
    expect(parseBearerToken(null)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseBearerToken('')).toBeNull()
  })

  it('returns null for non-bearer scheme', () => {
    expect(parseBearerToken('Basic abc123')).toBeNull()
  })

  it('returns null for bearer without token', () => {
    expect(parseBearerToken('Bearer')).toBeNull()
  })

  it('extracts bearer token', () => {
    expect(parseBearerToken('Bearer mcp_at_abc123')).toBe('mcp_at_abc123')
  })

  it('is case-insensitive for scheme', () => {
    expect(parseBearerToken('bearer mcp_at_xyz')).toBe('mcp_at_xyz')
    expect(parseBearerToken('BEARER mcp_at_xyz')).toBe('mcp_at_xyz')
  })
})

describe('validateAuthorizeRequest', () => {
  const baseInput = {
    client: {
      client_id: 'test-client',
      redirect_uris: ['https://claude.ai/callback'],
      grant_types: ['authorization_code'],
      response_types: ['code'],
      scope: 'mcp:tools',
      token_endpoint_auth_method: 'none',
    },
    redirectUri: 'https://claude.ai/callback',
    scope: 'mcp:tools',
    codeChallenge: 'abc123',
    codeChallengeMethod: 'S256',
    resource: null,
    origin: ORIGIN,
  }

  it('returns scopes and resource for valid request', () => {
    const result = validateAuthorizeRequest(baseInput)
    expect(result.scopes).toEqual(['mcp:tools'])
    expect(result.resource).toBeTruthy()
  })

  it('throws for unregistered redirect_uri', () => {
    expect(() => validateAuthorizeRequest({
      ...baseInput,
      redirectUri: 'https://evil.com/callback',
    })).toThrow('Unregistered redirect_uri')
  })

  it('throws when code_challenge is missing', () => {
    expect(() => validateAuthorizeRequest({
      ...baseInput,
      codeChallenge: null,
    })).toThrow('code_challenge is required')
  })

  it('throws for non-S256 challenge method', () => {
    expect(() => validateAuthorizeRequest({
      ...baseInput,
      codeChallengeMethod: 'plain',
    })).toThrow('code_challenge_method must be S256')
  })

  it('throws for unsupported scope', () => {
    expect(() => validateAuthorizeRequest({
      ...baseInput,
      scope: 'admin:all',
    })).toThrow('Unsupported scope')
  })

  it('accepts mcp:openai scope', () => {
    const result = validateAuthorizeRequest({
      ...baseInput,
      scope: 'mcp:openai',
    })
    expect(result.scopes).toEqual(['mcp:openai'])
  })

  it('accepts null scope (defaults to mcp:tools)', () => {
    const result = validateAuthorizeRequest({
      ...baseInput,
      scope: null,
    })
    expect(result.scopes).toEqual(['mcp:tools'])
  })
})

describe('validateTokenRequestScopeAndResource', () => {
  it('returns undefined scopes when no scope provided', () => {
    const result = validateTokenRequestScopeAndResource({ origin: ORIGIN })
    expect(result.scopes).toBeUndefined()
  })

  it('validates provided scope', () => {
    const result = validateTokenRequestScopeAndResource({ scope: 'mcp:tools', origin: ORIGIN })
    expect(result.scopes).toEqual(['mcp:tools'])
  })

  it('validates mcp:openai scope on token request', () => {
    const result = validateTokenRequestScopeAndResource({ scope: 'mcp:openai', origin: ORIGIN })
    expect(result.scopes).toEqual(['mcp:openai'])
  })

  it('throws for unsupported scope', () => {
    expect(() => validateTokenRequestScopeAndResource({ scope: 'bad:scope', origin: ORIGIN }))
      .toThrow('Unsupported scope')
  })

  it('validates resource when provided', () => {
    const result = validateTokenRequestScopeAndResource({
      resource: `${ORIGIN}/api/mcp`,
      origin: ORIGIN,
    })
    expect(result.resource).toBeTruthy()
  })

  it('throws for mismatched resource', () => {
    expect(() => validateTokenRequestScopeAndResource({
      resource: 'https://evil.com/api/mcp',
      origin: ORIGIN,
    })).toThrow('Unsupported resource parameter')
  })
})

type QueryResult = {
  data?: any
  error?: { message: string } | null
}

type QueryChain = Record<string, ReturnType<typeof vi.fn>> & {
  then: (resolve: (value: QueryResult) => unknown, reject?: (reason: unknown) => unknown) => Promise<unknown>
}

function createOAuthChain(result: QueryResult = { data: null, error: null }): QueryChain {
  const chain = {} as QueryChain
  for (const method of ['select', 'insert', 'update', 'eq', 'or']) {
    chain[method] = vi.fn().mockReturnValue(chain)
  }
  chain.single = vi.fn().mockResolvedValue(result)
  chain.maybeSingle = vi.fn().mockResolvedValue(result)
  chain.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject)
  return chain
}

function tokenRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'token-1',
    client_id: 'client-1',
    user_id: 'user-1',
    scopes: ['mcp:tools'],
    resource: null,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    revoked_at: null,
    ...overrides,
  }
}

function authCodeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'code-1',
    client_id: 'client-1',
    user_id: 'user-1',
    redirect_uri: 'https://chatgpt.com/callback',
    code_challenge: 'stored-challenge',
    code_challenge_method: 'S256',
    scopes: ['mcp:tools'],
    resource: null,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    used_at: null,
    ...overrides,
  }
}

describe('OAuth token database edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockClient.from.mockReturnValue(createOAuthChain())
  })

  it('throws when verifying an expired access token', async () => {
    mocks.mockClient.from.mockReturnValue(createOAuthChain({
      data: tokenRow({ expires_at: new Date(Date.now() - 1_000).toISOString() }),
      error: null,
    }))

    await expect(verifyOAuthAccessToken('expired-token')).rejects.toThrow('Access token has expired')
  })

  it('throws when verifying a revoked access token', async () => {
    mocks.mockClient.from.mockReturnValue(createOAuthChain({
      data: tokenRow({ revoked_at: '2026-04-01T00:00:00.000Z' }),
      error: null,
    }))

    await expect(verifyOAuthAccessToken('revoked-token')).rejects.toThrow('Access token has been revoked')
  })

  it('throws when the refresh token hash does not match a stored token', async () => {
    mocks.mockClient.from.mockReturnValue(createOAuthChain({ data: null, error: null }))

    await expect(exchangeRefreshToken({
      clientId: 'client-1',
      refreshToken: 'wrong-refresh-token',
    })).rejects.toThrow('Invalid refresh token')
  })

  it('throws when a S256 PKCE code verifier does not match the stored challenge', async () => {
    mocks.mockClient.from.mockReturnValue(createOAuthChain({
      data: authCodeRow({ code_challenge: 'not-the-computed-challenge' }),
      error: null,
    }))

    await expect(exchangeAuthorizationCode({
      clientId: 'client-1',
      code: 'auth-code',
      codeVerifier: 'valid-looking-but-wrong-verifier',
      redirectUri: 'https://chatgpt.com/callback',
    })).rejects.toThrow('Invalid code verifier')
  })

  it('rotates a valid refresh token and returns a new token pair', async () => {
    const tokenLookup = createOAuthChain({
      data: tokenRow({ resource: null }),
      error: null,
    })
    const revokeOldToken = createOAuthChain({ error: null })
    const insertNewToken = createOAuthChain({ error: null })
    insertNewToken.insert = vi.fn().mockResolvedValue({ error: null })

    let call = 0
    mocks.mockClient.from.mockImplementation(() => {
      call++
      if (call === 1) return tokenLookup
      if (call === 2) return revokeOldToken
      return insertNewToken
    })

    const tokens = await exchangeRefreshToken({
      clientId: 'client-1',
      refreshToken: 'valid-refresh-token',
      scopes: ['mcp:tools'],
      resource: null,
    })

    expect(revokeOldToken.update).toHaveBeenCalledWith({ revoked_at: expect.any(String) })
    expect(insertNewToken.insert).toHaveBeenCalledWith(expect.objectContaining({
      client_id: 'client-1',
      user_id: 'user-1',
      scopes: ['mcp:tools'],
      resource: null,
    }))
    expect(tokens.access_token).toMatch(/^mcp_at_/)
    expect(tokens.refresh_token).toMatch(/^mcp_rt_/)
    expect(tokens.token_type).toBe('bearer')
    expect(tokens.scope).toBe('mcp:tools')
  })

  it('uses stored refresh token scopes and resource when refresh request omits them', async () => {
    const tokenLookup = createOAuthChain({
      data: tokenRow({
        scopes: null,
        resource: 'https://example.com/api/mcp',
      }),
      error: null,
    })
    const revokeOldToken = createOAuthChain({ error: null })
    const insertNewToken = createOAuthChain({ error: null })
    insertNewToken.insert = vi.fn().mockResolvedValue({ error: null })

    let call = 0
    mocks.mockClient.from.mockImplementation(() => {
      call++
      if (call === 1) return tokenLookup
      if (call === 2) return revokeOldToken
      return insertNewToken
    })

    const tokens = await exchangeRefreshToken({
      clientId: 'client-1',
      refreshToken: 'valid-refresh-token',
    })

    expect(insertNewToken.insert).toHaveBeenCalledWith(expect.objectContaining({
      scopes: ['mcp:tools'],
      resource: 'https://example.com/api/mcp',
    }))
    expect(tokens.scope).toBe('mcp:tools')
  })

  it('throws when issuing rotated refresh-token credentials fails', async () => {
    const tokenLookup = createOAuthChain({
      data: tokenRow({ resource: null }),
      error: null,
    })
    const revokeOldToken = createOAuthChain({ error: null })
    const insertNewToken = createOAuthChain({ error: null })
    insertNewToken.insert = vi.fn().mockResolvedValue({ error: { message: '' } })

    let call = 0
    mocks.mockClient.from.mockImplementation(() => {
      call++
      if (call === 1) return tokenLookup
      if (call === 2) return revokeOldToken
      return insertNewToken
    })

    await expect(exchangeRefreshToken({
      clientId: 'client-1',
      refreshToken: 'valid-refresh-token',
      scopes: ['mcp:tools'],
      resource: null,
    })).rejects.toThrow('Failed to issue OAuth tokens')
  })

  it('returns default scopes and parsed resource for a valid access token', async () => {
    const lookup = createOAuthChain({
      data: tokenRow({
        scopes: null,
        resource: 'https://example.com/api/mcp',
      }),
      error: null,
    })
    const updateLastUsed = createOAuthChain({ error: null })
    let call = 0
    mocks.mockClient.from.mockImplementation(() => {
      call++
      return call === 1 ? lookup : updateLastUsed
    })

    const authInfo = await verifyOAuthAccessToken('valid-token')

    expect(authInfo.scopes).toEqual(['mcp:tools'])
    expect(authInfo.resource?.toString()).toBe('https://example.com/api/mcp')
    expect(updateLastUsed.update).toHaveBeenCalledWith({ last_used_at: expect.any(String) })
  })
})
