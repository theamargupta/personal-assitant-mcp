import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { toIST } from '@/types'
import { uploadFile, getSignedUrl, deleteFile } from '@/lib/documents/storage'
import { extractText } from '@/lib/documents/extract'
import { chunkText } from '@/lib/documents/chunk'
import { generateEmbeddings, generateEmbedding } from '@/lib/documents/embed'

function detectDocType(mimeType: string): 'pdf' | 'image' | 'other' {
  if (mimeType === 'application/pdf') return 'pdf'
  if (mimeType.startsWith('image/')) return 'image'
  return 'other'
}

export function registerDocumentTools(server: McpServer) {

  // ── upload_document ─────────────────────────────────────
  server.tool(
    'upload_document',
    'Upload a document (PDF or image). Extracts text, generates embeddings for search and Q&A.',
    {
      name: z.string().min(1).max(255).describe('Document name, e.g. "Electricity Bill March 2026"'),
      description: z.string().max(1000).optional().describe('Optional description'),
      file_base64: z.string().describe('Base64-encoded file content'),
      mime_type: z.enum([
        'application/pdf',
        'image/png',
        'image/jpeg',
        'image/webp',
      ]).describe('MIME type of the file'),
      tags: z.array(z.string()).default([]).describe('Tags for organizing, e.g. ["bill", "electricity"]'),
    },
    async ({ name, description, file_base64, mime_type, tags }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      const fileBuffer = Buffer.from(file_base64, 'base64')
      const fileSize = fileBuffer.length

      // 1. Upload to Supabase Storage
      const storagePath = await uploadFile(userId, name.replace(/\s+/g, '-'), fileBuffer, mime_type)

      // 2. Extract text
      const extractedText = await extractText(fileBuffer, mime_type)

      // 3. Save document record
      const supabase = createServiceRoleClient()
      const docType = detectDocType(mime_type)

      const { data: doc, error: docErr } = await supabase
        .from('wallet_documents')
        .insert({
          user_id: userId,
          name: name.trim(),
          description: description?.trim() || null,
          doc_type: docType,
          mime_type,
          file_size: fileSize,
          storage_path: storagePath,
          tags,
          extracted_text: extractedText || null,
        })
        .select('id, name, created_at')
        .single()

      if (docErr) return { content: [{ type: 'text' as const, text: `Error: ${docErr.message}` }], isError: true }

      // 4. Chunk and embed
      let chunksCreated = 0
      if (extractedText) {
        const chunks = chunkText(extractedText)
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
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            document_id: doc.id,
            name: doc.name,
            doc_type: docType,
            file_size_bytes: fileSize,
            text_extracted: !!extractedText,
            chunks_created: chunksCreated,
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
  server.tool(
    'get_document',
    'Get a document\'s details and a temporary download URL to retrieve the original file.',
    {
      document_id: z.string().uuid().describe('UUID of the document'),
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
