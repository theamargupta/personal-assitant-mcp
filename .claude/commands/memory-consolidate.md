---
description: Generate SQL for memory duplicate and stale candidate inspection
---

# Memory Consolidation SQL

Output SQL only. Do not execute it.

Use SQL that inspects:
- duplicate candidates with cosine similarity >= 0.9 via `pa_match_memories`
- stale candidates across `pa_memory_items`

Include filters for:
- `user_id`
- active memories only
- optional `space_id`

The SQL should help review duplicates and stale records before any manual consolidation. Do not hard delete anything.
