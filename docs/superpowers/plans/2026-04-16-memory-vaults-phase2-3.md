# Memory Vaults Phase 2 & 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add duplicate detection on save, hybrid search (semantic + keyword + importance), stale memory hints, a consolidate tool, and 3 interactive HTML widgets to the existing memory vault module.

**Architecture:** Phase 2 modifies `saveMemory()` to check for similar memories (>0.90 cosine similarity) before inserting, returning matches for the client AI to decide. Phase 3 adds a PostgreSQL `tsvector` column + `pa_hybrid_search()` RPC for combined scoring, a `computeStaleHint()` helper for flagging old low-importance memories, a `consolidate_memories` MCP tool for on-demand cleanup, and 3 ExtApps HTML widgets for rich rendering.

**Tech Stack:** Next.js, Supabase (PostgreSQL + pgvector), MCP SDK (`@modelcontextprotocol/sdk`, `@modelcontextprotocol/ext-apps`), Zod 4, Vitest, TypeScript

---

## File Structure

| File | Responsibility |
|------|---------------|
| `lib/memory/types.ts` | Add `force` to SaveMemorySchema, add ConsolidateMemoriesSchema |
| `lib/memory/items.ts` | Duplicate check in saveMemory(), switch searchMemories() to hybrid, add staleHint, add consolidateMemories() |
| `lib/mcp/tools/memory.ts` | Update save_memory handler, switch search_memory/get_context to registerAppTool, add consolidate_memories tool |
| `lib/mcp/widgets.ts` | Register 3 new widget resources + WIDGET_URIS |
| `widgets/memory-search.html` | Search results + duplicate detection card UI |
| `widgets/memory-consolidator.html` | Duplicate groups + stale memory review UI |
| `widgets/memory-context.html` | Project context grouped by category |
| `supabase/migrations/008_memory_hybrid_search.sql` | search_vector tsvector column, trigger, GIN index, pa_hybrid_search() RPC |
| `tests/mcp/tools/memory-save-dedup.test.ts` | Tests for duplicate detection on save |
| `tests/mcp/tools/memory-hybrid-search.test.ts` | Tests for hybrid search + stale hints |
| `tests/mcp/tools/memory-consolidate.test.ts` | Tests for consolidate_memories tool |
| `tests/mcp/tools/widgets/memory-search.test.ts` | Widget registration + content shape tests |
| `tests/mcp/tools/widgets/memory-consolidator.test.ts` | Widget registration + content shape tests |
| `tests/mcp/tools/widgets/memory-context.test.ts` | Widget registration + content shape tests |

---

### Task 1: Database Migration — tsvector + pa_hybrid_search()

**Files:**
- Create: `supabase/migrations/008_memory_hybrid_search.sql`

- [ ] **Step 1: Create migration file**

```sql
-- 008_memory_hybrid_search.sql
-- Adds full-text search column + hybrid search RPC for memory vaults

-- ── tsvector column ───────────────────────────────────────
ALTER TABLE pa_memory_items
  ADD COLUMN search_vector tsvector;

-- Populate existing rows
UPDATE pa_memory_items
SET search_vector = to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, ''));

-- Auto-update trigger on INSERT or UPDATE of title/content
CREATE OR REPLACE FUNCTION pa_memory_search_vector_trigger()
RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english', coalesce(NEW.title, '') || ' ' || coalesce(NEW.content, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_pa_memory_search_vector
  BEFORE INSERT OR UPDATE OF title, content
  ON pa_memory_items
  FOR EACH ROW
  EXECUTE FUNCTION pa_memory_search_vector_trigger();

-- GIN index for fast keyword lookups
CREATE INDEX idx_pa_memory_items_search_vector
  ON pa_memory_items USING gin(search_vector);

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
  ts_query := plainto_tsquery('english', query_text);

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
    AND (filter_space_slug IS NULL OR ms.slug = filter_space_slug)
    AND (filter_category IS NULL OR mi.category = filter_category)
    AND (filter_project IS NULL OR mi.project = filter_project)
    AND (
      (1 - (mi.embedding <=> query_embedding)) > 0.3
      OR mi.search_vector @@ ts_query
    )
  ORDER BY final_score DESC
  LIMIT match_count;
END;
$$;
```

- [ ] **Step 2: Apply migration to Supabase**

Run: `npx supabase db push` (or apply via Supabase dashboard SQL editor)

Expected: Migration applies without errors. `pa_memory_items` now has `search_vector` column. `pa_hybrid_search()` function is available.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/008_memory_hybrid_search.sql
git commit -m "feat(memory): add tsvector column + pa_hybrid_search RPC for hybrid retrieval"
```

---

### Task 2: Schema Changes — force param + ConsolidateMemoriesSchema

**Files:**
- Modify: `lib/memory/types.ts`

- [ ] **Step 1: Write test for SaveMemorySchema accepting force param**

Create `tests/memory/types-phase2.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { SaveMemorySchema, ConsolidateMemoriesSchema } from '@/lib/memory/types'

describe('SaveMemorySchema — force param', () => {
  it('should accept force: true', () => {
    const result = SaveMemorySchema.safeParse({
      title: 'Test',
      content: 'Test content',
      force: true,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.force).toBe(true)
    }
  })

  it('should default force to false', () => {
    const result = SaveMemorySchema.safeParse({
      title: 'Test',
      content: 'Test content',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.force).toBe(false)
    }
  })
})

describe('ConsolidateMemoriesSchema', () => {
  it('should accept mode: duplicates', () => {
    const result = ConsolidateMemoriesSchema.safeParse({ mode: 'duplicates' })
    expect(result.success).toBe(true)
  })

  it('should accept mode: stale', () => {
    const result = ConsolidateMemoriesSchema.safeParse({ mode: 'stale' })
    expect(result.success).toBe(true)
  })

  it('should accept mode: both', () => {
    const result = ConsolidateMemoriesSchema.safeParse({ mode: 'both' })
    expect(result.success).toBe(true)
  })

  it('should default mode to both', () => {
    const result = ConsolidateMemoriesSchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.mode).toBe('both')
    }
  })

  it('should accept optional space slug', () => {
    const result = ConsolidateMemoriesSchema.safeParse({ space: 'personal', mode: 'stale' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.space).toBe('personal')
    }
  })

  it('should reject invalid mode', () => {
    const result = ConsolidateMemoriesSchema.safeParse({ mode: 'invalid' })
    expect(result.success).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/memory/types-phase2.test.ts`

Expected: FAIL — `force` not in SaveMemorySchema, `ConsolidateMemoriesSchema` not exported.

- [ ] **Step 3: Add force param to SaveMemorySchema and create ConsolidateMemoriesSchema**

In `lib/memory/types.ts`, change the `SaveMemorySchema` definition (line 19-26):

```typescript
export const SaveMemorySchema = z.object({
  space: z.string().min(1).default('personal').describe('Space slug (default: "personal")'),
  title: z.string().min(1).max(255).describe('Memory title'),
  content: z.string().min(1).max(10000).describe('Memory content — the knowledge to store'),
  category: MemoryCategoryEnum.default('note').describe('Category (default: note)'),
  tags: z.array(z.string()).default([]).describe('Tags for organizing'),
  project: z.string().optional().describe('Optional project scope (e.g., "memory-mcp", "apmt-pricing")'),
  force: z.boolean().default(false).describe('Skip duplicate check and save directly'),
})
```

After the `CreateSpaceSchema` (after line 76), add:

```typescript
export const ConsolidateMemoriesSchema = z.object({
  space: z.string().optional().describe('Limit to a specific space (by slug)'),
  mode: z.enum(['duplicates', 'stale', 'both']).default('both').describe('What to look for: duplicates, stale, or both'),
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/memory/types-phase2.test.ts`

Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/memory/types.ts tests/memory/types-phase2.test.ts
git commit -m "feat(memory): add force param to SaveMemorySchema + ConsolidateMemoriesSchema"
```

---

### Task 3: Duplicate Detection in saveMemory()

**Files:**
- Modify: `lib/memory/items.ts`
- Create: `tests/mcp/tools/memory-save-dedup.test.ts`

- [ ] **Step 1: Write test for duplicate detection**

Create `tests/mcp/tools/memory-save-dedup.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/documents/embed', () => ({
  generateEmbedding: vi.fn().mockResolvedValue(new Array(1536).fill(0.1)),
}))

vi.mock('@/lib/memory/spaces', () => ({
  ensureDefaultSpaces: vi.fn(),
  resolveSpaceId: vi.fn().mockResolvedValue('space-001'),
}))

const mockRpc = vi.fn()
const mockInsert = vi.fn()

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: vi.fn().mockReturnValue({
      insert: mockInsert.mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'mem-new',
              space_id: 'space-001',
              user_id: 'user-1',
              title: 'New memory',
              content: 'New content',
              category: 'note',
              tags: [],
              project: null,
              valid_at: '2026-04-16T00:00:00Z',
              invalid_at: null,
              source: 'manual',
              importance: 0,
              parent_id: null,
              is_active: true,
              created_at: '2026-04-16T00:00:00Z',
              updated_at: '2026-04-16T00:00:00Z',
            },
            error: null,
          }),
        }),
      }),
    }),
    rpc: mockRpc,
  })),
}))

import { saveMemory } from '@/lib/memory/items'

describe('saveMemory — duplicate detection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return duplicates_found when similar memories exist and force=false', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          id: 'mem-existing',
          title: 'Existing memory',
          content: 'Similar content',
          category: 'note',
          similarity: 0.95,
          updated_at: '2026-04-15T00:00:00Z',
          space_slug: 'personal',
        },
      ],
      error: null,
    })

    const result = await saveMemory({
      userId: 'user-1',
      spaceSlug: 'personal',
      title: 'New memory',
      content: 'New content',
      category: 'note',
      tags: [],
      force: false,
    })

    expect(result).toHaveProperty('status', 'duplicates_found')
    expect(result).toHaveProperty('similar_memories')
    if ('similar_memories' in result) {
      expect(result.similar_memories).toHaveLength(1)
      expect(result.similar_memories[0].id).toBe('mem-existing')
      expect(result.similar_memories[0].similarity).toBe(0.95)
    }
    // Should NOT have inserted
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('should save normally when no duplicates found', async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null })

    const result = await saveMemory({
      userId: 'user-1',
      spaceSlug: 'personal',
      title: 'Unique memory',
      content: 'Unique content',
      category: 'note',
      tags: [],
      force: false,
    })

    expect(result).toHaveProperty('status', 'saved')
    expect(result).toHaveProperty('memory')
    expect(mockInsert).toHaveBeenCalled()
  })

  it('should skip duplicate check when force=true', async () => {
    const result = await saveMemory({
      userId: 'user-1',
      spaceSlug: 'personal',
      title: 'Force save',
      content: 'Force content',
      category: 'note',
      tags: [],
      force: true,
    })

    expect(result).toHaveProperty('status', 'saved')
    expect(mockRpc).not.toHaveBeenCalled()
    expect(mockInsert).toHaveBeenCalled()
  })

  it('should default force to false (backward compatible)', async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null })

    const result = await saveMemory({
      userId: 'user-1',
      spaceSlug: 'personal',
      title: 'No force param',
      content: 'Content',
      category: 'note',
      tags: [],
    })

    expect(result).toHaveProperty('status', 'saved')
    // rpc was called because force defaulted to false
    expect(mockRpc).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/mcp/tools/memory-save-dedup.test.ts`

Expected: FAIL — saveMemory() doesn't accept `force` param, doesn't return `{ status: ... }` shape.

- [ ] **Step 3: Modify saveMemory() to support duplicate detection**

In `lib/memory/items.ts`, replace the `saveMemory` function (lines 6-44):

```typescript
export type SaveMemoryResult =
  | { status: 'saved'; memory: MemoryItem }
  | {
      status: 'duplicates_found'
      pending_memory: { title: string; content: string; category: string; tags: string[]; project: string | null; space: string }
      similar_memories: Array<{ id: string; title: string; content: string; category: string; similarity: number; updated_at: string; space_slug: string }>
      suggestion: string
    }

export async function saveMemory(params: {
  userId: string
  spaceSlug: string
  title: string
  content: string
  category: MemoryCategory
  tags: string[]
  project?: string
  force?: boolean
}): Promise<SaveMemoryResult> {
  const { userId, spaceSlug, title, content, category, tags, project, force = false } = params

  await ensureDefaultSpaces(userId)

  const spaceId = await resolveSpaceId(userId, spaceSlug)
  if (!spaceId) throw new Error(`Space "${spaceSlug}" not found`)

  const embeddingText = `${title}\n\n${content}`
  const embedding = await generateEmbedding(embeddingText)

  // Duplicate check (skip if force=true)
  if (!force) {
    const supabase = createServiceRoleClient()
    const { data: matches, error: matchError } = await supabase.rpc('pa_match_memories', {
      query_embedding: JSON.stringify(embedding),
      filter_user_id: userId,
      filter_space_slug: null,
      filter_category: null,
      filter_project: null,
      match_count: 5,
      match_threshold: 0.90,
    })

    if (!matchError && matches && matches.length > 0) {
      return {
        status: 'duplicates_found',
        pending_memory: { title, content, category, tags, project: project?.trim() || null, space: spaceSlug },
        similar_memories: matches.map((m: { id: string; title: string; content: string; category: string; similarity: number; updated_at: string; space_slug: string }) => ({
          id: m.id,
          title: m.title,
          content: m.content,
          category: m.category,
          similarity: Math.round(m.similarity * 1000) / 1000,
          updated_at: m.updated_at,
          space_slug: m.space_slug,
        })),
        suggestion: `Found ${matches.length} similar memor${matches.length === 1 ? 'y' : 'ies'} (≥90% match). Review before saving. Use force=true to save anyway.`,
      }
    }
  }

  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('pa_memory_items')
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
    .select()
    .single()

  if (error) throw new Error(`Failed to save memory: ${error.message}`)
  return { status: 'saved', memory: data as MemoryItem }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/mcp/tools/memory-save-dedup.test.ts`

Expected: All 4 tests PASS.

- [ ] **Step 5: Run existing tests to check backward compatibility**

Run: `npx vitest run tests/mcp/tools/`

Expected: Existing memory tests may fail since `saveMemory()` now returns `{ status: 'saved', memory: ... }` instead of `MemoryItem` directly. Fix callers in the next task.

- [ ] **Step 6: Commit**

```bash
git add lib/memory/items.ts tests/mcp/tools/memory-save-dedup.test.ts
git commit -m "feat(memory): add duplicate detection on save with force bypass"
```

---

### Task 4: Update save_memory Tool Handler for New Return Shape

**Files:**
- Modify: `lib/mcp/tools/memory.ts` (lines 39-85)

- [ ] **Step 1: Update save_memory tool handler**

In `lib/mcp/tools/memory.ts`, replace the `save_memory` tool registration (lines 39-85):

```typescript
  server.tool(
    'save_memory',
    'Store a new memory with content, category, tags, and optional project scope. Checks for duplicates (≥90% similarity) — pass force=true to skip.',
    {
      space: z.string().min(1).default('personal').describe('Space slug (default: "personal")'),
      title: z.string().min(1).max(255).describe('Memory title'),
      content: z.string().min(1).max(10000).describe('Memory content — the knowledge to store'),
      category: MemoryCategoryEnum.default('note').describe('Category (default: note)'),
      tags: z.array(z.string()).default([]).describe('Tags for organizing'),
      project: z.string().optional().describe('Optional project scope'),
      force: z.boolean().default(false).describe('Skip duplicate check and save directly'),
    },
    async ({ space, title, content, category, tags, project, force }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      try {
        const result = await saveMemory({
          userId,
          spaceSlug: space,
          title,
          content,
          category,
          tags,
          project,
          force,
        })

        if (result.status === 'duplicates_found') {
          logAccess(userId, 'save_duplicates_found', 'save_memory', title, result.similar_memories.map(m => m.id))

          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                status: 'duplicates_found',
                pending_memory: result.pending_memory,
                similar_memories: result.similar_memories,
                suggestion: result.suggestion,
              }),
            }],
          }
        }

        logAccess(userId, 'save', 'save_memory', title, [result.memory.id])

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              status: 'saved',
              memory_id: result.memory.id,
              title: result.memory.title,
              category: result.memory.category,
              space,
              project: result.memory.project,
              created_at: toIST(new Date(result.memory.created_at)),
            }),
          }],
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true }
      }
    }
  )
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run tests/mcp/tools/memory-save-dedup.test.ts`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/mcp/tools/memory.ts
git commit -m "feat(memory): update save_memory handler for duplicate detection response"
```

---

### Task 5: Stale Hints Helper + Integration

**Files:**
- Modify: `lib/memory/items.ts`
- Create: `tests/mcp/tools/memory-hybrid-search.test.ts`

- [ ] **Step 1: Write test for computeStaleHint**

Create `tests/mcp/tools/memory-hybrid-search.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { computeStaleHint } from '@/lib/memory/items'

describe('computeStaleHint', () => {
  it('should return null for fresh high-importance memory', () => {
    const hint = computeStaleHint({
      valid_at: new Date().toISOString(),
      invalid_at: null,
      importance: 5.0,
    })
    expect(hint).toBeNull()
  })

  it('should return stale hint for old low-importance memory', () => {
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

    const hint = computeStaleHint({
      valid_at: sixMonthsAgo.toISOString(),
      invalid_at: null,
      importance: 0.3,
    })
    expect(hint).toContain('months old')
    expect(hint).toContain('low access')
    expect(hint).toContain('0.3')
  })

  it('should return superseded hint when invalid_at is set', () => {
    const hint = computeStaleHint({
      valid_at: new Date().toISOString(),
      invalid_at: new Date().toISOString(),
      importance: 8.0,
    })
    expect(hint).toBe('This memory has been superseded.')
  })

  it('should return null for old but high-importance memory', () => {
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

    const hint = computeStaleHint({
      valid_at: sixMonthsAgo.toISOString(),
      invalid_at: null,
      importance: 5.0,
    })
    expect(hint).toBeNull()
  })

  it('should return null for new low-importance memory (< 90 days)', () => {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const hint = computeStaleHint({
      valid_at: thirtyDaysAgo.toISOString(),
      invalid_at: null,
      importance: 0.1,
    })
    expect(hint).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/mcp/tools/memory-hybrid-search.test.ts`

Expected: FAIL — `computeStaleHint` not exported from `@/lib/memory/items`.

- [ ] **Step 3: Add computeStaleHint to items.ts**

At the end of `lib/memory/items.ts`, add:

```typescript
export function computeStaleHint(memory: { valid_at: string; invalid_at: string | null; importance: number }): string | null {
  if (memory.invalid_at) {
    return 'This memory has been superseded.'
  }

  const now = new Date()
  const validAt = new Date(memory.valid_at)
  const daysSinceValid = Math.floor((now.getTime() - validAt.getTime()) / (1000 * 60 * 60 * 24))

  if (daysSinceValid > 90 && memory.importance < 2.0) {
    const months = Math.floor(daysSinceValid / 30)
    return `This memory is ${months} month${months > 1 ? 's' : ''} old with low access (importance: ${memory.importance.toFixed(1)}). May be outdated.`
  }

  return null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/mcp/tools/memory-hybrid-search.test.ts`

Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/memory/items.ts tests/mcp/tools/memory-hybrid-search.test.ts
git commit -m "feat(memory): add computeStaleHint helper for flagging outdated memories"
```

---

### Task 6: Hybrid Search in searchMemories() + Stale Hints in Responses

**Files:**
- Modify: `lib/memory/items.ts` (searchMemories function, lines 46-86)
- Modify: `lib/memory/items.ts` (listMemories function, lines 88-126)

- [ ] **Step 1: Add hybrid search tests to the test file**

Append to `tests/mcp/tools/memory-hybrid-search.test.ts`:

```typescript
import { vi, beforeEach } from 'vitest'

vi.mock('@/lib/documents/embed', () => ({
  generateEmbedding: vi.fn().mockResolvedValue(new Array(1536).fill(0.1)),
}))

vi.mock('@/lib/memory/spaces', () => ({
  ensureDefaultSpaces: vi.fn(),
  resolveSpaceId: vi.fn().mockResolvedValue('space-001'),
}))

const mockRpc = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({
    rpc: mockRpc,
    from: mockFrom,
  })),
}))

import { searchMemories, listMemories } from '@/lib/memory/items'

describe('searchMemories — hybrid search', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('should call pa_hybrid_search with query_text and query_embedding', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{
        id: 'mem-1',
        title: 'Budget rule',
        content: 'Monthly budget is 50k',
        category: 'rule',
        tags: [],
        project: null,
        valid_at: new Date().toISOString(),
        invalid_at: null,
        source: 'manual',
        importance: 3.0,
        space_slug: 'personal',
        semantic_score: 0.85,
        keyword_score: 0.6,
        final_score: 0.73,
      }],
      error: null,
    })
    // Mock the importance increment rpc call
    mockRpc.mockResolvedValueOnce({ data: null, error: null })

    const results = await searchMemories({
      userId: 'user-1',
      query: 'budget rule',
      limit: 5,
    })

    expect(mockRpc).toHaveBeenCalledWith('pa_hybrid_search', expect.objectContaining({
      query_text: 'budget rule',
      query_embedding: expect.any(String),
      filter_user_id: 'user-1',
    }))

    expect(results[0]).toHaveProperty('semantic_score', 0.85)
    expect(results[0]).toHaveProperty('keyword_score', 0.6)
    expect(results[0]).toHaveProperty('final_score', 0.73)
  })

  it('should include stale_hint in results for old low-importance memories', async () => {
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

    mockRpc.mockResolvedValueOnce({
      data: [{
        id: 'mem-old',
        title: 'Old project',
        content: 'Working on project X',
        category: 'context',
        tags: [],
        project: 'project-x',
        valid_at: sixMonthsAgo.toISOString(),
        invalid_at: null,
        source: 'manual',
        importance: 0.3,
        space_slug: 'projects',
        semantic_score: 0.7,
        keyword_score: 0.0,
        final_score: 0.36,
      }],
      error: null,
    })
    mockRpc.mockResolvedValueOnce({ data: null, error: null })

    const results = await searchMemories({
      userId: 'user-1',
      query: 'project X',
      limit: 5,
    })

    expect(results[0]).toHaveProperty('stale_hint')
    expect(results[0].stale_hint).toContain('months old')
  })

  it('should return null stale_hint for fresh memories', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{
        id: 'mem-fresh',
        title: 'Fresh memory',
        content: 'Just created',
        category: 'note',
        tags: [],
        project: null,
        valid_at: new Date().toISOString(),
        invalid_at: null,
        source: 'manual',
        importance: 5.0,
        space_slug: 'personal',
        semantic_score: 0.9,
        keyword_score: 0.8,
        final_score: 0.79,
      }],
      error: null,
    })
    mockRpc.mockResolvedValueOnce({ data: null, error: null })

    const results = await searchMemories({
      userId: 'user-1',
      query: 'fresh',
      limit: 5,
    })

    expect(results[0].stale_hint).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/mcp/tools/memory-hybrid-search.test.ts`

Expected: FAIL — searchMemories still calls `pa_match_memories`, not `pa_hybrid_search`.

- [ ] **Step 3: Update searchMemories() to use hybrid search + stale hints**

In `lib/memory/items.ts`, replace the `searchMemories` function (lines 46-86):

```typescript
export type HybridSearchResult = MemoryItem & {
  space_slug: string
  semantic_score: number
  keyword_score: number
  final_score: number
  stale_hint: string | null
}

export async function searchMemories(params: {
  userId: string
  query: string
  spaceSlug?: string
  category?: string
  project?: string
  limit: number
}): Promise<HybridSearchResult[]> {
  const { userId, query, spaceSlug, category, project, limit } = params

  await ensureDefaultSpaces(userId)

  const queryEmbedding = await generateEmbedding(query)

  const supabase = createServiceRoleClient()
  const { data, error } = await supabase.rpc('pa_hybrid_search', {
    query_embedding: JSON.stringify(queryEmbedding),
    query_text: query,
    filter_user_id: userId,
    filter_space_slug: spaceSlug || null,
    filter_category: category || null,
    filter_project: project || null,
    match_count: limit,
  })

  if (error) throw new Error(`Search failed: ${error.message}`)

  const rows = (data ?? []) as Array<MemoryItem & { space_slug: string; semantic_score: number; keyword_score: number; final_score: number }>
  const ids = rows.map((r) => r.id)
  if (ids.length > 0) {
    void (async () => {
      try {
        await supabase.rpc('pa_increment_memory_importance', { memory_ids: ids, boost: 0.1 })
      } catch {
        /* non-fatal */
      }
    })()
  }

  return rows.map((r) => ({
    ...r,
    stale_hint: computeStaleHint(r),
  }))
}
```

- [ ] **Step 4: Also add stale_hint to listMemories response**

In `lib/memory/items.ts`, update the `listMemories` return type and add stale hints (lines 88-126):

```typescript
export async function listMemories(params: {
  userId: string
  spaceSlug?: string
  category?: string
  project?: string
  tag?: string
  limit: number
  offset: number
}): Promise<Array<MemoryItem & { stale_hint: string | null }>> {
  const { userId, spaceSlug, category, project, tag, limit, offset } = params

  await ensureDefaultSpaces(userId)

  const supabase = createServiceRoleClient()
  let query = supabase
    .from('pa_memory_items')
    .select('*, pa_memory_spaces!inner(slug)')
    .eq('user_id', userId)
    .eq('is_active', true)
    .is('invalid_at', null)
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (spaceSlug) {
    query = query.eq('pa_memory_spaces.slug', spaceSlug)
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
  return ((data ?? []) as MemoryItem[]).map((m) => ({
    ...m,
    stale_hint: computeStaleHint(m),
  }))
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/mcp/tools/memory-hybrid-search.test.ts`

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/memory/items.ts tests/mcp/tools/memory-hybrid-search.test.ts
git commit -m "feat(memory): switch to hybrid search (semantic+keyword+importance) with stale hints"
```

---

### Task 7: Update search_memory + list_memories Tool Handlers

**Files:**
- Modify: `lib/mcp/tools/memory.ts` (search_memory handler lines 89-138, list_memories handler lines 140-192)

- [ ] **Step 1: Update search_memory handler to return hybrid scores + stale hints**

In `lib/mcp/tools/memory.ts`, replace the search_memory tool response mapping (lines 115-132) inside the try block:

```typescript
        logAccess(userId, 'search', 'search_memory', query, results.map(r => r.id))

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              query,
              results: results.map((r) => ({
                id: r.id,
                title: r.title,
                content: r.content,
                category: r.category,
                tags: r.tags,
                project: r.project,
                space: r.space_slug,
                semantic_score: Math.round(r.semantic_score * 1000) / 1000,
                keyword_score: Math.round(r.keyword_score * 1000) / 1000,
                final_score: Math.round(r.final_score * 1000) / 1000,
                stale_hint: r.stale_hint,
              })),
              count: results.length,
            }),
          }],
        }
```

- [ ] **Step 2: Update list_memories handler to include stale hints**

In the list_memories handler response (lines 170-186), update the mapping:

```typescript
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
                stale_hint: m.stale_hint,
              })),
              count: memories.length,
            }),
          }],
        }
```

- [ ] **Step 3: Run all memory tool tests**

Run: `npx vitest run tests/mcp/tools/`

Expected: PASS (fix any breakage from the new return shapes).

- [ ] **Step 4: Commit**

```bash
git add lib/mcp/tools/memory.ts
git commit -m "feat(memory): update search/list tool handlers with hybrid scores and stale hints"
```

---

### Task 8: consolidateMemories() Business Logic

**Files:**
- Modify: `lib/memory/items.ts`
- Create: `tests/mcp/tools/memory-consolidate.test.ts`

- [ ] **Step 1: Write test for consolidateMemories**

Create `tests/mcp/tools/memory-consolidate.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/documents/embed', () => ({
  generateEmbedding: vi.fn().mockResolvedValue(new Array(1536).fill(0.1)),
}))

vi.mock('@/lib/memory/spaces', () => ({
  ensureDefaultSpaces: vi.fn(),
  resolveSpaceId: vi.fn().mockResolvedValue('space-001'),
}))

const mockRpc = vi.fn()
const mockSelect = vi.fn()

const chainable = {
  select: mockSelect,
  eq: vi.fn().mockReturnThis(),
  is: vi.fn().mockReturnThis(),
  lt: vi.fn().mockReturnThis(),
  not: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
}

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({
    rpc: mockRpc,
    from: vi.fn().mockReturnValue(chainable),
  })),
}))

import { consolidateMemories } from '@/lib/memory/items'

describe('consolidateMemories', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSelect.mockReturnValue(chainable)
  })

  it('should find duplicate groups in "duplicates" mode', async () => {
    // Mock fetching all active memories
    chainable.order = vi.fn().mockResolvedValue({
      data: [
        { id: 'mem-1', title: 'Budget rule', content: 'Monthly 50k', category: 'rule', importance: 4.2, created_at: '2026-01-01', valid_at: '2026-01-01', invalid_at: null, embedding: JSON.stringify(new Array(1536).fill(0.1)) },
        { id: 'mem-2', title: 'Budget limit', content: 'Monthly budget 50k', category: 'rule', importance: 1.0, created_at: '2026-02-01', valid_at: '2026-02-01', invalid_at: null, embedding: JSON.stringify(new Array(1536).fill(0.1)) },
      ],
      error: null,
    })

    // Mock pa_match_memories for each memory
    mockRpc
      .mockResolvedValueOnce({ data: [{ id: 'mem-2', similarity: 0.94, title: 'Budget limit', content: 'Monthly budget 50k', category: 'rule', importance: 1.0 }], error: null })
      .mockResolvedValueOnce({ data: [{ id: 'mem-1', similarity: 0.94, title: 'Budget rule', content: 'Monthly 50k', category: 'rule', importance: 4.2 }], error: null })

    const result = await consolidateMemories({ userId: 'user-1', mode: 'duplicates' })

    expect(result.duplicate_groups.length).toBeGreaterThan(0)
    expect(result.duplicate_groups[0].memories).toHaveLength(2)
    expect(result.duplicate_groups[0].max_similarity).toBeCloseTo(0.94, 1)
  })

  it('should find stale memories in "stale" mode', async () => {
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

    chainable.order = vi.fn().mockResolvedValue({
      data: [
        { id: 'mem-old', title: 'Old project', content: 'Done', valid_at: sixMonthsAgo.toISOString(), invalid_at: null, importance: 0.3, category: 'context' },
      ],
      error: null,
    })

    const result = await consolidateMemories({ userId: 'user-1', mode: 'stale' })

    expect(result.stale_memories.length).toBe(1)
    expect(result.stale_memories[0].id).toBe('mem-old')
    expect(result.stale_memories[0].reason).toContain('months old')
  })

  it('should return both in "both" mode', async () => {
    // For duplicates query
    chainable.order = vi.fn()
      .mockResolvedValueOnce({
        data: [
          { id: 'mem-1', title: 'A', content: 'A content', category: 'note', importance: 3.0, created_at: '2026-01-01', valid_at: '2026-01-01', invalid_at: null, embedding: JSON.stringify(new Array(1536).fill(0.1)) },
        ],
        error: null,
      })
      // For stale query
      .mockResolvedValueOnce({ data: [], error: null })

    mockRpc.mockResolvedValueOnce({ data: [], error: null })

    const result = await consolidateMemories({ userId: 'user-1', mode: 'both' })

    expect(result).toHaveProperty('duplicate_groups')
    expect(result).toHaveProperty('stale_memories')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/mcp/tools/memory-consolidate.test.ts`

Expected: FAIL — `consolidateMemories` not exported.

- [ ] **Step 3: Implement consolidateMemories()**

Add to `lib/memory/items.ts`:

```typescript
export interface ConsolidateResult {
  duplicate_groups: Array<{
    memories: Array<{ id: string; title: string; content: string; category: string; importance: number; created_at: string }>
    max_similarity: number
  }>
  stale_memories: Array<{
    id: string; title: string; valid_at: string; importance: number; category: string; reason: string
  }>
  total_groups: number
  total_stale: number
}

export async function consolidateMemories(params: {
  userId: string
  spaceSlug?: string
  mode: 'duplicates' | 'stale' | 'both'
}): Promise<ConsolidateResult> {
  const { userId, spaceSlug, mode } = params
  const supabase = createServiceRoleClient()

  const result: ConsolidateResult = {
    duplicate_groups: [],
    stale_memories: [],
    total_groups: 0,
    total_stale: 0,
  }

  // ── Duplicates ─────────────────────────────────────────
  if (mode === 'duplicates' || mode === 'both') {
    let query = supabase
      .from('pa_memory_items')
      .select('id, title, content, category, importance, created_at, valid_at, invalid_at, embedding')
      .eq('user_id', userId)
      .eq('is_active', true)
      .is('invalid_at', null)
      .order('created_at', { ascending: true })

    if (spaceSlug) {
      // Need to join spaces for slug filter
      query = supabase
        .from('pa_memory_items')
        .select('id, title, content, category, importance, created_at, valid_at, invalid_at, embedding, pa_memory_spaces!inner(slug)')
        .eq('user_id', userId)
        .eq('is_active', true)
        .is('invalid_at', null)
        .eq('pa_memory_spaces.slug', spaceSlug)
        .order('created_at', { ascending: true })
    }

    const { data: allMemories } = await query
    const memories = (allMemories ?? []) as Array<{
      id: string; title: string; content: string; category: string
      importance: number; created_at: string; embedding: string
    }>

    const seen = new Set<string>()

    for (const mem of memories) {
      if (seen.has(mem.id)) continue

      const { data: matches } = await supabase.rpc('pa_match_memories', {
        query_embedding: mem.embedding,
        filter_user_id: userId,
        filter_space_slug: spaceSlug || null,
        filter_category: null,
        filter_project: null,
        match_count: 10,
        match_threshold: 0.90,
      })

      const dupes = ((matches ?? []) as Array<{ id: string; title: string; content: string; category: string; importance: number; similarity: number }>)
        .filter((m) => m.id !== mem.id && !seen.has(m.id))

      if (dupes.length > 0) {
        const group = {
          memories: [
            { id: mem.id, title: mem.title, content: mem.content, category: mem.category, importance: mem.importance, created_at: mem.created_at },
            ...dupes.map((d) => ({ id: d.id, title: d.title, content: d.content, category: d.category, importance: d.importance, created_at: '' })),
          ],
          max_similarity: Math.round(Math.max(...dupes.map((d) => d.similarity)) * 1000) / 1000,
        }
        result.duplicate_groups.push(group)
        seen.add(mem.id)
        for (const d of dupes) seen.add(d.id)
      }
    }
    result.total_groups = result.duplicate_groups.length
  }

  // ── Stale ──────────────────────────────────────────────
  if (mode === 'stale' || mode === 'both') {
    let query = supabase
      .from('pa_memory_items')
      .select('id, title, valid_at, invalid_at, importance, category')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('valid_at', { ascending: true })

    if (spaceSlug) {
      query = supabase
        .from('pa_memory_items')
        .select('id, title, valid_at, invalid_at, importance, category, pa_memory_spaces!inner(slug)')
        .eq('user_id', userId)
        .eq('is_active', true)
        .eq('pa_memory_spaces.slug', spaceSlug)
        .order('valid_at', { ascending: true })
    }

    const { data: candidates } = await query
    for (const mem of (candidates ?? []) as Array<{ id: string; title: string; valid_at: string; invalid_at: string | null; importance: number; category: string }>) {
      const hint = computeStaleHint(mem)
      if (hint) {
        result.stale_memories.push({
          id: mem.id,
          title: mem.title,
          valid_at: mem.valid_at,
          importance: mem.importance,
          category: mem.category,
          reason: hint,
        })
      }
    }
    result.total_stale = result.stale_memories.length
  }

  return result
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/mcp/tools/memory-consolidate.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/memory/items.ts tests/mcp/tools/memory-consolidate.test.ts
git commit -m "feat(memory): add consolidateMemories for on-demand duplicate + stale detection"
```

---

### Task 9: Register consolidate_memories MCP Tool

**Files:**
- Modify: `lib/mcp/tools/memory.ts`

- [ ] **Step 1: Add import for consolidateMemories**

At the top of `lib/mcp/tools/memory.ts`, update the import (line 4-13):

```typescript
import {
  saveMemory,
  searchMemories,
  listMemories,
  getMemory,
  updateMemory,
  deleteMemory,
  getContext,
  getRules,
  consolidateMemories,
} from '@/lib/memory/items'
```

- [ ] **Step 2: Add consolidate_memories tool registration**

Before the closing `}` of `registerMemoryTools` (before line 448), add:

```typescript
  // ── consolidate_memories ────────────────────────────────

  server.tool(
    'consolidate_memories',
    'Find duplicate and stale memories for cleanup. Returns groups for you to review — no auto-deletion. Call when user asks to clean up their memory vault.',
    {
      space: z.string().optional().describe('Limit to a specific space (by slug)'),
      mode: z.enum(['duplicates', 'stale', 'both']).default('both').describe('What to look for: duplicates, stale, or both'),
    },
    async ({ space, mode }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      try {
        const result = await consolidateMemories({
          userId,
          spaceSlug: space,
          mode,
        })

        logAccess(userId, 'consolidate', 'consolidate_memories', mode)

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(result),
          }],
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true }
      }
    }
  )
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/mcp/tools/`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/mcp/tools/memory.ts
git commit -m "feat(memory): register consolidate_memories MCP tool"
```

---

### Task 10: Register Widget Resources

**Files:**
- Modify: `lib/mcp/widgets.ts` (lines 45-82)

- [ ] **Step 1: Add 3 new widget entries and WIDGET_URIS**

In `lib/mcp/widgets.ts`, update the `WIDGETS` array (line 45-51) to add 3 new entries:

```typescript
const WIDGETS: WidgetDef[] = [
  { name: 'Habit Heatmap', filename: 'habit-heatmap.html', uri: 'ui://widgets/habit-heatmap.html' },
  { name: 'Spending Chart', filename: 'spending-chart.html', uri: 'ui://widgets/spending-chart.html' },
  { name: 'Review Dashboard', filename: 'review-dashboard.html', uri: 'ui://widgets/review-dashboard.html' },
  { name: 'Transaction Categorizer', filename: 'transaction-categorizer.html', uri: 'ui://widgets/transaction-categorizer.html' },
  { name: 'Document Viewer', filename: 'document-viewer.html', uri: 'ui://widgets/document-viewer.html' },
  { name: 'Memory Search', filename: 'memory-search.html', uri: 'ui://widgets/memory-search.html' },
  { name: 'Memory Consolidator', filename: 'memory-consolidator.html', uri: 'ui://widgets/memory-consolidator.html' },
  { name: 'Memory Context', filename: 'memory-context.html', uri: 'ui://widgets/memory-context.html' },
]
```

Update the `WIDGET_URIS` export (line 76-82):

```typescript
export const WIDGET_URIS = {
  habitHeatmap: 'ui://widgets/habit-heatmap.html',
  spendingChart: 'ui://widgets/spending-chart.html',
  reviewDashboard: 'ui://widgets/review-dashboard.html',
  transactionCategorizer: 'ui://widgets/transaction-categorizer.html',
  documentViewer: 'ui://widgets/document-viewer.html',
  memorySearch: 'ui://widgets/memory-search.html',
  memoryConsolidator: 'ui://widgets/memory-consolidator.html',
  memoryContext: 'ui://widgets/memory-context.html',
} as const
```

- [ ] **Step 2: Commit**

```bash
git add lib/mcp/widgets.ts
git commit -m "feat(memory): register 3 memory widget resources"
```

---

### Task 11: memory-search.html Widget

**Files:**
- Create: `widgets/memory-search.html`

- [ ] **Step 1: Create the widget**

```html
<!doctype html>
<meta charset="utf-8" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font: 13px system-ui, sans-serif; background: transparent; color: #fafafa; }
  .container { padding: 16px; }
  .header { font-size: 18px; font-weight: 700; margin-bottom: 4px; }
  .subheader { font-size: 11px; color: #525252; margin-bottom: 16px; }
  .pending-banner { background: rgba(200,255,0,0.06); border: 1px solid rgba(200,255,0,0.15); border-radius: 10px; padding: 12px; margin-bottom: 16px; }
  .pending-title { font-size: 12px; font-weight: 600; color: #c8ff00; margin-bottom: 4px; }
  .pending-content { font-size: 11px; color: #a3a3a3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .card { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.04); border-radius: 10px; padding: 12px; margin-bottom: 10px; }
  .card-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
  .card-title { font-size: 14px; font-weight: 600; flex: 1; }
  .badge { font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; padding: 2px 8px; border-radius: 10px; background: rgba(200,255,0,0.1); color: #c8ff00; }
  .card-content { font-size: 12px; color: #a3a3a3; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; margin-bottom: 8px; }
  .score-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
  .score-bar-bg { flex: 1; height: 4px; border-radius: 2px; background: rgba(255,255,255,0.04); }
  .score-bar { height: 100%; border-radius: 2px; background: #c8ff00; }
  .score-label { font-size: 10px; color: #525252; font-family: ui-monospace, monospace; white-space: nowrap; }
  .score-breakdown { font-size: 10px; color: #525252; font-family: ui-monospace, monospace; margin-bottom: 6px; }
  .tags { display: flex; flex-wrap: wrap; gap: 4px; }
  .tag { font-size: 10px; color: #737373; background: rgba(255,255,255,0.03); padding: 1px 6px; border-radius: 4px; }
  .project-badge { font-size: 10px; color: #c8ff00; font-weight: 600; }
  .stale-banner { font-size: 10px; color: #f59e0b; background: rgba(245,158,11,0.06); border: 1px solid rgba(245,158,11,0.12); border-radius: 6px; padding: 4px 8px; margin-top: 6px; }
  .empty { text-align: center; color: #525252; padding: 40px 0; font-size: 12px; }

  @media (prefers-color-scheme: light) {
    body { color: #1a1a1a; }
    .badge { background: rgba(101,163,0,0.1); color: #65a300; }
    .pending-banner { background: rgba(101,163,0,0.06); border-color: rgba(101,163,0,0.15); }
    .pending-title { color: #65a300; }
    .card { background: rgba(0,0,0,0.02); border-color: rgba(0,0,0,0.06); }
    .card-content, .score-label, .score-breakdown, .subheader { color: #888; }
    .score-bar-bg { background: rgba(0,0,0,0.04); }
    .score-bar { background: #65a300; }
    .tag { background: rgba(0,0,0,0.03); color: #888; }
    .project-badge { color: #65a300; }
  }
</style>
<div class="container">
  <div class="header" id="title"></div>
  <div class="subheader" id="subtitle"></div>
  <div id="pending"></div>
  <div id="results"></div>
</div>
<script type="module">
/*__EXT_APPS_BUNDLE__*/
const { App } = globalThis.ExtApps;
(async () => {
  const app = new App({ name: "MemorySearch", version: "1.0.0" }, {});

  app.ontoolresult = ({ content }) => {
    const d = JSON.parse(content[0].text);

    // Handle duplicates_found from save_memory
    if (d.status === "duplicates_found") {
      document.getElementById("title").textContent = "Similar Memories Found";
      document.getElementById("subtitle").textContent = d.suggestion;

      const pendingEl = document.getElementById("pending");
      const pm = d.pending_memory;
      pendingEl.innerHTML = `<div class="pending-banner">
        <div class="pending-title">Your memory (not yet saved)</div>
        <div class="pending-content"><strong>${esc(pm.title)}</strong> — ${esc(pm.content)}</div>
      </div>`;

      renderCards(d.similar_memories, true);
      return;
    }

    // Normal search results
    document.getElementById("title").textContent = "Memory Search";
    document.getElementById("subtitle").textContent = d.count + " result" + (d.count !== 1 ? "s" : "") + (d.query ? ' for "' + esc(d.query) + '"' : "");
    renderCards(d.results, false);
  };

  function renderCards(items, isDuplicateView) {
    const el = document.getElementById("results");
    if (!items || items.length === 0) {
      el.innerHTML = '<div class="empty">No memories found</div>';
      return;
    }
    el.innerHTML = items.map(m => {
      const scoreHtml = isDuplicateView
        ? `<div class="score-breakdown">similarity: ${(m.similarity * 100).toFixed(0)}%</div>`
        : `<div class="score-row">
            <div class="score-bar-bg"><div class="score-bar" style="width:${(m.final_score * 100).toFixed(0)}%"></div></div>
            <span class="score-label">${(m.final_score * 100).toFixed(0)}%</span>
          </div>
          <div class="score-breakdown">semantic: ${m.semantic_score?.toFixed(3) ?? "-"} | keyword: ${m.keyword_score?.toFixed(3) ?? "-"}</div>`;

      const tagsHtml = (m.tags || []).map(t => `<span class="tag">#${esc(t)}</span>`).join("");
      const projectHtml = m.project ? `<span class="project-badge">${esc(m.project)}</span>` : "";
      const staleHtml = m.stale_hint ? `<div class="stale-banner">${esc(m.stale_hint)}</div>` : "";

      return `<div class="card">
        <div class="card-header">
          <span class="card-title">${esc(m.title)}</span>
          <span class="badge">${esc(m.category)}</span>
        </div>
        <div class="card-content">${esc(m.content)}</div>
        ${scoreHtml}
        <div class="tags">${projectHtml}${tagsHtml}</div>
        ${staleHtml}
      </div>`;
    }).join("");
  }

  function esc(s) {
    if (!s) return "";
    return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  await app.connect();
})();
</script>
```

- [ ] **Step 2: Commit**

```bash
git add widgets/memory-search.html
git commit -m "feat(memory): add memory-search.html widget"
```

---

### Task 12: memory-consolidator.html Widget

**Files:**
- Create: `widgets/memory-consolidator.html`

- [ ] **Step 1: Create the widget**

```html
<!doctype html>
<meta charset="utf-8" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font: 13px system-ui, sans-serif; background: transparent; color: #fafafa; }
  .container { padding: 16px; }
  .header { font-size: 18px; font-weight: 700; margin-bottom: 4px; }
  .subheader { font-size: 11px; color: #525252; margin-bottom: 16px; }
  .tabs { display: flex; gap: 8px; margin-bottom: 16px; }
  .tab { font-size: 11px; font-weight: 600; padding: 4px 12px; border-radius: 8px; background: rgba(255,255,255,0.03); color: #737373; cursor: default; }
  .tab.active { background: rgba(200,255,0,0.1); color: #c8ff00; }
  .section { margin-bottom: 20px; }
  .section-title { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.15em; color: #c8ff00; margin-bottom: 10px; }
  .group { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.04); border-radius: 10px; padding: 12px; margin-bottom: 10px; }
  .similarity-badge { font-size: 10px; font-weight: 700; color: #f59e0b; background: rgba(245,158,11,0.1); padding: 2px 8px; border-radius: 8px; margin-bottom: 8px; display: inline-block; }
  .mem-row { display: flex; justify-content: space-between; align-items: flex-start; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.03); }
  .mem-row:last-child { border-bottom: none; }
  .mem-title { font-size: 12px; font-weight: 600; }
  .mem-content { font-size: 11px; color: #a3a3a3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin-top: 2px; }
  .mem-importance { font-size: 11px; font-family: ui-monospace, monospace; color: #c8ff00; white-space: nowrap; }
  .stale-card { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.04); border-radius: 10px; padding: 10px 12px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; }
  .stale-info { flex: 1; }
  .stale-title { font-size: 12px; font-weight: 600; }
  .stale-reason { font-size: 10px; color: #f59e0b; margin-top: 2px; }
  .stale-meta { font-size: 10px; color: #525252; font-family: ui-monospace, monospace; text-align: right; }
  .footer { font-size: 11px; color: #525252; border-top: 1px solid rgba(255,255,255,0.04); padding-top: 10px; margin-top: 10px; }
  .empty { text-align: center; color: #525252; padding: 30px 0; font-size: 12px; }

  @media (prefers-color-scheme: light) {
    body { color: #1a1a1a; }
    .tab.active { background: rgba(101,163,0,0.1); color: #65a300; }
    .section-title { color: #65a300; }
    .group, .stale-card { background: rgba(0,0,0,0.02); border-color: rgba(0,0,0,0.06); }
    .mem-content, .subheader, .stale-meta { color: #888; }
    .mem-importance { color: #65a300; }
    .mem-row { border-color: rgba(0,0,0,0.04); }
    .footer { border-color: rgba(0,0,0,0.06); }
  }
</style>
<div class="container">
  <div class="header">Memory Consolidator</div>
  <div class="subheader" id="subtitle"></div>
  <div class="tabs" id="tabs"></div>
  <div id="duplicates" class="section"></div>
  <div id="stale" class="section"></div>
  <div class="footer" id="footer"></div>
</div>
<script type="module">
/*__EXT_APPS_BUNDLE__*/
const { App } = globalThis.ExtApps;
(async () => {
  const app = new App({ name: "MemoryConsolidator", version: "1.0.0" }, {});

  app.ontoolresult = ({ content }) => {
    const d = JSON.parse(content[0].text);

    const hasDupes = d.duplicate_groups && d.duplicate_groups.length > 0;
    const hasStale = d.stale_memories && d.stale_memories.length > 0;

    document.getElementById("subtitle").textContent =
      (d.total_groups || 0) + " duplicate group" + (d.total_groups !== 1 ? "s" : "") + ", " +
      (d.total_stale || 0) + " stale memor" + (d.total_stale !== 1 ? "ies" : "y");

    // Tabs
    const tabsEl = document.getElementById("tabs");
    if (hasDupes) tabsEl.innerHTML += '<span class="tab active">Duplicates</span>';
    if (hasStale) tabsEl.innerHTML += '<span class="tab active">Stale</span>';
    if (!hasDupes && !hasStale) tabsEl.innerHTML = '<span class="tab">Nothing to clean up</span>';

    // Duplicates
    const dupesEl = document.getElementById("duplicates");
    if (hasDupes) {
      dupesEl.innerHTML = '<div class="section-title">Duplicate Groups</div>' +
        d.duplicate_groups.map(g => {
          const rows = g.memories.map(m =>
            `<div class="mem-row">
              <div>
                <div class="mem-title">${esc(m.title)}</div>
                <div class="mem-content">${esc(m.content)}</div>
              </div>
              <div class="mem-importance">${m.importance.toFixed(1)}</div>
            </div>`
          ).join("");
          return `<div class="group">
            <span class="similarity-badge">${(g.max_similarity * 100).toFixed(0)}% similar</span>
            ${rows}
          </div>`;
        }).join("");
    }

    // Stale
    const staleEl = document.getElementById("stale");
    if (hasStale) {
      staleEl.innerHTML = '<div class="section-title">Stale Memories</div>' +
        d.stale_memories.map(m =>
          `<div class="stale-card">
            <div class="stale-info">
              <div class="stale-title">${esc(m.title)}</div>
              <div class="stale-reason">${esc(m.reason)}</div>
            </div>
            <div class="stale-meta">${m.importance.toFixed(1)}</div>
          </div>`
        ).join("");
    }

    // Footer
    if (!hasDupes && !hasStale) {
      document.getElementById("footer").textContent = "Your memory vault is clean!";
    } else {
      document.getElementById("footer").textContent = "Review the items above and tell me which to merge or delete.";
    }
  };

  function esc(s) {
    if (!s) return "";
    return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  await app.connect();
})();
</script>
```

- [ ] **Step 2: Commit**

```bash
git add widgets/memory-consolidator.html
git commit -m "feat(memory): add memory-consolidator.html widget"
```

---

### Task 13: memory-context.html Widget

**Files:**
- Create: `widgets/memory-context.html`

- [ ] **Step 1: Create the widget**

```html
<!doctype html>
<meta charset="utf-8" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font: 13px system-ui, sans-serif; background: transparent; color: #fafafa; }
  .container { padding: 16px; }
  .header { font-size: 18px; font-weight: 700; margin-bottom: 4px; }
  .subheader { font-size: 11px; color: #525252; margin-bottom: 16px; }
  .section { margin-bottom: 16px; }
  .section-header { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
  .section-icon { font-size: 12px; }
  .section-title { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.15em; color: #c8ff00; }
  .section-count { font-size: 10px; color: #525252; }
  .card { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.04); border-radius: 10px; padding: 10px 12px; margin-bottom: 8px; }
  .card-title { font-size: 13px; font-weight: 600; margin-bottom: 4px; }
  .card-content { font-size: 11px; color: #a3a3a3; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; margin-bottom: 6px; }
  .importance-row { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
  .importance-bar-bg { flex: 1; height: 3px; border-radius: 2px; background: rgba(255,255,255,0.04); max-width: 80px; }
  .importance-bar { height: 100%; border-radius: 2px; background: #c8ff00; }
  .importance-label { font-size: 9px; color: #525252; font-family: ui-monospace, monospace; }
  .tags { display: flex; flex-wrap: wrap; gap: 4px; }
  .tag { font-size: 9px; color: #737373; background: rgba(255,255,255,0.03); padding: 1px 6px; border-radius: 4px; }
  .empty { text-align: center; color: #525252; padding: 40px 0; font-size: 12px; }

  @media (prefers-color-scheme: light) {
    body { color: #1a1a1a; }
    .section-title { color: #65a300; }
    .card { background: rgba(0,0,0,0.02); border-color: rgba(0,0,0,0.06); }
    .card-content, .subheader, .importance-label, .section-count { color: #888; }
    .importance-bar-bg { background: rgba(0,0,0,0.04); }
    .importance-bar { background: #65a300; }
    .tag { background: rgba(0,0,0,0.03); color: #888; }
  }
</style>
<div class="container">
  <div class="header" id="title"></div>
  <div class="subheader" id="subtitle"></div>
  <div id="sections"></div>
</div>
<script type="module">
/*__EXT_APPS_BUNDLE__*/
const { App } = globalThis.ExtApps;
(async () => {
  const app = new App({ name: "MemoryContext", version: "1.0.0" }, {});

  const CATEGORY_META = {
    rule: { icon: "📏", label: "Rules" },
    context: { icon: "🔍", label: "Context" },
    decision: { icon: "⚖️", label: "Decisions" },
    preference: { icon: "⭐", label: "Preferences" },
    snippet: { icon: "📝", label: "Snippets" },
    note: { icon: "💡", label: "Notes" },
    project: { icon: "📁", label: "Project" },
    persona: { icon: "👤", label: "Persona" },
  };

  const CATEGORY_ORDER = ["rule", "context", "decision", "preference", "snippet", "note", "project", "persona"];

  app.ontoolresult = ({ content }) => {
    const d = JSON.parse(content[0].text);
    document.getElementById("title").textContent = d.project + " Context";
    document.getElementById("subtitle").textContent = d.count + " memor" + (d.count !== 1 ? "ies" : "y");

    if (!d.memories || d.memories.length === 0) {
      document.getElementById("sections").innerHTML = '<div class="empty">No memories for this project</div>';
      return;
    }

    // Group by category
    const groups = {};
    for (const m of d.memories) {
      (groups[m.category] ||= []).push(m);
    }

    const sectionsEl = document.getElementById("sections");
    for (const cat of CATEGORY_ORDER) {
      const items = groups[cat];
      if (!items) continue;
      const meta = CATEGORY_META[cat] || { icon: "📌", label: cat };

      sectionsEl.innerHTML += `<div class="section">
        <div class="section-header">
          <span class="section-icon">${meta.icon}</span>
          <span class="section-title">${meta.label}</span>
          <span class="section-count">${items.length}</span>
        </div>
        ${items.map(m => {
          const impPct = Math.min((m.importance || 0) / 10 * 100, 100);
          const tagsHtml = (m.tags || []).map(t => '<span class="tag">#' + esc(t) + '</span>').join("");
          return `<div class="card">
            <div class="card-title">${esc(m.title)}</div>
            <div class="card-content">${esc(m.content)}</div>
            <div class="importance-row">
              <div class="importance-bar-bg"><div class="importance-bar" style="width:${impPct}%"></div></div>
              <span class="importance-label">${(m.importance || 0).toFixed(1)}</span>
            </div>
            ${tagsHtml ? '<div class="tags">' + tagsHtml + '</div>' : ''}
          </div>`;
        }).join("")}
      </div>`;
    }
  };

  function esc(s) {
    if (!s) return "";
    return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  await app.connect();
})();
</script>
```

- [ ] **Step 2: Commit**

```bash
git add widgets/memory-context.html
git commit -m "feat(memory): add memory-context.html widget"
```

---

### Task 14: Wire search_memory + get_context + consolidate_memories to Widgets

**Files:**
- Modify: `lib/mcp/tools/memory.ts`

- [ ] **Step 1: Add registerAppTool import and update tool registrations**

At the top of `lib/mcp/tools/memory.ts`, add the import:

```typescript
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server'
import { WIDGET_URIS } from '@/lib/mcp/widgets'
```

- [ ] **Step 2: Convert search_memory from server.tool() to registerAppTool()**

Replace the `search_memory` registration (the `server.tool('search_memory', ...)` block) with:

```typescript
  // ── search_memory ────────────────────────────────────────

  registerAppTool(
    server,
    'search_memory',
    {
      description: 'Semantic + keyword hybrid search across all memories. Returns results with score breakdown and stale hints.',
      inputSchema: {
        query: z.string().min(1).max(500).describe('Natural language search query'),
        space: z.string().optional().describe('Filter by space slug'),
        category: MemoryCategoryEnum.optional().describe('Optional category filter'),
        project: z.string().optional().describe('Optional project filter'),
        limit: z.number().int().min(1).max(20).default(5).describe('Max results (default: 5)'),
      },
      _meta: { ui: { resourceUri: WIDGET_URIS.memorySearch } },
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
              query,
              results: results.map((r) => ({
                id: r.id,
                title: r.title,
                content: r.content,
                category: r.category,
                tags: r.tags,
                project: r.project,
                space: r.space_slug,
                semantic_score: Math.round(r.semantic_score * 1000) / 1000,
                keyword_score: Math.round(r.keyword_score * 1000) / 1000,
                final_score: Math.round(r.final_score * 1000) / 1000,
                stale_hint: r.stale_hint,
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
```

- [ ] **Step 3: Convert get_context from server.tool() to registerAppTool()**

Replace the `get_context` registration with:

```typescript
  // ── get_context ──────────────────────────────────────────

  registerAppTool(
    server,
    'get_context',
    {
      description: 'Fetch all memories for a specific project — instant project onboarding.',
      inputSchema: {
        project: z.string().min(1).describe('Project name to get context for'),
      },
      _meta: { ui: { resourceUri: WIDGET_URIS.memoryContext } },
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
              importance: m.importance,
            })),
            count: memories.length,
          }),
        }],
      }
    }
  )
```

- [ ] **Step 4: Convert consolidate_memories from server.tool() to registerAppTool()**

Replace the `consolidate_memories` registration (added in Task 9) with:

```typescript
  // ── consolidate_memories ────────────────────────────────

  registerAppTool(
    server,
    'consolidate_memories',
    {
      description: 'Find duplicate and stale memories for cleanup. Returns groups for you to review — no auto-deletion.',
      inputSchema: {
        space: z.string().optional().describe('Limit to a specific space (by slug)'),
        mode: z.enum(['duplicates', 'stale', 'both']).default('both').describe('What to look for: duplicates, stale, or both'),
      },
      _meta: { ui: { resourceUri: WIDGET_URIS.memoryConsolidator } },
    },
    async ({ space, mode }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      try {
        const result = await consolidateMemories({
          userId,
          spaceSlug: space,
          mode,
        })

        logAccess(userId, 'consolidate', 'consolidate_memories', mode)

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(result),
          }],
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true }
      }
    }
  )
```

- [ ] **Step 5: Run all tests**

Run: `npx vitest run`

Expected: PASS. The `registerAppTool` mock in `tests/setup.ts` already handles the conversion to `server.tool()` calls.

- [ ] **Step 6: Commit**

```bash
git add lib/mcp/tools/memory.ts
git commit -m "feat(memory): wire search/context/consolidate tools to ExtApps widgets"
```

---

### Task 15: Widget Tests

**Files:**
- Create: `tests/mcp/tools/widgets/memory-search.test.ts`
- Create: `tests/mcp/tools/widgets/memory-consolidator.test.ts`
- Create: `tests/mcp/tools/widgets/memory-context.test.ts`

- [ ] **Step 1: Create memory-search widget test**

Create `tests/mcp/tools/widgets/memory-search.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('memory-search.html widget', () => {
  const html = readFileSync(join(process.cwd(), 'widgets', 'memory-search.html'), 'utf8')

  it('should contain ExtApps bundle placeholder', () => {
    expect(html).toContain('/*__EXT_APPS_BUNDLE__*/')
  })

  it('should reference MemorySearch app name', () => {
    expect(html).toContain('"MemorySearch"')
  })

  it('should handle duplicates_found status', () => {
    expect(html).toContain('duplicates_found')
    expect(html).toContain('pending_memory')
  })

  it('should render score breakdown', () => {
    expect(html).toContain('semantic_score')
    expect(html).toContain('keyword_score')
    expect(html).toContain('final_score')
  })

  it('should render stale hints', () => {
    expect(html).toContain('stale_hint')
    expect(html).toContain('stale-banner')
  })

  it('should support light theme', () => {
    expect(html).toContain('prefers-color-scheme: light')
  })
})
```

- [ ] **Step 2: Create memory-consolidator widget test**

Create `tests/mcp/tools/widgets/memory-consolidator.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('memory-consolidator.html widget', () => {
  const html = readFileSync(join(process.cwd(), 'widgets', 'memory-consolidator.html'), 'utf8')

  it('should contain ExtApps bundle placeholder', () => {
    expect(html).toContain('/*__EXT_APPS_BUNDLE__*/')
  })

  it('should reference MemoryConsolidator app name', () => {
    expect(html).toContain('"MemoryConsolidator"')
  })

  it('should handle duplicate groups', () => {
    expect(html).toContain('duplicate_groups')
    expect(html).toContain('max_similarity')
  })

  it('should handle stale memories', () => {
    expect(html).toContain('stale_memories')
  })

  it('should support light theme', () => {
    expect(html).toContain('prefers-color-scheme: light')
  })
})
```

- [ ] **Step 3: Create memory-context widget test**

Create `tests/mcp/tools/widgets/memory-context.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('memory-context.html widget', () => {
  const html = readFileSync(join(process.cwd(), 'widgets', 'memory-context.html'), 'utf8')

  it('should contain ExtApps bundle placeholder', () => {
    expect(html).toContain('/*__EXT_APPS_BUNDLE__*/')
  })

  it('should reference MemoryContext app name', () => {
    expect(html).toContain('"MemoryContext"')
  })

  it('should define category order', () => {
    expect(html).toContain('CATEGORY_ORDER')
    expect(html).toContain('"rule"')
    expect(html).toContain('"context"')
    expect(html).toContain('"decision"')
  })

  it('should render importance bars', () => {
    expect(html).toContain('importance-bar')
    expect(html).toContain('importance')
  })

  it('should support light theme', () => {
    expect(html).toContain('prefers-color-scheme: light')
  })
})
```

- [ ] **Step 4: Run widget tests**

Run: `npx vitest run tests/mcp/tools/widgets/memory-`

Expected: All 17 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/mcp/tools/widgets/memory-search.test.ts tests/mcp/tools/widgets/memory-consolidator.test.ts tests/mcp/tools/widgets/memory-context.test.ts
git commit -m "test(memory): add widget HTML tests for memory-search, consolidator, context"
```

---

### Task 16: Build Verification + Final Test Run

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`

Expected: All tests PASS. Fix any failures.

- [ ] **Step 2: Run production build**

Run: `npm run build`

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 3: Run lint**

Run: `npm run lint`

Expected: No lint errors.

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix(memory): address build/test issues from phase 2+3 implementation"
```
