-- 004_properties_and_units.sql: Property Structure, Unit Types, Units, Status Log & OOO Blocks

-- 1. Property Types
CREATE TABLE IF NOT EXISTS property_types (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  UNIQUE (tenant_id, code)
);
CREATE INDEX IF NOT EXISTS property_types_tenant_idx ON property_types (tenant_id);
SELECT app.enable_tenant_rls('property_types');

-- 2. Amenities
CREATE TABLE IF NOT EXISTS amenities (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  icon TEXT,
  category TEXT NOT NULL DEFAULT 'room',
  sort INT NOT NULL DEFAULT 0,
  UNIQUE (tenant_id, code)
);
CREATE INDEX IF NOT EXISTS amenities_tenant_idx ON amenities (tenant_id, category);
SELECT app.enable_tenant_rls('amenities');

-- 3. Buildings
CREATE TABLE IF NOT EXISTS buildings (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  sort INT NOT NULL DEFAULT 0,
  UNIQUE (tenant_id, branch_id, code)
);
CREATE INDEX IF NOT EXISTS buildings_tenant_idx ON buildings (tenant_id, branch_id);
SELECT app.enable_tenant_rls('buildings');

-- 4. Floors
CREATE TABLE IF NOT EXISTS floors (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  building_id UUID REFERENCES buildings(id) ON DELETE SET NULL,
  number TEXT NOT NULL,
  name TEXT NOT NULL,
  sort INT NOT NULL DEFAULT 0,
  UNIQUE (tenant_id, branch_id, number)
);
CREATE INDEX IF NOT EXISTS floors_tenant_idx ON floors (tenant_id, branch_id);
SELECT app.enable_tenant_rls('floors');

-- 5. Unit Types
CREATE TABLE IF NOT EXISTS unit_types (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'room' CHECK (kind IN ('room', 'suite', 'villa', 'apartment', 'dorm_bed', 'hall')),
  max_adults INT NOT NULL DEFAULT 2,
  max_children INT NOT NULL DEFAULT 0,
  max_occupancy INT NOT NULL DEFAULT 2,
  base_rate NUMERIC(19,4) NOT NULL DEFAULT 0.0000,
  amenities_ids UUID[] DEFAULT '{}',
  sort INT NOT NULL DEFAULT 0,
  attrs JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ,
  UNIQUE (tenant_id, branch_id, code)
);
CREATE INDEX IF NOT EXISTS unit_types_tenant_idx ON unit_types (tenant_id, branch_id, code);
SELECT app.enable_tenant_rls('unit_types');

-- 6. Units
CREATE TABLE IF NOT EXISTS units (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  unit_type_id UUID NOT NULL REFERENCES unit_types(id) ON DELETE RESTRICT,
  building TEXT,
  floor TEXT,
  number TEXT NOT NULL,
  name TEXT,
  status_code TEXT NOT NULL DEFAULT 'vacant_dirty',
  status_changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_sellable BOOLEAN NOT NULL DEFAULT true,
  connecting_unit_id UUID REFERENCES units(id) ON DELETE SET NULL,
  attrs JSONB NOT NULL DEFAULT '{}',
  version INT NOT NULL DEFAULT 1,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ,
  UNIQUE (tenant_id, branch_id, number)
);
CREATE INDEX IF NOT EXISTS units_tenant_board_idx ON units (tenant_id, branch_id, floor, number) WHERE deleted_at IS NULL;
SELECT app.enable_tenant_rls('units');

-- 7. Unit Status Log
CREATE TABLE IF NOT EXISTS unit_status_log (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  reason TEXT,
  changed_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS unit_status_log_tenant_idx ON unit_status_log (tenant_id, unit_id, created_at DESC);
SELECT app.enable_tenant_rls('unit_status_log');

-- 8. Unit Blocks (Out-of-Order / Out-of-Service blocking engine)
CREATE TABLE IF NOT EXISTS unit_blocks (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  block_type TEXT NOT NULL CHECK (block_type IN ('out_of_order', 'out_of_service')),
  reason TEXT NOT NULL,
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  released_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS unit_blocks_tenant_idx ON unit_blocks (tenant_id, branch_id, unit_id, is_active);
SELECT app.enable_tenant_rls('unit_blocks');

-- Permissions Grant
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO innkeeper_app;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO innkeeper_readonly;
