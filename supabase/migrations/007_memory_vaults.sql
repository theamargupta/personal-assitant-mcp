-- ============================================================
-- PA MCP: Memory Vaults module
-- ============================================================

-- ── memory_spaces (extensible vaults) ──────────────────────

CREATE TABLE memory_spaces (
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

CREATE INDEX idx_memory_spaces_user ON memory_spaces(user_id);

ALTER TABLE memory_spaces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own spaces"
  ON memory_spaces FOR ALL
  USING (user_id = auth.uid());

-- ── memory_items ───────────────────────────────────────────

CREATE TABLE memory_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id    UUID NOT NULL REFERENCES memory_spaces(id) ON DELETE CASCADE,
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
  parent_id   UUID REFERENCES memory_items(id) ON DELETE SET NULL,

  embedding   vector(1536),

  is_active   BOOLEAN DEFAULT true,

  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_memory_items_space ON memory_items(space_id);
CREATE INDEX idx_memory_items_user ON memory_items(user_id);
CREATE INDEX idx_memory_items_category ON memory_items(user_id, category);
CREATE INDEX idx_memory_items_project ON memory_items(user_id, project);
CREATE INDEX idx_memory_items_active ON memory_items(user_id, is_active);
CREATE INDEX idx_memory_items_valid ON memory_items(user_id, valid_at, invalid_at);

CREATE INDEX idx_memory_items_embedding
  ON memory_items USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

ALTER TABLE memory_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own memories"
  ON memory_items FOR ALL
  USING (user_id = auth.uid());

-- ── memory_access_log ──────────────────────────────────────

CREATE TABLE memory_access_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action      TEXT NOT NULL,
  tool_name   TEXT NOT NULL,
  query       TEXT,
  memory_ids  UUID[],
  metadata    JSONB DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_memory_access_log_user ON memory_access_log(user_id);
CREATE INDEX idx_memory_access_log_created ON memory_access_log(user_id, created_at);

ALTER TABLE memory_access_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own logs"
  ON memory_access_log FOR ALL
  USING (user_id = auth.uid());

-- ── RPC: match_memories ────────────────────────────────────

CREATE OR REPLACE FUNCTION match_memories(
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
  FROM memory_items mi
  JOIN memory_spaces ms ON ms.id = mi.space_id
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

-- ── RPC: increment_memory_importance ───────────────────────

CREATE OR REPLACE FUNCTION increment_memory_importance(
  memory_ids UUID[],
  boost FLOAT DEFAULT 0.1
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE memory_items
  SET importance = LEAST(importance + boost, 10.0)
  WHERE id = ANY(memory_ids)
    AND is_active = true;
END;
$$;
