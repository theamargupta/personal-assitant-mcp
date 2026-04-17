# Migrations
- NNN_snake_case_name.sql in `supabase/migrations/`. Next NNN is 009.
- `pa_` prefix for all memory vault tables.
- Every new table: `enable row level security` + user-scoped SELECT policy.
- Embedding columns: `vector(1536)` only.
- FK indexes required.
