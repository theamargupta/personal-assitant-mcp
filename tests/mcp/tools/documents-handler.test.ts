import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockChain: Record<string, ReturnType<typeof vi.fn>> = {}
const methods = ['select', 'insert', 'update', 'delete', 'eq', 'neq', 'gte', 'lte', 'order', 'limit', 'range', 'single', 'maybeSingle', 'contains']
for (const m of methods) {
  mockChain[m] = vi.fn().mockReturnValue(mockChain)
}
mockChain.single = vi.fn().mockResolvedValue({ data: null, error: null })
mockChain.range = vi.fn().mockResolvedValue({ data: [], count: 0, error: null })

const mockClient = {
  from: vi.fn().mockReturnValue(mockChain),
  rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
}

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => mockClient),
}))

vi.mock('@/lib/documents/storage', () => ({
  buildStoragePath: vi.fn().mockReturnValue('user-1/12345-doc.pdf'),
  createSignedUploadUrl: vi.fn().mockResolvedValue('https://test.url/upload'),
  getSignedUrl: vi.fn().mockResolvedValue('https://test.url/download'),
  deleteFile: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/documents/chunk', () => ({
  chunkText: vi.fn().mockReturnValue([
    { content: 'chunk 1', index: 0, tokenCount: 10 },
    { content: 'chunk 2', index: 1, tokenCount: 10 },
  ]),
}))

vi.mock('@/lib/documents/embed', () => ({
  generateEmbeddings: vi.fn().mockResolvedValue([[0.1, 0.2], [0.3, 0.4]]),
  generateEmbedding: vi.fn().mockResolvedValue([0.1, 0.2]),
}))

const registeredTools: Record<string, { handler: (...args: unknown[]) => unknown }> = {}

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: class {
    tool(name: string, _desc: string, _schema: unknown, handler: (...args: unknown[]) => unknown) {
      registeredTools[name] = { handler }
    }
  },
}))

import { registerDocumentTools } from '@/lib/mcp/tools/documents'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

const server = new McpServer({ name: 'test', version: '0.0.0' })
registerDocumentTools(server)

const authInfo = { extra: { userId: 'user-1' } }
const noAuth = { extra: {} }

describe('upload_document', () => {
  beforeEach(() => { vi.clearAllMocks(); mockClient.from.mockReturnValue(mockChain) })

  it('throws when unauthorized', async () => {
    await expect(registeredTools['upload_document'].handler(
      { name: 'Test', mime_type: 'application/pdf', tags: [] },
      { authInfo: noAuth }
    )).rejects.toThrow('Unauthorized')
  })

  it('creates pending document and returns upload URL', async () => {
    mockChain.single.mockResolvedValueOnce({
      data: { id: 'd-1', name: 'Test Doc', created_at: '2025-01-01T00:00:00Z' },
      error: null,
    })

    const result = await registeredTools['upload_document'].handler(
      { name: 'Test Doc', mime_type: 'application/pdf', tags: ['bill'] },
      { authInfo }
    )

    const parsed = JSON.parse(result.content[0].text)
    expect(parsed.document_id).toBe('d-1')
    expect(parsed.upload_url).toBe('https://test.url/upload')
    expect(parsed.storage_path).toBe('user-1/12345-doc.pdf')
    expect(mockChain.insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      name: 'Test Doc',
      description: null,
      doc_type: 'pdf',
      mime_type: 'application/pdf',
      file_size: 0,
      storage_path: 'user-1/12345-doc.pdf',
      tags: ['bill'],
      extracted_text: null,
      status: 'pending',
    })
  })

  it('returns error on DB failure', async () => {
    mockChain.single.mockResolvedValueOnce({ data: null, error: { message: 'Insert failed' } })

    const result = await registeredTools['upload_document'].handler(
      { name: 'Test', mime_type: 'application/pdf', tags: [] },
      { authInfo }
    )
    expect(result.isError).toBe(true)
  })
})

describe('confirm_upload', () => {
  beforeEach(() => { vi.clearAllMocks(); mockClient.from.mockReturnValue(mockChain) })

  it('throws when unauthorized', async () => {
    await expect(registeredTools['confirm_upload'].handler(
      { document_id: 'd-1', extracted_text: 'text' },
      { authInfo: noAuth }
    )).rejects.toThrow('Unauthorized')
  })

  it('returns error when document not found', async () => {
    mockChain.single.mockResolvedValueOnce({ data: null, error: { message: 'not found' } })

    const result = await registeredTools['confirm_upload'].handler(
      { document_id: 'd-bad', extracted_text: 'text' },
      { authInfo }
    )
    expect(result.isError).toBe(true)
  })

  it('processes document with chunking and embedding', async () => {
    // Fetch document
    mockChain.single.mockResolvedValueOnce({
      data: { id: 'd-1', name: 'Doc', doc_type: 'pdf', created_at: '2025-01-01T00:00:00Z' },
      error: null,
    })

    // Update document status
    let fromCallCount = 0
    const updateChain: Record<string, ReturnType<typeof vi.fn>> = {}
    for (const m of methods) updateChain[m] = vi.fn().mockReturnValue(updateChain)
    ;(updateChain as Record<string, unknown>)['then'] = (r: (v: unknown) => void) => r({ error: null })

    const insertChain: Record<string, ReturnType<typeof vi.fn>> = {}
    for (const m of methods) insertChain[m] = vi.fn().mockReturnValue(insertChain)
    ;(insertChain as Record<string, unknown>)['then'] = (r: (v: unknown) => void) => r({ error: null })

    mockClient.from.mockImplementation(() => {
      fromCallCount++
      if (fromCallCount === 1) return mockChain // fetch
      if (fromCallCount === 2) return updateChain // update
      return insertChain // chunk insert
    })

    const result = await registeredTools['confirm_upload'].handler(
      { document_id: 'd-1', extracted_text: 'Hello world' },
      { authInfo }
    )

    const parsed = JSON.parse(result.content[0].text)
    expect(parsed.document_id).toBe('d-1')
    expect(parsed.status).toBe('ready')
    expect(parsed.chunks_created).toBe(2)
    expect(updateChain.update).toHaveBeenCalledWith({
      extracted_text: 'Hello world',
      file_size: 0,
      status: 'ready',
    })
    expect(insertChain.insert).toHaveBeenCalledWith([
      {
        document_id: 'd-1',
        user_id: 'user-1',
        chunk_index: 0,
        content: 'chunk 1',
        token_count: 10,
        embedding: JSON.stringify([0.1, 0.2]),
      },
      {
        document_id: 'd-1',
        user_id: 'user-1',
        chunk_index: 1,
        content: 'chunk 2',
        token_count: 10,
        embedding: JSON.stringify([0.3, 0.4]),
      },
    ])
  })
})

describe('list_documents', () => {
  beforeEach(() => { vi.clearAllMocks(); mockClient.from.mockReturnValue(mockChain) })

  it('throws when unauthorized', async () => {
    await expect(registeredTools['list_documents'].handler(
      { limit: 50, offset: 0 },
      { authInfo: noAuth }
    )).rejects.toThrow('Unauthorized')
  })

  it('returns documents', async () => {
    mockChain.range.mockResolvedValueOnce({
      data: [
        { id: 'd-1', name: 'Doc 1', description: null, doc_type: 'pdf', mime_type: 'application/pdf', file_size: 1024, tags: ['bill'], created_at: '2025-01-01T00:00:00Z' },
      ],
      count: 1,
      error: null,
    })

    const result = await registeredTools['list_documents'].handler(
      { limit: 50, offset: 0 },
      { authInfo }
    )

    const parsed = JSON.parse(result.content[0].text)
    expect(parsed.documents).toHaveLength(1)
    expect(parsed.total).toBe(1)
  })
})

describe('get_document', () => {
  beforeEach(() => { vi.clearAllMocks(); mockClient.from.mockReturnValue(mockChain) })

  it('throws when unauthorized', async () => {
    await expect(registeredTools['get_document'].handler(
      { document_id: 'd-1' },
      { authInfo: noAuth }
    )).rejects.toThrow('Unauthorized')
  })

  it('returns error when not found', async () => {
    mockChain.single.mockResolvedValueOnce({ data: null, error: { message: 'not found' } })

    const result = await registeredTools['get_document'].handler(
      { document_id: 'd-bad' },
      { authInfo }
    )
    expect(result.isError).toBe(true)
  })

  it('returns document with download URL', async () => {
    mockChain.single.mockResolvedValueOnce({
      data: {
        id: 'd-1', name: 'Doc', description: null, doc_type: 'pdf',
        mime_type: 'application/pdf', file_size: 1024, tags: [],
        storage_path: 'user-1/doc.pdf', extracted_text: 'Hello',
        created_at: '2025-01-01T00:00:00Z',
      },
      error: null,
    })

    const result = await registeredTools['get_document'].handler(
      { document_id: 'd-1' },
      { authInfo }
    )

    const parsed = JSON.parse(result.content[0].text)
    expect(parsed.download_url).toBe('https://test.url/download')
    expect(parsed.has_extracted_text).toBe(true)
  })
})

describe('search_documents', () => {
  beforeEach(() => { vi.clearAllMocks(); mockClient.from.mockReturnValue(mockChain) })

  it('throws when unauthorized', async () => {
    await expect(registeredTools['search_documents'].handler(
      { query: 'test', limit: 5 },
      { authInfo: noAuth }
    )).rejects.toThrow('Unauthorized')
  })

  it('returns search results', async () => {
    mockClient.rpc.mockResolvedValueOnce({
      data: [
        { document_id: 'd-1', document_name: 'Doc', content: 'match', similarity: 0.95, chunk_index: 0 },
      ],
      error: null,
    })

    const result = await registeredTools['search_documents'].handler(
      { query: 'test query', limit: 5 },
      { authInfo }
    )

    const parsed = JSON.parse(result.content[0].text)
    expect(parsed.results).toHaveLength(1)
    expect(parsed.results[0].similarity).toBe(0.95)
  })
})

describe('delete_document', () => {
  beforeEach(() => { vi.clearAllMocks(); mockClient.from.mockReturnValue(mockChain) })

  it('throws when unauthorized', async () => {
    await expect(registeredTools['delete_document'].handler(
      { document_id: 'd-1' },
      { authInfo: noAuth }
    )).rejects.toThrow('Unauthorized')
  })

  it('returns error when not found', async () => {
    mockChain.single.mockResolvedValueOnce({ data: null, error: { message: 'not found' } })

    const result = await registeredTools['delete_document'].handler(
      { document_id: 'd-bad' },
      { authInfo }
    )
    expect(result.isError).toBe(true)
  })

  it('deletes document successfully', async () => {
    // Fetch doc
    mockChain.single.mockResolvedValueOnce({
      data: { id: 'd-1', name: 'Doc', storage_path: 'user-1/doc.pdf' },
      error: null,
    })

    // Delete chain
    let callNum = 0
    mockClient.from.mockImplementation(() => {
      callNum++
      if (callNum === 1) return mockChain
      const deleteChain: Record<string, ReturnType<typeof vi.fn>> = {}
      for (const m of methods) deleteChain[m] = vi.fn().mockReturnValue(deleteChain)
      ;(deleteChain as Record<string, unknown>)['then'] = (r: (v: unknown) => void) => r({ error: null })
      return deleteChain
    })

    const result = await registeredTools['delete_document'].handler(
      { document_id: 'd-1' },
      { authInfo }
    )

    const parsed = JSON.parse(result.content[0].text)
    expect(parsed.deleted).toBe(true)
    expect(parsed.name).toBe('Doc')
  })
})
