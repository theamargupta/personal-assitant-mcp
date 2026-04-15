# Document Wallet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Document Wallet module to PA MCP that lets users upload documents (PDFs, images), stores the original files in Supabase Storage, extracts text, chunks it with embeddings into pgvector, and exposes MCP tools for upload, retrieval, search, and Q&A.

**Architecture:** Documents are uploaded via an `upload_document` MCP tool. Original files go to a Supabase Storage bucket (`documents`). Text is extracted server-side (pdf-parse for PDFs, Tesseract.js for images). Extracted text is split into ~500-token chunks, each embedded via OpenAI `text-embedding-3-small`, and stored in a `document_chunks` table with a `vector(1536)` column. Retrieval tools use cosine similarity search over embeddings. The original file can be fetched back via a signed URL from Supabase Storage.

**Tech Stack:** Supabase Storage (file blobs), Supabase pgvector (embeddings), OpenAI `text-embedding-3-small` (1536 dims), pdf-parse (PDF text extraction), Tesseract.js (OCR for images), Zod (validation)

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `supabase/migrations/003_document_wallet.sql` | `documents` table, `document_chunks` table with pgvector, RLS policies, indexes |
| `lib/mcp/tools/documents.ts` | All document wallet MCP tools (~5 tools) |
| `lib/documents/extract.ts` | Text extraction: PDF parsing + OCR for images |
| `lib/documents/chunk.ts` | Text chunking logic (split into ~500-token segments with overlap) |
| `lib/documents/embed.ts` | OpenAI embedding generation for chunks |
| `lib/documents/storage.ts` | Supabase Storage upload/download/signed-URL helpers |
| `types/index.ts` | Add Document and DocumentChunk types (modify existing) |

### Modified Files
| File | Change |
|------|--------|
| `lib/mcp/server.ts` | Import and register document tools |
| `package.json` | Add `pdf-parse`, `tesseract.js`, `openai` dependencies |
| `CLAUDE.md` | Add document wallet section |

---

## Task 1: Database Migration — documents + document_chunks tables

**Files:**
- Create: `supabase/migrations/003_document_wallet.sql`

- [ ] **Step 1: Enable pgvector extension**

Open your Supabase Dashboard > SQL Editor and run:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

This only needs to be done once per Supabase project. It cannot be done via migration files (requires superuser).

- [ ] **Step 2: Create migration file**

Create `supabase/migrations/003_document_wallet.sql`:

```sql
-- ============================================================
-- PA MCP: Document Wallet tables
-- ============================================================

-- ── documents ───────────────────────────────────────────────

CREATE TABLE documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  doc_type      TEXT NOT NULL CHECK (doc_type IN ('pdf', 'image', 'other')),
  mime_type     TEXT NOT NULL,
  file_size     BIGINT NOT NULL,
  storage_path  TEXT NOT NULL,
  tags          TEXT[] DEFAULT '{}',
  extracted_text TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_documents_user_id ON documents(user_id);
CREATE INDEX idx_documents_tags ON documents USING GIN(tags);
CREATE INDEX idx_documents_doc_type ON documents(user_id, doc_type);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own documents"
  ON documents FOR ALL
  USING (user_id = auth.uid());

-- ── document_chunks ─────────────────────────────────────────

CREATE TABLE document_chunks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chunk_index   INTEGER NOT NULL,
  content       TEXT NOT NULL,
  token_count   INTEGER NOT NULL,
  embedding     vector(1536) NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_chunks_document ON document_chunks(document_id);
CREATE INDEX idx_chunks_user ON document_chunks(user_id);
CREATE INDEX idx_chunks_embedding ON document_chunks
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own document chunks"
  ON document_chunks FOR ALL
  USING (user_id = auth.uid());
```

- [ ] **Step 3: Run migration in Supabase**

Go to Supabase Dashboard > SQL Editor and paste the contents of `003_document_wallet.sql`. Run it. Verify both tables exist under Table Editor.

- [ ] **Step 4: Create storage bucket**

In Supabase Dashboard > Storage, create a new bucket:
- Name: `documents`
- Public: **No** (private)
- File size limit: 20MB
- Allowed MIME types: `application/pdf, image/png, image/jpeg, image/webp`

Add an RLS policy on the bucket:
```sql
CREATE POLICY "Users manage own document files"
  ON storage.objects FOR ALL
  USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/003_document_wallet.sql
git commit -m "feat(docs-wallet): add documents and document_chunks tables with pgvector"
```

---

## Task 2: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install production dependencies**

```bash
cd "/Volumes/maersk/amargupta/Documents/Latest Projects/Portfolio Project/devfrend-personal-assitant"
npm install pdf-parse tesseract.js openai
```

- [ ] **Step 2: Install type stubs**

```bash
npm install -D @types/pdf-parse
```

- [ ] **Step 3: Add OPENAI_API_KEY to environment**

Add to `.env.local`:
```
OPENAI_API_KEY=sk-...your-key...
```

Add to `.env.local.example`:
```
OPENAI_API_KEY=                    # OpenAI API key (for document embeddings)
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json .env.local.example
git commit -m "feat(docs-wallet): add pdf-parse, tesseract.js, openai dependencies"
```

---

## Task 3: Add TypeScript Types

**Files:**
- Modify: `types/index.ts`

- [ ] **Step 1: Add document types to types/index.ts**

Append to the end of `types/index.ts`:

```typescript
// ============ DOCUMENT TYPES ============

export type DocType = 'pdf' | 'image' | 'other'

export interface Document {
  id: string
  user_id: string
  name: string
  description: string | null
  doc_type: DocType
  mime_type: string
  file_size: number
  storage_path: string
  tags: string[]
  extracted_text: string | null
  created_at: string
  updated_at: string
}

export interface DocumentChunk {
  id: string
  document_id: string
  user_id: string
  chunk_index: number
  content: string
  token_count: number
  embedding: number[]
  created_at: string
}
```

- [ ] **Step 2: Commit**

```bash
git add types/index.ts
git commit -m "feat(docs-wallet): add Document and DocumentChunk types"
```

---

## Task 4: Supabase Storage Helpers

**Files:**
- Create: `lib/documents/storage.ts`

- [ ] **Step 1: Create storage helper**

Create `lib/documents/storage.ts`:

```typescript
import { createServiceRoleClient } from '@/lib/supabase/service-role'

const BUCKET = 'documents'

export async function uploadFile(
  userId: string,
  fileName: string,
  fileBuffer: Buffer,
  mimeType: string
): Promise<string> {
  const supabase = createServiceRoleClient()
  const storagePath = `${userId}/${Date.now()}-${fileName}`

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, fileBuffer, {
      contentType: mimeType,
      upsert: false,
    })

  if (error) throw new Error(`Upload failed: ${error.message}`)
  return storagePath
}

export async function getSignedUrl(storagePath: string, expiresInSeconds = 3600): Promise<string> {
  const supabase = createServiceRoleClient()

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds)

  if (error) throw new Error(`Signed URL failed: ${error.message}`)
  return data.signedUrl
}

export async function downloadFile(storagePath: string): Promise<Buffer> {
  const supabase = createServiceRoleClient()

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(storagePath)

  if (error) throw new Error(`Download failed: ${error.message}`)
  return Buffer.from(await data.arrayBuffer())
}

export async function deleteFile(storagePath: string): Promise<void> {
  const supabase = createServiceRoleClient()

  const { error } = await supabase.storage
    .from(BUCKET)
    .remove([storagePath])

  if (error) throw new Error(`Delete failed: ${error.message}`)
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/documents/storage.ts
git commit -m "feat(docs-wallet): add Supabase Storage upload/download/signedUrl helpers"
```

---

## Task 5: Text Extraction (PDF + OCR)

**Files:**
- Create: `lib/documents/extract.ts`

- [ ] **Step 1: Create text extraction module**

Create `lib/documents/extract.ts`:

```typescript
import pdf from 'pdf-parse'
import Tesseract from 'tesseract.js'

export async function extractText(
  fileBuffer: Buffer,
  mimeType: string
): Promise<string> {
  if (mimeType === 'application/pdf') {
    return extractFromPdf(fileBuffer)
  }

  if (mimeType.startsWith('image/')) {
    return extractFromImage(fileBuffer)
  }

  return ''
}

async function extractFromPdf(buffer: Buffer): Promise<string> {
  const result = await pdf(buffer)
  return result.text.trim()
}

async function extractFromImage(buffer: Buffer): Promise<string> {
  const worker = await Tesseract.createWorker('eng')
  const { data } = await worker.recognize(buffer)
  await worker.terminate()
  return data.text.trim()
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/documents/extract.ts
git commit -m "feat(docs-wallet): add PDF and image text extraction"
```

---

## Task 6: Text Chunking

**Files:**
- Create: `lib/documents/chunk.ts`

- [ ] **Step 1: Create chunking module**

Create `lib/documents/chunk.ts`:

```typescript
const TARGET_CHUNK_SIZE = 500   // approximate tokens
const OVERLAP = 50              // overlap tokens for context continuity
const AVG_CHARS_PER_TOKEN = 4   // rough estimate for English text

export interface TextChunk {
  content: string
  index: number
  tokenCount: number
}

export function chunkText(text: string): TextChunk[] {
  if (!text.trim()) return []

  const targetChars = TARGET_CHUNK_SIZE * AVG_CHARS_PER_TOKEN
  const overlapChars = OVERLAP * AVG_CHARS_PER_TOKEN

  // Split by paragraphs first, then by sentences if paragraphs are too large
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim())

  const chunks: TextChunk[] = []
  let currentChunk = ''
  let chunkIndex = 0

  for (const paragraph of paragraphs) {
    if (currentChunk.length + paragraph.length > targetChars && currentChunk.length > 0) {
      chunks.push({
        content: currentChunk.trim(),
        index: chunkIndex,
        tokenCount: Math.ceil(currentChunk.trim().length / AVG_CHARS_PER_TOKEN),
      })
      chunkIndex++

      // Keep overlap from end of previous chunk
      const overlapText = currentChunk.slice(-overlapChars)
      currentChunk = overlapText + '\n\n' + paragraph
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph
    }
  }

  // Push remaining text
  if (currentChunk.trim()) {
    chunks.push({
      content: currentChunk.trim(),
      index: chunkIndex,
      tokenCount: Math.ceil(currentChunk.trim().length / AVG_CHARS_PER_TOKEN),
    })
  }

  // Handle single large paragraphs that exceed target size
  const result: TextChunk[] = []
  let reIndex = 0
  for (const chunk of chunks) {
    if (chunk.content.length > targetChars * 2) {
      // Split by sentences
      const sentences = chunk.content.match(/[^.!?]+[.!?]+/g) || [chunk.content]
      let subChunk = ''
      for (const sentence of sentences) {
        if (subChunk.length + sentence.length > targetChars && subChunk.length > 0) {
          result.push({
            content: subChunk.trim(),
            index: reIndex,
            tokenCount: Math.ceil(subChunk.trim().length / AVG_CHARS_PER_TOKEN),
          })
          reIndex++
          subChunk = subChunk.slice(-overlapChars) + sentence
        } else {
          subChunk += sentence
        }
      }
      if (subChunk.trim()) {
        result.push({
          content: subChunk.trim(),
          index: reIndex,
          tokenCount: Math.ceil(subChunk.trim().length / AVG_CHARS_PER_TOKEN),
        })
        reIndex++
      }
    } else {
      result.push({ ...chunk, index: reIndex })
      reIndex++
    }
  }

  return result
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/documents/chunk.ts
git commit -m "feat(docs-wallet): add text chunking with overlap"
```

---

## Task 7: Embedding Generation

**Files:**
- Create: `lib/documents/embed.ts`

- [ ] **Step 1: Create embedding module**

Create `lib/documents/embed.ts`:

```typescript
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []

  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: texts,
  })

  return response.data.map(item => item.embedding)
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const [embedding] = await generateEmbeddings([text])
  return embedding
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/documents/embed.ts
git commit -m "feat(docs-wallet): add OpenAI embedding generation"
```

---

## Task 8: Document MCP Tools

**Files:**
- Create: `lib/mcp/tools/documents.ts`
- Modify: `lib/mcp/server.ts`

- [ ] **Step 1: Create document tools**

Create `lib/mcp/tools/documents.ts`:

```typescript
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
        .from('documents')
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
            .from('document_chunks')
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
        .from('documents')
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
        .from('documents')
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

      const { data, error } = await supabase.rpc('match_document_chunks', {
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
        .from('documents')
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
        .from('documents')
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
```

- [ ] **Step 2: Commit**

```bash
git add lib/mcp/tools/documents.ts
git commit -m "feat(docs-wallet): add 5 document MCP tools (upload, list, get, search, delete)"
```

---

## Task 9: Supabase RPC for Vector Similarity Search

**Files:**
- Append to: `supabase/migrations/003_document_wallet.sql`

The `search_documents` tool calls a Supabase RPC function for cosine similarity search. This must exist in the database.

- [ ] **Step 1: Add match function to migration**

Append to the end of `supabase/migrations/003_document_wallet.sql`:

```sql
-- ── vector similarity search function ───────────────────────

CREATE OR REPLACE FUNCTION match_document_chunks(
  query_embedding vector(1536),
  match_user_id UUID,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  document_id UUID,
  document_name TEXT,
  content TEXT,
  similarity FLOAT,
  chunk_index INT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id AS document_id,
    d.name AS document_name,
    dc.content,
    1 - (dc.embedding <=> query_embedding) AS similarity,
    dc.chunk_index
  FROM document_chunks dc
  JOIN documents d ON d.id = dc.document_id
  WHERE dc.user_id = match_user_id
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

- [ ] **Step 2: Run in Supabase SQL Editor**

Copy the function above and run it in the Supabase SQL Editor.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/003_document_wallet.sql
git commit -m "feat(docs-wallet): add match_document_chunks RPC for vector search"
```

---

## Task 10: Register Document Tools in MCP Server

**Files:**
- Modify: `lib/mcp/server.ts`

- [ ] **Step 1: Update server.ts**

Replace the contents of `lib/mcp/server.ts` with:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerHabitTools } from '@/lib/mcp/tools/habits'
import { registerTaskTools } from '@/lib/mcp/tools/tasks'
import { registerDocumentTools } from '@/lib/mcp/tools/documents'

export function createMcpServer() {
  const server = new McpServer({
    name: 'pa-mcp',
    version: '0.1.0',
  })

  registerHabitTools(server)
  registerTaskTools(server)
  registerDocumentTools(server)

  return server
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/mcp/server.ts
git commit -m "feat(docs-wallet): register document tools in MCP server"
```

---

## Task 11: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add document wallet section to CLAUDE.md**

Add the following under the Task Tools table in the MCP Tools section:

```markdown
### Document Wallet Tools (5)

| Tool | Description |
|------|-------------|
| `upload_document` | Upload PDF/image, extract text, chunk + embed for search |
| `list_documents` | List documents with filters by type and tags |
| `get_document` | Get document details + signed download URL (1hr expiry) |
| `search_documents` | Semantic search across all document content |
| `delete_document` | Permanently delete document, chunks, and stored file |
```

Add to the Database Schema section:

```markdown
### Document Wallet Tables
- **documents** — name, description, doc_type, mime_type, file_size, storage_path, tags, extracted_text
- **document_chunks** — document_id, chunk_index, content, token_count, embedding (vector 1536)
```

Add `OPENAI_API_KEY` to the Environment Variables section.

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add document wallet to CLAUDE.md"
```

---

## Task 12: Build Verification

- [ ] **Step 1: Run type check**

```bash
cd "/Volumes/maersk/amargupta/Documents/Latest Projects/Portfolio Project/devfrend-personal-assitant"
npm run type-check
```

Expected: No TypeScript errors.

- [ ] **Step 2: Run lint**

```bash
npm run lint
```

Expected: No linting errors.

- [ ] **Step 3: Run build**

```bash
npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 4: Fix any issues found in steps 1-3, then commit**

```bash
git add -A
git commit -m "fix(docs-wallet): resolve build issues"
```

---

## Summary of MCP Tools Added

| # | Tool | What it does |
|---|------|-------------|
| 1 | `upload_document` | Upload file (PDF/image) → store in Supabase Storage → extract text → chunk → embed → ready for search |
| 2 | `list_documents` | Browse all documents, filter by type or tag |
| 3 | `get_document` | Get doc details + 1-hour signed download URL to retrieve original file |
| 4 | `search_documents` | Semantic vector search — "what's my policy number?" finds the right chunk |
| 5 | `delete_document` | Remove document, all chunks, and stored file |
