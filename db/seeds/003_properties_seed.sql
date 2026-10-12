-- 003_properties_seed.sql: Seed Property Structure, Unit Types, Units & Blocks for Tenant A & B

-- ============================================================================
-- SEED TENANT A (Acme Grand Hotel - Manila Main Branch)
-- ============================================================================
SELECT set_config('app.tenant_id', 'a0000000-0000-0000-0000-000000000001', false);

-- 1. Property Types
INSERT INTO property_types (id, tenant_id, code, name)
VALUES 
  ('51000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'hotel', 'City Business Hotel')
ON CONFLICT (tenant_id, code) DO NOTHING;

-- 2. Amenities
INSERT INTO amenities (id, tenant_id, code, name, icon, category, sort)
VALUES
  ('52000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'wifi', 'High-Speed Wi-Fi', 'bi-wifi', 'room', 1),
  ('52000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'ac', 'Climate Control AC', 'bi-snow', 'room', 2),
  ('52000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'city_view', 'Panoramic City View', 'bi-building', 'room', 3),
  ('52000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'minibar', 'Complimentary Mini-Bar', 'bi-cup-straw', 'room', 4),
  ('52000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'safe', 'Electronic Laptop Safe', 'bi-safe', 'room', 5)
ON CONFLICT (tenant_id, code) DO NOTHING;

-- 3. Building
INSERT INTO buildings (id, tenant_id, branch_id, code, name, sort)
VALUES
  ('53000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'TWA', 'Main Tower A', 1)
ON CONFLICT (tenant_id, branch_id, code) DO NOTHING;

-- 4. Floors
INSERT INTO floors (id, tenant_id, branch_id, building_id, number, name, sort)
VALUES
  ('54000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '53000000-0000-0000-0000-000000000001', '1', '1st Floor - Lobby & Garden Rooms', 1),
  ('54000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '53000000-0000-0000-0000-000000000001', '2', '2nd Floor - Deluxe Wing', 2),
  ('54000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '53000000-0000-0000-0000-000000000001', '3', '3rd Floor - Executive Rooms', 3),
  ('54000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '53000000-0000-0000-0000-000000000001', '4', '4th Floor - Club Floors', 4),
  ('54000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '53000000-0000-0000-0000-000000000001', '5', '5th Floor - Penthouse & Suites', 5)
ON CONFLICT (tenant_id, branch_id, number) DO NOTHING;

-- 5. Unit Types
INSERT INTO unit_types (id, tenant_id, branch_id, code, name, kind, max_adults, max_children, max_occupancy, base_rate, sort)
VALUES
  ('55000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'STD', 'Standard King Room', 'room', 2, 1, 2, 3500.0000, 1),
  ('55000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'DLX', 'Deluxe City View', 'room', 2, 2, 3, 5500.0000, 2),
  ('55000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'STE', 'Executive Suite', 'suite', 3, 2, 4, 9500.0000, 3)
ON CONFLICT (tenant_id, branch_id, code) DO NOTHING;

-- 6. Units (Floor 1: 101-104, Floor 2: 201-204, Floor 3: 301-304, Floor 4: 401-404, Floor 5: 501-504)
INSERT INTO units (id, tenant_id, branch_id, unit_type_id, building, floor, number, name, status_code, is_sellable, attrs)
VALUES
  -- Floor 1
  ('56000000-0000-0000-0000-000000000101', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '55000000-0000-0000-0000-000000000001', 'Main Tower A', '1', '101', 'Standard 101', 'vacant_clean', true, '{"guestName": null}'),
  ('56000000-0000-0000-0000-000000000102', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '55000000-0000-0000-0000-000000000001', 'Main Tower A', '1', '102', 'Standard 102', 'vacant_dirty', false, '{"guestName": null}'),
  ('56000000-0000-0000-0000-000000000103', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '55000000-0000-0000-0000-000000000001', 'Main Tower A', '1', '103', 'Standard 103', 'inspected', true, '{"guestName": null}'),
  ('56000000-0000-0000-0000-000000000104', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '55000000-0000-0000-0000-000000000001', 'Main Tower A', '1', '104', 'Standard 104', 'occupied', false, '{"guestName": "Dr. Aris Vance", "vipStatus": "gold"}'),

  -- Floor 2
  ('56000000-0000-0000-0000-000000000201', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '55000000-0000-0000-0000-000000000002', 'Main Tower A', '2', '201', 'Deluxe 201', 'due_out', false, '{"guestName": "Elena Rostova", "etd": "12:00 PM"}'),
  ('56000000-0000-0000-0000-000000000202', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '55000000-0000-0000-0000-000000000002', 'Main Tower A', '2', '202', 'Deluxe 202', 'due_in', false, '{"guestName": "Marcus Sterling", "eta": "02:00 PM", "vipStatus": "platinum"}'),
  ('56000000-0000-0000-0000-000000000203', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '55000000-0000-0000-0000-000000000002', 'Main Tower A', '2', '203', 'Deluxe 203', 'reserved', false, '{"guestName": "Sophia Chen"}'),
  ('56000000-0000-0000-0000-000000000204', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '55000000-0000-0000-0000-000000000002', 'Main Tower A', '2', '204', 'Deluxe 204', 'vacant_clean', true, '{"guestName": null}'),

  -- Floor 3
  ('56000000-0000-0000-0000-000000000301', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '55000000-0000-0000-0000-000000000002', 'Main Tower A', '3', '301', 'Deluxe 301', 'out_of_order', false, '{"oooReason": "AC Compressor Maintenance"}'),
  ('56000000-0000-0000-0000-000000000302', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '55000000-0000-0000-0000-000000000002', 'Main Tower A', '3', '302', 'Deluxe 302', 'vacant_clean', true, '{"guestName": null}'),
  ('56000000-0000-0000-0000-000000000303', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '55000000-0000-0000-0000-000000000002', 'Main Tower A', '3', '303', 'Deluxe 303', 'occupied', false, '{"guestName": "David Miller"}'),
  ('56000000-0000-0000-0000-000000000304', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '55000000-0000-0000-0000-000000000002', 'Main Tower A', '3', '304', 'Deluxe 304', 'vacant_dirty', false, '{"guestName": null}'),

  -- Floor 4
  ('56000000-0000-0000-0000-000000000401', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '55000000-0000-0000-0000-000000000003', 'Main Tower A', '4', '401', 'Executive Suite 401', 'inspected', true, '{"guestName": null}'),
  ('56000000-0000-0000-0000-000000000402', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '55000000-0000-0000-0000-000000000003', 'Main Tower A', '4', '402', 'Executive Suite 402', 'occupied', false, '{"guestName": "Governor Takahashi", "vipStatus": "platinum"}'),
  ('56000000-0000-0000-0000-000000000403', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '55000000-0000-0000-0000-000000000003', 'Main Tower A', '4', '403', 'Executive Suite 403', 'vacant_clean', true, '{"guestName": null}'),
  ('56000000-0000-0000-0000-000000000404', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '55000000-0000-0000-0000-000000000003', 'Main Tower A', '4', '404', 'Executive Suite 404', 'due_out', false, '{"guestName": "Amara Patel"}'),

  -- Floor 5
  ('56000000-0000-0000-0000-000000000501', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '55000000-0000-0000-0000-000000000003', 'Main Tower A', '5', '501', 'Presidential Penthouse 501', 'vacant_clean', true, '{"guestName": null}'),
  ('56000000-0000-0000-0000-000000000502', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '55000000-0000-0000-0000-000000000003', 'Main Tower A', '5', '502', 'Royal Penthouse 502', 'occupied', false, '{"guestName": "Ambassador Laurent", "vipStatus": "platinum"}')
ON CONFLICT (tenant_id, branch_id, number) DO NOTHING;

-- 7. Active Out-of-Order Block for Room 301
INSERT INTO unit_blocks (id, tenant_id, branch_id, unit_id, block_type, reason, from_date, to_date, notes, is_active, created_by)
VALUES
  ('57000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '56000000-0000-0000-0000-000000000301', 'out_of_order', 'AC Compressor Failure', CURRENT_DATE, CURRENT_DATE + INTERVAL '3 days', 'Replacement part arriving tomorrow afternoon', true, '10000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- SEED TENANT B (Boracay Paradise Resort)
-- ============================================================================
SELECT set_config('app.tenant_id', 'a0000000-0000-0000-0000-000000000002', false);

INSERT INTO property_types (id, tenant_id, code, name)
VALUES 
  ('61000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'resort', 'Beachfront Luxury Resort')
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO buildings (id, tenant_id, branch_id, code, name, sort)
VALUES
  ('63000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 'BFV', 'Beachfront Villas Cluster', 1)
ON CONFLICT (tenant_id, branch_id, code) DO NOTHING;

INSERT INTO floors (id, tenant_id, branch_id, building_id, number, name, sort)
VALUES
  ('64000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', '63000000-0000-0000-0000-000000000001', 'G', 'Ground Beach Level', 1)
ON CONFLICT (tenant_id, branch_id, number) DO NOTHING;

INSERT INTO unit_types (id, tenant_id, branch_id, code, name, kind, max_adults, max_children, max_occupancy, base_rate, sort)
VALUES
  ('65000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 'VIL', 'Ocean Villa with Plunge Pool', 'villa', 4, 2, 4, 18000.0000, 1)
ON CONFLICT (tenant_id, branch_id, code) DO NOTHING;

INSERT INTO units (id, tenant_id, branch_id, unit_type_id, building, floor, number, name, status_code, is_sellable, attrs)
VALUES
  ('66000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', '65000000-0000-0000-0000-000000000001', 'Beachfront Villas Cluster', 'G', 'V01', 'Ocean Villa 1', 'vacant_clean', true, '{"guestName": null}'),
  ('66000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', '65000000-0000-0000-0000-000000000001', 'Beachfront Villas Cluster', 'G', 'V02', 'Ocean Villa 2', 'occupied', false, '{"guestName": "Liam Davies"}')
ON CONFLICT (tenant_id, branch_id, number) DO NOTHING;

SELECT set_config('app.tenant_id', '', false);
