import { vi } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createMcpServer } from '@/lib/mcp/server'

export type MockResult = {
  data?: unknown
  error?: { message: string; code?: string } | null
  count?: number | null
}

export type QueryChain = Record<string, ReturnType<typeof vi.fn>> & {
  then: (resolve: (v: MockResult) => unknown, reject?: (r: unknown) => unknown) => Promise<unknown>
}

const methods = [
  'select', 'insert', 'update', 'delete', 'upsert',
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'is', 'ilike', 'contains', 'or', 'in',
  'order', 'limit', 'range', 'single', 'maybeSingle', 'head',
]

export function createQuery(result: MockResult = { data: null, error: null }): QueryChain {
  const chain = {} as QueryChain
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain)
  }
  chain.single = vi.fn().mockResolvedValue(result)
  chain.maybeSingle = vi.fn().mockResolvedValue(result)
  chain.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject)
  return chain
}

export type SupabaseMock = {
  from: ReturnType<typeof vi.fn>
  rpc: ReturnType<typeof vi.fn>
  storage: { from: ReturnType<typeof vi.fn> }
  auth: { getUser: ReturnType<typeof vi.fn> }
  _queues: Map<string, QueryChain[]>
  _defaultResult: MockResult
  queue: (table: string, ...chains: QueryChain[]) => void
  rpcNext: (result: MockResult) => void
  setDefault: (result: MockResult) => void
}

export function createSupabaseMock(): SupabaseMock {
  const queues = new Map<string, QueryChain[]>()
  let defaultResult: MockResult = { data: [], error: null, count: 0 }

  const rpcReturns: MockResult[] = []
  const rpc = vi.fn().mockImplementation(() => {
    if (rpcReturns.length > 0) return Promise.resolve(rpcReturns.shift())
    return Promise.resolve(defaultResult)
  })

  const from = vi.fn().mockImplementation((table: string) => {
    const chains = queues.get(table) ?? []
    if (chains.length > 0) return chains.shift()!
    return createQuery(defaultResult)
  })

  const storage = {
    from: vi.fn().mockReturnValue({
      createSignedUploadUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://test/upload' }, error: null }),
      createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://test/download' }, error: null }),
      download: vi.fn().mockResolvedValue({ data: new Blob(['x']), error: null }),
      remove: vi.fn().mockResolvedValue({ error: null }),
    }),
  }

  const auth = {
    getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
  }

  return {
    from,
    rpc,
    storage,
    auth,
    _queues: queues,
    _defaultResult: defaultResult,
    queue(table, ...chains) {
      queues.set(table, [...(queues.get(table) ?? []), ...chains])
    },
    rpcNext(result) {
      rpcReturns.push(result)
    },
    setDefault(result) {
      defaultResult = result
    },
  }
}

export async function connectClient(authInfo?: { userId?: string }) {
  const server = createMcpServer()
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()

  await server.connect(serverTransport)

  // After the server is connected, Protocol has installed its own onmessage.
  // Wrap it so every inbound message carries authInfo (matching production route.ts).
  const protocolHandler = (serverTransport as { onmessage?: (msg: unknown, extra?: unknown) => void }).onmessage
  ;(serverTransport as { onmessage?: (msg: unknown, extra?: unknown) => void }).onmessage = (msg, extra) => {
    const injectedExtra = {
      ...(extra as object | undefined),
      authInfo: {
        token: 'test-token',
        clientId: 'test-client',
        scopes: ['mcp:tools'],
        extra: { userId: authInfo?.userId ?? 'user-1' },
      },
    }
    protocolHandler?.(msg, injectedExtra)
  }

  const client = new Client({ name: 'contract-test-client', version: '0.0.0' })
  await client.connect(clientTransport)

  return {
    client,
    close: async () => {
      await client.close().catch(() => undefined)
      await server.close().catch(() => undefined)
    },
  }
}
