# Innkeeper — Frontend Specification

React 19 + TypeScript + Vite · Bootstrap 5.3 via `react-bootstrap` · **Light theme only** · Server-driven actions · Companion to `architecture.md` and `specification.md`.

---

## 1. Design Principles

1. **The board is home.** The content page shows every room/property as a status tile. The tile *is* the button: clicking it opens the transactional menu for that unit in its current state.
2. **Server decides, client renders.** Which actions, statuses, fields and menus appear is configured data (`/ui/*`). The client never hard-codes authorisation or status logic.
3. **Light, calm, modern.** White/neutral surfaces, one brand accent, soft shadows, generous spacing, rounded corners (8–12 px). No dark mode, no `prefers-color-scheme: dark` handling.
4. **Status is never colour-only.** Every status = colour + icon + text label (WCAG 2.2 AA).
5. **Few clicks.** Common flows (walk-in, check-in, post charge, settle bill) ≤ 3 interactions from the board.
6. **Fast and live.** TanStack Query caches; SSE patches the board in place; optimistic UI only for safe transitions (e.g. HK status), never for money or inventory.
7. **Responsive by role.** Front desk/POS: tablet & desktop. Housekeeping: phone-first. Finance: desktop dense tables.

---

## 2. Stack

| Concern | Choice |
|---|---|
| Build | Vite 6, TypeScript strict, ESLint + Prettier, path aliases |
| UI kit | **Bootstrap 5.3 (Sass) + react-bootstrap**, Bootstrap Icons |
| Routing | React Router 7 (data router, lazy routes per module) |
| Server state | **TanStack Query v5** |
| Client/UI state | **Zustand** (active branch, board filters, sidebar, drafts) |
| Forms | React Hook Form + Zod resolvers (schemas from `packages/contracts`) |
| Tables | TanStack Table (virtualised with TanStack Virtual for long lists) |
| Charts | Recharts |
| Dates | date-fns (+ `date-fns-tz` for branch timezone); `react-day-picker` |
| Money | `decimal.js` via `packages/money`; `Intl.NumberFormat` |
| i18n | react-i18next (ICU), namespaces per module |
| Realtime | native `EventSource` (SSE) wrapper with backoff |
| Testing | Vitest, React Testing Library, MSW, Playwright, axe-core |
| Printing/PDF | Server-rendered PDFs (invoices, vouchers, registration cards); browser print CSS for slips |

---

## 3. Light Theme Enforcement

```html
<!-- index.html -->
<html lang="en" data-bs-theme="light">
<meta name="color-scheme" content="light only">
```

```scss
// src/styles/main.scss  — customise Bootstrap BEFORE importing it
$enable-dark-mode: false;               // removes dark-mode CSS variables entirely
$enable-shadows: true;
$enable-rounded: true;
$font-family-sans-serif: "Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
$font-size-base: 0.9375rem;             // 15px – dense but readable
$body-bg: #f6f8fb;                      // app canvas
$body-color: #1f2937;
$primary: var(--brand, #2f6fed);        // tenant brand colour (contrast validated)
$border-radius: .5rem;
$border-radius-lg: .75rem;
$card-border-color: #e6eaf1;
$card-box-shadow: 0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.06);
$link-decoration: none;
@import "bootstrap/scss/bootstrap";
@import "./tokens";
@import "./board";
```

- No theme toggle anywhere. CI greps for `prefers-color-scheme: dark` and `data-bs-theme="dark"` and fails the build.
- Tenant brand colour is set at runtime as `--brand`/`--brand-rgb`; a validator rejects colours failing 4.5:1 against white text on buttons.

### 3.1 Design tokens (light palette)

```scss
:root {
  // surface & text
  --surface: #ffffff; --surface-2: #f6f8fb; --border: #e6eaf1; --text: #1f2937; --muted: #6b7280;
  // status tokens (tile background / accent bar / text) — all ≥ 4.5:1 text contrast
  --status-vacant-clean-bg:#e8f6ee; --status-vacant-clean-accent:#1f9d55; --status-vacant-clean-fg:#14532d;
  --status-vacant-dirty-bg:#fff4e0; --status-vacant-dirty-accent:#f59e0b; --status-vacant-dirty-fg:#7a4a00;
  --status-inspected-bg:#e0f2fe;    --status-inspected-accent:#0ea5e9;    --status-inspected-fg:#0c4a6e;
  --status-occupied-bg:#e8edff;     --status-occupied-accent:#3b5bdb;     --status-occupied-fg:#1e2a78;
  --status-due-out-bg:#fde8f0;      --status-due-out-accent:#d6336c;      --status-due-out-fg:#7a1237;
  --status-due-in-bg:#f1e8ff;       --status-due-in-accent:#7c3aed;       --status-due-in-fg:#4c1d95;
  --status-reserved-bg:#fff9db;     --status-reserved-accent:#e0a800;     --status-reserved-fg:#5c4700;
  --status-ooo-bg:#eceff3;          --status-ooo-accent:#6b7280;          --status-ooo-fg:#374151;
  --status-blocked-bg:#fee2e2;      --status-blocked-accent:#dc2626;      --status-blocked-fg:#7f1d1d;
}
```
Statuses are looked up by `status_defs.color_token` → `--status-<token>-*`. Tenants may add custom tokens through the config UI (picker restricted to a vetted light palette with generated bg/accent/fg triplets).

---

## 4. Application Shell

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ ☰  Innkeeper  [Tenant ▾]  [Branch: Manila Hotel ▾]   🔍 Global search (Ctrl+K)  │
│                                   Business date: 11 Oct 2026   🔔  👤 User ▾  │
├────────────┬──────────────────────────────────────────────────────────────────┤
│ Dashboard  │  Page header: title · breadcrumbs · primary actions               │
│ Rooms ◄    │  ┌────────────────────────────────────────────────────────────┐ │
│ Reserv.    │  │                    CONTENT PAGE (Board)                    │ │
│ Front desk │  └────────────────────────────────────────────────────────────┘ │
│ Housekeep. │                                                                   │
│ Restaurant │                                                                   │
│ Inventory  │                                                                   │
│ Accounting │                                                                   │
│ Reports    │                                                                   │
│ Settings   │                                                                   │
└────────────┴──────────────────────────────────────────────────────────────────┘
```

- Left navigation is **server-driven** (`/ui/navigation`): modules, order, icons, permission and plan filtered. Collapsible to icons; on `< lg` becomes an offcanvas.
- Top bar: tenant switcher (if multiple memberships), **branch switcher** (single or "All branches"), global command palette (`Ctrl+K`: rooms, guests, reservations, vouchers, items), notifications, user menu.
- Branch switch resets board filters and invalidates branch-scoped queries; the active branch is also sent as `X-Branch-Id`.
- Business date chip always visible; turns amber if the audit is overdue.

---

## 5. The Content Page: Rooms & Property Board

### 5.1 Layout

```
Rooms & Properties                                           [+ New reservation] [Walk-in]
┌ Summary strip ───────────────────────────────────────────────────────────────────────┐
│ Occupied 42 · Vacant clean 18 · Dirty 9 · Due in 14 · Due out 11 · OOO 2 · Occ 66%    │
└──────────────────────────────────────────────────────────────────────────────────────┘
Filters: [Floor ▾] [Type ▾] [Status ▾] [Search room/guest…]  View: [Grid] [Timeline] [List]
Legend ● Vacant clean ● Dirty ● Occupied ● Due out ● Due in ● Reserved ● OOO   (click legend = filter)

Floor 3
┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
│ 301    │ │ 302    │ │ 303    │ │ 304    │ │ 305    │ │ 306    │
│ Deluxe │ │ Deluxe │ │ Suite  │ │ Twin   │ │ Twin   │ │ Villa 1│
│ ✔ Clean│ │ ● Occ. │ │ ⏏ DueOut│ │ 🧹Dirty│ │ ⛔ OOO │ │ ⏵ DueIn│
│        │ │ J. Cruz│ │ Lee 2n │ │        │ │ AC repair│ │ Tan    │
└────────┘ └────────┘ └────────┘ └────────┘ └────────┘ └────────┘
```

### 5.2 Tile anatomy (`<UnitTile>`)
- Card with 4 px left accent bar and tinted background from the status token.
- **Primary line:** unit number (bold). **Secondary:** unit type short name.
- **Status badge:** icon + label (never colour only).
- **Context line:** in-house guest/last name + nights remaining, or arriving guest + ETA, or OOO reason.
- **Corner flags:** VIP ★, DND, alert ⚠, balance due 💳, early check-in, connecting-room link.
- **Hover (desktop):** quick-peek popover (guest, dates, balance, notes).
- Size is user-selectable: Compact (dense) / Comfortable / Large; tiles use CSS grid `repeat(auto-fill, minmax(150px, 1fr))`.
- Keyboard: arrow keys move focus in the grid, `Enter`/`Space` opens the menu, `Esc` closes, `/` focuses search.

### 5.3 Tile → transaction menu (`<ActionMenu>`)
1. Click/tap a tile → `GET /ui/actions?entity=unit&id=…` (prefetched on hover/focus).
2. Desktop (`≥ md`): Bootstrap **Popover/Dropdown** anchored to the tile. Mobile: **Offcanvas bottom sheet**.
3. Menu content: header (unit, status, guest) + **grouped actions** returned by the server, e.g.

| Tile state | Typical actions (all configurable via `action_defs`) |
|---|---|
| Vacant clean / inspected | New reservation · Walk-in check-in · Block (OOO/OOS) · Change status · View history |
| Vacant dirty | Mark clean · Assign housekeeper · Report maintenance · Block |
| Due in | **Check-in** · View/Edit reservation · Assign/Change room · Cancel / No-show · Deposit |
| Occupied | Folio · **Post charge** · Take payment · Restaurant charge · Extend stay · Room move · Message guest · Housekeeping request |
| Due out | **Check-out** · Folio · Late check-out · Extend · Settle to city ledger |
| Out of order/service | View block · Release · Edit dates · Create maintenance order |
| Any | Open unit details · Audit/status history · Notes |

4. Choosing an action opens its **target** per `action_defs.target`: a **modal/wizard** (default for transactions, keeps context), an **offcanvas** (detail panel), or a **route** (full page like Folio).
5. On success the modal closes, toast confirms, TanStack Query invalidates `['board', branchId]`, `['unit', id]`, related folio/reservation keys; SSE also updates other users' boards.

The same pattern powers **other content pages**: Restaurant table board, Housekeeping board, Reservations calendar (click a block), Stock locations, Voucher list rows — each backed by `entity` + `action_defs`.

### 5.4 Views
- **Grid** (default): grouped by floor/building/zone, collapsible sections, sticky group headers.
- **Timeline** (stay chart): rows = units, columns = dates (14/30 days), bars = reservations (colour by status); drag to move/extend; click bar → reservation actions; double-click empty cell → new reservation (availability checked server-side; conflicting drops snap back with a `ROOM_NOT_AVAILABLE` toast).
- **List**: dense TanStack table with the same row click → action menu.
- Saved filter presets per user.

### 5.5 Data loading
- `GET /branches/:b/board` returns compact tiles (id, number, typeCode, floor, statusCode, flags, guestShort, dates). Cached with ETag; `staleTime` 30 s.
- `useBoardEvents()` opens SSE; messages `unit.status_changed|reservation.updated|…` patch the cached query via `queryClient.setQueryData` (no refetch of the full board).
- If SSE disconnects > 10 s show a subtle "Live updates paused — reconnecting" chip; refetch on reconnect.

---

## 6. Module Screens (summary)

| Module | Screens |
|---|---|
| **Dashboard** | KPI cards (occupancy, ADR, RevPAR, arrivals/departures, revenue today, F&B sales), alerts (night audit, low stock, unbalanced/pending vouchers), role-configurable widgets |
| **Reservations** | Search/list, availability calendar, new/edit wizard (dates → room/rate → guest → payment/deposit → confirm), group/rooming list, waitlist, quotations |
| **Front desk** | Arrivals, departures, in-house, check-in/out wizards, folio workspace (windows/split, post, void, transfer, settle), night audit runner |
| **Housekeeping** | Rooms-to-clean board (phone-first), my tasks, inspection, maintenance orders, lost & found |
| **Restaurant** | Outlet picker → **Table board** (tile pattern) → Order screen (menu grid + order panel) → Bill/settle; KDS screen; shift open/close; menu & recipe setup |
| **Inventory** | Items, warehouses, stock on hand, GRN, issue, transfer, adjustment, waste, stock count (mobile/barcode), POs, suppliers, reorder |
| **Accounting** | **Voucher list + editor**, approvals inbox, chart of accounts tree, periods, ledgers (GL, trial balance, account statement, day/cash/bank books), AR/AP ageing, bank reconciliation, P&L / balance sheet / cash flow |
| **Reports** | Catalogue, parameters panel, async run, export |
| **Settings** | Branches, units & types, statuses, **actions/menus**, custom fields, rates & policies, charge codes, taxes, numbering, voucher types, posting rules, roles & users, notifications, branding, integrations |

### 6.1 Voucher editor (Accounting)
- Header: type, branch, date, currency/FX, narration, attachments. Lines grid (keyboard-first): account (typeahead), party, cost centre, dimension chips, debit, credit, narration.
- **Live balance bar**: Σ Dr, Σ Cr, difference; "Post" disabled until difference = 0 (server re-validates). Auto-balance helper for the last line.
- Status stepper: Draft → Submitted → Approved → Posted; approval comments; "Reverse" on posted vouchers creates a linked reversal draft.
- Read-only once posted (clear lock banner); drill-through links to source document (folio, bill, GRN).
- Print/PDF preview from the configured template.

### 6.2 Restaurant order screen
Left: category tabs + item grid (large tap targets, 86'd items greyed). Right: order panel (seat/course groups, modifiers, notes, qty steppers). Footer: **Fire**, **Hold**, **Bill**. Bill screen: split, discounts (limit-aware), tender buttons incl. **Room charge** (room lookup validates in-house guest), tip, print.

### 6.3 Configuration UX
Settings pages are generic **schema-driven forms** from the settings registry/JSON Schema with scope switcher (Tenant ▸ Branch ▸ Outlet), "inherited from" badges, reset-to-parent, change history, and live preview for status colours and action menus (drag to reorder).

---

## 7. Source Layout (feature-based)

```
apps/web/src/
├─ app/                     # providers, router, shell layout, error boundaries
│  ├─ providers/ (QueryClient, Auth, Branch, I18n, Toasts)
│  └─ routes.tsx            # lazy route per module
├─ shared/
│  ├─ ui/                   # Bootstrap-wrapped primitives: Page, Card, DataTable, Money, StatusBadge,
│  │                        # ConfirmDialog, EmptyState, SkeletonRows, FormField, DateRange, Typeahead
│  ├─ api/                  # http client (fetch), problem+json handling, idempotency, SSE client
│  ├─ hooks/                # useBranch, usePermission, useConfigValue, useDebounce, useHotkeys
│  ├─ lib/                  # money, dates, format, tz, a11y helpers
│  └─ styles/               # main.scss, tokens, board.scss
├─ features/
│  ├─ board/                # UnitTile, ActionMenu, BoardGrid, TimelineView, FiltersBar, useBoard, useBoardEvents
│  ├─ reservations/
│  ├─ frontdesk/ (checkin, checkout, folio, night-audit)
│  ├─ housekeeping/
│  ├─ restaurant/ (table-board, order, bill, kds)
│  ├─ inventory/
│  ├─ accounting/ (vouchers, coa, periods, reports)
│  ├─ guests/
│  ├─ reports/
│  └─ settings/             # schema-driven config pages
└─ main.tsx
```
Each feature: `api/` (query/mutation hooks), `components/`, `pages/`, `schemas/`, `index.ts` (public API). **Features may import `shared/` but not other features' internals** (ESLint `import/no-restricted-paths`).

---

## 8. Key Implementation Patterns

### 8.1 API client & errors
```ts
// shared/api/http.ts
export async function api<T>(path: string, init: ApiInit = {}): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-Branch-Id': useBranchStore.getState().branchId ?? '',
      ...(init.idempotent ? { 'Idempotency-Key': init.idempotencyKey ?? crypto.randomUUID() } : {}),
      ...(init.ifMatch ? { 'If-Match': String(init.ifMatch) } : {}),
    },
    ...init,
  });
  if (!res.ok) throw await toProblemError(res);   // RFC 7807 → typed ProblemError { code, title, detail, correlationId }
  return res.status === 204 ? (undefined as T) : res.json();
}
```
- A mutation's idempotency key is **generated once per user intent** (stored in the form state) and reused on retry.
- `ProblemError.code` maps to localized messages; `ROOM_NOT_AVAILABLE` triggers a refetch of availability and a friendly inline message; `STALE_VERSION` offers "Reload latest".

### 8.2 Tile + action menu
```tsx
export function UnitTile({ unit }: { unit: BoardUnit }) {
  const status = useStatusDef('unit', unit.statusCode);          // label, icon, colorToken
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={`unit-tile status-${status.colorToken}`}
        aria-haspopup="menu" aria-expanded={open}
        aria-label={`Room ${unit.number}, ${status.label}${unit.guestShort ? `, ${unit.guestShort}` : ''}`}
        onClick={() => setOpen(true)}
        onMouseEnter={() => prefetchActions(unit.id)}>
        <span className="unit-no">{unit.number}</span>
        <span className="unit-type">{unit.typeCode}</span>
        <StatusBadge icon={status.icon} label={status.label} />
        {unit.guestShort && <span className="unit-guest text-truncate">{unit.guestShort}</span>}
        <UnitFlags flags={unit.flags} />
      </button>
      {open && <ActionMenu entity="unit" id={unit.id} onClose={() => setOpen(false)} />}
    </>
  );
}
```
```ts
// features/board/api/useBoardEvents.ts
export function useBoardEvents(branchId: string) {
  const qc = useQueryClient();
  useEffect(() => {
    const es = new EventSource(`/api/v1/events?branch=${branchId}`, { withCredentials: true });
    es.addEventListener('unit.status_changed', (e) => {
      const p = JSON.parse((e as MessageEvent).data);
      qc.setQueryData<Board>(['board', branchId], (b) => patchUnit(b, p));
    });
    es.addEventListener('config.changed', () => qc.invalidateQueries({ queryKey: ['ui'] }));
    return () => es.close();
  }, [branchId, qc]);
}
```

### 8.3 Query keys (convention)
`['board', branchId, filters]`, `['unit', id]`, `['ui','actions', entity, id]`, `['reservation', id]`, `['folio', id]`, `['vouchers', filters]`, `['voucher', id]`, `['stock','balances', filters]`. Mutations invalidate the narrowest keys; never store server data in Zustand.

### 8.4 Permissions in UI
`usePermission('voucher.journal.approve')` is **only for hiding irrelevant chrome** (e.g. nav items); authoritative visibility of actions comes from the server. Every API failure with `PERMISSION_DENIED` renders a friendly 403 panel.

### 8.5 Custom fields
`<CustomFields entity="guest" value={attrs} onChange=… />` renders inputs from `/ui/custom-fields` definitions (type, required, options, validation). Zod schema built dynamically from definitions; values persisted to `attrs`.

### 8.6 Money & dates
`<Money value="1234.5000" currency="PHP" />` formats using branch locale; arithmetic always via `decimal.js`. Stay dates are plain `YYYY-MM-DD` strings in **branch timezone**; instants are UTC ISO and displayed in branch timezone with explicit label when it differs from the user's.

---

## 9. UX Standards

| Area | Standard |
|---|---|
| Typography | Inter; 15 px base; headings 600; tabular numerals for money (`font-variant-numeric: tabular-nums`) |
| Spacing | 4 px grid; page padding 24 px (16 px mobile) |
| Cards | White, 1 px `--border`, soft shadow; hover lift on tiles (`translateY(-1px)`) |
| Buttons | One primary per view; destructive actions in outline-danger with confirm dialog + reason when required |
| Forms | Labels above inputs, inline validation on blur, server errors mapped to fields, `Enter` submits, unsaved-changes guard |
| Tables | Sticky header, column chooser, saved views, row density toggle, CSV export, empty/skeleton/error states |
| Feedback | Toasts for success; inline alerts for blocking errors; progress for async jobs (night audit, reports) |
| Loading | Skeletons shaped like final content; no layout shift |
| Empty states | Illustration-free, single sentence + primary action |
| Modals | Wizards use step indicator; focus trap; `Esc` closes unless dirty |
| Motion | 150–200 ms transitions; respect `prefers-reduced-motion` |
| Icons | Bootstrap Icons, consistent stroke; status icons fixed per status def |

### 9.1 Accessibility
- WCAG 2.2 AA; automated axe checks in CI on board, reservation wizard, voucher editor, POS order screen.
- Tile grid uses roving tabindex; menus follow WAI-ARIA menu pattern; modals/offcanvas trap focus and restore it to the originating tile.
- Targets ≥ 44 px on touch layouts (housekeeping, POS).
- Live regions announce SSE-driven status changes for the focused tile and toast messages.

### 9.2 Responsive behaviour
| Breakpoint | Behaviour |
|---|---|
| `< 576` (phone) | Housekeeping/Board: 2-column tiles, bottom-sheet menus, sticky bottom action bar |
| `576–991` (tablet) | POS/front desk primary target; collapsible rail nav; 3–5 tile columns |
| `≥ 992` (desktop) | Persistent sidebar, popover menus, timeline view, dense tables |

---

## 10. Performance Budget
- Initial JS ≤ 250 KB gzip (shell + board); route-level code splitting per module; Bootstrap Sass imports **only needed components**.
- Board of 500 tiles: memoised tiles (`React.memo`, stable props), grid virtualisation beyond 800 tiles, SSE patches update single tiles.
- Images (unit photos) lazy-loaded with fixed aspect boxes.
- Lighthouse targets: Performance ≥ 90, Accessibility ≥ 95 on board route (desktop profile).

---

## 11. Security (frontend)
- Auth cookies httpOnly; no tokens in `localStorage`. CSRF header on mutations.
- Strict CSP (no inline scripts), Subresource Integrity for any CDN asset (prefer self-hosting fonts/icons).
- Escape/encode all rendered config strings (labels from tenants are untrusted); no `dangerouslySetInnerHTML` (lint-banned).
- Idle session timeout (configurable) with warning dialog; sensitive screens (vouchers, cash) support re-auth/PIN override dialog.

---

## 12. Testing

| Type | Scope |
|---|---|
| Component | Tile states/flags, ActionMenu from fixture action lists, StatusBadge a11y, VoucherLines balance bar |
| Integration (MSW) | Board load + SSE patch, check-in wizard error paths (`ROOM_NOT_AVAILABLE`, `STALE_VERSION`), idempotent retry |
| E2E (Playwright) | Login → select branch → tile → Check-in → Post charge → Check-out → voucher visible in accounting; restaurant order → room charge → folio line; config: add status + action → appears on board |
| Visual regression | Board, voucher editor, POS (light theme only baselines) |
| Accessibility | axe in CI + keyboard-only script for the board |

---

## 13. Definition of Done (UI work)
1. Matches tokens and light theme; no hard-coded colours outside tokens.
2. Works at 360 px, 768 px, 1280 px.
3. Keyboard and screen-reader operable; axe clean.
4. Loading, empty, error and permission-denied states handled.
5. Server-driven where the spec says configurable (actions, statuses, custom fields, navigation).
6. Query keys/invalidation documented; no server data in Zustand.
7. Tests added (component + at least one integration path).
