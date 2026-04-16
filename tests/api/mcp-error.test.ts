import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/mcp/server', () => ({
  createMcpServer: vi.fn().mockReturnValue({
    connect: vi.fn().mockResolvedValue(undefined),
  }),
}))

vi.mock('@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js', () => ({
  WebStandardStreamableHTTPServerTransport: class {
    handleRequest = vi.fn().mockRejectedValue(new Error('Transport failed'))
  },
}))

vi.mock('@/lib/mcp/oauth', () => ({
  buildResourceMetadataUrl: vi.fn().mockReturnValue('https://test.com/.well-known/oauth-protected-resource/api/mcp'),
  parseBearerToken: vi.fn().mockReturnValue('valid-token'),
  verifyOAuthAccessToken: vi.fn().mockResolvedValue({
    token: 'valid-token',
    clientId: 'client-1',
    scopes: ['mcp:tools'],
    extra: { userId: 'user-1' },
  }),
}))

import { POST } from '@/app/api/mcp/route'

describe('POST /api/mcp error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('returns 500 when MCP transport handling fails', async () => {
    const request = new NextRequest('http://localhost/api/mcp', {
      method: 'POST',
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 }),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-token' },
    })

    const response = await POST(request)

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: 'Internal Server Error',
      message: 'Transport failed',
    })
  })
})
