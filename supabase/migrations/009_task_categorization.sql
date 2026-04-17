-- ============================================================
-- Sathi: Task categorization (personal vs project)
-- ============================================================
--
-- Adds task_type + project to tasks so Claude Code sessions can
-- ask `get_task` and receive project rules + top-relevant memories
-- alongside the task row. Project value is free-text and joins to
-- pa_memory_items.project.

ALTER TABLE tasks
  ADD COLUMN task_type TEXT NOT NULL DEFAULT 'personal'
    CHECK (task_type IN ('personal', 'project'));

ALTER TABLE tasks
  ADD COLUMN project TEXT NULL;

ALTER TABLE tasks
  ADD CONSTRAINT tasks_project_required_for_project_type
  CHECK (task_type = 'personal' OR (task_type = 'project' AND project IS NOT NULL));

CREATE INDEX idx_tasks_user_type_project ON tasks (user_id, task_type, project);
