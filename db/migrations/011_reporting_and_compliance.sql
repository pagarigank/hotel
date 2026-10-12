-- Migration 011: Reporting Engine, Async Jobs, and Privacy Compliance (GDPR/DPA)
-- Phase 8 (Week 31–34)

-- 1. Asynchronous Report Jobs
CREATE TABLE IF NOT EXISTS report_jobs (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  report_type TEXT NOT NULL CHECK (report_type IN (
    'daily_flash', 'in_house_guests', 'arrivals_departures',
    'room_status_summary', 'night_audit_pack', 'trial_balance', 'sales_mix'
  )),
  parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
  format TEXT NOT NULL DEFAULT 'csv' CHECK (format IN ('csv', 'json', 'pdf', 'xlsx')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  file_url TEXT,
  file_size_bytes BIGINT,
  result_summary JSONB DEFAULT '{}'::jsonb,
  error_message TEXT,
  requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS report_jobs_tenant_status_idx ON report_jobs (tenant_id, status, created_at DESC);
SELECT app.enable_tenant_rls('report_jobs');

-- 2. Data Privacy & GDPR Audit Logs
CREATE TABLE IF NOT EXISTS privacy_audit_logs (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  guest_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('data_export', 'pseudonymized_erasure', 'consent_updated')),
  reason TEXT,
  performed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS privacy_audit_logs_tenant_guest_idx ON privacy_audit_logs (tenant_id, guest_id, created_at DESC);
SELECT app.enable_tenant_rls('privacy_audit_logs');

-- 3. Reporting Performance Optimization Indexes
CREATE INDEX IF NOT EXISTS idx_stays_reporting 
  ON stays (tenant_id, branch_id, status, actual_check_in, expected_check_out);

CREATE INDEX IF NOT EXISTS idx_folios_stay_status 
  ON folios (tenant_id, stay_id, status);

CREATE INDEX IF NOT EXISTS idx_folio_lines_reporting 
  ON folio_lines (tenant_id, branch_id, business_date, charge_type);

CREATE INDEX IF NOT EXISTS idx_pos_bills_reporting 
  ON pos_bills (tenant_id, branch_id, status, created_at);
