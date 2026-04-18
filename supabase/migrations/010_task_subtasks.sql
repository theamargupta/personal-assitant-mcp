-- ============================================================
-- Sathi: Task subtasks (1-level only)
-- ============================================================
--
-- Adds parent_task_id + position to tasks. Subtasks inherit
-- task_type + project from their parent (enforced by trigger).
-- Nesting beyond 1 level is blocked.

ALTER TABLE tasks
  ADD COLUMN parent_task_id UUID NULL REFERENCES tasks(id) ON DELETE CASCADE;

ALTER TABLE tasks
  ADD COLUMN position INTEGER NULL;

CREATE INDEX idx_tasks_parent
  ON tasks(parent_task_id, position)
  WHERE parent_task_id IS NOT NULL;

-- ── prevent 2+ level nesting + enforce inheritance ──────────
CREATE OR REPLACE FUNCTION prevent_nested_subtasks()
RETURNS TRIGGER AS $$
DECLARE
  grandparent UUID;
  parent_type TEXT;
  parent_project TEXT;
  parent_user UUID;
BEGIN
  IF NEW.parent_task_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.parent_task_id = NEW.id THEN
    RAISE EXCEPTION 'Task cannot be its own parent';
  END IF;

  SELECT parent_task_id, task_type, project, user_id
    INTO grandparent, parent_type, parent_project, parent_user
  FROM tasks
  WHERE id = NEW.parent_task_id;

  IF parent_user IS NULL THEN
    RAISE EXCEPTION 'Parent task not found';
  END IF;

  IF grandparent IS NOT NULL THEN
    RAISE EXCEPTION 'Subtasks cannot have subtasks (1-level only)';
  END IF;

  IF NEW.user_id IS DISTINCT FROM parent_user THEN
    RAISE EXCEPTION 'Subtask user_id must match parent';
  END IF;

  IF NEW.task_type IS DISTINCT FROM parent_type THEN
    RAISE EXCEPTION 'Subtask task_type must inherit from parent (%), got %', parent_type, NEW.task_type;
  END IF;

  IF parent_type = 'project' AND NEW.project IS DISTINCT FROM parent_project THEN
    RAISE EXCEPTION 'Subtask project must inherit from parent (%), got %', parent_project, NEW.project;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_nested_subtasks
  BEFORE INSERT OR UPDATE OF parent_task_id, task_type, project ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION prevent_nested_subtasks();
