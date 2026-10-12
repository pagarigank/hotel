-- Migration 012: Tenant-configurable, per-role navigation
-- Phase 1 (Configuration Engine) — persisted navigation tree overrides

-- role_code = '' represents the tenant-wide default tree.
-- Any other value targets the roles.code of an individual role.
CREATE TABLE IF NOT EXISTS navigation_configs (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role_code TEXT NOT NULL DEFAULT '',
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS navigation_configs_tenant_role_idx
  ON navigation_configs (tenant_id, role_code);
SELECT app.enable_tenant_rls('navigation_configs');
