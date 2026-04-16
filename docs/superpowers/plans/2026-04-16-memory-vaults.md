# Memory Vaults Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a modular, extensible memory system to PA MCP with spaces/vaults, semantic search, temporal tracking, and a dashboard UI.

**Architecture:** New `memory_spaces` and `memory_items` tables in Supabase with pgvector embeddings (1536-dim, OpenAI text-embedding-3-small). 10 MCP tools registered via `registerMemoryTools(server)`. Reuses existing embedding helper from `lib/documents/embed.ts`. Auto-seeds default spaces on first access. Dashboard page at `/dashboard/memory`.

**Tech Stack:** Next.js 16, Supabase (pgvector), OpenAI embeddings, Zod 4, MCP SDK, Framer Motion, Tailwind CSS v4

**Spec:** `docs/superpowers/specs/2026-04-16-memory-vaults-design.md`

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/007_memory_vaults.sql`

- [ ] **Step 1: Create the migration file**

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
```

- [ ] **Step 2: Apply migration to Supabase**

Run: `npx supabase db push` or apply via the Supabase Dashboard SQL Editor.

Expected: Tables `memory_spaces`, `memory_items`, `memory_access_log` created. Function `match_memories` available.

- [ ] **Step 3: Verify in Supabase Dashboard**

Open the Supabase Dashboard → Table Editor. Confirm all 3 tables exist with correct columns and RLS policies enabled.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/007_memory_vaults.sql
git commit -m "feat: add memory vaults database schema (007)"
```

---

### Task 2: TypeScript Types & Zod Schemas

**Files:**
- Create: `lib/memory/types.ts`
- Modify: `types/index.ts`

- [ ] **Step 1: Create memory types file**

Create `lib/memory/types.ts`:

```typescript
import { z } from 'zod'

// ── Category enum ──────────────────────────────────────────

export const MemoryCategoryEnum = z.enum([
  'preference', 'rule', 'project', 'decision',
  'context', 'snippet', 'note', 'persona',
])

export type MemoryCategory = z.infer<typeof MemoryCategoryEnum>

// ── Source enum ─────────────────────────────────────────────

export const MemorySourceEnum = z.enum(['manual', 'auto', 'consolidated'])
export type MemorySource = z.infer<typeof MemorySourceEnum>

// ── Tool input schemas ─────────────────────────────────────

export const SaveMemorySchema = z.object({
  space: z.string().min(1).default('personal').describe('Space slug (default: "personal")'),
  title: z.string().min(1).max(255).describe('Memory title'),
  content: z.string().min(1).max(10000).describe('Memory content — the knowledge to store'),
  category: MemoryCategoryEnum.default('note').describe('Category (default: note)'),
  tags: z.array(z.string()).default([]).describe('Tags for organizing'),
  project: z.string().optional().describe('Optional project scope (e.g., "memory-mcp", "apmt-pricing")'),
})

export const SearchMemorySchema = z.object({
  query: z.string().min(1).max(500).describe('Natural language search query'),
  space: z.string().optional().describe('Filter by space slug'),
  category: MemoryCategoryEnum.optional().describe('Filter by category'),
  project: z.string().optional().describe('Filter by project'),
  limit: z.number().int().min(1).max(20).default(5).describe('Max results (default: 5)'),
})

export const ListMemoriesSchema = z.object({
  space: z.string().optional().describe('Filter by space slug'),
  category: MemoryCategoryEnum.optional().describe('Filter by category'),
  project: z.string().optional().describe('Filter by project'),
  tag: z.string().optional().describe('Filter by tag'),
  limit: z.number().int().min(1).max(50).default(20).describe('Max results (default: 20)'),
  offset: z.number().int().min(0).default(0).describe('Offset for pagination'),
})

export const GetMemorySchema = z.object({
  memory_id: z.string().uuid().describe('UUID of the memory'),
})

export const UpdateMemorySchema = z.object({
  memory_id: z.string().uuid().describe('UUID of the memory'),
  title: z.string().min(1).max(255).optional().describe('New title'),
  content: z.string().min(1).max(10000).optional().describe('New content'),
  category: MemoryCategoryEnum.optional().describe('New category'),
  tags: z.array(z.string()).optional().describe('New tags (replaces existing)'),
  project: z.string().nullable().optional().describe('New project or null to clear'),
  space: z.string().optional().describe('Move to different space (by slug)'),
})

export const DeleteMemorySchema = z.object({
  memory_id: z.string().uuid().describe('UUID of the memory to soft-delete'),
})

export const GetContextSchema = z.object({
  project: z.string().min(1).describe('Project name to get context for'),
})

export const GetRulesSchema = z.object({
  project: z.string().optional().describe('Optional project to scope rules to'),
})

export const CreateSpaceSchema = z.object({
  name: z.string().min(1).max(100).describe('Space display name'),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/).describe('URL-safe slug (lowercase, hyphens only)'),
  description: z.string().max(500).optional().describe('Space description'),
  icon: z.string().max(10).default('🧠').describe('Emoji icon'),
})

// ── Database row types ─────────────────────────────────────

export interface MemorySpace {
  id: string
  user_id: string
  name: string
  slug: string
  description: string | null
  icon: string
  settings: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface MemoryItem {
  id: string
  space_id: string
  user_id: string
  title: string
  content: string
  category: MemoryCategory
  tags: string[]
  project: string | null
  valid_at: string
  invalid_at: string | null
  source: MemorySource
  importance: number
  parent_id: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

// ── Default spaces ─────────────────────────────────────────

export const DEFAULT_SPACES = [
  {
    name: 'Personal',
    slug: 'personal',
    description: 'Preferences, patterns, persona, form-fill data',
    icon: '👤',
  },
  {
    name: 'Projects',
    slug: 'projects',
    description: 'CLAUDE.md, rules, decisions, gotchas per project',
    icon: '📁',
  },
] as const
```

- [ ] **Step 2: Add memory types to the main types file**

Append to `types/index.ts`:

```typescript
// ============ MEMORY TYPES ============

export type { MemoryCategory, MemorySource, MemorySpace, MemoryItem } from '@/lib/memory/types'
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`

Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add lib/memory/types.ts types/index.ts
git commit -m "feat: add memory vault types and Zod schemas"
```

---

### Task 3: Space Management (auto-seed + CRUD)

**Files:**
- Create: `lib/memory/spaces.ts`

- [ ] **Step 1: Create spaces module**

Create `lib/memory/spaces.ts`:

```typescript
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { DEFAULT_SPACES, type MemorySpace } from './types'

export async function ensureDefaultSpaces(userId: string): Promise<void> {
  const supabase = createServiceRoleClient()

  const { count } = await supabase
    .from('memory_spaces')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)

  if ((count || 0) > 0) return

  const rows = DEFAULT_SPACES.map((space) => ({
    user_id: userId,
    name: space.name,
    slug: space.slug,
    description: space.description,
    icon: space.icon,
  }))

  await supabase.from('memory_spaces').insert(rows)
}

export async function resolveSpaceId(
  userId: string,
  slug: string
): Promise<string | null> {
  const supabase = createServiceRoleClient()

  const { data } = await supabase
    .from('memory_spaces')
    .select('id')
    .eq('user_id', userId)
    .eq('slug', slug)
    .maybeSingle()

  return data?.id ?? null
}

export async function createSpace(
  userId: string,
  name: string,
  slug: string,
  description?: string,
  icon?: string
): Promise<MemorySpace> {
  const supabase = createServiceRoleClient()

  const { data, error } = await supabase
    .from('memory_spaces')
    .insert({
      user_id: userId,
      name: name.trim(),
      slug,
      description: description?.trim() || null,
      icon: icon || '🧠',
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to create space: ${error.message}`)
  return data as MemorySpace
}

export async function listSpaces(userId: string): Promise<MemorySpace[]> {
  const supabase = createServiceRoleClient()

  const { data } = await supabase
    .from('memory_spaces')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  return (data ?? []) as MemorySpace[]
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add lib/memory/spaces.ts
git commit -m "feat: add memory space management with auto-seed"
```

---

### Task 4: Memory Item CRUD Operations

**Files:**
- Create: `lib/memory/items.ts`

- [ ] **Step 1: Create items module**

Create `lib/memory/items.ts`:

```typescript
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { generateEmbedding } from '@/lib/documents/embed'
import { ensureDefaultSpaces, resolveSpaceId } from './spaces'
import type { MemoryItem, MemoryCategory } from './types'

export async function saveMemory(params: {
  userId: string
  spaceSlug: string
  title: string
  content: string
  category: MemoryCategory
  tags: string[]
  project?: string
}): Promise<MemoryItem> {
  const { userId, spaceSlug, title, content, category, tags, project } = params

  await ensureDefaultSpaces(userId)

  const spaceId = await resolveSpaceId(userId, spaceSlug)
  if (!spaceId) throw new Error(`Space "${spaceSlug}" not found`)

  const embeddingText = `${title}\n\n${content}`
  const embedding = await generateEmbedding(embeddingText)

  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('memory_items')
    .insert({
      space_id: spaceId,
      user_id: userId,
      title: title.trim(),
      content: content.trim(),
      category,
      tags,
      project: project?.trim() || null,
      embedding: JSON.stringify(embedding),
      source: 'manual',
    })
    .select('id, space_id, title, content, category, tags, project, valid_at, source, importance, created_at')
    .single()

  if (error) throw new Error(`Failed to save memory: ${error.message}`)
  return data as MemoryItem
}

export async function searchMemories(params: {
  userId: string
  query: string
  spaceSlug?: string
  category?: string
  project?: string
  limit: number
}): Promise<Array<MemoryItem & { similarity: number; space_slug: string }>> {
  const { userId, query, spaceSlug, category, project, limit } = params

  await ensureDefaultSpaces(userId)

  const queryEmbedding = await generateEmbedding(query)

  const supabase = createServiceRoleClient()
  const { data, error } = await supabase.rpc('match_memories', {
    query_embedding: JSON.stringify(queryEmbedding),
    filter_user_id: userId,
    filter_space_slug: spaceSlug || null,
    filter_category: category || null,
    filter_project: project || null,
    match_count: limit,
    match_threshold: 0.3,
  })

  if (error) throw new Error(`Search failed: ${error.message}`)

  // Boost importance for retrieved memories
  const ids = (data || []).map((r: { id: string }) => r.id)
  if (ids.length > 0) {
    await supabase.rpc('increment_memory_importance', { memory_ids: ids, boost: 0.1 })
      .then(() => {}) // fire-and-forget, don't block search
      .catch(() => {}) // ignore errors
  }

  return (data ?? []) as Array<MemoryItem & { similarity: number; space_slug: string }>
}

export async function listMemories(params: {
  userId: string
  spaceSlug?: string
  category?: string
  project?: string
  tag?: string
  limit: number
  offset: number
}): Promise<MemoryItem[]> {
  const { userId, spaceSlug, category, project, tag, limit, offset } = params

  await ensureDefaultSpaces(userId)

  const supabase = createServiceRoleClient()
  let query = supabase
    .from('memory_items')
    .select('*, memory_spaces!inner(slug)')
    .eq('user_id', userId)
    .eq('is_active', true)
    .is('invalid_at', null)
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (spaceSlug) {
    query = query.eq('memory_spaces.slug', spaceSlug)
  }
  if (category) {
    query = query.eq('category', category)
  }
  if (project) {
    query = query.eq('project', project)
  }
  if (tag) {
    query = query.contains('tags', [tag])
  }

  const { data } = await query
  return (data ?? []) as MemoryItem[]
}

export async function getMemory(
  userId: string,
  memoryId: string
): Promise<MemoryItem | null> {
  const supabase = createServiceRoleClient()

  const { data } = await supabase
    .from('memory_items')
    .select('*')
    .eq('id', memoryId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle()

  return data as MemoryItem | null
}

export async function updateMemory(params: {
  userId: string
  memoryId: string
  title?: string
  content?: string
  category?: MemoryCategory
  tags?: string[]
  project?: string | null
  spaceSlug?: string
}): Promise<MemoryItem> {
  const { userId, memoryId, title, content, category, tags, project, spaceSlug } = params

  const supabase = createServiceRoleClient()

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (title !== undefined) updates.title = title.trim()
  if (content !== undefined) updates.content = content.trim()
  if (category !== undefined) updates.category = category
  if (tags !== undefined) updates.tags = tags
  if (project !== undefined) updates.project = project?.trim() || null

  // Move to different space
  if (spaceSlug) {
    const spaceId = await resolveSpaceId(userId, spaceSlug)
    if (!spaceId) throw new Error(`Space "${spaceSlug}" not found`)
    updates.space_id = spaceId
  }

  // Re-generate embedding if title or content changed
  if (title !== undefined || content !== undefined) {
    const existing = await getMemory(userId, memoryId)
    if (!existing) throw new Error('Memory not found')

    const newTitle = title ?? existing.title
    const newContent = content ?? existing.content
    const embedding = await generateEmbedding(`${newTitle}\n\n${newContent}`)
    updates.embedding = JSON.stringify(embedding)
  }

  const { data, error } = await supabase
    .from('memory_items')
    .update(updates)
    .eq('id', memoryId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .select()
    .single()

  if (error) throw new Error(`Update failed: ${error.message}`)
  return data as MemoryItem
}

export async function deleteMemory(
  userId: string,
  memoryId: string
): Promise<void> {
  const supabase = createServiceRoleClient()

  const { error } = await supabase
    .from('memory_items')
    .update({
      is_active: false,
      invalid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', memoryId)
    .eq('user_id', userId)

  if (error) throw new Error(`Delete failed: ${error.message}`)
}

export async function getContext(
  userId: string,
  project: string
): Promise<MemoryItem[]> {
  const supabase = createServiceRoleClient()

  const { data } = await supabase
    .from('memory_items')
    .select('*')
    .eq('user_id', userId)
    .eq('project', project)
    .eq('is_active', true)
    .is('invalid_at', null)
    .order('category', { ascending: true })
    .order('importance', { ascending: false })

  return (data ?? []) as MemoryItem[]
}

export async function getRules(
  userId: string,
  project?: string
): Promise<MemoryItem[]> {
  const supabase = createServiceRoleClient()

  let query = supabase
    .from('memory_items')
    .select('*')
    .eq('user_id', userId)
    .eq('category', 'rule')
    .eq('is_active', true)
    .is('invalid_at', null)
    .order('importance', { ascending: false })

  if (project) {
    query = query.eq('project', project)
  }

  const { data } = await query
  return (data ?? []) as MemoryItem[]
}
```

- [ ] **Step 2: Add the importance increment RPC to the migration**

Add to `007_memory_vaults.sql` (before the closing):

```sql
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
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add lib/memory/items.ts supabase/migrations/007_memory_vaults.sql
git commit -m "feat: add memory item CRUD with semantic search"
```

---

### Task 5: MCP Tool Registration

**Files:**
- Create: `lib/mcp/tools/memory.ts`
- Modify: `lib/mcp/server.ts`

- [ ] **Step 1: Create memory tools file**

Create `lib/mcp/tools/memory.ts`:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { toIST } from '@/types'
import {
  saveMemory,
  searchMemories,
  listMemories,
  getMemory,
  updateMemory,
  deleteMemory,
  getContext,
  getRules,
} from '@/lib/memory/items'
import { createSpace, listSpaces } from '@/lib/memory/spaces'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { MemoryCategoryEnum } from '@/lib/memory/types'

function logAccess(userId: string, action: string, toolName: string, query?: string, memoryIds?: string[]) {
  const supabase = createServiceRoleClient()
  supabase
    .from('memory_access_log')
    .insert({
      user_id: userId,
      action,
      tool_name: toolName,
      query: query || null,
      memory_ids: memoryIds || null,
    })
    .then(() => {})
    .catch(() => {})
}

export function registerMemoryTools(server: McpServer) {

  // ── save_memory ──────────────────────────────────────────

  server.tool(
    'save_memory',
    'Store a new memory with content, category, tags, and optional project scope.',
    {
      space: z.string().min(1).default('personal').describe('Space slug (default: "personal")'),
      title: z.string().min(1).max(255).describe('Memory title'),
      content: z.string().min(1).max(10000).describe('Memory content — the knowledge to store'),
      category: MemoryCategoryEnum.default('note').describe('Category (default: note)'),
      tags: z.array(z.string()).default([]).describe('Tags for organizing'),
      project: z.string().optional().describe('Optional project scope'),
    },
    async ({ space, title, content, category, tags, project }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      try {
        const memory = await saveMemory({
          userId,
          spaceSlug: space,
          title,
          content,
          category,
          tags,
          project,
        })

        logAccess(userId, 'save', 'save_memory', title, [memory.id])

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              memory_id: memory.id,
              title: memory.title,
              category: memory.category,
              space,
              project: memory.project,
              created_at: toIST(new Date(memory.created_at)),
            }),
          }],
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true }
      }
    }
  )

  // ── search_memory ────────────────────────────────────────

  server.tool(
    'search_memory',
    'Semantic search across all memories using natural language query. Uses AI-powered vector similarity.',
    {
      query: z.string().min(1).max(500).describe('Natural language search query'),
      space: z.string().optional().describe('Filter by space slug'),
      category: MemoryCategoryEnum.optional().describe('Optional category filter'),
      project: z.string().optional().describe('Optional project filter'),
      limit: z.number().int().min(1).max(20).default(5).describe('Max results (default: 5)'),
    },
    async ({ query, space, category, project, limit }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      try {
        const results = await searchMemories({
          userId,
          query,
          spaceSlug: space,
          category,
          project,
          limit,
        })

        logAccess(userId, 'search', 'search_memory', query, results.map(r => r.id))

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              results: results.map((r) => ({
                id: r.id,
                title: r.title,
                content: r.content,
                category: r.category,
                tags: r.tags,
                project: r.project,
                space: r.space_slug,
                similarity: Math.round(r.similarity * 1000) / 1000,
              })),
              count: results.length,
            }),
          }],
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true }
      }
    }
  )

  // ── list_memories ────────────────────────────────────────

  server.tool(
    'list_memories',
    'Browse memories by category, tags, project, or date range.',
    {
      space: z.string().optional().describe('Filter by space slug'),
      category: MemoryCategoryEnum.optional().describe('Filter by category'),
      project: z.string().optional().describe('Filter by project'),
      tag: z.string().optional().describe('Filter by tag'),
      limit: z.number().int().min(1).max(50).default(20).describe('Max results (default: 20)'),
      offset: z.number().int().min(0).default(0).describe('Offset for pagination'),
    },
    async ({ space, category, project, tag, limit, offset }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      try {
        const memories = await listMemories({
          userId,
          spaceSlug: space,
          category,
          project,
          tag,
          limit,
          offset,
        })

        logAccess(userId, 'list', 'list_memories')

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              memories: memories.map((m) => ({
                id: m.id,
                title: m.title,
                content: m.content,
                category: m.category,
                tags: m.tags,
                project: m.project,
                updated_at: toIST(new Date(m.updated_at)),
              })),
              count: memories.length,
            }),
          }],
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true }
      }
    }
  )

  // ── get_memory ───────────────────────────────────────────

  server.tool(
    'get_memory',
    'Retrieve a specific memory by ID.',
    {
      memory_id: z.string().uuid().describe('UUID of the memory'),
    },
    async ({ memory_id }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      const memory = await getMemory(userId, memory_id)
      if (!memory) {
        return { content: [{ type: 'text' as const, text: 'Error: Memory not found' }], isError: true }
      }

      logAccess(userId, 'get', 'get_memory', undefined, [memory_id])

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            id: memory.id,
            title: memory.title,
            content: memory.content,
            category: memory.category,
            tags: memory.tags,
            project: memory.project,
            valid_at: toIST(new Date(memory.valid_at)),
            source: memory.source,
            importance: memory.importance,
            created_at: toIST(new Date(memory.created_at)),
            updated_at: toIST(new Date(memory.updated_at)),
          }),
        }],
      }
    }
  )

  // ── update_memory ────────────────────────────────────────

  server.tool(
    'update_memory',
    'Modify title, content, tags, or category of an existing memory. PATCH semantics — omitted fields are left unchanged.',
    {
      memory_id: z.string().uuid().describe('UUID of the memory'),
      title: z.string().min(1).max(255).optional().describe('New title'),
      content: z.string().min(1).max(10000).optional().describe('New content'),
      category: MemoryCategoryEnum.optional().describe('New category'),
      tags: z.array(z.string()).optional().describe('New tags (replaces existing)'),
      project: z.string().nullable().optional().describe('New project or null to clear'),
      space: z.string().optional().describe('Move to different space (by slug)'),
    },
    async ({ memory_id, title, content, category, tags, project, space }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      try {
        const updated = await updateMemory({
          userId,
          memoryId: memory_id,
          title,
          content,
          category,
          tags,
          project,
          spaceSlug: space,
        })

        logAccess(userId, 'update', 'update_memory', undefined, [memory_id])

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              memory_id: updated.id,
              title: updated.title,
              category: updated.category,
              updated_at: toIST(new Date(updated.updated_at)),
            }),
          }],
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true }
      }
    }
  )

  // ── delete_memory ────────────────────────────────────────

  server.tool(
    'delete_memory',
    'Remove a memory (soft delete — sets is_active=false and invalid_at=now).',
    {
      memory_id: z.string().uuid().describe('UUID of the memory to delete'),
    },
    async ({ memory_id }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      try {
        await deleteMemory(userId, memory_id)
        logAccess(userId, 'delete', 'delete_memory', undefined, [memory_id])

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ deleted: true, memory_id }),
          }],
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true }
      }
    }
  )

  // ── get_context ──────────────────────────────────────────

  server.tool(
    'get_context',
    'Fetch all memories for a specific project — instant project onboarding.',
    {
      project: z.string().min(1).describe('Project name to get context for'),
    },
    async ({ project }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      const memories = await getContext(userId, project)
      logAccess(userId, 'get_context', 'get_context', project, memories.map(m => m.id))

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            project,
            memories: memories.map((m) => ({
              id: m.id,
              title: m.title,
              content: m.content,
              category: m.category,
              tags: m.tags,
            })),
            count: memories.length,
          }),
        }],
      }
    }
  )

  // ── get_rules ────────────────────────────────────────────

  server.tool(
    'get_rules',
    'Fetch all rule-category memories — shortcut for .claude.md style rules. Optionally filter by project.',
    {
      project: z.string().optional().describe('Optional project to scope rules to'),
    },
    async ({ project }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      const rules = await getRules(userId, project)
      logAccess(userId, 'get_rules', 'get_rules', project)

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            rules: rules.map((r) => ({
              id: r.id,
              title: r.title,
              content: r.content,
              project: r.project,
              tags: r.tags,
            })),
            count: rules.length,
          }),
        }],
      }
    }
  )

  // ── create_space ─────────────────────────────────────────

  server.tool(
    'create_space',
    'Create a new memory space (vault) for organizing memories.',
    {
      name: z.string().min(1).max(100).describe('Space display name'),
      slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/).describe('URL-safe slug (lowercase, hyphens only)'),
      description: z.string().max(500).optional().describe('Space description'),
      icon: z.string().max(10).default('🧠').describe('Emoji icon'),
    },
    async ({ name, slug, description, icon }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      try {
        const space = await createSpace(userId, name, slug, description, icon)
        logAccess(userId, 'create_space', 'create_space', name)

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              space_id: space.id,
              name: space.name,
              slug: space.slug,
              icon: space.icon,
              created_at: toIST(new Date(space.created_at)),
            }),
          }],
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true }
      }
    }
  )

  // ── list_spaces ──────────────────────────────────────────

  server.tool(
    'list_spaces',
    'List all memory spaces for the authenticated user.',
    {},
    async (_params, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      const spaces = await listSpaces(userId)
      logAccess(userId, 'list_spaces', 'list_spaces')

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            spaces: spaces.map((s) => ({
              id: s.id,
              name: s.name,
              slug: s.slug,
              description: s.description,
              icon: s.icon,
            })),
            count: spaces.length,
          }),
        }],
      }
    }
  )
}
```

- [ ] **Step 2: Register memory tools in the MCP server**

Edit `lib/mcp/server.ts` — add import and registration:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerHabitTools } from '@/lib/mcp/tools/habits'
import { registerTaskTools } from '@/lib/mcp/tools/tasks'
import { registerDocumentTools } from '@/lib/mcp/tools/documents'
import { registerFinanceTools } from '@/lib/mcp/tools/finance'
import { registerGoalTools } from '@/lib/mcp/tools/goals'
import { registerMemoryTools } from '@/lib/mcp/tools/memory'
import { registerWidgetResources } from '@/lib/mcp/widgets'

export function createMcpServer() {
  const server = new McpServer({
    name: 'pa-mcp',
    version: '0.1.0',
  })

  registerHabitTools(server)
  registerTaskTools(server)
  registerDocumentTools(server)
  registerFinanceTools(server)
  registerGoalTools(server)
  registerMemoryTools(server)
  registerWidgetResources(server)

  return server
}
```

- [ ] **Step 3: Verify build passes**

Run: `npm run build`

Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/mcp/tools/memory.ts lib/mcp/server.ts
git commit -m "feat: register 10 memory vault MCP tools"
```

---

### Task 6: Dashboard Memory Page

**Files:**
- Create: `app/dashboard/memory/page.tsx`

- [ ] **Step 1: Create the memory dashboard page**

Create `app/dashboard/memory/page.tsx`:

```tsx
'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'

interface MemorySpace {
  id: string
  name: string
  slug: string
  description: string | null
  icon: string
}

interface MemoryItem {
  id: string
  space_id: string
  title: string
  content: string
  category: string
  tags: string[]
  project: string | null
  importance: number
  created_at: string
  updated_at: string
}

const CATEGORIES = ['all', 'preference', 'rule', 'project', 'decision', 'context', 'snippet', 'note', 'persona'] as const

export default function MemoryPage() {
  const [spaces, setSpaces] = useState<MemorySpace[]>([])
  const [memories, setMemories] = useState<MemoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [activeSpace, setActiveSpace] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingMemory, setEditingMemory] = useState<MemoryItem | null>(null)

  // Form state
  const [formTitle, setFormTitle] = useState('')
  const [formContent, setFormContent] = useState('')
  const [formCategory, setFormCategory] = useState<string>('note')
  const [formTags, setFormTags] = useState('')
  const [formProject, setFormProject] = useState('')
  const [formSpace, setFormSpace] = useState('')
  const [saving, setSaving] = useState(false)

  const loadData = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    // Load spaces
    const { data: spacesData } = await supabase
      .from('memory_spaces')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })

    const spacesList = (spacesData ?? []) as MemorySpace[]
    setSpaces(spacesList)

    // Set default active space
    if (!activeSpace && spacesList.length > 0) {
      setActiveSpace(spacesList[0].slug)
    }

    // Load memories
    let query = supabase
      .from('memory_items')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .is('invalid_at', null)
      .order('updated_at', { ascending: false })
      .limit(50)

    if (activeSpace) {
      const space = spacesList.find(s => s.slug === activeSpace)
      if (space) query = query.eq('space_id', space.id)
    }
    if (activeCategory !== 'all') {
      query = query.eq('category', activeCategory)
    }

    const { data: memoriesData } = await query
    setMemories((memoriesData ?? []) as MemoryItem[])
    setLoading(false)
  }, [activeSpace, activeCategory])

  useEffect(() => { loadData() }, [loadData])

  const handleSave = async () => {
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    const tags = formTags.split(',').map(t => t.trim()).filter(Boolean)
    const spaceSlug = formSpace || activeSpace || 'personal'
    const space = spaces.find(s => s.slug === spaceSlug)

    if (editingMemory) {
      await supabase
        .from('memory_items')
        .update({
          title: formTitle.trim(),
          content: formContent.trim(),
          category: formCategory,
          tags,
          project: formProject.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingMemory.id)
    } else {
      await supabase
        .from('memory_items')
        .insert({
          space_id: space?.id,
          user_id: user.id,
          title: formTitle.trim(),
          content: formContent.trim(),
          category: formCategory,
          tags,
          project: formProject.trim() || null,
        })
    }

    resetForm()
    setSaving(false)
    loadData()
  }

  const handleDelete = async (id: string) => {
    const supabase = createClient()
    await supabase
      .from('memory_items')
      .update({ is_active: false, invalid_at: new Date().toISOString() })
      .eq('id', id)
    loadData()
  }

  const openEdit = (memory: MemoryItem) => {
    setEditingMemory(memory)
    setFormTitle(memory.title)
    setFormContent(memory.content)
    setFormCategory(memory.category)
    setFormTags(memory.tags.join(', '))
    setFormProject(memory.project || '')
    setShowCreateModal(true)
  }

  const resetForm = () => {
    setShowCreateModal(false)
    setEditingMemory(null)
    setFormTitle('')
    setFormContent('')
    setFormCategory('note')
    setFormTags('')
    setFormProject('')
    setFormSpace('')
  }

  const filtered = searchQuery
    ? memories.filter(m =>
        m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.project?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : memories

  if (loading) {
    return (
      <div className="max-w-4xl animate-pulse space-y-4">
        <div className="h-8 w-48 rounded-lg bg-white/[0.06]" />
        <div className="h-64 rounded-2xl bg-white/[0.06]" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text-primary">Memory Vaults</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="rounded-lg bg-neon/[0.15] px-3 py-1.5 text-xs font-medium text-neon transition-all hover:bg-neon/[0.25]"
        >
          + New Memory
        </button>
      </div>

      {/* Space tabs */}
      <div className="mb-4 flex gap-2 overflow-x-auto">
        {spaces.map((space) => (
          <button
            key={space.slug}
            onClick={() => setActiveSpace(space.slug)}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              activeSpace === space.slug
                ? 'bg-neon/[0.1] text-neon'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            <span>{space.icon}</span>
            {space.name}
          </button>
        ))}
      </div>

      {/* Category filter */}
      <div className="mb-4 flex gap-1.5 overflow-x-auto">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`rounded-md px-2 py-1 text-[10px] font-medium capitalize transition-all ${
              activeCategory === cat
                ? 'bg-white/[0.1] text-text-primary'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="mb-6">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search memories..."
          className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-neon/30 focus:outline-none"
        />
      </div>

      {/* Memory list */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.06] p-12 text-center">
          <p className="text-sm text-text-muted">No memories yet.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          <AnimatePresence mode="popLayout">
            {filtered.map((memory) => (
              <motion.div
                key={memory.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="group rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 transition-all hover:border-white/[0.1]"
              >
                <div className="mb-2 flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-text-primary">{memory.title}</h3>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-text-muted capitalize">
                        {memory.category}
                      </span>
                      {memory.project && (
                        <span className="rounded-md bg-neon/[0.08] px-1.5 py-0.5 text-[10px] text-neon">
                          {memory.project}
                        </span>
                      )}
                      {memory.tags.map((tag) => (
                        <span key={tag} className="text-[10px] text-text-muted">#{tag}</span>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => openEdit(memory)}
                      className="rounded-md p-1 text-text-muted hover:bg-white/[0.06] hover:text-text-primary"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDelete(memory.id)}
                      className="rounded-md p-1 text-text-muted hover:bg-red-500/[0.1] hover:text-red-400"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
                <p className="line-clamp-3 text-xs leading-relaxed text-text-secondary">
                  {memory.content}
                </p>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Create/Edit Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) resetForm() }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-lg rounded-2xl border border-white/[0.08] bg-[#0f0f14] p-6"
            >
              <h2 className="mb-4 text-sm font-semibold text-text-primary">
                {editingMemory ? 'Edit Memory' : 'New Memory'}
              </h2>

              <div className="space-y-3">
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Title"
                  className="w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-neon/30 focus:outline-none"
                />

                <textarea
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                  placeholder="Content — the knowledge to store"
                  rows={5}
                  className="w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-neon/30 focus:outline-none"
                />

                <div className="grid grid-cols-2 gap-3">
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-text-primary focus:border-neon/30 focus:outline-none"
                  >
                    {CATEGORIES.filter(c => c !== 'all').map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>

                  {!editingMemory && (
                    <select
                      value={formSpace}
                      onChange={(e) => setFormSpace(e.target.value)}
                      className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-text-primary focus:border-neon/30 focus:outline-none"
                    >
                      {spaces.map((s) => (
                        <option key={s.slug} value={s.slug}>{s.icon} {s.name}</option>
                      ))}
                    </select>
                  )}
                </div>

                <input
                  type="text"
                  value={formProject}
                  onChange={(e) => setFormProject(e.target.value)}
                  placeholder="Project (optional)"
                  className="w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-neon/30 focus:outline-none"
                />

                <input
                  type="text"
                  value={formTags}
                  onChange={(e) => setFormTags(e.target.value)}
                  placeholder="Tags (comma separated)"
                  className="w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-neon/30 focus:outline-none"
                />
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={resetForm}
                  className="rounded-lg px-3 py-1.5 text-xs text-text-muted hover:text-text-primary"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !formTitle.trim() || !formContent.trim()}
                  className="rounded-lg bg-neon/[0.15] px-4 py-1.5 text-xs font-medium text-neon transition-all hover:bg-neon/[0.25] disabled:opacity-40"
                >
                  {saving ? 'Saving...' : editingMemory ? 'Update' : 'Save'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
```

- [ ] **Step 2: Add Memory link to the dashboard sidebar**

Find the sidebar component (likely in `app/dashboard/layout.tsx` or a shared component) and add the Memory nav item alongside Habits, Tasks, Finance, Documents, Goals. Use icon `🧠` and path `/dashboard/memory`.

- [ ] **Step 3: Verify the page renders**

Run: `npm run dev`

Navigate to `http://localhost:3000/dashboard/memory`. Expected: Page loads with space tabs, category filters, search bar, and "No memories yet" state.

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/memory/page.tsx
git commit -m "feat: add memory vaults dashboard page"
```

---

### Task 7: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add Memory Vaults section to CLAUDE.md**

Add under the existing MCP Tools section:

```markdown
### Memory Tools (10)

| Tool | Description |
|------|-------------|
| `save_memory` | Store a new memory with category, tags, project scope |
| `search_memory` | Semantic search across memories (vector similarity) |
| `list_memories` | Browse with filters (space, category, project, tag) |
| `get_memory` | Get by ID |
| `update_memory` | PATCH semantics update |
| `delete_memory` | Soft delete (is_active=false, invalid_at=now) |
| `get_context` | All memories for a project — instant onboarding |
| `get_rules` | All rule-category memories |
| `create_space` | Create new memory space/vault |
| `list_spaces` | List all spaces |
```

Add under Database Schema:

```markdown
### Memory Vault Tables
- **memory_spaces** — user-created vaults (name, slug, icon, settings)
- **memory_items** — title, content, category, tags, project, embedding (vector 1536), temporal fields (valid_at, invalid_at), importance score, soft delete
- **memory_access_log** — action, tool_name, query, memory_ids
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add memory vaults to CLAUDE.md"
```

---

### Task 8: Build Verification & Smoke Test

**Files:** None (verification only)

- [ ] **Step 1: Run full build**

Run: `npm run build`

Expected: Build succeeds with all routes compiled. New route `/dashboard/memory` should appear in the output.

- [ ] **Step 2: Verify migration applied**

Check Supabase Dashboard:
- `memory_spaces` table exists with columns: id, user_id, name, slug, description, icon, settings
- `memory_items` table exists with vector(1536) embedding column
- `memory_access_log` table exists
- `match_memories` function exists
- `increment_memory_importance` function exists
- RLS enabled on all 3 tables

- [ ] **Step 3: Test MCP tools via Claude.ai**

Connect to PA MCP and test:
1. `list_spaces` — should return empty (no spaces yet)
2. `save_memory` with title "Test", content "Testing memory vaults" — should auto-create default spaces and save
3. `list_spaces` — should show Personal and Projects
4. `search_memory` with query "testing" — should return the test memory
5. `get_context` with project "test" — should return empty (no project scoped memories)
6. `delete_memory` with the test memory ID — should soft delete

- [ ] **Step 4: Test dashboard**

1. Navigate to `/dashboard/memory`
2. Verify space tabs show (Personal, Projects)
3. Create a memory via the modal
4. Verify it appears in the list
5. Edit the memory
6. Delete the memory (should disappear)

- [ ] **Step 5: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: memory vaults smoke test fixes"
```
