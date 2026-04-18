import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server'
import { z } from 'zod'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { toIST } from '@/types'
import { buildStoragePath, createSignedUploadUrl, getSignedUrl, deleteFile } from '@/lib/documents/storage'
import { chunkText } from '@/lib/documents/chunk'
import { generateEmbeddings, generateEmbedding } from '@/lib/documents/embed'
import { WIDGET_URIS } from '@/lib/mcp/widgets'

function detectDocType(mimeType: string): 'pdf' | 'image' | 'other' {
  if (mimeType === 'application/pdf') return 'pdf'
  if (mimeType.startsWith('image/')) return 'image'
  return 'other'
}

export function registerDocumentTools(server: McpServer) {

  // ── upload_document ─────────────────────────────────────
  // Step 1: Creates a pending document record and returns a signed upload URL.
  // The client (Claude) uploads the file directly to Supabase Storage using this URL,
  // then calls confirm_upload to trigger text extraction and embedding.
  server.tool(
    'upload_document',
    'Get a signed upload URL for a document. Returns a URL to upload the file directly to storage. After uploading, call confirm_upload to process the document.',
    {
      name: z.string().min(1).max(255).describe('Document name, e.g. "Electricity Bill March 2026"'),
      description: z.string().max(1000).optional().describe('Optional description'),
      mime_type: z.enum([
        'application/pdf',
        'image/png',
        'image/jpeg',
        'image/webp',
      ]).describe('MIME type of the file'),
      tags: z.array(z.string()).default([]).describe('Tags for organizing, e.g. ["bill", "electricity"]'),
    },
    async ({ name, description, mime_type, tags }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      const supabase = createServiceRoleClient()
      const docType = detectDocType(mime_type)
      const storagePath = buildStoragePath(userId, name.replace(/\s+/g, '-'))

      // 1. Create pending document record
      const { data: doc, error: docErr } = await supabase
        .from('wallet_documents')
        .insert({
          user_id: userId,
          name: name.trim(),
          description: description?.trim() || null,
          doc_type: docType,
          mime_type,
          file_size: 0,
          storage_path: storagePath,
          tags,
          extracted_text: null,
          status: 'pending',
        })
        .select('id, name, created_at')
        .single()

      if (docErr) return { content: [{ type: 'text' as const, text: `Error: ${docErr.message}` }], isError: true }

      // 2. Generate signed upload URL (valid for 5 minutes)
      const uploadUrl = await createSignedUploadUrl(storagePath)

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            document_id: doc.id,
            upload_url: uploadUrl,
            upload_url_expires_in: '5 minutes',
            storage_path: storagePath,
            mime_type,
            instructions: 'Upload the file to upload_url using PUT with the correct Content-Type header. Then call confirm_upload with the document_id to process the document.',
          }),
        }],
      }
    }
  )

  // ── confirm_upload ─────────────────────────────────────
  // Step 2: Claude reads the PDF/image, extracts text itself, and passes it here.
  // Server only chunks + embeds — no downloading, no OCR, no PDF parsing needed.
  server.tool(
    'confirm_upload',
    'Confirm a document upload after the file has been uploaded to the signed URL. Pass the extracted text content from the PDF/image — Claude should read the document and provide the full text. Server will chunk and generate embeddings for search.',
    {
      document_id: z.string().uuid().describe('UUID of the document returned by upload_document'),
      extracted_text: z.string().min(1).describe('Full text content extracted from the document. Claude should read the PDF/image and provide all text here.'),
    },
    async ({ document_id, extracted_text }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      const supabase = createServiceRoleClient()

      // 1. Fetch the pending document
      const { data: doc, error: fetchErr } = await supabase
        .from('wallet_documents')
        .select('*')
        .eq('id', document_id)
        .eq('user_id', userId)
        .eq('status', 'pending')
        .single()

      if (fetchErr || !doc) {
        return { content: [{ type: 'text' as const, text: 'Error: Pending document not found. Either the document_id is wrong or it was already confirmed.' }], isError: true }
      }

      const trimmedText = extracted_text.trim()

      // 2. Get actual file size from storage
      let fileSize = 0
      try {
        const folder = doc.storage_path.split('/').slice(0, -1).join('/')
        const fileName = doc.storage_path.split('/').pop()!
        const { data: files } = await supabase.storage.from('documents').list(folder)
        const file = files?.find(f => f.name === fileName)
        if (file?.metadata?.size) fileSize = file.metadata.size
      } catch { /* best-effort */ }

      // 3. Update document record with text and file size
      const { error: updateErr } = await supabase
        .from('wallet_documents')
        .update({
          extracted_text: trimmedText,
          file_size: fileSize,
          status: 'ready',
        })
        .eq('id', document_id)

      if (updateErr) return { content: [{ type: 'text' as const, text: `Error: ${updateErr.message}` }], isError: true }

      // 3. Chunk and embed
      let chunksCreated = 0
      const chunks = chunkText(trimmedText)
      if (chunks.length > 0) {
        const embeddings = await generateEmbeddings(chunks.map(c => c.content))

        const chunkRows = chunks.map((chunk, i) => ({
          document_id: doc.id,
          user_id: userId,
          chunk_index: chunk.index,
          content: chunk.content,
          token_count: chunk.tokenCount,
          embedding: JSON.stringify(embeddings[i]),
        }))

        const { error: chunkErr } = await supabase
          .from('wallet_document_chunks')
          .insert(chunkRows)

        if (chunkErr) {
          console.error('Chunk insert error:', chunkErr)
        } else {
          chunksCreated = chunks.length
        }
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            document_id: doc.id,
            name: doc.name,
            doc_type: doc.doc_type,
            text_extracted: true,
            chunks_created: chunksCreated,
            status: 'ready',
            created_at: toIST(new Date(doc.created_at)),
          }),
        }],
      }
    }
  )

  // ── list_documents ──────────────────────────────────────
  server.tool(
    'list_documents',
    'List all uploaded documents with optional filtering by tags or doc type.',
    {
      doc_type: z.enum(['pdf', 'image', 'other']).optional().describe('Filter by document type'),
      tag: z.string().optional().describe('Filter by tag'),
      limit: z.number().int().min(1).max(100).default(50).describe('Max results (default: 50)'),
      offset: z.number().int().min(0).default(0).describe('Offset for pagination'),
    },
    async ({ doc_type, tag, limit, offset }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      const supabase = createServiceRoleClient()
      let query = supabase
        .from('wallet_documents')
        .select('id, name, description, doc_type, mime_type, file_size, tags, created_at', { count: 'exact' })
        .eq('user_id', userId)
        .eq('status', 'ready')

      if (doc_type) query = query.eq('doc_type', doc_type)
      if (tag) query = query.contains('tags', [tag])

      const { data, count, error } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

      if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

      const documents = (data || []).map(doc => ({
        document_id: doc.id,
        name: doc.name,
        description: doc.description,
        doc_type: doc.doc_type,
        file_size_bytes: doc.file_size,
        tags: doc.tags,
        created_at: toIST(new Date(doc.created_at)),
      }))

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ documents, total: count || 0, returned: documents.length }),
        }],
      }
    }
  )

  // ── get_document ────────────────────────────────────────
  registerAppTool(
    server,
    'get_document',
    {
      description: 'Get a document\'s details and a temporary download URL to retrieve the original file.',
      inputSchema: {
        document_id: z.string().uuid().describe('UUID of the document'),
      },
      _meta: { ui: { resourceUri: WIDGET_URIS.documentViewer } },
    },
    async ({ document_id }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      const supabase = createServiceRoleClient()
      const { data: doc, error } = await supabase
        .from('wallet_documents')
        .select('*')
        .eq('id', document_id)
        .eq('user_id', userId)
        .single()

      if (error || !doc) {
        return { content: [{ type: 'text' as const, text: 'Error: Document not found' }], isError: true }
      }

      const downloadUrl = await getSignedUrl(doc.storage_path, 3600)

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            document_id: doc.id,
            name: doc.name,
            description: doc.description,
            doc_type: doc.doc_type,
            mime_type: doc.mime_type,
            file_size_bytes: doc.file_size,
            tags: doc.tags,
            download_url: downloadUrl,
            download_url_expires_in: '1 hour',
            has_extracted_text: !!doc.extracted_text,
            created_at: toIST(new Date(doc.created_at)),
          }),
        }],
      }
    }
  )

  // ── search_documents ────────────────────────────────────
  server.tool(
    'search_documents',
    'Search across all documents using semantic similarity. Use this to find documents by content.',
    {
      query: z.string().min(1).max(500).describe('Search query, e.g. "electricity bill amount" or "policy number"'),
      limit: z.number().int().min(1).max(20).default(5).describe('Max results (default: 5)'),
    },
    async ({ query, limit }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      const queryEmbedding = await generateEmbedding(query)
      const supabase = createServiceRoleClient()

      const { data, error } = await supabase.rpc('match_wallet_document_chunks', {
        query_embedding: JSON.stringify(queryEmbedding),
        match_user_id: userId,
        match_count: limit,
      })

      if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

      const results = (data || []).map((row: { document_id: string; document_name: string; content: string; similarity: number; chunk_index: number }) => ({
        document_id: row.document_id,
        document_name: row.document_name,
        chunk_content: row.content,
        similarity: Math.round(row.similarity * 1000) / 1000,
        chunk_index: row.chunk_index,
      }))

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ query, results, returned: results.length }),
        }],
      }
    }
  )

  // ── update_document ─────────────────────────────────────
  server.tool(
    'update_document',
    'Edit document metadata (name, description, tags). The underlying file and extracted text are immutable — re-upload to change the file.',
    {
      document_id: z.string().uuid().describe('UUID of the document'),
      name: z.string().min(1).max(255).optional().describe('New name'),
      description: z.string().max(1000).nullable().optional().describe('New description (null clears)'),
      tags: z.array(z.string()).optional().describe('Replaces tag list entirely'),
    },
    async ({ document_id, name, description, tags }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      const supabase = createServiceRoleClient()

      const updates: Record<string, unknown> = {}
      if (name !== undefined) updates.name = name.trim()
      if (description !== undefined) updates.description = description === null ? null : description.trim()
      if (tags !== undefined) updates.tags = tags

      if (Object.keys(updates).length === 0) {
        return { content: [{ type: 'text' as const, text: 'Error: No fields to update' }], isError: true }
      }

      const { data, error } = await supabase
        .from('wallet_documents')
        .update(updates)
        .eq('id', document_id)
        .eq('user_id', userId)
        .select('id, name, description, doc_type, mime_type, tags, file_size, created_at')
        .single()

      if (error || !data) {
        return { content: [{ type: 'text' as const, text: 'Error: Document not found' }], isError: true }
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            document_id: data.id,
            name: data.name,
            description: data.description,
            doc_type: data.doc_type,
            mime_type: data.mime_type,
            file_size_bytes: data.file_size,
            tags: data.tags,
            created_at: toIST(new Date(data.created_at)),
          }),
        }],
      }
    }
  )

  // ── delete_document ─────────────────────────────────────
  server.tool(
    'delete_document',
    'Delete a document, its chunks, and the stored file permanently.',
    {
      document_id: z.string().uuid().describe('UUID of the document to delete'),
    },
    async ({ document_id }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      const supabase = createServiceRoleClient()

      // Fetch document to get storage path
      const { data: doc, error: fetchErr } = await supabase
        .from('wallet_documents')
        .select('id, name, storage_path')
        .eq('id', document_id)
        .eq('user_id', userId)
        .single()

      if (fetchErr || !doc) {
        return { content: [{ type: 'text' as const, text: 'Error: Document not found' }], isError: true }
      }

      // Delete file from storage
      await deleteFile(doc.storage_path).catch(err =>
        console.error('Storage delete error (non-fatal):', err)
      )

      // Delete document record (chunks cascade via FK)
      const { error: deleteErr } = await supabase
        .from('wallet_documents')
        .delete()
        .eq('id', document_id)
        .eq('user_id', userId)

      if (deleteErr) {
        return { content: [{ type: 'text' as const, text: `Error: ${deleteErr.message}` }], isError: true }
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            deleted: true,
            document_id: doc.id,
            name: doc.name,
          }),
        }],
      }
    }
  )
}
