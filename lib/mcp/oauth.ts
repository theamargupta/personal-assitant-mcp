import 'server-only'

import * as crypto from 'crypto'

import type {
  OAuthClientInformationFull,
  OAuthMetadata,
  OAuthProtectedResourceMetadata,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js'
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js'

import { createServiceRoleClient } from '@/lib/supabase/service-role'

const ACCESS_TOKEN_TTL_SECONDS = 60 * 60
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30
const AUTHORIZATION_CODE_TTL_SECONDS = 60 * 10
const SUPPORTED_SCOPES = ['mcp:tools']
const SUPPORTED_REDIRECT_HOSTS = new Set([
  'claude.ai',
  'claude.com',
  'chatgpt.com',
  'chat.openai.com',
  'platform.openai.com',
  'auth.openai.com',
])

function isLocalhostRedirect(uri: string): boolean {
  try {
    const parsed = new URL(uri)
    return parsed.protocol === 'http:' && parsed.hostname === 'localhost'
  } catch {
    return false
  }
}

type OAuthClientRow = {
  client_id: string
  client_secret_hash: string | null
  client_name: string | null
  redirect_uris: unknown
  grant_types: string[] | null
  response_types: string[] | null
  scope: string | null
  token_endpoint_auth_method: string
  created_at?: string
}

type AuthorizationCodeRow = {
  id: string
  client_id: string
  user_id: string
  redirect_uri: string
  code_challenge: string
  code_challenge_method: string
  scopes: string[] | null
  resource: string | null
  expires_at: string
  used_at: string | null
}

type TokenRow = {
  id: string
  client_id: string
  user_id: string
  scopes: string[] | null
  resource: string | null
  expires_at: string
  revoked_at: string | null
}

// ── URL helpers ──────────────────────────────────────────

export function buildMcpResourceUrl(origin: string): string {
  return new URL('/api/mcp', origin).toString()
}

function normalizeResourceIdentifier(resource: string): string {
  const url = new URL(resource)
  url.hash = ''
  url.search = ''
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.slice(0, -1)
  }
  return url.toString()
}

// ── Discovery metadata ───────────────────────────────────

export function buildProtectedResourceMetadata(origin: string): OAuthProtectedResourceMetadata {
  const resource = buildMcpResourceUrl(origin)
  return {
    resource,
    authorization_servers: [origin],
    scopes_supported: SUPPORTED_SCOPES,
    bearer_methods_supported: ['header'],
    resource_name: 'Sathi — Personal Assistant',
    resource_documentation: new URL('/settings/connections', origin).toString(),
  }
}

export function buildOAuthMetadata(origin: string): OAuthMetadata {
  return {
    issuer: origin,
    authorization_endpoint: new URL('/oauth/authorize', origin).toString(),
    token_endpoint: new URL('/oauth/token', origin).toString(),
    registration_endpoint: new URL('/oauth/register', origin).toString(),
    revocation_endpoint: new URL('/oauth/revoke', origin).toString(),
    scopes_supported: SUPPORTED_SCOPES,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
    revocation_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
    code_challenge_methods_supported: ['S256'],
  }
}

export function buildResourceMetadataUrl(origin: string): string {
  return new URL('/.well-known/oauth-protected-resource/api/mcp', origin).toString()
}

// ── Crypto helpers ───────────────────────────────────────

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function randomToken(prefix: string): string {
  return `${prefix}${crypto.randomBytes(32).toString('base64url')}`
}

function createCodeChallengeS256(codeVerifier: string): string {
  return crypto.createHash('sha256').update(codeVerifier).digest('base64url')
}

// ── Validation helpers ───────────────────────────────────

function normalizeRedirectUris(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

function isAllowedRedirectUri(uri: string): boolean {
  if (isLocalhostRedirect(uri)) return true
  let parsed: URL
  try {
    parsed = new URL(uri)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:') return false
  if (SUPPORTED_REDIRECT_HOSTS.has(parsed.hostname)) return true
  if (parsed.hostname.endsWith('.chatgpt.com')) return true
  if (parsed.hostname.endsWith('.openai.com')) return true
  return false
}

function normalizeScopes(scope: string | null | undefined): string[] {
  const requested = (scope || 'mcp:tools')
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
  const unique = Array.from(new Set(requested))
  if (unique.length === 0) return ['mcp:tools']
  return unique
}

function assertSupportedScopes(scopes: string[]) {
  const invalid = scopes.filter((scope) => !SUPPORTED_SCOPES.includes(scope))
  if (invalid.length > 0) {
    throw new Error(`Unsupported scope: ${invalid.join(', ')}`)
  }
}

function validateResource(resource: string | null | undefined, origin: string): string | null {
  const expected = normalizeResourceIdentifier(buildMcpResourceUrl(origin))
  if (!resource) return expected
  const normalizedResource = normalizeResourceIdentifier(resource)
  if (normalizedResource !== expected) {
    throw new Error('Unsupported resource parameter.')
  }
  return normalizedResource
}

// ── Client Registration (DCR) ────────────────────────────

export async function registerOAuthClient(input: {
  redirectUris: string[]
  clientName?: string | null
  grantTypes?: string[] | null
  responseTypes?: string[] | null
  scope?: string | null
  tokenEndpointAuthMethod?: string | null
  metadata?: Record<string, unknown>
}): Promise<OAuthClientInformationFull> {
  const redirectUris = Array.from(new Set(input.redirectUris.map((uri) => uri.trim()).filter(Boolean)))
  if (redirectUris.length === 0) {
    throw new Error('At least one redirect URI is required.')
  }
  if (!redirectUris.every(isAllowedRedirectUri)) {
    throw new Error('One or more redirect URIs are not allowed.')
  }

  const grantTypes = input.grantTypes?.length ? input.grantTypes : ['authorization_code', 'refresh_token']
  const responseTypes = input.responseTypes?.length ? input.responseTypes : ['code']
  const tokenEndpointAuthMethod = 'none'

  const clientId = `mcp_client_${crypto.randomBytes(18).toString('base64url')}`
  const now = Math.floor(Date.now() / 1000)

  const supabase = createServiceRoleClient()
  const { error } = await supabase.from('mcp_oauth_clients').insert({
    client_id: clientId,
    client_name: input.clientName?.trim() || null,
    redirect_uris: redirectUris,
    grant_types: grantTypes,
    response_types: responseTypes,
    scope: input.scope?.trim() || 'mcp:tools',
    token_endpoint_auth_method: tokenEndpointAuthMethod,
    metadata: {
      ...(input.metadata || {}),
    },
  })

  if (error) {
    throw new Error(error.message || 'Failed to register OAuth client.')
  }

  return {
    client_id: clientId,
    client_id_issued_at: now,
    redirect_uris: redirectUris,
    client_name: input.clientName?.trim() || undefined,
    grant_types: grantTypes,
    response_types: responseTypes,
    scope: input.scope?.trim() || 'mcp:tools',
    token_endpoint_auth_method: tokenEndpointAuthMethod,
  }
}

// ── Client Lookup ────────────────────────────────────────

export async function getOAuthClient(clientId: string): Promise<OAuthClientInformationFull | null> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('mcp_oauth_clients')
    .select(
      'client_id, client_secret_hash, client_name, redirect_uris, grant_types, response_types, scope, token_endpoint_auth_method, created_at'
    )
    .eq('client_id', clientId)
    .maybeSingle<OAuthClientRow>()

  if (error || !data) return null

  const issuedAt = data.created_at ? Math.floor(new Date(data.created_at).getTime() / 1000) : undefined

  return {
    client_id: data.client_id,
    client_name: data.client_name || undefined,
    redirect_uris: normalizeRedirectUris(data.redirect_uris),
    grant_types: data.grant_types || ['authorization_code', 'refresh_token'],
    response_types: data.response_types || ['code'],
    scope: data.scope || undefined,
    token_endpoint_auth_method: data.token_endpoint_auth_method,
    client_id_issued_at: issuedAt,
  }
}

// ── Authorization Code ───────────────────────────────────

export async function createAuthorizationCode(input: {
  clientId: string
  userId: string
  redirectUri: string
  codeChallenge: string
  codeChallengeMethod: string
  scopes: string[]
  resource: string | null
}): Promise<string> {
  const code = randomToken('mcp_auth_')
  const expiresAt = new Date(Date.now() + AUTHORIZATION_CODE_TTL_SECONDS * 1000).toISOString()
  const supabase = createServiceRoleClient()
  const { error } = await supabase.from('mcp_oauth_authorization_codes').insert({
    code_hash: sha256(code),
    client_id: input.clientId,
    user_id: input.userId,
    redirect_uri: input.redirectUri,
    code_challenge: input.codeChallenge,
    code_challenge_method: input.codeChallengeMethod,
    scopes: input.scopes,
    resource: input.resource,
    expires_at: expiresAt,
  })

  if (error) {
    throw new Error(error.message || 'Failed to create authorization code.')
  }

  return code
}

// ── Token Exchange (authorization_code) ──────────────────

export async function exchangeAuthorizationCode(input: {
  clientId: string
  code: string
  codeVerifier: string
  redirectUri: string
  resource?: string | null
}): Promise<OAuthTokens> {
  const supabase = createServiceRoleClient()
  const codeHash = sha256(input.code)

  const { data, error } = await supabase
    .from('mcp_oauth_authorization_codes')
    .select('id, client_id, user_id, redirect_uri, code_challenge, code_challenge_method, scopes, resource, expires_at, used_at')
    .eq('code_hash', codeHash)
    .maybeSingle<AuthorizationCodeRow>()

  if (error || !data) throw new Error('Invalid authorization code.')
  if (data.used_at) throw new Error('Authorization code has already been used.')
  if (data.client_id !== input.clientId) throw new Error('Authorization code was not issued to this client.')
  if (data.redirect_uri !== input.redirectUri) throw new Error('Redirect URI does not match authorization code.')
  if (new Date(data.expires_at).getTime() <= Date.now()) throw new Error('Authorization code has expired.')
  if (data.code_challenge_method !== 'S256') throw new Error('Unsupported PKCE code challenge method.')

  const computedChallenge = createCodeChallengeS256(input.codeVerifier)
  if (computedChallenge !== data.code_challenge) throw new Error('Invalid code verifier.')

  await supabase
    .from('mcp_oauth_authorization_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('id', data.id)

  return issueTokens({
    clientId: data.client_id,
    userId: data.user_id,
    scopes: data.scopes || ['mcp:tools'],
    resource: data.resource ? normalizeResourceIdentifier(data.resource) : null,
  })
}

// ── Token Exchange (refresh_token) ───────────────────────

export async function exchangeRefreshToken(input: {
  clientId: string
  refreshToken: string
  scopes?: string[] | null
  resource?: string | null
}): Promise<OAuthTokens> {
  const supabase = createServiceRoleClient()
  const refreshTokenHash = sha256(input.refreshToken)

  const { data, error } = await supabase
    .from('mcp_oauth_tokens')
    .select('id, client_id, user_id, scopes, resource, expires_at, revoked_at')
    .eq('refresh_token_hash', refreshTokenHash)
    .maybeSingle<TokenRow>()

  if (error || !data) throw new Error('Invalid refresh token.')
  if (data.revoked_at) throw new Error('Refresh token has been revoked.')

  const nextScopes = input.scopes?.length ? input.scopes : data.scopes || ['mcp:tools']
  const currentScopes = new Set(data.scopes || ['mcp:tools'])
  if (nextScopes.some((scope) => !currentScopes.has(scope))) {
    throw new Error('Refresh token scopes cannot be expanded.')
  }

  const nextResource = input.resource === undefined ? data.resource || null : input.resource
  if ((nextResource || null) !== (data.resource || null)) {
    throw new Error('Refresh token resource cannot be changed.')
  }

  // Revoke old token pair (rotation)
  await supabase
    .from('mcp_oauth_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', data.id)

  return issueTokens({
    clientId: data.client_id,
    userId: data.user_id,
    scopes: nextScopes,
    resource: data.resource || null,
  })
}

// ── Issue Token Pair ─────────────────────────────────────

async function issueTokens(input: {
  clientId: string
  userId: string
  scopes: string[]
  resource: string | null
}): Promise<OAuthTokens> {
  const accessToken = randomToken('mcp_at_')
  const refreshToken = randomToken('mcp_rt_')
  const accessExpiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000)
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000)

  const supabase = createServiceRoleClient()
  const { error } = await supabase.from('mcp_oauth_tokens').insert({
    client_id: input.clientId,
    user_id: input.userId,
    access_token_hash: sha256(accessToken),
    refresh_token_hash: sha256(refreshToken),
    scopes: input.scopes,
    resource: input.resource,
    expires_at: accessExpiresAt.toISOString(),
    refresh_expires_at: refreshExpiresAt.toISOString(),
  })

  if (error) throw new Error(error.message || 'Failed to issue OAuth tokens.')

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: 'bearer',
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    scope: input.scopes.join(' '),
  }
}

// ── Token Revocation ─────────────────────────────────────

export async function revokeOAuthToken(token: string): Promise<void> {
  const tokenHash = sha256(token)
  const supabase = createServiceRoleClient()
  await supabase
    .from('mcp_oauth_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .or(`access_token_hash.eq.${tokenHash},refresh_token_hash.eq.${tokenHash}`)
}

// ── Token Verification (every MCP request) ───────────────

export async function verifyOAuthAccessToken(token: string): Promise<AuthInfo> {
  const tokenHash = sha256(token)
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('mcp_oauth_tokens')
    .select('id, client_id, user_id, scopes, resource, expires_at, revoked_at')
    .eq('access_token_hash', tokenHash)
    .maybeSingle<TokenRow>()

  if (error || !data) throw new Error('Invalid access token.')
  if (data.revoked_at) throw new Error('Access token has been revoked.')

  const expiresAtMs = new Date(data.expires_at).getTime()
  if (expiresAtMs <= Date.now()) throw new Error('Access token has expired.')

  // Fire-and-forget: update last_used_at
  void supabase
    .from('mcp_oauth_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id)

  return {
    token,
    clientId: data.client_id,
    scopes: data.scopes || ['mcp:tools'],
    expiresAt: Math.floor(expiresAtMs / 1000),
    resource: data.resource ? new URL(data.resource) : undefined,
    extra: { userId: data.user_id },
  }
}

// ── Request parsing helpers ──────────────────────────────

export function parseBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null
  const [scheme, token] = authHeader.split(' ')
  if (!scheme || !token) return null
  if (scheme.toLowerCase() !== 'bearer') return null
  return token
}

export function validateAuthorizeRequest(input: {
  client: OAuthClientInformationFull
  redirectUri: string
  scope: string | null
  codeChallenge: string | null
  codeChallengeMethod: string | null
  resource: string | null
  origin: string
}) {
  if (!input.client.redirect_uris.includes(input.redirectUri)) {
    throw new Error('Unregistered redirect_uri.')
  }
  if (!input.codeChallenge) throw new Error('code_challenge is required.')
  if (input.codeChallengeMethod !== 'S256') throw new Error('code_challenge_method must be S256.')

  const scopes = normalizeScopes(input.scope)
  assertSupportedScopes(scopes)
  const resource = validateResource(input.resource, input.origin)

  return { scopes, resource }
}

export function validateTokenRequestScopeAndResource(input: {
  scope?: string | null
  resource?: string | null
  origin: string
}) {
  const scopes = input.scope ? normalizeScopes(input.scope) : undefined
  if (scopes) assertSupportedScopes(scopes)
  const resource = input.resource === undefined ? undefined : validateResource(input.resource, input.origin)
  return { scopes, resource }
}
