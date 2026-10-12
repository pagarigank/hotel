-- Seed 007: Default Units of Measure, Item Categories, Storage Warehouses,
-- Suppliers, Master Items, Initial Stock Balances & Posting Rules.

DO $$
DECLARE
  v_tenant_id UUID := 'a0000000-0000-0000-0000-000000000001';
  v_branch_id UUID := 'b0000000-0000-0000-0000-000000000001';
  v_user_id   UUID := '10000000-0000-0000-0000-000000000001';

  -- UoM IDs
  v_uom_kg   UUID := 'c1000000-0000-0000-0000-000000000001';
  v_uom_g    UUID := 'c1000000-0000-0000-0000-000000000002';
  v_uom_l    UUID := 'c1000000-0000-0000-0000-000000000003';
  v_uom_ml   UUID := 'c1000000-0000-0000-0000-000000000004';
  v_uom_pcs  UUID := 'c1000000-0000-0000-0000-000000000005';
  v_uom_box  UUID := 'c1000000-0000-0000-0000-000000000006';
  v_uom_btl  UUID := 'c1000000-0000-0000-0000-000000000007';

  -- Category IDs
  v_cat_food UUID := 'c2000000-0000-0000-0000-000000000001';
  v_cat_bev  UUID := 'c2000000-0000-0000-0000-000000000002';
  v_cat_hk   UUID := 'c2000000-0000-0000-0000-000000000003';
  v_cat_mini UUID := 'c2000000-0000-0000-0000-000000000004';

  -- Warehouse IDs
  v_wh_central UUID := 'c3000000-0000-0000-0000-000000000001';
  v_wh_kitchen UUID := 'c3000000-0000-0000-0000-000000000002';
  v_wh_bar     UUID := 'c3000000-0000-0000-0000-000000000003';
  v_wh_hk      UUID := 'c3000000-0000-0000-0000-000000000004';

  -- Supplier IDs
  v_sup_food UUID := 'c4000000-0000-0000-0000-000000000001';
  v_sup_bev  UUID := 'c4000000-0000-0000-0000-000000000002';
  v_sup_hk   UUID := 'c4000000-0000-0000-0000-000000000003';

  -- Item IDs
  v_itm_ribeye UUID := 'c5000000-0000-0000-0000-000000000001';
  v_itm_coffee UUID := 'c5000000-0000-0000-0000-000000000002';
  v_itm_wine   UUID := 'c5000000-0000-0000-0000-000000000003';
  v_itm_water  UUID := 'c5000000-0000-0000-0000-000000000004';
  v_itm_towel  UUID := 'c5000000-0000-0000-0000-000000000005';

  -- GL Account IDs
  v_acct_inv_food UUID;
  v_acct_cogs_fnb UUID;
  v_acct_grni     UUID;
  v_acct_ap       UUID;
  v_acct_hk_exp   UUID;

  v_grn_id UUID := 'c6000000-0000-0000-0000-000000000001';
BEGIN
  -- Ensure 2020 GRNI account exists in chart of accounts
  INSERT INTO accounts (id, tenant_id, code, name, account_class, account_group, normal_balance, is_control_account, control_type)
  VALUES ('c0000000-0000-0000-0000-000000002020', v_tenant_id, '2020', 'Goods Received Not Invoiced (GRNI)', 'liability', 'accounts_payable', 'credit', false, null)
  ON CONFLICT (tenant_id, code) DO NOTHING;

  -- Look up Chart of Account IDs from Phase 5
  SELECT id INTO v_acct_inv_food FROM accounts WHERE code = '1210' AND tenant_id = v_tenant_id;
  SELECT id INTO v_acct_cogs_fnb FROM accounts WHERE code = '5010' AND tenant_id = v_tenant_id;
  SELECT id INTO v_acct_grni     FROM accounts WHERE code = '2020' AND tenant_id = v_tenant_id;
  SELECT id INTO v_acct_ap       FROM accounts WHERE code = '2010' AND tenant_id = v_tenant_id;
  SELECT id INTO v_acct_hk_exp   FROM accounts WHERE code = '6010' AND tenant_id = v_tenant_id;

  -- 1. Units of Measure
  INSERT INTO uoms (id, tenant_id, code, name, category)
  VALUES
    (v_uom_kg,  v_tenant_id, 'KG',  'Kilogram', 'mass'),
    (v_uom_g,   v_tenant_id, 'G',   'Gram',     'mass'),
    (v_uom_l,   v_tenant_id, 'L',   'Liter',    'volume'),
    (v_uom_ml,  v_tenant_id, 'ML',  'Milliliter','volume'),
    (v_uom_pcs, v_tenant_id, 'PCS', 'Pieces',   'count'),
    (v_uom_box, v_tenant_id, 'BOX', 'Box',      'count'),
    (v_uom_btl, v_tenant_id, 'BTL', 'Bottle',   'count')
  ON CONFLICT (tenant_id, code) DO NOTHING;

  -- 2. UoM Conversions
  INSERT INTO uom_conversions (id, tenant_id, from_uom_id, to_uom_id, conversion_factor)
  VALUES
    ('c1100000-0000-0000-0000-000000000001', v_tenant_id, v_uom_kg, v_uom_g, 1000.000000),
    ('c1100000-0000-0000-0000-000000000002', v_tenant_id, v_uom_l,  v_uom_ml, 1000.000000)
  ON CONFLICT (tenant_id, from_uom_id, to_uom_id) DO NOTHING;

  -- 3. Item Categories
  INSERT INTO item_categories (id, tenant_id, code, name, default_valuation_method, gl_inventory_account_id, gl_cogs_account_id, gl_expense_account_id)
  VALUES
    (v_cat_food, v_tenant_id, 'FOOD',    'Food & Raw Ingredients',  'wac', v_acct_inv_food, v_acct_cogs_fnb, v_acct_cogs_fnb),
    (v_cat_bev,  v_tenant_id, 'BEV',     'Beverage & Wines',        'wac', v_acct_inv_food, v_acct_cogs_fnb, v_acct_cogs_fnb),
    (v_cat_hk,   v_tenant_id, 'LINEN',   'Housekeeping & Linens',   'wac', v_acct_inv_food, v_acct_hk_exp,   v_acct_hk_exp),
    (v_cat_mini, v_tenant_id, 'MINIBAR', 'Minibar Goods & Snacks',  'wac', v_acct_inv_food, v_acct_cogs_fnb, v_acct_cogs_fnb)
  ON CONFLICT (tenant_id, code) DO NOTHING;

  -- 4. Storage Warehouses
  INSERT INTO warehouses (id, tenant_id, branch_id, code, name, warehouse_type, negative_stock_policy)
  VALUES
    (v_wh_central, v_tenant_id, v_branch_id, 'WH-CENTRAL', 'Central Commissary Warehouse', 'central',      'block'),
    (v_wh_kitchen, v_tenant_id, v_branch_id, 'WH-KITCHEN', 'Main Kitchen Production Store', 'kitchen',      'block'),
    (v_wh_bar,     v_tenant_id, v_branch_id, 'WH-BAR',     'Lounge Bar Beverage Store',     'bar',          'block'),
    (v_wh_hk,      v_tenant_id, v_branch_id, 'WH-HK',      'Housekeeping Linens Depot',     'housekeeping', 'block')
  ON CONFLICT (tenant_id, branch_id, code) DO NOTHING;

  -- 5. Suppliers
  INSERT INTO suppliers (id, tenant_id, code, name, contact_person, email, phone, payment_terms_days, currency)
  VALUES
    (v_sup_food, v_tenant_id, 'SUP-FOOD', 'Manila Fresh Produce & Prime Meats', 'Carlos Mendoza', 'sales@manilafresh.ph', '+63 2 8123 4567', 30, 'USD'),
    (v_sup_bev,  v_tenant_id, 'SUP-BEV',  'Pacific Premium Wines & Spirits',    'Maria Santos',   'orders@pacificwines.ph', '+63 2 8987 6543', 30, 'USD'),
    (v_sup_hk,   v_tenant_id, 'SUP-HK',   'Metro Commercial Linens & Towels',   'David Tan',      'service@metrolinens.ph', '+63 2 8555 1234', 30, 'USD')
  ON CONFLICT (tenant_id, code) DO NOTHING;

  -- 6. Items
  INSERT INTO items (id, tenant_id, category_id, code, name, description, base_uom_id, valuation_method, standard_cost, min_stock_level, reorder_point, is_perishable)
  VALUES
    (v_itm_ribeye, v_tenant_id, v_cat_food, 'ITM-RIBEYE', 'Wagyu Ribeye Steak Cut', 'Prime Japanese A5 Ribeye for fine dining grill', v_uom_kg,  'wac', 35.0000, 10.0000, 20.0000, true),
    (v_itm_coffee, v_tenant_id, v_cat_food, 'ITM-COFFEE', 'Arabica Espresso Beans', 'Single-origin espresso coffee beans',             v_uom_kg,  'wac', 18.0000, 15.0000, 30.0000, false),
    (v_itm_wine,   v_tenant_id, v_cat_bev,  'ITM-WINE',   'Cabernet Sauvignon 750ml','Vintage oak-aged red wine',                      v_uom_btl, 'wac', 24.0000, 24.0000, 48.0000, false),
    (v_itm_water,  v_tenant_id, v_cat_mini, 'ITM-WATER',  'Sparkling Water 330ml',   'Glass-bottled sparkling mineral water',          v_uom_btl, 'wac', 1.8000,  50.0000, 100.0000,false),
    (v_itm_towel,  v_tenant_id, v_cat_hk,   'ITM-TOWEL',  'Luxury Bath Towel 700gsm','Egyptian cotton heavy bath sheet',               v_uom_pcs, 'wac', 14.0000, 100.0000, 200.0000,false)
  ON CONFLICT (tenant_id, code) DO NOTHING;

  -- 7. Initial Stock Balances & Seeded Ledger Postings
  -- Ribeye in WH-CENTRAL: 50 KG @ $35.00 -> $1,750.00
  INSERT INTO stock_balances (id, tenant_id, branch_id, warehouse_id, item_id, balance_qty, balance_value, valuation_rate, last_cost)
  VALUES
    ('c7000000-0000-0000-0000-000000000001', v_tenant_id, v_branch_id, v_wh_central, v_itm_ribeye, 50.0000, 1750.0000, 35.000000, 35.000000),
    ('c7000000-0000-0000-0000-000000000002', v_tenant_id, v_branch_id, v_wh_central, v_itm_coffee, 80.0000, 1440.0000, 18.000000, 18.000000),
    ('c7000000-0000-0000-0000-000000000003', v_tenant_id, v_branch_id, v_wh_bar,     v_itm_wine,   60.0000, 1440.0000, 24.000000, 24.000000),
    ('c7000000-0000-0000-0000-000000000004', v_tenant_id, v_branch_id, v_wh_central, v_itm_water,  200.0000, 360.0000, 1.800000,  1.800000),
    ('c7000000-0000-0000-0000-000000000005', v_tenant_id, v_branch_id, v_wh_hk,      v_itm_towel,  300.0000, 4200.0000, 14.000000, 14.000000)
  ON CONFLICT (tenant_id, warehouse_id, item_id) DO NOTHING;

  -- 8. Seeded Initial GRN Document
  INSERT INTO goods_receipt_notes (
    id, tenant_id, branch_id, grn_no, supplier_id, warehouse_id,
    receipt_date, status, supplier_invoice_no, total_amount, notes, received_by
  ) VALUES (
    v_grn_id, v_tenant_id, v_branch_id, 'GRN-2026-000001', v_sup_food, v_wh_central,
    '2026-10-25', 'received', 'INV-MNL-90412', 3190.0000, 'Initial commissary pantry opening stock', v_user_id
  ) ON CONFLICT (tenant_id, branch_id, grn_no) DO NOTHING;

  -- Seeded Initial Stock Ledger Rows
  INSERT INTO stock_ledger (
    id, tenant_id, branch_id, warehouse_id, item_id, posting_date,
    doc_type, doc_id, doc_no, qty_delta, unit_cost, value_delta, balance_qty, balance_value, valuation_rate
  ) VALUES
    ('c8000000-0000-0000-0000-000000000001', v_tenant_id, v_branch_id, v_wh_central, v_itm_ribeye, '2026-10-25', 'grn', v_grn_id, 'GRN-2026-000001', 50.0000, 35.000000, 1750.0000, 50.0000, 1750.0000, 35.000000),
    ('c8000000-0000-0000-0000-000000000002', v_tenant_id, v_branch_id, v_wh_central, v_itm_coffee, '2026-10-25', 'grn', v_grn_id, 'GRN-2026-000001', 80.0000, 18.000000, 1440.0000, 80.0000, 1440.0000, 18.000000)
  ON CONFLICT DO NOTHING;

  -- 9. Additional Posting Rules for Inventory Operations
  INSERT INTO posting_rules (id, tenant_id, branch_id, event_type, priority, auto_approve, match_conditions, rule_lines, description)
  VALUES
    (
      'ea000000-0000-0000-0000-000000000005',
      v_tenant_id,
      v_branch_id,
      'inventory.grn',
      100,
      true,
      '{}'::jsonb,
      '[
        {"account_code": "1210", "side": "debit", "formula": "gross", "label": "Inventory - Food & Beverage"},
        {"account_code": "2020", "side": "credit", "formula": "gross", "label": "Goods Received Not Invoiced (GRNI)"}
      ]'::jsonb,
      'Automated Goods Receipt Note (GRN) Inventory & GRNI Clearing Posting'
    ),
    (
      'ea000000-0000-0000-0000-000000000006',
      v_tenant_id,
      v_branch_id,
      'inventory.issue',
      100,
      true,
      '{}'::jsonb,
      '[
        {"account_code": "5010", "side": "debit", "formula": "amount", "label": "Cost of Sales - Food & Beverage"},
        {"account_code": "1210", "side": "credit", "formula": "amount", "label": "Inventory - Food & Beverage"}
      ]'::jsonb,
      'Departmental Material Issue Stock Depletion to COGS/Expense'
    ),
    (
      'ea000000-0000-0000-0000-000000000007',
      v_tenant_id,
      v_branch_id,
      'inventory.adjustment',
      100,
      true,
      '{}'::jsonb,
      '[
        {"account_code": "6010", "side": "debit", "formula": "amount", "label": "Operating Expense - Waste / Adjustment"},
        {"account_code": "1210", "side": "credit", "formula": "amount", "label": "Inventory - Food & Beverage"}
      ]'::jsonb,
      'Stock Spoilage, Damage & Physical Count Variance Adjustment'
    )
  ON CONFLICT (id) DO NOTHING;

END $$;
