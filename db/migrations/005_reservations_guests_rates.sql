-- 005_reservations_guests_rates.sql: Guests, Companies, Rates Engine, Tax Engine, Reservations & Concurrency
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 1. Guests
CREATE TABLE IF NOT EXISTS guests (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  email_normalized TEXT,
  phone TEXT,
  phone_e164 TEXT,
  birth_date DATE,
  nationality CHAR(2),
  vip_status TEXT NOT NULL DEFAULT 'standard' CHECK (vip_status IN ('standard','silver','gold','platinum','blacklist')),
  notes TEXT,
  attrs JSONB NOT NULL DEFAULT '{}',
  is_pseudonymized BOOLEAN NOT NULL DEFAULT false,
  merged_into_id UUID REFERENCES guests(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_at TIMESTAMPTZ,
  updated_by UUID
);
CREATE INDEX IF NOT EXISTS guests_tenant_email_idx ON guests (tenant_id, email_normalized) WHERE merged_into_id IS NULL;
CREATE INDEX IF NOT EXISTS guests_tenant_phone_idx ON guests (tenant_id, phone_e164) WHERE merged_into_id IS NULL;
CREATE INDEX IF NOT EXISTS guests_tenant_name_idx ON guests (tenant_id, last_name, first_name);
SELECT app.enable_tenant_rls('guests');

-- 2. Companies
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  tax_identifier TEXT,
  billing_email TEXT,
  phone TEXT,
  address JSONB NOT NULL DEFAULT '{}',
  credit_limit NUMERIC(19,4) NOT NULL DEFAULT 0.0000,
  credit_terms_days INT NOT NULL DEFAULT 30,
  is_active BOOLEAN NOT NULL DEFAULT true,
  attrs JSONB NOT NULL DEFAULT '{}',
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS companies_tenant_name_idx ON companies (tenant_id, name);
SELECT app.enable_tenant_rls('companies');

-- 3. Guest Preferences
CREATE TABLE IF NOT EXISTS guest_prefs (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  guest_id UUID NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  preference TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, guest_id, category, preference)
);
CREATE INDEX IF NOT EXISTS guest_prefs_tenant_idx ON guest_prefs (tenant_id, guest_id);
SELECT app.enable_tenant_rls('guest_prefs');

-- 4. Guest Consents (GDPR / Privacy)
CREATE TABLE IF NOT EXISTS guest_consents (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  guest_id UUID NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL,
  is_granted BOOLEAN NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS guest_consents_tenant_idx ON guest_consents (tenant_id, guest_id);
SELECT app.enable_tenant_rls('guest_consents');

-- 5. Guest Identifications
CREATE TABLE IF NOT EXISTS guest_identifications (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  guest_id UUID NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  id_type TEXT NOT NULL,
  id_number_hash TEXT NOT NULL,
  id_number_encrypted TEXT NOT NULL,
  issuing_country CHAR(2) NOT NULL,
  expiry_date DATE,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id_type, id_number_hash)
);
CREATE INDEX IF NOT EXISTS guest_identifications_tenant_idx ON guest_identifications (tenant_id, guest_id);
SELECT app.enable_tenant_rls('guest_identifications');

-- 6. Guest Merge Log
CREATE TABLE IF NOT EXISTS guest_merge_log (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_guest_id UUID NOT NULL,
  target_guest_id UUID NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  merged_by UUID NOT NULL,
  reason TEXT NOT NULL,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS guest_merge_log_tenant_idx ON guest_merge_log (tenant_id, target_guest_id);
SELECT app.enable_tenant_rls('guest_merge_log');

-- 7. Rate Plans
CREATE TABLE IF NOT EXISTS rate_plans (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  is_active BOOLEAN NOT NULL DEFAULT true,
  policy_cancellation JSONB NOT NULL DEFAULT '{}',
  policy_deposit JSONB NOT NULL DEFAULT '{}',
  policy_no_show JSONB NOT NULL DEFAULT '{}',
  attrs JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ,
  UNIQUE (tenant_id, branch_id, code)
);
CREATE INDEX IF NOT EXISTS rate_plans_tenant_idx ON rate_plans (tenant_id, branch_id);
SELECT app.enable_tenant_rls('rate_plans');

-- 8. Rate Calendar (Daily Pricing per Unit Type & Rate Plan)
CREATE TABLE IF NOT EXISTS rate_calendar (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  rate_plan_id UUID NOT NULL REFERENCES rate_plans(id) ON DELETE CASCADE,
  unit_type_id UUID NOT NULL REFERENCES unit_types(id) ON DELETE CASCADE,
  stay_date DATE NOT NULL,
  rate NUMERIC(19,4) NOT NULL,
  single_occupancy_rate NUMERIC(19,4),
  extra_adult_rate NUMERIC(19,4) NOT NULL DEFAULT 0.0000,
  extra_child_rate NUMERIC(19,4) NOT NULL DEFAULT 0.0000,
  UNIQUE (tenant_id, branch_id, rate_plan_id, unit_type_id, stay_date)
);
CREATE INDEX IF NOT EXISTS rate_calendar_tenant_idx ON rate_calendar (tenant_id, branch_id, stay_date);
SELECT app.enable_tenant_rls('rate_calendar');

-- 9. Restrictions (Min/Max LOS, CTA, CTD, Stop Sell)
CREATE TABLE IF NOT EXISTS restrictions (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  rate_plan_id UUID NOT NULL REFERENCES rate_plans(id) ON DELETE CASCADE,
  unit_type_id UUID REFERENCES unit_types(id) ON DELETE CASCADE,
  stay_date DATE NOT NULL,
  min_los INT,
  max_los INT,
  closed_to_arrival BOOLEAN NOT NULL DEFAULT false,
  closed_to_departure BOOLEAN NOT NULL DEFAULT false,
  stop_sell BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (tenant_id, branch_id, rate_plan_id, unit_type_id, stay_date)
);
CREATE INDEX IF NOT EXISTS restrictions_tenant_idx ON restrictions (tenant_id, branch_id, stay_date);
SELECT app.enable_tenant_rls('restrictions');

-- 10. Taxes
CREATE TABLE IF NOT EXISTS taxes (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  rate_pct NUMERIC(7,4) NOT NULL,
  is_flat_amount BOOLEAN NOT NULL DEFAULT false,
  flat_amount NUMERIC(19,4) NOT NULL DEFAULT 0.0000,
  currency CHAR(3),
  gl_account_code TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (tenant_id, code)
);
CREATE INDEX IF NOT EXISTS taxes_tenant_idx ON taxes (tenant_id, code);
SELECT app.enable_tenant_rls('taxes');

-- 11. Tax Rules
CREATE TABLE IF NOT EXISTS tax_rules (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  is_inclusive BOOLEAN NOT NULL DEFAULT false,
  calculation_order INT NOT NULL DEFAULT 1,
  compounds_previous BOOLEAN NOT NULL DEFAULT false,
  tax_ids UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, branch_id, code)
);
CREATE INDEX IF NOT EXISTS tax_rules_tenant_idx ON tax_rules (tenant_id, branch_id);
SELECT app.enable_tenant_rls('tax_rules');

-- 12. Charge Codes
CREATE TABLE IF NOT EXISTS charge_codes (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  charge_group TEXT NOT NULL CHECK (charge_group IN ('room','fnb','laundry','telephone','spa','misc','tax','service')),
  tax_rule_id UUID REFERENCES tax_rules(id) ON DELETE SET NULL,
  gl_account_code TEXT NOT NULL,
  allow_discount BOOLEAN NOT NULL DEFAULT true,
  department TEXT NOT NULL DEFAULT 'rooms',
  is_active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (tenant_id, branch_id, code)
);
CREATE INDEX IF NOT EXISTS charge_codes_tenant_idx ON charge_codes (tenant_id, charge_group);
SELECT app.enable_tenant_rls('charge_codes');

-- 13. Packages
CREATE TABLE IF NOT EXISTS packages (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  charge_code_id UUID NOT NULL REFERENCES charge_codes(id) ON DELETE RESTRICT,
  price NUMERIC(19,4) NOT NULL,
  frequency TEXT NOT NULL DEFAULT 'per_stay' CHECK (frequency IN ('per_stay','per_night','per_person_per_night')),
  is_inclusive BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (tenant_id, branch_id, code)
);
CREATE INDEX IF NOT EXISTS packages_tenant_idx ON packages (tenant_id, branch_id);
SELECT app.enable_tenant_rls('packages');

-- 14. Reservations
CREATE TABLE IF NOT EXISTS reservations (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  reservation_no TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('hold','confirmed','in_house','checked_out','cancelled','no_show')),
  guest_id UUID NOT NULL REFERENCES guests(id) ON DELETE RESTRICT,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'direct',
  channel_ref TEXT,
  hold_expires_at TIMESTAMPTZ,
  policy_snapshot JSONB NOT NULL DEFAULT '{}',
  notes TEXT,
  attrs JSONB NOT NULL DEFAULT '{}',
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_at TIMESTAMPTZ,
  updated_by UUID,
  UNIQUE (tenant_id, branch_id, reservation_no)
);
CREATE INDEX IF NOT EXISTS reservations_tenant_idx ON reservations (tenant_id, branch_id, status);
CREATE INDEX IF NOT EXISTS reservations_tenant_guest_idx ON reservations (tenant_id, guest_id);
SELECT app.enable_tenant_rls('reservations');

-- 15. Reservation Units (Booked unit lines with anti-double-booking exclusion constraint)
CREATE TABLE IF NOT EXISTS reservation_units (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  unit_type_id UUID NOT NULL REFERENCES unit_types(id) ON DELETE RESTRICT,
  unit_id UUID REFERENCES units(id) ON DELETE SET NULL,
  rate_plan_id UUID NOT NULL REFERENCES rate_plans(id) ON DELETE RESTRICT,
  check_in DATE NOT NULL,
  check_out DATE NOT NULL CHECK (check_out > check_in),
  adults INT NOT NULL DEFAULT 1,
  children INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('hold','confirmed','in_house','checked_out','cancelled','no_show')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT no_double_booking EXCLUDE USING gist (
    unit_id WITH =, daterange(check_in, check_out, '[)') WITH &&
  ) WHERE (unit_id IS NOT NULL AND status IN ('hold','confirmed','in_house'))
);
CREATE INDEX IF NOT EXISTS reservation_units_tenant_idx ON reservation_units (tenant_id, branch_id, unit_id);
CREATE INDEX IF NOT EXISTS reservation_units_tenant_res_idx ON reservation_units (tenant_id, reservation_id);
SELECT app.enable_tenant_rls('reservation_units');

-- 16. Room Type Inventory (Nightly capacity & sold counters with atomic check constraint)
CREATE TABLE IF NOT EXISTS room_type_inventory (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  unit_type_id UUID NOT NULL REFERENCES unit_types(id) ON DELETE CASCADE,
  stay_date DATE NOT NULL,
  capacity INT NOT NULL,
  sold INT NOT NULL DEFAULT 0,
  overbook_allowance INT NOT NULL DEFAULT 0,
  stop_sell BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (tenant_id, branch_id, unit_type_id, stay_date),
  CHECK (sold >= 0 AND sold <= capacity + overbook_allowance)
);
CREATE INDEX IF NOT EXISTS room_type_inventory_tenant_idx ON room_type_inventory (tenant_id, branch_id, stay_date);
SELECT app.enable_tenant_rls('room_type_inventory');

-- 17. Reservation Nights (Nightly rate and tax breakdown snapshots)
CREATE TABLE IF NOT EXISTS reservation_nights (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  reservation_unit_id UUID NOT NULL REFERENCES reservation_units(id) ON DELETE CASCADE,
  stay_date DATE NOT NULL,
  rate NUMERIC(19,4) NOT NULL,
  tax_snapshot JSONB NOT NULL DEFAULT '[]',
  PRIMARY KEY (tenant_id, reservation_unit_id, stay_date)
);
CREATE INDEX IF NOT EXISTS reservation_nights_tenant_idx ON reservation_nights (tenant_id, reservation_unit_id);
SELECT app.enable_tenant_rls('reservation_nights');

-- 18. Temporary Holds
CREATE TABLE IF NOT EXISTS holds (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  reservation_unit_id UUID NOT NULL REFERENCES reservation_units(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS holds_tenant_expiry_idx ON holds (tenant_id, expires_at);
SELECT app.enable_tenant_rls('holds');
