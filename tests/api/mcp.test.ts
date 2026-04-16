import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  createMcpServer: vi.fn(),
  connect: vi.fn(),
  handleRequest: vi.fn(),
  buildResourceMetadataUrl: vi.fn(),
  parseBearerToken: vi.fn(),
  verifyOAuthAccessToken: vi.fn(),
}))

vi.mock('@/lib/mcp/server', () => ({
  createMcpServer: mocks.createMcpServer,
}))

vi.mock('@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js', () => ({
  WebStandardStreamableHTTPServerTransport: class {
    handleRequest = mocks.handleRequest
  },
}))

vi.mock('@/lib/mcp/oauth', () => ({
  buildResourceMetadataUrl: mocks.buildResourceMetadataUrl,
  parseBearerToken: mocks.parseBearerToken,
  verifyOAuthAccessToken: mocks.verifyOAuthAccessToken,
}))

import { DELETE, GET, HEAD, POST } from '@/app/api/mcp/route'

function createPostRequest(headers: Record<string, string> = {}, body: unknown = {}) {
  return new NextRequest('http://localhost/api/mcp', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.buildResourceMetadataUrl.mockReturnValue('https://test/.well-known/oauth-protected-resource/api/mcp')
  mocks.connect.mockResolvedValue(undefined)
  mocks.createMcpServer.mockReturnValue({ connect: mocks.connect })
  mocks.handleRequest.mockResolvedValue(
    new Response(JSON.stringify({ result: 'ok' }), { status: 200 })
  )
})

describe('GET /api/mcp', () => {
  it('returns server info', async () => {
    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      name: 'sathi',
      version: '0.1.0',
      protocol: 'mcp',
      status: 'ok',
    })
  })
})

describe('HEAD /api/mcp', () => {
  it('returns 200 with an empty body', async () => {
    const response = await HEAD()

    expect(response.status).toBe(200)
    expect(response.body).toBeNull()
  })
})

describe('DELETE /api/mcp', () => {
  it('returns 204 with no body', async () => {
    const response = await DELETE()

    expect(response.status).toBe(204)
    expect(response.body).toBeNull()
  })
})

describe('POST /api/mcp', () => {
  it('returns a bearer challenge when the Authorization header is missing', async () => {
    mocks.parseBearerToken.mockReturnValueOnce(null)

    const response = await POST(createPostRequest())
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body).toEqual({
      error: 'invalid_token',
      error_description: 'Missing Authorization header',
    })
    expect(response.headers.get('WWW-Authenticate')).toContain('Missing Authorization header')
    expect(response.headers.get('WWW-Authenticate')).toContain('resource_metadata="https://test/.well-known/oauth-protected-resource/api/mcp"')
    expect(mocks.verifyOAuthAccessToken).not.toHaveBeenCalled()
  })

  it('returns a bearer challenge with the OAuth error message for invalid tokens', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.parseBearerToken.mockReturnValueOnce('bad-token')
    mocks.verifyOAuthAccessToken.mockRejectedValueOnce(new Error('Invalid access token'))

    const response = await POST(createPostRequest({ Authorization: 'Bearer bad-token' }))
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body).toEqual({
      error: 'invalid_token',
      error_description: 'Invalid access token',
    })
    expect(response.headers.get('WWW-Authenticate')).toContain('Invalid access token')
    expect(consoleError).toHaveBeenCalledWith('[SATHI] oauth auth failed', expect.any(Error))
    consoleError.mockRestore()
  })

  it('uses the invalid token fallback when OAuth verification throws a non-Error value', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.parseBearerToken.mockReturnValueOnce('bad-token')
    mocks.verifyOAuthAccessToken.mockRejectedValueOnce('not-an-error')

    const response = await POST(createPostRequest({ Authorization: 'Bearer bad-token' }))
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body).toEqual({
      error: 'invalid_token',
      error_description: 'Invalid token.',
    })
    expect(response.headers.get('WWW-Authenticate')).toContain('Invalid token.')
    expect(consoleError).toHaveBeenCalledWith('[SATHI] oauth auth failed', 'not-an-error')
    consoleError.mockRestore()
  })

  it('passes auth info and parsed body to the MCP transport for valid requests', async () => {
    mocks.parseBearerToken.mockReturnValueOnce('valid-token')
    mocks.verifyOAuthAccessToken.mockResolvedValueOnce({
      token: 'valid-token',
      clientId: 'test-client',
      scopes: ['mcp:tools'],
      extra: { userId: 'user-1' },
    })

    const request = createPostRequest(
      { Authorization: 'Bearer valid-token' },
      { jsonrpc: '2.0', method: 'tools/list', id: 1 }
    )

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ result: 'ok' })
    expect(mocks.connect).toHaveBeenCalledTimes(1)
    expect(mocks.handleRequest).toHaveBeenCalledWith(request, {
      authInfo: {
        token: 'valid-token',
        clientId: 'test-client',
        scopes: ['mcp:tools'],
        extra: { userId: 'user-1' },
      },
      parsedBody: { jsonrpc: '2.0', method: 'tools/list', id: 1 },
    })
  })

  it('passes null parsedBody when request JSON parsing fails', async () => {
    mocks.parseBearerToken.mockReturnValueOnce('valid-token')
    mocks.verifyOAuthAccessToken.mockResolvedValueOnce({
      token: 'valid-token',
      clientId: 'test-client',
      scopes: ['mcp:tools'],
      extra: { userId: 'user-1' },
    })
    mocks.handleRequest.mockImplementationOnce(async (_request, options) => {
      return new Response(JSON.stringify({ parsedBody: options.parsedBody }), { status: 200 })
    })

    const request = createPostRequest({ Authorization: 'Bearer valid-token' })
    vi.spyOn(request, 'clone').mockReturnValue({
      json: vi.fn().mockRejectedValue(new Error('Malformed JSON')),
    } as unknown as NextRequest)

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ parsedBody: null })
    expect(mocks.handleRequest).toHaveBeenCalledWith(request, expect.objectContaining({ parsedBody: null }))
  })

  it('uses an empty auth extra object when the token has no extra metadata', async () => {
    mocks.parseBearerToken.mockReturnValueOnce('valid-token')
    mocks.verifyOAuthAccessToken.mockResolvedValueOnce({
      token: 'valid-token',
      clientId: 'test-client',
      scopes: ['mcp:tools'],
    })

    const request = createPostRequest({ Authorization: 'Bearer valid-token' })
    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(mocks.handleRequest).toHaveBeenCalledWith(request, expect.objectContaining({
      authInfo: {
        token: 'valid-token',
        clientId: 'test-client',
        scopes: ['mcp:tools'],
        extra: {},
      },
    }))
  })

  it('returns 500 when the MCP transport throws', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.parseBearerToken.mockReturnValueOnce('valid-token')
    mocks.verifyOAuthAccessToken.mockResolvedValueOnce({
      token: 'valid-token',
      clientId: 'test-client',
      scopes: ['mcp:tools'],
      extra: { userId: 'user-1' },
    })
    mocks.handleRequest.mockRejectedValueOnce(new Error('Transport failed'))

    const response = await POST(createPostRequest({ Authorization: 'Bearer valid-token' }))
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body).toEqual({
      error: 'Internal Server Error',
      message: 'Transport failed',
    })
    expect(consoleError).toHaveBeenCalledWith('SATHI Error:', expect.any(Error))
    consoleError.mockRestore()
  })

  it('returns Unknown error when the MCP transport throws a non-Error value', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.parseBearerToken.mockReturnValueOnce('valid-token')
    mocks.verifyOAuthAccessToken.mockResolvedValueOnce({
      token: 'valid-token',
      clientId: 'test-client',
      scopes: ['mcp:tools'],
      extra: { userId: 'user-1' },
    })
    mocks.handleRequest.mockRejectedValueOnce('transport failed')

    const response = await POST(createPostRequest({ Authorization: 'Bearer valid-token' }))
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body).toEqual({
      error: 'Internal Server Error',
      message: 'Unknown error',
    })
    expect(consoleError).toHaveBeenCalledWith('SATHI Error:', 'transport failed')
    consoleError.mockRestore()
  })
})
