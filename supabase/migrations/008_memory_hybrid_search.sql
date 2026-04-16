-- 008_memory_hybrid_search.sql
-- Full-text search column + hybrid search RPC for PA memory vaults
-- Idempotent where possible

ALTER TABLE pa_memory_items
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

UPDATE pa_memory_items
SET search_vector = to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, ''))
WHERE search_vector IS NULL;

CREATE OR REPLACE FUNCTION pa_memory_search_vector_trigger()
RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english', coalesce(NEW.title, '') || ' ' || coalesce(NEW.content, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pa_memory_search_vector ON pa_memory_items;
CREATE TRIGGER trg_pa_memory_search_vector
  BEFORE INSERT OR UPDATE OF title, content
  ON pa_memory_items
  FOR EACH ROW
  EXECUTE FUNCTION pa_memory_search_vector_trigger();

CREATE INDEX IF NOT EXISTS idx_pa_memory_items_search_vector
  ON pa_memory_items USING gin(search_vector);

-- ── pa_match_memories: include updated_at (for duplicate UX) ──

CREATE OR REPLACE FUNCTION pa_match_memories(
  query_embedding vector(1536),
  filter_user_id UUID,
  filter_space_slug TEXT DEFAULT NULL,
  filter_category TEXT DEFAULT NULL,
  filter_project TEXT DEFAULT NULL,
  match_count INT DEFAULT 10,
  match_threshold FLOAT DEFAULT 0.3
)
RETURNS TABLE (
  id UUID,
  space_id UUID,
  space_slug TEXT,
  title TEXT,
  content TEXT,
  category TEXT,
  tags TEXT[],
  project TEXT,
  valid_at TIMESTAMPTZ,
  source TEXT,
  importance REAL,
  updated_at TIMESTAMPTZ,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    mi.id,
    mi.space_id,
    ms.slug AS space_slug,
    mi.title,
    mi.content,
    mi.category,
    mi.tags,
    mi.project,
    mi.valid_at,
    mi.source,
    mi.importance,
    mi.updated_at,
    1 - (mi.embedding <=> query_embedding) AS similarity
  FROM pa_memory_items mi
  JOIN pa_memory_spaces ms ON ms.id = mi.space_id
  WHERE mi.user_id = filter_user_id
    AND mi.is_active = true
    AND mi.invalid_at IS NULL
    AND mi.embedding IS NOT NULL
    AND (filter_space_slug IS NULL OR ms.slug = filter_space_slug)
    AND (filter_category IS NULL OR mi.category = filter_category)
    AND (filter_project IS NULL OR mi.project = filter_project)
    AND 1 - (mi.embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;

-- ── Hybrid search RPC ─────────────────────────────────────

CREATE OR REPLACE FUNCTION pa_hybrid_search(
  query_embedding vector(1536),
  query_text TEXT,
  filter_user_id UUID,
  filter_space_slug TEXT DEFAULT NULL,
  filter_category TEXT DEFAULT NULL,
  filter_project TEXT DEFAULT NULL,
  match_count INT DEFAULT 10,
  semantic_weight FLOAT DEFAULT 0.5,
  keyword_weight FLOAT DEFAULT 0.3,
  importance_weight FLOAT DEFAULT 0.2
)
RETURNS TABLE (
  id UUID,
  space_id UUID,
  space_slug TEXT,
  title TEXT,
  content TEXT,
  category TEXT,
  tags TEXT[],
  project TEXT,
  valid_at TIMESTAMPTZ,
  invalid_at TIMESTAMPTZ,
  source TEXT,
  importance REAL,
  semantic_score FLOAT,
  keyword_score FLOAT,
  final_score FLOAT
)
LANGUAGE plpgsql
AS $$
DECLARE
  ts_query tsquery;
BEGIN
  ts_query := plainto_tsquery('english', coalesce(query_text, ''));

  RETURN QUERY
  SELECT
    mi.id,
    mi.space_id,
    ms.slug AS space_slug,
    mi.title,
    mi.content,
    mi.category,
    mi.tags,
    mi.project,
    mi.valid_at,
    mi.invalid_at,
    mi.source,
    mi.importance,
    (1 - (mi.embedding <=> query_embedding))::FLOAT AS semantic_score,
    COALESCE(ts_rank(mi.search_vector, ts_query), 0)::FLOAT AS keyword_score,
    (
      semantic_weight * (1 - (mi.embedding <=> query_embedding)) +
      keyword_weight * COALESCE(ts_rank(mi.search_vector, ts_query), 0) +
      importance_weight * (mi.importance / 10.0)
    )::FLOAT AS final_score
  FROM pa_memory_items mi
  JOIN pa_memory_spaces ms ON ms.id = mi.space_id
  WHERE mi.user_id = filter_user_id
    AND mi.is_active = true
    AND mi.invalid_at IS NULL
    AND mi.embedding IS NOT NULL
    AND (filter_space_slug IS NULL OR ms.slug = filter_space_slug)
    AND (filter_category IS NULL OR mi.category = filter_category)
    AND (filter_project IS NULL OR mi.project = filter_project)
    AND (
      (1 - (mi.embedding <=> query_embedding)) > 0.3
      OR (ts_query @@ mi.search_vector)
    )
  ORDER BY final_score DESC
  LIMIT match_count;
END;
$$;
