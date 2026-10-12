-- 006_accounting_seed.sql: Phase 5 Pre-Seeded USALI Chart of Accounts, Fiscal Calendar & Posting Rules

DO $$
DECLARE
  v_tenant_id UUID := 'a0000000-0000-0000-0000-000000000001';
  v_branch_id UUID := 'b0000000-0000-0000-0000-000000000001';
  v_user_id   UUID := '10000000-0000-0000-0000-000000000001';
  v_fy_id     UUID := 'f0000000-0000-0000-0000-000000002026';
  v_period_10 UUID := 'f0000000-0000-0000-0000-000000001026'; -- Oct 2026 (current)
  v_period_09 UUID := 'f0000000-0000-0000-0000-000000000926'; -- Sep 2026 (closed)
  v_voucher_id UUID := 'e0000000-0000-0000-0000-000000000001';
  v_acct_cash UUID;
  v_acct_bank UUID;
  v_acct_guest_ledger UUID;
  v_acct_city_ledger UUID;
  v_acct_room_rev UUID;
  v_acct_tax_payable UUID;
BEGIN
  -- 1. Pre-seed USALI 12th Revised Edition Chart of Accounts
  -- Assets (1xxx)
  INSERT INTO accounts (id, tenant_id, code, name, account_class, account_group, normal_balance, is_control_account, control_type)
  VALUES
    ('c0000000-0000-0000-0000-000000001010', v_tenant_id, '1010', 'Cash on Hand / Front Desk Float', 'asset', 'cash_and_equivalents', 'debit', false, null),
    ('c0000000-0000-0000-0000-000000001020', v_tenant_id, '1020', 'Operating Bank Account (BDO/Chase)', 'asset', 'cash_and_equivalents', 'debit', false, null),
    ('c0000000-0000-0000-0000-000000001110', v_tenant_id, '1110', 'Guest Ledger', 'asset', 'guest_ledger', 'debit', true, 'guest_ledger'),
    ('c0000000-0000-0000-0000-000000001120', v_tenant_id, '1120', 'City Ledger (Accounts Receivable)', 'asset', 'accounts_receivable', 'debit', true, 'city_ledger'),
    ('c0000000-0000-0000-0000-000000001210', v_tenant_id, '1210', 'Food & Beverage Inventory', 'asset', 'inventory', 'debit', true, 'inventory'),
    ('c0000000-0000-0000-0000-000000001220', v_tenant_id, '1220', 'Operating Supplies & Linen Inventory', 'asset', 'inventory', 'debit', false, null),
    ('c0000000-0000-0000-0000-000000001310', v_tenant_id, '1310', 'Prepaid Insurance & Licences', 'asset', 'prepaids', 'debit', false, null),
    ('c0000000-0000-0000-0000-000000001510', v_tenant_id, '1510', 'Property, Plant & Equipment', 'asset', 'fixed_assets', 'debit', false, null)
  ON CONFLICT (tenant_id, code) DO NOTHING;

  -- Liabilities (2xxx)
  INSERT INTO accounts (id, tenant_id, code, name, account_class, account_group, normal_balance, is_control_account, control_type)
  VALUES
    ('c0000000-0000-0000-0000-000000002010', v_tenant_id, '2010', 'Accounts Payable (Trade Suppliers)', 'liability', 'accounts_payable', 'credit', true, 'accounts_payable'),
    ('c0000000-0000-0000-0000-000000002110', v_tenant_id, '2110', 'Customer Advance Deposits', 'liability', 'customer_deposits', 'credit', true, 'customer_deposits'),
    ('c0000000-0000-0000-0000-000000002210', v_tenant_id, '2210', 'Sales & Occupancy Taxes Payable', 'liability', 'taxes_payable', 'credit', false, null),
    ('c0000000-0000-0000-0000-000000002220', v_tenant_id, '2220', 'Service Charge Payable to Staff', 'liability', 'current_liabilities', 'credit', false, null),
    ('c0000000-0000-0000-0000-000000002310', v_tenant_id, '2310', 'Accrued Payroll & Wages', 'liability', 'accruals', 'credit', false, null)
  ON CONFLICT (tenant_id, code) DO NOTHING;

  -- Equity (3xxx)
  INSERT INTO accounts (id, tenant_id, code, name, account_class, account_group, normal_balance, is_control_account, control_type)
  VALUES
    ('c0000000-0000-0000-0000-000000003010', v_tenant_id, '3010', 'Owner Equity & Paid-in Capital', 'equity', 'capital', 'credit', false, null),
    ('c0000000-0000-0000-0000-000000003020', v_tenant_id, '3020', 'Retained Earnings', 'equity', 'retained_earnings', 'credit', false, null)
  ON CONFLICT (tenant_id, code) DO NOTHING;

  -- Revenue (4xxx)
  INSERT INTO accounts (id, tenant_id, code, name, account_class, account_group, normal_balance, is_control_account, control_type)
  VALUES
    ('c0000000-0000-0000-0000-000000004010', v_tenant_id, '4010', 'Rooms Revenue', 'revenue', 'rooms_revenue', 'credit', false, null),
    ('c0000000-0000-0000-0000-000000004020', v_tenant_id, '4020', 'Food Revenue', 'revenue', 'fnb_revenue', 'credit', false, null),
    ('c0000000-0000-0000-0000-000000004030', v_tenant_id, '4030', 'Beverage Revenue', 'revenue', 'fnb_revenue', 'credit', false, null),
    ('c0000000-0000-0000-0000-000000004040', v_tenant_id, '4040', 'Minibar Revenue', 'revenue', 'rooms_revenue', 'credit', false, null),
    ('c0000000-0000-0000-0000-000000004050', v_tenant_id, '4050', 'Miscellaneous Other Revenue', 'revenue', 'other_revenue', 'credit', false, null),
    ('c0000000-0000-0000-0000-000000004060', v_tenant_id, '4060', 'Cancellation & No-Show Fees', 'revenue', 'other_revenue', 'credit', false, null)
  ON CONFLICT (tenant_id, code) DO NOTHING;

  -- Cost of Goods Sold (5xxx)
  INSERT INTO accounts (id, tenant_id, code, name, account_class, account_group, normal_balance, is_control_account, control_type)
  VALUES
    ('c0000000-0000-0000-0000-000000005010', v_tenant_id, '5010', 'Cost of Sales - Food', 'cogs', 'cogs_fnb', 'debit', false, null),
    ('c0000000-0000-0000-0000-000000005020', v_tenant_id, '5020', 'Cost of Sales - Beverage', 'cogs', 'cogs_fnb', 'debit', false, null),
    ('c0000000-0000-0000-0000-000000005030', v_tenant_id, '5030', 'Cost of Sales - Minibar', 'cogs', 'cogs_rooms', 'debit', false, null)
  ON CONFLICT (tenant_id, code) DO NOTHING;

  -- Expenses (6xxx)
  INSERT INTO accounts (id, tenant_id, code, name, account_class, account_group, normal_balance, is_control_account, control_type)
  VALUES
    ('c0000000-0000-0000-0000-000000006010', v_tenant_id, '6010', 'Rooms - Salaries & Wages', 'expense', 'rooms_expenses', 'debit', false, null),
    ('c0000000-0000-0000-0000-000000006020', v_tenant_id, '6020', 'Rooms - Cleaning Supplies & Laundry', 'expense', 'rooms_expenses', 'debit', false, null),
    ('c0000000-0000-0000-0000-000000006030', v_tenant_id, '6030', 'Rooms - Guest Supplies & Amenities', 'expense', 'rooms_expenses', 'debit', false, null),
    ('c0000000-0000-0000-0000-000000006040', v_tenant_id, '6040', 'Administrative & General Expenses', 'expense', 'admin_expenses', 'debit', false, null),
    ('c0000000-0000-0000-0000-000000006050', v_tenant_id, '6050', 'Utilities (Electricity, Water, Gas)', 'expense', 'utilities', 'debit', false, null),
    ('c0000000-0000-0000-0000-000000006060', v_tenant_id, '6060', 'Maintenance & Property Repairs', 'expense', 'maintenance', 'debit', false, null)
  ON CONFLICT (tenant_id, code) DO NOTHING;

  -- 2. Pre-seed Fiscal Year 2026
  INSERT INTO fiscal_years (id, tenant_id, name, start_date, end_date, status)
  VALUES (v_fy_id, v_tenant_id, 'FY2026', '2026-01-01', '2026-12-31', 'open')
  ON CONFLICT (tenant_id, name) DO NOTHING;

  -- 3. Pre-seed 12 Monthly Periods
  INSERT INTO fiscal_periods (id, tenant_id, fiscal_year_id, period_no, name, start_date, end_date, status)
  VALUES
    ('f0000000-0000-0000-0000-000000000126', v_tenant_id, v_fy_id, 1, '2026-01', '2026-01-01', '2026-01-31', 'closed'),
    ('f0000000-0000-0000-0000-000000000226', v_tenant_id, v_fy_id, 2, '2026-02', '2026-02-01', '2026-02-28', 'closed'),
    ('f0000000-0000-0000-0000-000000000326', v_tenant_id, v_fy_id, 3, '2026-03', '2026-03-01', '2026-03-31', 'closed'),
    ('f0000000-0000-0000-0000-000000000426', v_tenant_id, v_fy_id, 4, '2026-04', '2026-04-01', '2026-04-30', 'closed'),
    ('f0000000-0000-0000-0000-000000000526', v_tenant_id, v_fy_id, 5, '2026-05', '2026-05-01', '2026-05-31', 'closed'),
    ('f0000000-0000-0000-0000-000000000626', v_tenant_id, v_fy_id, 6, '2026-06', '2026-06-01', '2026-06-30', 'closed'),
    ('f0000000-0000-0000-0000-000000000726', v_tenant_id, v_fy_id, 7, '2026-07', '2026-07-01', '2026-07-31', 'closed'),
    ('f0000000-0000-0000-0000-000000000826', v_tenant_id, v_fy_id, 8, '2026-08', '2026-08-01', '2026-08-31', 'closed'),
    (v_period_09,                           v_tenant_id, v_fy_id, 9, '2026-09', '2026-09-01', '2026-09-30', 'closed'),
    (v_period_10,                           v_tenant_id, v_fy_id, 10, '2026-10', '2026-10-01', '2026-10-31', 'open'),
    ('f0000000-0000-0000-0000-000000001126', v_tenant_id, v_fy_id, 11, '2026-11', '2026-11-01', '2026-11-30', 'open'),
    ('f0000000-0000-0000-0000-000000001226', v_tenant_id, v_fy_id, 12, '2026-12', '2026-12-01', '2026-12-31', 'open')
  ON CONFLICT (tenant_id, fiscal_year_id, period_no) DO NOTHING;

  -- 4. Pre-seed Default Operational Posting Rules
  INSERT INTO posting_rules (id, tenant_id, branch_id, event_type, priority, auto_approve, match_conditions, rule_lines, description)
  VALUES
    (
      'ea000000-0000-0000-0000-000000000001',
      v_tenant_id,
      v_branch_id,
      'night_audit.room_tax',
      100,
      true,
      '{}'::jsonb,
      '[
        {"account_code": "1110", "side": "debit", "formula": "gross", "label": "Guest Ledger"},
        {"account_code": "4010", "side": "credit", "formula": "net", "label": "Rooms Revenue"},
        {"account_code": "2210", "side": "credit", "formula": "tax", "label": "Taxes Payable"}
      ]'::jsonb,
      'Night audit daily room charge & occupancy tax posting'
    ),
    (
      'ea000000-0000-0000-0000-000000000002',
      v_tenant_id,
      v_branch_id,
      'folio.settlement',
      100,
      true,
      '{}'::jsonb,
      '[
        {"account_code": "1020", "side": "debit", "formula": "amount", "label": "Bank Clearing / Cash"},
        {"account_code": "1110", "side": "credit", "formula": "amount", "label": "Guest Ledger"}
      ]'::jsonb,
      'Folio checkout full settlement payment'
    ),
    (
      'ea000000-0000-0000-0000-000000000003',
      v_tenant_id,
      v_branch_id,
      'folio.deposit',
      100,
      true,
      '{}'::jsonb,
      '[
        {"account_code": "1020", "side": "debit", "formula": "amount", "label": "Bank Clearing"},
        {"account_code": "2110", "side": "credit", "formula": "amount", "label": "Customer Advance Deposits"}
      ]'::jsonb,
      'Advance reservation deposit receipt'
    ),
    (
      'ea000000-0000-0000-0000-000000000004',
      v_tenant_id,
      v_branch_id,
      'folio.city_ledger',
      100,
      true,
      '{}'::jsonb,
      '[
        {"account_code": "1120", "side": "debit", "formula": "amount", "label": "City Ledger AR"},
        {"account_code": "1110", "side": "credit", "formula": "amount", "label": "Guest Ledger"}
      ]'::jsonb,
      'Folio balance transfer to corporate City Ledger (AR)'
    )
  ON CONFLICT (id) DO NOTHING;

  -- 5. Pre-seed Sample Balanced Posted Voucher & GL Entries
  SELECT id INTO v_acct_guest_ledger FROM accounts WHERE code = '1110' AND tenant_id = v_tenant_id;
  SELECT id INTO v_acct_room_rev     FROM accounts WHERE code = '4010' AND tenant_id = v_tenant_id;
  SELECT id INTO v_acct_tax_payable  FROM accounts WHERE code = '2210' AND tenant_id = v_tenant_id;

  INSERT INTO vouchers (
    id, tenant_id, branch_id, voucher_no, voucher_type, status,
    posting_date, fiscal_period_id, description, source_type,
    total_debit, total_credit, created_by, posted_by, posted_at
  ) VALUES (
    v_voucher_id,
    v_tenant_id,
    v_branch_id,
    'JV-2026-000001',
    'JV',
    'posted',
    '2026-10-25',
    v_period_10,
    'Automated Night Audit Room & Tax Posting (Room 101)',
    'night_audit',
    275.0000,
    275.0000,
    v_user_id,
    v_user_id,
    now()
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO voucher_lines (id, tenant_id, voucher_id, line_no, account_id, description, debit, credit)
  VALUES
    ('d0000000-0000-0000-0000-000000000001', v_tenant_id, v_voucher_id, 1, v_acct_guest_ledger, 'Room 101 Nightly Folio Charge', 275.0000, 0.0000),
    ('d0000000-0000-0000-0000-000000000002', v_tenant_id, v_voucher_id, 2, v_acct_room_rev,     'Room 101 Base Room Revenue',     0.0000, 250.0000),
    ('d0000000-0000-0000-0000-000000000003', v_tenant_id, v_voucher_id, 3, v_acct_tax_payable,  'Room 101 Occupancy Tax 10%',     0.0000, 25.0000)
  ON CONFLICT (tenant_id, voucher_id, line_no) DO NOTHING;

  INSERT INTO gl_entries (
    id, tenant_id, branch_id, voucher_id, voucher_line_id, voucher_no, voucher_type,
    posting_date, fiscal_period_id, account_id, account_code, debit, credit, description, source_type
  ) VALUES
    ('a1000000-0000-0000-0000-000000000001', v_tenant_id, v_branch_id, v_voucher_id, 'd0000000-0000-0000-0000-000000000001', 'JV-2026-000001', 'JV', '2026-10-25', v_period_10, v_acct_guest_ledger, '1110', 275.0000, 0.0000, 'Room 101 Nightly Folio Charge', 'night_audit'),
    ('a1000000-0000-0000-0000-000000000002', v_tenant_id, v_branch_id, v_voucher_id, 'd0000000-0000-0000-0000-000000000002', 'JV-2026-000001', 'JV', '2026-10-25', v_period_10, v_acct_room_rev,     '4010', 0.0000, 250.0000, 'Room 101 Base Room Revenue', 'night_audit'),
    ('a1000000-0000-0000-0000-000000000003', v_tenant_id, v_branch_id, v_voucher_id, 'd0000000-0000-0000-0000-000000000003', 'JV-2026-000001', 'JV', '2026-10-25', v_period_10, v_acct_tax_payable,  '2210', 0.0000, 25.0000, 'Room 101 Occupancy Tax 10%', 'night_audit')
  ON CONFLICT (id) DO NOTHING;

  -- Update gl_balances cache
  INSERT INTO gl_balances (id, tenant_id, branch_id, account_id, fiscal_period_id, opening_balance, total_debit, total_credit, closing_balance)
  VALUES
    ('b0000000-0000-0000-0000-000000001110', v_tenant_id, v_branch_id, v_acct_guest_ledger, v_period_10, 0.0000, 275.0000, 0.0000, 275.0000),
    ('b0000000-0000-0000-0000-000000004010', v_tenant_id, v_branch_id, v_acct_room_rev,     v_period_10, 0.0000, 0.0000, 250.0000, -250.0000),
    ('b0000000-0000-0000-0000-000000002210', v_tenant_id, v_branch_id, v_acct_tax_payable,  v_period_10, 0.0000, 0.0000, 25.0000, -25.0000)
  ON CONFLICT (tenant_id, branch_id, account_id, fiscal_period_id) DO UPDATE SET
    total_debit = EXCLUDED.total_debit,
    total_credit = EXCLUDED.total_credit,
    closing_balance = EXCLUDED.closing_balance;
END $$;
