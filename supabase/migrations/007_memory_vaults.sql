-- ============================================================
-- PA MCP: Memory Vaults module
-- Idempotent: safe to re-run if a previous attempt partially applied.
--
-- All objects use the `pa_` prefix so this app can share one Supabase
-- project with memory-mcp (which uses `memories`, `memory_access_log`, etc.).
-- ============================================================

-- ── pa_memory_spaces (extensible vaults) ───────────────────

CREATE TABLE IF NOT EXISTS pa_memory_spaces (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL,
  description TEXT,
  icon        TEXT DEFAULT '🧠',
  settings    JSONB DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),

  UNIQUE(user_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_pa_memory_spaces_user ON pa_memory_spaces(user_id);

ALTER TABLE pa_memory_spaces ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "PA users manage own memory spaces" ON pa_memory_spaces;
CREATE POLICY "PA users manage own memory spaces"
  ON pa_memory_spaces FOR ALL
  USING (user_id = auth.uid());

-- ── pa_memory_items ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pa_memory_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id    UUID NOT NULL REFERENCES pa_memory_spaces(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  title       TEXT NOT NULL,
  content     TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'note' CHECK (category IN (
    'preference', 'rule', 'project', 'decision',
    'context', 'snippet', 'note', 'persona'
  )),
  tags        TEXT[] DEFAULT '{}',
  project     TEXT,

  valid_at    TIMESTAMPTZ DEFAULT now(),
  invalid_at  TIMESTAMPTZ,

  source      TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'auto', 'consolidated')),
  importance  REAL DEFAULT 0.0,
  parent_id   UUID REFERENCES pa_memory_items(id) ON DELETE SET NULL,

  embedding   vector(1536),

  is_active   BOOLEAN DEFAULT true,

  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pa_memory_items_space ON pa_memory_items(space_id);
CREATE INDEX IF NOT EXISTS idx_pa_memory_items_user ON pa_memory_items(user_id);
CREATE INDEX IF NOT EXISTS idx_pa_memory_items_category ON pa_memory_items(user_id, category);
CREATE INDEX IF NOT EXISTS idx_pa_memory_items_project ON pa_memory_items(user_id, project);
CREATE INDEX IF NOT EXISTS idx_pa_memory_items_active ON pa_memory_items(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_pa_memory_items_valid ON pa_memory_items(user_id, valid_at, invalid_at);

CREATE INDEX IF NOT EXISTS idx_pa_memory_items_embedding
  ON pa_memory_items USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

ALTER TABLE pa_memory_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "PA users manage own memory items" ON pa_memory_items;
CREATE POLICY "PA users manage own memory items"
  ON pa_memory_items FOR ALL
  USING (user_id = auth.uid());

-- ── pa_memory_access_log (distinct from memory-mcp.access_log schema) ──

CREATE TABLE IF NOT EXISTS pa_memory_access_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action      TEXT NOT NULL,
  tool_name   TEXT NOT NULL,
  query       TEXT,
  memory_ids  UUID[],
  metadata    JSONB DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pa_memory_access_log_user ON pa_memory_access_log(user_id);
CREATE INDEX IF NOT EXISTS idx_pa_memory_access_log_created ON pa_memory_access_log(user_id, created_at);

ALTER TABLE pa_memory_access_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "PA users view own memory access logs" ON pa_memory_access_log;
CREATE POLICY "PA users view own memory access logs"
  ON pa_memory_access_log FOR ALL
  USING (user_id = auth.uid());

-- ── RPC: pa_match_memories ─────────────────────────────────

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
    1 - (mi.embedding <=> query_embedding) AS similarity
  FROM pa_memory_items mi
  JOIN pa_memory_spaces ms ON ms.id = mi.space_id
  WHERE mi.user_id = filter_user_id
    AND mi.is_active = true
    AND mi.invalid_at IS NULL
    AND (filter_space_slug IS NULL OR ms.slug = filter_space_slug)
    AND (filter_category IS NULL OR mi.category = filter_category)
    AND (filter_project IS NULL OR mi.project = filter_project)
    AND 1 - (mi.embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;

-- ── RPC: pa_increment_memory_importance ───────────────────

CREATE OR REPLACE FUNCTION pa_increment_memory_importance(
  memory_ids UUID[],
  boost FLOAT DEFAULT 0.1
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE pa_memory_items
  SET importance = LEAST(importance + boost, 10.0)
  WHERE id = ANY(memory_ids)
    AND is_active = true;
END;
$$;
