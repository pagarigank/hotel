-- 004_reservations_seed.sql: Guests, Companies, Taxes, Charge Codes, Rate Plans, Rates, Inventory & Reservations Seed

-- 1. Guests
INSERT INTO guests (id, tenant_id, first_name, last_name, email, email_normalized, phone, phone_e164, birth_date, nationality, vip_status, notes)
VALUES
  ('30000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'John', 'Doe', 'john.doe@example.com', 'john.doe@example.com', '+1-555-0101', '+15550101', '1985-06-15', 'US', 'standard', 'Prefers quiet rooms away from elevator'),
  ('30000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Jane', 'Smith', 'jane.smith@globalcorp.com', 'jane.smith@globalcorp.com', '+1-555-0102', '+15550102', '1990-11-20', 'CA', 'gold', 'Frequent business guest, feather pillows requested'),
  ('30000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Robert', 'Johnson', 'robert.j@vipholdings.com', 'robert.j@vipholdings.com', '+44-20-7946-0991', '+442079460991', '1978-03-30', 'GB', 'platinum', 'VIP Executive guest. Champagne arrival service'),
  ('30000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'Alice', 'Walker', 'alice.walker@techdev.io', 'alice.walker@techdev.io', '+63-917-123-4567', '+639171234567', '1995-08-12', 'PH', 'silver', 'Late checkout requested'),
  -- Tenant B Guest
  ('30000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000002', 'Michael', 'Chang', 'michael.chang@boracay.com', 'michael.chang@boracay.com', '+65-6789-0123', '+6567890123', '1982-01-05', 'SG', 'gold', 'Boracay villa recurring guest')
ON CONFLICT (id) DO NOTHING;

-- 2. Companies
INSERT INTO companies (id, tenant_id, name, tax_identifier, billing_email, phone, credit_limit, credit_terms_days)
VALUES
  ('31000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Global Tech Consulting Inc.', 'TIN-987-654-321', 'ap@globaltech.com', '+1-555-0900', 50000.0000, 30),
  ('31000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Horizon Travel Group', 'TIN-112-233-445', 'billing@horizontravel.com', '+44-20-7946-0100', 100000.0000, 45)
ON CONFLICT (id) DO NOTHING;

-- 3. Taxes
INSERT INTO taxes (id, tenant_id, code, name, rate_pct, is_flat_amount, flat_amount, currency, gl_account_code, is_active)
VALUES
  ('32000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'VAT12', 'Value Added Tax (12%)', 12.0000, false, 0, 'USD', '2100', true),
  ('32000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'SVC10', 'Service Charge (10%)', 10.0000, false, 0, 'USD', '2110', true),
  ('32000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'CITY03', 'Local City Tourism Tax (3%)', 3.0000, false, 0, 'USD', '2120', true)
ON CONFLICT (tenant_id, code) DO NOTHING;

-- 4. Tax Rules
INSERT INTO tax_rules (id, tenant_id, branch_id, code, name, is_inclusive, calculation_order, compounds_previous, tax_ids)
VALUES
  ('33000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'STD_ROOM_TAX', 'Standard Lodging Taxes & Fees', false, 1, false, ARRAY['32000000-0000-0000-0000-000000000001'::uuid, '32000000-0000-0000-0000-000000000002'::uuid, '32000000-0000-0000-0000-000000000003'::uuid])
ON CONFLICT (tenant_id, branch_id, code) DO NOTHING;

-- 5. Charge Codes
INSERT INTO charge_codes (id, tenant_id, branch_id, code, name, charge_group, tax_rule_id, gl_account_code, allow_discount, department, is_active)
VALUES
  ('34000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'ROOM_REV', 'Room Revenue Charge', 'room', '33000000-0000-0000-0000-000000000001', '4000', true, 'rooms', true),
  ('34000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'FNB_BREAKFAST', 'Buffet Breakfast', 'fnb', NULL, '4100', true, 'food_beverage', true),
  ('34000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'SPA_MASSAGE', 'Spa Body Massage', 'spa', NULL, '4200', true, 'spa', true)
ON CONFLICT (tenant_id, branch_id, code) DO NOTHING;

-- 6. Rate Plans
INSERT INTO rate_plans (id, tenant_id, branch_id, code, name, currency, is_active, policy_cancellation, policy_deposit, policy_no_show)
VALUES
  (
    '35000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    'BAR',
    'Best Available Rate (Flexible)',
    'USD',
    true,
    '{"type":"free_until_days","daysBefore":1,"penalty":"first_night"}',
    '{"type":"first_night_or_card_guarantee","amountPct":100}',
    '{"type":"charge_first_night"}'
  ),
  (
    '35000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    'CORP',
    'Corporate Negotiated Rate',
    'USD',
    true,
    '{"type":"free_until_6pm_arrival_day"}',
    '{"type":"direct_bill_credit"}',
    '{"type":"charge_first_night"}'
  ),
  (
    '35000000-0000-0000-0000-000000000003',
    'a0000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    'NONREF',
    'Advance Purchase (Non-Refundable)',
    'USD',
    true,
    '{"type":"non_refundable","penalty":"100_percent"}',
    '{"type":"full_prepayment","amountPct":100}',
    '{"type":"charge_full_stay"}'
  )
ON CONFLICT (tenant_id, branch_id, code) DO NOTHING;

-- 7. Rate Calendar (Generate 60 days of rates for STD, DLX, STE)
INSERT INTO rate_calendar (id, tenant_id, branch_id, rate_plan_id, unit_type_id, stay_date, rate, single_occupancy_rate, extra_adult_rate, extra_child_rate)
SELECT
  gen_random_uuid(),
  'a0000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  rp.id,
  ut.id,
  CURRENT_DATE + s.i,
  ROUND((ut.base_rate * CASE rp.code WHEN 'NONREF' THEN 0.85 WHEN 'CORP' THEN 0.90 ELSE 1.00 END), 2),
  ROUND((ut.base_rate * 0.90), 2),
  25.0000,
  10.0000
FROM unit_types ut
CROSS JOIN rate_plans rp
CROSS JOIN generate_series(0, 59) AS s(i)
WHERE ut.tenant_id = 'a0000000-0000-0000-0000-000000000001'
  AND rp.tenant_id = 'a0000000-0000-0000-0000-000000000001'
ON CONFLICT (tenant_id, branch_id, rate_plan_id, unit_type_id, stay_date) DO NOTHING;

-- 8. Room Type Inventory (60 days capacity for STD, DLX, STE)
INSERT INTO room_type_inventory (tenant_id, branch_id, unit_type_id, stay_date, capacity, sold, overbook_allowance, stop_sell)
SELECT
  'a0000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  ut.id,
  CURRENT_DATE + s.i,
  (SELECT count(*)::int FROM units u WHERE u.unit_type_id = ut.id AND u.deleted_at IS NULL),
  0,
  0,
  false
FROM unit_types ut
CROSS JOIN generate_series(0, 59) AS s(i)
WHERE ut.tenant_id = 'a0000000-0000-0000-0000-000000000001'
ON CONFLICT (tenant_id, branch_id, unit_type_id, stay_date) DO NOTHING;

-- 9. Sample Seed Reservations
-- Res 1: Confirmed (John Doe, STD 101, Current Date -> +3 days)
INSERT INTO reservations (id, tenant_id, branch_id, reservation_no, status, guest_id, source, policy_snapshot, notes)
VALUES (
  '36000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  'RSV-2026-0001',
  'confirmed',
  '30000000-0000-0000-0000-000000000001',
  'direct',
  '{"ratePlan":"BAR","guarantee":"credit_card_preauth"}',
  'Early check-in requested'
) ON CONFLICT (tenant_id, branch_id, reservation_no) DO NOTHING;

INSERT INTO reservation_units (id, tenant_id, branch_id, reservation_id, unit_type_id, unit_id, rate_plan_id, check_in, check_out, adults, children, status)
VALUES (
  '37000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  '36000000-0000-0000-0000-000000000001',
  '55000000-0000-0000-0000-000000000001',
  '56000000-0000-0000-0000-000000000101',
  '35000000-0000-0000-0000-000000000001',
  CURRENT_DATE,
  CURRENT_DATE + 3,
  2,
  0,
  'confirmed'
) ON CONFLICT (id) DO NOTHING;

-- Record reservation nights
INSERT INTO reservation_nights (tenant_id, reservation_unit_id, stay_date, rate, tax_snapshot)
VALUES
  ('a0000000-0000-0000-0000-000000000001', '37000000-0000-0000-0000-000000000001', CURRENT_DATE, 120.0000, '[{"taxCode":"VAT12","amount":14.40}]'),
  ('a0000000-0000-0000-0000-000000000001', '37000000-0000-0000-0000-000000000001', CURRENT_DATE + 1, 120.0000, '[{"taxCode":"VAT12","amount":14.40}]'),
  ('a0000000-0000-0000-0000-000000000001', '37000000-0000-0000-0000-000000000001', CURRENT_DATE + 2, 120.0000, '[{"taxCode":"VAT12","amount":14.40}]')
ON CONFLICT (tenant_id, reservation_unit_id, stay_date) DO NOTHING;

-- Increment sold count for those nights
UPDATE room_type_inventory
SET sold = sold + 1
WHERE tenant_id = 'a0000000-0000-0000-0000-000000000001'
  AND branch_id = 'b0000000-0000-0000-0000-000000000001'
  AND unit_type_id = '55000000-0000-0000-0000-000000000001'
  AND stay_date IN (CURRENT_DATE, CURRENT_DATE + 1, CURRENT_DATE + 2);
