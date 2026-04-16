import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  createAuthorizationCode,
  getOAuthClient,
  validateAuthorizeRequest,
} from '@/lib/mcp/oauth'

function buildRedirectUri(redirectUri: string, params: Record<string, string | undefined>) {
  const url = new URL(redirectUri)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, value)
    }
  }
  return url.toString()
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function getAuthorizeParams(source: URLSearchParams | FormData) {
  const get = (key: string) => {
    const value = source.get(key)
    return typeof value === 'string' ? value : null
  }

  return {
    clientId: get('client_id'),
    redirectUri: get('redirect_uri'),
    responseType: get('response_type'),
    state: get('state') || undefined,
    scope: get('scope'),
    codeChallenge: get('code_challenge'),
    codeChallengeMethod: get('code_challenge_method'),
    resource: get('resource'),
  }
}

async function authorizeOrError(
  userId: string,
  origin: string,
  params: ReturnType<typeof getAuthorizeParams>
) {
  const { clientId, redirectUri, state, scope, codeChallenge, codeChallengeMethod, resource } = params

  if (params.responseType !== 'code') {
    return NextResponse.json(
      { error: 'unsupported_response_type', error_description: 'response_type must be code.' },
      { status: 400 }
    )
  }
  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: 'invalid_request', error_description: 'client_id and redirect_uri are required.' },
      { status: 400 }
    )
  }

  const client = await getOAuthClient(clientId)
  if (!client) {
    return NextResponse.json(
      { error: 'invalid_client', error_description: 'Unknown client_id.' },
      { status: 400 }
    )
  }

  try {
    const validated = validateAuthorizeRequest({
      client,
      redirectUri,
      scope,
      codeChallenge,
      codeChallengeMethod,
      resource,
      origin,
    })

    const code = await createAuthorizationCode({
      clientId,
      userId,
      redirectUri,
      codeChallenge: codeChallenge!,
      codeChallengeMethod: codeChallengeMethod!,
      scopes: validated.scopes,
      resource: validated.resource,
    })

    return NextResponse.redirect(
      buildRedirectUri(redirectUri, { code, state }),
      { status: 303 }
    )
  } catch (error) {
    console.error('[SATHI OAuth] authorize failed', error)
    return NextResponse.redirect(
      buildRedirectUri(redirectUri, {
        error: 'invalid_request',
        error_description: error instanceof Error ? error.message : 'Authorization failed.',
        state,
      }),
      { status: 303 }
    )
  }
}

// GET — consent page (uses Supabase Auth session)
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const params = getAuthorizeParams(request.nextUrl.searchParams)

  if (!user) {
    const next = `${request.nextUrl.pathname}${request.nextUrl.search}`
    const loginUrl = new URL('/login', request.nextUrl.origin)
    loginUrl.searchParams.set('next', next)
    return NextResponse.redirect(loginUrl)
  }

  if (!params.clientId || !params.redirectUri || params.responseType !== 'code') {
    return NextResponse.json(
      { error: 'invalid_request', error_description: 'Missing OAuth authorization parameters.' },
      { status: 400 }
    )
  }

  const client = await getOAuthClient(params.clientId)
  if (!client) {
    return NextResponse.json(
      { error: 'invalid_client', error_description: 'Unknown client_id.' },
      { status: 400 }
    )
  }

  const clientName = client.client_name || 'Claude'
  const scopeText = params.scope || 'mcp:tools'
  const resourceText = params.resource || `${request.nextUrl.origin}/api/mcp`

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Authorize ${escapeHtml(clientName)} — Sathi</title>
    <style>
      :root { color-scheme: dark; }
      body {
        margin: 0; min-height: 100vh; display: grid; place-items: center;
        background: radial-gradient(circle at top, #18232e 0%, #0a0d10 55%);
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #f5f7fa;
      }
      .card {
        width: min(92vw, 520px); border: 1px solid rgba(255,255,255,0.08);
        border-radius: 20px; background: rgba(17, 23, 30, 0.94);
        box-shadow: 0 20px 80px rgba(0,0,0,0.45); padding: 28px;
      }
      h1 { margin: 0 0 12px; font-size: 32px; }
      p { margin: 0 0 12px; color: rgba(245,247,250,0.74); line-height: 1.55; }
      .meta {
        margin: 18px 0 22px; padding: 14px 16px; border-radius: 14px;
        background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06);
      }
      .meta strong { display: block; font-size: 12px; color: rgba(245,247,250,0.64); margin-bottom: 4px; }
      .meta code { font-size: 12px; color: #9bd6ff; word-break: break-all; }
      button {
        width: 100%; border: 0; border-radius: 12px; padding: 14px 18px;
        font-size: 16px; font-weight: 700; cursor: pointer;
        background: linear-gradient(135deg, #4ab4d6 0%, #2f8cb6 100%); color: white;
      }
    </style>
  </head>
  <body>
    <form class="card" method="post">
      <h1>Authorize ${escapeHtml(clientName)}</h1>
      <p>Confirm access so ${escapeHtml(clientName)} can connect to your Sathi personal assistant tools.</p>
      <div class="meta"><strong>Signed in as</strong><code>${escapeHtml(user.email || '')}</code></div>
      <div class="meta"><strong>Requested scope</strong><code>${escapeHtml(scopeText)}</code></div>
      <div class="meta"><strong>Resource</strong><code>${escapeHtml(resourceText)}</code></div>
      <input type="hidden" name="response_type" value="${escapeHtml(params.responseType)}" />
      <input type="hidden" name="client_id" value="${escapeHtml(params.clientId)}" />
      <input type="hidden" name="redirect_uri" value="${escapeHtml(params.redirectUri)}" />
      <input type="hidden" name="code_challenge" value="${escapeHtml(params.codeChallenge || '')}" />
      <input type="hidden" name="code_challenge_method" value="${escapeHtml(params.codeChallengeMethod || '')}" />
      <input type="hidden" name="state" value="${escapeHtml(params.state || '')}" />
      <input type="hidden" name="scope" value="${escapeHtml(params.scope || '')}" />
      <input type="hidden" name="resource" value="${escapeHtml(params.resource || '')}" />
      <button type="submit">Allow Access</button>
    </form>
  </body>
</html>`

  return new NextResponse(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

// POST — approve authorization (uses Supabase Auth session)
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json(
      { error: 'unauthorized', error_description: 'Login required.' },
      { status: 401 }
    )
  }

  const formData = await request.formData()
  const params = getAuthorizeParams(formData)

  return authorizeOrError(user.id, request.nextUrl.origin, params)
}
