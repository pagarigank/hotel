---
name: innkeeper-configuration-engine
description: How to make anything configurable in Innkeeper - typed settings with scope inheritance, unit/reservation/table status definitions, server-driven action buttons and menus on room tiles, custom fields in jsonb, charge codes, taxes, and numbering sequences. Use whenever a requirement says configurable, per-tenant, per-branch, customizable, custom field, status colour, menu button, workflow, policy, prefix, or whenever you are tempted to hard-code a label, status, tax rate, account, or menu in code.
---

# Configuration Engine

Principle: **behaviour is code, vocabulary is data.** Engine logic binds to fixed *system flags/keys*; tenants customise labels, colours, order, visibility, thresholds, and add extra values.

## 1. Settings (typed, scoped)
Scope resolution (most specific wins): `system -> tenant -> branch -> outlet/unit -> user`.
```ts
// code-owned registry: one entry per setting
defineSetting({
  key: 'frontdesk.checkin.requireCleanRoom',
  schema: z.enum(['clean','inspected','any']),
  default: 'clean',
  scopes: ['tenant','branch'],
  description: 'Minimum unit status allowed at check-in',
});
```
- Table `settings(tenant_id, scope_type, scope_id, key, value jsonb, version, updated_by)`; unknown keys rejected; value validated against registry schema.
- `ConfigService.get(key, ctx)` with cache; `config.changed` outbox event invalidates caches and pushes SSE to clients.
- **Snapshot** the values a document depended on (tax %, policy text, charge code label) onto the document so later config edits never rewrite history.
- UI forms are generated from the registry/JSON Schema with inherit badges and reset-to-parent.

## 2. Status definitions
Table `status_defs(entity, code, label, color_token, icon, sort, is_sellable, is_occupied, is_dirty, blocks_booking, system_key)` + `status_transitions(entity, from_code, to_code, permission, requires_reason)`.
- Business logic queries **flags** (`is_sellable`, `blocks_booking`) or `system_key`, never a literal code like `'VC'`.
- Tenants may add statuses (no `system_key`) and re-label/re-colour system ones; they cannot delete system-bound ones.
- `color_token` must exist in the frontend token set (`--status-<token>-bg|accent|fg`); custom colours generate a vetted light-palette triplet.

## 3. Action definitions (tile / page buttons)
```ts
type ActionDef = {
  entity: 'unit'|'reservation'|'folio'|'table'|'voucher'|'page:board'|string;
  code: string; label: string; icon?: string; group?: string; sort: number;
  permission: string;
  visibleWhen: { statusIn?: string[]; flags?: Record<string, boolean>; hasReservationToday?: boolean; module?: string };
  target: { type: 'wizard'|'offcanvas'|'route'; key?: string; to?: string };
};
```
- Evaluate on the **server**: `GET /ui/actions?entity=unit&id=...` -> filter by `visibleWhen` + user permission + module/plan flags + branch overrides -> ordered, grouped list.
- Adding a button = insert an `action_defs` row bound to an existing `target.key` (UI registry of wizards/panels). A brand-new *kind* of transaction needs code, but its placement/labels/permissions never do.
- Client registry maps `target.key -> React component`; unknown key renders a graceful "not available" panel.

## 4. Custom fields
`custom_field_defs(entity, key, label, type, required, options jsonb, validation jsonb, show_in_list, print, sort)`; values live in `attrs jsonb` on the entity.
- Types: text, number, decimal, date, select, multiselect, bool, file. Keys are immutable after first use (`^[a-z][a-z0-9_]{1,40}$`).
- Server builds a Zod schema from defs and validates `attrs` on write; unknown keys rejected; deleting a def archives it (data kept).
- Add GIN index on `attrs` only where filtered. Do not use custom fields for data the engine needs for logic.

## 5. Charge codes, taxes, numbering
- `charge_codes(code, name, group, tax_rule_id, gl_account_ref, allow_discount, department)`; GL mapping is resolved via **posting rules** (see accounting skill), not hard-coded accounts.
- `taxes/tax_rules`: rate, inclusive|exclusive, compound order, applicability by charge group/date; nothing country-specific in code.
- `numbering_sequences(scope, doc_type, prefix, pattern, reset_policy, next_no)`; pattern like `{PREFIX}-{YYYY}-{#6}`. For gapless numbers lock the row `FOR UPDATE` inside the posting transaction; for non-legal numbers use a cache-safe sequence.

## Checklist for "make X configurable"
1. Which scope(s)? 2. Registry entry with schema + default + description. 3. Document snapshot where history matters. 4. Permission to edit (`config.<area>.edit`) + audit + version history. 5. Seeded in each tenant template. 6. UI via schema-driven form. 7. Test: default, override at each scope, invalid value, history unaffected.

## Anti-patterns
Switch statements on tenant-defined codes; storing config in env vars; per-tenant code branches; letting config change retroactively alter posted documents; unbounded free-form JSON without schema.
