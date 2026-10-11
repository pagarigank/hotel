# Innkeeper — Gap Analysis & Remediation

Audit of `architecture.md`, `specification.md`, `frontend.md`, `todo.md` and `skills/**`.
Status: the spec pack is strong (ID'd requirements, explicit money/tenant/accounting
invariants, ADRs) but **not build-ready**. This file lists what to fix or add before/while
implementing. References use section names and `REQ-…` ids (stable across edits).

Legend: **(B)** blocker · **(H)** high · **(M)** medium · **(L)** low.

---

## 1. Cross-document inconsistencies

| # | Sev | Conflict | Where | Fix |
|---|-----|----------|-------|-----|
| 1 | B | UUIDv7 vs PG version. Docs pin "PostgreSQL 16+"; a skill says "PG18 for native `uuidv7()`"; IDs must be app-generated. | arch §"Data & persistence"; `skills/innkeeper-multitenancy-rls` | Define app-side v7 generator (npm `uuidv7`), forbid DB defaults, note PG16/17 have no `uuidv7()`. Pin one PG minor. |
| 2 | B | Table ownership conflicts: `charge_codes`, `taxes`, `posting_rules`, `numbering_sequences` claimed by two modules. | arch §"Module table map" vs `REQ-CFG-007/008/010` | Assign a single owner (recommend Config owns codes/taxes/posting_rules/numbering); cross-module reads via public service only. |
| 3 | H | RLS leading-column rule violated: `room_type_inventory`, `stock_balances`, `reservation_nights` PKs don't lead with `tenant_id`. | arch "RLS/index convention"; spec DDL | Reindex so `tenant_id` leads. |
| 4 | H | Branch context var mismatch: skill uses `app.branch_ids`; architecture shows only `app.tenant_id`. | `skills/innkeeper-multitenancy-rls` vs arch security | Standardize helper(s) + a RESTRICTIVE branch policy; document fail-closed when unset. |
| 5 | H | Reservation↔stay↔unit linkage missing; `reservation_units.status` "mirrors reservation"; `stays` not linked to `reservation_units`. | spec §"Reservations/Stays" | Add back-reference/FK and precise mirroring rules (or drop the mirror). |
| 6 | H | `folios` has no `version`; concurrent post/settle unspecified. | spec §"Folio" | Add optimistic-lock `version` + `SELECT … FOR UPDATE` lock spec for post/settle. |
| 7 | M | Folio status `settled` vs `closed` used ambiguously. | spec §"Folio" | Define exact terminal states + transitions. |
| 8 | M | Night-audit idempotency cites unique key `(stay_id, business_date,'room')` that exists in no DDL. | skills vs spec DDL | Add the constraint explicitly. |
| 9 | M | Retention vs erasure: NFR-008 (≥7 yrs) collides with `REQ-PLT-007`. | spec NFR / PLT | Define pseudonymization + legally-exempt records. |

---

## 2. Referenced-but-undefined tables (missing DDL)
`gl_balances`, `settings`, `custom_field_defs`, `status_transitions`, `unit_status_log`,
`numbering_sequences`, `audit_log`, `outbox_events`, `idempotency_keys`, `stays`, `room_moves`,
`night_audits` (+ step checkpoints / KPI snapshots), `business_dates` history,
`guests`/`companies`/`guest_prefs`(+consent), rates (`rate_plans`, `rate_calendar`,
`restrictions`, `packages`, `taxes`, `tax_rules`), inventory (`items`, `uoms`, `warehouses`,
`suppliers`, `purchase_orders`, `grn`, `stock_counts`, `recipes`/`recipe_lines`),
restaurant (`outlets`, `tables`, `menu_*`, `orders`, `order_lines`, `kots`, `bills`,
`bill_lines`, `bill_payments`, `shifts`), integration (`webhooks`, `channel_maps`,
`payment_intents`, `api_keys`), IAM (`memberships`, `roles`, `role_permissions`,
`membership_roles`, `sessions`), platform (`subscriptions`, `usage_meters`, `feature_flags`),
`attachments`.

**Action:** treat spec §"Data model" as a starter, not the schema. Produce full DDL per
module, each conforming to the RLS template.

---

## 3. Missing behavioral specs
- **Night audit:** step checkpoints, resumability, retry semantics (prose only today).
- **Lifecycle workers:** hold expiry, no-show, waitlist/quotation→reservation, room-move
  proration, early/late-checkout fees.
- **Payments:** auth/capture/refund/void, 3DS, deposit vs preauth, chargeback, token storage.
- **Pricing engine:** occupancy-based, extra guests, children, packages, cancellation/no-show
  policy engine.
- **Multi-currency:** FX source, revaluation cadence, gain/loss posting.
- **Tax:** line vs invoice rounding, inclusive/exclusive compounding, service-charge base.
- **Numbering:** which documents are legally gapless vs draft-temp.
- **Housekeeping:** auto-task rules + supply consumption into inventory; lost & found.
- **Cross-module FK strategy** for same-transaction writes (`folio_lines.voucher_id` →
  Accounting) given "a module owns its tables".
- **Timezone/DST** business-date roll; **guest merge/dedupe**; **overbooking** allowance;
  **AR credit limits**.

---

## 4. Missing API surface
Spec §"APIs" is "illustrative". Add: guests/companies, rates/restrictions/calendar, taxes,
charge-codes, outlets/menu/recipes, suppliers/PO/warehouses, maintenance/lost-&-found,
attachments, notifications, branding, navigation write, custom-fields/status-defs/action-defs
CRUD, periods list, bank reconciliation, exports, webhooks/integrations, platform-admin
billing/usage, health/metrics, SSE token issuance, and auth `password-reset`/`accept-invite`.

---

## 5. Missing frontend spec
- **PWA/service worker** promised in arch non-goals but absent from `frontend.md`.
- Auth screens (login, MFA, forgot/reset, accept-invite, tenant-select), session timeout / PIN re-auth.
- Global command palette (Ctrl+K) backend contract; error boundaries; offline page; SSE resume.
- Print CSS + PDF template config model; upload (unit photos/attachments); timeline DnD contract.
- i18n: locale list, RTL, number/date formats. Theming: brand-color application + contrast validator contract.
- Token completeness (focus ring, shadows, z-index, spacing); empty/loading/error pattern library.

---

## 6. Missing architecture / ops
No **IaC** (Terraform/Pulumi), **secrets manager** (KMS/Vault), **CI/CD** platform, container
registry/K8s manifests, **observability backend** (OTel + Grafana/Tempo/Loki or vendor; Sentry),
SLO/alerting, preview envs/feature-flag service, backup/PITR + DR region, PgBouncer tuning math,
per-class `statement_timeout`, read-replica routing for reports, file-storage lifecycle,
email/SMS providers, search (PG FTS vs external), PDF engine, key rotation, partition-management
automation (`gl_entries`/`audit_log`), API versioning/deprecation, threat model, data residency.

---

## 7. Web-research corrections / additions
1. **RLS:** transaction-local `set_config('app.tenant_id',$1,true)` on the same pooled conn is
   correct. Add: `(tenant_id, id)` composite indexes; prefer an explicit admin policy over
   `BYPASSRLS` (auditable); keep fail-closed when unset.
2. **Double-booking:** `EXCLUDE USING gist … WITH &&` on `tstzrange` + `btree_gist` is right on
   PG16; catch `23P01`. PG18 `WITHOUT OVERLAPS` is unavailable on the pinned version.
3. **Gapless numbering:** locked counter row is correct; restrict to *legally required* docs
   (throughput cost).
4. **Transactional outbox:** NestJS now ships official `@nestjs/outbox` — evaluate vs custom
   `pg-boss` dispatcher.
5. **⚠ PCI scope correction (B):** arch assumes **SAQ-A**. SAQ-A covers **card-not-present only**.
   Front-desk/POS **card-present** → **SAQ B-IP / P2PE**; keyed/MOTO → **SAQ C-VT**. P2PE
   terminals are the cheapest path to a light scope. Update the security section.
6. **Channel manager:** add ARI two-way sync, mapping, sync log, rate-parity guard;
   `channel_maps` alone is too thin.
7. **TanStack Query v5:** adopt a **query-key factory** convention (v5 single-object signature is
   already correct).
8. **SSE:** `EventSource(url,{withCredentials:true})` cannot set `Authorization` — relies on the
   httpOnly cookie (consistent with the auth design). Keep.
9. **Zod/nestjs-zod:** pin **Zod v4**; nestjs-zod v5 → OpenAPI 3.1 matches the spec.

---

## 8. Prioritized remediation
1. **(B)** Fix §1 conflicts (ownership, RLS index leads, folio version/lock).
2. **(B)** Correct PCI scope (§7.5) + add P2PE/B-IP path.
3. **(H)** Write full DDL for every table in §2 using the RLS template.
4. **(H)** Add night-audit/payment/worker state machines (§3).
5. **(H)** Expand `frontend.md` with PWA/auth/a11y/i18n (§5).
6. **(M)** Add infra/ops chapter + CI + observability (§6).
7. **(M)** Fold the above into `todo.md` Phase 0 exit criteria.
