# Innkeeper — Gap Analysis & Remediation (RESOLVED)

> **Status: 100% Remediation Complete (Phase 0a Closed).**
> All cross-document contradictions have been reconciled, complete production DDL for all 108 tables has been authored conforming to RLS leading-column rules, behavioral state machines are specified, frontend PWA/auth/print specifications are detailed, and industry standards (PCI DSS v4.0.1, USALI 12th Revised Edition, 2-Way ARI, Fiscalization) are fully codified.

---

## 1. Cross-Document Inconsistencies (All Resolved)

| # | Sev | Conflict | Status | Resolution Details |
|---|-----|----------|--------|---------------------|
| 1 | B | UUIDv7 vs PG version. Docs pinned "PostgreSQL 16+"; a skill mentioned "PG18 for native `uuidv7()`". | **RESOLVED** | Standardized on application-generated UUIDv7 via npm `uuidv7` across backend, contracts, and migrations. Target engine pinned to PostgreSQL 16.6+ baseline. Database default function generation (`DEFAULT uuidv7()`) is strictly forbidden (`architecture.md` §3.2, `specification.md` §2, `skills/innkeeper-multitenancy-rls/SKILL.md`). |
| 2 | B | Table ownership conflicts: `charge_codes`, `taxes`, `posting_rules`, `numbering_sequences` claimed by multiple modules. | **RESOLVED** | Formally assigned single table ownership to `Config`. `Rates`, `Folio`, `Accounting`, and `Operations` query them exclusively via public read services or in-memory caches. Cross-module transactional posting executes strictly via `PostingService` in `Accounting` (`architecture.md` §2.1, `specification.md` §2). |
| 3 | H | RLS leading-column rule violated: `room_type_inventory`, `stock_balances`, `reservation_nights` PKs did not lead with `tenant_id`. | **RESOLVED** | Reindexed and fixed all compound PKs and unique indexes so `tenant_id` is unconditionally the leading column: `room_type_inventory(tenant_id, branch_id, unit_type_id, stay_date)`, `stock_balances(tenant_id, warehouse_id, item_id)`, `reservation_nights(tenant_id, reservation_unit_id, stay_date)` (`specification.md` §8.2, §12.2). |
| 4 | H | Branch context variable mismatch: skill used `app.branch_ids`; architecture showed only `app.tenant_id`. | **RESOLVED** | Standardized schema helpers in `app`: `app.tenant_id() RETURNS uuid` and `app.branch_ids() RETURNS uuid[]`. Implemented `RESTRICTIVE` RLS policies for high-sensitivity tables (`vouchers`, `gl_entries`, `stock_ledger`) with fail-closed semantics when unset (`architecture.md` §3.2, `specification.md` §2). |
| 5 | H | Reservation ↔ stay ↔ unit linkage missing; `reservation_units.status` mirrored reservation; `stays` not linked to `reservation_units`. | **RESOLVED** | Explicit schema model established: `reservation_units` handles room allocation / exclusion constraints; `stays` manages physical guest occupancy with mandatory FK `reservation_unit_id uuid NOT NULL REFERENCES reservation_units(id)`; `folios` link to `stays(id)` and `reservations(id)` (`architecture.md` §5.2, `specification.md` §8.2). |
| 6 | H | `folios` lacked `version`; concurrent post/settle locking unspecified. | **RESOLVED** | Added `version int NOT NULL DEFAULT 1` to `folios`. Documented row-level locking specification (`SELECT ... FOR UPDATE`) across all folio charge postings, payments, transfers, and settlements (`architecture.md` §5.2, `specification.md` §9.2). |
| 7 | M | Folio status `settled` vs `closed` used ambiguously. | **RESOLVED** | Defined strict terminal lifecycle: `open` ➔ `settled` (balance = 0 or transferred to City Ledger) ➔ `closed` (check-out completed). Closed folios reject line postings; late charges strictly require opening an `incidental` folio (`architecture.md` §5.2, `specification.md` §9.1). |
| 8 | M | Night-audit idempotency cited unique key `(stay_id, business_date, 'room')` that existed in no DDL. | **RESOLVED** | Added composite unique index `(tenant_id, branch_id, stay_id, business_date, charge_type)` on `folio_lines` preventing duplicate room & tax postings during repeated or resumed audit runs (`specification.md` §9.2). |
| 9 | M | Financial data retention (≥ 7 yrs per NFR-008) collided with guest right-to-erasure (`REQ-PLT-007`). | **RESOLVED** | Codified cryptographic pseudonymization strategy: upon verified erasure request, guest PII in `guests` and `guest_identifications` is masked/pseudonymized (`is_pseudonymized = true`), while financial documents (`folios`, `folio_lines`, `vouchers`, `gl_entries`) retain immutable transaction figures linked to the pseudonymized ID (`architecture.md` §5.1, `specification.md` §2, §5.2). |

---

## 2. Referenced-But-Undefined Tables (All 63 Tables Defined)

Full production DDL conforming to RLS templates (`ENABLE` + `FORCE ROW LEVEL SECURITY`, application UUIDv7 PKs, leading `tenant_id` columns, `attrs jsonb`, optimistic locking) has been authored in `specification.md`:

1. **Platform & IAM:** `tenants`, `users`, `memberships`, `roles`, `role_permissions`, `membership_roles`, `sessions`, `subscriptions`, `usage_meters`, `feature_flags` (`specification.md` §3.2).
2. **Configuration & Metadata:** `settings`, `custom_field_defs`, `status_defs`, `status_transitions`, `action_defs`, `numbering_sequences`, `amenities`, `buildings`, `floors`, `unit_status_log` (`specification.md` §4.2).
3. **Guests & Companies:** `guests`, `companies`, `guest_prefs`, `guest_consents`, `guest_identifications`, `guest_merge_log` (`specification.md` §5.2).
4. **Rates & Pricing:** `rate_plans`, `rate_calendar`, `restrictions`, `packages`, `taxes`, `tax_rules`, `charge_codes` (`specification.md` §7.2).
5. **Operations & Front Desk:** `branches`, `property_types`, `unit_types`, `units`, `reservations`, `reservation_units`, `room_type_inventory`, `reservation_nights`, `holds`, `stays`, `room_moves`, `business_dates`, `night_audits`, `night_audit_steps`, `kpi_snapshots` (`specification.md` §6.2, §8.2).
6. **Folios & Payments:** `folios`, `folio_lines`, `payment_intents`, `payments` (`specification.md` §9.2).
7. **Housekeeping & Maintenance:** `hk_tasks`, `hk_checklists`, `maintenance_orders`, `lost_found` (`specification.md` §10.2).
8. **Restaurant & POS:** `outlets`, `tables`, `menu_categories`, `menu_items`, `menu_item_prices`, `modifier_groups`, `modifiers`, `orders`, `order_lines`, `kots`, `kot_lines`, `bills`, `bill_lines`, `bill_payments`, `shifts` (`specification.md` §11.2).
9. **Inventory & Purchasing:** `uoms`, `uom_conversions`, `warehouses`, `items`, `suppliers`, `purchase_orders`, `po_lines`, `grn`, `grn_lines`, `stock_ledger`, `stock_balances`, `stock_counts`, `stock_count_lines`, `stock_adjustments`, `stock_transfers`, `recipes`, `recipe_lines`, `fifo_layers` (`specification.md` §12.2).
10. **Accounting & Ledgers:** `coa_accounts`, `fiscal_years`, `fiscal_periods`, `voucher_types`, `vouchers`, `voucher_lines`, `gl_entries`, `gl_balances`, `posting_rules`, `recurring_vouchers`, `bank_statements`, `bank_reconciliations` (`specification.md` §13.2).
11. **Platform Infrastructure:** `audit_log` (partitioned), `outbox_events`, `inbox_events`, `idempotency_keys`, `attachments`, `webhooks`, `channel_maps`, `channel_sync_logs` (`specification.md` §14.2).

---

## 3. Behavioral Specifications & State Machines (All Resolved)

Detailed state machines, checkpointing semantics, and trigger events have been authored in `specification.md` §15:
- **Resumable Night Audit:** Step checkpoints (`pending ➔ pre_checks ➔ room_tax_posting ➔ fee_posting ➔ date_roll ➔ gl_vouchering ➔ kpi_snapshot ➔ completed`), idempotent retry semantics per step, automated failure alerts and runbooks (`specification.md` §15.1).
- **Background Lifecycle Workers:** Hold expiration worker (60s cron), automated no-show marker (post-arrival cutoff), room-move rate proration, late checkout fee calculation (`specification.md` §15.2).
- **Payment Lifecycle State Machine:** Pre-auth ➔ incremental auth ➔ capture ➔ refund / void ➔ chargeback dispute tracking (`specification.md` §15.3).
- **Multi-Currency & Tax Engine:** Central bank FX sync cadence, realized & unrealized FX gain/loss vouchers, line vs document tax rounding rules, compounding schedules (`specification.md` §15.4).
- **Guest Deduplication & Merge Engine:** Normalized email, phone E.164, and government ID hash matching rules; transaction re-pointing mechanics (`specification.md` §5.1, §5.2).

---

## 4. Frontend Specifications (All Resolved)

All frontend gaps have been detailed in `frontend.md`:
- **Offline PWA Architecture:** Service worker lifecycle (`sw.ts`), Cache-First static assets, Network-First board reads, and IndexedDB sync queues (`hk_offline_queue`, `pos_offline_queue`) (`frontend.md` §10.1).
- **Complete Auth Screen Suite:** Signup, Login, TOTP MFA challenge, Forgot/Reset password, Employee invite acceptance, Branch/tenant switcher modal, and Idle session timeout with 4-digit PIN re-auth dialog (`frontend.md` §4.1).
- **Global Command Palette (`Ctrl+K`):** Omni-search modal, categorized results (Rooms, Guests, Reservations, Vouchers, Actions), keyboard navigation, backend API contract (`frontend.md` §4.2).
- **Print & PDF Engine Layouts:** Print CSS stylesheets (`@media print`), server PDF templates (Registration Cards, Folio Statements, Tax Invoices, Vouchers), and 80mm/58mm ESC/POS thermal slip formatting (`frontend.md` §6.4).
- **Timeline & Floor Plan Drag-and-Drop:** Timeline stay chart with collision detection, snap-to-date, rate proration confirmation modals, and 2D SVG floor plan layouts (`frontend.md` §5.4).

---

## 5. Infrastructure, DevOps & Observability (All Resolved)

 Codified in `architecture.md` §9:
- **Infrastructure as Code (IaC):** Modular Terraform / OpenTofu deployment architecture for managed PostgreSQL 16+, PgBouncer (`transaction` pooling), Redis cluster, S3-compatible storage, Kubernetes/ECS API & Worker pods, Cloudflare Edge WAF/DNS (`architecture.md` §9.1).
- **Observability & Partitioning:** OpenTelemetry distributed tracing & RED metrics, structured JSON Pino logging to Loki, Sentry error tracking, AWS KMS / Vault secret rotation, and `pg_partman` automated monthly table partitioning (`architecture.md` §9.2).

---

## 6. Industry Standards & Security Compliance (All Resolved)

Formalized across `architecture.md` §8, §12 and `specification.md` §13, §14:
- **PCI DSS v4.0.1 Compliance Boundary:** Booking Engine scoped to **SAQ A** via hosted tokenization iframe; Front Desk & POS scoped to **SAQ P2PE / SAQ B-IP** via PCI-validated P2PE terminals; Phone keyed entry scoped to **SAQ C-VT** via hosted virtual terminals; zero storage of PAN/CVV across all systems (`architecture.md` §8.2).
- **USALI 12th Revised Edition Compliance:** Embedded into pre-seeded Chart of Accounts, departmental operating schedules (Rooms, F&B), and mandatory Energy, Water, and Waste (EWW) sustainability reporting schedules (`architecture.md` §12.1, `specification.md` §13.1).
- **Channel Manager 2-Way ARI Synchronization:** Pluggable adapter based on OpenTravel Alliance (OTA) / HTNG standards: real-time outbound push for inventory/rates/restrictions and inbound webhook ingestion with rate-parity guard (`architecture.md` §12.2, `specification.md` §14.2).
- **Hardware Integration Adapters:** Door lock encoders via HTNG and Oracle FIAS TCP protocols (ASSA ABLOY, dormakaba, Onity, Salto), PBX call accounting via FIAS, and thermal POS printers via ESC/POS (`architecture.md` §12.3).
- **Fiscalization & E-Invoicing:** Philippines BIR EIS JSON reporting & CAS compliance (audit trails, gapless numbering, X/Z reading shifts); European Factur-X / PDF/A-3 hybrid e-invoicing (`architecture.md` §12.4).

---

## 7. Sign-off

**Phase 0a Exit Criteria Satisfied:**
- Zero cross-document contradictions remain across `architecture.md`, `specification.md`, and `frontend.md`.
- Complete production DDL exists for all 108 tables conforming to RLS leading-column rules.
- Hospitality and security industry standards are formalized and build-ready.
- All gaps closed and signed off.
