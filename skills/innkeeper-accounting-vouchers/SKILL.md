---
name: innkeeper-accounting-vouchers
description: Double-entry accounting with vouchering for Innkeeper - chart of accounts, voucher types and lifecycle, gapless numbering, immutable gl_entries, balanced-posting triggers, fiscal period locks, auto-posting rules from folio/restaurant/inventory, reversals, sub-ledgers and financial reports. Use whenever money is posted, a voucher or journal is created, a report like trial balance or P&L is built, an operational module must create accounting entries, or someone asks about debits, credits, ledgers, periods, approvals or reconciliation.
---

# Accounting & Vouchering

## Invariants (enforce in the DB, mirror in the app)
1. Double entry: per voucher `SUM(debit) = SUM(credit)` (base currency) - checked by a **deferred constraint trigger** at COMMIT.
2. Posted ledger rows are **immutable** (`gl_entries` UPDATE/DELETE trigger raises). Correct with a **reversal voucher** (`reversal_of`) then a new voucher.
3. Posting is **atomic with its source document** (same transaction).
4. **Closed periods reject** postings; back-dating limited by role limit `backdate_days`.
5. Exact arithmetic: `numeric(19,4)`, rounding differences to a configured rounding account.
6. Reports derive from `gl_entries`; `gl_balances` is a rebuildable cache.

## Voucher lifecycle
`draft -> submitted -> approved -> posted`; `cancelled` only before posting. Draft has `draft_ref`; **gapless `voucher_no` is assigned at post** (row lock on numbering sequence per type/branch/fiscal year), so cancelled drafts leave no gaps. Segregation of duties: creator cannot approve (setting can disable).

Types (configurable names/prefixes): Journal JV, Receipt RV, Payment PV, Contra CV, Sales/Invoice SV, Purchase/Bill PB, Debit/Credit Note, Opening, Stock Journal, Auto-posting (system).

## Posting algorithm
```text
PostingService.post(event, payload)           // inside caller's transaction
  rule = highest-priority posting_rules match (tenant, branch, event_type, match jsonb)
  lines = build from rule.lines ('net','tax','gross','service' amounts) + rounding line
  validate accounts active & not group; party present for control accounts
  voucher = insert draft (source_type/source_id set)
  if rule.auto_approve || !type.requires_approval -> post(voucher) else leave 'submitted'
post(voucher):
  SELECT period FOR SHARE -> must be open
  numbering row FOR UPDATE -> voucher_no
  INSERT gl_entries (one per line) ; update gl_balances ; audit ; outbox 'voucher.posted'
```
Modes: `per_document` (every folio line/bill) or `daily_summary` (one voucher per business date per rule) - configurable to control volume.

## Posting rule examples (all editable)
| Event | Dr | Cr |
|---|---|---|
| Room charge (night audit) | Guest Ledger | Room Revenue, Tax/Service Payable |
| Deposit received | Cash/Bank | Customer Deposits |
| Checkout payment | Cash/Bank/Card clearing | Guest Ledger |
| Transfer to city ledger | City Ledger | Guest Ledger |
| F&B sale (room charge) | Guest Ledger | F&B Revenue, Tax/Service |
| F&B COGS | COGS-F&B | Inventory-Food |
| GRN | Inventory | GRNI |
| Supplier bill / payment | GRNI / Accounts Payable | Accounts Payable / Cash-Bank |
Rules reference **account codes via config**, never UUIDs or literals in code.

## Reversal
`POST /vouchers/:id/reverse` creates a new voucher with debit/credit swapped, links `reversal_of`/`reversed_by`, dated in an open period (setting: original date if open else first open day), same approval path. A reversed voucher cannot be reversed again.

## Multi-currency & branches
Line has `currency, txn_amount, fx_rate`; base amounts drive the ledger. FX revaluation creates unrealised gain/loss vouchers. Branch dimension on every entry; inter-branch transactions use Due-to/Due-from accounts, eliminated on consolidation.

## Sub-ledgers & reconciliation
Guest Ledger, City Ledger (AR by company), AP (by supplier), Inventory. Each control account must equal the sum of its sub-ledger; provide reconciliation views and block period close on differences (configurable).

## Period close
Checks: no draft/submitted vouchers in period, sub-ledgers reconcile, stock valuation = inventory account, night audit complete -> set `soft_closed` -> `closed`. Year-end: closing voucher (income/expense to retained earnings), carry-forward opening balances.

## Reports (all drill to voucher -> source document)
Trial balance, general ledger, account statement, day/cash/bank book, AR/AP ageing, P&L (incl. departmental: rooms, F&B), balance sheet, cash flow, tax reports.

## UI rules (voucher editor)
Keyboard grid; live balance bar (difference must be 0); Post disabled until balanced (server re-validates); read-only after posting with source links; reverse action; print template per type.

## Tests (must exist)
Unbalanced insert fails at commit. UPDATE/DELETE on ledger raises. Closed period rejects. Concurrent postings get distinct gapless numbers. Reversal nets to zero. Rule priority/match selection. Rounding line created. Rebuilding `gl_balances` equals cached values. Trial balance sums to zero.
