# Contributing to Innkeeper

## Architecture and Core Principles

1. **Modular Monolith**: Code is split by domain boundaries (`apps/api/src/modules/<module>/{http,app,domain,infra}`). No module may directly import repositories or private services of another module.
2. **Tenant Isolation by Default**:
   - Every tenant table has `tenant_id uuid NOT NULL`.
   - Postgres Row-Level Security (`ENABLE` and `FORCE ROW LEVEL SECURITY`) is active on all tenant tables.
   - Connections run as `innkeeper_app` (`NOBYPASSRLS`). Migrations run as `innkeeper_owner`.
   - Every transaction sets transaction-local `set_config('app.tenant_id', $1, true)`.
3. **Database Decides Truth**:
   - Room availability races are resolved by database exclusion constraints.
   - Vouchers must be balanced at COMMIT via deferred constraint trigger.
   - Closed periods reject postings via triggers.
   - `gl_entries`, `stock_ledger`, `folio_lines`, and `audit_log` are append-only.
4. **Money Rules**:
   - Always `numeric(19,4)` in PostgreSQL.
   - Transmitted as strings over HTTP JSON (`"123.4500"`).
   - In TypeScript, always use `packages/money` with `decimal.js`. Never use JavaScript `number` or floating point math.
5. **UI Invariants**:
   - **Light theme only**. No dark mode toggle or `prefers-color-scheme: dark`.
   - Statuses must have an icon, color token, and text label (WCAG 2.2 AA).
   - Server-driven actions: the server decides which buttons to show (`/ui/actions`).

## Local Development (PostgreSQL on Windows)

Innkeeper connects to your local Windows PostgreSQL instance:
- Database: `innkeeper`
- Port: `5432`
- Roles: `innkeeper_owner` (migrations), `innkeeper_app` (runtime API/Worker)

Commands:
```bash
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```
