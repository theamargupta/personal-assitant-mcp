# Memory Vaults — Phase 2 & 3 Design Spec

Builds on Phase 1 (complete): 10 MCP tools, pgvector semantic search, spaces, temporal fields, importance scoring, dashboard UI.

---

## Phase 2 — Smart Save (Duplicate Detection)

### Overview

When `save_memory` is called, check for similar existing memories before saving. If duplicates are found, return them to the client AI for decision — no extra LLM calls, no cron.

### Flow

```
save_memory(title, content, ...)
  │
  ├─ generate embedding (existing OpenAI call)
  ├─ call pa_match_memories(threshold=0.90, limit=5)
  │
  ├─ NO matches (similarity < 0.90)
  │   └─ save normally → { status: "saved", memory_id }
  │
  └─ MATCHES found
      └─ DON'T save. Return:
         {
           status: "duplicates_found",
           pending_memory: { title, content, category, tags, project, space },
           similar_memories: [
             { id, title, content, similarity, category, updated_at }
           ],
           suggestion: "Found N similar memories. Review before saving."
         }
```

### Client Decision

After receiving `duplicates_found`, the AI client decides:

| Action | How |
|--------|-----|
| Save anyway (new memory) | Call `save_memory` again with `force: true` |
| Update existing | Call `update_memory` on the matched memory |
| Skip | Do nothing |

### Schema Changes

**`SaveMemorySchema`** — add optional `force` boolean:

```typescript
export const SaveMemorySchema = z.object({
  space: z.string().min(1).default("personal"),
  title: z.string().min(1).max(255),
  content: z.string().min(1).max(10000),
  category: MemoryCategoryEnum.default("note"),
  tags: z.array(z.string()).default([]),
  project: z.string().optional(),
  force: z.boolean().default(false),  // NEW: skip duplicate check
});
```

**`pa_match_memories()`** — update threshold default from 0.3 to 0.90 for the duplicate check call. The search tool continues using 0.3.

### Code Changes

**File: `lib/memory/items.ts`** — modify `saveMemory()`:

```
1. Validate input
2. Resolve space, generate embedding (unchanged)
3. IF NOT force:
   a. Call pa_match_memories(embedding, user_id, threshold=0.90, limit=5)
   b. If matches found → return { status: "duplicates_found", ... }
4. Insert into pa_memory_items (unchanged)
5. Log + return { status: "saved", memory_id }
```

**File: `lib/mcp/tools/memory.ts`** — update `save_memory` tool handler to handle the new response shape and pass `force` param.

### No New Tables, No New API Keys, No Cron

- Reuses existing `pa_match_memories()` RPC
- Reuses existing OpenAI embedding call (already happens on save)
- Decision logic lives in the client AI (zero token cost)

---

## Phase 3A — Hybrid Search

### Overview

Improve `search_memory` by combining semantic similarity + keyword matching + importance scoring. No extra OpenAI calls.

### Scoring Formula

```
final_score = (0.5 × semantic_similarity) + (0.3 × keyword_rank_normalized) + (0.2 × importance / 10)
```

### Database Changes

**Migration: `008_memory_hybrid_search.sql`**

```sql
-- Add tsvector column for full-text search
ALTER TABLE pa_memory_items
  ADD COLUMN search_vector tsvector;

-- Populate existing rows
UPDATE pa_memory_items
SET search_vector = to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, ''));

-- Auto-update trigger
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
```

**New RPC: `pa_hybrid_search()`**

```sql
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

### Code Changes

**File: `lib/memory/items.ts`** — update `searchMemories()`:
- Call `pa_hybrid_search()` instead of `pa_match_memories()`
- Pass both `query_embedding` and raw `query_text`
- Return `semantic_score`, `keyword_score`, `final_score` in results

**File: `lib/mcp/tools/memory.ts`** — update `search_memory` tool response to include score breakdown.

---

## Phase 3B — Stale Hints

### Overview

When `search_memory` or `list_memories` returns results, attach a `stale_hint` field to memories that appear outdated. No extra API calls — pure SQL logic.

### Staleness Rules

| Condition | Hint |
|-----------|------|
| `valid_at` older than 90 days AND `importance < 2.0` | "This memory is N months old with low access. May be outdated." |
| `invalid_at` is NOT NULL (already superseded) | "This memory has been superseded." |

### Code Changes

**File: `lib/memory/items.ts`** — add `computeStaleHint()` helper:

```typescript
function computeStaleHint(memory: MemoryItem): string | null {
  const now = new Date();
  const validAt = new Date(memory.valid_at);
  const daysSinceValid = Math.floor((now.getTime() - validAt.getTime()) / (1000 * 60 * 60 * 24));

  if (memory.invalid_at) {
    return "This memory has been superseded.";
  }

  if (daysSinceValid > 90 && memory.importance < 2.0) {
    const months = Math.floor(daysSinceValid / 30);
    return `This memory is ${months} month${months > 1 ? 's' : ''} old with low access (importance: ${memory.importance.toFixed(1)}). May be outdated.`;
  }

  return null;
}
```

Applied in `searchMemories()` and `listMemories()` — each result gets an optional `stale_hint` field.

### Response Shape Change

```json
{
  "id": "...",
  "title": "Working on Project X",
  "content": "...",
  "stale_hint": "This memory is 6 months old with low access (importance: 0.3). May be outdated."
}
```

`stale_hint` is `null` (omitted) for fresh/active memories.

---

## Phase 3C — `consolidate_memories` Tool

### Overview

New MCP tool for on-demand cleanup. Client AI calls it when user asks to clean up their vault. Finds duplicates and stale memories, returns them for review. No auto-deletion.

### Tool Definition

```typescript
ConsolidateMemoriesSchema = z.object({
  space: z.string().optional(),        // limit to a space (slug)
  mode: z.enum(["duplicates", "stale", "both"]).default("both"),
});
```

### Behavior

**Duplicates mode:**
1. For each active memory, find others with similarity > 0.90 (reuse `pa_match_memories`)
2. Group into clusters (deduplicate: if A matches B, don't also report B matches A)
3. Return clusters with similarity scores

```json
{
  "duplicate_groups": [
    {
      "memories": [
        { "id": "a1", "title": "Budget rule for groceries", "importance": 4.2, "created_at": "..." },
        { "id": "b2", "title": "Monthly grocery budget rule", "importance": 1.0, "created_at": "..." }
      ],
      "max_similarity": 0.94
    }
  ],
  "total_groups": 1
}
```

**Stale mode:**
1. Query: `valid_at < now() - 90 days AND importance < 2.0 AND is_active = true AND invalid_at IS NULL`
2. Also include: `invalid_at IS NOT NULL AND is_active = true` (superseded but not deleted)

```json
{
  "stale_memories": [
    { "id": "c3", "title": "Working on Project X", "valid_at": "2025-10-01", "importance": 0.3, "reason": "6 months old, low access" }
  ],
  "total_stale": 1
}
```

**Both mode:** returns both `duplicate_groups` and `stale_memories`.

### Client AI Follow-up

After seeing results, the client suggests actions and the user decides:
- "Merge these two?" → client calls `update_memory` + `delete_memory`
- "Delete this stale one?" → client calls `delete_memory`
- "Keep all" → do nothing

### Performance Note

Duplicate detection scans all active memories per space. For large vaults (1000+ memories), this could be slow. Mitigate by:
- Processing in batches of 50
- Only comparing within same space
- Early exit if no embeddings match threshold

---

## Rich Content — Widgets & Images for Memory Tools

Following the existing pattern (`registerAppTool` + `_meta.ui.resourceUri` + ExtApps HTML widgets), upgrade select memory tools to return interactive HTML widgets and/or SVG images alongside the text JSON.

### Tools Getting Rich Content

| Tool | Widget | SVG Image | Rationale |
|------|--------|-----------|-----------|
| `search_memory` | `memory-search.html` | No | Card layout: results with hybrid scores, category badges, stale hints, similarity bars |
| `consolidate_memories` | `memory-consolidator.html` | No | Duplicate groups with similarity %, stale list with age/importance — interactive review UI |
| `get_context` | `memory-context.html` | No | Project memories grouped by category (rules, decisions, context, notes) with importance indicators |
| `save_memory` (duplicates_found) | Reuse `memory-search.html` | No | Show similar memories when duplicates detected — same card layout |

CRUD tools (`save`, `get`, `update`, `delete`, `list_spaces`, `create_space`, `get_rules`, `list_memories`) stay text-only — simple operations like `create_habit`.

### Widget Architecture

All widgets follow the existing project pattern:

```
widgets/<name>.html
  ├─ Standalone HTML + CSS (dark theme, neon #c8ff00 accents)
  ├─ <script type="module"> with /*__EXT_APPS_BUNDLE__*/ placeholder
  ├─ ExtApps.App instance with ontoolresult callback
  └─ Parses content[0].text JSON and renders UI
```

### Widget 1: `memory-search.html`

Used by: `search_memory`, `save_memory` (duplicates_found)

**Layout:**
- Header: query text + result count
- Cards per memory:
  - Title (bold) + category badge (colored pill)
  - Content preview (3-line clamp)
  - Score bar: `final_score` visualized as horizontal bar (#c8ff00)
  - Score breakdown: `semantic: 0.82 | keyword: 0.45 | importance: 3.2`
  - Tags as #hashtag pills
  - Project badge (if set)
  - Stale hint banner (amber) if present
- For `duplicates_found`: header changes to "Similar memories found" with pending memory shown at top

### Widget 2: `memory-consolidator.html`

Used by: `consolidate_memories`

**Layout:**
- Tab bar: Duplicates | Stale | Both (reflects mode)
- **Duplicates section:**
  - Grouped cards — each group shows 2+ memories side by side
  - Similarity % badge between paired memories
  - Visual diff highlights (which parts differ)
  - Importance scores shown per memory
- **Stale section:**
  - List of stale memories with:
    - Age in months
    - Importance score (low = dim bar)
    - Reason text ("6 months old, low access")
- Summary footer: "X duplicate groups, Y stale memories found"

### Widget 3: `memory-context.html`

Used by: `get_context`

**Layout:**
- Header: project name + total memory count
- Grouped sections by category (same order as tool: rules → context → decisions → notes → rest)
  - Section header with category icon + count
  - Memory cards: title, content preview, importance bar, tags
- Importance visualized as thin horizontal bar per card

### Tool Registration Changes

**File: `lib/mcp/tools/memory.ts`** — switch `search_memory`, `get_context`, `consolidate_memories` from `server.tool()` to `registerAppTool()`:

```typescript
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server'
import { WIDGET_URIS } from '@/lib/mcp/widgets'

// search_memory
registerAppTool(
  server,
  'search_memory',
  {
    description: '...',
    inputSchema: { ... },
    _meta: { ui: { resourceUri: WIDGET_URIS.memorySearch } },
  },
  async (params, { authInfo }) => {
    // ... handler returns content: [{ type: 'text', text: JSON.stringify(response) }]
  }
)
```

**File: `lib/mcp/widgets.ts`** — register 3 new widgets:

```typescript
const WIDGETS: WidgetDef[] = [
  // ... existing 5 widgets
  { name: 'Memory Search', filename: 'memory-search.html', uri: 'ui://widgets/memory-search.html' },
  { name: 'Memory Consolidator', filename: 'memory-consolidator.html', uri: 'ui://widgets/memory-consolidator.html' },
  { name: 'Memory Context', filename: 'memory-context.html', uri: 'ui://widgets/memory-context.html' },
]

export const WIDGET_URIS = {
  // ... existing URIs
  memorySearch: 'ui://widgets/memory-search.html',
  memoryConsolidator: 'ui://widgets/memory-consolidator.html',
  memoryContext: 'ui://widgets/memory-context.html',
} as const
```

### Theme

All widgets use the existing PA MCP design tokens:
- Background: transparent (inherits MCP client theme)
- Text: `#fafafa` (dark) / `#1a1a1a` (light via `prefers-color-scheme`)
- Accent: `#c8ff00` (dark) / `#65a300` (light)
- Cards: `rgba(255,255,255,0.02)` border `rgba(255,255,255,0.04)`
- Font: `system-ui, sans-serif` / monospace for scores

---

## Files Changed (Summary)

| File | Change |
|------|--------|
| `lib/memory/types.ts` | Add `force` to SaveMemorySchema, add ConsolidateMemoriesSchema |
| `lib/memory/items.ts` | Duplicate check in saveMemory(), hybrid search in searchMemories(), stale hints, consolidate logic |
| `lib/mcp/tools/memory.ts` | Switch search/context to registerAppTool, update save_memory handler, add consolidate_memories (total: 11 tools) |
| `lib/mcp/widgets.ts` | Register 3 new widgets + WIDGET_URIS entries |
| `widgets/memory-search.html` | NEW — search results + duplicate detection card UI |
| `widgets/memory-consolidator.html` | NEW — duplicate groups + stale memory review UI |
| `widgets/memory-context.html` | NEW — project context grouped by category |
| `supabase/migrations/008_memory_hybrid_search.sql` | search_vector column, trigger, GIN index, pa_hybrid_search() RPC |

## No New Dependencies

- No new API keys
- No new npm packages
- No cron jobs
- No extra LLM calls
- PostgreSQL full-text search is built-in
- All decision logic delegated to client AI
- Widgets use existing ExtApps pattern (already in project)

## Success Criteria

1. `save_memory` detects duplicates (>0.90) and returns them for client decision
2. `save_memory` with `force: true` bypasses duplicate check
3. `search_memory` returns hybrid scores (semantic + keyword + importance)
4. Keyword-heavy queries (e.g., exact project name) rank better than semantic-only
5. Stale hints appear on old, low-importance memories in search/list results
6. `consolidate_memories` finds duplicate clusters and stale memories
7. No extra OpenAI calls beyond existing embedding generation
8. All changes backward-compatible — existing tool callers unaffected
9. `search_memory` renders interactive card widget in MCP clients that support ExtApps
10. `consolidate_memories` renders duplicate groups + stale list widget
11. `get_context` renders grouped category view widget
12. All widgets support dark/light theme via prefers-color-scheme
