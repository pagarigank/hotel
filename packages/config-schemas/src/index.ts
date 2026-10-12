import { z } from 'zod';

export const SettingScopeTypeSchema = z.enum(['system', 'tenant', 'branch', 'outlet', 'user']);
export type SettingScopeType = z.infer<typeof SettingScopeTypeSchema>;

export const SettingDefinitionSchema = z.object({
  key: z.string().min(3).max(100),
  description: z.string(),
  scopes: z.array(SettingScopeTypeSchema),
  defaultValue: z.unknown(),
  schema: z.string().optional(), // JSON Schema or identifier
});
export type SettingDefinition = z.infer<typeof SettingDefinitionSchema>;

export const StatusDefSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid().nullable().optional(),
  entity: z.enum(['unit', 'reservation', 'table', 'hk_task', 'order', 'voucher']),
  code: z.string().min(1).max(50),
  label: z.string().min(1).max(100),
  colorToken: z.string().regex(/^[a-z0-9-]+$/),
  icon: z.string().optional().nullable(),
  sort: z.number().int().default(0),
  isSellable: z.boolean().default(false),
  isOccupied: z.boolean().default(false),
  isDirty: z.boolean().default(false),
  blocksBooking: z.boolean().default(false),
  systemKey: z.string().optional().nullable(),
});
export type StatusDef = z.infer<typeof StatusDefSchema>;

export const ActionTargetSchema = z.object({
  type: z.enum(['wizard', 'offcanvas', 'route', 'modal']),
  key: z.string().optional(),
  to: z.string().optional(),
});
export type ActionTarget = z.infer<typeof ActionTargetSchema>;

export const ActionVisibleWhenSchema = z.object({
  statusIn: z.array(z.string()).optional(),
  flags: z.record(z.boolean()).optional(),
  hasReservationToday: z.boolean().optional(),
  module: z.string().optional(),
}).default({});
export type ActionVisibleWhen = z.infer<typeof ActionVisibleWhenSchema>;

export const ActionDefSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid().nullable().optional(),
  entity: z.string().min(1).max(50),
  code: z.string().min(1).max(50),
  label: z.string().min(1).max(100),
  icon: z.string().optional().nullable(),
  groupCode: z.string().optional().nullable(),
  permission: z.string().min(3),
  visibleWhen: ActionVisibleWhenSchema,
  target: ActionTargetSchema,
  sort: z.number().int().default(0),
  enabled: z.boolean().default(true),
});
export type ActionDef = z.infer<typeof ActionDefSchema>;

export const CustomFieldTypeSchema = z.enum([
  'text',
  'number',
  'decimal',
  'date',
  'select',
  'multiselect',
  'boolean',
  'file',
]);
export type CustomFieldType = z.infer<typeof CustomFieldTypeSchema>;

export const CustomFieldDefSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  entity: z.string().min(1).max(50),
  key: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/),
  label: z.string().min(1).max(100),
  type: CustomFieldTypeSchema,
  required: z.boolean().default(false),
  options: z.array(z.string()).optional().default([]),
  validation: z.record(z.unknown()).optional().default({}),
  showInList: z.boolean().default(false),
  print: z.boolean().default(false),
  sort: z.number().int().default(0),
});
export type CustomFieldDef = z.infer<typeof CustomFieldDefSchema>;

export const NumberingSequenceSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  docType: z.string().min(1).max(50),
  prefix: z.string().min(1).max(20),
  pattern: z.string().min(3).max(100),
  resetPolicy: z.enum(['never', 'yearly', 'monthly']),
  nextNo: z.number().int().positive().default(1),
  isGapless: z.boolean().default(false),
});
export type NumberingSequence = z.infer<typeof NumberingSequenceSchema>;

/**
 * Settings Registry
 *
 * The authoritative catalogue of known setting keys. Each entry declares the
 * scopes it may be written at, a human description, a default, and a concrete
 * Zod schema used to validate written values. `updateSetting` rejects unknown
 * keys and values that fail their registered schema.
 */
export interface SettingsRegistryUiMeta {
  control: 'select' | 'number' | 'text' | 'boolean';
  options?: string[];
  min?: number;
  max?: number;
  placeholder?: string;
}

export interface SettingsRegistryEntry {
  key: string;
  description: string;
  scopes: SettingScopeType[];
  defaultValue: unknown;
  valueSchema: z.ZodTypeAny;
  ui?: SettingsRegistryUiMeta;
}

export const SETTINGS_REGISTRY: SettingsRegistryEntry[] = [
  {
    key: 'frontdesk.checkin.requireCleanRoom',
    description: 'Pre-check-in room readiness requirement (clean vs. inspected).',
    scopes: ['tenant', 'branch', 'outlet'],
    defaultValue: 'clean',
    valueSchema: z.enum(['clean', 'inspected']),
    ui: { control: 'select', options: ['clean', 'inspected'] },
  },
  {
    key: 'hotel.overbooking.allowancePct',
    description: 'Permitted overbooking allowance as a percentage of inventory.',
    scopes: ['tenant', 'branch'],
    defaultValue: 0,
    valueSchema: z.number().min(0).max(100),
    ui: { control: 'number', min: 0, max: 100 },
  },
  {
    key: 'accounting.roundingAccount',
    description: 'General-ledger account used to post rounding differences.',
    scopes: ['tenant'],
    defaultValue: '9990-ROUNDING',
    valueSchema: z.string().min(1).max(50),
    ui: { control: 'text', placeholder: 'e.g. 9990-ROUNDING' },
  },
  {
    key: 'security.manager_pin',
    description: 'Supervisor PIN required to authorize manager overrides.',
    scopes: ['tenant'],
    defaultValue: '1234',
    valueSchema: z.string().regex(/^\d{4,8}$/),
    ui: { control: 'text', placeholder: '4-8 digits' },
  },
];

export const SETTINGS_REGISTRY_BY_KEY: ReadonlyMap<string, SettingsRegistryEntry> = new Map(
  SETTINGS_REGISTRY.map((entry) => [entry.key, entry]),
);

/**
 * Custom-field def-driven validation
 *
 * Builds concrete Zod validators from `custom_field_defs` rows so entity `attrs`
 * payloads are validated against the tenant's declared schema rather than
 * `z.record(z.any())`.
 */
export function buildCustomFieldValueSchema(
  def: Pick<CustomFieldDef, 'type' | 'required' | 'options' | 'validation'>,
): z.ZodTypeAny {
  let schema: z.ZodTypeAny;

  switch (def.type) {
    case 'text':
      schema = z.string();
      break;
    case 'number':
      schema = z.number().int();
      break;
    case 'decimal':
      schema = z.number();
      break;
    case 'date':
      schema = z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid date');
      break;
    case 'boolean':
      schema = z.boolean();
      break;
    case 'select': {
      const opts = def.options ?? [];
      schema = opts.length > 0 ? z.enum(opts as [string, ...string[]]) : z.string();
      break;
    }
    case 'multiselect': {
      const opts = def.options ?? [];
      const item = opts.length > 0 ? z.enum(opts as [string, ...string[]]) : z.string();
      schema = z.array(item);
      break;
    }
    case 'file':
    default:
      schema = z.string();
  }

  const rules = (def.validation ?? {}) as Record<string, unknown>;

  if (def.type === 'number' || def.type === 'decimal') {
    if (typeof rules.min === 'number') schema = (schema as z.ZodNumber).min(rules.min);
    if (typeof rules.max === 'number') schema = (schema as z.ZodNumber).max(rules.max);
  }
  if (def.type === 'text' || def.type === 'date' || def.type === 'file') {
    if (typeof rules.minLength === 'number') schema = (schema as z.ZodString).min(rules.minLength);
    if (typeof rules.maxLength === 'number') schema = (schema as z.ZodString).max(rules.maxLength);
    if (typeof rules.pattern === 'string') {
      schema = (schema as z.ZodString).regex(new RegExp(rules.pattern));
    }
  }
  if (def.type === 'multiselect' && typeof rules.minItems === 'number') {
    schema = (schema as z.ZodArray<z.ZodTypeAny>).min(rules.minItems);
  }

  return schema;
}

export function buildCustomFieldsSchema(defs: CustomFieldDef[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const def of defs) {
    const value = buildCustomFieldValueSchema(def);
    shape[def.key] = def.required ? value : value.optional();
  }
  return z.object(shape).passthrough();
}

export function validateCustomFieldValues(
  defs: CustomFieldDef[],
  attrs: Record<string, unknown> | null | undefined,
):
  | { success: true; data: Record<string, unknown> }
  | { success: false; issues: z.ZodIssue[] } {
  const parsed = buildCustomFieldsSchema(defs).safeParse(attrs ?? {});
  if (parsed.success) {
    return { success: true, data: parsed.data as Record<string, unknown> };
  }
  return { success: false, issues: parsed.error.issues };
}


