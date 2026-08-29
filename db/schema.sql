-- Miiziito PostgreSQL schema
-- Document collections mirror JSON files per sandbox (live = '', dev = 'dev', …)

CREATE TABLE IF NOT EXISTS collections (
  sandbox_id  TEXT        NOT NULL DEFAULT '',
  name        TEXT        NOT NULL,
  data        JSONB       NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (sandbox_id, name),
  CONSTRAINT collections_name_check CHECK (
    name IN (
      'orders', 'invoices', 'tables', 'menu_overrides', 'sessions', 'reservations',
      'payment_terminals', 'payments', 'payment_attempts'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_collections_updated
  ON collections (sandbox_id, updated_at DESC);

-- Monotonic change counter for live stream / polling (replaces file mtime)
CREATE TABLE IF NOT EXISTS change_log (
  id          BIGSERIAL   PRIMARY KEY,
  sandbox_id  TEXT        NOT NULL DEFAULT '',
  happened_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_change_log_sandbox
  ON change_log (sandbox_id, id DESC);

-- Seed empty live sandbox rows (migration script fills from JSON)
INSERT INTO collections (sandbox_id, name, data) VALUES
  ('', 'orders',        '[]'::jsonb),
  ('', 'invoices',      '[]'::jsonb),
  ('', 'tables',        '{"regions":[],"states":{}}'::jsonb),
  ('', 'menu_overrides','{}'::jsonb),
  ('', 'sessions',      '{}'::jsonb),
  ('', 'reservations',  '[]'::jsonb),
  ('', 'payment_terminals', '[]'::jsonb),
  ('', 'payments', '[]'::jsonb),
  ('', 'payment_attempts', '[]'::jsonb)
ON CONFLICT (sandbox_id, name) DO NOTHING;
