import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/mcp/server', () => ({
  createMcpServer: vi.fn().mockReturnValue({
    connect: vi.fn().mockResolvedValue(undefined),
  }),
}))

vi.mock('@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js', () => ({
  WebStandardStreamableHTTPServerTransport: class {
    handleRequest = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ result: 'ok' }), { status: 200 })
    )
  },
}))

vi.mock('@/lib/mcp/oauth', () => ({
  buildResourceMetadataUrl: vi.fn().mockReturnValue('https://test.com/.well-known/oauth-protected-resource/api/mcp'),
  parseBearerToken: vi.fn(),
  verifyOAuthAccessToken: vi.fn(),
}))

import { GET, HEAD, POST, DELETE } from '@/app/api/mcp/route'
import { parseBearerToken, verifyOAuthAccessToken } from '@/lib/mcp/oauth'

const mockParseBearerToken = parseBearerToken as ReturnType<typeof vi.fn>
const mockVerifyOAuthAccessToken = verifyOAuthAccessToken as ReturnType<typeof vi.fn>

describe('GET /api/mcp', () => {
  it('returns server info', async () => {
    const response = await GET()
    const body = await response.json()
    expect(body.name).toBe('pa-mcp')
    expect(body.version).toBe('0.1.0')
    expect(body.protocol).toBe('mcp')
    expect(body.status).toBe('ok')
  })
})

describe('HEAD /api/mcp', () => {
  it('returns 200', async () => {
    const response = await HEAD()
    expect(response.status).toBe(200)
  })
})

describe('DELETE /api/mcp', () => {
  it('returns 204', async () => {
    const response = await DELETE()
    expect(response.status).toBe(204)
  })
})

describe('POST /api/mcp', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns 401 when no bearer token', async () => {
    mockParseBearerToken.mockReturnValue(null)

    const req = new NextRequest('http://localhost/api/mcp', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(req)
    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body.error).toBe('invalid_token')
  })

  it('returns 401 when token verification fails', async () => {
    mockParseBearerToken.mockReturnValue('bad-token')
    mockVerifyOAuthAccessToken.mockRejectedValue(new Error('Invalid access token'))

    const req = new NextRequest('http://localhost/api/mcp', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer bad-token' },
    })

    const response = await POST(req)
    expect(response.status).toBe(401)
  })

  it('processes valid request', async () => {
    mockParseBearerToken.mockReturnValue('valid-token')
    mockVerifyOAuthAccessToken.mockResolvedValue({
      token: 'valid-token',
      clientId: 'test-client',
      scopes: ['mcp:tools'],
      extra: { userId: 'user-1' },
    })

    const req = new NextRequest('http://localhost/api/mcp', {
      method: 'POST',
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 }),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-token' },
    })

    const response = await POST(req)
    expect(response.status).toBe(200)
  })
})
