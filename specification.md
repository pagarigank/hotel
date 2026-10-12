# Innkeeper — Functional & Technical Specification

Version 2.0 (Phase 0a Remediation Edition) · Companion to `architecture.md` (system design) and `frontend.md` (UI).
Requirement IDs (`REQ-…`) are referenced across `todo.md` and codebase invariants.

**Keywords:** MUST / SHOULD / MAY as in RFC 2119.

---

## 1. Scope & System Architecture

Innkeeper is a multi-tenant, multi-branch hotel & property management platform built on **PostgreSQL 16.6+**, **NestJS 11** (modular monolith), and **React 19 + Bootstrap 5.3** (strictly light theme).
It encompasses 9 major domain modules, 1 platform infrastructure layer, and 108 production database tables adhering to shared-schema Row-Level Security (RLS).

1. **Platform & Tenancy** (`tenants`, `branches`, `subscriptions`, `usage_meters`, `feature_flags`)
2. **Identity & Access Management (IAM)** (`users`, `memberships`, `roles`, `role_permissions`, `membership_roles`, `sessions`)
3. **Configuration & Metadata** (`settings`, `custom_field_defs`, `status_defs`, `status_transitions`, `action_defs`, `numbering_sequences`, `amenities`, `buildings`, `floors`, `unit_status_log`)
4. **Guests & Companies** (`guests`, `companies`, `guest_prefs`, `guest_consents`, `guest_identifications`, `guest_merge_log`)
5. **Properties & Units** (`property_types`, `unit_types`, `units`)
6. **Rates & Pricing Engine** (`rate_plans`, `rate_calendar`, `restrictions`, `packages`, `taxes`, `tax_rules`, `charge_codes`)
7. **Reservations, Stays & Front Desk** (`reservations`, `reservation_units`, `room_type_inventory`, `reservation_nights`, `holds`, `stays`, `room_moves`, `business_dates`, `folios`, `folio_lines`, `payments`, `night_audits`, `night_audit_steps`, `kpi_snapshots`)
8. **Housekeeping & Maintenance** (`hk_tasks`, `hk_checklists`, `maintenance_orders`, `lost_found`)
9. **Restaurant & POS** (`outlets`, `tables`, `menu_categories`, `menu_items`, `menu_item_prices`, `modifier_groups`, `modifiers`, `orders`, `order_lines`, `kots`, `kot_lines`, `bills`, `bill_lines`, `bill_payments`, `shifts`)
10. **Inventory & Purchasing** (`items`, `uoms`, `uom_conversions`, `warehouses`, `suppliers`, `purchase_orders`, `po_lines`, `grn`, `grn_lines`, `stock_ledger`, `stock_balances`, `stock_counts`, `stock_count_lines`, `stock_adjustments`, `stock_transfers`, `recipes`, `recipe_lines`, `fifo_layers`)
11. **Accounting with Vouchering** (`coa_accounts`, `fiscal_years`, `fiscal_periods`, `voucher_types`, `vouchers`, `voucher_lines`, `gl_entries`, `gl_balances`, `posting_rules`, `recurring_vouchers`, `bank_reconciliations`, `bank_statements`)
12. **Platform Infrastructure & Integrations** (`attachments`, `audit_log`, `outbox_events`, `inbox_events`, `idempotency_keys`, `webhooks`, `channel_maps`, `channel_sync_logs`, `payment_intents`)

---

## 2. Core Architectural & Database Invariants

1. **UUIDv7 Application Generation:** All table primary keys are standard `uuid` columns generated application-side using npm `uuidv7`. Database default functions (`DEFAULT uuidv7()`) are strictly forbidden to ensure portable execution on PostgreSQL 16.6+ and PostgreSQL 18 without relying on uncommitted engine extensions.
2. **RLS Leading-Column Index Rule:** Every tenant-scoped table MUST include `tenant_id` as the unconditional leading column on all primary keys, composite unique constraints, and secondary indexes (e.g. `PRIMARY KEY (tenant_id, id)` or `PRIMARY KEY (tenant_id, warehouse_id, item_id)`). This guarantees index-level partition filtering without sequential table scans.
3. **Double Tenant Isolation:** All tenant tables enforce `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`. RLS policies define both `USING` and `WITH CHECK` clauses bound to `app.tenant_id()`.
4. **Branch Isolation & Restrictive Policies:** Highly sensitive financial ledgers (`vouchers`, `gl_entries`, `stock_ledger`) enforce `RESTRICTIVE` policies checking `app.branch_ids()`:
   ```sql
   CREATE POLICY branch_scope ON vouchers AS RESTRICTIVE
     USING (app.branch_ids() IS NULL OR branch_id = ANY (app.branch_ids()));
   ```
5. **Exact Financial Precision:** All currency amounts are stored as `numeric(19,4)`. Unit costs for inventory valuation are stored as `numeric(19,6)`. Quantities are stored as `numeric(18,4)`. Floating point `number` types are strictly prohibited in application logic.
6. **Append-Only Ledgers:** `gl_entries`, `stock_ledger`, `audit_log`, and `folio_lines` are immutable. Database triggers reject `UPDATE` and `DELETE`. Corrections are executed strictly via explicit reversing records.
7. **Single Table Ownership:** The `Config` module strictly owns `charge_codes`, `taxes`, `tax_rules`, `posting_rules`, and `numbering_sequences`. Other modules access them via public read services or in-memory cached registries.
8. **Reservation ↔ Stay ↔ Unit ↔ Folio Relationship Model:**
   - `reservation_units` models room type inventory allocation and date range exclusion.
   - `stays` models physical room occupancy and links directly to `reservation_units(id)`.
   - `folios` models financial accounting and links to `stays(id)` and `reservations(id)`.
9. **Folio Concurrency & Optimistic Locking:** Every folio includes `version int NOT NULL DEFAULT 1`. Line postings and settlements execute under `SELECT ... FOR UPDATE` row locks.
10. **Night Audit Idempotency Constraint:** Unique constraint `(tenant_id, branch_id, stay_id, business_date, charge_type)` on `folio_lines` physically prevents duplicate room and tax postings.
11. **GDPR vs Accounting Retention Harmonization:** Guest PII in `guests` is anonymized/pseudonymized upon verified erasure request, while financial records in `folios` and `gl_entries` retain immutable financial values linked to anonymized IDs.

---

## 3. Platform & IAM Specification

### 3.1 Requirements
| ID | Requirement |
|---|---|
| REQ-PLT-001 | Database isolation via PostgreSQL RLS with transaction-local context (`app.tenant_id()`). |
| REQ-PLT-002 | Multi-tenant user identities via `memberships` with branch scoping (`membership_roles.branch_scope`). |
| REQ-PLT-003 | Top-bar active branch switcher emitting `X-Branch-Id` header validated against membership scope. |
| REQ-PLT-004 | Self-service tenant provisioning seeding standard templates (Hotel, Resort, Apartment, Restaurant). |
| REQ-PLT-005 | Subscription plan gating for modules (feature flags) and usage quotas (`usage_meters`). |
| REQ-PLT-006 | Comprehensive audit logging of all security, financial, and configuration mutations. |
| REQ-PLT-007 | Guest right-to-erasure compliance via pseudonymization preserving immutable financial ledgers. |
| REQ-PLT-008 | Multi-currency and multi-timezone branch configurations with independent business dates. |

### 3.2 Platform & IAM Production DDL

```sql
-- Global identity tables (no RLS)
CREATE TABLE tenants (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','pending_setup')),
  plan text NOT NULL DEFAULT 'standard',
  attrs jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

CREATE TABLE users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  phone text,
  is_platform_admin boolean NOT NULL DEFAULT false,
  totp_secret text,
  totp_enabled boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','invited','locked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

-- Tenant-scoped IAM tables
CREATE TABLE memberships (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  user_id uuid NOT NULL REFERENCES users(id),
  is_owner boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','invited','suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  UNIQUE (tenant_id, user_id)
);
CREATE INDEX memberships_tenant_idx ON memberships (tenant_id, user_id);

CREATE TABLE roles (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name text NOT NULL,
  code text NOT NULL,
  description text,
  is_system boolean NOT NULL DEFAULT false,
  max_discount_pct numeric(5,2) NOT NULL DEFAULT 0.00,
  max_void_amount numeric(19,4) NOT NULL DEFAULT 0.0000,
  backdate_days int NOT NULL DEFAULT 0,
  can_override_rate boolean NOT NULL DEFAULT false,
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  UNIQUE (tenant_id, code)
);
CREATE INDEX roles_tenant_idx ON roles (tenant_id, code);

CREATE TABLE role_permissions (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission text NOT NULL, -- e.g., 'reservation.booking.create'
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, role_id, permission)
);
CREATE INDEX role_permissions_tenant_idx ON role_permissions (tenant_id, role_id);

CREATE TABLE membership_roles (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  membership_id uuid NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  branch_scope uuid[], -- NULL or empty means ALL permitted branches
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, membership_id, role_id)
);
CREATE INDEX membership_roles_tenant_idx ON membership_roles (tenant_id, membership_id);

CREATE TABLE sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  refresh_token_hash text NOT NULL,
  user_agent text,
  ip_address text,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions (user_id, expires_at);

CREATE TABLE subscriptions (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tier text NOT NULL, -- 'starter', 'professional', 'enterprise'
  status text NOT NULL CHECK (status IN ('active','past_due','cancelled','trialing')),
  current_period_start timestamptz NOT NULL,
  current_period_end timestamptz NOT NULL,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  attrs jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  UNIQUE (tenant_id)
);

CREATE TABLE usage_meters (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  metric text NOT NULL, -- 'rooms_count', 'branches_count', 'monthly_bookings'
  current_value int NOT NULL DEFAULT 0,
  quota_limit int NOT NULL,
  reset_cycle text NOT NULL DEFAULT 'monthly' CHECK (reset_cycle IN ('daily','monthly','unlimited')),
  last_reset_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, metric)
);
CREATE INDEX usage_meters_tenant_idx ON usage_meters (tenant_id, metric);

CREATE TABLE feature_flags (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  flag_key text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT false,
  config_payload jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, flag_key)
);
CREATE INDEX feature_flags_tenant_idx ON feature_flags (tenant_id, flag_key);

-- Apply RLS
SELECT app.enable_tenant_rls('memberships');
SELECT app.enable_tenant_rls('roles');
SELECT app.enable_tenant_rls('role_permissions');
SELECT app.enable_tenant_rls('membership_roles');
SELECT app.enable_tenant_rls('subscriptions');
SELECT app.enable_tenant_rls('usage_meters');
SELECT app.enable_tenant_rls('feature_flags');
```

---

## 4. Configuration & Metadata Engine

### 4.1 Requirements
| ID | Requirement |
|---|---|
| REQ-CFG-001 | Hierarchical settings resolution: `system → tenant → branch → outlet/unit → user`. |
| REQ-CFG-002 | Metadata catalog definitions: buildings, floors, zones, and property amenities. |
| REQ-CFG-003 | Unit status vocabulary (`status_defs`) and state transition validation (`status_transitions`). |
| REQ-CFG-004 | Server-driven action registry (`action_defs`) evaluating user permissions and entity status server-side. |
| REQ-CFG-005 | Dynamic custom field schemas (`custom_field_defs`) validating entity `attrs jsonb`. |
| REQ-CFG-006 | Gapless and cached numbering sequences (`numbering_sequences`) with row locks for legal documents. |

### 4.2 Configuration Production DDL

```sql
CREATE TABLE settings (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  scope_type text NOT NULL CHECK (scope_type IN ('tenant','branch','outlet','user')),
  scope_id uuid, -- NULL for tenant scope
  key text NOT NULL,
  value jsonb NOT NULL,
  version int NOT NULL DEFAULT 1,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, scope_type, scope_id, key)
);
CREATE INDEX settings_tenant_scope_idx ON settings (tenant_id, scope_type, scope_id, key);

CREATE TABLE custom_field_defs (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  entity text NOT NULL, -- 'guest','reservation','unit','item','voucher','supplier'
  key text NOT NULL CHECK (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  label text NOT NULL,
  type text NOT NULL CHECK (type IN ('text','number','decimal','date','select','multiselect','bool','file')),
  required boolean NOT NULL DEFAULT false,
  options jsonb NOT NULL DEFAULT '[]',
  validation jsonb NOT NULL DEFAULT '{}',
  show_in_list boolean NOT NULL DEFAULT false,
  print boolean NOT NULL DEFAULT false,
  sort int NOT NULL DEFAULT 0,
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, entity, key)
);
CREATE INDEX custom_field_defs_tenant_idx ON custom_field_defs (tenant_id, entity, sort);

CREATE TABLE status_defs (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_id uuid,
  entity text NOT NULL, -- 'unit','reservation','table','hk_task'
  code text NOT NULL,
  label text NOT NULL,
  color_token text NOT NULL,
  icon text,
  sort int NOT NULL DEFAULT 0,
  is_sellable boolean NOT NULL DEFAULT false,
  is_occupied boolean NOT NULL DEFAULT false,
  is_dirty boolean NOT NULL DEFAULT false,
  blocks_booking boolean NOT NULL DEFAULT false,
  system_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, branch_id, entity, code)
);
CREATE INDEX status_defs_tenant_idx ON status_defs (tenant_id, entity, sort);

CREATE TABLE status_transitions (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  entity text NOT NULL,
  from_code text NOT NULL,
  to_code text NOT NULL,
  permission text NOT NULL,
  requires_reason boolean NOT NULL DEFAULT false,
  UNIQUE (tenant_id, entity, from_code, to_code)
);
CREATE INDEX status_transitions_tenant_idx ON status_transitions (tenant_id, entity);

CREATE TABLE action_defs (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_id uuid,
  entity text NOT NULL,
  code text NOT NULL,
  label text NOT NULL,
  icon text,
  sort int NOT NULL DEFAULT 0,
  group_code text,
  permission text NOT NULL,
  visible_when jsonb NOT NULL DEFAULT '{}',
  target jsonb NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  UNIQUE (tenant_id, branch_id, entity, code)
);
CREATE INDEX action_defs_tenant_idx ON action_defs (tenant_id, entity, sort);

CREATE TABLE numbering_sequences (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_id uuid,
  doc_type text NOT NULL, -- 'reservation','folio','invoice','voucher_jv','kot','grn'
  prefix text NOT NULL,
  pattern text NOT NULL DEFAULT '{PREFIX}-{YYYY}-{#6}',
  reset_policy text NOT NULL DEFAULT 'yearly' CHECK (reset_policy IN ('daily','monthly','yearly','never')),
  current_period text NOT NULL DEFAULT '',
  next_no bigint NOT NULL DEFAULT 1,
  is_gapless boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, branch_id, doc_type)
);
CREATE INDEX numbering_sequences_tenant_idx ON numbering_sequences (tenant_id, doc_type);

CREATE TABLE amenities (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  code text NOT NULL,
  name text NOT NULL,
  icon text,
  category text NOT NULL DEFAULT 'room',
  sort int NOT NULL DEFAULT 0,
  UNIQUE (tenant_id, code)
);
CREATE INDEX amenities_tenant_idx ON amenities (tenant_id, category);

CREATE TABLE buildings (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  sort int NOT NULL DEFAULT 0,
  UNIQUE (tenant_id, branch_id, code)
);
CREATE INDEX buildings_tenant_idx ON buildings (tenant_id, branch_id);

CREATE TABLE floors (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_id uuid NOT NULL,
  building_id uuid REFERENCES buildings(id) ON DELETE CASCADE,
  number text NOT NULL,
  name text NOT NULL,
  sort int NOT NULL DEFAULT 0,
  UNIQUE (tenant_id, branch_id, number)
);
CREATE INDEX floors_tenant_idx ON floors (tenant_id, branch_id);

CREATE TABLE unit_status_log (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_id uuid NOT NULL,
  unit_id uuid NOT NULL,
  from_status text NOT NULL,
  to_status text NOT NULL,
  reason text,
  changed_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX unit_status_log_tenant_idx ON unit_status_log (tenant_id, unit_id, created_at DESC);

SELECT app.enable_tenant_rls('settings');
SELECT app.enable_tenant_rls('custom_field_defs');
SELECT app.enable_tenant_rls('status_defs');
SELECT app.enable_tenant_rls('status_transitions');
SELECT app.enable_tenant_rls('action_defs');
SELECT app.enable_tenant_rls('numbering_sequences');
SELECT app.enable_tenant_rls('amenities');
SELECT app.enable_tenant_rls('buildings');
SELECT app.enable_tenant_rls('floors');
SELECT app.enable_tenant_rls('unit_status_log');
```

---

## 5. Guests & Company Accounts

### 5.1 Requirements & Deduplication Strategy
| ID | Requirement |
|---|---|
| REQ-GST-001 | Unified Guest & Company profiles with tax identification numbers (TIN) and billing details. |
| REQ-GST-002 | Automated duplicate detection via normalized email, phone (E.164), and government ID hash. |
| REQ-GST-003 | Historical merge audit log (`guest_merge_log`) re-pointing stays, reservations, and folios. |
| REQ-GST-004 | GDPR consent management tracking privacy preferences, marketing opt-ins, and right-to-erasure pseudonymization. |

### 5.2 Guests & Companies Production DDL

```sql
CREATE TABLE guests (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text,
  email_normalized text,
  phone text,
  phone_e164 text,
  birth_date date,
  nationality char(2),
  vip_status text NOT NULL DEFAULT 'standard' CHECK (vip_status IN ('standard','silver','gold','platinum','blacklist')),
  notes text,
  attrs jsonb NOT NULL DEFAULT '{}',
  is_pseudonymized boolean NOT NULL DEFAULT false,
  merged_into_id uuid REFERENCES guests(id),
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz,
  updated_by uuid
);
CREATE INDEX guests_tenant_email_idx ON guests (tenant_id, email_normalized) WHERE merged_into_id IS NULL;
CREATE INDEX guests_tenant_phone_idx ON guests (tenant_id, phone_e164) WHERE merged_into_id IS NULL;

CREATE TABLE companies (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name text NOT NULL,
  tax_identifier text, -- TIN / VAT Reg No
  billing_email text,
  phone text,
  address jsonb NOT NULL DEFAULT '{}',
  credit_limit numeric(19,4) NOT NULL DEFAULT 0.0000,
  credit_terms_days int NOT NULL DEFAULT 30,
  is_active boolean NOT NULL DEFAULT true,
  attrs jsonb NOT NULL DEFAULT '{}',
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);
CREATE INDEX companies_tenant_name_idx ON companies (tenant_id, name);

CREATE TABLE guest_prefs (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  guest_id uuid NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  category text NOT NULL, -- 'room','pillow','diet','floor'
  preference text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, guest_id, category, preference)
);
CREATE INDEX guest_prefs_tenant_idx ON guest_prefs (tenant_id, guest_id);

CREATE TABLE guest_consents (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  guest_id uuid NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  consent_type text NOT NULL, -- 'terms_of_service','marketing_email','marketing_sms','data_processing'
  is_granted boolean NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text
);
CREATE INDEX guest_consents_tenant_idx ON guest_consents (tenant_id, guest_id);

CREATE TABLE guest_identifications (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  guest_id uuid NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  id_type text NOT NULL, -- 'passport','national_id','drivers_license'
  id_number_hash text NOT NULL, -- SHA-256 for duplicate matching
  id_number_encrypted text NOT NULL, -- Encrypted at rest
  issuing_country char(2) NOT NULL,
  expiry_date date,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id_type, id_number_hash)
);
CREATE INDEX guest_identifications_tenant_idx ON guest_identifications (tenant_id, guest_id);

CREATE TABLE guest_merge_log (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  source_guest_id uuid NOT NULL,
  target_guest_id uuid NOT NULL REFERENCES guests(id),
  merged_by uuid NOT NULL,
  reason text NOT NULL,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX guest_merge_log_tenant_idx ON guest_merge_log (tenant_id, target_guest_id);

SELECT app.enable_tenant_rls('guests');
SELECT app.enable_tenant_rls('companies');
SELECT app.enable_tenant_rls('guest_prefs');
SELECT app.enable_tenant_rls('guest_consents');
SELECT app.enable_tenant_rls('guest_identifications');
SELECT app.enable_tenant_rls('guest_merge_log');
```

---

## 6. Properties & Units

### 6.1 Requirements
| ID | Requirement |
|---|---|
| REQ-PRP-001 | Multi-level property structures: Branch ➔ Building ➔ Floor ➔ Units. |
| REQ-PRP-002 | Physical bookable kinds: `room`, `suite`, `villa`, `apartment`, `dorm_bed`, `hall`. |
| REQ-PRP-003 | Unit type capacity constraints, amenities inheritance, base rate definitions. |
| REQ-PRP-004 | Unit board read model (`GET /branches/:b/board`) supporting ETag and floor grouping. |

### 6.2 Properties & Units Production DDL

```sql
CREATE TABLE branches (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  code text NOT NULL,
  name text NOT NULL,
  timezone text NOT NULL,
  base_currency char(3) NOT NULL,
  business_date date NOT NULL,
  address jsonb NOT NULL DEFAULT '{}',
  attrs jsonb NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  UNIQUE (tenant_id, code)
);
CREATE INDEX branches_tenant_idx ON branches (tenant_id, code);

CREATE TABLE property_types (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  code text NOT NULL,
  name text NOT NULL,
  UNIQUE (tenant_id, code)
);
CREATE INDEX property_types_tenant_idx ON property_types (tenant_id);

CREATE TABLE unit_types (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  code text NOT NULL,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'room',
  max_adults int NOT NULL,
  max_children int NOT NULL DEFAULT 0,
  max_occupancy int NOT NULL,
  base_rate numeric(19,4) NOT NULL DEFAULT 0.0000,
  amenities_ids uuid[] DEFAULT '{}',
  sort int NOT NULL DEFAULT 0,
  attrs jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  UNIQUE (tenant_id, branch_id, code)
);
CREATE INDEX unit_types_tenant_idx ON unit_types (tenant_id, branch_id, code);

CREATE TABLE units (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  unit_type_id uuid NOT NULL REFERENCES unit_types(id),
  building text,
  floor text,
  number text NOT NULL,
  name text,
  status_code text NOT NULL DEFAULT 'vacant_dirty',
  status_changed_at timestamptz NOT NULL DEFAULT now(),
  is_sellable boolean NOT NULL DEFAULT true,
  connecting_unit_id uuid REFERENCES units(id),
  attrs jsonb NOT NULL DEFAULT '{}',
  version int NOT NULL DEFAULT 1,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  UNIQUE (tenant_id, branch_id, number)
);
CREATE INDEX units_tenant_board_idx ON units (tenant_id, branch_id, floor, number) WHERE deleted_at IS NULL;

SELECT app.enable_tenant_rls('branches');
SELECT app.enable_tenant_rls('property_types');
SELECT app.enable_tenant_rls('unit_types');
SELECT app.enable_tenant_rls('units');
```

---

## 7. Rates & Pricing Engine

### 7.1 Requirements
| ID | Requirement |
|---|---|
| REQ-RAT-001 | Seasonal rate calendar with day-of-week rate overrides and extra person surcharges. |
| REQ-RAT-002 | Booking restrictions: Min/Max LOS, Closed to Arrival (CTA), Closed to Departure (CTD), Stop-Sell. |
| REQ-RAT-003 | Tax and service charge calculation rules (inclusive/exclusive, compounding, rounding modes). |
| REQ-RAT-004 | Standard hospitality charge codes mapped to GL accounts via posting rules. |

### 7.2 Rates & Pricing Production DDL

```sql
CREATE TABLE rate_plans (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  code text NOT NULL,
  name text NOT NULL,
  currency char(3) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  policy_cancellation jsonb NOT NULL DEFAULT '{}',
  policy_deposit jsonb NOT NULL DEFAULT '{}',
  policy_no_show jsonb NOT NULL DEFAULT '{}',
  attrs jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  UNIQUE (tenant_id, branch_id, code)
);
CREATE INDEX rate_plans_tenant_idx ON rate_plans (tenant_id, branch_id);

CREATE TABLE rate_calendar (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  rate_plan_id uuid NOT NULL REFERENCES rate_plans(id) ON DELETE CASCADE,
  unit_type_id uuid NOT NULL REFERENCES unit_types(id) ON DELETE CASCADE,
  stay_date date NOT NULL,
  rate numeric(19,4) NOT NULL,
  single_occupancy_rate numeric(19,4),
  extra_adult_rate numeric(19,4) NOT NULL DEFAULT 0.0000,
  extra_child_rate numeric(19,4) NOT NULL DEFAULT 0.0000,
  UNIQUE (tenant_id, branch_id, rate_plan_id, unit_type_id, stay_date)
);
CREATE INDEX rate_calendar_tenant_idx ON rate_calendar (tenant_id, branch_id, stay_date);

CREATE TABLE restrictions (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  rate_plan_id uuid NOT NULL REFERENCES rate_plans(id) ON DELETE CASCADE,
  unit_type_id uuid REFERENCES unit_types(id) ON DELETE CASCADE,
  stay_date date NOT NULL,
  min_los int,
  max_los int,
  closed_to_arrival boolean NOT NULL DEFAULT false,
  closed_to_departure boolean NOT NULL DEFAULT false,
  stop_sell boolean NOT NULL DEFAULT false,
  UNIQUE (tenant_id, branch_id, rate_plan_id, unit_type_id, stay_date)
);
CREATE INDEX restrictions_tenant_idx ON restrictions (tenant_id, branch_id, stay_date);

CREATE TABLE packages (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  code text NOT NULL,
  name text NOT NULL,
  charge_code_id uuid NOT NULL,
  price numeric(19,4) NOT NULL,
  frequency text NOT NULL DEFAULT 'per_stay' CHECK (frequency IN ('per_stay','per_night','per_person_per_night')),
  is_inclusive boolean NOT NULL DEFAULT false,
  UNIQUE (tenant_id, branch_id, code)
);
CREATE INDEX packages_tenant_idx ON packages (tenant_id, branch_id);

CREATE TABLE taxes (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  code text NOT NULL,
  name text NOT NULL,
  rate_pct numeric(7,4) NOT NULL,
  is_flat_amount boolean NOT NULL DEFAULT false,
  flat_amount numeric(19,4) NOT NULL DEFAULT 0.0000,
  currency char(3),
  gl_account_code text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (tenant_id, code)
);
CREATE INDEX taxes_tenant_idx ON taxes (tenant_id, code);

CREATE TABLE tax_rules (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_id uuid,
  code text NOT NULL,
  name text NOT NULL,
  is_inclusive boolean NOT NULL DEFAULT false,
  calculation_order int NOT NULL DEFAULT 1,
  compounds_previous boolean NOT NULL DEFAULT false,
  tax_ids uuid[] NOT NULL, -- Ordered taxes to apply
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, branch_id, code)
);
CREATE INDEX tax_rules_tenant_idx ON tax_rules (tenant_id, branch_id);

CREATE TABLE charge_codes (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_id uuid,
  code text NOT NULL,
  name text NOT NULL,
  charge_group text NOT NULL CHECK (charge_group IN ('room','fnb','laundry','telephone','spa','misc','tax','service')),
  tax_rule_id uuid REFERENCES tax_rules(id),
  gl_account_code text NOT NULL,
  allow_discount boolean NOT NULL DEFAULT true,
  department text NOT NULL DEFAULT 'rooms',
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (tenant_id, branch_id, code)
);
CREATE INDEX charge_codes_tenant_idx ON charge_codes (tenant_id, charge_group);

SELECT app.enable_tenant_rls('rate_plans');
SELECT app.enable_tenant_rls('rate_calendar');
SELECT app.enable_tenant_rls('restrictions');
SELECT app.enable_tenant_rls('packages');
SELECT app.enable_tenant_rls('taxes');
SELECT app.enable_tenant_rls('tax_rules');
SELECT app.enable_tenant_rls('charge_codes');
```

---

## 8. Reservations, Stays & Front Desk

### 8.1 Requirements
| ID | Requirement |
|---|---|
| REQ-RSV-001 | Availability search across dates and guest occupancies with real-time price quotes. |
| REQ-RSV-002 | Booking creation requiring `Idempotency-Key` preventing duplicate inventory decrements. |
| REQ-RSV-003 | Exclusion constraint on `reservation_units` strictly preventing double-booking of assigned units. |
| REQ-RSV-004 | Capacity tracking via `room_type_inventory` with `CHECK (sold <= capacity + overbook_allowance)`. |
| REQ-RSV-005 | Explicit separation of booking allocation (`reservation_units`) and guest physical occupancy (`stays`). |
| REQ-RSV-006 | Check-in verification requiring clean unit status, digital registration card, and payment token capture. |
| REQ-RSV-007 | Resumable step-checkpointed Night Audit state machine executing idempotent room and tax postings. |

### 8.2 Reservations & Operations Production DDL

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE reservations (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  reservation_no text NOT NULL,
  status text NOT NULL CHECK (status IN ('hold','confirmed','in_house','checked_out','cancelled','no_show')),
  guest_id uuid NOT NULL REFERENCES guests(id),
  company_id uuid REFERENCES companies(id),
  source text NOT NULL DEFAULT 'direct',
  channel_ref text,
  hold_expires_at timestamptz,
  policy_snapshot jsonb NOT NULL,
  notes text,
  attrs jsonb NOT NULL DEFAULT '{}',
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz,
  updated_by uuid,
  UNIQUE (tenant_id, branch_id, reservation_no)
);
CREATE INDEX reservations_tenant_idx ON reservations (tenant_id, branch_id, status);

CREATE TABLE reservation_units (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  reservation_id uuid NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  unit_type_id uuid NOT NULL REFERENCES unit_types(id),
  unit_id uuid REFERENCES units(id),
  rate_plan_id uuid NOT NULL REFERENCES rate_plans(id),
  check_in date NOT NULL,
  check_out date NOT NULL CHECK (check_out > check_in),
  adults int NOT NULL,
  children int NOT NULL DEFAULT 0,
  status text NOT NULL CHECK (status IN ('hold','confirmed','in_house','checked_out','cancelled','no_show')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT no_double_booking EXCLUDE USING gist (
    unit_id WITH =, daterange(check_in, check_out, '[)') WITH &&
  ) WHERE (unit_id IS NOT NULL AND status IN ('hold','confirmed','in_house'))
);
CREATE INDEX reservation_units_tenant_idx ON reservation_units (tenant_id, branch_id, unit_id);

CREATE TABLE room_type_inventory (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  unit_type_id uuid NOT NULL REFERENCES unit_types(id),
  stay_date date NOT NULL,
  capacity int NOT NULL,
  sold int NOT NULL DEFAULT 0,
  overbook_allowance int NOT NULL DEFAULT 0,
  stop_sell boolean NOT NULL DEFAULT false,
  PRIMARY KEY (tenant_id, branch_id, unit_type_id, stay_date),
  CHECK (sold >= 0 AND sold <= capacity + overbook_allowance)
);
CREATE INDEX room_type_inventory_tenant_idx ON room_type_inventory (tenant_id, branch_id, stay_date);

CREATE TABLE reservation_nights (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  reservation_unit_id uuid NOT NULL REFERENCES reservation_units(id) ON DELETE CASCADE,
  stay_date date NOT NULL,
  rate numeric(19,4) NOT NULL,
  tax_snapshot jsonb NOT NULL DEFAULT '[]',
  PRIMARY KEY (tenant_id, reservation_unit_id, stay_date)
);
CREATE INDEX reservation_nights_tenant_idx ON reservation_nights (tenant_id, reservation_unit_id);

CREATE TABLE holds (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  reservation_unit_id uuid NOT NULL REFERENCES reservation_units(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX holds_tenant_expiry_idx ON holds (tenant_id, expires_at);

CREATE TABLE stays (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  reservation_id uuid NOT NULL REFERENCES reservations(id),
  reservation_unit_id uuid NOT NULL REFERENCES reservation_units(id),
  unit_id uuid NOT NULL REFERENCES units(id),
  guest_id uuid NOT NULL REFERENCES guests(id),
  actual_check_in timestamptz NOT NULL DEFAULT now(),
  expected_check_out date NOT NULL,
  actual_check_out timestamptz,
  status text NOT NULL DEFAULT 'in_house' CHECK (status IN ('in_house','checked_out')),
  reg_card_pdf_url text,
  keycard_code text,
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);
CREATE INDEX stays_tenant_unit_idx ON stays (tenant_id, branch_id, unit_id, status);

CREATE TABLE room_moves (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  stay_id uuid NOT NULL REFERENCES stays(id),
  from_unit_id uuid NOT NULL REFERENCES units(id),
  to_unit_id uuid NOT NULL REFERENCES units(id),
  reason text NOT NULL,
  rate_adjustment numeric(19,4) NOT NULL DEFAULT 0.0000,
  moved_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX room_moves_tenant_stay_idx ON room_moves (tenant_id, stay_id);

CREATE TABLE business_dates (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  business_date date NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','rolling','closed')),
  UNIQUE (tenant_id, branch_id, business_date)
);
CREATE INDEX business_dates_tenant_idx ON business_dates (tenant_id, branch_id, business_date DESC);

CREATE TABLE night_audits (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  business_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('pending','running','completed','failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  failed_at_step text,
  error_message text,
  run_by uuid NOT NULL,
  UNIQUE (tenant_id, branch_id, business_date)
);
CREATE INDEX night_audits_tenant_idx ON night_audits (tenant_id, branch_id, business_date DESC);

CREATE TABLE night_audit_steps (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  night_audit_id uuid NOT NULL REFERENCES night_audits(id) ON DELETE CASCADE,
  step_name text NOT NULL, -- 'pre_checks','room_tax_posting','fee_posting','date_roll','gl_vouchering','kpi_snapshot'
  status text NOT NULL CHECK (status IN ('pending','running','completed','failed','skipped')),
  records_processed int NOT NULL DEFAULT 0,
  error_details text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (tenant_id, night_audit_id, step_name)
);
CREATE INDEX night_audit_steps_tenant_idx ON night_audit_steps (tenant_id, night_audit_id);

CREATE TABLE kpi_snapshots (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  business_date date NOT NULL,
  total_units int NOT NULL,
  occupied_units int NOT NULL,
  ooo_units int NOT NULL,
  complimentary_units int NOT NULL,
  occupancy_rate numeric(6,4) NOT NULL, -- e.g. 0.7550
  adr numeric(19,4) NOT NULL,
  revpar numeric(19,4) NOT NULL,
  trevpar numeric(19,4) NOT NULL,
  total_room_revenue numeric(19,4) NOT NULL,
  total_fnb_revenue numeric(19,4) NOT NULL,
  total_other_revenue numeric(19,4) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, branch_id, business_date)
);
CREATE INDEX kpi_snapshots_tenant_idx ON kpi_snapshots (tenant_id, branch_id, business_date DESC);

SELECT app.enable_tenant_rls('reservations');
SELECT app.enable_tenant_rls('reservation_units');
SELECT app.enable_tenant_rls('room_type_inventory');
SELECT app.enable_tenant_rls('reservation_nights');
SELECT app.enable_tenant_rls('holds');
SELECT app.enable_tenant_rls('stays');
SELECT app.enable_tenant_rls('room_moves');
SELECT app.enable_tenant_rls('business_dates');
SELECT app.enable_tenant_rls('night_audits');
SELECT app.enable_tenant_rls('night_audit_steps');
SELECT app.enable_tenant_rls('kpi_snapshots');
```

---

## 9. Folio, Billing & Payments

### 9.1 Requirements
| ID | Requirement |
|---|---|
| REQ-FOL-001 | Folio multi-window split billing (Window 1: Company / Room & Tax, Window 2: Personal Incidentals). |
| REQ-FOL-002 | Folio optimistic concurrency locking via `version int NOT NULL DEFAULT 1` and `SELECT ... FOR UPDATE`. |
| REQ-FOL-003 | Strict folio state machine: `open ➔ settled ➔ closed`. Closed folios reject postings. |
| REQ-FOL-004 | Night audit idempotency constraint: unique `(tenant_id, branch_id, stay_id, business_date, charge_type)`. |
| REQ-FOL-005 | PCI DSS v4.0.1 tokenized payments architecture with zero storage of raw PAN or CVV/CVC data. |

### 9.2 Folio & Payments Production DDL

```sql
CREATE TABLE folios (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  folio_no text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('guest','master','city_ledger','incidental')),
  stay_id uuid REFERENCES stays(id),
  reservation_id uuid REFERENCES reservations(id),
  company_id uuid REFERENCES companies(id),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','settled','closed')),
  currency char(3) NOT NULL,
  total_charges numeric(19,4) NOT NULL DEFAULT 0.0000,
  total_payments numeric(19,4) NOT NULL DEFAULT 0.0000,
  balance numeric(19,4) NOT NULL DEFAULT 0.0000,
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  UNIQUE (tenant_id, branch_id, folio_no)
);
CREATE INDEX folios_tenant_stay_idx ON folios (tenant_id, stay_id);

CREATE TABLE folio_lines (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  folio_id uuid NOT NULL REFERENCES folios(id) ON DELETE RESTRICT,
  stay_id uuid REFERENCES stays(id),
  window_no int NOT NULL DEFAULT 1,
  business_date date NOT NULL,
  line_type text NOT NULL CHECK (line_type IN ('charge','payment','adjustment','transfer')),
  charge_type text NOT NULL DEFAULT 'manual', -- 'room','tax','service','fnb','laundry','payment'
  charge_code_id uuid REFERENCES charge_codes(id),
  description text NOT NULL,
  qty numeric(12,3) NOT NULL DEFAULT 1,
  unit_amount numeric(19,4) NOT NULL,
  amount numeric(19,4) NOT NULL, -- Charges +, Payments -
  tax_amount numeric(19,4) NOT NULL DEFAULT 0.0000,
  tax_snapshot jsonb NOT NULL DEFAULT '[]',
  source_type text NOT NULL DEFAULT 'manual', -- 'night_audit','restaurant_bill','terminal','front_desk'
  source_id uuid,
  reverses_line_id uuid REFERENCES folio_lines(id),
  voucher_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
CREATE INDEX folio_lines_tenant_folio_idx ON folio_lines (tenant_id, folio_id, window_no);
-- Night audit idempotency index
CREATE UNIQUE INDEX folio_lines_audit_idempotency_idx ON folio_lines (tenant_id, branch_id, stay_id, business_date, charge_type)
  WHERE charge_type IN ('room','night_tax');

CREATE TABLE payment_intents (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  gateway_name text NOT NULL, -- 'stripe','adyen'
  gateway_intent_id text NOT NULL,
  amount numeric(19,4) NOT NULL,
  currency char(3) NOT NULL,
  status text NOT NULL CHECK (status IN ('requires_payment_method','requires_confirmation','requires_capture','succeeded','cancelled')),
  payment_method_token text,
  terminal_id text,
  last_four char(4),
  card_brand text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  UNIQUE (tenant_id, gateway_name, gateway_intent_id)
);
CREATE INDEX payment_intents_tenant_idx ON payment_intents (tenant_id, gateway_name, gateway_intent_id);

CREATE TABLE payments (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  folio_id uuid NOT NULL REFERENCES folios(id),
  payment_intent_id uuid REFERENCES payment_intents(id),
  payment_method text NOT NULL CHECK (payment_method IN ('cash','card_present','card_online','qr_code','city_ledger','voucher')),
  amount numeric(19,4) NOT NULL,
  currency char(3) NOT NULL,
  reference_no text,
  tendered_amount numeric(19,4),
  change_amount numeric(19,4) NOT NULL DEFAULT 0.0000,
  captured_at timestamptz NOT NULL DEFAULT now(),
  captured_by uuid NOT NULL,
  voucher_id uuid
);
CREATE INDEX payments_tenant_folio_idx ON payments (tenant_id, folio_id);

SELECT app.enable_tenant_rls('folios');
SELECT app.enable_tenant_rls('folio_lines');
SELECT app.enable_tenant_rls('payment_intents');
SELECT app.enable_tenant_rls('payments');
```

---

## 10. Housekeeping & Maintenance

### 10.1 Requirements
| ID | Requirement |
|---|---|
| REQ-HKP-001 | Automated cleaning task creation on checkout, room move, or stay-over cycle. |
| REQ-HKP-002 | Mobile attendant task execution with digital cleaning checklists and timers. |
| REQ-HKP-003 | Maintenance work orders linked to Out-of-Order (OOO) and Out-of-Service (OOS) unit blocks. |
| REQ-HKP-004 | Lost & Found custody registry with photo attachments and claim resolution workflow. |

### 10.2 Housekeeping & Maintenance Production DDL

```sql
CREATE TABLE hk_tasks (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  unit_id uuid NOT NULL REFERENCES units(id),
  task_type text NOT NULL CHECK (task_type IN ('checkout_clean','stayover_clean','deep_clean','turndown','inspection')),
  priority text NOT NULL DEFAULT 'standard' CHECK (priority IN ('low','standard','high','urgent')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','inspected','rejected')),
  assigned_to uuid REFERENCES users(id),
  checklist_id uuid,
  started_at timestamptz,
  finished_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);
CREATE INDEX hk_tasks_tenant_branch_idx ON hk_tasks (tenant_id, branch_id, status, assigned_to);

CREATE TABLE hk_checklists (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  code text NOT NULL,
  name text NOT NULL,
  task_type text NOT NULL,
  items jsonb NOT NULL DEFAULT '[]', -- [{"id":"1","label":"Change linens","mandatory":true}]
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (tenant_id, code)
);
CREATE INDEX hk_checklists_tenant_idx ON hk_checklists (tenant_id, task_type);

CREATE TABLE maintenance_orders (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  unit_id uuid REFERENCES units(id),
  area_description text,
  title text NOT NULL,
  description text NOT NULL,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','emergency')),
  status text NOT NULL DEFAULT 'reported' CHECK (status IN ('reported','assigned','in_progress','completed','cancelled')),
  assigned_to uuid REFERENCES users(id),
  blocks_unit boolean NOT NULL DEFAULT false,
  block_type text CHECK (block_type IN ('out_of_order','out_of_service')),
  reported_by uuid NOT NULL,
  resolved_at timestamptz,
  resolution_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);
CREATE INDEX maintenance_orders_tenant_idx ON maintenance_orders (tenant_id, branch_id, status);

CREATE TABLE lost_found (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  item_name text NOT NULL,
  category text NOT NULL CHECK (category IN ('clothing','electronics','jewelry','document','cash','other')),
  found_location text NOT NULL,
  found_unit_id uuid REFERENCES units(id),
  found_by uuid NOT NULL,
  found_date date NOT NULL,
  status text NOT NULL DEFAULT 'held' CHECK (status IN ('held','claimed','disposed','auctioned')),
  claimed_by_guest_id uuid REFERENCES guests(id),
  claimed_at timestamptz,
  storage_location text NOT NULL,
  photo_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lost_found_tenant_idx ON lost_found (tenant_id, branch_id, status);

SELECT app.enable_tenant_rls('hk_tasks');
SELECT app.enable_tenant_rls('hk_checklists');
SELECT app.enable_tenant_rls('maintenance_orders');
SELECT app.enable_tenant_rls('lost_found');
```

---

## 11. Restaurant / F&B POS

### 11.1 Requirements
| ID | Requirement |
|---|---|
| REQ-FNB-001 | Multi-outlet food and beverage management with interactive table boards. |
| REQ-FNB-002 | Kitchen Order Ticket (KOT) routing by station (Grill, Bar, Pastry). |
| REQ-FNB-003 | Bill settlement with atomic Room Charge validation (room number + guest name match). |
| REQ-FNB-004 | Automated inventory depletion based on Bill of Materials (BOM) recipes evaluated at Weighted Average Cost (WAC). |
| REQ-FNB-005 | POS cashier shift management, float tracking, X/Z readings, and cash over/short voucher creation. |

### 11.2 Restaurant & POS Production DDL

```sql
CREATE TABLE outlets (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  code text NOT NULL,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'restaurant' CHECK (kind IN ('restaurant','bar','cafe','room_service','banquet')),
  warehouse_id uuid, -- Default warehouse for raw ingredient depletion
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (tenant_id, branch_id, code)
);
CREATE INDEX outlets_tenant_idx ON outlets (tenant_id, branch_id);

CREATE TABLE tables (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  outlet_id uuid NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  number text NOT NULL,
  name text,
  capacity int NOT NULL DEFAULT 4,
  status text NOT NULL DEFAULT 'free' CHECK (status IN ('free','seated','ordered','served','bill_printed','dirty')),
  status_changed_at timestamptz NOT NULL DEFAULT now(),
  pos_x int NOT NULL DEFAULT 0,
  pos_y int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (tenant_id, outlet_id, number)
);
CREATE INDEX tables_tenant_outlet_idx ON tables (tenant_id, outlet_id, status);

CREATE TABLE menu_categories (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  outlet_id uuid NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (tenant_id, outlet_id, name)
);
CREATE INDEX menu_categories_tenant_idx ON menu_categories (tenant_id, outlet_id, sort);

CREATE TABLE menu_items (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  outlet_id uuid NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES menu_categories(id),
  code text NOT NULL,
  name text NOT NULL,
  description text,
  kitchen_station text NOT NULL DEFAULT 'main' CHECK (kitchen_station IN ('main','grill','bar','pastry','salad')),
  is_86 boolean NOT NULL DEFAULT false, -- Out of stock toggle
  tax_rule_id uuid REFERENCES tax_rules(id),
  charge_code_id uuid REFERENCES charge_codes(id),
  sort int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (tenant_id, outlet_id, code)
);
CREATE INDEX menu_items_tenant_idx ON menu_items (tenant_id, outlet_id, category_id);

CREATE TABLE menu_item_prices (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  menu_item_id uuid NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  variant_name text NOT NULL DEFAULT 'standard', -- 'regular','large','pitcher'
  price numeric(19,4) NOT NULL,
  UNIQUE (tenant_id, menu_item_id, variant_name)
);
CREATE INDEX menu_item_prices_tenant_idx ON menu_item_prices (tenant_id, menu_item_id);

CREATE TABLE modifier_groups (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  outlet_id uuid NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  name text NOT NULL,
  min_selections int NOT NULL DEFAULT 0,
  max_selections int NOT NULL DEFAULT 1,
  UNIQUE (tenant_id, outlet_id, name)
);

CREATE TABLE modifiers (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  group_id uuid NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  name text NOT NULL,
  price_delta numeric(19,4) NOT NULL DEFAULT 0.0000,
  UNIQUE (tenant_id, group_id, name)
);

CREATE TABLE shifts (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  outlet_id uuid NOT NULL REFERENCES outlets(id),
  cashier_id uuid NOT NULL REFERENCES users(id),
  starting_float numeric(19,4) NOT NULL,
  closing_cash numeric(19,4),
  expected_cash numeric(19,4),
  cash_variance numeric(19,4),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  z_reading_no text
);
CREATE INDEX shifts_tenant_outlet_idx ON shifts (tenant_id, outlet_id, status);

CREATE TABLE orders (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  outlet_id uuid NOT NULL REFERENCES outlets(id),
  table_id uuid REFERENCES tables(id),
  shift_id uuid REFERENCES shifts(id),
  order_no text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','fired','served','billed','settled','voided')),
  covers int NOT NULL DEFAULT 1,
  waiter_id uuid NOT NULL REFERENCES users(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  UNIQUE (tenant_id, branch_id, order_no)
);
CREATE INDEX orders_tenant_status_idx ON orders (tenant_id, outlet_id, status);

CREATE TABLE order_lines (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id uuid NOT NULL REFERENCES menu_items(id),
  variant_name text NOT NULL DEFAULT 'standard',
  qty numeric(12,3) NOT NULL DEFAULT 1,
  unit_price numeric(19,4) NOT NULL,
  total_price numeric(19,4) NOT NULL,
  selected_modifiers jsonb NOT NULL DEFAULT '[]',
  status text NOT NULL DEFAULT 'held' CHECK (status IN ('held','fired','served','voided')),
  void_reason text,
  void_by uuid,
  course int NOT NULL DEFAULT 1,
  seat_no int,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_lines_tenant_idx ON order_lines (tenant_id, order_id);

CREATE TABLE kots (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  order_id uuid NOT NULL REFERENCES orders(id),
  kot_no text NOT NULL,
  kitchen_station text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','bumped','voided')),
  fired_at timestamptz NOT NULL DEFAULT now(),
  bumped_at timestamptz,
  UNIQUE (tenant_id, branch_id, kot_no)
);
CREATE INDEX kots_tenant_station_idx ON kots (tenant_id, kitchen_station, status);

CREATE TABLE kot_lines (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  kot_id uuid NOT NULL REFERENCES kots(id) ON DELETE CASCADE,
  order_line_id uuid NOT NULL REFERENCES order_lines(id),
  qty numeric(12,3) NOT NULL,
  item_name text NOT NULL,
  notes text
);

CREATE TABLE bills (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  order_id uuid NOT NULL REFERENCES orders(id),
  bill_no text NOT NULL,
  subtotal numeric(19,4) NOT NULL,
  discount_amount numeric(19,4) NOT NULL DEFAULT 0.0000,
  tax_amount numeric(19,4) NOT NULL DEFAULT 0.0000,
  service_charge numeric(19,4) NOT NULL DEFAULT 0.0000,
  grand_total numeric(19,4) NOT NULL,
  status text NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid','settled','voided')),
  settled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, branch_id, bill_no)
);
CREATE INDEX bills_tenant_order_idx ON bills (tenant_id, order_id);

CREATE TABLE bill_lines (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  bill_id uuid NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  order_line_id uuid NOT NULL REFERENCES order_lines(id),
  description text NOT NULL,
  qty numeric(12,3) NOT NULL,
  unit_price numeric(19,4) NOT NULL,
  amount numeric(19,4) NOT NULL
);

CREATE TABLE bill_payments (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  bill_id uuid NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  payment_method text NOT NULL CHECK (payment_method IN ('cash','card','qr','room_charge','city_ledger')),
  amount numeric(19,4) NOT NULL,
  room_stay_id uuid REFERENCES stays(id),
  folio_line_id uuid REFERENCES folio_lines(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bill_payments_tenant_bill_idx ON bill_payments (tenant_id, bill_id);

SELECT app.enable_tenant_rls('outlets');
SELECT app.enable_tenant_rls('tables');
SELECT app.enable_tenant_rls('menu_categories');
SELECT app.enable_tenant_rls('menu_items');
SELECT app.enable_tenant_rls('menu_item_prices');
SELECT app.enable_tenant_rls('modifier_groups');
SELECT app.enable_tenant_rls('modifiers');
SELECT app.enable_tenant_rls('shifts');
SELECT app.enable_tenant_rls('orders');
SELECT app.enable_tenant_rls('order_lines');
SELECT app.enable_tenant_rls('kots');
SELECT app.enable_tenant_rls('kot_lines');
SELECT app.enable_tenant_rls('bills');
SELECT app.enable_tenant_rls('bill_lines');
SELECT app.enable_tenant_rls('bill_payments');
```

---

## 12. Inventory & Purchasing

### 12.1 Requirements
| ID | Requirement |
|---|---|
| REQ-INV-001 | Item master catalog with base and conversion Units of Measure (UoM). |
| REQ-INV-002 | Complete procurement lifecycle: Purchase Order (PO) ➔ Goods Receipt Note (GRN) ➔ Supplier Bill. |
| REQ-INV-003 | Append-only `stock_ledger` recording physical and financial stock movements. |
| REQ-INV-004 | Concurrency control via `SELECT ... FOR UPDATE` row locks on `stock_balances(tenant_id, warehouse_id, item_id)`. |
| REQ-INV-005 | Weighted Average Cost (WAC) valuation engine with FIFO layer tracking support. |
| REQ-INV-006 | Recipe Bills of Materials (BOM) with yield and waste percentages. |

### 12.2 Inventory & Purchasing Production DDL

```sql
CREATE TABLE uoms (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  code text NOT NULL,
  name text NOT NULL,
  UNIQUE (tenant_id, code)
);

CREATE TABLE uom_conversions (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  from_uom_id uuid NOT NULL REFERENCES uoms(id),
  to_uom_id uuid NOT NULL REFERENCES uoms(id),
  conversion_factor numeric(18,8) NOT NULL,
  UNIQUE (tenant_id, from_uom_id, to_uom_id)
);

CREATE TABLE warehouses (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  code text NOT NULL,
  name text NOT NULL,
  negative_stock_policy text NOT NULL DEFAULT 'block' CHECK (negative_stock_policy IN ('block','warn','allow')),
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (tenant_id, branch_id, code)
);
CREATE INDEX warehouses_tenant_idx ON warehouses (tenant_id, branch_id);

CREATE TABLE items (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  code text NOT NULL,
  name text NOT NULL,
  category text NOT NULL, -- 'food_beverage','housekeeping_supplies','linen','maintenance','operating_asset'
  base_uom_id uuid NOT NULL REFERENCES uoms(id),
  purchase_uom_id uuid REFERENCES uoms(id),
  reorder_level numeric(18,4) NOT NULL DEFAULT 0.0000,
  reorder_qty numeric(18,4) NOT NULL DEFAULT 0.0000,
  valuation_method text NOT NULL DEFAULT 'wac' CHECK (valuation_method IN ('wac','fifo')),
  gl_inventory_account text NOT NULL,
  gl_cogs_account text NOT NULL,
  gl_adjustment_account text NOT NULL,
  attrs jsonb NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  UNIQUE (tenant_id, code)
);
CREATE INDEX items_tenant_category_idx ON items (tenant_id, category);

CREATE TABLE suppliers (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  code text NOT NULL,
  name text NOT NULL,
  tax_identifier text,
  payment_terms_days int NOT NULL DEFAULT 30,
  contact_email text,
  phone text,
  address jsonb NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  attrs jsonb NOT NULL DEFAULT '{}',
  UNIQUE (tenant_id, code)
);
CREATE INDEX suppliers_tenant_idx ON suppliers (tenant_id, name);

CREATE TABLE purchase_orders (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  supplier_id uuid NOT NULL REFERENCES suppliers(id),
  po_no text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','issued','partially_received','completed','cancelled')),
  issue_date date NOT NULL,
  expected_delivery_date date,
  total_amount numeric(19,4) NOT NULL DEFAULT 0.0000,
  created_by uuid NOT NULL,
  approved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, branch_id, po_no)
);
CREATE INDEX purchase_orders_tenant_idx ON purchase_orders (tenant_id, branch_id, status);

CREATE TABLE po_lines (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  po_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES items(id),
  qty numeric(18,4) NOT NULL,
  unit_price numeric(19,4) NOT NULL,
  line_total numeric(19,4) NOT NULL,
  received_qty numeric(18,4) NOT NULL DEFAULT 0.0000
);

CREATE TABLE grn (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  warehouse_id uuid NOT NULL REFERENCES warehouses(id),
  supplier_id uuid NOT NULL REFERENCES suppliers(id),
  po_id uuid REFERENCES purchase_orders(id),
  grn_no text NOT NULL,
  received_date date NOT NULL,
  supplier_invoice_no text,
  total_received_value numeric(19,4) NOT NULL,
  status text NOT NULL DEFAULT 'posted' CHECK (status IN ('draft','posted','cancelled')),
  voucher_id uuid,
  received_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, branch_id, grn_no)
);
CREATE INDEX grn_tenant_idx ON grn (tenant_id, branch_id, received_date);

CREATE TABLE grn_lines (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  grn_id uuid NOT NULL REFERENCES grn(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES items(id),
  received_qty numeric(18,4) NOT NULL,
  unit_cost numeric(19,6) NOT NULL,
  total_cost numeric(19,4) NOT NULL
);

CREATE TABLE stock_ledger (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  warehouse_id uuid NOT NULL REFERENCES warehouses(id),
  item_id uuid NOT NULL REFERENCES items(id),
  posting_date date NOT NULL,
  posted_at timestamptz NOT NULL DEFAULT now(),
  doc_type text NOT NULL, -- 'grn','issue','transfer_in','transfer_out','adjustment','waste','pos_depletion'
  doc_id uuid NOT NULL,
  doc_line_id uuid,
  qty_delta numeric(18,4) NOT NULL,
  unit_cost numeric(19,6) NOT NULL,
  value_delta numeric(19,4) NOT NULL,
  balance_qty numeric(18,4) NOT NULL,
  balance_value numeric(19,4) NOT NULL,
  valuation_rate numeric(19,6) NOT NULL,
  voucher_id uuid
);
CREATE INDEX stock_ledger_tenant_item_idx ON stock_ledger (tenant_id, warehouse_id, item_id, posting_date DESC);

CREATE TABLE stock_balances (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  warehouse_id uuid NOT NULL REFERENCES warehouses(id),
  item_id uuid NOT NULL REFERENCES items(id),
  qty numeric(18,4) NOT NULL DEFAULT 0.0000,
  value numeric(19,4) NOT NULL DEFAULT 0.0000,
  valuation_rate numeric(19,6) NOT NULL DEFAULT 0.000000,
  PRIMARY KEY (tenant_id, warehouse_id, item_id)
);
CREATE INDEX stock_balances_tenant_idx ON stock_balances (tenant_id, warehouse_id);

CREATE TABLE stock_counts (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  warehouse_id uuid NOT NULL REFERENCES warehouses(id),
  count_no text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_progress','submitted','approved','reconciled')),
  freeze_snapshot timestamptz NOT NULL DEFAULT now(),
  counted_by uuid NOT NULL,
  approved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, branch_id, count_no)
);

CREATE TABLE stock_count_lines (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  stock_count_id uuid NOT NULL REFERENCES stock_counts(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES items(id),
  system_qty numeric(18,4) NOT NULL,
  counted_qty numeric(18,4),
  variance_qty numeric(18,4),
  unit_cost numeric(19,6) NOT NULL,
  variance_value numeric(19,4)
);

CREATE TABLE stock_adjustments (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  warehouse_id uuid NOT NULL REFERENCES warehouses(id),
  adjustment_no text NOT NULL,
  reason text NOT NULL,
  item_id uuid NOT NULL REFERENCES items(id),
  qty_delta numeric(18,4) NOT NULL,
  unit_cost numeric(19,6) NOT NULL,
  value_delta numeric(19,4) NOT NULL,
  voucher_id uuid,
  approved_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, branch_id, adjustment_no)
);

CREATE TABLE stock_transfers (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  from_branch_id uuid NOT NULL REFERENCES branches(id),
  from_warehouse_id uuid NOT NULL REFERENCES warehouses(id),
  to_branch_id uuid NOT NULL REFERENCES branches(id),
  to_warehouse_id uuid NOT NULL REFERENCES warehouses(id),
  transfer_no text NOT NULL,
  status text NOT NULL DEFAULT 'in_transit' CHECK (status IN ('in_transit','received','cancelled')),
  item_id uuid NOT NULL REFERENCES items(id),
  qty numeric(18,4) NOT NULL,
  unit_cost numeric(19,6) NOT NULL,
  total_value numeric(19,4) NOT NULL,
  shipped_at timestamptz NOT NULL DEFAULT now(),
  received_at timestamptz,
  UNIQUE (tenant_id, transfer_no)
);

CREATE TABLE recipes (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  menu_item_id uuid NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  variant_name text NOT NULL DEFAULT 'standard',
  yield_pct numeric(5,2) NOT NULL DEFAULT 100.00,
  theoretical_cost numeric(19,4) NOT NULL DEFAULT 0.0000,
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (tenant_id, menu_item_id, variant_name)
);

CREATE TABLE recipe_lines (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  recipe_id uuid NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  ingredient_item_id uuid NOT NULL REFERENCES items(id),
  qty numeric(18,4) NOT NULL,
  uom_id uuid NOT NULL REFERENCES uoms(id),
  waste_pct numeric(5,2) NOT NULL DEFAULT 0.00
);

CREATE TABLE fifo_layers (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  warehouse_id uuid NOT NULL REFERENCES warehouses(id),
  item_id uuid NOT NULL REFERENCES items(id),
  grn_line_id uuid NOT NULL REFERENCES grn_lines(id),
  received_date date NOT NULL,
  original_qty numeric(18,4) NOT NULL,
  remaining_qty numeric(18,4) NOT NULL,
  unit_cost numeric(19,6) NOT NULL
);
CREATE INDEX fifo_layers_tenant_idx ON fifo_layers (tenant_id, warehouse_id, item_id, received_date);

SELECT app.enable_tenant_rls('uoms');
SELECT app.enable_tenant_rls('uom_conversions');
SELECT app.enable_tenant_rls('warehouses');
SELECT app.enable_tenant_rls('items');
SELECT app.enable_tenant_rls('suppliers');
SELECT app.enable_tenant_rls('purchase_orders');
SELECT app.enable_tenant_rls('po_lines');
SELECT app.enable_tenant_rls('grn');
SELECT app.enable_tenant_rls('grn_lines');
SELECT app.enable_tenant_rls('stock_ledger');
SELECT app.enable_tenant_rls('stock_balances');
SELECT app.enable_tenant_rls('stock_counts');
SELECT app.enable_tenant_rls('stock_count_lines');
SELECT app.enable_tenant_rls('stock_adjustments');
SELECT app.enable_tenant_rls('stock_transfers');
SELECT app.enable_tenant_rls('recipes');
SELECT app.enable_tenant_rls('recipe_lines');
SELECT app.enable_tenant_rls('fifo_layers');
```

---

## 13. Accounting with Vouchering (USALI 12th Revised Edition)

### 13.1 Requirements
| ID | Requirement |
|---|---|
| REQ-ACC-001 | Double-entry invariant: Deferred constraint trigger enforcing `Σdebit = Σcredit` at transaction COMMIT. |
| REQ-ACC-002 | Pre-seeded Chart of Accounts conforming to the **USALI 12th Revised Edition** standard hotel hierarchy. |
| REQ-ACC-003 | Voucher lifecycle (`draft ➔ submitted ➔ approved ➔ posted`) with gapless numbering assigned under row lock upon posting. |
| REQ-ACC-004 | Immutable general ledger (`gl_entries`) protected by `BEFORE UPDATE OR DELETE` triggers. |
| REQ-ACC-005 | Fiscal periods with period-lock triggers preventing posting into soft-closed or closed periods. |
| REQ-ACC-006 | Automated posting rules (`posting_rules`) resolving event mappings in the caller's active database transaction. |

### 13.2 Accounting Production DDL

```sql
CREATE TABLE coa_accounts (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  code text NOT NULL,
  name text NOT NULL,
  parent_id uuid REFERENCES coa_accounts(id),
  type text NOT NULL CHECK (type IN ('asset','liability','equity','income','expense')),
  normal_side char(1) NOT NULL CHECK (normal_side IN ('D','C')),
  is_group boolean NOT NULL DEFAULT false,
  is_control boolean NOT NULL DEFAULT false,
  control_type text CHECK (control_type IN ('guest_ledger','city_ledger','ap','inventory','cash')),
  department text, -- 'rooms','fnb','admin_general','it','marketing','pom','energy_water_waste'
  currency char(3),
  allowed_branch_ids uuid[],
  active boolean NOT NULL DEFAULT true,
  UNIQUE (tenant_id, code)
);
CREATE INDEX coa_accounts_tenant_idx ON coa_accounts (tenant_id, code);

CREATE TABLE fiscal_years (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  year int NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  is_closed boolean NOT NULL DEFAULT false,
  UNIQUE (tenant_id, year)
);

CREATE TABLE fiscal_periods (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  fiscal_year_id uuid NOT NULL REFERENCES fiscal_years(id) ON DELETE CASCADE,
  fiscal_year int NOT NULL,
  period_no int NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','soft_closed','closed')),
  UNIQUE (tenant_id, fiscal_year, period_no)
);
CREATE INDEX fiscal_periods_tenant_idx ON fiscal_periods (tenant_id, fiscal_year, period_no);

CREATE TABLE voucher_types (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  code text NOT NULL,
  name text NOT NULL,
  prefix text NOT NULL,
  reset_policy text NOT NULL DEFAULT 'yearly' CHECK (reset_policy IN ('monthly','yearly','never')),
  requires_approval boolean NOT NULL DEFAULT false,
  approval_threshold numeric(19,4) NOT NULL DEFAULT 0.0000,
  is_system boolean NOT NULL DEFAULT false,
  UNIQUE (tenant_id, code)
);
CREATE INDEX voucher_types_tenant_idx ON voucher_types (tenant_id, code);

CREATE TABLE vouchers (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  voucher_type_id uuid NOT NULL REFERENCES voucher_types(id),
  voucher_no text, -- Assigned under row lock upon posting
  draft_ref text NOT NULL,
  voucher_date date NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','posted','cancelled')),
  currency char(3) NOT NULL,
  fx_rate numeric(18,8) NOT NULL DEFAULT 1.00000000,
  narration text,
  source_type text,
  source_id uuid,
  reversal_of uuid REFERENCES vouchers(id),
  reversed_by uuid REFERENCES vouchers(id),
  total_debit numeric(19,4) NOT NULL DEFAULT 0.0000,
  total_credit numeric(19,4) NOT NULL DEFAULT 0.0000,
  attrs jsonb NOT NULL DEFAULT '{}',
  version int NOT NULL DEFAULT 1,
  created_by uuid NOT NULL,
  approved_by uuid,
  posted_by uuid,
  posted_at timestamptz,
  UNIQUE (tenant_id, branch_id, voucher_type_id, voucher_no)
);
CREATE INDEX vouchers_tenant_branch_idx ON vouchers (tenant_id, branch_id, voucher_date, status);

CREATE TABLE voucher_lines (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  voucher_id uuid NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
  line_no int NOT NULL,
  account_id uuid NOT NULL REFERENCES coa_accounts(id),
  debit numeric(19,4) NOT NULL DEFAULT 0.0000 CHECK (debit >= 0),
  credit numeric(19,4) NOT NULL DEFAULT 0.0000 CHECK (credit >= 0),
  party_type text CHECK (party_type IN ('guest','company','supplier')),
  party_id uuid,
  dimensions jsonb NOT NULL DEFAULT '{}',
  narration text,
  CHECK ((debit = 0) <> (credit = 0))
);
CREATE INDEX voucher_lines_tenant_voucher_idx ON voucher_lines (tenant_id, voucher_id);

CREATE TABLE gl_entries (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  voucher_id uuid NOT NULL REFERENCES vouchers(id),
  voucher_line_id uuid NOT NULL REFERENCES voucher_lines(id),
  voucher_no text NOT NULL,
  posting_date date NOT NULL,
  fiscal_period_id uuid NOT NULL REFERENCES fiscal_periods(id),
  account_id uuid NOT NULL REFERENCES coa_accounts(id),
  debit numeric(19,4) NOT NULL DEFAULT 0.0000,
  credit numeric(19,4) NOT NULL DEFAULT 0.0000,
  party_type text,
  party_id uuid,
  dimensions jsonb NOT NULL DEFAULT '{}',
  currency char(3) NOT NULL,
  posted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX gl_entries_tenant_account_idx ON gl_entries (tenant_id, account_id, posting_date);

CREATE TABLE gl_balances (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  fiscal_period_id uuid NOT NULL REFERENCES fiscal_periods(id),
  account_id uuid NOT NULL REFERENCES coa_accounts(id),
  opening_balance numeric(19,4) NOT NULL DEFAULT 0.0000,
  debit_sum numeric(19,4) NOT NULL DEFAULT 0.0000,
  credit_sum numeric(19,4) NOT NULL DEFAULT 0.0000,
  closing_balance numeric(19,4) NOT NULL DEFAULT 0.0000,
  PRIMARY KEY (tenant_id, branch_id, fiscal_period_id, account_id)
);
CREATE INDEX gl_balances_tenant_idx ON gl_balances (tenant_id, branch_id, fiscal_period_id);

CREATE TABLE posting_rules (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_id uuid,
  event_type text NOT NULL, -- 'folio.charge','fnb.sale','stock.grn','stock.issue'
  match jsonb NOT NULL DEFAULT '{}',
  voucher_type_code text NOT NULL,
  mode text NOT NULL DEFAULT 'per_document' CHECK (mode IN ('per_document','daily_summary')),
  lines jsonb NOT NULL,
  priority int NOT NULL DEFAULT 100,
  enabled boolean NOT NULL DEFAULT true
);
CREATE INDEX posting_rules_tenant_event_idx ON posting_rules (tenant_id, event_type, priority);

CREATE TABLE recurring_vouchers (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  template_voucher_id uuid NOT NULL REFERENCES vouchers(id),
  schedule_cron text NOT NULL,
  next_run_date date NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE bank_statements (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  account_id uuid NOT NULL REFERENCES coa_accounts(id),
  statement_date date NOT NULL,
  statement_balance numeric(19,4) NOT NULL,
  file_url text,
  imported_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bank_reconciliations (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  bank_statement_id uuid NOT NULL REFERENCES bank_statements(id),
  gl_entry_id uuid REFERENCES gl_entries(id),
  transaction_date date NOT NULL,
  amount numeric(19,4) NOT NULL,
  matched_at timestamptz,
  matched_by uuid
);

-- Invariant triggers
CREATE OR REPLACE FUNCTION app.forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Table % is strictly append-only; mutations are forbidden.', TG_TABLE_NAME;
END $$;

CREATE TRIGGER gl_immutable BEFORE UPDATE OR DELETE ON gl_entries
  FOR EACH ROW EXECUTE FUNCTION app.forbid_mutation();

CREATE OR REPLACE FUNCTION app.assert_voucher_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_debit numeric;
  v_credit numeric;
BEGIN
  SELECT coalesce(sum(debit), 0), coalesce(sum(credit), 0) INTO v_debit, v_credit
  FROM gl_entries WHERE voucher_id = NEW.voucher_id;
  IF v_debit <> v_credit THEN
    RAISE EXCEPTION 'VOUCHER_UNBALANCED: Debit % does not equal Credit % for voucher %', v_debit, v_credit, NEW.voucher_id;
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER gl_balanced AFTER INSERT ON gl_entries
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.assert_voucher_balanced();

SELECT app.enable_tenant_rls('coa_accounts');
SELECT app.enable_tenant_rls('fiscal_years');
SELECT app.enable_tenant_rls('fiscal_periods');
SELECT app.enable_tenant_rls('voucher_types');
SELECT app.enable_tenant_rls('vouchers');
SELECT app.enable_tenant_rls('voucher_lines');
SELECT app.enable_tenant_rls('gl_entries');
SELECT app.enable_tenant_rls('gl_balances');
SELECT app.enable_tenant_rls('posting_rules');
SELECT app.enable_tenant_rls('recurring_vouchers');
SELECT app.enable_tenant_rls('bank_statements');
SELECT app.enable_tenant_rls('bank_reconciliations');
```

---

## 14. Platform Infrastructure & Integrations

### 14.1 Requirements
| ID | Requirement |
|---|---|
| REQ-INF-001 | Transactional Outbox pattern guaranteeing at-least-once event publication. |
| REQ-INF-002 | Idempotent event inbox tracking preventing duplicate consumer reactions. |
| REQ-INF-003 | Monthly partitioned audit logging capturing all security, money, and config changes. |
| REQ-INF-004 | Two-way OpenTravel (OTA) / HTNG ARI channel manager synchronization. |
| REQ-INF-005 | Hardware adapter protocols for keycard encoders (HTNG/FIAS) and thermal printers (ESC/POS). |
| REQ-INF-006 | Fiscal e-invoicing export compliance (Philippines BIR EIS JSON & CAS / European Factur-X). |

### 14.2 Platform Infrastructure Production DDL

```sql
CREATE TABLE audit_log (
  id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_id uuid,
  actor_id uuid,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id uuid NOT NULL,
  diff jsonb NOT NULL DEFAULT '{}',
  correlation_id text NOT NULL,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, created_at, id)
) PARTITION BY RANGE (created_at);

CREATE TABLE outbox_events (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_id uuid,
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  event_type text NOT NULL, -- e.g., 'reservation.created','voucher.posted'
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','published','failed')),
  retry_count int NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);
CREATE INDEX outbox_events_tenant_pending_idx ON outbox_events (tenant_id, status, created_at)
  WHERE status = 'pending';

CREATE TABLE inbox_events (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  consumer_group text NOT NULL,
  event_id uuid NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, consumer_group, event_id)
);
CREATE INDEX inbox_events_tenant_idx ON inbox_events (tenant_id, consumer_group);

CREATE TABLE idempotency_keys (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  key text NOT NULL,
  request_hash text NOT NULL,
  response_status int NOT NULL,
  response_headers jsonb NOT NULL DEFAULT '{}',
  response_body jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  UNIQUE (tenant_id, key)
);
CREATE INDEX idempotency_keys_tenant_idx ON idempotency_keys (tenant_id, key, expires_at);

CREATE TABLE attachments (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_id uuid,
  entity text NOT NULL, -- 'voucher','guest','maintenance'
  entity_id uuid NOT NULL,
  file_name text NOT NULL,
  file_size bigint NOT NULL,
  mime_type text NOT NULL,
  s3_key text NOT NULL,
  s3_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  uploaded_by uuid NOT NULL
);
CREATE INDEX attachments_tenant_entity_idx ON attachments (tenant_id, entity, entity_id);

CREATE TABLE webhooks (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  endpoint_url text NOT NULL,
  secret_key text NOT NULL,
  subscribed_events text[] NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX webhooks_tenant_idx ON webhooks (tenant_id);

CREATE TABLE channel_maps (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  channel_name text NOT NULL, -- 'booking_com','expedia','agoda'
  local_unit_type_id uuid NOT NULL REFERENCES unit_types(id),
  local_rate_plan_id uuid NOT NULL REFERENCES rate_plans(id),
  channel_room_code text NOT NULL,
  channel_rate_code text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (tenant_id, branch_id, channel_name, channel_room_code, channel_rate_code)
);
CREATE INDEX channel_maps_tenant_idx ON channel_maps (tenant_id, branch_id, channel_name);

CREATE TABLE channel_sync_logs (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  channel_name text NOT NULL,
  sync_type text NOT NULL CHECK (sync_type IN ('outbound_ari','inbound_booking')),
  status text NOT NULL CHECK (status IN ('success','warning','failed')),
  payload_summary jsonb NOT NULL DEFAULT '{}',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX channel_sync_logs_tenant_idx ON channel_sync_logs (tenant_id, branch_id, created_at DESC);

SELECT app.enable_tenant_rls('audit_log');
SELECT app.enable_tenant_rls('outbox_events');
SELECT app.enable_tenant_rls('inbox_events');
SELECT app.enable_tenant_rls('idempotency_keys');
SELECT app.enable_tenant_rls('attachments');
SELECT app.enable_tenant_rls('webhooks');
SELECT app.enable_tenant_rls('channel_maps');
SELECT app.enable_tenant_rls('channel_sync_logs');
```

---

## 15. Behavioral Specifications & State Machines

### 15.1 Resumable Night Audit State Machine (GAPS §3.1)
```
[pending] ──► [pre_checks] ──► [room_tax_posting] ──► [fee_posting] ──► [date_roll] ──► [gl_vouchering] ──► [kpi_snapshot] ──► [completed]
     │              │                  │                   │                │                │                 │
     └──────────────┴──────────────────┴───────────────────┴────────────────┴────────────────┴─────────────────┴──► [failed]
```
1. **`pre_checks`**: Identifies un-checked arrivals (triggers auto no-show if past policy cutoff), departures with open folios, and unbilled POS orders. If critical blockers exist, audit pauses in `failed` with diagnostic report.
2. **`room_tax_posting`**: Iterates active `stays` where `status = 'in_house'`. Atomically inserts room charge and tax lines to `folio_lines`. Idempotency guaranteed via composite unique index `(tenant_id, branch_id, stay_id, business_date, charge_type)`.
3. **`fee_posting`**: Evaluates no-show fees, late checkout penalties, and recurring rental billing charges.
4. **`date_roll`**: Atomically updates `branches.business_date = business_date + 1` and closes current `business_dates` record.
5. **`gl_vouchering`**: Executes `PostingService.post()` in batch or document mode for the rolled date, generating balanced Journal Vouchers.
6. **`kpi_snapshot`**: Computes occupancy %, ADR, RevPAR, and departmental revenues, recording the snapshot to `kpi_snapshots`.
7. **Failure & Runbook Semantics**: Any unhandled exception halts execution, records step checkpoint to `night_audit_steps`, leaves `business_date` unchanged, and dispatches high-priority Slack/PagerDuty webhook alerts with runbook link. Resuming restarts strictly from the failed step.

### 15.2 Background Lifecycle Workers (GAPS §3.2)
1. **Hold Expiration Worker**: Executes every 60 seconds. Queries `holds WHERE expires_at < now()`. In one transaction: marks reservation status `cancelled`, decrements `room_type_inventory.sold`, and deletes hold row.
2. **Auto No-Show Marker**: Runs 1 hour post-arrival cutoff (default 23:00 branch time). Marks un-checked reservations as `no_show`, applies rate plan no-show fee to folio, and releases `room_type_inventory`.
3. **Late Checkout Fee Worker**: Evaluates departures past check-out policy grace period (e.g., > 12:00 PM). Generates half-day or full-day incidental charge based on policy definitions.

### 15.3 Payment Lifecycle State Machine (GAPS §3.3)
```
[authorization] ──► [incremental_auth] ──► [capture] ──► [refund / partial_refund]
       │                                       │
       └──► [void / cancel]                    └──► [chargeback_dispute]
```
- **Pre-authorization**: Card-present or online token held upon check-in for estimated room & tax + incidental buffer.
- **Incremental Auth**: Re-authorizes additional incidental buffer if folio balance exceeds 80% of authorized amount.
- **Capture**: Settlement at checkout. Executes capture against gateway intent and writes `payments` row.
- **Void vs Refund**: Voids occur before end-of-day gateway batch cut; refunds occur post-settlement and generate linked credit entries.

### 15.4 Multi-Currency & Tax Engine Specification (GAPS §3.4)
- **Exchange Rates**: Daily automated sync from central bank API into branch configuration.
- **FX Gain/Loss**: Transacting in non-base currency records base equivalent at transaction date rate. Settlement in base currency compares rate differences and automatically generates Realized FX Gain/Loss vouchers.
- **Tax Rounding Rules**: Configurable per jurisdiction: Philippine BIR requires document-level rounding to 2 decimal places; USALI supports line-level banker's rounding (`ROUND_HALF_EVEN`).

---

## 16. Complete API Surface (Selected Endpoints)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/auth/login` | Email/password authentication, returns JWT + sets refresh cookie |
| `POST` | `/api/v1/auth/mfa/verify` | TOTP MFA verification challenge |
| `GET`  | `/api/v1/ui/navigation` | Server-driven role-filtered navigation structure |
| `GET`  | `/api/v1/ui/actions` | Server-evaluated action menu items for entity and ID |
| `GET`  | `/api/v1/branches/:b/board` | Compact Rooms Board read model with ETag caching |
| `GET`  | `/api/v1/events` | Server-Sent Events (SSE) streaming real-time status deltas |
| `POST` | `/api/v1/reservations` | Create reservation (requires `Idempotency-Key`) |
| `POST` | `/api/v1/stays/:id/check-out` | Settle folio balance and checkout guest stay |
| `POST` | `/api/v1/folios/:id/lines` | Post charge or payment to guest folio (row-locked) |
| `POST` | `/api/v1/branches/:b/night-audit` | Trigger resumable night audit execution (returns 202) |
| `POST` | `/api/v1/orders/:id/fire` | Fire POS table order to kitchen stations (generates KOT) |
| `POST` | `/api/v1/vouchers/:id/post` | Post balanced voucher under gapless numbering sequence lock |
| `GET`  | `/api/v1/reports/trial-balance` | USALI-compliant real-time general ledger trial balance |

---

## 17. Acceptance Criteria & Quality Gates

1. **Double-Booking Elimination:** 100 concurrent requests competing for 1 remaining unit results in exactly 1 HTTP 201 reservation and 99 HTTP 409 responses with zero overlapping database intervals.
2. **Voucher Equilibrium:** Inserting an unbalanced voucher into `gl_entries` raises a deferred constraint exception (`VOUCHER_UNBALANCED`) at transaction `COMMIT`.
3. **Ledger Immutability:** Any `UPDATE` or `DELETE` executed against `gl_entries` or `stock_ledger` raises a permission exception via database trigger.
4. **Cross-Tenant Isolation:** Zero rows leak across tenants in automated leakage tests traversing all 108 tables in `pg_class`.
5. **Night Audit Idempotency:** Executing night audit repeatedly for the same business date produces zero duplicate room or tax folio lines.
