-- 001_initial_seed.sql: Initial seed data for Tenant A and Tenant B

-- 1. Insert Global Tenants
INSERT INTO tenants (id, slug, name, plan, active)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'acme-hotel',
  'Acme Grand Hotel',
  'enterprise',
  true
) ON CONFLICT (id) DO NOTHING;

INSERT INTO tenants (id, slug, name, plan, active)
VALUES (
  'a0000000-0000-0000-0000-000000000002',
  'boracay-resort',
  'Boracay Paradise Resort',
  'enterprise',
  true
) ON CONFLICT (id) DO NOTHING;

-- 2. Insert Global Users
INSERT INTO users (id, email, password_hash, name, active)
VALUES 
(
  '10000000-0000-0000-0000-000000000001',
  'admin@acme.com',
  '$2b$10$ZsgB.3Ivrm4EIp2pCRwbqOqMwjZxR9mzoXdw/bWuXqA5K5S/nNINa',
  'Acme Admin',
  true
),
(
  '10000000-0000-0000-0000-000000000002',
  'manager@boracay.com',
  '$2b$10$ZsgB.3Ivrm4EIp2pCRwbqOqMwjZxR9mzoXdw/bWuXqA5K5S/nNINa',
  'Boracay Manager',
  true
) ON CONFLICT (id) DO UPDATE SET password_hash = EXCLUDED.password_hash;

-- 3. Seed Tenant A Rows (Set Tenant A context)
SELECT set_config('app.tenant_id', 'a0000000-0000-0000-0000-000000000001', false);

INSERT INTO branches (id, tenant_id, code, name, timezone, base_currency, business_date, active)
VALUES (
  'b0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'MNL-MAIN',
  'Manila Main Hotel',
  'Asia/Manila',
  'PHP',
  CURRENT_DATE,
  true
) ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO memberships (id, tenant_id, user_id, active)
VALUES (
  '20000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  true
) ON CONFLICT (tenant_id, user_id) DO NOTHING;

INSERT INTO roles (id, tenant_id, code, name, permissions)
VALUES (
  '30000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'admin',
  'Administrator',
  ARRAY['*']
) ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO membership_roles (id, tenant_id, membership_id, role_id, branch_scope)
VALUES (
  '40000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  NULL
) ON CONFLICT DO NOTHING;

-- 4. Seed Tenant B Rows (Set Tenant B context)
SELECT set_config('app.tenant_id', 'a0000000-0000-0000-0000-000000000002', false);

INSERT INTO branches (id, tenant_id, code, name, timezone, base_currency, business_date, active)
VALUES (
  'b0000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000002',
  'BOR-RESORT',
  'Boracay Beachfront Resort',
  'Asia/Manila',
  'PHP',
  CURRENT_DATE,
  true
) ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO memberships (id, tenant_id, user_id, active)
VALUES (
  '20000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000002',
  true
) ON CONFLICT (tenant_id, user_id) DO NOTHING;

INSERT INTO roles (id, tenant_id, code, name, permissions)
VALUES (
  '30000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000002',
  'manager',
  'General Manager',
  ARRAY['*']
) ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO membership_roles (id, tenant_id, membership_id, role_id, branch_scope)
VALUES (
  '40000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000002',
  '30000000-0000-0000-0000-000000000002',
  NULL
) ON CONFLICT DO NOTHING;

-- 5. Clear context after seeding
SELECT set_config('app.tenant_id', '', false);
