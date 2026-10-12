-- Seed 008: Dining Outlets, Kitchen Stations, Dining Tables,
-- Menu Categories, Master Menu Items, Recipes (BOM), Posting Rules.

DO $$
DECLARE
  v_tenant_id UUID := 'a0000000-0000-0000-0000-000000000001';
  v_branch_id UUID := 'b0000000-0000-0000-0000-000000000001';
  v_user_id   UUID := '10000000-0000-0000-0000-000000000001';

  -- Warehouses from Seed 007
  v_wh_kitchen UUID := 'c3000000-0000-0000-0000-000000000002';
  v_wh_bar     UUID := 'c3000000-0000-0000-0000-000000000003';

  -- Inventory Items from Seed 007
  v_itm_ribeye UUID := 'c5000000-0000-0000-0000-000000000001';
  v_itm_coffee UUID := 'c5000000-0000-0000-0000-000000000002';
  v_itm_wine   UUID := 'c5000000-0000-0000-0000-000000000003';
  v_itm_water  UUID := 'c5000000-0000-0000-0000-000000000004';

  -- Outlets
  v_outlet_bistro UUID := 'd1000000-0000-0000-0000-000000000001';
  v_outlet_bar    UUID := 'd1000000-0000-0000-0000-000000000002';

  -- Kitchen Stations
  v_sta_grill  UUID := 'd2000000-0000-0000-0000-000000000001';
  v_sta_bar    UUID := 'd2000000-0000-0000-0000-000000000002';
  v_sta_cold   UUID := 'd2000000-0000-0000-0000-000000000003';
  v_sta_pastry UUID := 'd2000000-0000-0000-0000-000000000004';

  -- Categories
  v_cat_starter UUID := 'd3000000-0000-0000-0000-000000000001';
  v_cat_mains   UUID := 'd3000000-0000-0000-0000-000000000002';
  v_cat_dessert UUID := 'd3000000-0000-0000-0000-000000000003';
  v_cat_bev     UUID := 'd3000000-0000-0000-0000-000000000004';

  -- Menu Items
  v_mnu_ribeye   UUID := 'd4000000-0000-0000-0000-000000000001';
  v_mnu_salad    UUID := 'd4000000-0000-0000-0000-000000000002';
  v_mnu_espresso UUID := 'd4000000-0000-0000-0000-000000000003';
  v_mnu_wine_gls UUID := 'd4000000-0000-0000-0000-000000000004';
  v_mnu_water    UUID := 'd4000000-0000-0000-0000-000000000005';

  -- Recipes
  v_rcp_ribeye   UUID := 'd5000000-0000-0000-0000-000000000001';
  v_rcp_espresso UUID := 'd5000000-0000-0000-0000-000000000002';
  v_rcp_wine_gls UUID := 'd5000000-0000-0000-0000-000000000003';
  v_rcp_water    UUID := 'd5000000-0000-0000-0000-000000000004';

BEGIN
  -- 1. Dining Outlets
  INSERT INTO outlets (id, tenant_id, branch_id, code, name, outlet_type, warehouse_id, depletion_mode, is_active)
  VALUES
    (v_outlet_bistro, v_tenant_id, v_branch_id, 'OUT-BISTRO', 'The Grand Bistro', 'restaurant', v_wh_kitchen, 'at_settle', true),
    (v_outlet_bar,    v_tenant_id, v_branch_id, 'OUT-BAR',    'Velvet Lounge & Bar', 'bar', v_wh_bar, 'at_settle', true)
  ON CONFLICT (tenant_id, branch_id, code) DO NOTHING;

  -- 2. Kitchen Stations
  INSERT INTO kitchen_stations (id, tenant_id, outlet_id, code, name)
  VALUES
    (v_sta_grill,  v_tenant_id, v_outlet_bistro, 'GRILL',  'Hot Kitchen & Grill'),
    (v_sta_cold,   v_tenant_id, v_outlet_bistro, 'COLD',   'Cold Larder & Salads'),
    (v_sta_pastry, v_tenant_id, v_outlet_bistro, 'PASTRY', 'Dessert & Bakery'),
    (v_sta_bar,    v_tenant_id, v_outlet_bar,    'BAR',    'Cocktail & Beverage Station')
  ON CONFLICT (tenant_id, outlet_id, code) DO NOTHING;

  -- 3. Dining Tables (Status tiles)
  INSERT INTO dining_tables (id, tenant_id, outlet_id, table_number, name, section, capacity, status)
  VALUES
    ('d6000000-0000-0000-0000-000000000001', v_tenant_id, v_outlet_bistro, 'T-01', 'Table 1', 'Window View', 2, 'free'),
    ('d6000000-0000-0000-0000-000000000002', v_tenant_id, v_outlet_bistro, 'T-02', 'Table 2', 'Window View', 4, 'free'),
    ('d6000000-0000-0000-0000-000000000003', v_tenant_id, v_outlet_bistro, 'T-03', 'Table 3', 'Main Dining', 4, 'free'),
    ('d6000000-0000-0000-0000-000000000004', v_tenant_id, v_outlet_bistro, 'T-04', 'Table 4', 'Main Dining', 6, 'free'),
    ('d6000000-0000-0000-0000-000000000005', v_tenant_id, v_outlet_bistro, 'T-05', 'Table 5', 'Private Alcove', 8, 'free'),
    ('d6000000-0000-0000-0000-000000000006', v_tenant_id, v_outlet_bar,    'B-01', 'High Top 1', 'Bar High Tops', 2, 'free'),
    ('d6000000-0000-0000-0000-000000000007', v_tenant_id, v_outlet_bar,    'B-02', 'Lounge Booth 1', 'Velvet Sofas', 4, 'free'),
    ('d6000000-0000-0000-0000-000000000008', v_tenant_id, v_outlet_bar,    'B-03', 'Lounge Booth 2', 'Velvet Sofas', 4, 'free')
  ON CONFLICT (tenant_id, outlet_id, table_number) DO NOTHING;

  -- 4. Menu Categories
  INSERT INTO menu_categories (id, tenant_id, outlet_id, code, name, kitchen_station_id, display_order)
  VALUES
    (v_cat_starter, v_tenant_id, v_outlet_bistro, 'CAT-STARTER', 'Starters & Appetizers', v_sta_cold, 1),
    (v_cat_mains,   v_tenant_id, v_outlet_bistro, 'CAT-MAINS',   'Steaks & Main Courses', v_sta_grill, 2),
    (v_cat_dessert, v_tenant_id, v_outlet_bistro, 'CAT-DESSERT', 'Artisan Desserts', v_sta_pastry, 3),
    (v_cat_bev,     v_tenant_id, v_outlet_bistro, 'CAT-BEV',     'Wines & Beverages', v_sta_bar, 4)
  ON CONFLICT (tenant_id, outlet_id, code) DO NOTHING;

  -- 5. Menu Items
  INSERT INTO menu_items (id, tenant_id, outlet_id, category_id, kitchen_station_id, code, name, description, base_price, tax_rate, service_charge_rate, item_type, is_available)
  VALUES
    (v_mnu_ribeye,   v_tenant_id, v_outlet_bistro, v_cat_mains,   v_sta_grill,  'MNU-RIBEYE',   'Prime Angus Ribeye 300g', 'Charbroiled Angus ribeye with truffle herb butter', 68.0000, 0.1200, 0.1000, 'food', true),
    (v_mnu_salad,    v_tenant_id, v_outlet_bistro, v_cat_starter, v_sta_cold,   'MNU-SALAD',    'Classic Caesar Salad', 'Crisp romaine, shaved parmesan, sourdough croutons', 18.0000, 0.1200, 0.1000, 'food', true),
    (v_mnu_espresso, v_tenant_id, v_outlet_bistro, v_cat_bev,     v_sta_bar,    'MNU-ESPRESSO', 'Artisan Double Espresso', 'Single-origin Ethiopian bean double shot', 6.0000, 0.1200, 0.1000, 'beverage', true),
    (v_mnu_wine_gls, v_tenant_id, v_outlet_bistro, v_cat_bev,     v_sta_bar,    'MNU-WINE-GLS', 'Reserve Cabernet Glass', 'Napa Valley vintage 2021', 19.0000, 0.1200, 0.1000, 'beverage', true),
    (v_mnu_water,    v_tenant_id, v_outlet_bistro, v_cat_bev,     v_sta_bar,    'MNU-WATER',    'Acqua Panna Still 750ml', 'Tuscan natural spring water', 7.5000, 0.1200, 0.1000, 'beverage', true)
  ON CONFLICT (tenant_id, outlet_id, code) DO NOTHING;

  -- 6. Recipes & Bill of Materials (BOM)
  -- Ribeye Steak: uses 0.350 KG of ITM-RIBEYE (yield 95%, waste 5%)
  INSERT INTO recipes (id, tenant_id, menu_item_id, yield_servings, notes)
  VALUES (v_rcp_ribeye, v_tenant_id, v_mnu_ribeye, 1.0000, 'Standard 300g trimmed raw ribeye cut')
  ON CONFLICT (tenant_id, menu_item_id) DO NOTHING;

  INSERT INTO recipe_lines (id, tenant_id, recipe_id, item_id, qty, yield_pct, waste_pct)
  VALUES ('d7000000-0000-0000-0000-000000000001', v_tenant_id, v_rcp_ribeye, v_itm_ribeye, 0.3500, 95.00, 5.00)
  ON CONFLICT DO NOTHING;

  -- Double Espresso: uses 0.020 KG of ITM-COFFEE
  INSERT INTO recipes (id, tenant_id, menu_item_id, yield_servings, notes)
  VALUES (v_rcp_espresso, v_tenant_id, v_mnu_espresso, 1.0000, 'Double shot espresso 20g dry grind')
  ON CONFLICT (tenant_id, menu_item_id) DO NOTHING;

  INSERT INTO recipe_lines (id, tenant_id, recipe_id, item_id, qty, yield_pct, waste_pct)
  VALUES ('d7000000-0000-0000-0000-000000000002', v_tenant_id, v_rcp_espresso, v_itm_coffee, 0.0200, 100.00, 0.00)
  ON CONFLICT DO NOTHING;

  -- Cabernet Glass: uses 0.150 L of ITM-WINE
  INSERT INTO recipes (id, tenant_id, menu_item_id, yield_servings, notes)
  VALUES (v_rcp_wine_gls, v_tenant_id, v_mnu_wine_gls, 1.0000, '150ml pour per glass')
  ON CONFLICT (tenant_id, menu_item_id) DO NOTHING;

  INSERT INTO recipe_lines (id, tenant_id, recipe_id, item_id, qty, yield_pct, waste_pct)
  VALUES ('d7000000-0000-0000-0000-000000000003', v_tenant_id, v_rcp_wine_gls, v_itm_wine, 0.1500, 100.00, 0.00)
  ON CONFLICT DO NOTHING;

  -- Mineral Water: uses 1.0 PCS of ITM-WATER
  INSERT INTO recipes (id, tenant_id, menu_item_id, yield_servings, notes)
  VALUES (v_rcp_water, v_tenant_id, v_mnu_water, 1.0000, 'Bottle served chilled')
  ON CONFLICT (tenant_id, menu_item_id) DO NOTHING;

  INSERT INTO recipe_lines (id, tenant_id, recipe_id, item_id, qty, yield_pct, waste_pct)
  VALUES ('d7000000-0000-0000-0000-000000000004', v_tenant_id, v_rcp_water, v_itm_water, 1.0000, 100.00, 0.00)
  ON CONFLICT DO NOTHING;

  -- 7. Automated Operational Posting Rules for F&B Revenue & COGS
  INSERT INTO posting_rules (id, tenant_id, branch_id, event_type, priority, auto_approve, match_conditions, rule_lines, description)
  VALUES
    (
      'ea000000-0000-0000-0000-000000000008',
      v_tenant_id,
      v_branch_id,
      'fnb.revenue',
      100,
      true,
      '{}'::jsonb,
      '[
        {"account_code": "1010", "side": "debit", "formula": "gross", "label": "Cash / Settlement Tender"},
        {"account_code": "4020", "side": "credit", "formula": "net", "label": "Food & Beverage Revenue"},
        {"account_code": "2210", "side": "credit", "formula": "tax", "label": "Sales & Occupancy Taxes Payable"}
      ]'::jsonb,
      'Restaurant POS Bill Revenue Recognition & Tax Settlement'
    ),
    (
      'ea000000-0000-0000-0000-000000000009',
      v_tenant_id,
      v_branch_id,
      'fnb.revenue_room_charge',
      100,
      true,
      '{}'::jsonb,
      '[
        {"account_code": "1110", "side": "debit", "formula": "gross", "label": "Guest Ledger (Folio Charge)"},
        {"account_code": "4020", "side": "credit", "formula": "net", "label": "Food & Beverage Revenue"},
        {"account_code": "2210", "side": "credit", "formula": "tax", "label": "Sales Taxes Payable"}
      ]'::jsonb,
      'Restaurant POS Bill Settled to In-House Guest Folio'
    ),
    (
      'ea000000-0000-0000-0000-000000000010',
      v_tenant_id,
      v_branch_id,
      'fnb.cogs',
      100,
      true,
      '{}'::jsonb,
      '[
        {"account_code": "5010", "side": "debit", "formula": "gross", "label": "Cost of Sales - Food & Beverage"},
        {"account_code": "1210", "side": "credit", "formula": "gross", "label": "Food & Beverage Inventory"}
      ]'::jsonb,
      'Recipe Explosion Stock Depletion to COGS'
    ),
    (
      'ea000000-0000-0000-0000-000000000011',
      v_tenant_id,
      v_branch_id,
      'pos.shift_variance',
      100,
      true,
      '{}'::jsonb,
      '[
        {"account_code": "6040", "side": "debit", "formula": "gross", "label": "Administrative - Cash Over/Short"},
        {"account_code": "1010", "side": "credit", "formula": "gross", "label": "Front Desk & POS Cash Float"}
      ]'::jsonb,
      'POS Shift Cash Drawer Discrepancy & Over/Short Reconciliation'
    )
  ON CONFLICT (id) DO UPDATE SET rule_lines = EXCLUDED.rule_lines, description = EXCLUDED.description;

END $$;
