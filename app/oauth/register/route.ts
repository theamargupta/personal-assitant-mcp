import { NextRequest, NextResponse } from 'next/server'
import { registerOAuthClient } from '@/lib/mcp/oauth'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  if (!body || !Array.isArray(body.redirect_uris)) {
    return NextResponse.json(
      { error: 'invalid_client_metadata', error_description: 'redirect_uris is required.' },
      { status: 400 }
    )
  }

  try {
    const client = await registerOAuthClient({
      redirectUris: body.redirect_uris,
      clientName: typeof body.client_name === 'string' ? body.client_name : null,
      grantTypes: Array.isArray(body.grant_types) ? body.grant_types : null,
      responseTypes: Array.isArray(body.response_types) ? body.response_types : null,
      scope: typeof body.scope === 'string' ? body.scope : null,
      tokenEndpointAuthMethod:
        typeof body.token_endpoint_auth_method === 'string'
          ? body.token_endpoint_auth_method
          : null,
      metadata: body,
    })

    return NextResponse.json(client, { status: 201 })
  } catch (error) {
    console.error('[PA-MCP OAuth] register failed', error)
    return NextResponse.json(
      {
        error: 'invalid_client_metadata',
        error_description: error instanceof Error ? error.message : 'Failed to register OAuth client.',
      },
      { status: 400 }
    )
  }
}
