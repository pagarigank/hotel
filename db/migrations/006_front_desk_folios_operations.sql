-- 006_front_desk_folios_operations.sql: Stays, Folios, Billing, Night Audit, Housekeeping & Operations
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 1. Stays (Physical Guest Occupancy linked to reservation_units)
CREATE TABLE IF NOT EXISTS stays (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  reservation_unit_id UUID NOT NULL REFERENCES reservation_units(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES units(id),
  guest_id UUID NOT NULL REFERENCES guests(id),
  actual_check_in TIMESTAMPTZ NOT NULL DEFAULT now(),
  expected_check_out DATE NOT NULL,
  actual_check_out TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'in_house' CHECK (status IN ('in_house','checked_out')),
  reg_card_pdf_url TEXT,
  keycard_code TEXT,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS stays_tenant_unit_idx ON stays (tenant_id, branch_id, unit_id, status);
CREATE INDEX IF NOT EXISTS stays_tenant_res_idx ON stays (tenant_id, reservation_id);
CREATE INDEX IF NOT EXISTS stays_tenant_guest_idx ON stays (tenant_id, guest_id);
SELECT app.enable_tenant_rls('stays');

-- 2. Room Moves
CREATE TABLE IF NOT EXISTS room_moves (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  stay_id UUID NOT NULL REFERENCES stays(id) ON DELETE CASCADE,
  from_unit_id UUID NOT NULL REFERENCES units(id),
  to_unit_id UUID NOT NULL REFERENCES units(id),
  reason TEXT NOT NULL,
  rate_adjustment NUMERIC(19,4) NOT NULL DEFAULT 0.0000,
  moved_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS room_moves_tenant_stay_idx ON room_moves (tenant_id, stay_id);
SELECT app.enable_tenant_rls('room_moves');

-- 3. Business Dates (Branch business date history & state)
CREATE TABLE IF NOT EXISTS business_dates (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  business_date DATE NOT NULL,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','rolling','closed')),
  UNIQUE (tenant_id, branch_id, business_date)
);
CREATE INDEX IF NOT EXISTS business_dates_tenant_idx ON business_dates (tenant_id, branch_id, business_date DESC);
SELECT app.enable_tenant_rls('business_dates');

-- 4. Night Audits (State machine parent record)
CREATE TABLE IF NOT EXISTS night_audits (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  business_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','running','completed','failed')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  failed_at_step TEXT,
  error_message TEXT,
  run_by UUID NOT NULL,
  UNIQUE (tenant_id, branch_id, business_date)
);
CREATE INDEX IF NOT EXISTS night_audits_tenant_idx ON night_audits (tenant_id, branch_id, business_date DESC);
SELECT app.enable_tenant_rls('night_audits');

-- 5. Night Audit Steps (Step-checkpointed execution log)
CREATE TABLE IF NOT EXISTS night_audit_steps (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  night_audit_id UUID NOT NULL REFERENCES night_audits(id) ON DELETE CASCADE,
  step_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','running','completed','failed','skipped')),
  records_processed INT NOT NULL DEFAULT 0,
  error_details TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  UNIQUE (tenant_id, night_audit_id, step_name)
);
CREATE INDEX IF NOT EXISTS night_audit_steps_tenant_idx ON night_audit_steps (tenant_id, night_audit_id);
SELECT app.enable_tenant_rls('night_audit_steps');

-- 6. KPI Snapshots (Daily managerial & accounting statistics)
CREATE TABLE IF NOT EXISTS kpi_snapshots (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  business_date DATE NOT NULL,
  total_units INT NOT NULL,
  occupied_units INT NOT NULL,
  ooo_units INT NOT NULL,
  complimentary_units INT NOT NULL DEFAULT 0,
  occupancy_rate NUMERIC(6,4) NOT NULL,
  adr NUMERIC(19,4) NOT NULL,
  revpar NUMERIC(19,4) NOT NULL,
  trevpar NUMERIC(19,4) NOT NULL,
  total_room_revenue NUMERIC(19,4) NOT NULL,
  total_fnb_revenue NUMERIC(19,4) NOT NULL DEFAULT 0.0000,
  total_other_revenue NUMERIC(19,4) NOT NULL DEFAULT 0.0000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, branch_id, business_date)
);
CREATE INDEX IF NOT EXISTS kpi_snapshots_tenant_idx ON kpi_snapshots (tenant_id, branch_id, business_date DESC);
SELECT app.enable_tenant_rls('kpi_snapshots');

-- 7. Folios (Billing Master & Multi-Window Container)
CREATE TABLE IF NOT EXISTS folios (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  folio_no TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'guest' CHECK (kind IN ('guest','master','city_ledger','incidental')),
  stay_id UUID REFERENCES stays(id) ON DELETE SET NULL,
  reservation_id UUID REFERENCES reservations(id) ON DELETE SET NULL,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','settled','closed')),
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  total_charges NUMERIC(19,4) NOT NULL DEFAULT 0.0000,
  total_payments NUMERIC(19,4) NOT NULL DEFAULT 0.0000,
  balance NUMERIC(19,4) NOT NULL DEFAULT 0.0000,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ,
  UNIQUE (tenant_id, branch_id, folio_no)
);
CREATE INDEX IF NOT EXISTS folios_tenant_stay_idx ON folios (tenant_id, stay_id);
CREATE INDEX IF NOT EXISTS folios_tenant_res_idx ON folios (tenant_id, reservation_id);
SELECT app.enable_tenant_rls('folios');

-- 8. Folio Lines (Append-only financial entries, multi-window billing)
CREATE TABLE IF NOT EXISTS folio_lines (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  folio_id UUID NOT NULL REFERENCES folios(id) ON DELETE RESTRICT,
  stay_id UUID REFERENCES stays(id) ON DELETE SET NULL,
  window_no INT NOT NULL DEFAULT 1,
  business_date DATE NOT NULL,
  line_type TEXT NOT NULL CHECK (line_type IN ('charge','payment','adjustment','transfer')),
  charge_type TEXT NOT NULL DEFAULT 'manual',
  charge_code_id UUID REFERENCES charge_codes(id),
  description TEXT NOT NULL,
  qty NUMERIC(12,3) NOT NULL DEFAULT 1,
  unit_amount NUMERIC(19,4) NOT NULL,
  amount NUMERIC(19,4) NOT NULL,
  tax_amount NUMERIC(19,4) NOT NULL DEFAULT 0.0000,
  tax_snapshot JSONB NOT NULL DEFAULT '[]',
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_id UUID,
  reverses_line_id UUID REFERENCES folio_lines(id) ON DELETE SET NULL,
  voucher_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);
CREATE INDEX IF NOT EXISTS folio_lines_tenant_folio_idx ON folio_lines (tenant_id, folio_id, window_no);
CREATE UNIQUE INDEX IF NOT EXISTS folio_lines_audit_idempotency_idx ON folio_lines (tenant_id, branch_id, stay_id, business_date, charge_type)
  WHERE charge_type IN ('room','night_tax');
SELECT app.enable_tenant_rls('folio_lines');

-- 9. Payment Intents (PCI DSS v4.0.1 tokenized transactions)
CREATE TABLE IF NOT EXISTS payment_intents (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  gateway_name TEXT NOT NULL DEFAULT 'simulated',
  gateway_intent_id TEXT NOT NULL,
  amount NUMERIC(19,4) NOT NULL,
  currency CHAR(3) NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('requires_payment_method','requires_confirmation','requires_capture','succeeded','cancelled')),
  payment_method_token TEXT,
  terminal_id TEXT,
  last_four CHAR(4),
  card_brand TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ,
  UNIQUE (tenant_id, gateway_name, gateway_intent_id)
);
CREATE INDEX IF NOT EXISTS payment_intents_tenant_idx ON payment_intents (tenant_id, gateway_name, gateway_intent_id);
SELECT app.enable_tenant_rls('payment_intents');

-- 10. Payments (Captured cashiering tenders)
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  folio_id UUID NOT NULL REFERENCES folios(id) ON DELETE RESTRICT,
  payment_intent_id UUID REFERENCES payment_intents(id) ON DELETE SET NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash','card_present','card_online','qr_code','city_ledger','voucher')),
  amount NUMERIC(19,4) NOT NULL,
  currency CHAR(3) NOT NULL,
  reference_no TEXT,
  tendered_amount NUMERIC(19,4),
  change_amount NUMERIC(19,4) NOT NULL DEFAULT 0.0000,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  captured_by UUID NOT NULL,
  voucher_id UUID
);
CREATE INDEX IF NOT EXISTS payments_tenant_folio_idx ON payments (tenant_id, folio_id);
SELECT app.enable_tenant_rls('payments');

-- 11. Housekeeping Checklists
CREATE TABLE IF NOT EXISTS hk_checklists (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  task_type TEXT NOT NULL,
  items JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (tenant_id, code)
);
CREATE INDEX IF NOT EXISTS hk_checklists_tenant_idx ON hk_checklists (tenant_id, task_type);
SELECT app.enable_tenant_rls('hk_checklists');

-- 12. Housekeeping Tasks
CREATE TABLE IF NOT EXISTS hk_tasks (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  task_type TEXT NOT NULL CHECK (task_type IN ('checkout_clean','stayover_clean','deep_clean','turndown','inspection')),
  priority TEXT NOT NULL DEFAULT 'standard' CHECK (priority IN ('low','standard','high','urgent')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','inspected','rejected')),
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  checklist_id UUID REFERENCES hk_checklists(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS hk_tasks_tenant_branch_idx ON hk_tasks (tenant_id, branch_id, status, assigned_to);
SELECT app.enable_tenant_rls('hk_tasks');

-- 13. Maintenance Orders
CREATE TABLE IF NOT EXISTS maintenance_orders (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  unit_id UUID REFERENCES units(id) ON DELETE SET NULL,
  area_description TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','emergency')),
  status TEXT NOT NULL DEFAULT 'reported' CHECK (status IN ('reported','assigned','in_progress','completed','cancelled')),
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  blocks_unit BOOLEAN NOT NULL DEFAULT false,
  block_type TEXT CHECK (block_type IN ('out_of_order','out_of_service')),
  reported_by UUID NOT NULL,
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS maintenance_orders_tenant_idx ON maintenance_orders (tenant_id, branch_id, status);
SELECT app.enable_tenant_rls('maintenance_orders');

-- 14. Lost & Found
CREATE TABLE IF NOT EXISTS lost_found (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('clothing','electronics','jewelry','document','cash','other')),
  found_location TEXT NOT NULL,
  found_unit_id UUID REFERENCES units(id) ON DELETE SET NULL,
  found_by UUID NOT NULL,
  found_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'held' CHECK (status IN ('held','claimed','disposed','auctioned')),
  claimed_by_guest_id UUID REFERENCES guests(id) ON DELETE SET NULL,
  claimed_at TIMESTAMPTZ,
  storage_location TEXT NOT NULL,
  photo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lost_found_tenant_idx ON lost_found (tenant_id, branch_id, status);
SELECT app.enable_tenant_rls('lost_found');
