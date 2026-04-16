/**
 * TDD: get_document should return document details + download URL,
 * structured for inline preview rendering.
 *
 * Expected: text content with all metadata, download_url for preview iframe,
 * has_extracted_text flag for search capability indicator.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const methods = ['select', 'insert', 'update', 'delete', 'eq', 'neq', 'gte', 'lte', 'order', 'limit', 'range', 'single', 'maybeSingle', 'head', 'is', 'contains']

function createChain(val: unknown = { data: null, error: null }) {
  const c: Record<string, unknown> = {}
  for (const m of methods) c[m] = vi.fn().mockReturnValue(c)
  c.single = vi.fn().mockResolvedValue(val)
  c.maybeSingle = vi.fn().mockResolvedValue(val)
  c.then = (resolve: (v: unknown) => void) => { resolve(val) }
  return c
}

const mockClient = {
  from: vi.fn().mockReturnValue(createChain()),
  rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
}

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => mockClient),
}))

vi.mock('@/lib/documents/storage', () => ({
  buildStoragePath: vi.fn().mockReturnValue('user-1/test-doc.pdf'),
  createSignedUploadUrl: vi.fn().mockResolvedValue('https://storage.test/upload'),
  getSignedUrl: vi.fn().mockResolvedValue('https://storage.test/download?token=abc123'),
  deleteFile: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/documents/chunk', () => ({
  chunkText: vi.fn().mockReturnValue([]),
}))

vi.mock('@/lib/documents/embed', () => ({
  generateEmbeddings: vi.fn().mockResolvedValue([]),
  generateEmbedding: vi.fn().mockResolvedValue([0.1]),
}))

const registeredTools: Record<string, { handler: Function }> = {}

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: class {
    tool(name: string, _desc: string, _schema: unknown, handler: Function) {
      registeredTools[name] = { handler }
    }
  },
}))

import { registerDocumentTools } from '@/lib/mcp/tools/documents'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

const server = new McpServer({ name: 'test', version: '0.0.0' })
registerDocumentTools(server)

const authInfo = { extra: { userId: 'user-1' } }

describe('get_document — viewer widget data', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('should return document metadata with download URL for preview', async () => {
    mockClient.from.mockReturnValue(createChain({
      data: {
        id: 'doc-1',
        name: 'PAN Card.pdf',
        description: 'My PAN card scan',
        doc_type: 'pdf',
        mime_type: 'application/pdf',
        file_size: 420000,
        storage_path: 'user-1/pan-card.pdf',
        tags: ['id', 'tax'],
        extracted_text: 'ABCDE1234F Amar Gupta',
        created_at: '2026-03-15T10:00:00Z',
      },
      error: null,
    }))

    const result = await registeredTools['get_document'].handler(
      { document_id: 'doc-1' },
      { authInfo }
    )

    const parsed = JSON.parse(result.content[0].text)

    // Preview needs: URL, mime type, name
    expect(parsed.download_url).toBeDefined()
    expect(parsed.download_url).toContain('https://')
    expect(parsed.download_url_expires_in).toBe('1 hour')
    expect(parsed.mime_type).toBe('application/pdf')
    expect(parsed.name).toBe('PAN Card.pdf')

    // Metadata for display
    expect(parsed.doc_type).toBe('pdf')
    expect(parsed.file_size_bytes).toBe(420000)
    expect(parsed.tags).toEqual(['id', 'tax'])

    // Search capability indicator
    expect(parsed.has_extracted_text).toBe(true)
  })

  it('should indicate when document has no extracted text', async () => {
    mockClient.from.mockReturnValue(createChain({
      data: {
        id: 'doc-2',
        name: 'Photo.jpg',
        description: null,
        doc_type: 'image',
        mime_type: 'image/jpeg',
        file_size: 1200000,
        storage_path: 'user-1/photo.jpg',
        tags: [],
        extracted_text: null,
        created_at: '2026-04-10T14:00:00Z',
      },
      error: null,
    }))

    const result = await registeredTools['get_document'].handler(
      { document_id: 'doc-2' },
      { authInfo }
    )

    const parsed = JSON.parse(result.content[0].text)
    expect(parsed.has_extracted_text).toBe(false)
    expect(parsed.mime_type).toBe('image/jpeg')
  })

  it('should return error for non-existent document', async () => {
    mockClient.from.mockReturnValue(createChain({ data: null, error: { message: 'not found' } }))

    const result = await registeredTools['get_document'].handler(
      { document_id: 'doc-nonexistent' },
      { authInfo }
    )

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('not found')
  })
})
