# Migrations
- NNN_snake_case_name.sql in `supabase/migrations/`. Next NNN is 011.
- `010_task_subtasks.sql` adds `parent_task_id` + `position` + `idx_tasks_parent` + `prevent_nested_subtasks` trigger (1-level subtasks; trigger enforces parent→child inheritance of `task_type`/`project`).
- `pa_` prefix for all memory vault tables.
- Every new table: `enable row level security` + user-scoped SELECT policy.
- Embedding columns: `vector(1536)` only.
- FK indexes required.
