-- 007_accounting_and_vouchers.sql: Phase 5 Accounting with Vouchering Schema & Invariant Triggers
-- Enforces:
-- 1. Double-Entry Deferred Balance Trigger: Σdebit = Σcredit per voucher at COMMIT
-- 2. Ledger Immutability Trigger: gl_entries is strictly append-only (UPDATE/DELETE blocked)
-- 3. Period-Lock Trigger: Closed/soft-closed fiscal periods reject postings
-- 4. Shared-schema Tenant RLS on all accounting tables

-- 1. Chart of Accounts (Hierarchical USALI Tree)
CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  account_class TEXT NOT NULL CHECK (account_class IN ('asset', 'liability', 'equity', 'revenue', 'cogs', 'expense')),
  account_group TEXT NOT NULL,
  normal_balance TEXT NOT NULL CHECK (normal_balance IN ('debit', 'credit')),
  is_control_account BOOLEAN NOT NULL DEFAULT false,
  control_type TEXT CHECK (control_type IN ('guest_ledger', 'city_ledger', 'accounts_payable', 'inventory', 'customer_deposits')),
  parent_id UUID REFERENCES accounts(id) ON DELETE RESTRICT,
  is_reconciliation_active BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  attrs JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ,
  UNIQUE (tenant_id, code)
);
CREATE INDEX IF NOT EXISTS accounts_tenant_code_idx ON accounts (tenant_id, code);
CREATE INDEX IF NOT EXISTS accounts_tenant_class_idx ON accounts (tenant_id, account_class);
SELECT app.enable_tenant_rls('accounts');

-- 2. Fiscal Years
CREATE TABLE IF NOT EXISTS fiscal_years (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ,
  UNIQUE (tenant_id, name)
);
CREATE INDEX IF NOT EXISTS fiscal_years_tenant_idx ON fiscal_years (tenant_id, start_date);
SELECT app.enable_tenant_rls('fiscal_years');

-- 3. Fiscal Periods
CREATE TABLE IF NOT EXISTS fiscal_periods (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  fiscal_year_id UUID NOT NULL REFERENCES fiscal_years(id) ON DELETE CASCADE,
  period_no INT NOT NULL CHECK (period_no BETWEEN 1 AND 12),
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'soft_closed', 'closed')),
  closed_at TIMESTAMPTZ,
  closed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ,
  UNIQUE (tenant_id, fiscal_year_id, period_no)
);
CREATE INDEX IF NOT EXISTS fiscal_periods_tenant_idx ON fiscal_periods (tenant_id, start_date, end_date);
SELECT app.enable_tenant_rls('fiscal_periods');

-- 4. Vouchers (Header)
CREATE TABLE IF NOT EXISTS vouchers (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  voucher_no TEXT,
  voucher_type TEXT NOT NULL CHECK (voucher_type IN ('JV', 'RV', 'PV', 'CV', 'SV', 'PB', 'DN', 'CN', 'OB', 'SYS')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'posted', 'cancelled')),
  posting_date DATE NOT NULL,
  fiscal_period_id UUID REFERENCES fiscal_periods(id) ON DELETE RESTRICT,
  description TEXT NOT NULL,
  source_type TEXT,
  source_id UUID,
  reversal_of UUID REFERENCES vouchers(id) ON DELETE SET NULL,
  reversed_by UUID REFERENCES vouchers(id) ON DELETE SET NULL,
  total_debit NUMERIC(19,4) NOT NULL DEFAULT 0.0000,
  total_credit NUMERIC(19,4) NOT NULL DEFAULT 0.0000,
  created_by UUID NOT NULL,
  approved_by UUID,
  posted_by UUID,
  posted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS vouchers_tenant_branch_no_idx ON vouchers (tenant_id, branch_id, voucher_no) WHERE voucher_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS vouchers_tenant_date_idx ON vouchers (tenant_id, branch_id, posting_date DESC);
CREATE INDEX IF NOT EXISTS vouchers_tenant_source_idx ON vouchers (tenant_id, source_type, source_id);
SELECT app.enable_tenant_rls('vouchers');

-- 5. Voucher Lines
CREATE TABLE IF NOT EXISTS voucher_lines (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  voucher_id UUID NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
  line_no INT NOT NULL,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  description TEXT,
  debit NUMERIC(19,4) NOT NULL DEFAULT 0.0000 CHECK (debit >= 0),
  credit NUMERIC(19,4) NOT NULL DEFAULT 0.0000 CHECK (credit >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  party_type TEXT CHECK (party_type IN ('guest', 'company', 'supplier', 'employee')),
  party_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)),
  UNIQUE (tenant_id, voucher_id, line_no)
);
CREATE INDEX IF NOT EXISTS voucher_lines_tenant_voucher_idx ON voucher_lines (tenant_id, voucher_id);
CREATE INDEX IF NOT EXISTS voucher_lines_tenant_account_idx ON voucher_lines (tenant_id, account_id);
SELECT app.enable_tenant_rls('voucher_lines');

-- 6. General Ledger Entries (Immutable Audit Ledger)
CREATE TABLE IF NOT EXISTS gl_entries (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  voucher_id UUID NOT NULL REFERENCES vouchers(id) ON DELETE RESTRICT,
  voucher_line_id UUID NOT NULL REFERENCES voucher_lines(id) ON DELETE RESTRICT,
  voucher_no TEXT NOT NULL,
  voucher_type TEXT NOT NULL,
  posting_date DATE NOT NULL,
  fiscal_period_id UUID NOT NULL REFERENCES fiscal_periods(id) ON DELETE RESTRICT,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  account_code TEXT NOT NULL,
  debit NUMERIC(19,4) NOT NULL DEFAULT 0.0000 CHECK (debit >= 0),
  credit NUMERIC(19,4) NOT NULL DEFAULT 0.0000 CHECK (credit >= 0),
  description TEXT,
  party_type TEXT,
  party_id UUID,
  source_type TEXT,
  source_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gl_entries_tenant_branch_date_idx ON gl_entries (tenant_id, branch_id, posting_date DESC);
CREATE INDEX IF NOT EXISTS gl_entries_tenant_account_date_idx ON gl_entries (tenant_id, account_id, posting_date DESC);
CREATE INDEX IF NOT EXISTS gl_entries_tenant_voucher_idx ON gl_entries (tenant_id, voucher_id);
SELECT app.enable_tenant_rls('gl_entries');

-- 7. GL Balances Cache
CREATE TABLE IF NOT EXISTS gl_balances (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  fiscal_period_id UUID NOT NULL REFERENCES fiscal_periods(id) ON DELETE CASCADE,
  opening_balance NUMERIC(19,4) NOT NULL DEFAULT 0.0000,
  total_debit NUMERIC(19,4) NOT NULL DEFAULT 0.0000,
  total_credit NUMERIC(19,4) NOT NULL DEFAULT 0.0000,
  closing_balance NUMERIC(19,4) NOT NULL DEFAULT 0.0000,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, branch_id, account_id, fiscal_period_id)
);
CREATE INDEX IF NOT EXISTS gl_balances_tenant_account_idx ON gl_balances (tenant_id, branch_id, account_id);
SELECT app.enable_tenant_rls('gl_balances');

-- 8. Posting Rules (Configurable operational event-to-voucher engine)
CREATE TABLE IF NOT EXISTS posting_rules (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  priority INT NOT NULL DEFAULT 100,
  auto_approve BOOLEAN NOT NULL DEFAULT true,
  match_conditions JSONB NOT NULL DEFAULT '{}',
  rule_lines JSONB NOT NULL, -- Array of { account_code, side: 'debit'|'credit', formula: 'gross'|'net'|'tax'|'amount' }
  description TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS posting_rules_tenant_event_idx ON posting_rules (tenant_id, event_type, priority DESC);
SELECT app.enable_tenant_rls('posting_rules');

-- ============================================================================
-- INVARIANT TRIGGERS
-- ============================================================================

-- Invariant 1: Ledger Immutability (gl_entries is strictly append-only)
CREATE OR REPLACE FUNCTION app.assert_gl_entries_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'GL_ENTRIES_IMMUTABLE: General ledger entries are strictly immutable and cannot be updated or deleted. Post a reversal voucher instead.';
END;
$$;

DROP TRIGGER IF EXISTS trg_gl_entries_immutable ON gl_entries;
CREATE TRIGGER trg_gl_entries_immutable
BEFORE UPDATE OR DELETE ON gl_entries
FOR EACH ROW EXECUTE FUNCTION app.assert_gl_entries_immutable();

-- Invariant 2: Period-Lock (Postings into closed/soft-closed periods are rejected)
CREATE OR REPLACE FUNCTION app.assert_period_open_for_posting()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_status TEXT;
BEGIN
  SELECT status INTO v_status
  FROM fiscal_periods
  WHERE id = NEW.fiscal_period_id AND tenant_id = NEW.tenant_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'INVALID_PERIOD: Fiscal period % does not exist', NEW.fiscal_period_id;
  END IF;

  IF v_status IN ('soft_closed', 'closed') THEN
    RAISE EXCEPTION 'PERIOD_LOCKED: Fiscal period is % and rejects postings. Only open periods accept ledger entries.', v_status;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gl_entries_period_lock ON gl_entries;
CREATE TRIGGER trg_gl_entries_period_lock
BEFORE INSERT ON gl_entries
FOR EACH ROW EXECUTE FUNCTION app.assert_period_open_for_posting();

-- Invariant 3: Deferred Double-Entry Equilibrium Check (Σdebit = Σcredit at COMMIT)
CREATE OR REPLACE FUNCTION app.assert_voucher_balanced()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_sum_debit NUMERIC(19,4);
  v_sum_credit NUMERIC(19,4);
  v_count INT;
BEGIN
  -- We only enforce balance when the voucher status is 'posted'
  IF NEW.status = 'posted' THEN
    SELECT COALESCE(SUM(debit), 0.0000), COALESCE(SUM(credit), 0.0000), COUNT(*)
    INTO v_sum_debit, v_sum_credit, v_count
    FROM voucher_lines
    WHERE voucher_id = NEW.id AND tenant_id = NEW.tenant_id;

    IF v_count = 0 THEN
      RAISE EXCEPTION 'VOUCHER_EMPTY: Posted voucher % must contain at least two balanced lines', NEW.id;
    END IF;

    IF v_sum_debit != v_sum_credit THEN
      RAISE EXCEPTION 'VOUCHER_UNBALANCED: Total debit (%) does not equal total credit (%) for voucher %',
        v_sum_debit, v_sum_credit, NEW.id;
    END IF;

    IF v_sum_debit <= 0.0000 THEN
      RAISE EXCEPTION 'VOUCHER_ZERO_AMOUNT: Posted voucher % must have total amount greater than zero', NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop prior trigger if exists and recreate as DEFERRABLE INITIALLY DEFERRED
DROP TRIGGER IF EXISTS trg_voucher_balanced ON vouchers;
CREATE CONSTRAINT TRIGGER trg_voucher_balanced
AFTER INSERT OR UPDATE ON vouchers
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION app.assert_voucher_balanced();
