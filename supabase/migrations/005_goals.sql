-- ============================================================
-- PA MCP: Goals module
-- ============================================================

-- ── goals ───────────────────────────────────────────────────

CREATE TABLE goals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT,
  goal_type       TEXT NOT NULL CHECK (goal_type IN ('outcome', 'milestone')),

  -- Outcome goal fields (auto-tracked)
  metric_type     TEXT CHECK (metric_type IN (
    'habit_streak', 'habit_completion', 'tasks_completed', 'spending_limit'
  )),
  metric_ref_id   UUID,              -- habit_id for habit goals, category_id for spending goals, NULL for tasks
  target_value    NUMERIC(12, 2),     -- e.g. streak >= 30, completion >= 90%, tasks >= 10, spending <= 5000

  -- Timeframe
  is_recurring    BOOLEAN DEFAULT false,
  recurrence      TEXT CHECK (recurrence IN ('weekly', 'monthly')),
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,

  -- Status
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'failed', 'archived')),

  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_goals_user_id ON goals(user_id);
CREATE INDEX idx_goals_status ON goals(user_id, status);
CREATE INDEX idx_goals_dates ON goals(user_id, start_date, end_date);
CREATE INDEX idx_goals_type ON goals(user_id, goal_type);

ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own goals"
  ON goals FOR ALL
  USING (user_id = auth.uid());

-- ── goal_milestones ─────────────────────────────────────────

CREATE TABLE goal_milestones (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id     UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  completed   BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_milestones_goal ON goal_milestones(goal_id);
CREATE INDEX idx_milestones_user ON goal_milestones(user_id);

ALTER TABLE goal_milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own milestones"
  ON goal_milestones FOR ALL
  USING (user_id = auth.uid());
