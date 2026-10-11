-- 001_core_schema.sql: Core schema, session helpers, RLS functions, and foundational tables

CREATE EXTENSION IF NOT EXISTS "btree_gist";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Migration history table
CREATE TABLE IF NOT EXISTS _migrations (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  checksum TEXT NOT NULL,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Schema app for session state functions
CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.tenant_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.tenant_id', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION app.branch_ids() RETURNS uuid[] LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.branch_ids', true), '')::uuid[];
$$;

-- Helper procedure to enable and force RLS on tenant tables
CREATE OR REPLACE FUNCTION app.enable_tenant_rls(target_table regclass) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', target_table);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', target_table);
  
  -- Drop existing policy if exists to allow idempotency
  EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %s', target_table);
  
  EXECUTE format(
    'CREATE POLICY tenant_isolation ON %s USING (tenant_id = app.tenant_id()) WITH CHECK (tenant_id = app.tenant_id())',
    target_table
  );
END;
$$;

-- Global Platform Tables (No RLS, audited system access only)
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'standard',
  active BOOLEAN NOT NULL DEFAULT true,
  attrs JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);

-- Tenant-Scoped Tables (RLS Enforced, tenant_id leading index)
CREATE TABLE IF NOT EXISTS branches (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Manila',
  base_currency CHAR(3) NOT NULL DEFAULT 'PHP',
  business_date DATE NOT NULL DEFAULT CURRENT_DATE,
  active BOOLEAN NOT NULL DEFAULT true,
  attrs JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ,
  UNIQUE (tenant_id, code)
);
CREATE INDEX IF NOT EXISTS branches_tenant_idx ON branches (tenant_id, active);
SELECT app.enable_tenant_rls('branches');

CREATE TABLE IF NOT EXISTS memberships (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);
CREATE INDEX IF NOT EXISTS memberships_tenant_idx ON memberships (tenant_id, user_id);
SELECT app.enable_tenant_rls('memberships');

CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  permissions TEXT[] NOT NULL DEFAULT '{}',
  limits JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
CREATE INDEX IF NOT EXISTS roles_tenant_idx ON roles (tenant_id, code);
SELECT app.enable_tenant_rls('roles');

CREATE TABLE IF NOT EXISTS membership_roles (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  membership_id UUID NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  branch_scope UUID[] DEFAULT NULL, -- NULL indicates all branches
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS membership_roles_tenant_idx ON membership_roles (tenant_id, membership_id);
SELECT app.enable_tenant_rls('membership_roles');

-- Transactional Outbox Table
CREATE TABLE IF NOT EXISTS outbox_events (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  aggregate_type TEXT NOT NULL,
  aggregate_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'failed')),
  retry_count INT NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS outbox_tenant_status_idx ON outbox_events (tenant_id, status, created_at);
SELECT app.enable_tenant_rls('outbox_events');

-- Consumer Inbox Table (for deduplication)
CREATE TABLE IF NOT EXISTS inbox_events (
  id UUID PRIMARY KEY,
  consumer_name TEXT NOT NULL,
  event_id UUID NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (consumer_name, event_id)
);

-- Idempotency Keys Table
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT NOT NULL,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  response_status INT,
  response_headers JSONB,
  response_body JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, key)
);
CREATE INDEX IF NOT EXISTS idempotency_tenant_idx ON idempotency_keys (tenant_id, key);
SELECT app.enable_tenant_rls('idempotency_keys');

-- Partitioned Audit Log Table (partitioned by range on created_at)
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  branch_id UUID,
  user_id UUID,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  before_diff JSONB,
  after_diff JSONB,
  ip_address TEXT,
  user_agent TEXT,
  correlation_id TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (created_at, id)
) PARTITION BY RANGE (created_at);

-- Initial monthly partitions for audit_log
CREATE TABLE IF NOT EXISTS audit_log_2026_10 PARTITION OF audit_log
  FOR VALUES FROM ('2026-10-01 00:00:00+00') TO ('2026-11-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS audit_log_2026_11 PARTITION OF audit_log
  FOR VALUES FROM ('2026-11-01 00:00:00+00') TO ('2026-12-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS audit_log_default PARTITION OF audit_log DEFAULT;

CREATE INDEX IF NOT EXISTS audit_log_tenant_idx ON audit_log (tenant_id, created_at);
SELECT app.enable_tenant_rls('audit_log');

-- Sample Tenant Table (used to verify RLS leakage in CI test suite)
CREATE TABLE IF NOT EXISTS test_tenant_records (
  id UUID NOT NULL,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ,
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS test_tenant_records_idx ON test_tenant_records (tenant_id, created_at);
SELECT app.enable_tenant_rls('test_tenant_records');

-- Grant runtime permissions to innkeeper_app and innkeeper_readonly
GRANT USAGE ON SCHEMA app TO innkeeper_app, innkeeper_readonly;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO innkeeper_app, innkeeper_readonly;

GRANT USAGE ON SCHEMA public TO innkeeper_app, innkeeper_readonly;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO innkeeper_app;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO innkeeper_readonly;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO innkeeper_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO innkeeper_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT EXECUTE ON FUNCTIONS TO innkeeper_app, innkeeper_readonly;
