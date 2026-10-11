---
name: innkeeper-core
description: Project map, conventions and Definition of Done for Innkeeper, the multi-tenant multi-branch hotel/property SaaS (PostgreSQL, NestJS, React + Bootstrap light theme). Use this skill FIRST whenever working anywhere in the Innkeeper repo - adding a module, endpoint, migration, screen, or reviewing a PR - and whenever the user mentions Innkeeper, hotel PMS, rooms board, folio, night audit, vouchers, tenants or branches, even if they do not name the project explicitly. Routes to the specialised Innkeeper skills.
---

# Innkeeper Core

Read `docs/architecture.md`, `docs/specification.md`, `docs/frontend.md`, `docs/todo.md` when a task touches design decisions. This skill is the quick-start and the router.

## Skill router (read the matching one before coding)
| Task involves | Read |
|---|---|
| tenant_id, RLS, new table, auth context, branch scope | `innkeeper-multitenancy-rls` |
| statuses, action buttons/menus, settings, custom fields, numbering | `innkeeper-configuration-engine` |
| bookings, availability, rates, check-in/out, folio, night audit | `innkeeper-reservations-availability` |
| vouchers, ledger, posting rules, periods, financial reports | `innkeeper-accounting-vouchers` |
| items, stock, GRN, recipes, POS orders, room charge | `innkeeper-inventory-restaurant` |
| React screens, board tiles, Bootstrap, theming, forms | `innkeeper-frontend-ui` |

## Non-negotiable rules
1. **Tenant isolation is enforced twice**: app filter + Postgres RLS (`FORCE`). Never connect as the owner role.
2. **Database decides truth**: overlaps (exclusion constraint), balance (deferred trigger), immutability (triggers), period locks. Never rely on check-then-write in app code.
3. **Money is `numeric(19,4)`**, strings over the wire, `decimal.js` in code. Never `number`/float.
4. **Append-only** for `gl_entries`, `stock_ledger`, `folio_lines`, `audit_log`. Correct with reversals.
5. **Configuration over code**: statuses, actions, charge codes, taxes, voucher types, numbering, custom fields are data.
6. **Side effects across modules use the outbox**; money/stock/ledger posting that must be atomic uses `PostingService` in the same transaction.
7. **Light theme only.** No dark mode, no hard-coded colours (tokens only).
8. Writes that create bookings/money/stock accept `Idempotency-Key`; updates use `version` + `If-Match`.

## Module layout (backend)
`apps/api/src/modules/<module>/{http,app,domain,infra}`: controller -> use case (`@Transactional`) -> pure domain -> Kysely repo. A module touches only its own tables; use another module's public service or events.

## Adding a feature - checklist
1. Find the requirement id in `specification.md`; if missing, add it first.
2. Migration (SQL): table + `tenant_id` + indexes `(tenant_id, ...)` + RLS enable/force/policy + add to leakage-test list.
3. Zod schemas in `packages/contracts`; OpenAPI regenerated.
4. Use case with permission check, audit, outbox event, idempotency where money/inventory/booking.
5. Tests: unit + DB invariant + API; e2e if it is a user journey.
6. UI: server-driven where configurable; loading/empty/error/403 states; a11y.
7. Update docs + `todo.md`.

## Definition of Done
- [ ] RLS policy present and leakage test passes for new tables
- [ ] Permission strings registered (`<module>.<resource>.<action>`) and seeded into role templates
- [ ] Audit + outbox events emitted for financial/security/config changes
- [ ] Error codes are stable problem+json codes; messages localisable
- [ ] No float math on money; rounding rule documented
- [ ] Migration is forward-only and expand/contract safe
- [ ] Accessibility checked (keyboard, labels, status not colour-only)
- [ ] Docs and todo updated

## Naming
Permissions: `reservation.booking.create`. Events: `<aggregate>.<past_tense>` (`reservation.created`). Error codes: `UPPER_SNAKE`. Tables: plural snake_case. Voucher/doc numbers are separate from UUID ids.
