# Innkeeper — Architecture

> Multi-tenant, multi-branch SaaS for hotels and rental properties: reservations, front desk, housekeeping, restaurant, inventory and double-entry accounting with vouchering. Everything operational is **configurable per tenant and per branch**.

| Item            | Value                                                                    |
| --------------- | ------------------------------------------------------------------------ |
| Codename        | Innkeeper                                                                |
| Document status | v1.0 — baseline architecture                                             |
| Backend         | TypeScript · NestJS (modular monolith) · PostgreSQL 16+                  |
| Frontend        | React 19 · Vite · Bootstrap 5.3 (react-bootstrap) · **light theme only** |
| Companion docs  | `specification.md` · `frontend.md` · `todo.md` · `skills/`               |

---

## 1. Goals and Non-Goals

### Goals

1. **One platform, many customers (tenants)**, each with many branches (hotels, resorts, apartment blocks, villas, event venues).
2. **Never double-book.** Availability correctness is enforced by the database, not by application checks.
3. **Books that audit.** Every money movement ends in a balanced, immutable, vouchered ledger entry.
4. **Configuration over code.** Room statuses, rate plans, charge codes, taxes, voucher types, numbering, custom fields, menus/buttons and roles are data, not deployments.
5. **Operational UI built around the floor plan.** The home/content page shows every room and property as a status-coloured tile; the tile is the entry point to every transaction.
6. **Safe by default** tenant isolation (defence in depth: app + Postgres RLS).

### Non-goals (v1)

- Native mobile apps (responsive web/PWA first).
- Own-built channel manager (integrate via adapter; see §12).
- Payroll, fixed assets, full procurement approvals beyond PO/GRN.
- Database-per-tenant provisioning (supported later through the "bridge/silo" upgrade path, §3.4).

---

## 2. Architectural Style: Modular Monolith

Start as **one deployable** with strict internal module boundaries; extract services only when measured scaling, team, or security needs demand it. This avoids distributed-transaction cost while ledger, folio and stock posting still need ACID guarantees.

```
                    ┌──────────────────────────────────────────────┐
  Browser / PWA ───►│  CDN / WAF  →  Reverse proxy (TLS, rate limit)│
                    └───────────────┬──────────────────────────────┘
                                    │
                 ┌──────────────────▼───────────────────┐
                 │          API (NestJS monolith)        │
                 │  REST /api/v1 · SSE /events · OpenAPI │
                 │ ┌────────┬────────┬────────┬────────┐ │
                 │ │ Iam    │ Config │ Tenancy│ Audit  │ │  ← platform kernel
                 │ ├────────┴────────┴────────┴────────┤ │
                 │ │ Properties │ Reservations │ FrontDesk│ │  ← domain modules
                 │ │ Folio      │ Housekeeping │ Guests   │ │
                 │ │ Restaurant │ Inventory    │ Accounting│ │
                 │ │ Reporting  │ Integrations │ Billing  │ │
                 │ └──────────────────────────────────────┘ │
                 └───────┬──────────────┬─────────────┬─────┘
                         │              │             │
                 ┌───────▼──────┐ ┌─────▼──────┐ ┌────▼─────────┐
                 │ PgBouncer    │ │ Worker     │ │ Object store │
                 │ (txn mode)   │ │ (pg-boss)  │ │ (S3: docs,   │
                 └───────┬──────┘ │ outbox,    │ │  invoices)   │
                         │        │ night audit│ └──────────────┘
                 ┌───────▼──────┐ │ jobs, mail │
                 │ PostgreSQL   │◄┴────────────┘
                 │ primary + RR │
                 └──────────────┘
```

### 2.1 Module map and ownership

| Module           | Owns (tables prefix)                                                                                                                                                                                                                                                      | Publishes events       | Depends on                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | --------------------------------- |
| **Iam**          | `users`, `memberships`, `roles`, `role_permissions`, `sessions`                                                                                                                                                                                                           | `user.*`               | Tenancy                           |
| **Tenancy**      | `tenants`, `branches`, `subscriptions`, `usage_meters`, `feature_flags`                                                                                                                                                                                                   | `tenant.*`, `branch.*` | —                                 |
| **Config**       | `settings`, `custom_field_defs`, `lookups`, `status_defs`, `status_transitions`, `action_defs`, `numbering_sequences`, `charge_codes`, `taxes`, `tax_rules`, `posting_rules`, `amenities`, `buildings`, `floors`                                                          | `config.changed`       | Tenancy                           |
| **Properties**   | `property_types`, `units`, `unit_types`, `unit_status_log`                                                                                                                                                                                                                | `unit.status_changed`  | Config                            |
| **Rates**        | `rate_plans`, `rate_calendar`, `restrictions`, `packages`                                                                                                                                                                                                                 | `rate.changed`         | Properties, Config                |
| **Reservations** | `reservations`, `reservation_units`, `room_type_inventory`, `reservation_nights`, `holds`                                                                                                                                                                                 | `reservation.*`        | Properties, Rates, Guests, Config |
| **FrontDesk**    | `stays`, `room_moves`, `business_dates`, `night_audits`, `night_audit_steps`, `kpi_snapshots`                                                                                                                                                                             | `stay.checked_in/out`  | Reservations, Folio, Config       |
| **Folio**        | `folios`, `folio_lines`, `payments`                                                                                                                                                                                                                                       | `folio.line_posted`    | Config, FrontDesk                 |
| **Housekeeping** | `hk_tasks`, `hk_checklists`, `maintenance_orders`, `lost_found`                                                                                                                                                                                                           | `hk.task_done`         | Properties, FrontDesk             |
| **Guests**       | `guests`, `companies`, `guest_prefs`, `guest_consents`, `guest_identifications`, `guest_merge_log`                                                                                                                                                                        | `guest.*`              | —                                 |
| **Restaurant**   | `outlets`, `tables`, `menu_categories`, `menu_items`, `menu_item_prices`, `modifier_groups`, `modifiers`, `orders`, `order_lines`, `kots`, `kot_lines`, `bills`, `bill_lines`, `bill_payments`, `shifts`                                                                  | `fnb.bill_settled`     | Inventory, Folio, Config          |
| **Inventory**    | `items`, `uoms`, `uom_conversions`, `warehouses`, `suppliers`, `purchase_orders`, `po_lines`, `grn`, `grn_lines`, `stock_ledger`, `stock_balances`, `stock_counts`, `stock_count_lines`, `stock_adjustments`, `stock_transfers`, `recipes`, `recipe_lines`, `fifo_layers` | `stock.moved`          | Accounting (via events), Config   |
| **Accounting**   | `coa_accounts`, `fiscal_years`, `fiscal_periods`, `voucher_types`, `vouchers`, `voucher_lines`, `gl_entries`, `gl_balances`, `recurring_vouchers`, `bank_reconciliations`, `bank_statements`                                                                              | `voucher.posted`       | Config                            |
| **Reporting**    | read models / materialized views                                                                                                                                                                                                                                          | —                      | all (read-only)                   |
| **Integrations** | `webhooks`, `channel_maps`, `channel_sync_logs`, `payment_intents`                                                                                                                                                                                                        | `integration.*`        | Reservations, Folio, Config       |
| **Audit**        | `audit_log` (partitioned), `outbox_events`, `inbox_events`, `idempotency_keys`, `attachments`                                                                                                                                                                             | —                      | —                                 |

> **Single Module Table Ownership Invariant:** Contested tables are strictly owned by **Config** (`charge_codes`, `taxes`, `tax_rules`, `posting_rules`, `numbering_sequences`). Other modules (`Rates`, `Folio`, `Accounting`, `FrontDesk`, `Restaurant`) query these tables exclusively through public read services or cached in-memory registries. Cross-module transactional accounting posting executes strictly via `PostingService` in `Accounting`, which evaluates `posting_rules` in the caller's active database transaction.

### 2.2 Boundary rules (enforced by lint + CI "architecture fitness" tests)

1. A module may read/write **only its own tables**. Cross-module reads go through the owner's public service interface or a read-model view.
2. Cross-module **side effects** (e.g. restaurant bill → folio line → voucher) flow through **domain events** delivered via the transactional outbox (§6.3), never direct imports of another module's repository.
3. Exception: Folio/Inventory/Restaurant → Accounting posting happens **in the same DB transaction** through the `PostingService` interface, so a business document and its voucher either both commit or both roll back (§7).
4. No module imports another module's controllers or DTOs.
5. Shared code lives only in `kernel/` (transactions, request context, errors, money, pagination).

---

## 3. Multi-Tenancy and Multi-Branch Design

### 3.1 Hierarchy

```
Platform (SaaS operator)
 └── Tenant (customer company)           ← isolation boundary (RLS)
      ├── Branch A (Hotel, Manila)       ← operational/financial boundary
      │     ├── Properties/Units (rooms, villas, halls)
      │     ├── Outlets (restaurants, bars), Warehouses
      │     └── Business date, currency, tax profile
      ├── Branch B (Resort, Boracay)
      └── Head office (consolidation, shared catalogs)
```

- **Tenant** = isolation boundary. Every tenant-owned row has `tenant_id uuid NOT NULL`.
- **Branch** = operational boundary. Almost all transactional rows also carry `branch_id`. Users receive access to a **set of branches** per role.
- **Shared-at-tenant-level catalogs** (guests, companies, items master, chart of accounts, rate plan templates) have `branch_id NULL` meaning "all branches"; branch-specific overrides use `branch_id = X`.
- **Consolidation:** reports and the ledger can be filtered by branch or consolidated across all branches the user may see. Inter-branch transfers (stock, cash) use due-to/due-from accounts.

### 3.2 Isolation strategy: pooled model + Postgres Row-Level Security

AWS prescriptive guidance for PostgreSQL SaaS identifies three partitioning models (silo, bridge, pool) and states RLS is required to maintain isolation in the pool model, preferring a runtime tenant context over per-tenant DB users. Innkeeper adopts **pool by default** with RLS as a hard backstop under application-level filtering.

Rules:

1. **Target Database Engine & UUIDv7 Strategy:** Pinned to **PostgreSQL 16.6+** baseline (supports local PostgreSQL 18 instances seamlessly). Because PG16/17 lack native `uuidv7()`, all primary keys are **application-generated UUIDv7** via npm `uuidv7`. Database default function generation (`DEFAULT uuidv7()`) is strictly **forbidden** in DDL and migrations to preserve cross-version portability.
2. **RLS Leading-Column Index Rule:** Every tenant-scoped table MUST have `tenant_id` as the **leading column** in all primary keys, composite unique constraints, and secondary indexes (e.g., `PRIMARY KEY (tenant_id, branch_id, unit_type_id, stay_date)` on `room_type_inventory`; `PRIMARY KEY (tenant_id, warehouse_id, item_id)` on `stock_balances`; `PRIMARY KEY (tenant_id, reservation_unit_id, stay_date)` on `reservation_nights`). This guarantees PostgreSQL query planner uses index-level RLS filtering without sequential scans.
3. `ENABLE` **and** `FORCE ROW LEVEL SECURITY` on all tenant tables (so even the table owner is subject to policies).
4. Policies carry both `USING` and `WITH CHECK` (otherwise a row could be re-parented to another tenant).
5. Tenant & Branch context is set **per transaction** with `set_config('app.tenant_id', $1, true)` and `set_config('app.branch_ids', $2, true)` (transaction-local → safe with PgBouncer transaction pooling and connection reuse).
6. The unset context **fails closed**: the helper returns `NULL`, matching no rows.
7. App connects as `innkeeper_app` (`NOBYPASSRLS`, not owner). Migrations run as `innkeeper_owner`. Support/analytics use a separate audited role. The transactional outbox worker connects as a dedicated `innkeeper_worker` role with `BYPASSRLS` (it must discover and claim events across tenants under `FORCE RLS`) and is **never** used in a request path; it sets the event's tenant context before dispatching.
8. Branch scoping is enforced in the application **and** in RLS via `RESTRICTIVE` policies for high-sensitivity tables (`vouchers`, `gl_entries`, `stock_ledger`):
   ```sql
   CREATE POLICY branch_scope ON vouchers AS RESTRICTIVE
     USING (app.branch_ids() IS NULL OR branch_id = ANY (app.branch_ids()));
   ```
9. CI includes a **cross-tenant leakage test suite**: for every table in `pg_class`, automated tests execute cross-tenant insert, read, update, and delete attempts; CI fails if any leakage occurs or if any table with a `tenant_id` column lacks RLS.

```sql
CREATE SCHEMA app;
CREATE FUNCTION app.tenant_id() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.tenant_id', true), '')::uuid $$;

CREATE FUNCTION app.branch_ids() RETURNS uuid[] LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.branch_ids', true), '')::uuid[] $$;

ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON reservations
  USING      (tenant_id = app.tenant_id())
  WITH CHECK (tenant_id = app.tenant_id());
```

### 3.3 Tenant resolution

1. Subdomain `acme.innkeeper.app` → tenant slug (custom domains later).
2. JWT carries `tid` (tenant), `sub` (user), `bids` (permitted branch ids, or `*`), `role` set; the **server re-derives** permissions from DB/cache — the token is not the source of truth for permissions.
3. A `RequestContext` (AsyncLocalStorage) carries `tenantId, branchId, userId, correlationId, locale, timezone` through controllers, services, outbox handlers and jobs.
4. A NestJS `TenantTransactionInterceptor` opens a transaction, runs `set_config(...)`, and exposes the transactional Kysely handle. **Services cannot reach the DB outside that handle** (lint rule).

### 3.4 Upgrade path

Large/regulated tenants can be promoted to a **dedicated database** (silo) or schema (bridge) because every query goes through a `TenantDbRouter` that maps `tenantId → connection`. Default router returns the shared pool.

---

## 4. Technology Decisions (ADR summary)

| #      | Decision                                                                                  | Rationale                                                                                               | Alternatives                         |
| ------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| ADR-01 | **Modular monolith**                                                                      | ACID across folio/stock/ledger; small team; extractable later                                           | Microservices (premature)            |
| ADR-02 | **PostgreSQL 16+** as the system of record                                                | RLS, range types + exclusion constraints, JSONB, partitioning, LISTEN/NOTIFY                            | MySQL (no exclusion constraints/RLS) |
| ADR-03 | **SQL-first migrations + Kysely** typed query builder                                     | We rely on RLS, GiST, triggers, deferred constraints that ORMs hide; Kysely keeps SQL visible but typed | Prisma/TypeORM/Drizzle               |
| ADR-04 | **NestJS 11 + TypeScript strict**                                                         | Module system maps to our boundaries; DI; OpenAPI                                                       | Fastify-only, Go                     |
| ADR-05 | **Transactional outbox** for events                                                       | Avoids dual-write between DB and messaging; at-least-once + idempotent consumers                        | Direct emit, Kafka-first             |
| ADR-06 | **`pg-boss`** (Postgres queue) for jobs                                                   | One fewer infra dependency; transactional enqueue                                                       | BullMQ/Redis (add later if needed)   |
| ADR-07 | **Exclusion constraint** for double-booking                                               | DB decides the race winner inside one transaction                                                       | App-level check-then-insert          |
| ADR-08 | **Voucher → immutable `gl_entries`** ledger                                               | Draft vouchers are editable, posted entries are append-only (audit)                                     | Mutable journal rows                 |
| ADR-09 | **Weighted-average-cost** valuation default, FIFO configurable per item category          | Stable cost under price fluctuation; simpler POS depletion                                              | FIFO/LIFO only                       |
| ADR-10 | **Server-driven UI actions** (`action_defs`)                                              | The tile menu must be configurable per tenant/role/status                                               | Hardcoded menus                      |
| ADR-11 | **TanStack Query + Zustand** on the client                                                | Server state vs UI state separation                                                                     | Redux                                |
| ADR-12 | **SSE** for live room-board updates                                                       | One-way, proxy-friendly, simple; fanout through outbox + LISTEN/NOTIFY                                  | WebSocket                            |
| ADR-13 | **Money = `numeric(19,4)`**; strings over the wire; `decimal.js` in code                  | No float rounding errors in a ledger                                                                    | float/integer-cents                  |
| ADR-14 | **UTC `timestamptz`** for instants; **`date` in branch timezone** for stay/business dates | Avoid timezone drift on check-in/out                                                                    | Local timestamps                     |

---

## 5. Data Architecture

### 5.1 Conventions

- **UUIDv7 Application Generation:** All primary keys across all modules are application-generated UUIDv7 instances created via the npm `uuidv7` package. Database default functions (`DEFAULT uuidv7()`) are strictly forbidden to ensure baseline compatibility with PostgreSQL 16.6+ (which lacks native v7 functions) and local PostgreSQL 18. Human document numbers (`folio_no`, `voucher_no`, `reservation_no`) are separate indexed text columns.
- **Standard Columns:** `tenant_id` (always leading index/PK column on tenant tables), `branch_id?`, `created_at timestamptz DEFAULT now()`, `created_by uuid`, `updated_at timestamptz`, `updated_by uuid`, `version int NOT NULL DEFAULT 1` (optimistic concurrency locking), `deleted_at timestamptz` (soft delete for master data only; **never** for ledger, stock, or folio rows).
- **Extensibility via Custom Fields:** `attrs jsonb NOT NULL DEFAULT '{}'` on configurable master and transaction tables, validated against `custom_field_defs` (§ Config in specification).
- **Lookup Tables vs Native Enums:** Enums use lookup/status tables (`status_defs`) when tenants can extend or configure them; native check constraints are reserved for engine-owned core state machines.
- **Append-Only Financial Ledgers:** `gl_entries`, `stock_ledger`, `audit_log`, and `folio_lines` are strictly append-only. Mutation (UPDATE/DELETE) is blocked by database triggers. Corrections are executed exclusively via explicit reversing rows.
- **Partitioning Strategy:** Monthly range partitioning on high-volume tables (`audit_log`, `gl_entries`, `stock_ledger`, `folio_lines`) managed via `pg_partman`.
- **GDPR vs Financial Retention Harmonization (NFR-008 vs REQ-PLT-007):** Tax and accounting regulations require ≥ 7 years retention of financial books. To comply with guest right-to-erasure (GDPR / Philippine DPA) without corrupting financial ledgers, Innkeeper implements a **cryptographic pseudonymization strategy**: upon verified erasure request, guest PII in `guests`, `guest_prefs`, and `guest_identifications` is purged/masked with salted hashes (`DELETED_GUEST_<hash>`), while financial documents (`folios`, `folio_lines`, `vouchers`, `gl_entries`) retain immutable transaction values linked to the anonymized guest ID.

### 5.2 Reservation ↔ Stay ↔ Unit ↔ Folio Relationship Model

To eliminate ambiguity between booking intent, physical room assignment, and financial billing:

1. **`reservations`**: Represents commercial contracts with the booker/guest. Holds overall booking status (`hold`, `confirmed`, `in_house`, `checked_out`, `cancelled`, `no_show`).
2. **`reservation_units`**: Represents reserved stay lines (unit type or specific unit, date range `[check_in, check_out)`, guest count, rate plan). Manages unassigned inventory allocation and physical unit exclusion constraints.
3. **`stays`**: Represents physical room occupancy created upon check-in. Holds a mandatory foreign key `reservation_unit_id uuid NOT NULL REFERENCES reservation_units(id)`, `unit_id uuid NOT NULL REFERENCES units(id)`, actual check-in/out timestamps, keycard status, and housekeeping links.
4. **`folios`**: Financial containers for charges and payments. Linked via `stay_id uuid REFERENCES stays(id)` and `reservation_id uuid REFERENCES reservations(id)`.
5. **Folio Concurrency & Optimistic Locking:**
   - Every `folios` row includes `version int NOT NULL DEFAULT 1`.
   - Charge postings, payments, line voids, window transfers, and checkout settlements MUST acquire an explicit row-level lock:
     ```sql
     SELECT id, status, version FROM folios WHERE id = $1 FOR UPDATE;
     ```
   - All mutations verify `status = 'open'` and increment `version = version + 1`.
6. **Folio Terminal State Machine:**
   - Strict lifecycle: `open` ➔ `settled` ➔ `closed`.
   - `open`: Accepts line postings, payments, transfers.
   - `settled`: Balance is exactly 0.0000 or settled to City Ledger AR. Ready for check-out.
   - `closed`: Check-out completed. Rejects any subsequent line postings. Late incidental charges (minibar discovered post-checkout) strictly require opening a new `incidental` folio.
7. **Night Audit Idempotency Invariant:**
   - `folio_lines` enforces composite uniqueness `(tenant_id, branch_id, stay_id, business_date, charge_type)` via unique index for automated room and tax postings. Repeated or resumed audit runs cannot produce duplicate room charges.

### 5.3 Availability & Concurrency Model (Hybrid)

1. **Room-Type Inventory Counters:** `room_type_inventory(tenant_id, branch_id, unit_type_id, stay_date)` tracks capacity and sold units with `CHECK (sold <= capacity + overbook_allowance)`. `tenant_id` is unconditionally the leading primary key column.
2. **Exclusion Constraint on Assigned Units:** `reservation_units` uses `EXCLUDE USING gist (unit_id WITH =, daterange(check_in, check_out, '[)') WITH &&)` to guarantee that no unit can hold overlapping active stays. SQLSTATE `23P01` maps to HTTP 409 `ROOM_NOT_AVAILABLE`.
3. **Atomic Booking Transaction:** Counter update, exclusion check, and reservation creation execute in a single database transaction. Holds carry `hold_expires_at` and are automatically released by background workers upon expiry.
4. **Idempotency Guarantee:** All booking mutations enforce `Idempotency-Key` headers.

### 5.4 Accounting Data Flow & Vouchering

```
Source document (folio line, restaurant bill, GRN, issue, payment, manual)
        │ same DB transaction
        ▼
PostingService.resolve(posting_rules) → draft/auto voucher + voucher_lines
        │  (auto-approved by rule or routed to approval)
        ▼
post(): lock period → assign gapless number → INSERT gl_entries (append-only)
        │  deferred constraint: Σdebit = Σcredit per voucher at COMMIT
        ▼
Trial balance / P&L / balance sheet / sub-ledgers computed from gl_entries
```

Rules: double-entry always; posting is atomic; posted vouchers are never edited — **reverse** (`reversal_of`) and re-post; closed periods reject posting; reports derive from the ledger, with `gl_balances` as a transactionally maintained cache that can be rebuilt.

### 5.5 Inventory Data Flow

`stock_ledger` is the single source of truth (append-only movements with running balance and valuation rate). `stock_balances(tenant_id, warehouse_id, item_id)` is a locked-row cache (`SELECT … FOR UPDATE`) with `tenant_id` leading column, used to serialize concurrent movements for the same item/warehouse and compute weighted-average cost.

---

## 6. Cross-Cutting Concerns

### 6.1 API style

- REST + JSON, `/api/v1`, OpenAPI 3.1 generated from Zod schemas (`nestjs-zod`); typed client generated for the frontend.
- Errors: RFC 7807 `application/problem+json` with stable `code` (`ROOM_NOT_AVAILABLE`, `PERIOD_CLOSED`, `VOUCHER_UNBALANCED`, …) and `correlationId`.
- Pagination: cursor-based; filtering by whitelisted query params; sorting whitelisted.
- Concurrency: `version` + `If-Match`/`409 STALE_VERSION`.
- Money as decimal strings; dates ISO-8601; ids UUID.
- Idempotency: `Idempotency-Key` store with request hash + stored response; same key + different payload → `422`.
- Long operations (night audit, period close, reports) return `202` + job resource.

### 6.2 AuthN / AuthZ

- Passwords: argon2id; optional TOTP MFA (mandatory for finance roles via setting); SSO (OIDC/SAML) for enterprise tenants.
- Short-lived access JWT (≈10 min) + rotating refresh token in `httpOnly; Secure; SameSite=Lax` cookie; CSRF double-submit for mutations.
- **Implemented today:** bcrypt password hashing; 15-minute access JWT signed by the API; rotating refresh token stored as a hash in `sessions` and set as the httpOnly `innkeeper_refresh_token` cookie; `cookie-parser` reads inbound cookies.
- **CSRF (implemented):** `GET /api/v1/auth/csrf` issues a random token and sets it as the non-httpOnly `XSRF-TOKEN` cookie; `CsrfGuard` (applied to the auth controller) compares it against the `X-CSRF-Token` header on state-changing requests using a constant-time hash comparison. Requests without the cookie (API clients, integration tests) pass through unchanged.
- **Current enforcement scope:** `CsrfGuard` is wired on the auth surface only; the `RequestContextMiddleware` still derives tenant/branch/user from `X-Tenant-Id` / `X-Branch-Id` / `X-User-Id` headers (with demo defaults), and a globally enforced JWT verification guard is **not yet implemented** — tracking item for the IAM phase.
- **RBAC with permission strings** (`reservation.create`, `folio.post_charge`, `voucher.approve`, `period.close`…) resolved per branch; **ABAC limits** (discount ≤ N%, void ≤ amount, back-dated posting window) stored as role limits.
- Sensitive actions require **reason + PIN/manager override** and are audited.
- Platform-admin plane is a separate app/role, not a tenant role.

### 6.3 Events: transactional outbox

`outbox_events` row is written in the same transaction as the state change. A worker publishes at-least-once with backoff, dead-letter and per-aggregate ordering; consumers are idempotent via an inbox/processed-events table. Uses: SSE fan-out, webhooks, email/SMS, read-model refresh, cross-module reactions (e.g. `fnb.bill_settled` → folio line).

### 6.4 Audit

`audit_log` (append-only, partitioned): who, tenant, branch, action, entity, before/after diff, IP, UA, correlationId, reason. Financial and security events are never deletable by tenants. Voucher, period, permission and config changes are always audited.

### 6.5 Configuration engine

Hierarchical settings resolution: **system default → tenant → branch → (property/outlet) → user**, cached with `config.changed` invalidation. See `specification.md §4` and `skills/innkeeper-configuration-engine`.

### 6.6 Time, currency, tax, locale

- Each branch has `timezone`, `base_currency`, `business_date` (rolled by night audit, not by wall-clock).
- Tax/service-charge rules are **data** (`taxes`, `tax_rules`, inclusive/exclusive, compounding, per charge code) — nothing country-specific is hardcoded (e.g. VAT, service charge, local occupancy taxes).
- i18n: ICU messages (`react-i18next`), `Intl` for money/dates; server errors return codes, UI translates.

### 6.7 Real-time

`GET /events` (SSE) per user session; server filters by tenant/branch; event types `unit.status_changed`, `reservation.updated`, `folio.updated`, `hk.task_updated`, `kot.fired`. Client invalidates TanStack Query keys on receipt (no polling).

### 6.8 Observability

Structured JSON logs (pino) with correlationId/tenantId; OpenTelemetry traces and RED metrics; per-tenant usage metrics (noisy-neighbour detection); slow-query logging with `pg_stat_statements`; business alarms (night audit failure, unbalanced voucher attempts, outbox lag).

### 6.9 Performance and noisy-neighbour control

- Indexes: `(tenant_id, branch_id, …)` leading; partial indexes for active states; GiST for ranges.
- PgBouncer in transaction mode; statement timeout and `lock_timeout` set per request class.
- Per-tenant rate limits and job concurrency caps; heavy reports use read replica.
- Room board is served from a compact read endpoint (`/board`) with ETag and SSE deltas.

---

## 7. Critical Transaction Flows

### 7.1 Create reservation

1. Validate rate/restrictions (min LOS, CTA/CTD, stop-sell) from Rates.
2. `BEGIN` (tenant context set).
3. Lock-free insert into `room_type_inventory` counters (single UPDATE with `sold = sold + n`; `CHECK` rejects oversell).
4. Optional room assignment insert → exclusion constraint resolves races.
5. Create reservation, stay lines, nightly rate rows, deposit requirement.
6. Write outbox `reservation.created`. `COMMIT`.

### 7.2 Check-in / Check-out

Check-in: validate unit `clean+inspected` per policy (configurable), create `stay` + `folio`, set unit status `occupied`, imprint payment token. Check-out: verify folio balance (or transfer to **city ledger**), post outstanding charges, generate invoice voucher, set unit `dirty`, create housekeeping task.

### 7.3 Night audit (per branch, resumable, idempotent)

Pre-checks (unchecked arrivals, open folios) → post room & tax per in-house stay → post no-show/ cancellation fees → roll `business_date` → generate GL vouchers (summary or per-line per config) → snapshot statistics (occupancy, ADR, RevPAR) → reports. Audit run is a state machine persisted in `night_audits` with step checkpoints.

### 7.4 Restaurant bill settlement

`BEGIN` → close bill → payments (cash/card/**room charge**) → if room-charge: folio line on the stay → stock depletion by recipe (WAC cost) → revenue voucher + COGS voucher → outbox `fnb.bill_settled` → `COMMIT`.

### 7.5 Period close

Validate no draft/unapproved vouchers in period → run closing checks (sub-ledger reconciliation, stock valuation vs GL) → lock period → year-end closing entry to retained earnings.

---

---

## 8. Security Architecture & PCI DSS v4.0.1 Compliance

### 8.1 Layered Security Controls

| Layer                  | Controls                                                                                                                                                                                                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Edge & CDN**         | TLS 1.3 (TLS 1.2 minimum), HSTS (`max-age=63072000; includeSubDomains; preload`), Cloudflare WAF, DDoS protection, bot/rate limiting, strict Content Security Policy (`script-src 'self' https://js.stripe.com; object-src 'none'`), strict CORS to verified tenant subdomains.                                                |
| **Application**        | Zero-trust input validation with Zod schemas on all API boundaries, output encoding, parameterized SQL queries exclusively via Kysely, OWASP ASVS Level 2 compliance target, automated dependency auditing (`pnpm audit`), static application security testing (SAST).                                                         |
| **Data & Isolation**   | PostgreSQL Row-Level Security (`ENABLE` + `FORCE ROW LEVEL SECURITY`), transaction-local tenant context (`app.tenant_id()`), restrictive financial policies (`app.branch_ids()`), AES-256 envelope encryption via AWS KMS / HashiCorp Vault for sensitive configuration, column-level encryption for identification documents. |
| **Secrets Management** | AWS Secrets Manager / HashiCorp Vault with dynamic credentials and automated rotation; zero plaintext credentials committed to source code or environment files.                                                                                                                                                               |
| **Backups & DR**       | Point-in-Time Recovery (PITR) with continuous WAL archiving to S3, immutable daily cross-region snapshots, quarterly restore drill validation (RPO ≤ 5 min, RTO ≤ 1 h).                                                                                                                                                        |
| **Privacy & GDPR**     | Automated guest data export and pseudonymized erasure workflows (GDPR Article 17 / Philippine Data Privacy Act of 2012), consent audit logging, strict tenant data export tools.                                                                                                                                               |
| **Audit & Governance** | Immutable monthly-partitioned `audit_log`, segregated platform-admin plane, tenant impersonation sessions requiring explicit business justification, notification, and time-limited tokens.                                                                                                                                    |
| **Supply Chain**       | Locked pnpm dependencies, automated SBOM generation, signed container images, minimal distroless base images, vulnerability scanning via Trivy.                                                                                                                                                                                |

### 8.2 PCI DSS v4.0.1 Compliance Architecture & Scope Descoping (GAPS §7.5)

To dramatically reduce security exposure and minimize compliance audit overhead, Innkeeper architects all payment flows to descope backend systems from PCI DSS requirements:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 PAYMENT CHANNEL BOUNDARIES                             │
│                                                                                        │
│  [ Online Booking Engine ]       [ Front Desk & POS Terminals ]    [ Phone / MOTO ]    │
│    (Card-Not-Present)               (Card-Present In-Person)         (Keyed Virtual)   │
│             │                                  │                            │          │
│             ▼                                  ▼                            ▼          │
│    Stripe / Adyen Hosted Fields       PCI-Validated P2PE Device     Hosted Virtual VT  │
│    (Iframe / Drop-in SDK)             (Keypad / Chip / NFC)         (Processor Portal) │
│             │                                  │                            │          │
│    ┌────────┴────────┐                ┌────────┴────────┐                   │          │
│    │  SAQ A Scope    │                │  SAQ P2PE Scope │          ┌────────┴────────┐ │
│    │ Cardholder data │                │ Hardware level  │          │ SAQ C-VT Scope  │ │
│    │ never touches   │                │ encryption; raw │          │ No PAN entered  │ │
│    │ our servers     │                │ PAN unreachable │          │ in PMS fields   │ │
│    └────────┬────────┘                └────────┬────────┘          └────────┬────────┘ │
│             │                                  │                            │          │
│             └──────────────────────────────────┼────────────────────────────┘          │
│                                                ▼                                       │
│                                Safe Opaque Gateway Token                               │
│                         (e.g., tok_1N4m..., card_pm_abc123)                            │
│                                                │                                       │
│                                                ▼                                       │
│                                    Innkeeper Core Backend                              │
│                         Stores: token_ref, last4, brand, exp_month                     │
│                         FORBIDDEN: Raw PAN, CVV/CVC, Track Data                        │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

1. **Online Booking Engine (Card-Not-Present — SAQ A):**
   - Implemented exclusively via processor-hosted fields / tokenization iframes (Stripe Elements, Adyen Drop-in).
   - Cardholder data (PAN, expiration, CVV) is transmitted directly from the guest's browser to the PCI DSS Level 1 certified gateway. Innkeeper servers receive only a single-use or reusable customer payment token (`payment_method_id`).
2. **Front Desk & POS Terminals (Card-Present — SAQ P2PE / SAQ B-IP):**
   - Hardware payment terminals (e.g., Stripe Terminal BBPOS WisePOS E, Adyen NYC1/Castles S1F2, PAX) must be **PCI-validated Point-to-Point Encryption (P2PE)** devices.
   - Raw payment card data is encrypted instantly inside the secure physical hardware module at the reader head. Decryption keys reside exclusively with the payment processor.
   - Front desk and POS workstations only initiate payment intents via local network or cloud API and receive authorization tokens; no unencrypted cardholder data touches workstation memory or local networks.
3. **Phone & Mail Order / MOTO (SAQ C-VT):**
   - Front desk agents taking reservations over the phone use processor-hosted virtual terminals in an isolated browser session.
   - Entering raw primary account numbers into PMS custom fields, booking notes, or chat tools is strictly forbidden and blocked by frontend regex inspection guards.
4. **Zero Cardholder Data Storage Invariant:**
   - Under no circumstances shall Innkeeper databases, file stores, Redis caches, application logs, or audit records store Primary Account Numbers (PAN), Card Verification Values (CVV/CVC/CID), PINs, PIN blocks, or magnetic stripe/chip track data.
   - Financial tables (`payment_intents`, `payments`, `folios`) store only non-sensitive metadata: `gateway_name`, `gateway_token_id`, `card_brand` (Visa/Mastercard), `last_four_digits` (char 4), and `expiry_month`/`expiry_year`.

---

## 9. Infrastructure, DevOps & Observability Specification

### 9.1 Infrastructure as Code (IaC) & Deployment Topology (GAPS §6)

Production infrastructure is fully codified via Terraform / OpenTofu modules structured across environments (`dev`, `staging`, `prod`):

```
                                  Cloudflare Edge (DNS, WAF, DDoS, SSL)
                                                   │
                                      ┌────────────▼───────────┐
                                      │ Ingress / NLB (TLS 1.3)│
                                      └────────────┬───────────┘
                                                   │
                                ┌──────────────────┴──────────────────┐
                                │                                     │
                      ┌─────────▼────────┐                  ┌─────────▼────────┐
                      │ Kubernetes / ECS │                  │ Kubernetes / ECS │
                      │ API Pods (NestJS)│                  │ Worker Pods      │
                      └─────────┬────────┘                  └─────────┬────────┘
                                │                                     │
                 ┌──────────────┼──────────────────────────┐          │
                 │              │                          │          │
        ┌────────▼──────┐ ┌─────▼────────┐        ┌────────▼────────┐ │
        │ Redis Cluster │ │ PgBouncer    │        │ S3 Bucket Store │ │
        │ (Cache/Tokens)│ │ (Txn Pooling)│        │ (Invoices, PDFs)│ │
        └───────────────┘ └─────┬────────┘        └─────────────────┘ │
                                │                                     │
                   ┌────────────┴─────────────┐                       │
                   │                          │                       │
          ┌────────▼────────┐       ┌─────────▼────────┐              │
          │ PostgreSQL 16+  │       │ PostgreSQL 16+   │◄─────────────┘
          │ Primary (Write) ├──────►│ Read-Replica     │ (Async replication)
          └─────────────────┘       └──────────────────┘ (Reporting routing)
```

1. **Database Tier:**
   - Managed PostgreSQL (AWS Aurora PG / Azure Flexible Server / GCP Cloud SQL) running PostgreSQL 16.6+ with multi-AZ high availability and automated failover.
   - Read replica dedicated to analytical queries, scheduled financial reporting, and audit log inspection.
   - **PgBouncer** connection pooling running in `transaction` mode. Pool size calculated as: `max_connections = (CPU_cores * 4) + effective_spindle_count`.
2. **Container Orchestration:**
   - Stateless backend API (`apps/api`) and worker daemon (`apps/worker`) packaged as OCI container images running on AWS EKS / ECS or Google Cloud GKE.
   - Horizontal Pod Autoscaler (HPA) scaling on CPU (70% target) and HTTP request concurrency.
3. **Storage & Caching:**
   - S3-compatible object storage (AWS S3 / Cloudflare R2 / MinIO local) for document attachments, registration cards, and generated PDF invoices with SSE-KMS encryption.
   - Redis cluster for distributed rate limiting, real-time lock coordination, and cache invalidation broadcasting.

### 9.2 Observability, Secrets & Partitioning

1. **OpenTelemetry (OTel) Distributed Tracing & RED Metrics:**
   - All HTTP requests, outbox worker dispatches, and database transactions inject W3C Trace Context headers (`traceparent`, `tracestate`).
   - OTel Collector exports traces to Grafana Tempo / Jaeger, and metrics to Prometheus.
   - **RED Metrics Monitored:** Rate (requests/sec), Errors (4xx/5xx count), and Duration (latency distribution: p50, p95, p99).
2. **Structured Logging & Sentry Error Tracking:**
   - Pino structured JSON logger tagging every record with `correlationId`, `tenantId`, `branchId`, `userId`, and `service`.
   - Logs shipped via Promtail / Fluentbit to Grafana Loki.
   - Sentry integration capturing unhandled exceptions with sanitization guards stripping PII and payment tokens.
3. **Automated Partitioning Management (`pg_partman`):**
   - High-volume append-only tables (`audit_log`, `gl_entries`, `stock_ledger`, `folio_lines`) use native range partitioning by month:
     ```sql
     CREATE TABLE audit_log (
       id uuid NOT NULL,
       tenant_id uuid NOT NULL,
       created_at timestamptz NOT NULL,
       -- ...
       PRIMARY KEY (tenant_id, created_at, id)
     ) PARTITION BY RANGE (created_at);
     ```
   - Automated partition maintenance handled via `pg_partman` worker executing weekly cron jobs to pre-create partitions 3 months ahead and detach/archive partitions older than 7 years into cold Parquet storage on S3.

---

## 10. Repository Layout (monorepo, pnpm workspaces)

```
innkeeper/
├─ apps/
│  ├─ api/                 # NestJS: src/kernel, src/modules/<module>/{domain,app,infra,http}
│  ├─ worker/              # outbox publisher, night audit, hold expiry, emails
│  └─ web/                 # React + Vite (see frontend.md)
├─ packages/
│  ├─ contracts/           # Zod schemas + generated API client + shared types
│  ├─ money/               # decimal money helpers (server + web)
│  └─ config-schemas/      # JSON schemas for settings / custom fields / action defs
├─ db/
│  ├─ migrations/          # ordered .sql files (owner role)
│  ├─ seeds/               # system defaults: CoA templates, voucher types, status defs
│  └─ tests/               # RLS leakage, exclusion, ledger invariants (pgTAP/Vitest)
├─ docs/  (architecture.md, specification.md, frontend.md, todo.md)
└─ skills/                 # project skills for AI coding assistants
```

Backend module internals follow **ports & adapters**: `http` (controllers) → `app` (use cases, each `@Transactional`) → `domain` (entities/invariants, pure) → `infra` (Kysely repos, outbox).

---

## 11. Quality Strategy

| Level         | Tooling                                 | Must cover                                                                                                               |
| ------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Unit          | Vitest                                  | pricing, tax calc, WAC, voucher balancing, cancellation policy                                                           |
| DB invariants | Testcontainers + SQL tests              | RLS leakage, exclusion constraint races (parallel inserts), balanced-voucher trigger, immutability triggers, period lock |
| API/contract  | Supertest + OpenAPI diff                | error codes, idempotency, versioning                                                                                     |
| E2E           | Playwright                              | board → tile menu → check-in → post charge → check-out → invoice → voucher                                               |
| Concurrency   | k6/custom                               | 100 parallel bookings on last room → exactly 1 succeeds                                                                  |
| Accessibility | axe + manual                            | WCAG 2.2 AA on board and forms                                                                                           |
| Security      | ZAP, dependency audit, tenant-leak fuzz | OWASP top 10                                                                                                             |

Definition of Done is in `skills/innkeeper-core/SKILL.md`.

---

## 12. Integrations & Industry Standards (Adapter Pattern)

### 12.1 USALI 12th Revised Edition Compliance

Effective January 1, 2026, the **Uniform System of Accounts for the Lodging Industry (USALI 12th Revised Edition)** governs hospitality financial accounting. Innkeeper embeds USALI 12th Edition compliance directly into its Accounting engine:

1. **Standard Hospitality Chart of Accounts:** Pre-seeded hierarchical templates classifying operating revenues and expenses into Operating Departments (Rooms, F&B, Other Operated Departments), Undistributed Operating Expenses (Administrative & General, Information & Telecommunications Systems, Sales & Marketing, Property Operation & Maintenance), and Non-Operating Expenses (Rent, Property Taxes, Insurance).
2. **Energy, Water, and Waste (EWW) Schedule:** Full support for USALI 12th Edition's new mandatory sustainability reporting schedule tracking utility metrics (electricity kWh, water m³, waste metrics) linked to departmental allocation vouchers.
3. **Departmental Financial Statements:** Out-of-the-box USALI Summary Operating Statement, Rooms Department Schedule, and F&B Department Schedule drillable to ledger entries.

### 12.2 Channel Manager 2-Way ARI Synchronization

Innkeeper integrates with Online Travel Agencies (Booking.com, Expedia, Agoda) and Global Distribution Systems (GDS) via a dedicated Channel Manager Adapter matching **OpenTravel Alliance (OTA)** and **HTNG ARI (Availability, Rates, Inventory)** XML/JSON standards:

1. **Outbound Push (ARI Sync):**
   - Real-time delta push triggered by local booking mutations, unit status changes, or rate updates.
   - Pushes inventory counts, minimum/maximum length of stay, Closed to Arrival (CTA), Closed to Departure (CTD), and stop-sell flags.
2. **Inbound Pull & Webhook Processing:**
   - Ingests external reservations, modifications, and cancellations via webhook.
   - **Rate-Parity & Price Guard:** Validates inbound OTA pricing against local active rate rules; logs discrepancies without rejecting bookings unless overbooked.
   - Idempotent ingestion: deduplicates by `(channel_name, channel_reservation_ref)`.

### 12.3 Hardware Integration Adapters

1. **Keycard Door Lock Systems:** Pluggable adapter supporting **HTNG Web Services** and **Oracle FIAS TCP/IP** protocols for major commercial lock encoders (ASSA ABLOY Vostio/Visionline, dormakaba Ambiance, Onity OnPortal, Salto Space). Check-in triggers encode events; room moves re-encode keys and invalidate old credentials.
2. **PBX Telephone Systems:** FIAS adapter for telephone switchboards: enables automated guest name display on room phones upon check-in, posts call toll charges to guest folios in real time, and captures housekeeping status updates dialed by room attendants (`*71` -> Clean).
3. **POS Hardware (ESC/POS):** Thermal receipt and kitchen printers connect via raw TCP socket or local print agent supporting standard ESC/POS command sequences for 80mm and 58mm paper.

### 12.4 Fiscalization & E-Invoicing Compliance

1. **Philippines BIR EIS & CAS Compliance:** Architecture complies with the Bureau of Internal Revenue (BIR) Electronic Invoicing / Receipting System (EIS) and Computerized Accounting System (CAS) regulations:
   - JSON export for BIR EIS reporting containing required fiscal identifiers (TIN, Branch Code, Permit to Use number, Serial Number, Machine Identification Number).
   - Tamper-evident fiscal audit trails and gapless electronic Sales Journal numbers.
   - POS shift X-Readings (mid-shift summary) and Z-Readings (end-of-day financial close and counter reset).
2. **European Hybrid E-Invoicing (Factur-X / PDF/A-3):** Generates hybrid tax invoices embedding structured EN16931-compliant XML within a visual PDF/A-3 document, fulfilling statutory mandates across France, Germany (ZUGFeRD), and the European Union.

---

## 13. Risks and Mitigations

| Risk                        | Mitigation                                                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Cross-tenant data leak      | RLS + FORCE + leakage CI suite + no owner-role connections                                                              |
| Overbooking races           | DB exclusion constraint + inventory CHECK + idempotency keys                                                            |
| Unbalanced/edited books     | Deferred balance trigger, immutability triggers, period locks, reversal-only corrections                                |
| Configurability explosion   | Constrained schemas for settings/custom fields; JSON Schema validation; sensible defaults + templates per property type |
| Night-audit failure at 3 AM | Resumable steps, alerts, manual override runbook                                                                        |
| Noisy neighbour             | Per-tenant quotas, timeouts, read replicas, silo upgrade path                                                           |
| Monolith coupling           | Module boundary lint, events, ownership table                                                                           |

---

## 14. References (research basis)

- AWS Prescriptive Guidance — Managed PostgreSQL for multi-tenant SaaS (silo/bridge/pool; RLS recommendations): https://docs.aws.amazon.com/prescriptive-guidance/latest/saas-multitenant-managed-postgresql/rls.html
- PostgreSQL row-level security (ENABLE/FORCE, USING vs WITH CHECK, session variable pattern): https://stackharbor.com/en/knowledge-base/pg-row-level-security-multi-tenant/
- Preventing double-booking with GiST exclusion constraints: https://www.techinterview.org/post/3233460029/design-a-hotel-airbnb-reservation-system/ · https://sqlfordevs.com/non-overlapping-time-ranges · https://dev.to/sumedhbala/hotel-booking-schema-design-comparison-g3h
- Double-entry ledger design (immutability, reversal entries, balanced journals): https://www.techinterview.org/post/3233469735/lld-ledger-system/
- Accounting software rules (exact arithmetic, atomic posting, periods, ledger-derived reports): https://www.wyzant.com/resources/answers/637475/accounting-software-design-patterns
- Hotel PMS module scope (front desk, rates, housekeeping, night audit, folio, channel manager, POS): https://www.hotelogix.com/blog/hotel-pms-checklist · https://www.altexsoft.com/blog/travel/hotel-property-management-systems-products-and-features/
- Restaurant inventory costing (WAC/FIFO, recipe costing, POS depletion): https://nory.ai/blog/guide-to-costing-techniques-for-restaurant-inventory/ · https://bepbackoffice.com/blog/restaurant-inventory-management-best-practices/
- Modular monolith + transactional outbox + idempotency: https://github.com/EmanuelVogt/platform-template · https://dev.to/rodrigobnogueira/the-dual-write-problem-in-nestjs-solved-with-drizzle-a-transactional-outbox-idempotent-inbox-462l
- React feature-based architecture, TanStack Query for server state: https://dev.to/akshaykurve/structuring-large-frontend-projects-with-react-without-losing-your-mind-3k0i
