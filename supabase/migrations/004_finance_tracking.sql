-- ============================================================
-- PA MCP: Finance Tracking tables
-- ============================================================

-- ── spending_categories ─────────────────────────────────────

CREATE TABLE spending_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  icon        TEXT NOT NULL DEFAULT '💰',
  is_preset   BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_categories_user_id ON spending_categories(user_id);
CREATE UNIQUE INDEX idx_categories_unique_name ON spending_categories(user_id, name);

ALTER TABLE spending_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own categories"
  ON spending_categories FOR ALL
  USING (user_id = auth.uid());

-- ── transactions ────────────────────────────────────────────

CREATE TABLE transactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount            NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  merchant          TEXT,
  source_app        TEXT CHECK (source_app IN ('phonepe', 'gpay', 'paytm', 'bank', 'manual', 'other')),
  category_id       UUID REFERENCES spending_categories(id) ON DELETE SET NULL,
  note              TEXT,
  transaction_date  TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_sms           TEXT,
  is_auto_detected  BOOLEAN DEFAULT false,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_category ON transactions(user_id, category_id);
CREATE INDEX idx_transactions_date ON transactions(user_id, transaction_date);
CREATE INDEX idx_transactions_uncategorized ON transactions(user_id)
  WHERE category_id IS NULL;

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own transactions"
  ON transactions FOR ALL
  USING (user_id = auth.uid());

-- ── preset categories seed function ─────────────────────────

CREATE OR REPLACE FUNCTION seed_preset_categories(target_user_id UUID)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO spending_categories (user_id, name, icon, is_preset) VALUES
    (target_user_id, 'Food', '🍕', true),
    (target_user_id, 'Transport', '🚗', true),
    (target_user_id, 'Shopping', '🛍️', true),
    (target_user_id, 'Bills', '📄', true),
    (target_user_id, 'Entertainment', '🎬', true),
    (target_user_id, 'Health', '💊', true),
    (target_user_id, 'Education', '📚', true),
    (target_user_id, 'Groceries', '🛒', true),
    (target_user_id, 'Subscriptions', '🔄', true),
    (target_user_id, 'Other', '💰', true)
  ON CONFLICT (user_id, name) DO NOTHING;
END;
$$;

-- ── spending summary function ───────────────────────────────

CREATE OR REPLACE FUNCTION get_spending_summary(
  target_user_id UUID,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ
)
RETURNS TABLE (
  category_name TEXT,
  category_icon TEXT,
  total_amount NUMERIC,
  transaction_count BIGINT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(sc.name, 'Uncategorized') AS category_name,
    COALESCE(sc.icon, '❓') AS category_icon,
    SUM(t.amount) AS total_amount,
    COUNT(*) AS transaction_count
  FROM transactions t
  LEFT JOIN spending_categories sc ON sc.id = t.category_id
  WHERE t.user_id = target_user_id
    AND t.transaction_date >= start_date
    AND t.transaction_date <= end_date
  GROUP BY sc.name, sc.icon
  ORDER BY total_amount DESC;
END;
$$;
