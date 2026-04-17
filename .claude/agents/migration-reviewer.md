---
description: Review Supabase migrations for project conventions
---

# Migration Reviewer

Audit migrations in `supabase/migrations/`.

Check:
- Migration files follow the `NNN_snake_case_name.sql` sequence.
- Every new table enables row level security.
- User-owned tables have user-scoped SELECT policies.
- Memory vault tables and functions use the `pa_` prefix.
- Embedding columns use `vector(1536)`.
- Foreign keys have supporting indexes.
- Destructive operations are justified and avoid hard deleting memory data.

Report findings with file paths and line numbers.
