-- Miiziito SaaS platform schema (Super Admin / multi-tenant billing)
-- NOT wired into the app yet: Super Admin still uses data/platform/*.json.
-- This file is kept for a future migration; docker-compose only loads schema.sql.
-- Do not assume these tables exist at runtime unless you apply this file manually.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Tenants (cafes / restaurants)
CREATE TABLE IF NOT EXISTS saas_tenants (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  owner_name      TEXT NOT NULL DEFAULT '',
  email           TEXT NOT NULL DEFAULT '',
  phone           TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('active','trial','expired','suspended','cancelled','pending')),
  plan_id         TEXT,
  subscription_id TEXT,
  settings        JSONB NOT NULL DEFAULT '{}'::jsonb,
  usage           JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_activity_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saas_tenants_status ON saas_tenants (status);
CREATE INDEX IF NOT EXISTS idx_saas_tenants_email ON saas_tenants (lower(email));
CREATE INDEX IF NOT EXISTS idx_saas_tenants_created ON saas_tenants (created_at DESC);

-- Plans
CREATE TABLE IF NOT EXISTS saas_plans (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','disabled','archived')),
  display_order INT NOT NULL DEFAULT 0,
  entitlements  JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS saas_plan_prices (
  id            TEXT PRIMARY KEY,
  plan_id       TEXT NOT NULL REFERENCES saas_plans(id) ON DELETE CASCADE,
  billing_cycle TEXT NOT NULL
                CHECK (billing_cycle IN ('monthly','6months','yearly')),
  price         BIGINT NOT NULL DEFAULT 0,
  currency      TEXT NOT NULL DEFAULT 'IRT',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (plan_id, billing_cycle)
);

-- Subscriptions
CREATE TABLE IF NOT EXISTS saas_subscriptions (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES saas_tenants(id) ON DELETE CASCADE,
  plan_id         TEXT NOT NULL REFERENCES saas_plans(id),
  billing_cycle   TEXT NOT NULL
                  CHECK (billing_cycle IN ('monthly','6months','yearly')),
  status          TEXT NOT NULL DEFAULT 'trial'
                  CHECK (status IN (
                    'trial','active','past_due','grace_period',
                    'expired','cancelled','suspended'
                  )),
  price           BIGINT NOT NULL DEFAULT 0,
  currency        TEXT NOT NULL DEFAULT 'IRT',
  start_date      TIMESTAMPTZ,
  end_date        TIMESTAMPTZ,
  trial_end_date  TIMESTAMPTZ,
  auto_renew      BOOLEAN NOT NULL DEFAULT true,
  payment_status  TEXT NOT NULL DEFAULT 'unknown',
  cancelled_at    TIMESTAMPTZ,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saas_subs_tenant ON saas_subscriptions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_saas_subs_status ON saas_subscriptions (status);
CREATE INDEX IF NOT EXISTS idx_saas_subs_end ON saas_subscriptions (end_date);

-- SaaS billing payments (platform fees — separate from cafe POS payments)
CREATE TABLE IF NOT EXISTS saas_payments (
  id                      TEXT PRIMARY KEY,
  tenant_id               TEXT NOT NULL REFERENCES saas_tenants(id) ON DELETE CASCADE,
  subscription_id         TEXT REFERENCES saas_subscriptions(id) ON DELETE SET NULL,
  amount                  BIGINT NOT NULL DEFAULT 0,
  currency                TEXT NOT NULL DEFAULT 'IRT',
  status                  TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN (
                            'successful','pending','failed','refunded','cancelled','unknown'
                          )),
  provider                TEXT NOT NULL DEFAULT 'manual',
  provider_transaction_id TEXT,
  reference_number        TEXT,
  payment_method          TEXT NOT NULL DEFAULT 'manual',
  plan_id                 TEXT,
  billing_cycle           TEXT,
  metadata                JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saas_payments_tenant ON saas_payments (tenant_id);
CREATE INDEX IF NOT EXISTS idx_saas_payments_status ON saas_payments (status);
CREATE INDEX IF NOT EXISTS idx_saas_payments_created ON saas_payments (created_at DESC);

-- Coupons
CREATE TABLE IF NOT EXISTS saas_coupons (
  id              TEXT PRIMARY KEY,
  code            TEXT NOT NULL UNIQUE,
  discount_type   TEXT NOT NULL CHECK (discount_type IN ('percentage','fixed')),
  discount_value  BIGINT NOT NULL DEFAULT 0,
  start_date      TIMESTAMPTZ,
  end_date        TIMESTAMPTZ,
  usage_limit     INT,
  per_user_limit  INT,
  used_count      INT NOT NULL DEFAULT 0,
  applicable_plans JSONB NOT NULL DEFAULT '[]'::jsonb,
  minimum_payment BIGINT NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'active',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Super admin users & RBAC
CREATE TABLE IF NOT EXISTS saas_admin_users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  username      TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL DEFAULT '',
  role_id       TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active',
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS saas_roles (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_system   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS saas_admin_sessions (
  token       TEXT PRIMARY KEY,
  admin_id    TEXT NOT NULL REFERENCES saas_admin_users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  ip          TEXT,
  user_agent  TEXT,
  remember    BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_saas_admin_sessions_admin ON saas_admin_sessions (admin_id);

-- Support, notifications, audit
CREATE TABLE IF NOT EXISTS saas_support_tickets (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT REFERENCES saas_tenants(id) ON DELETE SET NULL,
  subject         TEXT NOT NULL,
  priority        TEXT NOT NULL DEFAULT 'normal'
                  CHECK (priority IN ('low','normal','high','urgent')),
  status          TEXT NOT NULL DEFAULT 'open'
                  CHECK (status IN (
                    'open','in_progress','waiting_customer','resolved','closed'
                  )),
  assigned_admin_id TEXT,
  messages        JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_reply_at   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS saas_notifications (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL DEFAULT '',
  type        TEXT NOT NULL DEFAULT 'system',
  channels    JSONB NOT NULL DEFAULT '["in_app"]'::jsonb,
  target      JSONB NOT NULL DEFAULT '{}'::jsonb,
  status      TEXT NOT NULL DEFAULT 'draft',
  sent_at     TIMESTAMPTZ,
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS saas_audit_logs (
  id          BIGSERIAL PRIMARY KEY,
  admin_id    TEXT,
  admin_email TEXT,
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   TEXT,
  ip          TEXT,
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saas_audit_created ON saas_audit_logs (created_at DESC);

CREATE TABLE IF NOT EXISTS saas_login_attempts (
  id          BIGSERIAL PRIMARY KEY,
  email       TEXT NOT NULL,
  ip          TEXT NOT NULL DEFAULT '',
  success     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saas_login_attempts_lookup
  ON saas_login_attempts (email, ip, created_at DESC);

CREATE TABLE IF NOT EXISTS saas_platform_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Default roles
INSERT INTO saas_roles (id, name, description, permissions, is_system) VALUES
  ('role_owner', 'Owner', 'Full platform access', '["*"]'::jsonb, true),
  ('role_super_admin', 'Super Admin', 'Broad operational access',
   '["cafes.read","cafes.write","subscriptions.read","subscriptions.write","payments.read","payments.refund","plans.read","plans.write","analytics.read","support.read","support.write","system.read","audit.read","notifications.write","admin_users.read"]'::jsonb, true),
  ('role_support', 'Support', 'Customer support',
   '["cafes.read","subscriptions.read","support.read","support.write","notifications.write"]'::jsonb, true),
  ('role_finance', 'Finance', 'Billing and payments',
   '["cafes.read","subscriptions.read","subscriptions.write","payments.read","payments.refund","plans.read","analytics.read","audit.read"]'::jsonb, true),
  ('role_manager', 'Manager', 'Read-heavy operations',
   '["cafes.read","subscriptions.read","payments.read","plans.read","analytics.read","support.read","audit.read"]'::jsonb, true)
ON CONFLICT (id) DO NOTHING;
