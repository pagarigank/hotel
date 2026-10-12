-- 002_config_seed.sql: Default Statuses, Actions, Settings, and Numbering Sequences for Tenant A & B

-- ============================================================================
-- SEED TENANT A CONFIGURATION
-- ============================================================================
SELECT set_config('app.tenant_id', 'a0000000-0000-0000-0000-000000000001', false);

-- Tenant A Status Definitions for Units
INSERT INTO status_defs (id, tenant_id, entity, code, label, color_token, icon, sort, is_sellable, is_occupied, is_dirty, blocks_booking, system_key)
VALUES 
  ('11000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'unit', 'vacant_clean', 'Vacant Clean', 'status-vacant-clean', 'bi-check-circle', 10, true, false, false, false, 'VACANT_CLEAN'),
  ('11000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'unit', 'vacant_dirty', 'Vacant Dirty', 'status-vacant-dirty', 'bi-brush', 20, false, false, true, false, 'VACANT_DIRTY'),
  ('11000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'unit', 'inspected', 'Inspected', 'status-inspected', 'bi-patch-check', 30, true, false, false, false, 'INSPECTED'),
  ('11000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'unit', 'occupied', 'Occupied', 'status-occupied', 'bi-person-fill', 40, false, true, false, false, 'OCCUPIED'),
  ('11000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'unit', 'due_out', 'Due Out', 'status-due-out', 'bi-box-arrow-right', 50, false, true, false, false, 'DUE_OUT'),
  ('11000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'unit', 'due_in', 'Due In', 'status-due-in', 'bi-box-arrow-in-right', 60, false, false, false, false, 'DUE_IN'),
  ('11000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', 'unit', 'reserved', 'Reserved', 'status-reserved', 'bi-bookmark-fill', 70, false, false, false, false, 'RESERVED'),
  ('11000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000001', 'unit', 'out_of_order', 'Out of Order', 'status-ooo', 'bi-slash-circle', 80, false, false, false, true, 'OUT_OF_ORDER')
ON CONFLICT (tenant_id, id) DO NOTHING;

-- Tenant A Status Transitions
INSERT INTO status_transitions (id, tenant_id, entity, from_code, to_code, permission, requires_reason)
VALUES
  ('15000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'unit', 'vacant_dirty', 'vacant_clean', 'housekeeping.status.update', false),
  ('15000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'unit', 'vacant_clean', 'inspected', 'housekeeping.status.update', false),
  ('15000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'unit', 'vacant_clean', 'occupied', 'frontdesk.stay.checkin', false),
  ('15000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'unit', 'due_in', 'occupied', 'frontdesk.stay.checkin', false),
  ('15000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'unit', 'occupied', 'due_out', 'frontdesk.stay.checkout', false),
  ('15000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'unit', 'due_out', 'vacant_dirty', 'frontdesk.stay.checkout', false),
  ('15000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', 'unit', 'vacant_clean', 'out_of_order', 'unit.status.block', true),
  ('15000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000001', 'unit', 'out_of_order', 'vacant_dirty', 'unit.status.block', false)
ON CONFLICT (tenant_id, entity, from_code, to_code) DO NOTHING;

-- Tenant A Action Definitions for Room Tiles
INSERT INTO action_defs (id, tenant_id, entity, code, label, icon, group_code, permission, visible_when, target, sort)
VALUES
  ('12000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'unit', 'check_in', 'Check-in Guest', 'bi-box-arrow-in-right', 'frontdesk', 'frontdesk.stay.checkin', '{"statusIn":["due_in","vacant_clean"]}', '{"type":"wizard","key":"check-in"}', 10),
  ('12000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'unit', 'new_reservation', 'New Reservation', 'bi-calendar-plus', 'reservation', 'reservation.booking.create', '{"statusIn":["vacant_clean","inspected"]}', '{"type":"wizard","key":"new-reservation"}', 20),
  ('12000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'unit', 'post_charge', 'Post Charge', 'bi-receipt', 'folio', 'folio.charge.post', '{"statusIn":["occupied","due_out"]}', '{"type":"modal","key":"post-charge"}', 30),
  ('12000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'unit', 'check_out', 'Check-out', 'bi-box-arrow-right', 'frontdesk', 'frontdesk.stay.checkout', '{"statusIn":["due_out","occupied"]}', '{"type":"wizard","key":"check-out"}', 40),
  ('12000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'unit', 'mark_clean', 'Mark Clean', 'bi-check2', 'housekeeping', 'housekeeping.status.update', '{"statusIn":["vacant_dirty"]}', '{"type":"modal","key":"mark-clean"}', 50),
  ('12000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'unit', 'block_unit', 'Block (OOO)', 'bi-slash-circle', 'maintenance', 'unit.status.block', '{}', '{"type":"modal","key":"block-unit"}', 60)
ON CONFLICT (tenant_id, id) DO NOTHING;

-- Tenant A Numbering Sequences
INSERT INTO numbering_sequences (id, tenant_id, branch_id, doc_type, prefix, pattern, reset_policy, next_no, is_gapless)
VALUES
  ('13000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'reservation', 'RES', '{PREFIX}-{YYYY}-{#6}', 'yearly', 1001, false),
  ('13000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'folio', 'FOL', '{PREFIX}-{YYYY}-{#6}', 'yearly', 2001, false),
  ('13000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'invoice', 'INV', '{PREFIX}-{YYYY}-{#6}', 'yearly', 1, true),
  ('13000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'voucher', 'JV', '{PREFIX}-{YYYY}-{#6}', 'yearly', 1, true)
ON CONFLICT (tenant_id, branch_id, doc_type) DO NOTHING;

-- Tenant A Settings
INSERT INTO settings (id, tenant_id, scope_type, scope_id, key, value)
VALUES
  ('14000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'tenant', NULL, 'frontdesk.checkin.requireCleanRoom', '"clean"'),
  ('14000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'tenant', NULL, 'hotel.overbooking.allowancePct', '5'),
  ('14000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'tenant', NULL, 'accounting.roundingAccount', '"9990-ROUNDING"')
ON CONFLICT (tenant_id, id) DO NOTHING;

-- ============================================================================
-- SEED TENANT B CONFIGURATION
-- ============================================================================
SELECT set_config('app.tenant_id', 'a0000000-0000-0000-0000-000000000002', false);

INSERT INTO status_defs (id, tenant_id, entity, code, label, color_token, icon, sort, is_sellable, is_occupied, is_dirty, blocks_booking, system_key)
VALUES 
  ('21000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'unit', 'vacant_clean', 'Beach Villa Clean', 'status-vacant-clean', 'bi-check-circle', 10, true, false, false, false, 'VACANT_CLEAN'),
  ('21000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'unit', 'occupied', 'Guest In Residence', 'status-occupied', 'bi-person-fill', 40, false, true, false, false, 'OCCUPIED')
ON CONFLICT (tenant_id, id) DO NOTHING;

INSERT INTO action_defs (id, tenant_id, entity, code, label, icon, group_code, permission, visible_when, target, sort)
VALUES
  ('22000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'unit', 'check_in', 'Villa Welcome Check-in', 'bi-box-arrow-in-right', 'frontdesk', 'frontdesk.stay.checkin', '{"statusIn":["vacant_clean"]}', '{"type":"wizard","key":"check-in"}', 10)
ON CONFLICT (tenant_id, id) DO NOTHING;

INSERT INTO status_transitions (id, tenant_id, entity, from_code, to_code, permission, requires_reason)
VALUES
  ('25000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'unit', 'vacant_clean', 'occupied', 'frontdesk.stay.checkin', false),
  ('25000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'unit', 'occupied', 'vacant_clean', 'frontdesk.stay.checkout', false)
ON CONFLICT (tenant_id, entity, from_code, to_code) DO NOTHING;

SELECT set_config('app.tenant_id', '', false);
