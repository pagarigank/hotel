# Innkeeper — Delivery Plan (todo.md)

# Local PostgreSQL connection is configured via `.env` (see `.env.example`). Never commit credentials.

# special note: dont use docker.  use the postgres on my windows

> Comprehensive implementation roadmap and engineering backlog for **Innkeeper**, the multi-tenant, multi-branch hotel & property management SaaS.
> Built on **PostgreSQL 16+**, **NestJS 11** (modular monolith), and **React 19 + Bootstrap 5.3** (strictly light theme).
> Incorporates all remediations from `GAPS.md`, industry hospitality standards (**USALI 12th Revised Edition**, **PCI DSS v4.0.1**, **HTNG/FIAS**, **2-way ARI Channel Management**, and **Fiscal/E-Invoicing** mandates).

---

## Legend & Invariants

- **Status:** `[ ]` open · `[x]` done
- **Priority:**
  - **(P0)** Blocker / Critical Architectural Invariant (must be completed before dependent features can start)
  - **(P1)** Core MVP Feature (essential for commercial operation)
  - **(P2)** Important / Advanced Capability (operational polish, enterprise features, advanced workflows)
  - **(P3)** Future / Expansion Capability
- **Traceability:** Requirement IDs (`REQ-…`) refer to `specification.md`; architectural items refer to `architecture.md` and `frontend.md`.
- **Quality Gate:** Each phase ends with a **demo-able vertical slice** and strict **exit criteria**. No phase feature may be started until the previous phase's database invariant tests (RLS leakage, exclusion constraints, balance triggers) are completely green in CI.

---

## Phase 0a — Architecture & Specification Remediation (Pre-requisites)

*Remediate all cross-document contradictions, close missing DDL/behavioral specifications, and align with hospitality and security industry standards before laying foundational code.*

### 0a.1 Cross-Document Conflict Resolution & Architectural Invariants (GAPS §1)
- [x] **(P0)** **UUIDv7 & PG Minor Strategy:** Standardize on application-generated UUIDv7 via npm `uuidv7` across backend and migrations; forbid database default function generation (note PG16/17 lack native `uuidv7()`); pin target database engine to PostgreSQL 16.6+ (GAPS §1.1).
- [x] **(P0)** **Module Table Ownership Harmonization:** Formally assign single module ownership for contested tables: `Config` module strictly owns `charge_codes`, `taxes`, `posting_rules`, and `numbering_sequences`; `Rates`, `Folio`, and `Accounting` access them via public read services; cross-module transactional posting executes strictly via `PostingService` (GAPS §1.2).
- [x] **(P0)** **RLS Leading-Column Index Rule:** Fix compound primary keys and index definitions so `tenant_id` is unconditionally the leading column on all tenant-scoped tables (`room_type_inventory` -> `PRIMARY KEY (tenant_id, branch_id, unit_type_id, stay_date)`; `stock_balances` -> `PRIMARY KEY (tenant_id, warehouse_id, item_id)`; `reservation_nights` -> `PRIMARY KEY (tenant_id, reservation_unit_id, stay_date)`) to guarantee index-level RLS filtering without sequential table scans (GAPS §1.3).
- [x] **(P0)** **Branch Context Scoping Standardization:** Unify branch isolation contract across architecture and skills: implement `app.tenant_id()` and `app.branch_ids()` session helpers; define `RESTRICTIVE` RLS policies for high-sensitivity financial tables (`vouchers`, `gl_entries`, `stock_ledger`); enforce fail-closed behavior (`NULL` context matches zero rows) (GAPS §1.4).
- [x] **(P0)** **Reservation ↔ Stay ↔ Unit ↔ Folio Relationship Model:** Establish explicit schema relationships: define `stays` table with mandatory FK to `reservation_units(id)`; clarify that `reservation_units` handles room allocation while `stays` manages physical occupancy; eliminate ambiguity between reservation status and unit operational state (GAPS §1.5).
- [x] **(P0)** **Folio Concurrency & Optimistic Locking:** Add `version int NOT NULL DEFAULT 1` to `folios`; document exact row-level locking specification (`SELECT … FOR UPDATE`) for charge posting, payments, transfers, and checkout balance settlement (GAPS §1.6).
- [x] **(P1)** **Folio State Machine Clarification:** Define unambiguous terminal folio states (`open` -> `settled` -> `closed`); specify that check-out requires folio balance = 0 or city ledger transfer; closed folios reject any subsequent line postings; late charges require opening an incidental folio (GAPS §1.7).
- [x] **(P1)** **Night Audit Idempotency Constraint:** Add composite unique constraint `(tenant_id, branch_id, stay_id, business_date, charge_type)` on `folio_lines` to physically prevent duplicate room & tax postings during repeated or resumed audit runs (GAPS §1.8).
- [x] **(P1)** **Data Retention vs GDPR/Privacy Harmonization:** Reconcile NFR-008 (>= 7 years retention for tax and financial ledgers) with REQ-PLT-007 (guest right to erasure): implement pseudonymization strategy where guest PII in `guests` is anonymized while financial records in `folios` and `vouchers` retain immutable financial figures linked to anonymized IDs (GAPS §1.9).

### 0a.2 PCI DSS v4.0.1 Compliance Architecture & Scope Descoping (GAPS §7.5)
- [x] **(P0)** **PCI DSS v4.0.1 Scope Re-architecture:** Update `architecture.md` §8 to correct the compliance boundary:
  - **Online Booking Engine (Card-Not-Present):** Scope to **SAQ A** via hosted tokenization iframe / hosted fields (e.g., Stripe Elements, Adyen Drop-in); cardholder data never touches Innkeeper servers.
  - **Front Desk & POS Terminals (Card-Present):** Scope to **SAQ P2PE** (Point-to-Point Encryption) using PCI-validated P2PE payment terminals (or **SAQ B-IP** with standalone PTS-approved IP terminals); raw PAN is encrypted at the physical keypad/chip reader.
  - **Phone / MOTO Keyed Entry:** Scope to **SAQ C-VT** using processor-hosted virtual terminals; forbid entering raw card details into PMS custom fields.
  - Enforce zero storage of Primary Account Numbers (PAN), CVV/CVC, or magnetic stripe/chip track data across all databases, logs, and caches.

### 0a.3 Complete DDL Specifications for Undefined Tables (GAPS §2)
- [x] **(P0)** **Platform & IAM DDL:** Write production DDL conforming to RLS templates for: `tenants`, `users`, `memberships`, `roles` (permissions stored as `roles.permissions TEXT[]`), `membership_roles` (branch scope as `membership_roles.branch_scope UUID[]`), `sessions`, `subscriptions`, `usage_meters`, `feature_flags`.
- [x] **(P0)** **Configuration & Metadata DDL:** Write DDL for: `settings`, `custom_field_defs`, `status_transitions`, `numbering_sequences`, `amenities`, `buildings`, `floors`, `unit_status_log`.
- [x] **(P0)** **Guests & Company Accounts DDL:** Write DDL for: `guests`, `companies`, `guest_prefs`, `guest_consents`, `guest_identifications`, `guest_merge_log`.
- [x] **(P0)** **Rates & Pricing Engine DDL:** Write DDL for: `rate_plans`, `rate_calendar`, `restrictions`, `packages`, `taxes`, `tax_rules`, `charge_codes`.
- [x] **(P0)** **Operations & Front Desk DDL:** Write DDL for: `stays`, `room_moves`, `business_dates`, `night_audits`, `night_audit_steps`, `kpi_snapshots`.
- [x] **(P1)** **Housekeeping & Maintenance DDL:** Write DDL for: `hk_tasks`, `hk_checklists`, `maintenance_orders`, `lost_found`.
- [x] **(P1)** **Restaurant & POS DDL:** Write DDL for: `outlets`, `tables`, `menu_categories`, `menu_items`, `menu_item_prices`, `modifier_groups`, `modifiers`, `orders`, `order_lines`, `kots`, `kot_lines`, `bills`, `bill_lines`, `bill_payments`, `shifts`.
- [x] **(P1)** **Inventory & Purchasing DDL:** Write DDL for: `items`, `uoms`, `uom_conversions`, `warehouses`, `suppliers`, `purchase_orders`, `po_lines`, `grn`, `grn_lines`, `stock_counts`, `stock_count_lines`, `stock_adjustments`, `stock_transfers`, `recipes`, `recipe_lines`, `fifo_layers`.
- [x] **(P1)** **Accounting & Platform Infrastructure DDL:** Write DDL for: `gl_balances`, `recurring_vouchers`, `bank_reconciliations`, `bank_statements`, `attachments`, `audit_log` (partitioned), `outbox_events`, `inbox_events`, `idempotency_keys`, `webhooks`, `channel_maps`, `channel_sync_logs`, `payment_intents`.

### 0a.4 Missing Behavioral Specifications & State Machines (GAPS §3)
- [x] **(P1)** **Night Audit Resumable State Machine:** Document step checkpoints (`pending` -> `pre_checks` -> `room_tax_posting` -> `fee_posting` -> `date_roll` -> `gl_vouchering` -> `kpi_snapshot` -> `completed`), idempotent retry semantics per step, and automated failure alert and runbook dispatch.
- [x] **(P1)** **Background Lifecycle Workers:** Specify exact state transitions, trigger events, and cleanup jobs for: hold expiration, no-show automated marking, waitlist-to-booking promotion, room-move rate proration, late checkout fee calculation.
- [x] **(P1)** **Payment Lifecycle State Machine:** Define end-to-end flows for pre-authorization, capture, incremental authorization, refund, void, chargeback dispute logging, and payment token vaulting.
- [x] **(P1)** **Multi-Currency & Tax Engine Spec:** Define FX exchange rate sync cadence, realized/unrealized FX gain/loss voucher generation, line-item vs invoice-level tax rounding rules, compounding tax schedules, and service charge distribution bases.
- [x] **(P1)** **Guest Deduplication & Merge Engine:** Specify deduplication matching rules (normalized email, phone E.164, government ID hash) and transaction merge mechanics (re-pointing reservations, stays, folios, and audit history).

### 0a.5 Missing Frontend & UX Specifications (GAPS §5)
- [x] **(P1)** **Offline PWA Architecture:** Add service worker specification to `frontend.md` for Housekeeping attendant room updates and POS mobile ordering during network interruptions; define background sync queue with IndexedDB.
- [x] **(P1)** **Complete Auth Screen Suite:** Specify UX and validation flows for: Tenant Signup, Login, TOTP MFA challenge, Forgot/Reset Password, Employee Invitation Acceptance, Branch/Tenant Switcher, and Idle Session Timeout with PIN re-authentication dialog.
- [x] **(P1)** **Global Command Palette (Ctrl+K):** Document backend contract and keyboard interaction model for rapid search across rooms, guests, reservations, folios, vouchers, and settings.
- [x] **(P1)** **Print & PDF Engine Layouts:** Specify print CSS and server PDF template configuration for: Registration Cards, Guest Folios, Tax Invoices, Vouchers, and 80mm/58mm ESC/POS thermal slips for POS and KOTs.
- [x] **(P2)** **Timeline & Floor Plan Drag-and-Drop:** Define UI interaction rules for Timeline stay chart (drag to move/extend, collision detection, snap-to-date, proration confirmation modal) and graphical floor-plan view.

### 0a.6 Infrastructure, DevOps & Observability Specification (GAPS §6)
- [x] **(P2)** **Infrastructure as Code (IaC) & Deployment:** Add architecture chapter specifying Terraform/OpenTofu modules for PostgreSQL (HA primary + read replica), PgBouncer, S3-compatible object store, Redis, container runtime (Kubernetes/ECS), and DNS/WAF routing.
- [x] **(P2)** **Observability, Secrets & Partitioning:** Document OpenTelemetry collectors, Prometheus/Grafana RED metrics, Loki/Pino logging, Sentry error tracking, HashiCorp Vault/KMS secret management, and `pg_partman` automated table partition management.

### 0a.7 Industry Standards Integration (Hospitality Best Practices)
- [x] **(P1)** **USALI 12th Revised Edition Compliance:** Incorporate the Uniform System of Accounts for the Lodging Industry (USALI 12th Edition, effective Jan 1, 2026) into Chart of Accounts templates and departmental financial reporting (Rooms, F&B, Undistributed Operating Expenses, Energy/Water/Waste - EWW schedules).
- [x] **(P1)** **Channel Manager 2-Way ARI Synchronization:** Detail two-way ARI (Availability, Rates, Inventory) synchronization specs based on OpenTravel Alliance (OTA) / HTNG standards; define outbound push for inventory/rates/restrictions and inbound pull for bookings/modifications/cancellations with rate-parity guard.
- [x] **(P1)** **Hardware Integration Adapters (Door Locks & POS Printers):** Specify standard interfaces for keycard encoders via HTNG and FIAS (ASSA ABLOY / dormakaba / Onity / Salto), PBX call accounting via FIAS, and thermal receipt/kitchen printers via ESC/POS.
- [x] **(P1)** **Fiscalization & E-Invoicing Compliance:** Specify architecture for e-invoicing compliance (including Philippines BIR EIS JSON e-invoicing, CAS registration requirements, X/Z reading audit logs; and European Factur-X / PDF/A-3 hybrid e-invoicing).

**Phase 0a Exit Criteria:** All items in `GAPS.md` closed; zero cross-document contradictions remain across `architecture.md`, `specification.md`, and `frontend.md`; full DDL exists for all 63 referenced tables conforming to RLS leading-column rules; hospitality and PCI standards formalized.

---

## Phase 0 — Project Foundation (Week 1–2)

- [x] **(P0)** Monorepo setup with pnpm workspaces: `apps/api` (NestJS), `apps/worker` (pg-boss/outbox), `apps/web` (React 19 + Vite), `packages/contracts` (Zod schemas & API types), `packages/money` (decimal.js arithmetic), `packages/config-schemas` (JSON schemas for settings/custom fields), `db/` (SQL migrations & tests).
- [x] **(P0)** Tooling & code standards: TypeScript strict mode across all packages, Prettier, `.gitignore`, `.npmrc`, base tsconfig.
- [x] **(P0)** Local infrastructure on Windows PostgreSQL 18: configured database `innkeeper` and `innkeeper_test` on `localhost:5432` without Docker.
- [x] **(P0)** CI pipeline & test harness: unit tests across all packages, automated RLS leakage test suite against PostgreSQL, and production builds.
- [x] **(P0)** Forward-only, SQL-first migration runner (`db/src/migrate.ts`) with SHA-256 checksum tracking in `_migrations` and seed runner (`db/src/seed.ts`).
- [x] **(P0)** Database security roles setup: `innkeeper_owner` (DDL migrations), `innkeeper_app` (`NOBYPASSRLS`, operational runtime), `innkeeper_readonly` (`NOBYPASSRLS`, analytics).
- [x] **(P0)** Core backend kernel:
  - `RequestContext` backed by `AsyncLocalStorage` (`tenantId`, `branchId`, `userId`, `correlationId`, `timezone`, `locale`).
  - `DatabaseService`: manages transaction lifecycle, sets transaction-local `set_config('app.tenant_id', $1, true)` and `set_config('app.branch_ids', $2, true)`.
  - RFC 7807 `application/problem+json` error handler (`ProblemFilter`) with stable error codes and correlation tracking.
  - Global `ZodValidationPipe` for request payload validation.
- [x] **(P0)** `Idempotency-Key` interceptor (`IdempotencyInterceptor`) with payload SHA-256 hashing, conflict detection (422 `IDEMPOTENCY_CONFLICT`), and response caching.
- [x] **(P0)** Transactional Outbox pattern: `outbox_events` table + worker publisher (`apps/worker`) with exponential backoff and dead-letter queue.
- [x] **(P0)** Audit log infrastructure: partitioned `audit_log` table by month + `AuditService` capturing actor, tenant, branch, entity, diff, and correlation ID.
- [x] **(P0)** Observability foundation: `/health/live` and `/health/ready` endpoints verifying database connectivity as `innkeeper_app`.
- [x] **(P0)** Automated OpenAPI 3.1 generation from Zod contracts → interactive Swagger docs at `/api/docs`. (implemented via `@asteasolutions/zod-to-openapi` in `@innkeeper/contracts/openapi`, generated on API boot)
- [x] **(P0)** Frontend web shell foundation: Vite 6, Bootstrap 5.3 Sass configured with `$enable-dark-mode: false`, root `<html data-bs-theme="light">`, design tokens CSS, TanStack Query client, and Zustand store.
- [x] **(P0)** Automated CI theme guard: `scripts/ci-guard-theme.mjs` verifying strict light theme enforcement.
- [x] **(P0)** Documentation & skills: `CONTRIBUTING.md`, ADR template in `docs/adr/template.md`.

**Phase 0 Exit Criteria:** `pnpm build`, `pnpm test`, and `pnpm test:rls` pass with 100% green; migration runner initializes the database schema under `innkeeper_owner`; `innkeeper_app` role connects with `NOBYPASSRLS`; sample tenant table passes automated RLS leakage tests.

---

## Phase 1 — Tenancy, IAM, Configuration Engine (Week 3–5)

### Tenancy & Multi-Branch IAM (REQ-PLT-001…008)
- [x] **(P0)** Database tables and relations: `tenants`, `branches`, `users`, `memberships`, `roles` (permissions as `permissions TEXT[]`), `membership_roles` (branch scope as `branch_scope UUID[]`), `sessions`.
- [x] **(P0)** Migration helper `app.enable_tenant_rls(table_name)` applying `ENABLE` and `FORCE ROW LEVEL SECURITY`, with `USING` and `WITH CHECK` clauses, verified on all tenant tables.
- [x] **(P0)** **RLS Leakage Test Suite:** automated test asserting `innkeeper_app` has `NOBYPASSRLS`, dynamically iterating all `tenant_id`-bearing tables via `pg_class` to require `ENABLE`/`FORCE` RLS, verifying cross-tenant insert/update/delete rejection and unset-context fail-closed behavior on the sample table, plus cross-tenant read checks on seeded config tables.
- [x] **(P0)** Expanded the RLS leakage suite to execute cross-tenant read/update/delete/insert attempts against **every** `tenant_id`-bearing table (dynamically discovered via `pg_class`), materialising a Tenant B probe row where none exists, and statically asserting each table exposes a `tenant_isolation` policy with a `WITH CHECK` clause.
- [x] **(P0)** Tenant scoping via verified JWT access-token claims + membership lookup at login (access token 10 min) + rotating refresh token in `httpOnly; Secure (production); SameSite=Lax` cookie; bcrypt password hashing; double-submit CSRF protection on mutations.
- [ ] **(P2)** Tenant resolution by subdomain (`acme.innkeeper.app`).
- [x] **(P1)** Active branch switcher in top bar + `X-Branch-Id` header validation against user's permitted branch scope (`membership_roles.branch_scope`).
- [x] **(P1)** Role-Based Access Control (RBAC): permission registry (`<module>.<resource>.<action>`), role creation + listing, and operational limits (`max_discount_pct`, `max_void_amount`, `backdate_days`) stored on `roles.limits`.
- [x] **(P1)** Role update/delete endpoints and membership-role assignment (branch-scoped) endpoints: `PATCH/DELETE /roles/:id`, `GET /memberships`, `POST/DELETE /memberships/:membershipId/roles[/:roleId]` (all gated by `config.roles.manage`).
- [x] **(P1)** Manager override workflow: modal requiring manager PIN + reason string for actions exceeding agent limits, generating high-priority audit logs.
- [ ] **(P2)** Two-Factor Authentication (TOTP MFA) with per-role enforcement (mandatory for finance/admin roles), password reset flow, and employee email invitations.
- [ ] **(P2)** Tenant onboarding engine with template seeds (Hotel, Resort, Apartment-Rental, Restaurant) provisioning CoA, voucher types, statuses, charge codes, and default roles.
- [ ] **(P2)** Platform Administration portal: tenant directory, subscription tier management, feature flag toggles, and audited tenant impersonation sessions.
- [ ] **(P3)** Enterprise Single Sign-On (SSO) integration via OIDC / SAML 2.0.

### Configuration Engine (REQ-CFG-001…018)
- [x] **(P0)** Hierarchical Settings resolution `user → outlet → branch → tenant → default`, in-memory cache (60s TTL) invalidated on `config.changed` outbox events, with audit logging; `SettingDefinition` (incl. `schema` field) type provided in `@innkeeper/config-schemas`.
- [x] **(P0)** Code-owned settings registry (`SETTINGS_REGISTRY` in `@innkeeper/config-schemas`) wiring concrete Zod value schemas + allowed scopes into `PUT /settings/:key` write validation (unknown keys rejected, values schema-checked) and exposed via `GET /settings/registry`; the registry is gated by `config.settings.update`.
- [x] **(P0)** Unit status definitions (`status_defs`) + allowed transitions (`status_transitions`) with system behavior flags (`is_sellable`, `is_occupied`, `is_dirty`, `blocks_booking`); full CRUD via `POST/PATCH/DELETE /ui/status-defs`, `/ui/status-transitions` (gated by `config.status.modify`; system statuses protected from deletion).
- [x] **(P0)** Server-driven Action Definitions (`action_defs`) + `GET /ui/actions?entity=&id=` endpoint evaluating `visible_when`, user permissions, and module feature flags; CRUD via `POST/PATCH/DELETE /ui/actions` (gated by `config.action.modify`).
- [x] **(P1)** Custom field definitions (`custom_field_defs`) contract (key, type, required, options, validation metadata, list/print flags) in `@innkeeper/config-schemas`, persisted per tenant; CRUD via `POST/PATCH/DELETE /ui/custom-fields` (gated by `config.customfield.modify`).
- [x] **(P1)** Compile `custom_field_defs` into per-entity Zod validators applied to entity `attrs jsonb` on write — `buildCustomFieldsSchema`/`validateCustomFieldValues` are wired through `UiService.validateEntityAttrs` into `guests.createGuest`, `properties.createUnit`, and `reservations.createReservation` (the entities that expose an `attrs` payload on their write DTO). `items` and `vouchers` carry no `attrs` column or DTO field, so there is nothing to validate for them yet; their rows remain non-attributed.
- [x] **(P1)** Gapless numbering sequences service (`numbering_sequences`) with row-level locks for official fiscal documents, and cached sequences for non-legal documents.
- [x] **(P1)** Server-driven navigation endpoint (`GET /ui/navigation`) returning a permission-filtered sidebar tree.
- [x] **(P1)** Persisted, tenant-configurable navigation: `navigation_configs` table (RLS-enabled, unique per `(tenant_id, role_code)`; empty `role_code` = tenant default) with `GET/PUT/DELETE /ui/navigation/configs` (gated by `config.navigation.modify`). `GET /ui/navigation` now resolves the effective tree as role override ▸ tenant default ▸ built-in `DEFAULT_NAVIGATION_TREE`, then permission-filters it; editable from the Settings Definitions Manager (role-scoped JSON tree editor).
- [ ] **(P2)** Tenant branding: logo upload, light-palette primary brand color with automated WCAG 4.5:1 text contrast validator, and invoice print headers/footers.
- [ ] **(P2)** Configuration audit history with visual diff viewer and reset-to-parent-scope action.
- [x] **(P1)** Web: Settings view with Tenant ▸ Branch scope switcher, inheritance indicator, live room-status token preview (read-only), server-evaluated action list, and gapless numbering sequence tester.
- [x] **(P1)** Schema-driven Settings UI: setting fields rendered from `GET /settings/registry` (control type, allowed scopes, defaults) with save via `PUT /settings/:key`; editable status/action/custom-field definitions via a Definitions Manager (list/create/delete) backed by the `/ui/*` write endpoints.
- [ ] **(P2)** Settings UI: expose Outlet/User scope editing and inheritance reset-to-parent-scope controls (currently a Tenant ▸ Branch scope switcher only).

**Phase 1 Exit Criteria:** Two distinct seeded tenants; administrator of Tenant A cannot query, view, or modify Tenant B data via any API or direct DB path. _(Status: status/action/custom-field write endpoints and the schema-driven Settings editor are delivered; end-to-end runtime propagation verification still pending a DB-backed environment.)_

---

## Phase 2 — Properties & the Rooms Board (Week 6–8)

- [x] **(P1)** Property structure tables: `property_types`, `buildings`, `floors`, `unit_types`, `units`, `unit_status_log`, `amenities` (REQ-PRP-001…004).
- [x] **(P1)** Unit management: unit CRUD, bulk creation by pattern (e.g., Floor 3, Rooms 301–320), type attribute inheritance, and connecting room links (REQ-PRP-007).
- [x] **(P1)** Status transition endpoint enforcing allowed transitions, recording user, timestamp, and optional reason to `unit_status_log` (REQ-PRP-005).
- [x] **(P1)** Out-of-Order (OOO) and Out-of-Service (OOS) blocking engine with date ranges, reason tracking, and automated release upon expiration (REQ-PRP-006).
- [x] **(P1)** Compact Board read model endpoint (`GET /branches/:b/board`) with ETag support, summary counters strip, and floor grouping.
- [x] **(P1)** Real-time updates via Server-Sent Events (`GET /api/v1/events`): outbox publisher streaming `unit.status_changed` and `config.changed` events to connected clients.
- [x] **(P1)** Web: `<UnitTile>` component featuring status background token, accent bar, bold unit number, type code, status badge (icon + label, never color alone), context line, and VIP/DND/alert corner flags.
- [x] **(P1)** Web: `<ActionMenu>` component (popover on desktop, bottom offcanvas on mobile), prefetching actions on hover, dispatching to modals, offcanvas drawers, or routes.
- [x] **(P1)** Web: `<BoardGrid>` layout with floor grouping, density toggles (Compact, Comfortable, Large), quick search filter, and interactive legend-as-filter.
- [x] **(P1)** Web: Keyboard accessibility navigation (roving tabindex across grid tiles, `Enter`/`Space` to open action menu, `/` for search, `Esc` to close).
- [x] **(P1)** Web: PWA service worker offline caching for the board shell, providing graceful offline notifications.
- [x] **(P2)** Unit List view with sorting, column chooser, CSV export, and saved filter presets.
- [x] **(P2)** Unit detail drawer: specifications, photos gallery, maintenance history, and operational notes.
- [ ] **(P2)** Long-stay / apartment property rental support (recurring monthly billing schedules) (REQ-PRP-008).
- [ ] **(P3)** Drag-and-drop graphical floor plan editor for visual room positioning.

**Phase 2 Exit Criteria:** Rooms board renders 500 units in under 1.5 seconds; tile click displays server-evaluated action menu that reflects status and user permissions; status change in one browser window immediately updates other active sessions via SSE without full page reload.

---

## Phase 3 — Rates, Guests, Reservations, Availability (Week 9–12)

- [x] **(P0)** Database concurrency controls: `btree_gist` extension, `reservation_units` **exclusion constraint** (`EXCLUDE USING gist (unit_id WITH =, daterange(check_in, check_out, '[)') WITH &&)`), and `room_type_inventory` capacity `CHECK (sold <= capacity + overbook_allowance)` (REQ-RSV-003/004).
- [x] **(P0)** **Concurrency load test:** 100 parallel booking requests competing for the single remaining available unit results in exactly 1 successful reservation and 99 `409 ROOM_NOT_AVAILABLE` responses, with zero overlapping rows in the database.
- [x] **(P1)** Guest & Company profile management: deduplication engine (email, phone, ID number), manual merge tool with historical reference re-linking, consent tracking (GDPR/privacy), and custom attributes.
- [x] **(P1)** Rates engine: rate plans, seasonal rate calendar, restrictions (min/max LOS, closed to arrival/departure, stop-sell), package addons, and extra guest surcharges (REQ-RSV-007).
- [x] **(P1)** Tax & service charge calculation engine: inclusive vs exclusive taxes, compounding rules, charge code mappings, and real-time nightly price quote API.
- [x] **(P1)** Reservation policies: deposit rules, cancellation penalty schedules, and no-show fee policies snapshotted onto `reservations.policy_snapshot` at booking time (REQ-RSV-008).
- [x] **(P1)** Availability search and booking lifecycle: create, modify (with price difference preview), cancel, and mark no-show, executing atomic inventory counter updates (REQ-RSV-001/002/005/006).
- [x] **(P1)** Temporary booking holds with automated expiration and counter release worker job (REQ-RSV-005).
- [x] **(P1)** Idempotent reservation booking endpoint requiring `Idempotency-Key` header.
- [x] **(P1)** Web: Availability search bar, multi-step Reservation Wizard (dates → room & rate → guest details → deposit/payment → confirmation), and reservation management details view.
- [x] **(P1)** Web: Walk-in quick booking modal accessible in ≤ 3 clicks directly from a vacant board tile (REQ-RSV-014).
- [x] **(P2)** Timeline stay chart view on the board: multi-day room grid with reservation bars, drag-to-move room assignment, drag-to-extend dates, and double-click to book.
- [x] **(P2)** Group bookings & room block management: master folio setup, rooming list import, cut-off date tracking, and block release automation (REQ-RSV-009).
- [x] **(P2)** Waitlist and non-binding quotations with one-click conversion to confirmed reservation (REQ-RSV-010).
- [x] **(P2)** Public Booking Engine API: scoped API key authentication for headless direct booking widgets (REQ-RSV-015).
- [x] **(P2)** Channel Manager 2-Way ARI Adapter: OpenTravel/HTNG compliant integration pushing real-time Availability, Rates, and Inventory to OTAs, and pulling inbound OTA reservations/cancellations with rate-parity guard.

**Phase 3 Exit Criteria:** Front desk agent can search, quote, and create single or group reservations from board or wizard; race conditions under concurrent load never result in double-booking; quote displays transparent nightly rate and tax breakdown; reservation modifications update inventory atomically.

---

## Phase 4 — Front Desk, Folio, Housekeeping & Operations (Week 13–16)

- [x] **(P1)** Front desk operational models: `stays`, `folios`, append-only `folio_lines` (reversals via trigger), charge codes, and payments (REQ-RSV-011/012).
- [x] **(P1)** Check-in wizard: guest identity verification, digital registration card generation, payment pre-authorization token capture, unit assignment validation (`requireCleanRoom` policy check), and keycard issue trigger.
- [x] **(P1)** Folio Workspace UI:
  - Multi-window split billing (Window 1: Room & Tax / Company; Window 2: Personal Incidentals; Windows 3 & 4).
  - Post charge, record payment, void charge (with reversal line linking `reverses_line_id` and audit trail).
  - Folio transfer (line-to-line transfer between folios/windows) and balance settlement.
- [x] **(P1)** Check-out wizard: outstanding balance verification, settlement via tender or transfer to City Ledger (AR), invoice generation, late checkout fee calculation, and automated room status change to `vacant_dirty` with housekeeping task creation.
- [x] **(P1)** Room move and stay extension workflows with automated rate adjustment and folio re-pricing options.
- [x] **(P1)** Branch business date & **Night Audit State Machine**:
  - Resumable, step-checkpointed state machine (`pending` -> `pre_checks` -> `room_tax_posting` -> `fee_posting` -> `date_roll` -> `gl_vouchering` -> `kpi_snapshot` -> `completed`).
  - Unique constraint `(tenant_id, branch_id, stay_id, business_date, charge_type)` on `folio_lines` ensuring idempotency.
  - Generates balanced GL vouchers and captures night audit KPI statistical snapshot (REQ-RSV-013 / §6.4).
- [x] **(P1)** Housekeeping management:
  - Automated task generation triggered by check-out, stayover service, and room status changes.
  - Mobile attendant view (phone-first layout) with room assignment, start/finish cleaning timers, checklists, and linen change cycles.
  - Attendant mobile minibar inspection entry posting charges directly to guest folio and creating restocking requests in inventory.
  - Supervisor inspection workflow with accept/reject transitions.
- [x] **(P1)** PCI DSS v4.0.1 compliant payment integration:
  - Hosted tokenization iframe/modal simulation for web payments (SAQ A).
  - Card-present payment terminal integration via tokenized flow.
  - Secure tokenized deposits, pre-authorizations, captures, and refunds; zero raw PAN/CVV storage.
- [x] **(P2)** Maintenance order management linked to OOO/OOS blocks; Lost & Found registry with photo attachments.
- [x] **(P2)** Document generation engine: server-rendered digital agreements and ledger prints for Registration Cards, Folio Statements, and Invoices.
- [ ] **(P2)** Guest communication engine: automated email and SMS reservation confirmations, pre-arrival notices, and folio receipts.
- [x] **(P2)** Hardware integration adapters:
  - Keycard door lock encoder integration via simulated HTNG/FIAS protocols (ASSA ABLOY / dormakaba / Onity / Salto).
  - PBX telephone system integration via FIAS (call charge posting to folio, room status dial-in codes).
- [ ] **(P2)** Fiscalization & E-Invoicing engine:
  - Structured e-invoicing export (BIR EIS JSON reporting for Philippines, Factur-X / PDF/A-3 hybrid for Europe).
  - Fiscal audit trails, shift X-readings, and daily Z-readings.

**Phase 4 Exit Criteria:** Complete end-to-end guest journey operates seamlessly from board: reservation → check-in → keycard issuance → incidental folio charges → room move → check-out → invoice settlement; night audit automatically posts room charges, rolls business date, and balances GL; housekeeping completes mobile cleaning loop back to `vacant_clean`.

---

## Phase 5 — Accounting with Vouchering (Week 17–21)

- [x] **(P0)** Chart of Accounts (CoA): hierarchical tree, account types (Asset, Liability, Equity, Income, Expense), normal balance sides (Debit/Credit), control account flags; pre-seeded **USALI 12th Revised Edition** standard hotel CoA templates (REQ-ACC-002).
- [x] **(P0)** Fiscal calendar management: fiscal years and fiscal periods (`open`, `soft_closed`, `closed`) with **period-lock database trigger** blocking any ledger insert into closed periods (REQ-ACC-008).
- [x] **(P0)** Double-entry database invariants:
  - `vouchers`, `voucher_lines`, `gl_entries` schema.
  - **Ledger immutability trigger** on `gl_entries` preventing `UPDATE` and `DELETE`.
  - **Deferred constraint trigger** `assert_voucher_balanced()` enforcing `Σdebit = Σcredit` at transaction `COMMIT` (REQ-ACC-001/007).
- [x] **(P0)** Database invariant test suite: verify unbalanced voucher fails at COMMIT; verify UPDATE/DELETE on `gl_entries` raises exception; verify closed period rejects postings.
- [x] **(P0)** `PostingService` and `posting_rules` engine: resolves matching rules for operational events (folio charges, settlements, inventory movements, POS sales) and builds balanced vouchers within the caller's database transaction (REQ-ACC-011).
- [x] **(P1)** Voucher types: Journal (JV), Receipt (RV), Payment (PV), Contra (CV), Sales (SV), Purchase (PB), Debit/Credit Notes, and Opening Balances with gapless numbering assigned under row lock upon posting (REQ-ACC-003/006).
- [x] **(P1)** Voucher lifecycle & governance: `draft → submitted → approved → posted`; approval workflows based on amount/type; segregation of duties (creator cannot approve); reversal vouchers (`reversal_of`) for corrections (REQ-ACC-004/005).
- [x] **(P1)** Integration wiring: operational events generate balanced vouchers:
  - Night audit room charges (Guest Ledger Dr / Room Revenue & Taxes Cr).
  - Advance deposits (Cash Dr / Customer Deposits Cr).
  - Folio checkout settlement (Cash/Bank Dr / Guest Ledger Cr).
  - City Ledger transfer (City Ledger AR Dr / Guest Ledger Cr).
- [x] **(P1)** Core financial reporting: Trial Balance, General Ledger, Account Statement, Day Book, Cash Book, Bank Book with drill-through navigation from entry to voucher to source document (REQ-ACC-015).
- [x] **(P1)** Web: **Voucher Editor** featuring keyboard-first lines grid, account typeahead, dimension chips, live balance status bar (Σ Dr, Σ Cr, difference), status stepper, and reversal action.
- [x] **(P2)** Sub-ledgers & control account reconciliation: Guest Ledger, City Ledger (AR), Accounts Payable (AP), and Inventory sub-ledgers with automated variance detection (REQ-ACC-013).
- [x] **(P2)** Financial statements: USALI-compliant departmental P&L (Rooms, F&B, Undistributed Operating Expenses), Balance Sheet, Statement of Cash Flows, and AR/AP Ageing reports.
- [x] **(P2)** Multi-currency accounting: transaction amounts, exchange rates, base currency ledger entries, and automated unrealized/realized FX revaluation vouchers (REQ-ACC-010).
- [x] **(P2)** Fiscal year-end closing routine: closing entries moving revenue/expense balances to retained earnings, and automated balance carry-forward (REQ-ACC-016).
- [x] **(P2)** Voucher file attachments and printable voucher PDFs from configurable templates (REQ-ACC-012); recurring voucher schedules (REQ-ACC-017).
- [x] **(P3)** Bank reconciliation module: statement import (OFX/CSV), automatic transaction matching, and discrepancy adjustment vouchers (REQ-ACC-014).
- [x] **(P3)** Inter-branch due-to/due-from automated clearing vouchers and consolidated multi-branch reporting (REQ-ACC-018); accounting export to external ERPs (SAP/QuickBooks/Xero).

**Phase 5 Exit Criteria:** Every operational transaction produces a balanced, gapless-numbered, posted voucher; trial balance is always in equilibrium; period soft-close and hard-close enforce immutability; financial reports match sub-ledger control accounts to the cent.

---

## Phase 6 — Inventory & Purchasing (Week 22–25)

- [x] **(P1)** Master data: Item catalog, categories, base UoMs, purchase/issue UoM conversions, storage warehouses per branch, and preferred suppliers (REQ-INV-001/002).
- [x] **(P0)** Inventory ledger architecture: append-only `stock_ledger` recording quantity and value deltas; `stock_balances(tenant_id, warehouse_id, item_id)` cache with `SELECT … FOR UPDATE` row locks serializing concurrent movements (REQ-INV-004/007).
- [x] **(P1)** Weighted Average Cost (WAC) engine: mathematical unit tests verifying valuation formulas (`new_rate = (old_value + in_value) / (old_qty + in_qty)`) and stock issue valuation (REQ-INV-005).
- [x] **(P1)** Procurement lifecycle: Purchase Order → **Goods Receipt Note (GRN)** → Supplier Bill; automated voucher postings via `PostingService` (Inventory Dr / GRNI Cr at receipt; GRNI Dr / AP Cr at bill) (REQ-INV-003).
- [x] **(P1)** Internal stock operations: department issues/requisitions, inter-warehouse transfers, inter-branch in-transit transfers, inventory adjustments, and waste/spoilage tracking.
- [x] **(P1)** Negative stock control: warehouse policy configuration (Block, Warn, Allow) with last-known-cost evaluation (REQ-INV-006).
- [x] **(P1)** Web: Items catalog, Stock on Hand dashboard, GRN entry, Material Issue, Stock Transfer, and Adjustment screens.
- [x] **(P2)** Stock count audit workflow: inventory freeze snapshot, mobile barcode count entry, variance calculation against snapshot, manager approval, and automated adjustment voucher generation (REQ-INV-008).
- [x] **(P2)** Automated reorder alerts, minimum stock warnings, and batch/expiration date tracking for perishable goods (REQ-INV-009).
- [x] **(P2)** Housekeeping & Minibar replenishment workflows: automated stock issue generation from mobile housekeeping minibar postings and room cleaning consumption.
- [x] **(P2)** Inventory valuation report reconciled in real time to the GL Inventory control account (REQ-INV-010).
- [x] **(P3)** FIFO inventory layer tracking per item category; supplier price history analytics.

**Phase 6 Exit Criteria:** Physical stock valuation perfectly reconciles to the GL inventory asset account; concurrent stock issues never corrupt balance or valuation rate; GRN immediately updates inventory balances and posts balanced accounting vouchers.

---

## Phase 7 — Restaurant / F&B POS (Week 26–30)

- [x] **(P1)** Outlets management: dining outlets, floor plans, table layouts, operating hours, and cash shift tracking (REQ-FNB-001/010).
- [x] **(P1)** Menu engineering: categories, items, variant sizes, modifier groups, combos, time-based pricing (Happy Hour), 86'd availability toggle, and kitchen station routing (REQ-FNB-002).
- [x] **(P1)** Recipe management (Bill of Materials - BOM): menu item ingredient recipes with yield and waste percentages, theoretical cost calculations, and food cost margin analysis (REQ-FNB-008).
- [x] **(P1)** Order lifecycle & Kitchen Display System (KDS):
  - Order entry, hold, course firing, and table transfers/merges (REQ-FNB-004).
  - Kitchen Order Ticket (KOT) routing by station (Grill, Bar, Pastry).
  - Void handling: pre-fire void vs post-fire void (requires permission, reason, void KOT issuance, and automatic waste logging) (REQ-FNB-005).
- [x] **(P1)** Billing & settlement engine:
  - Split billing (by seat, by item, or by equal amounts).
  - Discounts (controlled by user permission limits), service charge, tax calculations, and tip handling.
  - Multiple tenders: cash, card (P2PE terminal), QR, and **Room Charge** (REQ-FNB-006).
- [x] **(P1)** **Room Charge Transaction:** validates in-house guest status (room number + guest name match), posts charge line to guest stay folio, and completes POS bill atomically (REQ-FNB-007).
- [x] **(P1)** Automated inventory depletion & accounting posting:
  - Explodes recipes to deplete raw ingredients from outlet kitchen warehouse at WAC (configurable: at fire or at settle).
  - Invokes `PostingService` in same transaction: posts revenue voucher and COGS voucher (COGS Dr / Food Inventory Cr) (REQ-FNB-009).
- [x] **(P1)** Web: **Table Board UI** (status-colored tiles matching room board pattern: Free, Seated, Ordered, Billed, Dirty), high-speed touch Order Screen, and Bill Settlement Modal.
- [x] **(P2)** Shift management & cash reconciliation: open/close shift with starting float, cash drops, X/Z reading reports, and cash over/short voucher generation.
- [x] **(P2)** F&B operational reports: sales mix by item/category/server, void & discount audits, theoretical vs actual food cost variance, and menu engineering quadrant analysis (REQ-FNB-011).
- [x] **(P2)** Hardware printer integration: ESC/POS network thermal printer gateway for kitchen KOTs and guest bill slips.
- [x] **(P3)** Offline-tolerant POS order queueing with local IndexedDB storage and automatic sync upon network recovery (REQ-FNB-012); QR code guest table ordering.

**Phase 7 Exit Criteria:** Table order → kitchen KOT → bill settlement → room charge → inventory depletion → accounting revenue/COGS vouchers all execute in one atomic transaction; network or business failure leaves no orphaned data; shift close generates accurate cash reconciliation vouchers. [VERIFIED & TESTED]

---

## Phase 8 — Hardening, Observability, Compliance & Launch (Week 31–34)

- [x] **(P1)** Executive & operational dashboards: real-time KPI cards (Occupancy %, ADR, RevPAR, TrevPAR, Total Revenue, F&B Covers, Outstanding Balances), night audit alert banners, and role-based widget customization.
- [x] **(P1)** Front-office reporting pack: Daily Flash Report, In-House Guest List, Arrivals/Departures, Room Status Summary, and Night Audit Statistical Pack.
- [x] **(P2)** Asynchronous report generation engine: background worker execution for heavy reports (returns 202 Accepted + progress notifications), with streaming export to CSV, XLSX, and PDF.
- [x] **(P2)** Performance optimization: PostgreSQL read-replica query routing for reporting, partial index optimization based on `pg_stat_statements`, and client-side virtualized rendering.
- [x] **(P2)** Load & stress testing (k6): 500-unit room board loads in < 1.5 seconds under 100 concurrent active users per tenant; API endpoints sustain p95 read < 300 ms and p95 write < 600 ms.
- [x] **(P2)** Comprehensive security audit:
  - OWASP Top 10 and ASVS Level 2 verification.
  - Automated OWASP ZAP dynamic application security scan.
  - Dependency vulnerability scan (pnpm audit) and container image scan (Trivy).
  - Strict Content Security Policy (CSP), CORS, and rate-limiting validation.
- [x] **(P2)** Disaster Recovery & Business Continuity:
  - Point-in-Time Recovery (PITR) drill verifying RPO ≤ 5 minutes and RTO ≤ 1 hour.
  - Night audit failure disaster recovery runbook and automated emergency rollback tooling.
- [x] **(P2)** Privacy & Data Governance:
  - GDPR and local privacy act (e.g., Philippines DPA) compliance: automated personal data export and pseudonymized erasure workflows.
  - Configurable data retention policies for audit logs (>= 7 years) and guest profile history.
- [x] **(P2)** Accessibility & UI audit: automated axe-core CI integration and screen reader verification (WCAG 2.2 AA) across the Rooms Board, Reservation Wizard, Voucher Editor, and POS.
- [x] **(P3)** SaaS billing & tenant quotas: per-tenant unit/branch quotas, Stripe subscription billing integration, and automated tenant plan metering.
- [x] **(P3)** Silo/bridge dedicated database router proof-of-concept for large enterprise tenants.

**Phase 8 Exit Criteria:** All performance SLOs verified under simulated load; security and accessibility sign-offs complete; disaster recovery restore drill executed successfully; production runbooks approved; pilot property onboarding checklist ready.

---

## Cross-Cutting Backlog (Continuous Invariants)

- [ ] **RLS Enforcement:** Every newly introduced tenant table must include `tenant_id`, implement `app.enable_tenant_rls()`, and be registered in the CI RLS leakage test suite (CI fails otherwise).
- [ ] **Financial & Inventory Atomicity:** Every mutating money or inventory endpoint must enforce `Idempotency-Key`, emit audit logs, record transactional outbox events, and execute atomically.
- [ ] **Configuration Integrity:** Every new configurable entity must register a code-owned Zod schema in the Settings Registry, support hierarchical scope resolution, and snapshot critical historic values.
- [ ] **Server-Driven UI:** Every new interactive button must register in `action_defs` with permission checks and `visible_when` conditions; client components must never hard-code authorization.
- [ ] **Design System Fidelity:** All web screens must strictly adhere to the light theme, utilize defined CSS design tokens, maintain ≥ 4.5:1 text contrast, and use tabular numerals for monetary figures.
- [ ] **Traceability:** Every pull request must reference its corresponding `REQ-…` requirement ID and update `specification.md`, `architecture.md`, `frontend.md`, and `todo.md`.

---

## Open Questions & Decisions Matrix

| # | Question / Strategic Decision | Needed By | Recommendation / Decision Status |
|---|---|---|---|
| 1 | **Target Launch Geographies & Fiscal Compliance** | Phase 0 | **Decided:** Target Southeast Asia (Philippines - BIR EIS JSON / CAS compliant) and Europe (Factur-X / PDF/A-3 compliant) first. Tax engine supports both VAT and service charges with configurable line/document rounding. |
| 2 | **Payment Terminal Hardware Architecture** | Phase 0 | **Decided:** Standardize on PCI-validated P2PE smart terminals (Stripe Terminal / Adyen / PAX) to achieve SAQ P2PE descoping. Forbid manual raw PAN entry in PMS. |
| 3 | **Door Lock & Hardware Interfacing** | Phase 4 | **Decided:** Implement adapter service supporting HTNG Web Services and Oracle FIAS TCP protocols for ASSA ABLOY (Vostio), dormakaba (Ambiance), and Onity encoders. |
| 4 | **Channel Manager Integration Partner** | Phase 3 | **Decided:** Build pluggable adapter matching OpenTravel 2-way ARI specifications; pilot integration with Channex / SiteMinder for OTA distribution. |
| 5 | **POS Offline Tolerance Strategy** | Phase 7 | **Decided:** Web POS includes service worker and IndexedDB offline order buffer for temporary local network drops (< 30 min); syncs idempotently upon reconnection. |
| 6 | **External ERP Export Requirements** | Phase 5 | **Decided:** Provide USALI-compliant standard Journal Export (CSV / JSON) compatible with SAP, NetSuite, QuickBooks, and Xero in addition to native vouchering. |
| 7 | **Hosting & Data Residency Constraints** | Phase 0 | **Decided:** Deploy multi-region capable container cluster (AWS / GCP) with tenant data residency pinning via `TenantDbRouter` for regulated jurisdictions. |

---

## Milestones Summary

| Milestone | Target Phases | Core Deliverables & Business Capabilities |
|---|---|---|
| **M0 — Spec & Arch Hardening** | Phase 0a | Zero doc conflicts, complete DDL for all 63 tables, PCI v4.0.1 and USALI 12th Edition compliance formalized. |
| **M1 — Walking Skeleton** | Phase 0 – 2 | Multi-tenant auth, Kysely kernel, live Rooms Board with status tiles, SSE updates, and server-driven action menus. |
| **M2 — Bookable Engine** | Phase 3 | Availability search, rates & restrictions, exclusion constraint double-booking prevention, and reservation wizard. |
| **M3 — Operable Hotel** | Phase 4 | Check-in/out, multi-window split folios, resumable night audit, mobile housekeeping, and P2PE card terminal payments. |
| **M4 — Auditable Ledger** | Phase 5 | USALI 12th Edition double-entry vouchering, immutable ledger, deferred balance triggers, and period closing controls. |
| **M5 — Complete Enterprise Suite** | Phase 6 – 7 | WAC inventory with GRN posting, and restaurant POS with recipes, table board, KDS, and atomic room charges. |
| **M6 — Production Launch** | Phase 8 | Hardened, load-tested (k6), accessibility certified (WCAG 2.2 AA), disaster-recovery proven, and customer-ready. |
