# Memory Vaults
- Tables prefixed `pa_` (coexist with memory-mcp on the same Supabase DB).
- Embeddings: 1536-dim.
- Duplicate detection: `pa_match_memories` at cosine similarity 0.9. `save_memory` returns `status: duplicate_candidate` unless `force: true`.
- Hybrid search: `pa_hybrid_search` (vector + tsvector). `search_vector` column maintained by trigger.
- Stale hints: `computeStaleHint(importance, valid_at, updated_at)` - server-side only.
- `consolidate_memories` returns duplicate groups and stale candidates.
