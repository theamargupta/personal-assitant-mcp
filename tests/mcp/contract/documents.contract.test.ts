import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { connectClient, createSupabaseMock, createQuery, type SupabaseMock } from './_helpers'

const mocks = vi.hoisted(() => ({ client: null as any }))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => mocks.client),
}))

vi.mock('@/lib/mcp/images', () => ({
  createHabitHeatmapImage: vi.fn().mockResolvedValue({ type: 'image', data: 'ZmFrZQ==', mimeType: 'image/png' }),
  createSpendingChartImage: vi.fn().mockResolvedValue({ type: 'image', data: 'ZmFrZQ==', mimeType: 'image/png' }),
}))

describe('MCP contract — document tools', () => {
  let supa: SupabaseMock
  let close: () => Promise<void>
  let client: Awaited<ReturnType<typeof connectClient>>['client']

  beforeEach(async () => {
    supa = createSupabaseMock()
    mocks.client = supa
    const connection = await connectClient({ userId: 'user-1' })
    client = connection.client
    close = connection.close
  })

  afterEach(async () => {
    await close()
    vi.clearAllMocks()
  })

  it('listTools reports all document tools with inputSchema & descriptions', async () => {
    const { tools } = await client.listTools()
    const names = tools.map((t) => t.name)

    for (const expected of [
      'upload_document',
      'confirm_upload',
      'list_documents',
      'search_documents',
      'update_document',
      'delete_document',
      'get_document',
    ]) {
      expect(names).toContain(expected)
      const tool = tools.find((t) => t.name === expected)!
      expect(tool.description).toBeTruthy()
      expect(tool.inputSchema).toBeDefined()
    }
  })

  it('get_document advertises the document-viewer widget via _meta', async () => {
    const { tools } = await client.listTools()
    const getDoc = tools.find((t) => t.name === 'get_document')!
    const meta = getDoc._meta as Record<string, unknown> | undefined
    const nested = (meta?.ui as { resourceUri?: string } | undefined)?.resourceUri
    const flat = meta?.['ui/resourceUri'] as string | undefined
    expect(nested || flat).toBe('ui://widgets/document-viewer.html')
  })

  it('list_documents happy path surfaces a content array with no isError', async () => {
    supa.queue(
      'wallet_documents',
      createQuery({
        data: [{
          id: 'd-1',
          name: 'Bill March',
          description: null,
          doc_type: 'pdf',
          mime_type: 'application/pdf',
          file_size: 1024,
          tags: ['bill'],
          created_at: '2026-04-01T00:00:00.000Z',
        }],
        count: 1,
        error: null,
      }),
    )

    const result: any = await client.callTool({ name: 'list_documents', arguments: {} })
    expect(result.isError).toBeFalsy()
    const parsed = JSON.parse(result.content[0].text)
    expect(parsed.documents[0].name).toBe('Bill March')
  })

  it('get_document with missing row returns isError=true', async () => {
    supa.queue('wallet_documents', createQuery({ data: null, error: { message: 'not found' } }))

    const result: any = await client.callTool({
      name: 'get_document',
      arguments: { document_id: '00000000-0000-0000-0000-000000000000' },
    })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toMatch(/Document not found/i)
  })

  it('upload_document with invalid mime_type fails validation', async () => {
    const result: any = await client.callTool({
      name: 'upload_document',
      arguments: { name: 'X', mime_type: 'text/plain' } as any,
    })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toMatch(/validation|mime/i)
  })
})
