-- 010_stock_ledger_fnb_types.sql: Allow fnb_pos and fnb_void document types in stock_ledger
ALTER TABLE stock_ledger DROP CONSTRAINT IF EXISTS stock_ledger_doc_type_check;
ALTER TABLE stock_ledger ADD CONSTRAINT stock_ledger_doc_type_check CHECK (
  doc_type IN (
    'grn', 'issue', 'transfer_out', 'transfer_in', 'adjustment',
    'waste', 'count_variance', 'minibar_depletion', 'fnb_pos', 'fnb_void'
  )
);
