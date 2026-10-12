-- 009_restaurant_and_pos.sql: Dining Outlets, Kitchen Stations, Dining Tables,
-- Menu Categories, Menu Items, Recipes (BOM), POS Shifts, Orders, KOTs, Bills, Payments & Voids.

-- 1. Dining Outlets
CREATE TABLE IF NOT EXISTS outlets (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  outlet_type TEXT NOT NULL DEFAULT 'restaurant' CHECK (outlet_type IN ('restaurant', 'bar', 'cafe', 'room_service', 'banquet')),
  warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL,
  depletion_mode TEXT NOT NULL DEFAULT 'at_settle' CHECK (depletion_mode IN ('at_fire', 'at_settle')),
  operating_hours JSONB DEFAULT '{"open": "06:00", "close": "23:00"}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ,
  UNIQUE (tenant_id, branch_id, code)
);
CREATE INDEX IF NOT EXISTS outlets_tenant_branch_idx ON outlets (tenant_id, branch_id, is_active);
SELECT app.enable_tenant_rls('outlets');

-- 2. Kitchen Stations (KDS / Printer routing)
CREATE TABLE IF NOT EXISTS kitchen_stations (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  printer_ip TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, outlet_id, code)
);
CREATE INDEX IF NOT EXISTS kitchen_stations_tenant_outlet_idx ON kitchen_stations (tenant_id, outlet_id);
SELECT app.enable_tenant_rls('kitchen_stations');

-- 3. Dining Tables (Status tiles matching room board pattern)
CREATE TABLE IF NOT EXISTS dining_tables (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  table_number TEXT NOT NULL,
  name TEXT NOT NULL,
  section TEXT DEFAULT 'Main Dining',
  capacity INT NOT NULL DEFAULT 4,
  status TEXT NOT NULL DEFAULT 'free' CHECK (status IN ('free', 'seated', 'ordered', 'billed', 'dirty')),
  current_order_id UUID,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ,
  UNIQUE (tenant_id, outlet_id, table_number)
);
CREATE INDEX IF NOT EXISTS dining_tables_tenant_outlet_idx ON dining_tables (tenant_id, outlet_id, status);
SELECT app.enable_tenant_rls('dining_tables');

-- 4. Menu Categories
CREATE TABLE IF NOT EXISTS menu_categories (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  kitchen_station_id UUID REFERENCES kitchen_stations(id) ON DELETE SET NULL,
  display_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, outlet_id, code)
);
CREATE INDEX IF NOT EXISTS menu_categories_tenant_outlet_idx ON menu_categories (tenant_id, outlet_id);
SELECT app.enable_tenant_rls('menu_categories');

-- 5. Menu Items (with 86 availability toggle & pricing)
CREATE TABLE IF NOT EXISTS menu_items (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES menu_categories(id) ON DELETE CASCADE,
  kitchen_station_id UUID REFERENCES kitchen_stations(id) ON DELETE SET NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  base_price NUMERIC(19,4) NOT NULL DEFAULT 0.0000,
  tax_rate NUMERIC(6,4) NOT NULL DEFAULT 0.1200,
  service_charge_rate NUMERIC(6,4) NOT NULL DEFAULT 0.1000,
  item_type TEXT NOT NULL DEFAULT 'food' CHECK (item_type IN ('food', 'beverage', 'other')),
  is_available BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ,
  UNIQUE (tenant_id, outlet_id, code)
);
CREATE INDEX IF NOT EXISTS menu_items_tenant_cat_idx ON menu_items (tenant_id, category_id, is_available);
SELECT app.enable_tenant_rls('menu_items');

-- 6. Recipes & Bill of Materials (BOM) linking to inventory items
CREATE TABLE IF NOT EXISTS recipes (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  yield_servings NUMERIC(18,4) NOT NULL DEFAULT 1.0000,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, menu_item_id)
);
CREATE INDEX IF NOT EXISTS recipes_tenant_item_idx ON recipes (tenant_id, menu_item_id);
SELECT app.enable_tenant_rls('recipes');

CREATE TABLE IF NOT EXISTS recipe_lines (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(id),
  qty NUMERIC(18,4) NOT NULL,
  yield_pct NUMERIC(6,2) NOT NULL DEFAULT 100.00,
  waste_pct NUMERIC(6,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS recipe_lines_tenant_recipe_idx ON recipe_lines (tenant_id, recipe_id);
SELECT app.enable_tenant_rls('recipe_lines');

-- 7. POS Shifts & Cash Drawer Management
CREATE TABLE IF NOT EXISTS pos_shifts (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  shift_no TEXT NOT NULL,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  opening_float NUMERIC(19,4) NOT NULL DEFAULT 0.0000,
  cash_drops NUMERIC(19,4) NOT NULL DEFAULT 0.0000,
  cash_payments NUMERIC(19,4) NOT NULL DEFAULT 0.0000,
  closing_cash NUMERIC(19,4),
  expected_cash NUMERIC(19,4),
  variance NUMERIC(19,4),
  voucher_id UUID REFERENCES vouchers(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, outlet_id, shift_no)
);
CREATE INDEX IF NOT EXISTS pos_shifts_tenant_outlet_idx ON pos_shifts (tenant_id, outlet_id, status);
SELECT app.enable_tenant_rls('pos_shifts');

-- 8. POS Orders
CREATE TABLE IF NOT EXISTS pos_orders (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  table_id UUID REFERENCES dining_tables(id) ON DELETE SET NULL,
  order_no TEXT NOT NULL,
  shift_id UUID REFERENCES pos_shifts(id) ON DELETE SET NULL,
  covers INT NOT NULL DEFAULT 1,
  server_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'fired', 'served', 'billed', 'settled', 'voided')),
  subtotal NUMERIC(19,4) NOT NULL DEFAULT 0.0000,
  tax_amount NUMERIC(19,4) NOT NULL DEFAULT 0.0000,
  service_charge_amount NUMERIC(19,4) NOT NULL DEFAULT 0.0000,
  total_amount NUMERIC(19,4) NOT NULL DEFAULT 0.0000,
  notes TEXT,
  void_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ,
  UNIQUE (tenant_id, outlet_id, order_no)
);
CREATE INDEX IF NOT EXISTS pos_orders_tenant_status_idx ON pos_orders (tenant_id, outlet_id, status);
SELECT app.enable_tenant_rls('pos_orders');

-- 9. POS Order Lines
CREATE TABLE IF NOT EXISTS pos_order_lines (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES pos_orders(id) ON DELETE CASCADE,
  line_no INT NOT NULL,
  menu_item_id UUID NOT NULL REFERENCES menu_items(id),
  quantity NUMERIC(18,4) NOT NULL DEFAULT 1.0000,
  unit_price NUMERIC(19,4) NOT NULL,
  tax_rate NUMERIC(6,4) NOT NULL DEFAULT 0.1200,
  tax_amount NUMERIC(19,4) NOT NULL DEFAULT 0.0000,
  line_total NUMERIC(19,4) NOT NULL,
  seat_no INT,
  course TEXT NOT NULL DEFAULT 'main' CHECK (course IN ('drinks', 'appetizer', 'main', 'dessert')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'fired', 'served', 'voided')),
  modifiers JSONB DEFAULT '[]'::jsonb,
  notes TEXT,
  void_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pos_order_lines_tenant_order_idx ON pos_order_lines (tenant_id, order_id);
SELECT app.enable_tenant_rls('pos_order_lines');

-- 10. Kitchen Order Tickets (KOT)
CREATE TABLE IF NOT EXISTS kots (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  station_id UUID REFERENCES kitchen_stations(id) ON DELETE SET NULL,
  order_id UUID NOT NULL REFERENCES pos_orders(id) ON DELETE CASCADE,
  table_id UUID REFERENCES dining_tables(id) ON DELETE SET NULL,
  kot_no TEXT NOT NULL,
  is_void BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'cooking', 'ready', 'collected', 'voided')),
  fired_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kots_tenant_station_idx ON kots (tenant_id, station_id, status);
SELECT app.enable_tenant_rls('kots');

CREATE TABLE IF NOT EXISTS kot_lines (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kot_id UUID NOT NULL REFERENCES kots(id) ON DELETE CASCADE,
  order_line_id UUID NOT NULL REFERENCES pos_order_lines(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL REFERENCES menu_items(id),
  quantity NUMERIC(18,4) NOT NULL,
  modifiers JSONB,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS kot_lines_tenant_kot_idx ON kot_lines (tenant_id, kot_id);
SELECT app.enable_tenant_rls('kot_lines');

-- 11. POS Bills (Guest Checks)
CREATE TABLE IF NOT EXISTS pos_bills (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES pos_orders(id) ON DELETE CASCADE,
  table_id UUID REFERENCES dining_tables(id) ON DELETE SET NULL,
  bill_no TEXT NOT NULL,
  subtotal NUMERIC(19,4) NOT NULL DEFAULT 0.0000,
  discount_amount NUMERIC(19,4) NOT NULL DEFAULT 0.0000,
  discount_reason TEXT,
  service_charge_amount NUMERIC(19,4) NOT NULL DEFAULT 0.0000,
  tax_amount NUMERIC(19,4) NOT NULL DEFAULT 0.0000,
  tip_amount NUMERIC(19,4) NOT NULL DEFAULT 0.0000,
  total_amount NUMERIC(19,4) NOT NULL DEFAULT 0.0000,
  paid_amount NUMERIC(19,4) NOT NULL DEFAULT 0.0000,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'paid', 'voided')),
  revenue_voucher_id UUID REFERENCES vouchers(id) ON DELETE SET NULL,
  cogs_voucher_id UUID REFERENCES vouchers(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  settled_at TIMESTAMPTZ,
  UNIQUE (tenant_id, outlet_id, bill_no)
);
CREATE INDEX IF NOT EXISTS pos_bills_tenant_order_idx ON pos_bills (tenant_id, order_id, status);
SELECT app.enable_tenant_rls('pos_bills');

-- 12. POS Bill Payments (Multiple Tenders & Room Charge Integration)
CREATE TABLE IF NOT EXISTS pos_bill_payments (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  bill_id UUID NOT NULL REFERENCES pos_bills(id) ON DELETE CASCADE,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'card', 'qr', 'room_charge', 'city_ledger')),
  amount NUMERIC(19,4) NOT NULL,
  tender_reference TEXT,
  stay_id UUID REFERENCES stays(id) ON DELETE SET NULL,
  folio_id UUID REFERENCES folios(id) ON DELETE SET NULL,
  folio_line_id UUID REFERENCES folio_lines(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pos_bill_payments_tenant_bill_idx ON pos_bill_payments (tenant_id, bill_id);
SELECT app.enable_tenant_rls('pos_bill_payments');
