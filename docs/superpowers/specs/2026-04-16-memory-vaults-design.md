# Memory Vaults — Design Spec

## Problem

PA MCP has 5 modules (habits, tasks, finance, documents, goals) but no persistent memory layer. The user wants a centralized brain that works across all MCP clients (Claude Code, claude.ai, Cursor, ChatGPT) to store:
- **Personal memories** — preferences, patterns, persona, form-fill content
- **Project memories** — CLAUDE.md content, rules, decisions, gotchas per project
- **Extensible** — user can create new memory spaces for any future use case

The existing memory-mcp server handles this partially but is a separate system. This design adds memory as a native PA MCP module, with a more robust architecture inspired by Mem0, Letta, and Zep.

## Phased Approach

- **Phase 1** (this spec): Spaces + CRUD + semantic search + temporal fields. Fully functional memory system.
- **Phase 2** (future): Mem0-style consolidation pipeline — auto ADD/UPDATE/DELETE/NOOP on save.
- **Phase 3** (future): Hybrid retrieval (BM25 + entity boost), Auto Dream background cleanup.

---

## Phase 1 Design

### Database Schema

#### Migration: `007_memory_vaults.sql`

```sql
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

  -- Content
  title       TEXT NOT NULL,
  content     TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'note' CHECK (category IN (
    'preference', 'rule', 'project', 'decision',
    'context', 'snippet', 'note', 'persona'
  )),
  tags        TEXT[] DEFAULT '{}',
  project     TEXT,                -- optional project scope (e.g., "memory-mcp", "apmt-pricing")

  -- Temporal (Zep-inspired)
  valid_at    TIMESTAMPTZ DEFAULT now(),  -- when this fact became true
  invalid_at  TIMESTAMPTZ,               -- when superseded (NULL = still valid)

  -- Metadata
  source      TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'auto', 'consolidated')),
  importance  REAL DEFAULT 0.0,          -- updated on retrieval (frequency-based)
  parent_id   UUID REFERENCES memory_items(id) ON DELETE SET NULL,  -- predecessor link

  -- Embedding
  embedding   vector(1536),              -- OpenAI text-embedding-3-small (1536-dim to match doc wallet)

  -- Soft delete
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

-- Vector similarity index
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

-- ── Auto-seed default spaces ───────────────────────────────
-- Done in application code on first user access, not in migration.
-- Default spaces: "personal" (slug: personal), "projects" (slug: projects)
```

### Default Spaces (auto-created on first access)

| Space | Slug | Description | Use Case |
|-------|------|-------------|----------|
| Personal | `personal` | Preferences, patterns, persona, form-fill data | "I prefer dark themes", "My CTC is 15 LPA" |
| Projects | `projects` | CLAUDE.md, rules, decisions, gotchas per project | "memory-mcp uses soft deletes", "APMT uses data-cy selectors" |

User can create custom spaces via MCP tool or dashboard (e.g., "work-notes", "learning", "interview-prep").

### MCP Tools

#### File: `lib/mcp/tools/memory.ts`

10 tools total:

| Tool | Description | Key Params |
|------|-------------|------------|
| `save_memory` | Store a new memory | `space` (slug), `title`, `content`, `category`, `tags[]`, `project` |
| `search_memory` | Semantic search across memories | `query`, `space?`, `category?`, `project?`, `limit` (default 5, max 20) |
| `list_memories` | Browse with filters | `space?`, `category?`, `project?`, `tag?`, `limit`, `offset` |
| `get_memory` | Get by ID | `memory_id` |
| `update_memory` | PATCH semantics | `memory_id`, any field to update |
| `delete_memory` | Soft delete (is_active=false) | `memory_id` |
| `get_context` | All active memories for a project | `project` |
| `get_rules` | All rule-category memories | `project?` |
| `create_space` | Create a new memory space | `name`, `slug`, `description`, `icon` |
| `list_spaces` | List all user's spaces | (none) |

#### Tool Behavior Details

**`save_memory`**:
1. Validate inputs with Zod
2. Resolve space by slug (auto-create default spaces if first access)
3. Generate embedding via OpenAI `text-embedding-3-small` (1536-dim)
4. Insert into `memory_items` with `valid_at = now()`, `source = 'manual'`
5. Log to `memory_access_log`
6. Return created memory with ID

**`search_memory`**:
1. Generate embedding for query
2. Call `match_memories()` RPC with filters
3. Update `importance` score on matched items (increment by 0.1, capped at 10.0)
4. Log search to access log
5. Return ranked results with similarity scores

**`delete_memory`**:
1. Set `is_active = false` (soft delete — never hard delete)
2. Set `invalid_at = now()`
3. Log deletion

**`get_context`**:
1. Fetch all memories where `project = <name>` AND `is_active = true` AND `invalid_at IS NULL`
2. Ordered by category (rules first, then context, then decisions, then notes)
3. No embedding needed — direct DB query

**`get_rules`**:
1. Fetch all memories where `category = 'rule'` AND `is_active = true`
2. Optionally filtered by project
3. Ordered by importance DESC

### Embedding Generation

Reuse the existing pattern from document wallet (`lib/mcp/tools/documents.ts`):

```typescript
// lib/memory/embeddings.ts
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function generateMemoryEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
    dimensions: 1536,
  });
  return response.data[0].embedding;
}
```

Input for embedding: `${title}\n\n${content}` (concatenate title + content for richer semantic signal).

### File Structure

```
lib/
  mcp/
    tools/
      memory.ts          # 10 MCP tool definitions + handlers (~400 lines)
  memory/
    embeddings.ts        # OpenAI embedding generation
    spaces.ts            # Space CRUD + auto-seed logic
    items.ts             # Memory CRUD operations
    types.ts             # Zod schemas + TypeScript types
supabase/
  migrations/
    007_memory_vaults.sql
```

### Zod Schemas

```typescript
// lib/memory/types.ts
import { z } from "zod";

export const MemoryCategoryEnum = z.enum([
  "preference", "rule", "project", "decision",
  "context", "snippet", "note", "persona",
]);

export const SaveMemorySchema = z.object({
  space: z.string().min(1).default("personal"),
  title: z.string().min(1).max(255),
  content: z.string().min(1).max(10000),
  category: MemoryCategoryEnum.default("note"),
  tags: z.array(z.string()).default([]),
  project: z.string().optional(),
});

export const SearchMemorySchema = z.object({
  query: z.string().min(1).max(500),
  space: z.string().optional(),
  category: MemoryCategoryEnum.optional(),
  project: z.string().optional(),
  limit: z.number().min(1).max(20).default(5),
});

export const UpdateMemorySchema = z.object({
  memory_id: z.string().uuid(),
  title: z.string().min(1).max(255).optional(),
  content: z.string().min(1).max(10000).optional(),
  category: MemoryCategoryEnum.optional(),
  tags: z.array(z.string()).optional(),
  project: z.string().nullable().optional(),
  space: z.string().optional(),  // move to different space
});

export const CreateSpaceSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
  description: z.string().max(500).optional(),
  icon: z.string().max(10).default("🧠"),
});
```

### Access Logging

Every tool call logged to `memory_access_log` (consistent with existing PA MCP pattern from doc wallet):

```typescript
await supabase.from("memory_access_log").insert({
  user_id,
  action: "search",
  tool_name: "search_memory",
  query: params.query,
  memory_ids: results.map(r => r.id),
  metadata: { space: params.space, category: params.category },
});
```

### Dashboard UI (Phase 1)

New page: `/dashboard/memory`

- **Space tabs** at top (Personal, Projects, + custom spaces)
- **Memory list** with filters (category, project, tags)
- **Search bar** with semantic search
- **Create memory** modal
- **Edit/delete** inline
- **Create space** button
- Same dark glassmorphism theme as other dashboard pages

### Integration with MCP Server

Register memory tools in `lib/mcp/server.ts` alongside existing tool groups:

```typescript
import { registerMemoryTools } from "./tools/memory";

// In createServer():
registerHabitTools(server);
registerTaskTools(server);
registerDocumentTools(server);
registerFinanceTools(server);
registerGoalTools(server);
registerMemoryTools(server);  // NEW
```

---

## Phase 2 (Future): Consolidation Pipeline

When `save_memory` is called:
1. Generate embedding for new memory
2. Search existing memories for similar content (threshold > 0.85)
3. If matches found, send to LLM with prompt:
   ```
   Given existing memory: "..."
   And new memory: "..."
   Choose: ADD (new fact) | UPDATE (merge into existing) | DELETE (contradicts) | NOOP (duplicate)
   ```
4. Execute the chosen operation
5. If UPDATE: set `invalid_at` on old, create new with `parent_id` pointing to old

## Phase 3 (Future): Hybrid Retrieval + Auto Dream

**Hybrid retrieval scoring:**
```
score = (0.5 * semantic) + (0.3 * bm25_keyword) + (0.2 * importance_boost)
```

**Auto Dream (background consolidation):**
- Scheduled via Vercel Cron (weekly)
- Reviews all memories: merge duplicates, flag stale ones, update importance scores
- Inspired by Claude's "REM sleep" pattern

---

## Out of Scope

- Graph memory (entity nodes + relationship edges) — Phase 4+ consideration
- Cross-user memory sharing
- Real-time memory sync between MCP clients
- Migration from memory-mcp (manual copy-paste, Claude will handle)

## Dependencies

- OpenAI API key (already available in PA MCP for document embeddings)
- Supabase pgvector extension (already enabled for document wallet)
- No new external dependencies needed

## Success Criteria

1. All 10 MCP tools work in Claude.ai, Claude Code, and Cursor
2. Semantic search returns relevant results with < 500ms latency
3. Default spaces auto-created on first use
4. All data isolated per user via RLS
5. Soft deletes only — no data loss
6. Access logging on every tool call
7. Dashboard page for viewing/managing memories
