# Innkeeper — Architecture

> Multi-tenant, multi-branch SaaS for hotels and rental properties: reservations, front desk, housekeeping, restaurant, inventory and double-entry accounting with vouchering. Everything operational is **configurable per tenant and per branch**.

| Item | Value |
|---|---|
| Codename | Innkeeper |
| Document status | v1.0 — baseline architecture |
| Backend | TypeScript · NestJS (modular monolith) · PostgreSQL 16+ |
| Frontend | React 19 · Vite · Bootstrap 5.3 (react-bootstrap) · **light theme only** |
| Companion docs | `specification.md` · `frontend.md` · `todo.md` · `skills/` |

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

| Module | Owns (tables prefix) | Publishes events | Depends on |
|---|---|---|---|
| **Iam** | `users`, `memberships`, `roles`, `role_permissions`, `sessions` | `user.*` | Tenancy |
| **Tenancy** | `tenants`, `branches`, `subscriptions` | `tenant.*`, `branch.*` | — |
| **Config** | `settings`, `custom_field_defs`, `lookups`, `status_defs`, `action_defs`, `numbering_sequences` | `config.changed` | Tenancy |
| **Properties** | `property_types`, `units`, `unit_types`, `amenities`, `floors` | `unit.status_changed` | Config |
| **Rates** | `rate_plans`, `rate_calendar`, `restrictions`, `packages`, `taxes` | `rate.changed` | Properties |
| **Reservations** | `reservations`, `reservation_units`, `room_type_inventory`, `holds` | `reservation.*` | Properties, Rates, Guests |
| **FrontDesk** | `stays`, `room_moves`, `business_dates`, `night_audits` | `stay.checked_in/out` | Reservations, Folio |
| **Folio** | `folios`, `folio_lines`, `charge_codes`, `payments` | `folio.line_posted` | Config |
| **Housekeeping** | `hk_tasks`, `maintenance_orders`, `lost_found` | `hk.task_done` | Properties |
| **Guests** | `guests`, `companies`, `guest_prefs` | — | — |
| **Restaurant** | `outlets`, `tables`, `menu_*`, `orders`, `kots`, `bills` | `fnb.bill_settled` | Inventory, Folio |
| **Inventory** | `items`, `uoms`, `warehouses`, `stock_ledger`, `stock_balances`, `grn`, `purchase_orders`, `stock_counts` | `stock.moved` | Accounting (via events) |
| **Accounting** | `coa_accounts`, `fiscal_years`, `periods`, `voucher_types`, `vouchers`, `voucher_lines`, `gl_entries`, `posting_rules` | `voucher.posted` | Config |
| **Reporting** | read models / materialized views | — | all (read-only) |
| **Integrations** | `webhooks`, `channel_maps`, `payment_intents` | `integration.*` | Reservations, Folio |
| **Audit** | `audit_log`, `outbox_events`, `idempotency_keys` | — | — |

### 2.2 Boundary rules (enforced by lint + CI "architecture fitness" tests)
1. A module may read/write **only its own tables**. Cross-module reads go through the owner's public service interface or a read-model view.
2. Cross-module **side effects** (e.g. restaurant bill → folio line → voucher) flow through **domain events** delivered via the transactional outbox (§6.3), never direct imports of another module's repository.
3. Exception: Folio/Inventory → Accounting posting happens **in the same DB transaction** through the `PostingService` interface, so a business document and its voucher either both commit or both roll back (§7).
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
1. Every tenant table: `tenant_id NOT NULL REFERENCES tenants`, **indexed with `tenant_id` as the leading column**.
2. `ENABLE` **and** `FORCE ROW LEVEL SECURITY` on all tenant tables (so even the table owner is subject to policies).
3. Policies carry both `USING` and `WITH CHECK` (otherwise a row could be re-parented to another tenant).
4. Tenant context is set **per transaction** with `set_config('app.tenant_id', $1, true)` (transaction-local → safe with PgBouncer transaction pooling and connection reuse).
5. The unset context **fails closed**: the helper returns `NULL`, matching no rows.
6. App connects as `innkeeper_app` (`NOBYPASSRLS`, not owner). Migrations run as `innkeeper_owner`. Support/analytics use a separate audited role.
7. Branch scoping is enforced in the application **and** optionally in RLS via `app.branch_ids` for high-sensitivity tables (vouchers, gl_entries, cash).
8. CI includes a **cross-tenant leakage test suite**: for every table, create two tenants and prove tenant A can neither read, update, delete, nor insert into tenant B.

```sql
CREATE SCHEMA app;
CREATE FUNCTION app.tenant_id() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.tenant_id', true), '')::uuid $$;

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

| # | Decision | Rationale | Alternatives |
|---|---|---|---|
| ADR-01 | **Modular monolith** | ACID across folio/stock/ledger; small team; extractable later | Microservices (premature) |
| ADR-02 | **PostgreSQL 16+** as the system of record | RLS, range types + exclusion constraints, JSONB, partitioning, LISTEN/NOTIFY | MySQL (no exclusion constraints/RLS) |
| ADR-03 | **SQL-first migrations + Kysely** typed query builder | We rely on RLS, GiST, triggers, deferred constraints that ORMs hide; Kysely keeps SQL visible but typed | Prisma/TypeORM/Drizzle |
| ADR-04 | **NestJS 11 + TypeScript strict** | Module system maps to our boundaries; DI; OpenAPI | Fastify-only, Go |
| ADR-05 | **Transactional outbox** for events | Avoids dual-write between DB and messaging; at-least-once + idempotent consumers | Direct emit, Kafka-first |
| ADR-06 | **`pg-boss`** (Postgres queue) for jobs | One fewer infra dependency; transactional enqueue | BullMQ/Redis (add later if needed) |
| ADR-07 | **Exclusion constraint** for double-booking | DB decides the race winner inside one transaction | App-level check-then-insert |
| ADR-08 | **Voucher → immutable `gl_entries`** ledger | Draft vouchers are editable, posted entries are append-only (audit) | Mutable journal rows |
| ADR-09 | **Weighted-average-cost** valuation default, FIFO configurable per item category | Stable cost under price fluctuation; simpler POS depletion | FIFO/LIFO only |
| ADR-10 | **Server-driven UI actions** (`action_defs`) | The tile menu must be configurable per tenant/role/status | Hardcoded menus |
| ADR-11 | **TanStack Query + Zustand** on the client | Server state vs UI state separation | Redux |
| ADR-12 | **SSE** for live room-board updates | One-way, proxy-friendly, simple; fanout through outbox + LISTEN/NOTIFY | WebSocket |
| ADR-13 | **Money = `numeric(19,4)`**; strings over the wire; `decimal.js` in code | No float rounding errors in a ledger | float/integer-cents |
| ADR-14 | **UTC `timestamptz`** for instants; **`date` in branch timezone** for stay/business dates | Avoid timezone drift on check-in/out | Local timestamps |

---

## 5. Data Architecture

### 5.1 Conventions
- UUID v7 primary keys (time-ordered → index-friendly). Human document numbers are separate columns.
- Standard columns: `tenant_id, branch_id?, created_at, created_by, updated_at, updated_by, version int` (optimistic concurrency), `deleted_at` (soft delete for master data only; **never** for ledger/stock/folio rows).
- `attrs jsonb` on configurable master/transaction tables for **tenant-defined custom fields**, validated against `custom_field_defs` (§ Config in specification).
- Enums via **lookup tables** when tenants can extend them (statuses, charge groups); native enum/`CHECK` only for system-owned states.
- Append-only: `gl_entries`, `stock_ledger`, `audit_log`, `folio_lines` (corrections are reversal lines).
- Partitioning: `audit_log`, `gl_entries`, `stock_ledger`, `folio_lines` partitioned by month/range once volumes justify (declared in migrations from day one for audit_log).

### 5.2 Availability model (hybrid, from research)
1. **Room-type inventory** (`room_type_inventory`, one row per branch × room_type × night) tracks sellable counts with `CHECK (sold <= capacity + overbook_allowance)` — fast search and unassigned bookings.
2. **Unit assignment** (`reservation_units`) uses `EXCLUDE USING gist (unit_id WITH =, daterange(check_in, check_out,'[)') WITH &&) WHERE (active)` — no unit can ever hold two overlapping stays.
3. Both updates happen in the **same transaction**; the exclusion violation (`23P01`) maps to HTTP 409 `ROOM_NOT_AVAILABLE`.
4. Holds (`status='hold'`, `hold_expires_at`) reserve inventory during checkout/payment and are released by a worker.
5. `Idempotency-Key` header on create/modify endpoints prevents duplicate bookings on retries.

### 5.3 Accounting data flow

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

### 5.4 Inventory data flow
`stock_ledger` is the single source of truth (append-only movements with running balance and valuation rate). `stock_balances(item, warehouse)` is a locked-row cache (`SELECT … FOR UPDATE`) used to serialize concurrent movements for the same item/warehouse and compute weighted-average cost.

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

## 8. Security Architecture

| Layer | Controls |
|---|---|
| Edge | TLS 1.2+, HSTS, WAF, bot/rate limits, CSP (no inline scripts), strict CORS to tenant origins |
| App | Input validation (Zod) everywhere, output encoding, parameterized SQL only, OWASP ASVS L2 as target, dependency scanning, SAST |
| Data | RLS + FORCE, tenant-scoped encryption keys for PII/tokens (envelope encryption with KMS), column-level encryption for ID docs/card tokens, **never store PAN/CVV** (gateway tokenization → PCI SAQ-A scope) |
| Secrets | Secret manager; no secrets in env files committed |
| Backups | PITR (WAL archiving), daily snapshots, quarterly restore drills; per-tenant export tooling |
| Privacy | PII inventory, data-subject export/erasure workflows (GDPR / local privacy acts such as the PH Data Privacy Act), retention policies per entity, consent logging |
| Audit | Immutable audit log, admin-impersonation requires reason + tenant notification |
| Supply chain | Lockfiles, SBOM, signed images, minimal base images |

---

## 9. Deployment and Environments

- Containers (Docker) → Kubernetes or managed container service; stateless API + worker deployments scale independently.
- Managed PostgreSQL (HA + read replica), PgBouncer sidecar/service, object storage (S3-compatible), optional Redis (cache/rate limits).
- Environments: `local` (docker-compose: postgres, pgbouncer, mailpit, minio) → `staging` → `prod`. Preview environments per PR optional.
- Migrations: forward-only, expand/contract pattern, run as a pre-deploy job with `innkeeper_owner`; zero-downtime rule: never rename/drop in the same release as code that uses it.
- CI/CD: lint → typecheck → unit → **RLS leakage + constraint tests against real Postgres (Testcontainers)** → build → e2e (Playwright) → deploy. Feature flags per tenant for progressive rollout.
- SLO targets: API p95 < 300 ms (reads) / < 600 ms (writes), board load < 1.5 s on 500 units, 99.9 % monthly availability, RPO ≤ 5 min, RTO ≤ 1 h.

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

| Level | Tooling | Must cover |
|---|---|---|
| Unit | Vitest | pricing, tax calc, WAC, voucher balancing, cancellation policy |
| DB invariants | Testcontainers + SQL tests | RLS leakage, exclusion constraint races (parallel inserts), balanced-voucher trigger, immutability triggers, period lock |
| API/contract | Supertest + OpenAPI diff | error codes, idempotency, versioning |
| E2E | Playwright | board → tile menu → check-in → post charge → check-out → invoice → voucher |
| Concurrency | k6/custom | 100 parallel bookings on last room → exactly 1 succeeds |
| Accessibility | axe + manual | WCAG 2.2 AA on board and forms |
| Security | ZAP, dependency audit, tenant-leak fuzz | OWASP top 10 |

Definition of Done is in `skills/innkeeper-core/SKILL.md`.

---

## 12. Integrations (adapter pattern)

Ports with pluggable adapters: **Payments** (tokenized gateway), **Channel manager / OTA** (inbound reservations, outbound ARI), **Booking engine** (public API with API keys, scoped), **Accounting export** (CSV/journal export to external ERP), **Email/SMS/WhatsApp**, **Door locks**, **e-invoice/tax authority**, **POS printers/KDS**. Each adapter: signed webhooks, retry + dead-letter, per-tenant credentials in the secret store, idempotent inbound processing.

---

## 13. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Cross-tenant data leak | RLS + FORCE + leakage CI suite + no owner-role connections |
| Overbooking races | DB exclusion constraint + inventory CHECK + idempotency keys |
| Unbalanced/edited books | Deferred balance trigger, immutability triggers, period locks, reversal-only corrections |
| Configurability explosion | Constrained schemas for settings/custom fields; JSON Schema validation; sensible defaults + templates per property type |
| Night-audit failure at 3 AM | Resumable steps, alerts, manual override runbook |
| Noisy neighbour | Per-tenant quotas, timeouts, read replicas, silo upgrade path |
| Monolith coupling | Module boundary lint, events, ownership table |

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
