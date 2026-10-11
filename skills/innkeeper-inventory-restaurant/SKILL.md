---
name: innkeeper-inventory-restaurant
description: Inventory and restaurant/F&B rules for Innkeeper - append-only stock ledger, weighted average cost, GRN/issue/transfer/adjustment/stock count, recipes and BOM depletion, table board, orders and KOT, billing with splits, room-charge to folio, and the accounting entries they generate. Use when working on items, warehouses, purchasing, stock movements, valuation, menus, recipes, POS orders, kitchen tickets, bill settlement, food cost, or any stock/COGS posting.
---

# Inventory + Restaurant

## Inventory model
- `stock_ledger` = append-only truth: `qty_delta, unit_cost, value_delta, balance_qty, balance_value, valuation_rate, doc_type/doc_id`.
- `stock_balances(item, warehouse)` = locked cache. **Always** `SELECT ... FOR UPDATE` this row (create if missing with `ON CONFLICT DO NOTHING` then lock) before computing a movement; this serialises concurrent issues/receipts.
- Quantities `numeric(18,4)`, unit cost `numeric(19,6)`, value `numeric(19,4)`. UoM conversion happens at document entry; ledger is in base UoM.

## Weighted average cost (default)
```text
receipt:  new_rate = (old_value + in_qty*in_cost) / (old_qty + in_qty)
issue:    value_delta = -qty * current_rate  (rate unchanged); balance_value = old_value + value_delta
```
Example: 10 @ 5.00 then 10 @ 7.00 -> rate 6.00; issue 5 -> value -30.00.
Method is fixed per item category after the first movement; FIFO uses layer tables and must keep ledger value = sum(layers).
Negative stock: warehouse policy `block|warn|allow`; when allowed, cost uses last known rate and is flagged for revaluation.

## Documents and accounting
| Document | Stock effect | Voucher (via posting rules) |
|---|---|---|
| GRN | + at PO/invoice cost | Dr Inventory / Cr GRNI |
| Supplier bill | - | Dr GRNI / Cr AP (price variance to variance account) |
| Issue / requisition | - at WAC | Dr Dept expense / Cr Inventory |
| Transfer (same branch) | -/+ at WAC | none (or reclass by warehouse account) |
| Transfer (inter-branch) | in-transit warehouse | Dr/Cr Due-to/Due-from |
| Adjustment / waste / count variance | +/- at WAC | Dr/Cr Inventory adjustment expense (approval above threshold) |
Stock postings and their vouchers commit in the same transaction. Valuation report must equal the GL inventory account.

## Stock count
Create count sheet (snapshot qty, optionally blind) -> enter counts (mobile/barcode) -> variance computed against ledger as of count time -> approval -> adjustment document + voucher. Movements during the count are allowed; variance uses the snapshot rule configured.

## Restaurant model
Outlets -> tables (status tiles, same pattern as rooms) -> orders -> order_lines -> KOTs by station -> bills -> bill_payments. Menu items: variants, modifiers, courses, time-based prices, availability toggle (86). Recipes: `recipe_lines(item, qty, yield_pct, waste_pct)`; menu items without recipe cost = 0 and are flagged.

## Order flow (state machine)
`open -> fired -> served -> billed -> settled`; void allowed pre-settle with permission+reason; a void **after fire** emits a void KOT and (if depletion is on fire) a compensating stock movement.

## Settlement (atomic)
```text
BEGIN
  close bill, validate totals (discount limits, service charge, tax)
  payments: cash/card/QR/voucher OR room charge OR city ledger
    room charge -> validate in-house guest (room+name), insert folio_lines(source='restaurant_bill')
  depletion: explode recipes -> stock_ledger OUT at WAC  (mode: at fire | at settle, setting)
  PostingService: revenue voucher (+ tax/service) ; COGS voucher
  outbox 'fnb.bill_settled'
COMMIT   -- any failure rolls back everything
```
Idempotency key per settle request (double-tap safe). Splits: by item/seat/amount produce multiple bills each settled independently; totals must equal the original.

## Shift & cash
Open/close shift with float; cash drops; X/Z reports; variance posts Cash Over/Short voucher.

## Reports
Stock on hand, valuation, movement, usage vs theoretical (variance = actual - theoretical from sales x recipes), food cost %, sales mix, voids/discounts, menu engineering (popularity x margin).

## Tests
Concurrent issues of the last 5 units (no negative unless allowed). WAC example. Settlement rollback leaves no folio line/stock/voucher. Recipe explode with yield/waste. Void-after-fire reverses stock. Count variance voucher. Valuation equals GL.
