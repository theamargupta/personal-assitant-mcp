import { vi } from 'vitest'

// Mock environment variables
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
process.env.OPENAI_API_KEY = 'test-openai-key'

// Mock server-only (it throws when imported outside Next.js server context)
vi.mock('server-only', () => ({}))

vi.mock('@modelcontextprotocol/ext-apps/server', () => {
  const RESOURCE_MIME_TYPE = 'text/html;profile=mcp-app'

  return {
    RESOURCE_MIME_TYPE,
    registerAppTool: (
      server: {
        registerTool?: (name: string, config: unknown, handler: unknown) => unknown
        tool?: (name: string, description: string, schema: unknown, handler: unknown) => unknown
      },
      name: string,
      config: {
        description?: string
        inputSchema?: unknown
        _meta: Record<string, unknown> & { ui?: { resourceUri?: string } }
      },
      handler: unknown,
    ) => {
      const normalizedMeta = config._meta.ui?.resourceUri
        ? { ...config._meta, 'ui/resourceUri': config._meta.ui.resourceUri }
        : config._meta
      const normalizedConfig = { ...config, _meta: normalizedMeta }

      if (server.registerTool) return server.registerTool(name, normalizedConfig, handler)
      return server.tool?.(name, config.description || '', config.inputSchema || {}, handler)
    },
    registerAppResource: (
      server: {
        registerResource?: (name: string, uri: string, config: unknown, handler: unknown) => unknown
        resources?: Array<{ name: string; uri: string; config: unknown; handler: unknown }>
      },
      name: string,
      uri: string,
      config: Record<string, unknown>,
      handler: unknown,
    ) => {
      const normalizedConfig = { mimeType: RESOURCE_MIME_TYPE, ...config }
      if (server.registerResource) return server.registerResource(name, uri, normalizedConfig, handler)

      server.resources ||= []
      server.resources.push({ name, uri, config: normalizedConfig, handler })
      return { name, uri }
    },
  }
})

// ── Supabase mock builder ───────────────────────────────
// Builds a chainable query mock that mirrors the Supabase client API.

export type MockReturnValue = {
  data?: unknown
  error?: { message: string; code?: string } | null
  count?: number | null
}

/**
 * Create a mock that returns data matching Supabase FK join shape.
 * FK joins on single foreign keys return OBJECTS, not arrays.
 * Only array if it's a one-to-many relationship.
 */
export function createFKJoinMock(data: unknown[]) {
  return data
}

export function createMockSupabaseClient(returnValue: MockReturnValue = { data: null, error: null }) {
  const chainable: Record<string, unknown> = {}

  const methods = [
    'select', 'insert', 'update', 'delete', 'upsert',
    'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'is', 'ilike', 'contains', 'or', 'in',
    'order', 'limit', 'range', 'single', 'maybeSingle',
    'head',
  ]

  for (const method of methods) {
    chainable[method] = vi.fn().mockReturnValue(chainable)
  }

  // Terminal methods that return the result
  chainable['single'] = vi.fn().mockResolvedValue(returnValue)
  chainable['maybeSingle'] = vi.fn().mockResolvedValue(returnValue)

  // Make range/order/limit resolve with the return value when awaited
  const terminalChainable = { ...chainable }
  for (const method of methods) {
    if (!['single', 'maybeSingle'].includes(method)) {
      terminalChainable[method] = vi.fn().mockReturnValue(terminalChainable)
    }
  }
  // Allow the chainable to resolve as a promise
  ;(terminalChainable as Record<string, unknown>)['then'] = (resolve: (v: unknown) => void) => {
    resolve(returnValue)
  }
  // Re-attach single/maybeSingle
  terminalChainable['single'] = vi.fn().mockResolvedValue(returnValue)
  terminalChainable['maybeSingle'] = vi.fn().mockResolvedValue(returnValue)

  const from = vi.fn().mockReturnValue(terminalChainable)
  const rpc = vi.fn().mockResolvedValue(returnValue)

  const storage = {
    from: vi.fn().mockReturnValue({
      createSignedUploadUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://test.url/upload' }, error: null }),
      createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://test.url/download' }, error: null }),
      download: vi.fn().mockResolvedValue({ data: new Blob(['test']), error: null }),
      remove: vi.fn().mockResolvedValue({ error: null }),
    }),
  }

  const auth = {
    getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user-id' } }, error: null }),
  }

  return { from, rpc, storage, auth, _chainable: terminalChainable }
}

// Default mock for createServiceRoleClient
const defaultClient = createMockSupabaseClient()

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => defaultClient),
}))
