-- ============================================================
-- PA MCP: Document Wallet tables
-- ============================================================

-- ── wallet_documents ───────────────────────────────────────────────

CREATE TABLE wallet_documents (
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

CREATE INDEX idx_wallet_documents_user_id ON wallet_documents(user_id);
CREATE INDEX idx_wallet_documents_tags ON wallet_documents USING GIN(tags);
CREATE INDEX idx_wallet_documents_doc_type ON wallet_documents(user_id, doc_type);

ALTER TABLE wallet_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own wallet_documents"
  ON wallet_documents FOR ALL
  USING (user_id = auth.uid());

-- ── wallet_document_chunks ─────────────────────────────────────────

CREATE TABLE wallet_document_chunks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   UUID NOT NULL REFERENCES wallet_documents(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chunk_index   INTEGER NOT NULL,
  content       TEXT NOT NULL,
  token_count   INTEGER NOT NULL,
  embedding     vector(1536) NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_chunks_document ON wallet_document_chunks(document_id);
CREATE INDEX idx_chunks_user ON wallet_document_chunks(user_id);
CREATE INDEX idx_chunks_embedding ON wallet_document_chunks
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

ALTER TABLE wallet_document_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own document chunks"
  ON wallet_document_chunks FOR ALL
  USING (user_id = auth.uid());

-- ── vector similarity search function ───────────────────────

CREATE OR REPLACE FUNCTION match_wallet_document_chunks(
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
  FROM wallet_document_chunks dc
  JOIN wallet_documents d ON d.id = dc.document_id
  WHERE dc.user_id = match_user_id
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
