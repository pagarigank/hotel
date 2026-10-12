-- Migration 008: Inventory, Warehouses, Stock Ledger & Purchasing (Phase 6)
-- Conforms to REQ-INV-001..010, append-only stock_ledger, WAC valuation, and multitenancy RLS.

-- 1. Units of Measure (UoM)
CREATE TABLE IF NOT EXISTS uoms (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('mass', 'volume', 'count', 'length', 'time')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
CREATE INDEX IF NOT EXISTS uoms_tenant_idx ON uoms (tenant_id, code);
SELECT app.enable_tenant_rls('uoms');

-- 2. UoM Conversions
CREATE TABLE IF NOT EXISTS uom_conversions (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  from_uom_id UUID NOT NULL REFERENCES uoms(id) ON DELETE CASCADE,
  to_uom_id UUID NOT NULL REFERENCES uoms(id) ON DELETE CASCADE,
  conversion_factor NUMERIC(18,6) NOT NULL CHECK (conversion_factor > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, from_uom_id, to_uom_id)
);
SELECT app.enable_tenant_rls('uom_conversions');

-- 3. Item Categories
CREATE TABLE IF NOT EXISTS item_categories (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES item_categories(id) ON DELETE SET NULL,
  default_valuation_method TEXT NOT NULL DEFAULT 'wac' CHECK (default_valuation_method IN ('wac', 'fifo')),
  gl_inventory_account_id UUID REFERENCES accounts(id) ON DELETE RESTRICT,
  gl_cogs_account_id UUID REFERENCES accounts(id) ON DELETE RESTRICT,
  gl_expense_account_id UUID REFERENCES accounts(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
CREATE INDEX IF NOT EXISTS item_categories_tenant_idx ON item_categories (tenant_id, code);
SELECT app.enable_tenant_rls('item_categories');

-- 4. Item Catalog
CREATE TABLE IF NOT EXISTS items (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES item_categories(id) ON DELETE RESTRICT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  base_uom_id UUID NOT NULL REFERENCES uoms(id) ON DELETE RESTRICT,
  purchase_uom_id UUID REFERENCES uoms(id) ON DELETE RESTRICT,
  valuation_method TEXT NOT NULL DEFAULT 'wac' CHECK (valuation_method IN ('wac', 'fifo')),
  standard_cost NUMERIC(19,4) NOT NULL DEFAULT 0.0000,
  last_purchase_price NUMERIC(19,4) NOT NULL DEFAULT 0.0000,
  min_stock_level NUMERIC(18,4) NOT NULL DEFAULT 0.0000,
  max_stock_level NUMERIC(18,4),
  reorder_point NUMERIC(18,4) NOT NULL DEFAULT 0.0000,
  reorder_qty NUMERIC(18,4) NOT NULL DEFAULT 0.0000,
  is_perishable BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
CREATE INDEX IF NOT EXISTS items_tenant_code_idx ON items (tenant_id, code);
CREATE INDEX IF NOT EXISTS items_tenant_category_idx ON items (tenant_id, category_id);
SELECT app.enable_tenant_rls('items');

-- 5. Storage Warehouses
CREATE TABLE IF NOT EXISTS warehouses (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  warehouse_type TEXT NOT NULL DEFAULT 'central' CHECK (warehouse_type IN ('central', 'kitchen', 'bar', 'housekeeping', 'minibar', 'in_transit')),
  negative_stock_policy TEXT NOT NULL DEFAULT 'block' CHECK (negative_stock_policy IN ('block', 'warn', 'allow')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, branch_id, code)
);
CREATE INDEX IF NOT EXISTS warehouses_tenant_branch_idx ON warehouses (tenant_id, branch_id);
SELECT app.enable_tenant_rls('warehouses');

-- 6. Suppliers
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  contact_person TEXT,
  email TEXT,
  phone TEXT,
  tax_id TEXT,
  payment_terms_days INT NOT NULL DEFAULT 30,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
CREATE INDEX IF NOT EXISTS suppliers_tenant_idx ON suppliers (tenant_id, code);
SELECT app.enable_tenant_rls('suppliers');

-- 7. Stock Balances (Serialized Cache per Warehouse and Item)
CREATE TABLE IF NOT EXISTS stock_balances (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  balance_qty NUMERIC(18,4) NOT NULL DEFAULT 0.0000,
  balance_value NUMERIC(19,4) NOT NULL DEFAULT 0.0000,
  valuation_rate NUMERIC(19,6) NOT NULL DEFAULT 0.000000,
  last_cost NUMERIC(19,6) NOT NULL DEFAULT 0.000000,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, warehouse_id, item_id)
);
CREATE INDEX IF NOT EXISTS stock_balances_tenant_wh_item_idx ON stock_balances (tenant_id, warehouse_id, item_id);
SELECT app.enable_tenant_rls('stock_balances');

-- 8. Append-Only Stock Ledger (Audit Trail of all physical movements)
CREATE TABLE IF NOT EXISTS stock_ledger (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  posting_date DATE NOT NULL,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('grn', 'issue', 'transfer_out', 'transfer_in', 'adjustment', 'waste', 'count_variance', 'minibar_depletion')),
  doc_id UUID NOT NULL,
  doc_line_id UUID,
  doc_no TEXT,
  qty_delta NUMERIC(18,4) NOT NULL,
  unit_cost NUMERIC(19,6) NOT NULL CHECK (unit_cost >= 0),
  value_delta NUMERIC(19,4) NOT NULL,
  balance_qty NUMERIC(18,4) NOT NULL,
  balance_value NUMERIC(19,4) NOT NULL,
  valuation_rate NUMERIC(19,6) NOT NULL CHECK (valuation_rate >= 0),
  batch_no TEXT,
  expiry_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stock_ledger_tenant_wh_date_idx ON stock_ledger (tenant_id, warehouse_id, posting_date DESC);
CREATE INDEX IF NOT EXISTS stock_ledger_tenant_item_date_idx ON stock_ledger (tenant_id, item_id, posting_date DESC);
CREATE INDEX IF NOT EXISTS stock_ledger_tenant_doc_idx ON stock_ledger (tenant_id, doc_type, doc_id);
SELECT app.enable_tenant_rls('stock_ledger');

-- Ledger Immutability Trigger: stock_ledger is strictly append-only
CREATE OR REPLACE FUNCTION app.assert_stock_ledger_immutable()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Database invariant violation: stock_ledger entries are append-only and cannot be modified or deleted (attempted % on id %)',
    TG_OP, OLD.id
    USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assert_stock_ledger_immutable ON stock_ledger;
CREATE TRIGGER trg_assert_stock_ledger_immutable
BEFORE UPDATE OR DELETE ON stock_ledger
FOR EACH ROW
EXECUTE FUNCTION app.assert_stock_ledger_immutable();

-- 9. Purchase Orders (PO)
CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  po_no TEXT NOT NULL,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  order_date DATE NOT NULL,
  expected_delivery_date DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'partially_received', 'received', 'cancelled')),
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  subtotal NUMERIC(19,4) NOT NULL DEFAULT 0.0000,
  tax_amount NUMERIC(19,4) NOT NULL DEFAULT 0.0000,
  total_amount NUMERIC(19,4) NOT NULL DEFAULT 0.0000,
  notes TEXT,
  created_by UUID,
  approved_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, branch_id, po_no)
);
CREATE INDEX IF NOT EXISTS purchase_orders_tenant_supplier_idx ON purchase_orders (tenant_id, supplier_id);
SELECT app.enable_tenant_rls('purchase_orders');

CREATE TABLE IF NOT EXISTS po_lines (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  line_no INT NOT NULL,
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  uom_id UUID NOT NULL REFERENCES uoms(id) ON DELETE RESTRICT,
  qty_ordered NUMERIC(18,4) NOT NULL CHECK (qty_ordered > 0),
  qty_received NUMERIC(18,4) NOT NULL DEFAULT 0.0000,
  unit_price NUMERIC(19,4) NOT NULL CHECK (unit_price >= 0),
  total_price NUMERIC(19,4) NOT NULL CHECK (total_price >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, po_id, line_no)
);
SELECT app.enable_tenant_rls('po_lines');

-- 10. Goods Receipt Notes (GRN)
CREATE TABLE IF NOT EXISTS goods_receipt_notes (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  grn_no TEXT NOT NULL,
  po_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  receipt_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'received', 'cancelled')),
  supplier_invoice_no TEXT,
  total_amount NUMERIC(19,4) NOT NULL DEFAULT 0.0000,
  voucher_id UUID REFERENCES vouchers(id) ON DELETE SET NULL,
  notes TEXT,
  received_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, branch_id, grn_no)
);
CREATE INDEX IF NOT EXISTS grn_tenant_warehouse_idx ON goods_receipt_notes (tenant_id, warehouse_id);
SELECT app.enable_tenant_rls('goods_receipt_notes');

CREATE TABLE IF NOT EXISTS grn_lines (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  grn_id UUID NOT NULL REFERENCES goods_receipt_notes(id) ON DELETE CASCADE,
  po_line_id UUID REFERENCES po_lines(id) ON DELETE SET NULL,
  line_no INT NOT NULL,
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  uom_id UUID NOT NULL REFERENCES uoms(id) ON DELETE RESTRICT,
  qty_received NUMERIC(18,4) NOT NULL CHECK (qty_received > 0),
  unit_cost NUMERIC(19,6) NOT NULL CHECK (unit_cost >= 0),
  total_cost NUMERIC(19,4) NOT NULL CHECK (total_cost >= 0),
  batch_no TEXT,
  expiry_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, grn_id, line_no)
);
SELECT app.enable_tenant_rls('grn_lines');

-- 11. Material Issues (Department Requisitions)
CREATE TABLE IF NOT EXISTS stock_issues (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  issue_no TEXT NOT NULL,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  issue_date DATE NOT NULL,
  department TEXT NOT NULL CHECK (department IN ('kitchen', 'bar', 'housekeeping', 'maintenance', 'front_office')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'cancelled')),
  total_value NUMERIC(19,4) NOT NULL DEFAULT 0.0000,
  voucher_id UUID REFERENCES vouchers(id) ON DELETE SET NULL,
  requested_by TEXT,
  issued_by UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, branch_id, issue_no)
);
SELECT app.enable_tenant_rls('stock_issues');

CREATE TABLE IF NOT EXISTS stock_issue_lines (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  issue_id UUID NOT NULL REFERENCES stock_issues(id) ON DELETE CASCADE,
  line_no INT NOT NULL,
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  qty NUMERIC(18,4) NOT NULL CHECK (qty > 0),
  unit_cost NUMERIC(19,6) NOT NULL DEFAULT 0.000000,
  total_cost NUMERIC(19,4) NOT NULL DEFAULT 0.0000,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, issue_id, line_no)
);
SELECT app.enable_tenant_rls('stock_issue_lines');

-- 12. Stock Transfers (Inter-Warehouse and Inter-Branch)
CREATE TABLE IF NOT EXISTS stock_transfers (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  transfer_no TEXT NOT NULL,
  from_warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  to_warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  transfer_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_transit', 'completed', 'cancelled')),
  total_value NUMERIC(19,4) NOT NULL DEFAULT 0.0000,
  voucher_id UUID REFERENCES vouchers(id) ON DELETE SET NULL,
  created_by UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, branch_id, transfer_no)
);
SELECT app.enable_tenant_rls('stock_transfers');

CREATE TABLE IF NOT EXISTS stock_transfer_lines (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  transfer_id UUID NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
  line_no INT NOT NULL,
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  qty NUMERIC(18,4) NOT NULL CHECK (qty > 0),
  unit_cost NUMERIC(19,6) NOT NULL DEFAULT 0.000000,
  total_cost NUMERIC(19,4) NOT NULL DEFAULT 0.0000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, transfer_id, line_no)
);
SELECT app.enable_tenant_rls('stock_transfer_lines');

-- 13. Stock Adjustments & Waste Tracking
CREATE TABLE IF NOT EXISTS stock_adjustments (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  adj_no TEXT NOT NULL,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  adjustment_date DATE NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('spoilage', 'waste', 'damage', 'count_reconciliation', 'expired')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'cancelled')),
  total_value NUMERIC(19,4) NOT NULL DEFAULT 0.0000,
  voucher_id UUID REFERENCES vouchers(id) ON DELETE SET NULL,
  approved_by UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, branch_id, adj_no)
);
SELECT app.enable_tenant_rls('stock_adjustments');

CREATE TABLE IF NOT EXISTS stock_adjustment_lines (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  adjustment_id UUID NOT NULL REFERENCES stock_adjustments(id) ON DELETE CASCADE,
  line_no INT NOT NULL,
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  qty_delta NUMERIC(18,4) NOT NULL, -- positive for upward adjustment, negative for write-down/waste
  unit_cost NUMERIC(19,6) NOT NULL DEFAULT 0.000000,
  value_delta NUMERIC(19,4) NOT NULL DEFAULT 0.0000,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, adjustment_id, line_no)
);
SELECT app.enable_tenant_rls('stock_adjustment_lines');

-- 14. Stock Count Audits (Snapshot Freeze -> Count Entry -> Variance Reconciliation)
CREATE TABLE IF NOT EXISTS stock_counts (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  count_no TEXT NOT NULL,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  count_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'snapshot_frozen', 'counting', 'completed', 'adjusted', 'cancelled')),
  adjustment_id UUID REFERENCES stock_adjustments(id) ON DELETE SET NULL,
  created_by UUID,
  approved_by UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, branch_id, count_no)
);
SELECT app.enable_tenant_rls('stock_counts');

CREATE TABLE IF NOT EXISTS stock_count_lines (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  count_id UUID NOT NULL REFERENCES stock_counts(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  snapshot_qty NUMERIC(18,4) NOT NULL DEFAULT 0.0000,
  snapshot_cost NUMERIC(19,6) NOT NULL DEFAULT 0.000000,
  snapshot_value NUMERIC(19,4) NOT NULL DEFAULT 0.0000,
  counted_qty NUMERIC(18,4),
  variance_qty NUMERIC(18,4) DEFAULT 0.0000,
  variance_value NUMERIC(19,4) DEFAULT 0.0000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, count_id, item_id)
);
SELECT app.enable_tenant_rls('stock_count_lines');
