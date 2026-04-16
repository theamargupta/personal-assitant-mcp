import { NextRequest, NextResponse } from 'next/server'
import {
  exchangeAuthorizationCode,
  exchangeRefreshToken,
  getOAuthClient,
  validateTokenRequestScopeAndResource,
} from '@/lib/mcp/oauth'

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null)
  if (!form) {
    return NextResponse.json(
      { error: 'invalid_request', error_description: 'Expected form-encoded body.' },
      { status: 400 }
    )
  }

  const grantType = form.get('grant_type')
  const clientId = typeof form.get('client_id') === 'string' ? String(form.get('client_id')) : null

  try {
    if (!clientId) throw new Error('client_id is required.')

    const client = await getOAuthClient(clientId)
    if (!client) throw new Error('Unknown client_id.')

    const validated = validateTokenRequestScopeAndResource({
      scope: typeof form.get('scope') === 'string' ? String(form.get('scope')) : undefined,
      resource: typeof form.get('resource') === 'string' ? String(form.get('resource')) : undefined,
      origin: request.nextUrl.origin,
    })

    if (grantType === 'authorization_code') {
      const code = typeof form.get('code') === 'string' ? String(form.get('code')) : null
      const codeVerifier = typeof form.get('code_verifier') === 'string' ? String(form.get('code_verifier')) : null
      const redirectUri = typeof form.get('redirect_uri') === 'string' ? String(form.get('redirect_uri')) : null

      if (!code || !codeVerifier || !redirectUri) {
        throw new Error('code, code_verifier, and redirect_uri are required.')
      }

      const tokens = await exchangeAuthorizationCode({
        clientId: client.client_id,
        code,
        codeVerifier,
        redirectUri,
        resource: validated.resource ?? null,
      })
      return NextResponse.json(tokens)
    }

    if (grantType === 'refresh_token') {
      const refreshToken = typeof form.get('refresh_token') === 'string' ? String(form.get('refresh_token')) : null
      if (!refreshToken) throw new Error('refresh_token is required.')

      const tokens = await exchangeRefreshToken({
        clientId: client.client_id,
        refreshToken,
        scopes: validated.scopes,
        resource: validated.resource,
      })
      return NextResponse.json(tokens)
    }

    return NextResponse.json(
      { error: 'unsupported_grant_type', error_description: 'Unsupported grant_type.' },
      { status: 400 }
    )
  } catch (error) {
    console.error('[SATHI OAuth] token failed', error)
    return NextResponse.json(
      {
        error: 'invalid_grant',
        error_description: error instanceof Error ? error.message : 'Token exchange failed.',
      },
      { status: 400 }
    )
  }
}
