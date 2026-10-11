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
