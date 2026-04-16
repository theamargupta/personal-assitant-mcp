import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({})),
}))

import {
  buildMcpResourceUrl,
  buildProtectedResourceMetadata,
  buildOAuthMetadata,
  buildResourceMetadataUrl,
  parseBearerToken,
  validateAuthorizeRequest,
  validateTokenRequestScopeAndResource,
} from '@/lib/mcp/oauth'

const ORIGIN = 'https://pa-mcp.devfrend.com'

describe('buildMcpResourceUrl', () => {
  it('builds correct URL', () => {
    expect(buildMcpResourceUrl(ORIGIN)).toBe('https://pa-mcp.devfrend.com/api/mcp')
  })

  it('handles trailing slash', () => {
    expect(buildMcpResourceUrl('https://example.com')).toBe('https://example.com/api/mcp')
  })
})

describe('buildProtectedResourceMetadata', () => {
  it('returns correct metadata shape', () => {
    const meta = buildProtectedResourceMetadata(ORIGIN)
    expect(meta.resource).toBe('https://pa-mcp.devfrend.com/api/mcp')
    expect(meta.authorization_servers).toEqual([ORIGIN])
    expect(meta.scopes_supported).toEqual(['mcp:tools'])
    expect(meta.bearer_methods_supported).toEqual(['header'])
    expect(meta.resource_name).toBe('PA MCP - Personal Assistant')
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
    expect(meta.scopes_supported).toEqual(['mcp:tools'])
    expect(meta.response_types_supported).toEqual(['code'])
    expect(meta.grant_types_supported).toEqual(['authorization_code', 'refresh_token'])
    expect(meta.code_challenge_methods_supported).toEqual(['S256'])
    expect(meta.token_endpoint_auth_methods_supported).toEqual(['none', 'client_secret_post'])
  })
})

describe('buildResourceMetadataUrl', () => {
  it('builds correct well-known URL', () => {
    expect(buildResourceMetadataUrl(ORIGIN))
      .toBe('https://pa-mcp.devfrend.com/.well-known/oauth-protected-resource/api/mcp')
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
