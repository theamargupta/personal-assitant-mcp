import { beforeEach, describe, expect, it, vi } from 'vitest'

type QueryResult = {
  data?: any
  error?: { message: string } | null
  count?: number | null
}

type QueryChain = Record<string, ReturnType<typeof vi.fn>> & {
  then: (resolve: (value: QueryResult) => unknown, reject?: (reason: unknown) => unknown) => Promise<unknown>
}

const mocks = vi.hoisted(() => ({
  queue: [] as QueryChain[],
  mockClient: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
  buildStoragePath: vi.fn(),
  createSignedUploadUrl: vi.fn(),
  getSignedUrl: vi.fn(),
  deleteFile: vi.fn(),
  chunkText: vi.fn(),
  generateEmbeddings: vi.fn(),
  generateEmbedding: vi.fn(),
  registeredTools: {} as Record<string, { handler: Function }>,
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => mocks.mockClient),
}))

vi.mock('@/lib/documents/storage', () => ({
  buildStoragePath: mocks.buildStoragePath,
  createSignedUploadUrl: mocks.createSignedUploadUrl,
  getSignedUrl: mocks.getSignedUrl,
  deleteFile: mocks.deleteFile,
}))

vi.mock('@/lib/documents/chunk', () => ({
  chunkText: mocks.chunkText,
}))

vi.mock('@/lib/documents/embed', () => ({
  generateEmbeddings: mocks.generateEmbeddings,
  generateEmbedding: mocks.generateEmbedding,
}))

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: class {
    tool(name: string, _description: string, _schema: unknown, handler: Function) {
      mocks.registeredTools[name] = { handler }
    }
  },
}))

import { registerDocumentTools } from '@/lib/mcp/tools/documents'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

const methods = [
  'select',
  'insert',
  'update',
  'delete',
  'eq',
  'contains',
  'order',
  'range',
  'single',
  'maybeSingle',
]

const server = new McpServer({ name: 'test', version: '0.0.0' })
registerDocumentTools(server)

const authInfo = { extra: { userId: 'user-1' } }
const noAuth = { extra: {} }

function createQuery(result: QueryResult = { data: null, error: null, count: null }): QueryChain {
  const chain = {} as QueryChain
  for (const method of methods) {
    chain[method] = vi.fn().mockReturnValue(chain)
  }
  chain.single = vi.fn().mockResolvedValue(result)
  chain.maybeSingle = vi.fn().mockResolvedValue(result)
  chain.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject)
  return chain
}

function queueFrom(...chains: QueryChain[]) {
  mocks.queue = [...chains]
  mocks.mockClient.from.mockImplementation(() => {
    return mocks.queue.shift() ?? createQuery()
  })
}

function parseResult(result: { content: Array<{ text: string }> }) {
  return JSON.parse(result.content[0].text)
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.queue = []
  mocks.mockClient.from.mockImplementation(() => createQuery())
  mocks.mockClient.rpc.mockResolvedValue({ data: [], error: null })
  mocks.buildStoragePath.mockReturnValue('user-1/test-doc.pdf')
  mocks.createSignedUploadUrl.mockResolvedValue('https://storage.test/upload?token=abc')
  mocks.getSignedUrl.mockResolvedValue('https://storage.test/download?token=xyz')
  mocks.deleteFile.mockResolvedValue(undefined)
  mocks.chunkText.mockReturnValue([
    { index: 0, content: 'chunk one', tokenCount: 10 },
    { index: 1, content: 'chunk two', tokenCount: 12 },
  ])
  mocks.generateEmbeddings.mockResolvedValue([[0.1, 0.2], [0.3, 0.4]])
  mocks.generateEmbedding.mockResolvedValue([0.1, 0.2, 0.3])
})

describe('upload_document', () => {
  it('throws when unauthorized', async () => {
    await expect(mocks.registeredTools['upload_document'].handler(
      { name: 'Test', mime_type: 'application/pdf', tags: [] },
      { authInfo: noAuth }
    )).rejects.toThrow('Unauthorized')
  })

  it.each([
    ['application/pdf', 'pdf'],
    ['image/png', 'image'],
    ['image/jpeg', 'image'],
    ['text/plain', 'other'],
  ] as const)('stores %s as %s document type', async (mimeType, docType) => {
    const insert = createQuery({
      data: { id: `doc-${docType}`, name: 'Test Doc', created_at: '2026-04-01T00:00:00.000Z' },
      error: null,
    })
    queueFrom(insert)

    const result = await mocks.registeredTools['upload_document'].handler(
      { name: ' Test Doc ', description: ' desc ', mime_type: mimeType, tags: ['bill'] },
      { authInfo }
    )

    const parsed = parseResult(result)
    expect(parsed.document_id).toBe(`doc-${docType}`)
    expect(parsed.upload_url).toBe('https://storage.test/upload?token=abc')
    expect(parsed.storage_path).toBe('user-1/test-doc.pdf')
    expect(insert.insert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'user-1',
      name: 'Test Doc',
      description: 'desc',
      doc_type: docType,
      mime_type: mimeType,
      tags: ['bill'],
      status: 'pending',
    }))
  })

  it('returns an error response when pending document insert fails', async () => {
    queueFrom(createQuery({ data: null, error: { message: 'Insert failed' } }))

    const result = await mocks.registeredTools['upload_document'].handler(
      { name: 'Test', mime_type: 'application/pdf', tags: [] },
      { authInfo }
    )

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: Insert failed')
  })
})

describe('confirm_upload', () => {
  it('throws when unauthorized', async () => {
    await expect(mocks.registeredTools['confirm_upload'].handler(
      { document_id: 'doc-1', extracted_text: 'text' },
      { authInfo: noAuth }
    )).rejects.toThrow('Unauthorized')
  })

  it('updates the document, embeds chunks, and reports chunks created', async () => {
    const fetchDoc = createQuery({
      data: { id: 'doc-1', name: 'Doc', doc_type: 'pdf', created_at: '2026-04-01T00:00:00.000Z' },
      error: null,
    })
    const updateDoc = createQuery({ error: null })
    const insertChunks = createQuery({ error: null })
    queueFrom(fetchDoc, updateDoc, insertChunks)

    const result = await mocks.registeredTools['confirm_upload'].handler(
      { document_id: 'doc-1', extracted_text: '  extracted text  ' },
      { authInfo }
    )

    const parsed = parseResult(result)
    expect(parsed.document_id).toBe('doc-1')
    expect(parsed.status).toBe('ready')
    expect(parsed.chunks_created).toBe(2)
    expect(updateDoc.update).toHaveBeenCalledWith({
      extracted_text: 'extracted text',
      file_size: 0,
      status: 'ready',
    })
    expect(insertChunks.insert).toHaveBeenCalledWith([
      {
        document_id: 'doc-1',
        user_id: 'user-1',
        chunk_index: 0,
        content: 'chunk one',
        token_count: 10,
        embedding: JSON.stringify([0.1, 0.2]),
      },
      {
        document_id: 'doc-1',
        user_id: 'user-1',
        chunk_index: 1,
        content: 'chunk two',
        token_count: 12,
        embedding: JSON.stringify([0.3, 0.4]),
      },
    ])
  })

  it('returns an error when pending document is not found', async () => {
    queueFrom(createQuery({ data: null, error: { message: 'not found' } }))

    const result = await mocks.registeredTools['confirm_upload'].handler(
      { document_id: 'missing-doc', extracted_text: 'text' },
      { authInfo }
    )

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('Pending document not found')
  })

  it('returns an error when ready status update fails', async () => {
    queueFrom(
      createQuery({
        data: { id: 'doc-1', name: 'Doc', doc_type: 'pdf', created_at: '2026-04-01T00:00:00.000Z' },
        error: null,
      }),
      createQuery({ error: { message: 'Update failed' } })
    )

    const result = await mocks.registeredTools['confirm_upload'].handler(
      { document_id: 'doc-1', extracted_text: 'text' },
      { authInfo }
    )

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: Update failed')
  })

  it('logs chunk insert errors as non-fatal and returns zero chunks created', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const insertChunks = createQuery({ error: { message: 'Chunk insert failed' } })
    queueFrom(
      createQuery({
        data: { id: 'doc-1', name: 'Doc', doc_type: 'pdf', created_at: '2026-04-01T00:00:00.000Z' },
        error: null,
      }),
      createQuery({ error: null }),
      insertChunks
    )

    const result = await mocks.registeredTools['confirm_upload'].handler(
      { document_id: 'doc-1', extracted_text: 'text' },
      { authInfo }
    )

    expect(result.isError).toBeUndefined()
    expect(parseResult(result).chunks_created).toBe(0)
    expect(insertChunks.insert).toHaveBeenCalled()
    expect(consoleError).toHaveBeenCalledWith('Chunk insert error:', { message: 'Chunk insert failed' })
    consoleError.mockRestore()
  })

  it('skips embeddings when chunking returns no chunks', async () => {
    mocks.chunkText.mockReturnValueOnce([])
    queueFrom(
      createQuery({
        data: { id: 'doc-1', name: 'Doc', doc_type: 'pdf', created_at: '2026-04-01T00:00:00.000Z' },
        error: null,
      }),
      createQuery({ error: null })
    )

    const result = await mocks.registeredTools['confirm_upload'].handler(
      { document_id: 'doc-1', extracted_text: 'text' },
      { authInfo }
    )

    expect(parseResult(result).chunks_created).toBe(0)
    expect(mocks.generateEmbeddings).not.toHaveBeenCalled()
    expect(mocks.mockClient.from).toHaveBeenCalledTimes(2)
  })
})

describe('list_documents', () => {
  it('throws when unauthorized', async () => {
    await expect(mocks.registeredTools['list_documents'].handler(
      { limit: 50, offset: 0 },
      { authInfo: noAuth }
    )).rejects.toThrow('Unauthorized')
  })

  it('lists ready documents with a document type filter', async () => {
    const list = createQuery({
      data: [
        {
          id: 'doc-1',
          name: 'Doc',
          description: 'A document',
          doc_type: 'pdf',
          mime_type: 'application/pdf',
          file_size: 1234,
          tags: ['bill'],
          created_at: '2026-04-01T00:00:00.000Z',
        },
      ],
      count: 1,
      error: null,
    })
    queueFrom(list)

    const result = await mocks.registeredTools['list_documents'].handler(
      { doc_type: 'pdf', limit: 10, offset: 0 },
      { authInfo }
    )

    const parsed = parseResult(result)
    expect(parsed.total).toBe(1)
    expect(parsed.returned).toBe(1)
    expect(parsed.documents[0]).toEqual(expect.objectContaining({
      document_id: 'doc-1',
      doc_type: 'pdf',
      file_size_bytes: 1234,
    }))
    expect(list.eq).toHaveBeenCalledWith('doc_type', 'pdf')
    expect(list.range).toHaveBeenCalledWith(0, 9)
  })

  it('lists ready documents with a tag filter', async () => {
    const list = createQuery({ data: [], count: 0, error: null })
    queueFrom(list)

    const result = await mocks.registeredTools['list_documents'].handler(
      { tag: 'tax', limit: 25, offset: 5 },
      { authInfo }
    )

    expect(parseResult(result)).toEqual({ documents: [], total: 0, returned: 0 })
    expect(list.contains).toHaveBeenCalledWith('tags', ['tax'])
    expect(list.range).toHaveBeenCalledWith(5, 29)
  })

  it('returns an error when document list query fails', async () => {
    queueFrom(createQuery({ data: null, count: null, error: { message: 'List failed' } }))

    const result = await mocks.registeredTools['list_documents'].handler(
      { limit: 50, offset: 0 },
      { authInfo }
    )

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: List failed')
  })

  it('returns an empty list when no documents match', async () => {
    queueFrom(createQuery({ data: [], count: 0, error: null }))

    const result = await mocks.registeredTools['list_documents'].handler(
      { limit: 50, offset: 0 },
      { authInfo }
    )

    expect(parseResult(result)).toEqual({ documents: [], total: 0, returned: 0 })
  })
})

describe('get_document', () => {
  it('throws when unauthorized', async () => {
    await expect(mocks.registeredTools['get_document'].handler(
      { document_id: 'doc-1' },
      { authInfo: noAuth }
    )).rejects.toThrow('Unauthorized')
  })

  it('returns document details with a signed download URL', async () => {
    queueFrom(createQuery({
      data: {
        id: 'doc-1',
        name: 'Doc',
        description: null,
        doc_type: 'pdf',
        mime_type: 'application/pdf',
        file_size: 2048,
        tags: ['bill'],
        storage_path: 'user-1/doc.pdf',
        extracted_text: 'text',
        created_at: '2026-04-01T00:00:00.000Z',
      },
      error: null,
    }))

    const result = await mocks.registeredTools['get_document'].handler(
      { document_id: 'doc-1' },
      { authInfo }
    )

    const parsed = parseResult(result)
    expect(parsed.document_id).toBe('doc-1')
    expect(parsed.download_url).toBe('https://storage.test/download?token=xyz')
    expect(parsed.has_extracted_text).toBe(true)
    expect(mocks.getSignedUrl).toHaveBeenCalledWith('user-1/doc.pdf', 3600)
  })

  it('returns an error when the document does not exist', async () => {
    queueFrom(createQuery({ data: null, error: { message: 'not found' } }))

    const result = await mocks.registeredTools['get_document'].handler(
      { document_id: 'missing-doc' },
      { authInfo }
    )

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: Document not found')
  })
})

describe('search_documents', () => {
  it('throws when unauthorized', async () => {
    await expect(mocks.registeredTools['search_documents'].handler(
      { query: 'bill', limit: 5 },
      { authInfo: noAuth }
    )).rejects.toThrow('Unauthorized')
  })

  it('returns rounded semantic search results', async () => {
    mocks.mockClient.rpc.mockResolvedValueOnce({
      data: [
        {
          document_id: 'doc-1',
          document_name: 'Electricity Bill',
          content: 'Total amount due',
          similarity: 0.95678,
          chunk_index: 0,
        },
      ],
      error: null,
    })

    const result = await mocks.registeredTools['search_documents'].handler(
      { query: 'amount due', limit: 5 },
      { authInfo }
    )

    const parsed = parseResult(result)
    expect(parsed.query).toBe('amount due')
    expect(parsed.returned).toBe(1)
    expect(parsed.results[0].similarity).toBe(0.957)
    expect(mocks.generateEmbedding).toHaveBeenCalledWith('amount due')
    expect(mocks.mockClient.rpc).toHaveBeenCalledWith('match_wallet_document_chunks', {
      query_embedding: JSON.stringify([0.1, 0.2, 0.3]),
      match_user_id: 'user-1',
      match_count: 5,
    })
  })

  it('returns an error when semantic search rpc fails', async () => {
    mocks.mockClient.rpc.mockResolvedValueOnce({ data: null, error: { message: 'RPC failed' } })

    const result = await mocks.registeredTools['search_documents'].handler(
      { query: 'amount due', limit: 5 },
      { authInfo }
    )

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: RPC failed')
  })

  it('returns an empty result set when rpc returns no matches', async () => {
    mocks.mockClient.rpc.mockResolvedValueOnce({ data: [], error: null })

    const result = await mocks.registeredTools['search_documents'].handler(
      { query: 'nothing', limit: 5 },
      { authInfo }
    )

    expect(parseResult(result)).toEqual({ query: 'nothing', results: [], returned: 0 })
  })
})

describe('delete_document', () => {
  it('throws when unauthorized', async () => {
    await expect(mocks.registeredTools['delete_document'].handler(
      { document_id: 'doc-1' },
      { authInfo: noAuth }
    )).rejects.toThrow('Unauthorized')
  })

  it('deletes the stored file and database record', async () => {
    const deleteDoc = createQuery({ error: null })
    queueFrom(
      createQuery({
        data: { id: 'doc-1', name: 'Doc', storage_path: 'user-1/doc.pdf' },
        error: null,
      }),
      deleteDoc
    )

    const result = await mocks.registeredTools['delete_document'].handler(
      { document_id: 'doc-1' },
      { authInfo }
    )

    expect(parseResult(result)).toEqual({ deleted: true, document_id: 'doc-1', name: 'Doc' })
    expect(mocks.deleteFile).toHaveBeenCalledWith('user-1/doc.pdf')
    expect(deleteDoc.delete).toHaveBeenCalled()
    expect(deleteDoc.eq).toHaveBeenCalledWith('id', 'doc-1')
    expect(deleteDoc.eq).toHaveBeenCalledWith('user_id', 'user-1')
  })

  it('returns an error when the document to delete does not exist', async () => {
    queueFrom(createQuery({ data: null, error: { message: 'not found' } }))

    const result = await mocks.registeredTools['delete_document'].handler(
      { document_id: 'missing-doc' },
      { authInfo }
    )

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: Document not found')
  })

  it('continues deleting the database record when storage deletion fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.deleteFile.mockRejectedValueOnce(new Error('storage unavailable'))
    const deleteDoc = createQuery({ error: null })
    queueFrom(
      createQuery({
        data: { id: 'doc-1', name: 'Doc', storage_path: 'user-1/doc.pdf' },
        error: null,
      }),
      deleteDoc
    )

    const result = await mocks.registeredTools['delete_document'].handler(
      { document_id: 'doc-1' },
      { authInfo }
    )

    expect(parseResult(result).deleted).toBe(true)
    expect(deleteDoc.delete).toHaveBeenCalled()
    expect(consoleError).toHaveBeenCalledWith('Storage delete error (non-fatal):', expect.any(Error))
    consoleError.mockRestore()
  })

  it('returns an error when database delete fails', async () => {
    queueFrom(
      createQuery({
        data: { id: 'doc-1', name: 'Doc', storage_path: 'user-1/doc.pdf' },
        error: null,
      }),
      createQuery({ error: { message: 'Delete failed' } })
    )

    const result = await mocks.registeredTools['delete_document'].handler(
      { document_id: 'doc-1' },
      { authInfo }
    )

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: Delete failed')
  })
})

describe('update_document', () => {
  it('returns error when no fields provided', async () => {
    const result = await mocks.registeredTools['update_document'].handler(
      { document_id: 'doc-1' },
      { authInfo }
    )

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: No fields to update')
  })

  it('returns error when document not found', async () => {
    queueFrom(createQuery({ data: null, error: { message: 'not found' } }))

    const result = await mocks.registeredTools['update_document'].handler(
      { document_id: 'doc-bad', name: 'New' },
      { authInfo }
    )

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: Document not found')
  })

  it('updates name, description, and tags', async () => {
    const updChain = createQuery({
      data: {
        id: 'doc-1',
        name: 'New name',
        description: 'Updated',
        doc_type: 'pdf',
        mime_type: 'application/pdf',
        tags: ['bill', 'urgent'],
        file_size: 1024,
        created_at: '2026-04-10T06:30:00.000Z',
      },
      error: null,
    })
    queueFrom(updChain)

    const result = await mocks.registeredTools['update_document'].handler(
      { document_id: 'doc-1', name: ' New name ', description: ' Updated ', tags: ['bill', 'urgent'] },
      { authInfo }
    )

    const parsed = parseResult(result)
    expect(updChain.update).toHaveBeenCalledWith({
      name: 'New name',
      description: 'Updated',
      tags: ['bill', 'urgent'],
    })
    expect(parsed.name).toBe('New name')
    expect(parsed.tags).toEqual(['bill', 'urgent'])
  })

  it('clears description when null is passed', async () => {
    const updChain = createQuery({
      data: {
        id: 'doc-1',
        name: 'Doc',
        description: null,
        doc_type: 'pdf',
        mime_type: 'application/pdf',
        tags: [],
        file_size: 0,
        created_at: '2026-04-10T06:30:00.000Z',
      },
      error: null,
    })
    queueFrom(updChain)

    await mocks.registeredTools['update_document'].handler(
      { document_id: 'doc-1', description: null },
      { authInfo }
    )

    expect(updChain.update).toHaveBeenCalledWith({ description: null })
  })
})
