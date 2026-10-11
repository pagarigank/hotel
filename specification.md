# Innkeeper — Functional & Technical Specification

Version 1.0 · Companion to `architecture.md` (system design) and `frontend.md` (UI). Requirement IDs (`REQ-…`) are referenced from `todo.md`.

**Keywords:** MUST / SHOULD / MAY as in RFC 2119.

---

## 1. Scope

Innkeeper manages **hotels and rental properties** for many tenant companies and their branches:

1. **Properties & Rooms** — branches, buildings, floors, units (rooms, villas, apartments, halls), live status board.
2. **Reservations & Front Desk** — rates, availability, bookings, groups, check-in/out, folios, night audit.
3. **Housekeeping & Maintenance.**
4. **Restaurant / F&B** — outlets, tables, menus, orders/KOT, billing, room charge.
5. **Inventory** — items, warehouses, purchasing, stock movements, stock counts, recipe costing.
6. **Accounting with vouchering** — chart of accounts, vouchers (journal/receipt/payment/…), approvals, periods, ledgers, financial statements.
7. **Platform** — tenants, branches, users/roles, configuration, audit, billing/subscription.

### 1.1 Personas

| Persona | Primary needs |
|---|---|
| Platform admin | Create tenants, plans, support, usage |
| Tenant owner / GM | Multi-branch KPIs, configuration, approvals |
| Front desk agent | Board, check-in/out, reservations, folio charges |
| Reservations manager | Rates, restrictions, groups, channels |
| Housekeeping supervisor / attendant | Room status, tasks (mobile-first) |
| F&B cashier / waiter / chef | Tables, orders, KOT, bill, recipes |
| Storekeeper / purchasing | GRN, issues, counts, POs |
| Accountant / finance manager | Vouchers, approvals, periods, reports |
| Auditor (read-only) | Ledgers, audit trail, exports |

---

## 2. Terminology

| Term | Meaning |
|---|---|
| Tenant | Customer company; isolation boundary |
| Branch | A property location (hotel/resort/venue) belonging to one tenant |
| Unit | Any bookable physical thing: room, villa, apartment, hall |
| Unit type | Room category (e.g. Deluxe King); carries capacity, base rate, amenities |
| Business date | Branch accounting date; advanced only by night audit |
| Stay | Checked-in occupancy of a reservation line |
| Folio | Account of charges and payments for a stay, group master, or city-ledger company |
| Voucher | Accounting document with ≥ 2 balanced lines; posts to the ledger |
| GL entry | Immutable ledger row created when a voucher is posted |
| WAC | Weighted average cost |

---

## 3. Platform & Multi-Tenancy Requirements

| ID | Requirement |
|---|---|
| REQ-PLT-001 | The system MUST isolate tenant data in the database with RLS (`ENABLE`+`FORCE`, `USING`+`WITH CHECK`) in addition to application filtering. |
| REQ-PLT-002 | A user identity MAY belong to many tenants via `memberships`; each membership has role(s) and a branch scope. |
| REQ-PLT-003 | Users MUST switch **active branch** (or "All permitted branches") from the top bar; the choice scopes lists, board, reports and new-document defaults. |
| REQ-PLT-004 | Tenants MUST be provisioned by self-service signup or platform admin with a **template** (hotel, resort, apartment-rental, restaurant+hotel) that seeds CoA, voucher types, statuses, charge codes, menus, roles. |
| REQ-PLT-005 | Subscription plans MUST gate modules (feature flags) and limits (branches, units, users). |
| REQ-PLT-006 | Every mutating action on financial, security or configuration data MUST be written to the audit log. |
| REQ-PLT-007 | Tenant data export (CSV/JSON + attachments) and deletion workflow MUST exist. |
| REQ-PLT-008 | The system MUST support per-branch timezone, base currency, language, date/number formats. |

### 3.1 Roles and permission model
- Permission string: `<module>.<resource>.<action>` e.g. `reservation.booking.create`, `folio.charge.post`, `folio.charge.void`, `voucher.journal.approve`, `period.close`, `config.status.edit`.
- Role = named set of permissions + **limits** (`max_discount_pct`, `max_void_amount`, `backdate_days`, `can_override_rate`).
- Assignment: `membership_roles(membership_id, role_id, branch_scope uuid[] | 'ALL')`.
- Default role templates (editable): Owner, GM, Front Desk, Reservations, Housekeeping, Waiter, Cashier, Chef, Storekeeper, Accountant, Auditor.
- Segregation of duties: a user MUST NOT approve a voucher they created unless the tenant disables the rule.

---

## 4. Configuration Engine ("everything is configurable")

| ID | Configurable item | Scope(s) |
|---|---|---|
| REQ-CFG-001 | **Settings** (typed key/value: policies, toggles, thresholds) | system → tenant → branch → outlet/unit → user |
| REQ-CFG-002 | **Property/unit types** and attributes, amenities, floors, zones | tenant/branch |
| REQ-CFG-003 | **Unit status definitions** (code, label, colour token, icon, flags, allowed transitions) | tenant (branch override) |
| REQ-CFG-004 | **Action definitions** (the transactional buttons shown from a tile/page): label, icon, permission, visible-when conditions, target (modal/page/wizard key), order, role visibility | tenant/branch |
| REQ-CFG-005 | **Custom fields** on guests, reservations, units, items, vouchers, suppliers (text, number, date, select, multi, bool, file; required; show on list/print) stored in `attrs jsonb` | tenant |
| REQ-CFG-006 | **Rate plans**, seasons, restrictions, packages, extras, cancellation/deposit/no-show policies | branch |
| REQ-CFG-007 | **Charge codes** and groups (room, F&B, laundry, telephone, misc, tax) with tax rules and GL mapping | tenant/branch |
| REQ-CFG-008 | **Taxes & service charges** (rate, inclusive/exclusive, compound, applicability) | tenant/branch |
| REQ-CFG-009 | **Voucher types**, prefixes, numbering reset (yearly/monthly/never), approval workflow, print template | tenant/branch |
| REQ-CFG-010 | **Posting rules** mapping business events to debit/credit accounts | tenant/branch |
| REQ-CFG-011 | **Chart of accounts**, cost centres, dimensions, fiscal calendar | tenant |
| REQ-CFG-012 | **Numbering sequences** for reservations, folios, invoices, KOT, GRN, PO, etc. | branch |
| REQ-CFG-013 | **Housekeeping** task templates, checklists, cleaning durations, status flow | branch |
| REQ-CFG-014 | **Restaurant**: outlets, table layouts, menus, modifiers, courses, service charge, KOT routing/printers | outlet |
| REQ-CFG-015 | **Inventory**: UoMs, conversions, categories, valuation method, negative-stock policy, reorder rules | tenant/branch |
| REQ-CFG-016 | **Notifications/templates** (email/SMS/WhatsApp, confirmation, folio, invoice) | tenant |
| REQ-CFG-017 | **Navigation/menus** visible per role; dashboard widgets per role | tenant |
| REQ-CFG-018 | **Branding**: logo, brand colour (light palette only, validated for contrast), invoice header/footer | tenant/branch |

**Rules**
- Settings resolve most-specific-first; every setting has a JSON-Schema-typed definition, default and description in a code-owned **registry**; unknown keys are rejected.
- Config changes are versioned (who/when/diff), take effect immediately via `config.changed` cache invalidation, and MUST NOT break historical documents (documents snapshot the values they depended on: tax %, policy text, charge code label).
- System-owned flags on status definitions (below) are fixed so business logic stays reliable while labels/colours/extra statuses are tenant-defined.

### 4.1 Status definitions (drives board colours and logic)

```sql
CREATE TABLE status_defs (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL, branch_id uuid,
  entity text NOT NULL,                 -- 'unit' | 'reservation' | 'table' | 'hk_task' | ...
  code text NOT NULL, label text NOT NULL,
  color_token text NOT NULL,            -- design token, e.g. 'status-vacant-clean'
  icon text, sort int DEFAULT 0,
  is_sellable boolean DEFAULT false,    -- counts as available inventory
  is_occupied boolean DEFAULT false,
  is_dirty boolean DEFAULT false,
  blocks_booking boolean DEFAULT false, -- OOO/OOS
  system_key text,                      -- binds to engine behaviour, nullable for custom
  UNIQUE (tenant_id, branch_id, entity, code)
);
```

Default unit statuses (editable labels/colours): `vacant_clean`, `vacant_dirty`, `inspected`, `occupied`, `due_out`, `due_in` (derived), `reserved`, `out_of_order`, `out_of_service`, `blocked`, plus tenant-defined.

### 4.2 Action definitions (tile/page buttons)

```sql
CREATE TABLE action_defs (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL, branch_id uuid,
  entity text NOT NULL,                 -- 'unit' | 'reservation' | 'folio' | 'table' | 'page:board' ...
  code text NOT NULL,                   -- 'check_in', 'post_charge', 'new_reservation' ...
  label text NOT NULL, icon text, sort int DEFAULT 0,
  group_code text,                      -- menu grouping/divider
  permission text NOT NULL,
  visible_when jsonb NOT NULL DEFAULT '{}',   -- {"status_in":["due_in","vacant_clean"],"has_reservation_today":true}
  target jsonb NOT NULL,                -- {"type":"wizard","key":"check-in"} | {"type":"route","to":"/folio/:id"}
  enabled boolean DEFAULT true,
  UNIQUE (tenant_id, branch_id, entity, code)
);
```

`GET /ui/actions?entity=unit&id=<uuid>` evaluates `visible_when` + user permissions + module flags server-side and returns the ordered, ready-to-render action list. The client NEVER decides authorisation.

---

## 5. Properties & Rooms

| ID | Requirement |
|---|---|
| REQ-PRP-001 | Branch hierarchy: Branch → Building → Floor → Unit; units may be grouped (suite = connecting rooms, villa with sub-units). |
| REQ-PRP-002 | Unit kinds: `room`, `villa`, `apartment`, `hall`, `bed` (dorm), `other` — extensible via lookup. |
| REQ-PRP-003 | Unit type defines capacity (adults/children/extra beds), amenities, base rate, photos, size, view, bed config. |
| REQ-PRP-004 | Each unit has one **operational status** (status_defs) plus derived flags: due-in, due-out, stay-over, VIP, DND, has-alert. |
| REQ-PRP-005 | Status transitions MUST follow configured allowed transitions and be logged (who/when/why) in `unit_status_log`. |
| REQ-PRP-006 | Out-of-order/out-of-service blocks MUST take units out of inventory for a date range with reason and auto-return. |
| REQ-PRP-007 | Bulk operations: change status for selection, create units by pattern (floor 3, 301–320), copy type settings. |
| REQ-PRP-008 | Long-stay/monthly rental properties MUST be supported (recurring rent billing via rate plan `billing_cycle`). |

### 5.1 Core tables

```sql
CREATE TABLE branches (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants,
  code text NOT NULL, name text NOT NULL, timezone text NOT NULL,
  base_currency char(3) NOT NULL, business_date date NOT NULL,
  address jsonb, attrs jsonb DEFAULT '{}', active boolean DEFAULT true,
  UNIQUE (tenant_id, code)
);

CREATE TABLE unit_types (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL, branch_id uuid NOT NULL REFERENCES branches,
  code text NOT NULL, name text NOT NULL, kind text NOT NULL DEFAULT 'room',
  max_adults int NOT NULL, max_children int DEFAULT 0, max_occupancy int NOT NULL,
  base_rate numeric(19,4), sort int DEFAULT 0, attrs jsonb DEFAULT '{}',
  UNIQUE (branch_id, code)
);

CREATE TABLE units (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL, branch_id uuid NOT NULL REFERENCES branches,
  unit_type_id uuid NOT NULL REFERENCES unit_types,
  building text, floor text, number text NOT NULL, name text,
  status_code text NOT NULL, status_changed_at timestamptz DEFAULT now(),
  is_sellable boolean DEFAULT true, attrs jsonb DEFAULT '{}',
  version int DEFAULT 1, deleted_at timestamptz,
  UNIQUE (branch_id, number)
);
CREATE INDEX units_board_idx ON units (tenant_id, branch_id, floor, number) WHERE deleted_at IS NULL;
```

---

## 6. Reservations & Front Desk

### 6.1 Requirements

| ID | Requirement |
|---|---|
| REQ-RSV-001 | Search availability by branch, dates, occupancy, unit type, rate plan, with price breakdown per night. |
| REQ-RSV-002 | Create reservation with ≥1 stay lines (unit type or specific unit, dates, guests, rate plan), guest(s), company/agent, source/channel, notes, custom fields. |
| REQ-RSV-003 | The system MUST NOT allow two active stays on the same unit with overlapping `[check_in, check_out)`; enforced by DB exclusion constraint. |
| REQ-RSV-004 | Unassigned bookings MUST respect `room_type_inventory` capacity (+ configurable overbooking allowance per type/date). |
| REQ-RSV-005 | Reservation statuses: `hold → confirmed → in_house → checked_out`; terminal alternatives `cancelled`, `no_show`. Holds expire automatically. |
| REQ-RSV-006 | Modify (dates, type, unit, guests, rate) with re-pricing preview and audit; room move during stay with rate-change option. |
| REQ-RSV-007 | Rate plans: BAR, corporate, package, member, long-stay, seasonal; restrictions: min/max LOS, CTA, CTD, stop-sell, advance-purchase, day-of-week. |
| REQ-RSV-008 | Policies: deposit (amount/%/nights, due date), cancellation windows and fees, no-show fee — all configurable per rate plan and snapshotted on the reservation. |
| REQ-RSV-009 | Group/block bookings with rooming list, master folio, cut-off date, pick-up tracking, release. |
| REQ-RSV-010 | Waitlist and quotation (non-binding) with convert-to-booking. |
| REQ-RSV-011 | Check-in: ID capture, registration card, payment method/token, unit assignment, key issue event; requires unit status per policy (e.g. `vacant_clean`/`inspected`). Early check-in rules configurable. |
| REQ-RSV-012 | Check-out: folio review, split bills, settle by payments / city ledger, invoice generation, late-checkout fee, unit → dirty + HK task. |
| REQ-RSV-013 | **Night audit** per branch (§6.4). |
| REQ-RSV-014 | Walk-in quick booking (≤ 3 clicks from a vacant tile). |
| REQ-RSV-015 | Public booking-engine API and OTA inbound reservations (adapter) MUST use the same availability rules. |

### 6.2 Core tables

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE reservations (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL, branch_id uuid NOT NULL,
  reservation_no text NOT NULL,
  status text NOT NULL CHECK (status IN ('hold','confirmed','in_house','checked_out','cancelled','no_show')),
  guest_id uuid NOT NULL REFERENCES guests, company_id uuid, source text, channel_ref text,
  hold_expires_at timestamptz, policy_snapshot jsonb NOT NULL,
  notes text, attrs jsonb DEFAULT '{}', version int DEFAULT 1,
  created_at timestamptz DEFAULT now(), created_by uuid,
  UNIQUE (branch_id, reservation_no)
);

CREATE TABLE reservation_units (               -- stay lines
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL, branch_id uuid NOT NULL,
  reservation_id uuid NOT NULL REFERENCES reservations,
  unit_type_id uuid NOT NULL, unit_id uuid REFERENCES units,   -- NULL until assigned
  rate_plan_id uuid NOT NULL,
  check_in date NOT NULL, check_out date NOT NULL CHECK (check_out > check_in),
  adults int NOT NULL, children int DEFAULT 0,
  status text NOT NULL,                        -- mirrors reservation active-ness
  CONSTRAINT no_double_booking EXCLUDE USING gist (
    unit_id WITH =, daterange(check_in, check_out, '[)') WITH &&
  ) WHERE (unit_id IS NOT NULL AND status IN ('hold','confirmed','in_house'))
);

CREATE TABLE room_type_inventory (
  tenant_id uuid NOT NULL, branch_id uuid NOT NULL, unit_type_id uuid NOT NULL, stay_date date NOT NULL,
  capacity int NOT NULL, sold int NOT NULL DEFAULT 0, overbook_allowance int NOT NULL DEFAULT 0,
  stop_sell boolean DEFAULT false,
  PRIMARY KEY (branch_id, unit_type_id, stay_date),
  CHECK (sold >= 0 AND sold <= capacity + overbook_allowance)
);

CREATE TABLE reservation_nights (               -- priced nights (snapshot)
  reservation_unit_id uuid NOT NULL, stay_date date NOT NULL,
  rate numeric(19,4) NOT NULL, tax_snapshot jsonb, PRIMARY KEY (reservation_unit_id, stay_date)
);
```

### 6.3 Booking algorithm (normative)
1. Resolve rate plan + restrictions for each night; reject on violation with `RESTRICTION_VIOLATED`.
2. In one transaction: `UPDATE room_type_inventory SET sold = sold + :n WHERE … AND stay_date IN range AND NOT stop_sell` → expect row count = nights (else `NO_INVENTORY`).
3. If a specific unit is requested/assigned, insert `reservation_units` — a `23P01` exclusion violation → `409 ROOM_NOT_AVAILABLE`.
4. Insert reservation, nights, deposit schedule, outbox event.
5. Cancel/no-show/modify: reverse the inventory counters in the same transaction.
6. Endpoint requires `Idempotency-Key`.

### 6.4 Night audit (REQ-RSV-013)
Steps (each checkpointed, resumable, idempotent): (1) pre-audit checks: arrivals not checked-in (mark no-show per policy), departures not checked-out, open POS bills; (2) post room charge + tax (+ service charge) per in-house stay; (3) post no-show & cancellation fees; (4) post recurring rent; (5) roll `branch.business_date`; (6) generate accounting vouchers per posting rules; (7) snapshot KPIs (occupancy, ADR, RevPAR); (8) produce audit report pack. Failure leaves business date unchanged and raises an alert.

### 6.5 Folio

```sql
CREATE TABLE folios (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL, branch_id uuid NOT NULL,
  folio_no text NOT NULL, kind text NOT NULL CHECK (kind IN ('guest','master','city_ledger','incidental')),
  reservation_id uuid, company_id uuid, status text NOT NULL CHECK (status IN ('open','settled','closed')),
  currency char(3) NOT NULL, UNIQUE (branch_id, folio_no)
);

CREATE TABLE folio_lines (                       -- append-only
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL, branch_id uuid NOT NULL,
  folio_id uuid NOT NULL REFERENCES folios, window_no int DEFAULT 1,   -- split billing windows
  business_date date NOT NULL, line_type text NOT NULL CHECK (line_type IN ('charge','payment','adjustment','transfer')),
  charge_code_id uuid, description text NOT NULL,
  qty numeric(12,3) DEFAULT 1, unit_amount numeric(19,4) NOT NULL,
  amount numeric(19,4) NOT NULL,                -- signed: charges +, payments −
  tax_amount numeric(19,4) DEFAULT 0, tax_snapshot jsonb,
  source_type text, source_id uuid,             -- 'restaurant_bill', 'night_audit', 'manual'
  reverses_line_id uuid REFERENCES folio_lines, voucher_id uuid,
  created_at timestamptz DEFAULT now(), created_by uuid
);
```
Rules: no UPDATE/DELETE (trigger); corrections via reversing line (requires `folio.charge.void` + reason); transfers create a pair of lines; closed folios reject new lines; checkout with balance ≠ 0 requires payment or city-ledger transfer.

### 6.6 Housekeeping & maintenance
- Tasks generated from status events (check-out → clean, stay-over service, inspection), assignable, with checklist, timer, photo, supply consumption (→ inventory issue).
- Attendant mobile view: my rooms, start/finish, report issue → maintenance order, lost & found.
- Maintenance orders can block a unit (OOO/OOS) with date range.

---

## 7. Restaurant / F&B

| ID | Requirement |
|---|---|
| REQ-FNB-001 | Multiple outlets per branch (restaurant, bar, room service, banquet) each with tables/layout, menus, hours, tax/service charge setup. |
| REQ-FNB-002 | Menu: categories, items, variants/sizes, modifiers, combos, time-based pricing (happy hour), availability toggle (86'd), course assignment, kitchen station routing. |
| REQ-FNB-003 | Table board uses the same tile pattern as rooms (status: free, seated, ordered, served, bill-printed, dirty, reserved). |
| REQ-FNB-004 | Orders: open/hold, add/void items (permission + reason), course firing, notes, seat/guest count, transfer/merge/split table and bill. |
| REQ-FNB-005 | KOT/KDS: tickets per station with timers, bump, reprint; void after fire creates a **void KOT**. |
| REQ-FNB-006 | Billing: discounts (limits), service charge, taxes, tips, split by item/seat/amount, multiple tenders (cash, card, QR, **room charge**, city ledger, voucher/coupon). |
| REQ-FNB-007 | Room charge MUST validate in-house guest (room + name) and post a folio line on settle. |
| REQ-FNB-008 | Recipes (BOM): each menu item links to a recipe (ingredients, qty, yield/waste %) used for theoretical cost and stock depletion. |
| REQ-FNB-009 | Depletion mode configurable: at KOT fire or at bill settle; voids/waste handled symmetrically. |
| REQ-FNB-010 | Shift/cash management: open/close shift, cash drop, X/Z reports, variance posting to voucher. |
| REQ-FNB-011 | Reports: sales by item/category/hour/waiter, void & discount audit, food cost % (theoretical vs actual), menu engineering. |
| REQ-FNB-012 | Offline tolerance (SHOULD): order entry queues locally for short outages and syncs idempotently. |

Key tables: `outlets, tables, menu_categories, menu_items, menu_item_prices, modifier_groups, modifiers, orders, order_lines, kots, kot_lines, bills, bill_lines, bill_payments, shifts, recipes, recipe_lines`.

---

## 8. Inventory

| ID | Requirement |
|---|---|
| REQ-INV-001 | Item master: code, name, category, base UoM, purchase/issue UoMs with conversions, tracking (none/batch/serial/expiry), reorder level/qty, preferred supplier, GL accounts (inventory, COGS, adjustment), custom fields. |
| REQ-INV-002 | Warehouses/locations per branch (main store, kitchen, bar, housekeeping, minibar); inter-location transfers; inter-branch transfers via in-transit. |
| REQ-INV-003 | Documents: Purchase Request → Purchase Order → **GRN** (goods receipt) → Supplier invoice (AP voucher); Issue/Requisition; Transfer; Adjustment; Waste/Spoilage; Stock Count (cycle & full). |
| REQ-INV-004 | Every stock change MUST create `stock_ledger` rows (append-only) with qty delta, unit cost, value delta, running qty/value, valuation rate. |
| REQ-INV-005 | Valuation: **WAC by default** (`new_rate = (old_value + in_value) / (old_qty + in_qty)`); FIFO layers optional per category; method fixed after first movement. |
| REQ-INV-006 | Negative stock policy configurable per warehouse (block / warn / allow). |
| REQ-INV-007 | Concurrent movements for the same item+warehouse MUST be serialised via row lock on `stock_balances`. |
| REQ-INV-008 | Stock count: freeze/snapshot, count entry (mobile/barcode), variance → adjustment document with approval → voucher. |
| REQ-INV-009 | Reorder alerts and suggested PO; expiry alerts. |
| REQ-INV-010 | Reports: stock on hand, valuation (reconciles to GL inventory account), movement/ledger, ageing, usage vs theoretical, supplier price history. |

```sql
CREATE TABLE stock_ledger (                      -- append-only
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL, branch_id uuid NOT NULL,
  item_id uuid NOT NULL, warehouse_id uuid NOT NULL, posting_date date NOT NULL, posted_at timestamptz DEFAULT now(),
  doc_type text NOT NULL, doc_id uuid NOT NULL, doc_line_id uuid,
  qty_delta numeric(18,4) NOT NULL, unit_cost numeric(19,6) NOT NULL, value_delta numeric(19,4) NOT NULL,
  balance_qty numeric(18,4) NOT NULL, balance_value numeric(19,4) NOT NULL, valuation_rate numeric(19,6) NOT NULL,
  batch_no text, serial_no text, voucher_id uuid
);
CREATE TABLE stock_balances (
  tenant_id uuid NOT NULL, item_id uuid NOT NULL, warehouse_id uuid NOT NULL,
  qty numeric(18,4) NOT NULL DEFAULT 0, value numeric(19,4) NOT NULL DEFAULT 0,
  valuation_rate numeric(19,6) NOT NULL DEFAULT 0, PRIMARY KEY (item_id, warehouse_id)
);
```

---

## 9. Accounting with Vouchering

### 9.1 Requirements

| ID | Requirement |
|---|---|
| REQ-ACC-001 | Double-entry only; a voucher MUST have ≥ 2 lines and Σdebit = Σcredit (in base currency) before posting. |
| REQ-ACC-002 | **Chart of accounts**: hierarchical, typed (asset, liability, equity, income, expense), control-account flag, currency, branch-restrictable; seed templates (hotel, restaurant, rental). |
| REQ-ACC-003 | **Voucher types** (configurable names/prefixes): Journal (JV), Receipt (RV), Payment (PV), Contra (CV), Sales/Invoice (SV), Purchase/Bill (PB), Debit Note, Credit Note, Opening Balance, Stock Journal, Auto-posting (system). |
| REQ-ACC-004 | Voucher lifecycle: `draft → submitted → approved → posted`; `cancelled` only for non-posted; posted vouchers are corrected by **reversal voucher** (`reversal_of`). |
| REQ-ACC-005 | Approval workflow configurable per voucher type/amount/branch (e.g. PV > X needs Finance Manager); segregation of duties. |
| REQ-ACC-006 | **Gapless numbering** per (voucher type, branch, fiscal year) assigned at posting under row lock; drafts carry a temporary reference. |
| REQ-ACC-007 | Posting writes **immutable `gl_entries`**; UPDATE/DELETE blocked by trigger. |
| REQ-ACC-008 | Fiscal years and periods (open/soft-closed/closed); posting into a closed period is rejected; back-dating limited by role limit. |
| REQ-ACC-009 | Each line supports: account, debit/credit, party (guest/company/supplier), cost centre, dimensions (department, outlet, project), narration, tax code, currency + FX rate. |
| REQ-ACC-010 | Multi-currency: transaction amount, rate, base amount; realised/unrealised FX gain-loss vouchers. |
| REQ-ACC-011 | **Auto-posting** from operational modules through configurable `posting_rules` (see §9.3) inside the same DB transaction as the source document. |
| REQ-ACC-012 | Attachments (receipts, invoices) on vouchers; print/PDF templates per type. |
| REQ-ACC-013 | Sub-ledgers: Guest ledger & City ledger (AR), Accounts payable, Cash/Bank, Inventory; reconciliation views to control accounts. |
| REQ-ACC-014 | Bank reconciliation (import statements, match, create adjustment vouchers). |
| REQ-ACC-015 | Reports: Trial balance, General ledger, Account statement, Day book, Cash book, Bank book, AR/AP ageing, P&L, Balance sheet, Cash flow, Departmental P&L (rooms, F&B), Tax reports; all drillable to voucher → source document. |
| REQ-ACC-016 | Year-end closing generates closing entry to retained earnings; opening balances carried forward. |
| REQ-ACC-017 | Recurring vouchers (rent, depreciation placeholders) and voucher templates. |
| REQ-ACC-018 | Branch-level and consolidated reporting; inter-branch due-to/due-from. |

### 9.2 Core tables

```sql
CREATE TABLE coa_accounts (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL, code text NOT NULL, name text NOT NULL,
  parent_id uuid REFERENCES coa_accounts, type text NOT NULL CHECK (type IN ('asset','liability','equity','income','expense')),
  normal_side char(1) NOT NULL CHECK (normal_side IN ('D','C')),
  is_group boolean DEFAULT false, is_control boolean DEFAULT false, party_type text,
  currency char(3), allowed_branch_ids uuid[], active boolean DEFAULT true,
  UNIQUE (tenant_id, code)
);

CREATE TABLE fiscal_periods (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL, fiscal_year int NOT NULL, period_no int NOT NULL,
  start_date date NOT NULL, end_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('open','soft_closed','closed')),
  UNIQUE (tenant_id, fiscal_year, period_no)
);

CREATE TABLE voucher_types (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL, code text NOT NULL, name text NOT NULL,
  prefix text NOT NULL, reset_policy text NOT NULL DEFAULT 'yearly',
  requires_approval boolean DEFAULT false, approval_rules jsonb DEFAULT '[]',
  is_system boolean DEFAULT false, print_template text, UNIQUE (tenant_id, code)
);

CREATE TABLE vouchers (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL, branch_id uuid NOT NULL,
  voucher_type_id uuid NOT NULL REFERENCES voucher_types,
  voucher_no text,                               -- assigned at post
  draft_ref text NOT NULL, voucher_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('draft','submitted','approved','posted','cancelled')),
  currency char(3) NOT NULL, fx_rate numeric(18,8) NOT NULL DEFAULT 1,
  narration text, source_type text, source_id uuid,    -- link to folio/bill/GRN…
  reversal_of uuid REFERENCES vouchers, reversed_by uuid REFERENCES vouchers,
  total_debit numeric(19,4) NOT NULL DEFAULT 0, total_credit numeric(19,4) NOT NULL DEFAULT 0,
  attrs jsonb DEFAULT '{}', version int DEFAULT 1,
  created_by uuid NOT NULL, approved_by uuid, posted_by uuid, posted_at timestamptz,
  UNIQUE (tenant_id, branch_id, voucher_type_id, voucher_no)
);

CREATE TABLE voucher_lines (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL, voucher_id uuid NOT NULL REFERENCES vouchers ON DELETE CASCADE,
  line_no int NOT NULL, account_id uuid NOT NULL REFERENCES coa_accounts,
  debit numeric(19,4) NOT NULL DEFAULT 0 CHECK (debit >= 0), credit numeric(19,4) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  CHECK ((debit = 0) <> (credit = 0)),
  party_type text, party_id uuid, cost_center_id uuid, dimensions jsonb DEFAULT '{}', tax_code text, narration text
);

CREATE TABLE gl_entries (                        -- append-only ledger
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL, branch_id uuid NOT NULL,
  voucher_id uuid NOT NULL, voucher_line_id uuid NOT NULL, voucher_no text NOT NULL,
  posting_date date NOT NULL, fiscal_period_id uuid NOT NULL,
  account_id uuid NOT NULL, debit numeric(19,4) NOT NULL, credit numeric(19,4) NOT NULL,
  party_type text, party_id uuid, cost_center_id uuid, dimensions jsonb, currency char(3), txn_amount numeric(19,4),
  posted_at timestamptz DEFAULT now()
);
CREATE INDEX gl_acct_date ON gl_entries (tenant_id, account_id, posting_date);
```

**Invariant triggers (DB, not just app):**
```sql
-- 1. Immutable ledger
CREATE FUNCTION forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS
$$ BEGIN RAISE EXCEPTION 'append-only table %', TG_TABLE_NAME; END $$;
CREATE TRIGGER gl_immutable BEFORE UPDATE OR DELETE ON gl_entries
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- 2. Balanced at COMMIT (deferred constraint trigger)
CREATE FUNCTION assert_voucher_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d numeric; c numeric; BEGIN
  SELECT coalesce(sum(debit),0), coalesce(sum(credit),0) INTO d, c
    FROM gl_entries WHERE voucher_id = NEW.voucher_id;
  IF d <> c THEN RAISE EXCEPTION 'VOUCHER_UNBALANCED % vs %', d, c; END IF; RETURN NULL; END $$;
CREATE CONSTRAINT TRIGGER gl_balanced AFTER INSERT ON gl_entries
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_voucher_balanced();

-- 3. Period lock: BEFORE INSERT ON gl_entries → reject if fiscal_periods.status = 'closed'
```

### 9.3 Posting rules (configurable)

```sql
CREATE TABLE posting_rules (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL, branch_id uuid,
  event_type text NOT NULL,       -- 'folio.charge','folio.payment','fnb.sale','fnb.cogs','stock.grn','stock.issue',...
  match jsonb NOT NULL DEFAULT '{}',   -- {"charge_group":"room"} | {"payment_method":"cash"}
  voucher_type_code text NOT NULL, mode text NOT NULL DEFAULT 'per_document',  -- or 'daily_summary'
  lines jsonb NOT NULL,           -- [{"side":"D","account":"1200-GUEST-LEDGER"},{"side":"C","account":"4100-ROOM-REV","amount":"net"},{"side":"C","account":"2300-VAT-OUT","amount":"tax"}]
  priority int DEFAULT 100, enabled boolean DEFAULT true
);
```

Default hotel mappings (templates; all editable):

| Event | Debit | Credit |
|---|---|---|
| Room charge (night audit) | Guest Ledger (AR-guest) | Room Revenue; Tax/Service payable |
| Advance deposit received | Cash/Bank | Customer Deposits (liability) |
| Deposit applied at checkout | Customer Deposits | Guest Ledger |
| Guest payment at checkout | Cash/Bank/Card clearing | Guest Ledger |
| Transfer to city ledger | City Ledger (AR-corporate) | Guest Ledger |
| Restaurant sale (cash) | Cash/Card clearing | F&B Revenue; Tax/Service payable |
| Restaurant sale (room charge) | Guest Ledger | F&B Revenue; Tax/Service payable |
| Recipe depletion (COGS) | COGS – F&B | Inventory – Food |
| GRN received | Inventory | GRNI / Accounts Payable |
| Supplier bill | GRNI | Accounts Payable |
| Supplier payment (PV) | Accounts Payable | Cash/Bank |
| Stock issue to dept | Dept. Expense | Inventory |
| Stock adjustment (loss) | Inventory Adjustment Expense | Inventory |
| Cash variance (shift close) | Cash Over/Short | Cash |

### 9.4 Posting algorithm (normative)
1. Source document finalises inside the DB transaction.
2. `PostingService.post(event, payload)` selects the highest-priority matching rule for tenant/branch, builds voucher lines (rounding differences go to a configured rounding account), validates accounts are active/postable.
3. If the voucher type needs approval and the rule is not `auto_approve`, the voucher is left `submitted` (source marked "pending accounting").
4. `post()`: lock `fiscal_periods` row (`FOR SHARE`) → verify open → lock numbering sequence (`FOR UPDATE`) → assign `voucher_no` → insert `gl_entries` → update `gl_balances` → write audit + outbox `voucher.posted`.
5. Any failure rolls back the source document too.

---

## 10. API Surface (v1, illustrative)

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/mfa/verify`, `GET /me` |
| UI config | `GET /ui/navigation`, `GET /ui/actions?entity=&id=`, `GET /ui/status-defs`, `GET /ui/custom-fields?entity=` |
| Board | `GET /branches/:b/board?floor=&type=&status=` (units + status + current stay summary), `GET /events` (SSE) |
| Units | `GET/POST /units`, `PATCH /units/:id`, `POST /units/:id/status`, `POST /units/:id/blocks` |
| Availability | `GET /availability?branch&from&to&adults&children`, `GET /rates/quote` |
| Reservations | `POST /reservations`, `GET /reservations/:id`, `PATCH`, `POST /:id/confirm|cancel|no-show|assign-unit|move` |
| Stays | `POST /reservations/:id/check-in`, `POST /stays/:id/check-out`, `POST /stays/:id/room-move` |
| Folio | `GET /folios/:id`, `POST /folios/:id/lines`, `POST /folios/:id/lines/:l/void`, `POST /folios/:id/transfer`, `POST /folios/:id/settle` |
| Night audit | `POST /branches/:b/night-audit` (202), `GET /night-audits/:id` |
| Housekeeping | `GET /hk/tasks`, `POST /hk/tasks/:id/start|finish`, `POST /maintenance-orders` |
| Restaurant | `GET /outlets/:o/tables`, `POST /orders`, `POST /orders/:id/lines`, `POST /orders/:id/fire`, `POST /bills/:id/settle` |
| Inventory | `GET/POST /items`, `POST /grn`, `POST /stock/issue|transfer|adjust|waste`, `POST /stock-counts`, `GET /stock/ledger` |
| Accounting | `GET/POST /vouchers`, `POST /vouchers/:id/submit|approve|post|reverse`, `GET /coa`, `GET /periods`, `POST /periods/:id/close`, `GET /reports/trial-balance|gl|pnl|balance-sheet|ageing` |
| Config | `GET/PUT /settings/:key?scope=`, CRUD for status-defs, action-defs, custom-fields, charge-codes, taxes, rate-plans, voucher-types, posting-rules |
| Admin | `GET/POST /tenants`, `/branches`, `/users`, `/roles`, `/audit-log` |

Common rules: tenant from host/JWT; branch via `X-Branch-Id` header (validated against membership); `Idempotency-Key` required on `POST` that create money/inventory/booking effects; `If-Match` on `PATCH/PUT`.

Error codes (non-exhaustive): `ROOM_NOT_AVAILABLE`, `NO_INVENTORY`, `RESTRICTION_VIOLATED`, `STALE_VERSION`, `PERMISSION_DENIED`, `LIMIT_EXCEEDED`, `PERIOD_CLOSED`, `VOUCHER_UNBALANCED`, `ACCOUNT_NOT_POSTABLE`, `FOLIO_CLOSED`, `FOLIO_BALANCE_NOT_ZERO`, `NEGATIVE_STOCK`, `IDEMPOTENCY_CONFLICT`.

---

## 11. State Machines

**Reservation:** `hold → confirmed → in_house → checked_out`; `hold|confirmed → cancelled`; `confirmed → no_show`; `hold → expired(cancelled)`.
**Unit (default flow):** `vacant_dirty → (clean) vacant_clean → (inspect) inspected → reserved/due_in → occupied → due_out → vacant_dirty`; `any → out_of_order|out_of_service → vacant_dirty` (on release). Transitions are data (`status_transitions`).
**Voucher:** `draft → submitted → approved → posted`; `draft|submitted|approved → cancelled`; `posted → (reversed by new voucher)`.
**Order:** `open → fired → served → billed → settled`; `any pre-settled → void` (with permission).
**Night audit:** `pending → running(step n) → completed | failed(step n)` (resumable).

---

## 12. Reports & KPIs

- **Front office:** arrivals, departures, in-house, no-shows, occupancy %, ADR, RevPAR, pick-up, forecast, source/channel mix, room-status report, night-audit pack.
- **Housekeeping:** productivity, rooms/attendant/hour, inspection fails, OOO log.
- **F&B:** sales mix, voids/discounts, covers, average check, food cost % (theoretical vs actual).
- **Inventory:** valuation, movement, ageing, usage variance, reorder.
- **Accounting:** see REQ-ACC-015; all with branch and consolidated views, export to CSV/XLSX/PDF.
- **Management dashboard:** per-branch tiles + consolidated; configurable widgets per role.

Occupancy % = occupied unit-nights ÷ (sellable unit-nights − OOO nights); ADR = room revenue ÷ occupied; RevPAR = room revenue ÷ available unit-nights (formulas configurable for exclusions such as house-use/complimentary).

---

## 13. Non-Functional Requirements

| ID | Requirement |
|---|---|
| NFR-001 | p95 read < 300 ms, write < 600 ms at 100 concurrent users per tenant; board for 500 units renders < 1.5 s. |
| NFR-002 | 99.9 % availability; RPO ≤ 5 min; RTO ≤ 1 h. |
| NFR-003 | WCAG 2.2 AA; status never conveyed by colour alone. |
| NFR-004 | Browser support: last 2 versions of Chrome, Edge, Safari, Firefox; responsive from 360 px (housekeeping on phones, tablet for front desk/POS). |
| NFR-005 | Every list endpoint paginated; every report > 5 s runs async with notification. |
| NFR-006 | All money exact decimal; rounding rules configurable (per currency, per tax). |
| NFR-007 | Zero cross-tenant leakage verified by automated test on every migration. |
| NFR-008 | Audit log retention ≥ 7 years (configurable); financial records never hard-deleted. |
| NFR-009 | Localisation-ready (UTF-8, ICU, RTL-safe layout), multi-currency, tenant-defined date formats. |
| NFR-010 | Light theme only; brand colour must pass contrast checks (≥ 4.5:1 text). |

---

## 14. Acceptance Criteria (representative)

1. **Race:** 100 concurrent requests to book the last unit for overlapping dates → exactly one succeeds; others receive `409`; DB contains no overlapping active rows.
2. **Idempotency:** replaying the same `Idempotency-Key` returns the original reservation; no duplicate inventory decrement.
3. **Isolation:** with context `tenant=A`, `SELECT * FROM reservations WHERE tenant_id = B` returns 0 rows; inserting a row with `tenant_id = B` fails.
4. **Ledger:** inserting unbalanced `gl_entries` fails at COMMIT; UPDATE/DELETE on `gl_entries` raises; posting into a closed period raises `PERIOD_CLOSED`.
5. **Board → action:** clicking a `due_in` tile shows *Check-in* (only with `reservation.stay.check_in`); a `vacant_dirty` tile shows *Set clean* and not *Check-in*; a tenant-added custom action appears with no deployment.
6. **Folio → ledger:** posting a room charge via night audit creates one posted voucher that debits Guest Ledger and credits Room Revenue and Tax; Σ guest-ledger sub-ledger = control account.
7. **Restaurant:** settling a room-charge bill creates a folio line, depletes recipe ingredients at WAC, posts revenue and COGS vouchers atomically; failure of any step leaves no partial data.
8. **Inventory:** GRN of 10 @ 5.00 then 10 @ 7.00 gives valuation rate 6.00; issue of 5 reduces value by 30.00.
9. **Period close:** closing a period with unapproved vouchers is refused with a list of offending vouchers.
10. **Config:** changing a status colour or adding a custom status is visible on the board within seconds without reload (SSE `config.changed`).

---

## 15. Seed Data Templates

| Template | Contents |
|---|---|
| Hotel | CoA (rooms, F&B, laundry, taxes, guest/city ledger, deposits, inventory, COGS), voucher types, default statuses, charge groups, roles, HK checklist |
| Resort | Hotel + activities/spa charge groups, packages, multi-outlet F&B |
| Apartments/Rentals | Monthly billing, security deposit liability, utilities charge codes, maintenance-heavy flows |
| Restaurant add-on | Outlets, table layout, tax/service charge, base menu categories, COGS accounts |
