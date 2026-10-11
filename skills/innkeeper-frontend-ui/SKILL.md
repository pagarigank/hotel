---
name: innkeeper-frontend-ui
description: Frontend rules for Innkeeper - React 19 + Vite + TypeScript with Bootstrap 5.3 (react-bootstrap), strictly light theme, the status-tile Rooms and Property board whose tiles open server-driven transaction menus, voucher editor, POS table board, TanStack Query + Zustand state, SSE live updates, accessibility and responsive behaviour. Use whenever building or changing any screen, component, style, theme, form, table, modal, board tile, action menu, or UI state in the web app, even for small tweaks, so colours, tokens, and patterns stay consistent.
---

# Innkeeper Frontend

Full detail: `docs/frontend.md`. This is the working checklist.

## Theme (light only)
- `index.html`: `<html data-bs-theme="light">` + `<meta name="color-scheme" content="light only">`.
- Sass: `$enable-dark-mode: false;` before importing Bootstrap. Never add a toggle, `prefers-color-scheme: dark`, or `data-bs-theme="dark"` (CI fails the build).
- Colours come from CSS tokens (`--surface`, `--border`, `--status-<token>-bg|accent|fg`, `--brand`). **No hard-coded hex in components.** Brand colour must pass 4.5:1 contrast.
- Look: neutral canvas `#f6f8fb`, white cards, 1px soft border, subtle shadow, 8-12px radius, Inter 15px, tabular numerals for money.

## The board pattern (content page)
- Tiles = status-coloured buttons (`<button class="unit-tile status-{token}">`), left accent bar, number, type, **status badge with icon + text**, guest/context line, flags (VIP, DND, alert, balance).
- Status vocabulary comes from `/ui/status-defs` (label, icon, colorToken); never hard-code status names in the component.
- Click -> `ActionMenu(entity, id)`: fetch `/ui/actions?entity=unit&id=` (prefetch on hover/focus). Desktop: popover/dropdown; `< md`: bottom offcanvas. Render exactly what the server returns (grouped, ordered); never decide permissions in the client.
- Action `target` -> `wizard` (modal) | `offcanvas` | `route`; resolve through a registry `targetKey -> component`.
- After success: toast + invalidate `['board', branchId]`, `['unit', id]`, related keys. SSE patches other users' boards with `setQueryData` (no full refetch).
- Reuse the same Tile + ActionMenu for restaurant tables, housekeeping rooms, reservation blocks, stock locations.
- Views: Grid (grouped by floor), Timeline (stay chart, drag to move/extend), List. Filters + legend-as-filter + saved presets.

## State
- **Server state -> TanStack Query only.** UI state (active branch, filters, sidebar, drafts) -> Zustand. Never copy server data into Zustand.
- Query keys: `['board', branchId, filters]`, `['unit', id]`, `['ui','actions',entity,id]`, `['folio', id]`, `['vouchers', filters]`.
- Mutations: generate an `Idempotency-Key` once per user intent and reuse on retry; send `If-Match` version on updates; map problem+json `code` to localised messages (`ROOM_NOT_AVAILABLE` -> refetch availability + inline message; `STALE_VERSION` -> offer reload).
- No optimistic updates for money, stock, or bookings; allowed for safe status flips (e.g. housekeeping).

## Forms and tables
React Hook Form + Zod schemas from `packages/contracts`; labels above inputs; inline validation on blur; unsaved-changes guard; custom fields via `<CustomFields entity=... />` from `/ui/custom-fields`. Tables: TanStack Table, sticky header, column chooser, density toggle, CSV export, skeleton/empty/error states; virtualise > 800 rows.

## Voucher editor
Keyboard-first lines grid, account typeahead, live balance bar (Sigma Dr / Sigma Cr / difference), Post disabled until balanced, status stepper, read-only banner after posting, source drill-through, reverse action.

## Money/dates
`<Money value="1234.5000" currency=... />`; arithmetic via `decimal.js`; stay dates are `YYYY-MM-DD` in branch timezone; instants UTC displayed in branch timezone.

## Accessibility (WCAG 2.2 AA)
Status never by colour alone; roving tabindex in tile grid; ARIA menu pattern; focus trap + restore focus to originating tile; live region for SSE updates; touch targets >= 44px on housekeeping/POS; respect `prefers-reduced-motion`; axe in CI.

## Responsive
`<576` phone (2-col tiles, bottom sheets, sticky action bar); `576-991` tablet (POS/front desk); `>=992` desktop (sidebar, popovers, timeline, dense tables).

## Structure and boundaries
`features/<name>/{api,components,pages,schemas,index.ts}`; features import `shared/` only (not each other's internals); lazy route per module; `shared/ui` wraps Bootstrap primitives. No `dangerouslySetInnerHTML`; escape tenant-supplied labels.

## PR checklist
- [ ] Tokens only, light theme, no new dark-mode CSS
- [ ] Works at 360/768/1280
- [ ] Keyboard + axe clean; status has icon+text
- [ ] Loading / empty / error / 403 states
- [ ] Configurable things come from server config, not constants
- [ ] Query keys + invalidation correct; no server data in Zustand
- [ ] Component + integration (MSW) tests
