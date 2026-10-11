-- 002_iam_and_config.sql: Sessions, Settings Registry, Status Definitions, Actions, Custom Fields, Numbering

-- Sessions Table for rotating refresh tokens and device auditing
CREATE TABLE IF NOT EXISTS sessions (
  id UUID NOT NULL,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash TEXT NOT NULL,
  user_agent TEXT,
  ip_address TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS sessions_tenant_user_idx ON sessions (tenant_id, user_id);
SELECT app.enable_tenant_rls('sessions');

-- Settings Registry Table (Hierarchical resolution: system -> tenant -> branch -> outlet -> user)
CREATE TABLE IF NOT EXISTS settings (
  id UUID NOT NULL,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('system', 'tenant', 'branch', 'outlet', 'user')),
  scope_id UUID,
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  version INT NOT NULL DEFAULT 1,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, scope_type, scope_id, key)
);
CREATE INDEX IF NOT EXISTS settings_tenant_lookup_idx ON settings (tenant_id, scope_type, scope_id, key);
SELECT app.enable_tenant_rls('settings');

-- Status Definitions Table (Drives Board Colors, Icons, and System Invariants)
CREATE TABLE IF NOT EXISTS status_defs (
  id UUID NOT NULL,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  entity TEXT NOT NULL, -- 'unit' | 'reservation' | 'table' | 'hk_task' | 'order' | 'voucher'
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  color_token TEXT NOT NULL,
  icon TEXT,
  sort INT NOT NULL DEFAULT 0,
  is_sellable BOOLEAN NOT NULL DEFAULT false,
  is_occupied BOOLEAN NOT NULL DEFAULT false,
  is_dirty BOOLEAN NOT NULL DEFAULT false,
  blocks_booking BOOLEAN NOT NULL DEFAULT false,
  system_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, branch_id, entity, code)
);
CREATE INDEX IF NOT EXISTS status_defs_tenant_entity_idx ON status_defs (tenant_id, entity, sort);
SELECT app.enable_tenant_rls('status_defs');

-- Status Transitions Table (State Machine Allowed Transitions)
CREATE TABLE IF NOT EXISTS status_transitions (
  id UUID NOT NULL,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity TEXT NOT NULL,
  from_code TEXT NOT NULL,
  to_code TEXT NOT NULL,
  permission TEXT NOT NULL,
  requires_reason BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, entity, from_code, to_code)
);
CREATE INDEX IF NOT EXISTS status_transitions_lookup_idx ON status_transitions (tenant_id, entity, from_code);
SELECT app.enable_tenant_rls('status_transitions');

-- Server-driven Action Definitions Table (Tile & Page Context Menus)
CREATE TABLE IF NOT EXISTS action_defs (
  id UUID NOT NULL,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  entity TEXT NOT NULL, -- 'unit' | 'reservation' | 'table' | 'page:board' ...
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  icon TEXT,
  group_code TEXT,
  permission TEXT NOT NULL,
  visible_when JSONB NOT NULL DEFAULT '{}',
  target JSONB NOT NULL,
  sort INT NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, branch_id, entity, code)
);
CREATE INDEX IF NOT EXISTS action_defs_tenant_entity_idx ON action_defs (tenant_id, entity, sort);
SELECT app.enable_tenant_rls('action_defs');

-- Custom Fields Definitions Table (Stored in attrs jsonb on entities)
CREATE TABLE IF NOT EXISTS custom_field_defs (
  id UUID NOT NULL,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity TEXT NOT NULL,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  type TEXT NOT NULL,
  required BOOLEAN NOT NULL DEFAULT false,
  options JSONB NOT NULL DEFAULT '[]',
  validation JSONB NOT NULL DEFAULT '{}',
  show_in_list BOOLEAN NOT NULL DEFAULT false,
  print BOOLEAN NOT NULL DEFAULT false,
  sort INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, entity, key)
);
CREATE INDEX IF NOT EXISTS custom_field_defs_tenant_entity_idx ON custom_field_defs (tenant_id, entity, sort);
SELECT app.enable_tenant_rls('custom_field_defs');

-- Numbering Sequences Table (with FOR UPDATE gapless row locking)
CREATE TABLE IF NOT EXISTS numbering_sequences (
  id UUID NOT NULL,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,
  prefix TEXT NOT NULL,
  pattern TEXT NOT NULL DEFAULT '{PREFIX}-{YYYY}-{#6}',
  reset_policy TEXT NOT NULL DEFAULT 'yearly' CHECK (reset_policy IN ('never', 'yearly', 'monthly')),
  next_no INT NOT NULL DEFAULT 1,
  is_gapless BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, branch_id, doc_type)
);
CREATE INDEX IF NOT EXISTS numbering_sequences_lookup_idx ON numbering_sequences (tenant_id, branch_id, doc_type);
SELECT app.enable_tenant_rls('numbering_sequences');

-- Grant runtime permissions to innkeeper_app and innkeeper_readonly
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO innkeeper_app;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO innkeeper_readonly;
