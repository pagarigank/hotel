-- 005_front_desk_seed.sql: Seed Housekeeping Checklists, Business Dates, Sample Stays, Folios, HK Tasks
DO $$
DECLARE
  v_tenant_a UUID := 'a0000000-0000-0000-0000-000000000001';
  v_tenant_b UUID := 'a0000000-0000-0000-0000-000000000002';
  v_branch_mnl UUID := 'b0000000-0000-0000-0000-000000000001';
  v_user_admin UUID := '10000000-0000-0000-0000-000000000001';
  v_guest_1 UUID := '30000000-0000-0000-0000-000000000001'; -- John Doe
  v_guest_2 UUID := '30000000-0000-0000-0000-000000000002'; -- Jane Smith
  v_res_1 UUID := '36000000-0000-0000-0000-000000000001';
  v_ru_1 UUID := '37000000-0000-0000-0000-000000000001';
  v_unit_101 UUID := '56000000-0000-0000-0000-000000000101';
  v_unit_102 UUID := '56000000-0000-0000-0000-000000000102';
  v_unit_103 UUID := '56000000-0000-0000-0000-000000000103';
  v_unit_201 UUID := '56000000-0000-0000-0000-000000000201';
  v_chk_checkout UUID := '60000000-0000-0000-0000-000000000001';
  v_chk_stayover UUID := '60000000-0000-0000-0000-000000000002';
  v_stay_1 UUID := '70000000-0000-0000-0000-000000000001';
  v_folio_1 UUID := '80000000-0000-0000-0000-000000000001';
  v_chg_room UUID := '34000000-0000-0000-0000-000000000001'; -- ROOM_REV
  v_today DATE := CURRENT_DATE;
BEGIN
  -- 1. Housekeeping Checklists
  INSERT INTO hk_checklists (id, tenant_id, code, name, task_type, items, is_active)
  VALUES
    (v_chk_checkout, v_tenant_a, 'CHK-CHECKOUT', 'Standard Departure Room Turnaround', 'checkout_clean',
     '[{"id":"1","label":"Strip and replace bed linens with fresh sheets","mandatory":true},
       {"id":"2","label":"Scrub and sanitize bathroom surfaces and replace towels","mandatory":true},
       {"id":"3","label":"Inspect minibar and replenish amenities","mandatory":true},
       {"id":"4","label":"Vacuum carpet, mop hard floors, wipe surfaces","mandatory":true}]'::jsonb, true),
    (v_chk_stayover, v_tenant_a, 'CHK-STAYOVER', 'Daily Stayover Refresh Checklist', 'stayover_clean',
     '[{"id":"1","label":"Make bed and change towels if placed in tub","mandatory":true},
       {"id":"2","label":"Empty trash bins and replace liners","mandatory":true},
       {"id":"3","label":"Replenish complimentary water, coffee & tea","mandatory":true}]'::jsonb, true)
  ON CONFLICT (tenant_id, code) DO NOTHING;

  -- 2. Business Dates
  INSERT INTO business_dates (id, tenant_id, branch_id, business_date, opened_at, status)
  VALUES
    ('90000000-0000-0000-0000-000000000001', v_tenant_a, v_branch_mnl, v_today, now(), 'open')
  ON CONFLICT (tenant_id, branch_id, business_date) DO NOTHING;

  -- 3. Stays
  INSERT INTO stays (id, tenant_id, branch_id, reservation_id, reservation_unit_id, unit_id, guest_id, actual_check_in, expected_check_out, status, keycard_code)
  VALUES
    (v_stay_1, v_tenant_a, v_branch_mnl, v_res_1, v_ru_1, v_unit_101, v_guest_1, now() - interval '1 day', v_today + 2, 'in_house', 'KEY-101-9876')
  ON CONFLICT (id) DO NOTHING;

  -- 4. Folios
  INSERT INTO folios (id, tenant_id, branch_id, folio_no, kind, stay_id, reservation_id, status, currency, total_charges, total_payments, balance)
  VALUES
    (v_folio_1, v_tenant_a, v_branch_mnl, 'FOL-2026-0001', 'guest', v_stay_1, v_res_1, 'open', 'USD', 175.5000, 0.0000, 175.5000)
  ON CONFLICT (tenant_id, branch_id, folio_no) DO NOTHING;

  -- 5. Folio Lines on Window 1
  INSERT INTO folio_lines (id, tenant_id, branch_id, folio_id, stay_id, window_no, business_date, line_type, charge_type, charge_code_id, description, qty, unit_amount, amount, tax_amount)
  VALUES
    ('81000000-0000-0000-0000-000000000001', v_tenant_a, v_branch_mnl, v_folio_1, v_stay_1, 1, v_today - 1, 'charge', 'room', v_chg_room, 'Room Charge - Standard Room (Night 1)', 1, 150.0000, 150.0000, 25.5000),
    ('81000000-0000-0000-0000-000000000002', v_tenant_a, v_branch_mnl, v_folio_1, v_stay_1, 1, v_today - 1, 'charge', 'night_tax', NULL, 'Stay Taxes (VAT 12% + SVC 10% + City 3%)', 1, 25.5000, 25.5000, 0.0000)
  ON CONFLICT (id) DO NOTHING;

  -- 6. Sample Housekeeping Tasks
  INSERT INTO hk_tasks (id, tenant_id, branch_id, unit_id, task_type, priority, status, checklist_id, notes)
  VALUES
    ('85000000-0000-0000-0000-000000000001', v_tenant_a, v_branch_mnl, v_unit_201, 'checkout_clean', 'high', 'pending', v_chk_checkout, 'Guest checked out at 10:30 AM. VIP arrival scheduled tonight.'),
    ('85000000-0000-0000-0000-000000000002', v_tenant_a, v_branch_mnl, v_unit_101, 'stayover_clean', 'standard', 'in_progress', v_chk_stayover, 'Stayover service for John Doe.')
  ON CONFLICT (id) DO UPDATE SET unit_id = EXCLUDED.unit_id, status = EXCLUDED.status, priority = EXCLUDED.priority;
  UPDATE units SET status_code = 'vacant_dirty' WHERE id = v_unit_102;

  -- 7. Sample Maintenance Order
  INSERT INTO maintenance_orders (id, tenant_id, branch_id, unit_id, title, description, priority, status, reported_by)
  VALUES
    ('86000000-0000-0000-0000-000000000001', v_tenant_a, v_branch_mnl, v_unit_201, 'Air Conditioning Filter Replacement', 'Routine AC filter cleaning and temperature sensor calibration', 'medium', 'reported', v_user_admin)
  ON CONFLICT (id) DO NOTHING;

  -- 8. Sample Lost & Found
  INSERT INTO lost_found (id, tenant_id, branch_id, item_name, category, found_location, found_unit_id, found_by, found_date, status, storage_location)
  VALUES
    ('87000000-0000-0000-0000-000000000001', v_tenant_a, v_branch_mnl, 'Black Leather Sunglasses Case', 'clothing', 'Room 101 side table', v_unit_101, v_user_admin, v_today - 1, 'held', 'Security Locker Shelf B-3')
  ON CONFLICT (id) DO NOTHING;

END $$;
