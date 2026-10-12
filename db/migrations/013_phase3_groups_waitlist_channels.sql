-- 013_phase3_groups_waitlist_channels.sql: Group Blocks, Quotations, Waitlists, Channel Maps & Sync Logs
-- Conforming strictly to Innkeeper RLS and leading-column guidelines.

-- 1. Channel Maps (OpenTravel / HTNG ARI Mapping)
CREATE TABLE IF NOT EXISTS channel_maps (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  channel_name TEXT NOT NULL, -- 'booking_com','expedia','agoda'
  local_unit_type_id UUID NOT NULL REFERENCES unit_types(id) ON DELETE CASCADE,
  local_rate_plan_id UUID NOT NULL REFERENCES rate_plans(id) ON DELETE CASCADE,
  channel_room_code TEXT NOT NULL,
  channel_rate_code TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  attrs JSONB NOT NULL DEFAULT '{}',
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ,
  UNIQUE (tenant_id, branch_id, channel_name, channel_room_code, channel_rate_code)
);
CREATE INDEX IF NOT EXISTS channel_maps_tenant_idx ON channel_maps (tenant_id, branch_id, channel_name);
SELECT app.enable_tenant_rls('channel_maps');

-- 2. Channel Sync Logs
CREATE TABLE IF NOT EXISTS channel_sync_logs (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  channel_name TEXT NOT NULL,
  sync_type TEXT NOT NULL CHECK (sync_type IN ('outbound_ari','inbound_booking')),
  status TEXT NOT NULL CHECK (status IN ('success','warning','failed')),
  payload_summary JSONB NOT NULL DEFAULT '{}',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS channel_sync_logs_tenant_idx ON channel_sync_logs (tenant_id, branch_id, created_at DESC);
SELECT app.enable_tenant_rls('channel_sync_logs');

-- 3. Group Blocks (REQ-RSV-009)
CREATE TABLE IF NOT EXISTS group_blocks (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'definite' CHECK (status IN ('tentative','definite','released','cancelled')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL CHECK (end_date > start_date),
  cutoff_date DATE NOT NULL CHECK (cutoff_date <= start_date),
  master_folio_id UUID REFERENCES folios(id) ON DELETE SET NULL,
  total_rooms INT NOT NULL DEFAULT 0,
  picked_up_rooms INT NOT NULL DEFAULT 0,
  notes TEXT,
  attrs JSONB NOT NULL DEFAULT '{}',
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_at TIMESTAMPTZ,
  updated_by UUID,
  UNIQUE (tenant_id, branch_id, code)
);
CREATE INDEX IF NOT EXISTS group_blocks_tenant_idx ON group_blocks (tenant_id, branch_id, status);
CREATE INDEX IF NOT EXISTS group_blocks_tenant_cutoff_idx ON group_blocks (tenant_id, cutoff_date) WHERE status = 'definite';
SELECT app.enable_tenant_rls('group_blocks');

-- 4. Group Block Allocations
CREATE TABLE IF NOT EXISTS group_block_allocations (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  group_block_id UUID NOT NULL REFERENCES group_blocks(id) ON DELETE CASCADE,
  unit_type_id UUID NOT NULL REFERENCES unit_types(id) ON DELETE RESTRICT,
  allocated_rooms INT NOT NULL CHECK (allocated_rooms > 0),
  picked_up_rooms INT NOT NULL DEFAULT 0 CHECK (picked_up_rooms >= 0),
  agreed_rate NUMERIC(19,4) NOT NULL CHECK (agreed_rate >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, group_block_id, unit_type_id)
);
CREATE INDEX IF NOT EXISTS group_block_allocations_tenant_idx ON group_block_allocations (tenant_id, group_block_id);
SELECT app.enable_tenant_rls('group_block_allocations');

-- 5. Non-Binding Quotations (REQ-RSV-010)
CREATE TABLE IF NOT EXISTS quotations (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  quotation_no TEXT NOT NULL,
  guest_id UUID REFERENCES guests(id) ON DELETE SET NULL,
  guest_name TEXT NOT NULL,
  guest_email TEXT,
  guest_phone TEXT,
  unit_type_id UUID NOT NULL REFERENCES unit_types(id) ON DELETE RESTRICT,
  rate_plan_id UUID NOT NULL REFERENCES rate_plans(id) ON DELETE RESTRICT,
  check_in DATE NOT NULL,
  check_out DATE NOT NULL CHECK (check_out > check_in),
  adults INT NOT NULL DEFAULT 1,
  children INT NOT NULL DEFAULT 0,
  quoted_rate NUMERIC(19,4) NOT NULL,
  quoted_taxes NUMERIC(19,4) NOT NULL DEFAULT 0.0000,
  total_amount NUMERIC(19,4) NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','converted','expired','cancelled')),
  valid_until TIMESTAMPTZ NOT NULL,
  notes TEXT,
  converted_reservation_id UUID REFERENCES reservations(id) ON DELETE SET NULL,
  attrs JSONB NOT NULL DEFAULT '{}',
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_at TIMESTAMPTZ,
  UNIQUE (tenant_id, branch_id, quotation_no)
);
CREATE INDEX IF NOT EXISTS quotations_tenant_idx ON quotations (tenant_id, branch_id, status);
SELECT app.enable_tenant_rls('quotations');

-- 6. Waitlist (REQ-RSV-010)
CREATE TABLE IF NOT EXISTS waitlists (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  guest_id UUID REFERENCES guests(id) ON DELETE SET NULL,
  guest_name TEXT NOT NULL,
  guest_email TEXT,
  guest_phone TEXT,
  unit_type_id UUID NOT NULL REFERENCES unit_types(id) ON DELETE RESTRICT,
  rate_plan_id UUID REFERENCES rate_plans(id) ON DELETE SET NULL,
  desired_check_in DATE NOT NULL,
  desired_check_out DATE NOT NULL CHECK (desired_check_out > desired_check_in),
  adults INT NOT NULL DEFAULT 1,
  children INT NOT NULL DEFAULT 0,
  priority INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','offered','converted','expired','cancelled')),
  notes TEXT,
  converted_reservation_id UUID REFERENCES reservations(id) ON DELETE SET NULL,
  attrs JSONB NOT NULL DEFAULT '{}',
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS waitlists_tenant_idx ON waitlists (tenant_id, branch_id, status, desired_check_in);
SELECT app.enable_tenant_rls('waitlists');
