---
description: Add the next Supabase migration
---

# Add Migration

Create the next migration in `supabase/migrations/`.

1. Use the next numeric prefix after `008_memory_hybrid_search.sql`; the next migration is `009_snake_case_name.sql`.
2. Keep names lowercase snake_case.
3. Enable RLS on every new table.
4. Add user-scoped SELECT policies for user-owned tables.
5. Use the `pa_` prefix for all memory vault tables and functions.
6. Use `vector(1536)` for all embedding columns.
7. Add indexes for every foreign key.
8. Prefer soft deletes over hard deletes.
9. Include rollback notes in SQL comments if a change is difficult to reverse.
