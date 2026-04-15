import { NextRequest, NextResponse } from 'next/server'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { createMcpServer } from '@/lib/mcp/server'
import {
  buildResourceMetadataUrl,
  parseBearerToken,
  verifyOAuthAccessToken,
} from '@/lib/mcp/oauth'

export async function GET() {
  return NextResponse.json({
    name: 'pa-mcp',
    version: '0.1.0',
    protocol: 'mcp',
    status: 'ok',
  })
}

export async function HEAD() {
  return new NextResponse(null, { status: 200 })
}

export async function POST(request: NextRequest) {
  const resourceMetadataUrl = buildResourceMetadataUrl(request.nextUrl.origin)
  const bearerToken = parseBearerToken(request.headers.get('Authorization'))

  if (!bearerToken) {
    return NextResponse.json(
      { error: 'invalid_token', error_description: 'Missing Authorization header' },
      {
        status: 401,
        headers: {
          'WWW-Authenticate': `Bearer error="invalid_token", error_description="Missing Authorization header", resource_metadata="${resourceMetadataUrl}"`,
        },
      }
    )
  }

  let authInfo: {
    token: string
    clientId: string
    scopes: string[]
    extra?: Record<string, unknown>
  }

  try {
    authInfo = await verifyOAuthAccessToken(bearerToken)
  } catch (error) {
    console.error('[PA-MCP] oauth auth failed', error)
    return NextResponse.json(
      { error: 'invalid_token', error_description: error instanceof Error ? error.message : 'Invalid token.' },
      {
        status: 401,
        headers: {
          'WWW-Authenticate': `Bearer error="invalid_token", error_description="${error instanceof Error ? error.message : 'Invalid token.'}", resource_metadata="${resourceMetadataUrl}"`,
        },
      }
    )
  }

  try {
    // New McpServer instance per request (stateless — mandatory for Vercel serverless)
    const server = createMcpServer()
    const transport = new WebStandardStreamableHTTPServerTransport()
    await server.connect(transport)
    const body = await request.clone().json().catch(() => null)

    const response = await transport.handleRequest(request, {
      authInfo: {
        token: authInfo.token,
        clientId: authInfo.clientId,
        scopes: authInfo.scopes,
        extra: authInfo.extra || {},
      },
      parsedBody: body,
    })

    return response
  } catch (error) {
    console.error('PA-MCP Error:', error)
    return NextResponse.json(
      { error: 'Internal Server Error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function DELETE() {
  return new NextResponse(null, { status: 204 })
}
