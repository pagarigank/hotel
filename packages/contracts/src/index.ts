import { z } from 'zod';
import {
  ActionTargetSchema,
  ActionVisibleWhenSchema,
  CustomFieldTypeSchema,
} from '@innkeeper/config-schemas';
export * from '@innkeeper/config-schemas';
export * from '@innkeeper/money';

/**
 * RFC 7807 Problem Details for HTTP APIs (application/problem+json)
 */
export const ProblemErrorSchema = z.object({
  type: z.string().default('about:blank'),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  instance: z.string().optional(),
  code: z.string(), // Stable application error code
  correlationId: z.string(),
  invalidParams: z
    .array(
      z.object({
        name: z.string(),
        reason: z.string(),
      }),
    )
    .optional(),
});
export type ProblemError = z.infer<typeof ProblemErrorSchema>;

/**
 * Tenant & Branch Contracts
 */
export const TenantSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(2).max(50),
  name: z.string().min(2).max(100),
  plan: z.string().default('standard'),
  active: z.boolean().default(true),
  createdAt: z.string().datetime().optional(),
});
export type TenantDto = z.infer<typeof TenantSchema>;

export const BranchSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  code: z.string().min(2).max(20),
  name: z.string().min(2).max(100),
  timezone: z.string().default('Asia/Manila'),
  baseCurrency: z.string().length(3).default('PHP'),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  active: z.boolean().default(true),
});
export type BranchDto = z.infer<typeof BranchSchema>;

/**
 * Auth & User Contracts
 */
export const CsrfTokenResponseSchema = z.object({
  token: z.string().min(16),
});
export type CsrfTokenResponse = z.infer<typeof CsrfTokenResponseSchema>;

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  tenantSlug: z.string().optional(),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const RefreshTokenRequestSchema = z.object({
  refreshToken: z.string().min(10),
});
export type RefreshTokenRequest = z.infer<typeof RefreshTokenRequestSchema>;

export const JwtPayloadSchema = z.object({
  sub: z.string().uuid(), // userId
  email: z.string().email(),
  tid: z.string().uuid(), // tenantId
  bids: z.array(z.string().uuid()), // permitted branch IDs or empty for all
  roles: z.array(z.string()),
  permissions: z.array(z.string()),
});
export type JwtPayload = z.infer<typeof JwtPayloadSchema>;

export const AuthResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().int(),
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    name: z.string(),
  }),
  tenant: TenantSchema,
  permittedBranches: z.array(BranchSchema),
  roles: z.array(z.string()),
  permissions: z.array(z.string()),
});
export type AuthResponse = z.infer<typeof AuthResponseSchema>;

/**
 * Manager Override Contract
 */
export const ManagerOverrideRequestSchema = z.object({
  managerEmail: z.string().email(),
  managerPin: z.string().min(4).max(8),
  reason: z.string().min(5).max(255),
  action: z.string().min(3),
  discountPct: z.number().min(0).max(100).optional(),
  voidAmount: z.number().min(0).optional(),
});
export type ManagerOverrideRequest = z.infer<typeof ManagerOverrideRequestSchema>;

export const ManagerOverrideResponseSchema = z.object({
  approved: z.boolean(),
  managerId: z.string().uuid(),
  managerName: z.string(),
  reason: z.string(),
  overrideToken: z.string(),
});
export type ManagerOverrideResponse = z.infer<typeof ManagerOverrideResponseSchema>;

/**
 * RBAC Contracts
 */
export const RoleDtoSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(100),
  permissions: z.array(z.string()),
  limits: z.record(z.unknown()).default({}),
  createdAt: z.string().datetime().optional(),
});
export type RoleDto = z.infer<typeof RoleDtoSchema>;

export const CreateRoleDtoSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(100),
  permissions: z.array(z.string()).default([]),
  limits: z
    .object({
      max_discount_pct: z.number().optional(),
      max_void_amount: z.number().optional(),
      backdate_days: z.number().optional(),
      can_override_rate: z.boolean().optional(),
    })
    .default({}),
});
export type CreateRoleDto = z.infer<typeof CreateRoleDtoSchema>;

export const UpdateRoleDtoSchema = z
  .object({
    code: z.string().min(1).max(50).optional(),
    name: z.string().min(1).max(100).optional(),
    permissions: z.array(z.string()).optional(),
    limits: z
      .object({
        max_discount_pct: z.number().optional(),
        max_void_amount: z.number().optional(),
        backdate_days: z.number().optional(),
        can_override_rate: z.boolean().optional(),
      })
      .optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: 'At least one field must be provided',
  });
export type UpdateRoleDto = z.infer<typeof UpdateRoleDtoSchema>;

export const AssignRoleDtoSchema = z.object({
  roleId: z.string().uuid(),
  branchScope: z.array(z.string().uuid()).nullish(), // null/omitted = all branches
});
export type AssignRoleDto = z.infer<typeof AssignRoleDtoSchema>;

export const MembershipRoleDtoSchema = z.object({
  membershipRoleId: z.string().uuid(),
  roleId: z.string().uuid(),
  roleCode: z.string(),
  roleName: z.string(),
  branchScope: z.array(z.string().uuid()).nullable(),
});
export type MembershipRoleDto = z.infer<typeof MembershipRoleDtoSchema>;

export const MembershipDtoSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  email: z.string(),
  name: z.string(),
  active: z.boolean(),
  roles: z.array(MembershipRoleDtoSchema),
});
export type MembershipDto = z.infer<typeof MembershipDtoSchema>;

/**
 * Configurable Definition Contracts (status_defs / action_defs / custom_field_defs)
 */
export const StatusEntitySchema = z.enum([
  'unit',
  'reservation',
  'table',
  'hk_task',
  'order',
  'voucher',
]);
export type StatusEntity = z.infer<typeof StatusEntitySchema>;

export const CreateStatusDefDtoSchema = z.object({
  entity: StatusEntitySchema,
  code: z.string().min(1).max(50),
  label: z.string().min(1).max(100),
  colorToken: z.string().regex(/^[a-z0-9-]+$/),
  icon: z.string().max(100).nullish(),
  sort: z.number().int().default(0),
  isSellable: z.boolean().default(false),
  isOccupied: z.boolean().default(false),
  isDirty: z.boolean().default(false),
  blocksBooking: z.boolean().default(false),
  branchId: z.string().uuid().nullish(),
  systemKey: z.string().max(50).nullish(),
});
export type CreateStatusDefDto = z.infer<typeof CreateStatusDefDtoSchema>;

export const UpdateStatusDefDtoSchema = CreateStatusDefDtoSchema.omit({
  entity: true,
  code: true,
})
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'At least one field must be provided' });
export type UpdateStatusDefDto = z.infer<typeof UpdateStatusDefDtoSchema>;

export const CreateActionDefDtoSchema = z.object({
  entity: z.string().min(1).max(50),
  code: z.string().min(1).max(50),
  label: z.string().min(1).max(100),
  icon: z.string().max(100).nullish(),
  groupCode: z.string().max(50).nullish(),
  permission: z.string().min(3).max(100),
  visibleWhen: ActionVisibleWhenSchema.optional(),
  target: ActionTargetSchema,
  sort: z.number().int().default(0),
  enabled: z.boolean().default(true),
  branchId: z.string().uuid().nullish(),
});
export type CreateActionDefDto = z.infer<typeof CreateActionDefDtoSchema>;

export const UpdateActionDefDtoSchema = CreateActionDefDtoSchema.omit({
  entity: true,
  code: true,
})
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'At least one field must be provided' });
export type UpdateActionDefDto = z.infer<typeof UpdateActionDefDtoSchema>;

export const CreateCustomFieldDefDtoSchema = z.object({
  entity: z.string().min(1).max(50),
  key: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/),
  label: z.string().min(1).max(100),
  type: CustomFieldTypeSchema,
  required: z.boolean().default(false),
  options: z.array(z.string()).default([]),
  validation: z.record(z.unknown()).default({}),
  showInList: z.boolean().default(false),
  print: z.boolean().default(false),
  sort: z.number().int().default(0),
});
export type CreateCustomFieldDefDto = z.infer<typeof CreateCustomFieldDefDtoSchema>;

export const UpdateCustomFieldDefDtoSchema = CreateCustomFieldDefDtoSchema.omit({
  entity: true,
  key: true,
})
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'At least one field must be provided' });
export type UpdateCustomFieldDefDto = z.infer<typeof UpdateCustomFieldDefDtoSchema>;

export const CreateStatusTransitionDtoSchema = z.object({
  entity: StatusEntitySchema,
  fromCode: z.string().min(1).max(50),
  toCode: z.string().min(1).max(50),
  permission: z.string().min(3).max(100),
  requiresReason: z.boolean().default(false),
});
export type CreateStatusTransitionDto = z.infer<typeof CreateStatusTransitionDtoSchema>;

/**
 * Settings Contracts
 */
export const SettingDtoSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  scopeType: z.enum(['system', 'tenant', 'branch', 'outlet', 'user']),
  scopeId: z.string().uuid().nullable().optional(),
  key: z.string(),
  value: z.unknown(),
  version: z.number().int().default(1),
});
export type SettingDto = z.infer<typeof SettingDtoSchema>;

export const UpdateSettingDtoSchema = z.object({
  value: z.unknown(),
  scopeType: z.enum(['tenant', 'branch', 'outlet', 'user']).default('tenant'),
  scopeId: z.string().uuid().optional(),
});
export type UpdateSettingDto = z.infer<typeof UpdateSettingDtoSchema>;

/**
 * UI Action Evaluator Query Contract
 */
export const UiActionsQuerySchema = z.object({
  entity: z.string().min(1).max(50),
  id: z.string().uuid().optional(),
  status: z.string().optional(),
});
export type UiActionsQuery = z.infer<typeof UiActionsQuerySchema>;

/**
 * Numbering Sequence Contract
 */
export const GenerateNextNumberDtoSchema = z.object({
  branchId: z.string().uuid(),
  docType: z.string().min(1).max(50),
});
export type GenerateNextNumberDto = z.infer<typeof GenerateNextNumberDtoSchema>;

export const GeneratedNumberResponseSchema = z.object({
  docNumber: z.string(),
  sequenceNo: z.number().int(),
  isGapless: z.boolean(),
});
export type GeneratedNumberResponse = z.infer<typeof GeneratedNumberResponseSchema>;

/**
 * Navigation Contract (/ui/navigation)
 */
export type NavigationItem = {
  key: string;
  label: string;
  path: string;
  icon: string;
  permission?: string;
  badge?: string;
  children?: NavigationItem[];
};

export const NavigationItemSchema: z.ZodType<NavigationItem> = z.lazy(() =>
  z.object({
    key: z.string(),
    label: z.string(),
    path: z.string(),
    icon: z.string(),
    permission: z.string().optional(),
    badge: z.string().optional(),
    children: z.array(NavigationItemSchema).optional(),
  }),
);

export const NavigationResponseSchema = z.object({
  items: z.array(NavigationItemSchema),
});
export type NavigationResponse = z.infer<typeof NavigationResponseSchema>;

export const NavigationConfigDtoSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  roleCode: z.string().nullable(),
  items: z.array(NavigationItemSchema),
  updatedAt: z.string().nullable(),
});
export type NavigationConfigDto = z.infer<typeof NavigationConfigDtoSchema>;

export const UpdateNavigationConfigDtoSchema = z.object({
  roleCode: z.string().min(1).max(64).nullable().optional(),
  items: z.array(NavigationItemSchema),
});
export type UpdateNavigationConfigDto = z.infer<typeof UpdateNavigationConfigDtoSchema>;

/**
 * Sample Tenant Entity (used for vertical slice testing)
 */
export const TestTenantRecordSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(100),
  content: z.string().optional().default(''),
  version: z.number().int().default(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().nullable().optional(),
});
export type TestTenantRecordDto = z.infer<typeof TestTenantRecordSchema>;

export const CreateTestTenantRecordSchema = z.object({
  title: z.string().min(1).max(100),
  content: z.string().optional().default(''),
  branchId: z.string().uuid().optional(),
});
export type CreateTestTenantRecordDto = z.infer<typeof CreateTestTenantRecordSchema>;

/**
 * Phase 2 — Property & Unit Contracts (REQ-PRP-001…008)
 */
export const PropertyTypeSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(100),
});
export type PropertyTypeDto = z.infer<typeof PropertyTypeSchema>;

export const AmenitySchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  code: z.string().min(1).max(30),
  name: z.string().min(1).max(100),
  icon: z.string().optional().nullable(),
  category: z.string().default('room'),
  sort: z.number().int().default(0),
});
export type AmenityDto = z.infer<typeof AmenitySchema>;

export const CreateAmenityDtoSchema = z.object({
  code: z.string().min(1).max(30),
  name: z.string().min(1).max(100),
  icon: z.string().optional().nullable(),
  category: z.string().optional().default('room'),
  sort: z.number().int().optional().default(0),
});
export type CreateAmenityDto = z.infer<typeof CreateAmenityDtoSchema>;

export const BuildingSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(100),
  sort: z.number().int().default(0),
});
export type BuildingDto = z.infer<typeof BuildingSchema>;

export const CreateBuildingDtoSchema = z.object({
  branchId: z.string().uuid(),
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(100),
  sort: z.number().int().optional().default(0),
});
export type CreateBuildingDto = z.infer<typeof CreateBuildingDtoSchema>;

export const FloorSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  buildingId: z.string().uuid().optional().nullable(),
  number: z.string().min(1).max(10),
  name: z.string().min(1).max(100),
  sort: z.number().int().default(0),
});
export type FloorDto = z.infer<typeof FloorSchema>;

export const CreateFloorDtoSchema = z.object({
  branchId: z.string().uuid(),
  buildingId: z.string().uuid().optional().nullable(),
  number: z.string().min(1).max(10),
  name: z.string().min(1).max(100),
  sort: z.number().int().optional().default(0),
});
export type CreateFloorDto = z.infer<typeof CreateFloorDtoSchema>;

export const UnitTypeSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(100),
  kind: z.enum(['room', 'suite', 'villa', 'apartment', 'dorm_bed', 'hall']).default('room'),
  maxAdults: z.number().int().min(1).default(2),
  maxChildren: z.number().int().min(0).default(0),
  maxOccupancy: z.number().int().min(1).default(2),
  baseRate: z.number().default(0),
  amenitiesIds: z.array(z.string().uuid()).default([]),
  sort: z.number().int().default(0),
  attrs: z.record(z.any()).default({}),
});
export type UnitTypeDto = z.infer<typeof UnitTypeSchema>;

export const CreateUnitTypeDtoSchema = z.object({
  branchId: z.string().uuid(),
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(100),
  kind: z.enum(['room', 'suite', 'villa', 'apartment', 'dorm_bed', 'hall']).default('room'),
  maxAdults: z.number().int().min(1).default(2),
  maxChildren: z.number().int().min(0).default(0),
  maxOccupancy: z.number().int().min(1).default(2),
  baseRate: z.number().default(0),
  amenitiesIds: z.array(z.string().uuid()).optional().default([]),
  sort: z.number().int().optional().default(0),
  attrs: z.record(z.any()).optional().default({}),
});
export type CreateUnitTypeDto = z.infer<typeof CreateUnitTypeDtoSchema>;

export const UnitSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  unitTypeId: z.string().uuid(),
  building: z.string().nullable().optional(),
  floor: z.string().nullable().optional(),
  number: z.string().min(1).max(20),
  name: z.string().nullable().optional(),
  statusCode: z.string().default('vacant_dirty'),
  statusChangedAt: z.string().datetime().optional(),
  isSellable: z.boolean().default(true),
  connectingUnitId: z.string().uuid().nullable().optional(),
  attrs: z.record(z.any()).default({}),
  version: z.number().int().default(1),
  deletedAt: z.string().datetime().nullable().optional(),
});
export type UnitDto = z.infer<typeof UnitSchema>;

export const CreateUnitDtoSchema = z.object({
  branchId: z.string().uuid(),
  unitTypeId: z.string().uuid(),
  building: z.string().optional(),
  floor: z.string().optional(),
  number: z.string().min(1).max(20),
  name: z.string().optional(),
  statusCode: z.string().optional().default('vacant_dirty'),
  isSellable: z.boolean().optional().default(true),
  connectingUnitId: z.string().uuid().optional(),
  attrs: z.record(z.any()).optional().default({}),
});
export type CreateUnitDto = z.infer<typeof CreateUnitDtoSchema>;

export const UpdateUnitDtoSchema = CreateUnitDtoSchema.partial();
export type UpdateUnitDto = z.infer<typeof UpdateUnitDtoSchema>;

export const BulkCreateUnitsDtoSchema = z.object({
  branchId: z.string().uuid(),
  unitTypeId: z.string().uuid(),
  building: z.string().optional(),
  floor: z.string().min(1),
  prefix: z.string().optional().default(''),
  startNumber: z.number().int().min(1),
  endNumber: z.number().int().min(1),
  padding: z.number().int().min(1).max(5).default(2),
  statusCode: z.string().optional().default('vacant_clean'),
});
export type BulkCreateUnitsDto = z.infer<typeof BulkCreateUnitsDtoSchema>;

export const ChangeUnitStatusDtoSchema = z.object({
  toStatus: z.string().min(1),
  reason: z.string().max(255).optional(),
});
export type ChangeUnitStatusDto = z.infer<typeof ChangeUnitStatusDtoSchema>;

export const CreateUnitBlockDtoSchema = z.object({
  branchId: z.string().uuid(),
  unitId: z.string().uuid().optional(),
  blockType: z.enum(['out_of_order', 'out_of_service']),
  reason: z.string().min(3).max(255),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(500).optional(),
});
export type CreateUnitBlockDto = z.infer<typeof CreateUnitBlockDtoSchema>;

export const UnitBlockSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  unitId: z.string().uuid(),
  blockType: z.enum(['out_of_order', 'out_of_service']),
  reason: z.string(),
  fromDate: z.string(),
  toDate: z.string(),
  notes: z.string().nullable().optional(),
  isActive: z.boolean(),
  createdBy: z.string().uuid().nullable().optional(),
  releasedAt: z.string().datetime().nullable().optional(),
});
export type UnitBlockDto = z.infer<typeof UnitBlockSchema>;

export const UnitStatusLogSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  unitId: z.string().uuid(),
  fromStatus: z.string(),
  toStatus: z.string(),
  reason: z.string().nullable().optional(),
  changedBy: z.string().uuid(),
  changedByName: z.string().optional(),
  createdAt: z.string().datetime(),
});
export type UnitStatusLogDto = z.infer<typeof UnitStatusLogSchema>;

/**
 * Compact Rooms Board Read Model (GET /branches/:branchId/board)
 */
export const BoardUnitSchema = z.object({
  id: z.string().uuid(),
  number: z.string(),
  name: z.string().nullable().optional(),
  floor: z.string().nullable().optional(),
  floorName: z.string().nullable().optional(),
  building: z.string().nullable().optional(),
  unitTypeId: z.string().uuid(),
  unitTypeCode: z.string(),
  unitTypeName: z.string(),
  statusCode: z.string(),
  statusLabel: z.string(),
  colorToken: z.string(),
  icon: z.string().optional(),
  isSellable: z.boolean(),
  isOccupied: z.boolean(),
  isDirty: z.boolean(),
  blocksBooking: z.boolean(),
  guestName: z.string().nullable().optional(),
  vipStatus: z.string().nullable().optional(),
  eta: z.string().nullable().optional(),
  etd: z.string().nullable().optional(),
  connectingUnitNumber: z.string().nullable().optional(),
  activeBlock: z
    .object({
      id: z.string().uuid(),
      blockType: z.string(),
      reason: z.string(),
      fromDate: z.string(),
      toDate: z.string(),
      notes: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
});
export type BoardUnitDto = z.infer<typeof BoardUnitSchema>;

export const BoardFloorGroupSchema = z.object({
  floor: z.string(),
  floorName: z.string(),
  building: z.string().nullable().optional(),
  units: z.array(BoardUnitSchema),
});
export type BoardFloorGroupDto = z.infer<typeof BoardFloorGroupSchema>;

export const BoardCountersSchema = z.object({
  total: z.number().int(),
  vacantClean: z.number().int(),
  vacantDirty: z.number().int(),
  inspected: z.number().int(),
  occupied: z.number().int(),
  dueIn: z.number().int(),
  dueOut: z.number().int(),
  reserved: z.number().int(),
  outOfOrder: z.number().int(),
  occupancyRate: z.number(), // percentage 0..100
});
export type BoardCountersDto = z.infer<typeof BoardCountersSchema>;

export const BoardResponseSchema = z.object({
  branchId: z.string().uuid(),
  branchName: z.string(),
  businessDate: z.string(),
  counters: BoardCountersSchema,
  floors: z.array(BoardFloorGroupSchema),
  generatedAt: z.string().datetime(),
  etag: z.string(),
});
export type BoardResponseDto = z.infer<typeof BoardResponseSchema>;

/**
 * Phase 3 — Guests & Company Accounts (REQ-GST-001…004)
 */
export const GuestSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().nullable().optional(),
  emailNormalized: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  phoneE164: z.string().nullable().optional(),
  birthDate: z.string().nullable().optional(),
  nationality: z.string().length(2).nullable().optional(),
  vipStatus: z.enum(['standard', 'silver', 'gold', 'platinum', 'blacklist']).default('standard'),
  notes: z.string().nullable().optional(),
  attrs: z.record(z.any()).default({}),
  isPseudonymized: z.boolean().default(false),
  mergedIntoId: z.string().uuid().nullable().optional(),
  version: z.number().int().default(1),
  createdAt: z.string().datetime(),
});
export type GuestDto = z.infer<typeof GuestSchema>;

export const CreateGuestDtoSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  birthDate: z.string().optional(),
  nationality: z.string().length(2).optional(),
  vipStatus: z.enum(['standard', 'silver', 'gold', 'platinum', 'blacklist']).optional(),
  notes: z.string().optional(),
  attrs: z.record(z.any()).optional(),
});
export type CreateGuestDto = z.infer<typeof CreateGuestDtoSchema>;

export const UpdateGuestDtoSchema = CreateGuestDtoSchema.partial();
export type UpdateGuestDto = z.infer<typeof UpdateGuestDtoSchema>;

export const MergeGuestsDtoSchema = z.object({
  sourceGuestId: z.string().uuid(),
  targetGuestId: z.string().uuid(),
  reason: z.string().min(3).max(255),
});
export type MergeGuestsDto = z.infer<typeof MergeGuestsDtoSchema>;

export const CompanySchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string().min(1).max(150),
  taxIdentifier: z.string().nullable().optional(),
  billingEmail: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  address: z.record(z.any()).default({}),
  creditLimit: z.number().default(0),
  creditTermsDays: z.number().int().default(30),
  isActive: z.boolean().default(true),
  attrs: z.record(z.any()).default({}),
  version: z.number().int().default(1),
  createdAt: z.string().datetime(),
});
export type CompanyDto = z.infer<typeof CompanySchema>;

export const CreateCompanyDtoSchema = z.object({
  name: z.string().min(1).max(150),
  taxIdentifier: z.string().optional(),
  billingEmail: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.record(z.any()).optional().default({}),
  creditLimit: z.number().optional().default(0),
  creditTermsDays: z.number().int().optional().default(30),
  attrs: z.record(z.any()).optional().default({}),
});
export type CreateCompanyDto = z.infer<typeof CreateCompanyDtoSchema>;

/**
 * Phase 3 — Taxes, Charge Codes & Rates Engine (REQ-RAT-001…004)
 */
export const TaxSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(100),
  ratePct: z.number(),
  isFlatAmount: z.boolean().default(false),
  flatAmount: z.number().default(0),
  currency: z.string().length(3).optional().nullable(),
  glAccountCode: z.string(),
  isActive: z.boolean().default(true),
});
export type TaxDto = z.infer<typeof TaxSchema>;

export const CreateTaxDtoSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(100),
  ratePct: z.number(),
  isFlatAmount: z.boolean().optional().default(false),
  flatAmount: z.number().optional().default(0),
  currency: z.string().length(3).optional(),
  glAccountCode: z.string().default('2100'),
  isActive: z.boolean().optional().default(true),
});
export type CreateTaxDto = z.infer<typeof CreateTaxDtoSchema>;

export const TaxRuleSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid().nullable().optional(),
  code: z.string().min(1).max(30),
  name: z.string().min(1).max(100),
  isInclusive: z.boolean().default(false),
  calculationOrder: z.number().int().default(1),
  compoundsPrevious: z.boolean().default(false),
  taxIds: z.array(z.string().uuid()).default([]),
});
export type TaxRuleDto = z.infer<typeof TaxRuleSchema>;

export const CreateTaxRuleDtoSchema = z.object({
  branchId: z.string().uuid().optional(),
  code: z.string().min(1).max(30),
  name: z.string().min(1).max(100),
  isInclusive: z.boolean().optional().default(false),
  calculationOrder: z.number().int().optional().default(1),
  compoundsPrevious: z.boolean().optional().default(false),
  taxIds: z.array(z.string().uuid()),
});
export type CreateTaxRuleDto = z.infer<typeof CreateTaxRuleDtoSchema>;

export const ChargeCodeSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid().nullable().optional(),
  code: z.string().min(1).max(30),
  name: z.string().min(1).max(100),
  chargeGroup: z.enum(['room', 'fnb', 'laundry', 'telephone', 'spa', 'misc', 'tax', 'service']),
  taxRuleId: z.string().uuid().nullable().optional(),
  glAccountCode: z.string(),
  allowDiscount: z.boolean().default(true),
  department: z.string().default('rooms'),
  isActive: z.boolean().default(true),
});
export type ChargeCodeDto = z.infer<typeof ChargeCodeSchema>;

export const RatePlanSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(100),
  currency: z.string().length(3).default('USD'),
  isActive: z.boolean().default(true),
  policyCancellation: z.record(z.any()).default({}),
  policyDeposit: z.record(z.any()).default({}),
  policyNoShow: z.record(z.any()).default({}),
  attrs: z.record(z.any()).default({}),
});
export type RatePlanDto = z.infer<typeof RatePlanSchema>;

export const CreateRatePlanDtoSchema = z.object({
  branchId: z.string().uuid(),
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(100),
  currency: z.string().length(3).default('USD'),
  isActive: z.boolean().optional().default(true),
  policyCancellation: z.record(z.any()).optional().default({}),
  policyDeposit: z.record(z.any()).optional().default({}),
  policyNoShow: z.record(z.any()).optional().default({}),
  attrs: z.record(z.any()).optional().default({}),
});
export type CreateRatePlanDto = z.infer<typeof CreateRatePlanDtoSchema>;

export const RateCalendarEntrySchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  ratePlanId: z.string().uuid(),
  unitTypeId: z.string().uuid(),
  stayDate: z.string(),
  rate: z.number(),
  singleOccupancyRate: z.number().nullable().optional(),
  extraAdultRate: z.number().default(0),
  extraChildRate: z.number().default(0),
});
export type RateCalendarEntryDto = z.infer<typeof RateCalendarEntrySchema>;

export const SetRateCalendarDtoSchema = z.object({
  branchId: z.string().uuid(),
  ratePlanId: z.string().uuid(),
  unitTypeId: z.string().uuid(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rate: z.number().min(0),
  singleOccupancyRate: z.number().min(0).optional(),
  extraAdultRate: z.number().min(0).optional().default(0),
  extraChildRate: z.number().min(0).optional().default(0),
});
export type SetRateCalendarDto = z.infer<typeof SetRateCalendarDtoSchema>;

export const RestrictionSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  ratePlanId: z.string().uuid(),
  unitTypeId: z.string().uuid().nullable().optional(),
  stayDate: z.string(),
  minLos: z.number().int().nullable().optional(),
  maxLos: z.number().int().nullable().optional(),
  closedToArrival: z.boolean().default(false),
  closedToDeparture: z.boolean().default(false),
  stopSell: z.boolean().default(false),
});
export type RestrictionDto = z.infer<typeof RestrictionSchema>;

export const SetRestrictionsDtoSchema = z.object({
  branchId: z.string().uuid(),
  ratePlanId: z.string().uuid(),
  unitTypeId: z.string().uuid().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  minLos: z.number().int().optional(),
  maxLos: z.number().int().optional(),
  closedToArrival: z.boolean().optional().default(false),
  closedToDeparture: z.boolean().optional().default(false),
  stopSell: z.boolean().optional().default(false),
});
export type SetRestrictionsDto = z.infer<typeof SetRestrictionsDtoSchema>;

/**
 * Phase 3 — Price Quote Contract (REQ-RSV-001)
 */
export const PriceQuoteRequestSchema = z.object({
  branchId: z.string().uuid(),
  unitTypeId: z.string().uuid(),
  ratePlanId: z.string().uuid(),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adults: z.number().int().min(1).default(1),
  children: z.number().int().min(0).default(0),
});
export type PriceQuoteRequestDto = z.infer<typeof PriceQuoteRequestSchema>;

export const NightlyTaxDetailSchema = z.object({
  taxCode: z.string(),
  name: z.string(),
  ratePct: z.number(),
  amount: z.number(),
});
export type NightlyTaxDetailDto = z.infer<typeof NightlyTaxDetailSchema>;

export const NightlyRateBreakdownSchema = z.object({
  stayDate: z.string(),
  baseRate: z.number(),
  extraAdultsRate: z.number(),
  extraChildrenRate: z.number(),
  roomRate: z.number(),
  taxes: z.array(NightlyTaxDetailSchema),
  taxAmount: z.number(),
  nightTotal: z.number(),
});
export type NightlyRateBreakdownDto = z.infer<typeof NightlyRateBreakdownSchema>;

export const PriceQuoteResponseSchema = z.object({
  branchId: z.string().uuid(),
  unitTypeId: z.string().uuid(),
  unitTypeName: z.string(),
  ratePlanId: z.string().uuid(),
  ratePlanName: z.string(),
  currency: z.string(),
  checkIn: z.string(),
  checkOut: z.string(),
  nightsCount: z.number().int(),
  adults: z.number().int(),
  children: z.number().int(),
  nightlyBreakdown: z.array(NightlyRateBreakdownSchema),
  subtotal: z.number(),
  totalTaxes: z.number(),
  totalAmount: z.number(),
  policySnapshot: z.record(z.any()),
  isAvailable: z.boolean(),
  availableUnitsCount: z.number().int(),
});
export type PriceQuoteResponseDto = z.infer<typeof PriceQuoteResponseSchema>;

/**
 * Phase 3 — Availability Search Contract (REQ-RSV-001)
 */
export const AvailabilitySearchRequestSchema = z.object({
  branchId: z.string().uuid(),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adults: z.coerce.number().int().min(1).default(2),
  children: z.coerce.number().int().min(0).default(0),
  unitTypeId: z.string().uuid().optional(),
});
export type AvailabilitySearchRequestDto = z.infer<typeof AvailabilitySearchRequestSchema>;

export const AvailableRatePlanOptionSchema = z.object({
  ratePlanId: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  currency: z.string(),
  totalAmount: z.number(),
  averageNightlyRate: z.number(),
  isAvailable: z.boolean(),
  cancellationSummary: z.string().optional(),
});
export type AvailableRatePlanOptionDto = z.infer<typeof AvailableRatePlanOptionSchema>;

export const AvailabilityUnitTypeResultSchema = z.object({
  unitTypeId: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  kind: z.string(),
  maxAdults: z.number().int(),
  maxOccupancy: z.number().int(),
  availableUnitsCount: z.number().int(),
  ratePlans: z.array(AvailableRatePlanOptionSchema),
});
export type AvailabilityUnitTypeResultDto = z.infer<typeof AvailabilityUnitTypeResultSchema>;

export const AvailabilityResponseSchema = z.object({
  branchId: z.string().uuid(),
  checkIn: z.string(),
  checkOut: z.string(),
  nightsCount: z.number().int(),
  results: z.array(AvailabilityUnitTypeResultSchema),
});
export type AvailabilityResponseDto = z.infer<typeof AvailabilityResponseSchema>;

/**
 * Phase 3 — Reservations & Booking Lifecycle (REQ-RSV-002…008)
 */
export const ReservationUnitItemInputSchema = z.object({
  unitTypeId: z.string().uuid(),
  unitId: z.string().uuid().optional(),
  ratePlanId: z.string().uuid(),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adults: z.number().int().min(1).default(1),
  children: z.number().int().min(0).default(0),
});
export type ReservationUnitItemInput = z.infer<typeof ReservationUnitItemInputSchema>;

export const CreateReservationDtoSchema = z.object({
  branchId: z.string().uuid(),
  guestId: z.string().uuid().optional(),
  guest: z
    .object({
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      email: z.string().email().optional(),
      phone: z.string().optional(),
    })
    .optional(),
  companyId: z.string().uuid().optional(),
  source: z.string().optional().default('direct'),
  channelRef: z.string().optional(),
  units: z.array(ReservationUnitItemInputSchema).min(1),
  notes: z.string().optional(),
  attrs: z.record(z.any()).optional(),
});
export type CreateReservationDto = z.infer<typeof CreateReservationDtoSchema>;

export const WalkInBookingDtoSchema = z.object({
  branchId: z.string().uuid(),
  unitId: z.string().uuid(),
  unitTypeId: z.string().uuid().optional(),
  ratePlanId: z.string().uuid().optional(),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adults: z.number().int().min(1).default(1),
  children: z.number().int().min(0).default(0),
  guest: z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.string().email().optional(),
    phone: z.string().optional(),
  }),
  notes: z.string().optional(),
});
export type WalkInBookingDto = z.infer<typeof WalkInBookingDtoSchema>;

export const ModifyReservationDtoSchema = z.object({
  status: z
    .enum(['hold', 'confirmed', 'in_house', 'checked_out', 'cancelled', 'no_show'])
    .optional(),
  notes: z.string().optional(),
  guestId: z.string().uuid().optional(),
});
export type ModifyReservationDto = z.infer<typeof ModifyReservationDtoSchema>;

export const ReservationUnitItemSchema = z.object({
  id: z.string().uuid(),
  reservationId: z.string().uuid(),
  unitTypeId: z.string().uuid(),
  unitTypeCode: z.string(),
  unitTypeName: z.string(),
  unitId: z.string().uuid().nullable().optional(),
  unitNumber: z.string().nullable().optional(),
  ratePlanId: z.string().uuid(),
  ratePlanCode: z.string(),
  ratePlanName: z.string(),
  checkIn: z.string(),
  checkOut: z.string(),
  adults: z.number().int(),
  children: z.number().int(),
  status: z.string(),
  totalRate: z.number(),
  nights: z.array(
    z.object({
      stayDate: z.string(),
      rate: z.number(),
      taxSnapshot: z.array(z.any()),
    }),
  ),
});
export type ReservationUnitItemDto = z.infer<typeof ReservationUnitItemSchema>;

export const ReservationDtoSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  reservationNo: z.string(),
  status: z.enum(['hold', 'confirmed', 'in_house', 'checked_out', 'cancelled', 'no_show']),
  guestId: z.string().uuid(),
  guestName: z.string(),
  guestEmail: z.string().nullable().optional(),
  guestPhone: z.string().nullable().optional(),
  companyId: z.string().uuid().nullable().optional(),
  companyName: z.string().nullable().optional(),
  source: z.string(),
  channelRef: z.string().nullable().optional(),
  holdExpiresAt: z.string().datetime().nullable().optional(),
  policySnapshot: z.record(z.any()),
  notes: z.string().nullable().optional(),
  attrs: z.record(z.any()),
  version: z.number().int(),
  totalAmount: z.number(),
  totalNights: z.number().int(),
  units: z.array(ReservationUnitItemSchema),
  createdAt: z.string().datetime(),
});
export type ReservationDto = z.infer<typeof ReservationDtoSchema>;

/**
 * ============================================================================
 * PHASE 4 CONTRACTS: Front Desk, Folios, Night Audit & Housekeeping Operations
 * ============================================================================
 */

// --- 1. Stays & Operations ---
export const CheckInDtoSchema = z.object({
  reservationId: z.string().uuid(),
  reservationUnitId: z.string().uuid(),
  unitId: z.string().uuid(),
  keycardCode: z.string().min(1).max(50).optional(),
  registrationCardAccepted: z.boolean().default(true),
  notes: z.string().optional(),
});
export type CheckInDto = z.infer<typeof CheckInDtoSchema>;

export const RoomMoveDtoSchema = z.object({
  newUnitId: z.string().uuid(),
  reason: z.string().min(3).max(255),
});
export type RoomMoveDto = z.infer<typeof RoomMoveDtoSchema>;

export const StayExtensionDtoSchema = z.object({
  newExpectedCheckOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().optional(),
});
export type StayExtensionDto = z.infer<typeof StayExtensionDtoSchema>;

export const CheckOutDtoSchema = z.object({
  settlementType: z
    .enum(['direct_settlement', 'charge_to_company', 'zero_balance'])
    .default('zero_balance'),
  notes: z.string().optional(),
});
export type CheckOutDto = z.infer<typeof CheckOutDtoSchema>;

export const StayDtoSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  reservationId: z.string().uuid(),
  reservationUnitId: z.string().uuid(),
  unitId: z.string().uuid(),
  unitNumber: z.string().optional(),
  unitTypeName: z.string().optional(),
  guestId: z.string().uuid(),
  guestName: z.string().optional(),
  actualCheckIn: z.string(),
  expectedCheckOut: z.string(),
  actualCheckOut: z.string().nullable().optional(),
  status: z.enum(['in_house', 'checked_out']),
  keycardCode: z.string().nullable().optional(),
  registrationCardSigned: z.boolean().default(false),
  folioId: z.string().uuid().nullable().optional(),
  folioBalance: z.number().optional(),
  reservationNo: z.string().optional(),
  version: z.number().int(),
  createdAt: z.string(),
});
export type StayDto = z.infer<typeof StayDtoSchema>;

// --- 2. Folios & Lines ---
export const PostFolioLineDtoSchema = z.object({
  windowNo: z.number().int().min(1).max(4).default(1),
  lineType: z.enum(['charge', 'payment', 'adjustment', 'tax']).default('charge'),
  chargeType: z.enum([
    'room',
    'night_tax',
    'fnb',
    'minibar',
    'spa',
    'laundry',
    'misc',
    'payment',
    'round_off',
    'city_ledger',
    'deposit_transfer',
  ]),
  chargeCodeId: z.string().uuid().optional(),
  description: z.string().min(2).max(255),
  qty: z.number().default(1),
  unitAmount: z.number(),
  taxAmount: z.number().default(0),
});
export type PostFolioLineDto = z.infer<typeof PostFolioLineDtoSchema>;

export const VoidFolioLineDtoSchema = z.object({
  reason: z.string().min(3).max(255),
});
export type VoidFolioLineDto = z.infer<typeof VoidFolioLineDtoSchema>;

export const TransferFolioLineDtoSchema = z.object({
  targetWindowNo: z.number().int().min(1).max(4),
  targetFolioId: z.string().uuid().optional(),
});
export type TransferFolioLineDto = z.infer<typeof TransferFolioLineDtoSchema>;

export const FolioLineDtoSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  folioId: z.string().uuid(),
  stayId: z.string().uuid().nullable().optional(),
  windowNo: z.number().int(),
  businessDate: z.string(),
  lineType: z.enum(['charge', 'payment', 'adjustment', 'tax']),
  chargeType: z.string(),
  chargeCodeId: z.string().uuid().nullable().optional(),
  description: z.string(),
  qty: z.number(),
  unitAmount: z.number(),
  amount: z.number(),
  taxAmount: z.number(),
  reversesLineId: z.string().uuid().nullable().optional(),
  paymentIntentId: z.string().uuid().nullable().optional(),
  createdAt: z.string(),
});
export type FolioLineDto = z.infer<typeof FolioLineDtoSchema>;

export const FolioDtoSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  folioNo: z.string(),
  kind: z.enum(['guest', 'master', 'company', 'non_guest']),
  stayId: z.string().uuid().nullable().optional(),
  reservationId: z.string().uuid().nullable().optional(),
  companyId: z.string().uuid().nullable().optional(),
  status: z.enum(['open', 'closed', 'voided']),
  currency: z.string(),
  totalCharges: z.number(),
  totalPayments: z.number(),
  balance: z.number(),
  version: z.number().int(),
  createdAt: z.string(),
  lines: z.array(FolioLineDtoSchema).optional(),
});
export type FolioDto = z.infer<typeof FolioDtoSchema>;

// --- 3. Payments (PCI DSS Tokenized) ---
export const RecordPaymentDtoSchema = z.object({
  windowNo: z.number().int().min(1).max(4).default(1),
  amount: z.number().positive(),
  paymentMethod: z.enum(['card', 'cash', 'bank_transfer', 'city_ledger']),
  cardToken: z.string().optional(), // PCI Token
  cardBrand: z.string().optional(),
  lastFour: z.string().length(4).optional(),
  cardHolder: z.string().optional(),
  reference: z.string().optional(),
});
export type RecordPaymentDto = z.infer<typeof RecordPaymentDtoSchema>;

export const PaymentDtoSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  folioId: z.string().uuid(),
  amount: z.number(),
  currency: z.string(),
  method: z.string(),
  cardBrand: z.string().nullable().optional(),
  lastFour: z.string().nullable().optional(),
  status: z.string(),
  createdAt: z.string(),
});
export type PaymentDto = z.infer<typeof PaymentDtoSchema>;

// --- 4. Night Audit ---
export const TriggerNightAuditDtoSchema = z.object({
  force: z.boolean().default(false),
});
export type TriggerNightAuditDto = z.infer<typeof TriggerNightAuditDtoSchema>;

export const NightAuditStepDtoSchema = z.object({
  id: z.string().uuid().optional(),
  stepKey: z.enum([
    'pre_checks',
    'room_tax_posting',
    'fee_posting',
    'date_roll',
    'gl_vouchering',
    'kpi_snapshot',
  ]),
  status: z.enum(['pending', 'in_progress', 'completed', 'failed', 'skipped']),
  startedAt: z.string().nullable().optional(),
  finishedAt: z.string().nullable().optional(),
  details: z.record(z.any()).optional(),
  errorMessage: z.string().nullable().optional(),
});
export type NightAuditStepDto = z.infer<typeof NightAuditStepDtoSchema>;

export const NightAuditDtoSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  businessDate: z.string(),
  status: z.enum(['pending', 'in_progress', 'completed', 'failed']),
  startedAt: z.string(),
  completedAt: z.string().nullable().optional(),
  steps: z.array(NightAuditStepDtoSchema),
});
export type NightAuditDto = z.infer<typeof NightAuditDtoSchema>;

export const KpiSnapshotDtoSchema = z.object({
  id: z.string().uuid().optional(),
  businessDate: z.string(),
  totalRooms: z.number().int(),
  roomsOccupied: z.number().int(),
  occupancyRate: z.number(),
  adr: z.number(),
  revpar: z.number(),
  totalRevenue: z.number(),
  roomRevenue: z.number(),
  fnbRevenue: z.number(),
  otherRevenue: z.number(),
});
export type KpiSnapshotDto = z.infer<typeof KpiSnapshotDtoSchema>;

// --- 5. Housekeeping & Maintenance ---
export const HkChecklistItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  mandatory: z.boolean().default(true),
  checked: z.boolean().optional(),
});
export type HkChecklistItem = z.infer<typeof HkChecklistItemSchema>;

export const HkTaskDtoSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  unitId: z.string().uuid(),
  unitNumber: z.string().optional(),
  floor: z.string().optional(),
  taskType: z.enum([
    'checkout_clean',
    'stayover_clean',
    'deep_clean',
    'touchup',
    'turndown',
    'inspection',
  ]),
  priority: z.enum(['low', 'standard', 'high', 'rush']),
  status: z.enum(['pending', 'in_progress', 'completed', 'inspected', 'rejected']),
  assignedUserId: z.string().uuid().nullable().optional(),
  assignedUserName: z.string().nullable().optional(),
  checklistId: z.string().uuid().nullable().optional(),
  checklistItems: z.array(HkChecklistItemSchema).optional(),
  notes: z.string().nullable().optional(),
  startedAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  inspectedAt: z.string().nullable().optional(),
  createdAt: z.string(),
});
export type HkTaskDto = z.infer<typeof HkTaskDtoSchema>;

export const UpdateHkTaskStatusDtoSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'completed', 'inspected', 'rejected']),
  notes: z.string().optional(),
  checklistAnswers: z.record(z.boolean()).optional(),
});
export type UpdateHkTaskStatusDto = z.infer<typeof UpdateHkTaskStatusDtoSchema>;

export const PostMinibarChargeDtoSchema = z.object({
  stayId: z.string().uuid().optional(),
  unitId: z.string().uuid().optional(),
  windowNo: z.number().int().min(1).max(4).default(1),
  itemName: z.string().min(2),
  qty: z.number().int().positive().default(1),
  unitAmount: z.number().positive(),
});
export type PostMinibarChargeDto = z.infer<typeof PostMinibarChargeDtoSchema>;

export const MaintenanceOrderDtoSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  unitId: z.string().uuid(),
  unitNumber: z.string().optional(),
  title: z.string().min(3),
  description: z.string().min(3),
  priority: z.enum(['low', 'medium', 'high', 'emergency']),
  status: z.enum(['reported', 'in_progress', 'resolved', 'cancelled']),
  reportedBy: z.string().uuid(),
  assignedTo: z.string().uuid().nullable().optional(),
  createdAt: z.string(),
});
export type MaintenanceOrderDto = z.infer<typeof MaintenanceOrderDtoSchema>;

export const LostFoundDtoSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  itemName: z.string().min(2),
  category: z.enum(['electronics', 'clothing', 'jewelry', 'documents', 'bags', 'other']),
  foundLocation: z.string(),
  foundUnitId: z.string().uuid().nullable().optional(),
  foundUnitNumber: z.string().optional(),
  foundDate: z.string(),
  status: z.enum(['found', 'held', 'claimed', 'disposed']),
  storageLocation: z.string(),
  claimedBy: z.string().nullable().optional(),
  claimedAt: z.string().nullable().optional(),
  createdAt: z.string(),
});
export type LostFoundDto = z.infer<typeof LostFoundDtoSchema>;

/**
 * ============================================================================
 * PHASE 5 CONTRACTS: Accounting with Vouchering (REQ-ACC-001...018)
 * ============================================================================
 */

// --- 1. Chart of Accounts (USALI) ---
export const AccountClassSchema = z.enum([
  'asset',
  'liability',
  'equity',
  'revenue',
  'cogs',
  'expense',
]);
export type AccountClass = z.infer<typeof AccountClassSchema>;

export const NormalBalanceSchema = z.enum(['debit', 'credit']);
export type NormalBalance = z.infer<typeof NormalBalanceSchema>;

export const AccountDtoSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(100),
  accountClass: AccountClassSchema,
  accountGroup: z.string(),
  normalBalance: NormalBalanceSchema,
  isControlAccount: z.boolean().default(false),
  controlType: z
    .enum(['guest_ledger', 'city_ledger', 'accounts_payable', 'inventory', 'customer_deposits'])
    .nullable()
    .optional(),
  parentId: z.string().uuid().nullable().optional(),
  isReconciliationActive: z.boolean().default(true),
  isActive: z.boolean().default(true),
  currentBalance: z.number().optional(),
  createdAt: z.string(),
});
export type AccountDto = z.infer<typeof AccountDtoSchema>;

export const CreateAccountDtoSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(100),
  accountClass: AccountClassSchema,
  accountGroup: z.string().min(1),
  normalBalance: NormalBalanceSchema,
  isControlAccount: z.boolean().default(false),
  controlType: z
    .enum(['guest_ledger', 'city_ledger', 'accounts_payable', 'inventory', 'customer_deposits'])
    .optional(),
  parentId: z.string().uuid().optional(),
});
export type CreateAccountDto = z.infer<typeof CreateAccountDtoSchema>;

// --- 2. Fiscal Calendar ---
export const FiscalYearDtoSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  status: z.enum(['open', 'closed']),
});
export type FiscalYearDto = z.infer<typeof FiscalYearDtoSchema>;

export const FiscalPeriodDtoSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  fiscalYearId: z.string().uuid(),
  periodNo: z.number().int().min(1).max(12),
  name: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  status: z.enum(['open', 'soft_closed', 'closed']),
  closedAt: z.string().nullable().optional(),
});
export type FiscalPeriodDto = z.infer<typeof FiscalPeriodDtoSchema>;

export const ClosePeriodDtoSchema = z.object({
  status: z.enum(['open', 'soft_closed', 'closed']),
  notes: z.string().optional(),
});
export type ClosePeriodDto = z.infer<typeof ClosePeriodDtoSchema>;

// --- 3. Vouchers & Lines ---
export const VoucherTypeSchema = z.enum([
  'JV',
  'RV',
  'PV',
  'CV',
  'SV',
  'PB',
  'DN',
  'CN',
  'OB',
  'SYS',
]);
export type VoucherType = z.infer<typeof VoucherTypeSchema>;

export const VoucherStatusSchema = z.enum([
  'draft',
  'submitted',
  'approved',
  'posted',
  'cancelled',
]);
export type VoucherStatus = z.infer<typeof VoucherStatusSchema>;

export const VoucherLineInputSchema = z.object({
  accountId: z.string().uuid(),
  description: z.string().optional(),
  debit: z.number().min(0).default(0),
  credit: z.number().min(0).default(0),
  currency: z.string().length(3).default('USD'),
  partyType: z.enum(['guest', 'company', 'supplier', 'employee']).optional(),
  partyId: z.string().uuid().optional(),
});
export type VoucherLineInput = z.infer<typeof VoucherLineInputSchema>;

export const VoucherLineDtoSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  voucherId: z.string().uuid(),
  lineNo: z.number().int(),
  accountId: z.string().uuid(),
  accountCode: z.string().optional(),
  accountName: z.string().optional(),
  description: z.string().nullable().optional(),
  debit: z.number(),
  credit: z.number(),
  currency: z.string(),
  partyType: z.string().nullable().optional(),
  partyId: z.string().uuid().nullable().optional(),
  createdAt: z.string(),
});
export type VoucherLineDto = z.infer<typeof VoucherLineDtoSchema>;

export const CreateVoucherDtoSchema = z.object({
  branchId: z.string().uuid(),
  voucherType: VoucherTypeSchema,
  postingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().min(3).max(255),
  sourceType: z.string().optional(),
  sourceId: z.string().uuid().optional(),
  lines: z.array(VoucherLineInputSchema).min(2),
  autoPost: z.boolean().default(false),
});
export type CreateVoucherDto = z.infer<typeof CreateVoucherDtoSchema>;

export const VoucherDtoSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  voucherNo: z.string().nullable().optional(),
  voucherType: VoucherTypeSchema,
  status: VoucherStatusSchema,
  postingDate: z.string(),
  fiscalPeriodId: z.string().uuid().nullable().optional(),
  fiscalPeriodName: z.string().optional(),
  description: z.string(),
  sourceType: z.string().nullable().optional(),
  sourceId: z.string().uuid().nullable().optional(),
  reversalOf: z.string().uuid().nullable().optional(),
  reversedBy: z.string().uuid().nullable().optional(),
  totalDebit: z.number(),
  totalCredit: z.number(),
  createdBy: z.string().uuid(),
  approvedBy: z.string().uuid().nullable().optional(),
  postedBy: z.string().uuid().nullable().optional(),
  postedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  lines: z.array(VoucherLineDtoSchema).optional(),
});
export type VoucherDto = z.infer<typeof VoucherDtoSchema>;

export const ReverseVoucherDtoSchema = z.object({
  reason: z.string().min(3).max(255),
  postingDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
export type ReverseVoucherDto = z.infer<typeof ReverseVoucherDtoSchema>;

// --- 4. General Ledger & Financial Reports ---
export const GlEntryDtoSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  voucherId: z.string().uuid(),
  voucherLineId: z.string().uuid(),
  voucherNo: z.string(),
  voucherType: z.string(),
  postingDate: z.string(),
  fiscalPeriodId: z.string().uuid(),
  accountId: z.string().uuid(),
  accountCode: z.string(),
  accountName: z.string().optional(),
  debit: z.number(),
  credit: z.number(),
  description: z.string().nullable().optional(),
  sourceType: z.string().nullable().optional(),
  createdAt: z.string(),
});
export type GlEntryDto = z.infer<typeof GlEntryDtoSchema>;

export const TrialBalanceItemDtoSchema = z.object({
  accountId: z.string().uuid(),
  accountCode: z.string(),
  accountName: z.string(),
  accountClass: AccountClassSchema,
  openingBalance: z.number(),
  periodDebit: z.number(),
  periodCredit: z.number(),
  closingDebit: z.number(),
  closingCredit: z.number(),
});
export type TrialBalanceItemDto = z.infer<typeof TrialBalanceItemDtoSchema>;

export const TrialBalanceReportDtoSchema = z.object({
  branchId: z.string().uuid(),
  fiscalPeriodId: z.string().uuid().optional(),
  periodName: z.string(),
  asOfDate: z.string(),
  items: z.array(TrialBalanceItemDtoSchema),
  totalDebit: z.number(),
  totalCredit: z.number(),
  isBalanced: z.boolean(),
});
export type TrialBalanceReportDto = z.infer<typeof TrialBalanceReportDtoSchema>;

export const GeneralLedgerReportDtoSchema = z.object({
  accountId: z.string().uuid(),
  accountCode: z.string(),
  accountName: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  openingBalance: z.number(),
  entries: z.array(GlEntryDtoSchema),
  totalDebit: z.number(),
  totalCredit: z.number(),
  closingBalance: z.number(),
});
export type GeneralLedgerReportDto = z.infer<typeof GeneralLedgerReportDtoSchema>;

export const UsaliPnlReportDtoSchema = z.object({
  branchId: z.string().uuid(),
  periodName: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  roomsRevenue: z.number(),
  fnbRevenue: z.number(),
  otherRevenue: z.number(),
  totalRevenue: z.number(),
  roomsExpenses: z.number(),
  fnbExpenses: z.number(),
  cogsTotal: z.number(),
  adminExpenses: z.number(),
  utilitiesExpenses: z.number(),
  maintenanceExpenses: z.number(),
  totalOperatingExpenses: z.number(),
  gop: z.number(), // Gross Operating Profit
  netIncome: z.number(),
});
export type UsaliPnlReportDto = z.infer<typeof UsaliPnlReportDtoSchema>;

// ============================================================================
// PHASE 6: INVENTORY & PURCHASING SCHEMAS & DTOS (REQ-INV-001..010)
// ============================================================================

// 1. Units of Measure
export const UomDtoSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  category: z.enum(['mass', 'volume', 'count', 'length', 'time']),
  createdAt: z.string(),
});
export type UomDto = z.infer<typeof UomDtoSchema>;

export const CreateUomDtoSchema = z.object({
  code: z.string().min(1).max(10),
  name: z.string().min(1),
  category: z.enum(['mass', 'volume', 'count', 'length', 'time']),
});
export type CreateUomDto = z.infer<typeof CreateUomDtoSchema>;

// 2. Item Categories
export const ItemCategoryDtoSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  parentId: z.string().uuid().nullable().optional(),
  defaultValuationMethod: z.enum(['wac', 'fifo']),
  glInventoryAccountId: z.string().uuid().nullable().optional(),
  glCogsAccountId: z.string().uuid().nullable().optional(),
  glExpenseAccountId: z.string().uuid().nullable().optional(),
  createdAt: z.string(),
});
export type ItemCategoryDto = z.infer<typeof ItemCategoryDtoSchema>;

export const CreateItemCategoryDtoSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1),
  parentId: z.string().uuid().optional(),
  defaultValuationMethod: z.enum(['wac', 'fifo']).default('wac'),
  glInventoryAccountId: z.string().uuid().optional(),
  glCogsAccountId: z.string().uuid().optional(),
  glExpenseAccountId: z.string().uuid().optional(),
});
export type CreateItemCategoryDto = z.infer<typeof CreateItemCategoryDtoSchema>;

// 3. Storage Warehouses
export const WarehouseDtoSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  warehouseType: z.enum(['central', 'kitchen', 'bar', 'housekeeping', 'minibar', 'in_transit']),
  negativeStockPolicy: z.enum(['block', 'warn', 'allow']),
  isActive: z.boolean(),
  createdAt: z.string(),
});
export type WarehouseDto = z.infer<typeof WarehouseDtoSchema>;

export const CreateWarehouseDtoSchema = z.object({
  branchId: z.string().uuid(),
  code: z.string().min(1).max(20),
  name: z.string().min(1),
  warehouseType: z
    .enum(['central', 'kitchen', 'bar', 'housekeeping', 'minibar', 'in_transit'])
    .default('central'),
  negativeStockPolicy: z.enum(['block', 'warn', 'allow']).default('block'),
});
export type CreateWarehouseDto = z.infer<typeof CreateWarehouseDtoSchema>;

// 4. Suppliers
export const SupplierDtoSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  contactPerson: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  taxId: z.string().nullable().optional(),
  paymentTermsDays: z.number().int(),
  currency: z.string(),
  isActive: z.boolean(),
  createdAt: z.string(),
});
export type SupplierDto = z.infer<typeof SupplierDtoSchema>;

export const CreateSupplierDtoSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1),
  contactPerson: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  taxId: z.string().optional(),
  paymentTermsDays: z.number().int().default(30),
  currency: z.string().default('USD'),
});
export type CreateSupplierDto = z.infer<typeof CreateSupplierDtoSchema>;

// 5. Item Catalog
export const ItemDtoSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  categoryId: z.string().uuid(),
  categoryName: z.string().optional(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  baseUomId: z.string().uuid(),
  baseUomCode: z.string().optional(),
  purchaseUomId: z.string().uuid().nullable().optional(),
  valuationMethod: z.enum(['wac', 'fifo']),
  standardCost: z.number(),
  lastPurchasePrice: z.number(),
  minStockLevel: z.number(),
  maxStockLevel: z.number().nullable().optional(),
  reorderPoint: z.number(),
  reorderQty: z.number(),
  isPerishable: z.boolean(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ItemDto = z.infer<typeof ItemDtoSchema>;

export const CreateItemDtoSchema = z.object({
  categoryId: z.string().uuid(),
  code: z.string().min(1).max(30),
  name: z.string().min(1),
  description: z.string().optional(),
  baseUomId: z.string().uuid(),
  purchaseUomId: z.string().uuid().optional(),
  valuationMethod: z.enum(['wac', 'fifo']).default('wac'),
  standardCost: z.number().nonnegative().default(0),
  minStockLevel: z.number().nonnegative().default(0),
  maxStockLevel: z.number().nonnegative().optional(),
  reorderPoint: z.number().nonnegative().default(0),
  reorderQty: z.number().nonnegative().default(0),
  isPerishable: z.boolean().default(false),
});
export type CreateItemDto = z.infer<typeof CreateItemDtoSchema>;

// 6. Stock Balances & Ledger
export const StockBalanceDtoSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  warehouseName: z.string().optional(),
  itemId: z.string().uuid(),
  itemCode: z.string().optional(),
  itemName: z.string().optional(),
  uomCode: z.string().optional(),
  balanceQty: z.number(),
  balanceValue: z.number(),
  valuationRate: z.number(),
  lastCost: z.number(),
  updatedAt: z.string(),
});
export type StockBalanceDto = z.infer<typeof StockBalanceDtoSchema>;

export const StockLedgerEntryDtoSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  itemId: z.string().uuid(),
  postingDate: z.string(),
  docType: z.enum([
    'grn',
    'issue',
    'transfer_out',
    'transfer_in',
    'adjustment',
    'waste',
    'count_variance',
    'minibar_depletion',
  ]),
  docId: z.string().uuid(),
  docNo: z.string().nullable().optional(),
  qtyDelta: z.number(),
  unitCost: z.number(),
  valueDelta: z.number(),
  balanceQty: z.number(),
  balanceValue: z.number(),
  valuationRate: z.number(),
  batchNo: z.string().nullable().optional(),
  expiryDate: z.string().nullable().optional(),
  createdAt: z.string(),
});
export type StockLedgerEntryDto = z.infer<typeof StockLedgerEntryDtoSchema>;

// 7. Purchase Orders (PO)
export const CreatePoLineDtoSchema = z.object({
  itemId: z.string().uuid(),
  uomId: z.string().uuid(),
  qtyOrdered: z.number().positive(),
  unitPrice: z.number().nonnegative(),
});
export type CreatePoLineDto = z.infer<typeof CreatePoLineDtoSchema>;

export const CreatePurchaseOrderDtoSchema = z.object({
  branchId: z.string().uuid(),
  supplierId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  orderDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  expectedDeliveryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  currency: z.string().default('USD'),
  notes: z.string().optional(),
  lines: z.array(CreatePoLineDtoSchema).min(1),
});
export type CreatePurchaseOrderDto = z.infer<typeof CreatePurchaseOrderDtoSchema>;

export const PurchaseOrderDtoSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  poNo: z.string(),
  supplierId: z.string().uuid(),
  supplierName: z.string().optional(),
  warehouseId: z.string().uuid(),
  warehouseName: z.string().optional(),
  orderDate: z.string(),
  expectedDeliveryDate: z.string().nullable().optional(),
  status: z.enum(['draft', 'approved', 'partially_received', 'received', 'cancelled']),
  currency: z.string(),
  subtotal: z.number(),
  taxAmount: z.number(),
  totalAmount: z.number(),
  notes: z.string().nullable().optional(),
  createdAt: z.string(),
  lines: z.array(z.any()).optional(),
});
export type PurchaseOrderDto = z.infer<typeof PurchaseOrderDtoSchema>;

// 8. Goods Receipt Notes (GRN)
export const CreateGrnLineDtoSchema = z.object({
  poLineId: z.string().uuid().optional(),
  itemId: z.string().uuid(),
  uomId: z.string().uuid(),
  qtyReceived: z.number().positive(),
  unitCost: z.number().nonnegative(),
  batchNo: z.string().optional(),
  expiryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
export type CreateGrnLineDto = z.infer<typeof CreateGrnLineDtoSchema>;

export const CreateGrnDtoSchema = z.object({
  branchId: z.string().uuid(),
  poId: z.string().uuid().optional(),
  supplierId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  receiptDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  supplierInvoiceNo: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(CreateGrnLineDtoSchema).min(1),
});
export type CreateGrnDto = z.infer<typeof CreateGrnDtoSchema>;

export const GoodsReceiptNoteDtoSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  grnNo: z.string(),
  poId: z.string().uuid().nullable().optional(),
  supplierId: z.string().uuid(),
  supplierName: z.string().optional(),
  warehouseId: z.string().uuid(),
  warehouseName: z.string().optional(),
  receiptDate: z.string(),
  status: z.enum(['draft', 'received', 'cancelled']),
  supplierInvoiceNo: z.string().nullable().optional(),
  totalAmount: z.number(),
  voucherId: z.string().uuid().nullable().optional(),
  voucherNo: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  createdAt: z.string(),
  lines: z.array(z.any()).optional(),
});
export type GoodsReceiptNoteDto = z.infer<typeof GoodsReceiptNoteDtoSchema>;

// 9. Material Issues (Requisitions)
export const CreateStockIssueLineDtoSchema = z.object({
  itemId: z.string().uuid(),
  qty: z.number().positive(),
  remarks: z.string().optional(),
});
export type CreateStockIssueLineDto = z.infer<typeof CreateStockIssueLineDtoSchema>;

export const CreateStockIssueDtoSchema = z.object({
  branchId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  department: z.enum(['kitchen', 'bar', 'housekeeping', 'maintenance', 'front_office']),
  requestedBy: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(CreateStockIssueLineDtoSchema).min(1),
});
export type CreateStockIssueDto = z.infer<typeof CreateStockIssueDtoSchema>;

export const StockIssueDtoSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  issueNo: z.string(),
  warehouseId: z.string().uuid(),
  warehouseName: z.string().optional(),
  issueDate: z.string(),
  department: z.string(),
  status: z.enum(['draft', 'issued', 'cancelled']),
  totalValue: z.number(),
  voucherId: z.string().uuid().nullable().optional(),
  voucherNo: z.string().nullable().optional(),
  requestedBy: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  createdAt: z.string(),
  lines: z.array(z.any()).optional(),
});
export type StockIssueDto = z.infer<typeof StockIssueDtoSchema>;

// 10. Stock Transfers
export const CreateStockTransferLineDtoSchema = z.object({
  itemId: z.string().uuid(),
  qty: z.number().positive(),
});
export type CreateStockTransferLineDto = z.infer<typeof CreateStockTransferLineDtoSchema>;

export const CreateStockTransferDtoSchema = z.object({
  branchId: z.string().uuid(),
  fromWarehouseId: z.string().uuid(),
  toWarehouseId: z.string().uuid(),
  transferDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().optional(),
  lines: z.array(CreateStockTransferLineDtoSchema).min(1),
});
export type CreateStockTransferDto = z.infer<typeof CreateStockTransferDtoSchema>;

export const StockTransferDtoSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  transferNo: z.string(),
  fromWarehouseId: z.string().uuid(),
  fromWarehouseName: z.string().optional(),
  toWarehouseId: z.string().uuid(),
  toWarehouseName: z.string().optional(),
  transferDate: z.string(),
  status: z.enum(['draft', 'in_transit', 'completed', 'cancelled']),
  totalValue: z.number(),
  voucherId: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
  createdAt: z.string(),
  lines: z.array(z.any()).optional(),
});
export type StockTransferDto = z.infer<typeof StockTransferDtoSchema>;

// 11. Stock Adjustments
export const CreateStockAdjustmentLineDtoSchema = z.object({
  itemId: z.string().uuid(),
  qtyDelta: z.number(), // positive or negative
  remarks: z.string().optional(),
});
export type CreateStockAdjustmentLineDto = z.infer<typeof CreateStockAdjustmentLineDtoSchema>;

export const CreateStockAdjustmentDtoSchema = z.object({
  branchId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  adjustmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.enum(['spoilage', 'waste', 'damage', 'count_reconciliation', 'expired']),
  notes: z.string().optional(),
  lines: z.array(CreateStockAdjustmentLineDtoSchema).min(1),
});
export type CreateStockAdjustmentDto = z.infer<typeof CreateStockAdjustmentDtoSchema>;

export const StockAdjustmentDtoSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  adjNo: z.string(),
  warehouseId: z.string().uuid(),
  warehouseName: z.string().optional(),
  adjustmentDate: z.string(),
  reason: z.string(),
  status: z.enum(['draft', 'posted', 'cancelled']),
  totalValue: z.number(),
  voucherId: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
  createdAt: z.string(),
  lines: z.array(z.any()).optional(),
});
export type StockAdjustmentDto = z.infer<typeof StockAdjustmentDtoSchema>;

// 12. Stock Counts
export const CreateStockCountDtoSchema = z.object({
  branchId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  countDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().optional(),
});
export type CreateStockCountDto = z.infer<typeof CreateStockCountDtoSchema>;

export const RecordCountLineDtoSchema = z.object({
  itemId: z.string().uuid(),
  countedQty: z.number().nonnegative(),
});
export type RecordCountLineDto = z.infer<typeof RecordCountLineDtoSchema>;

export const SubmitCountLinesDtoSchema = z.object({
  lines: z.array(RecordCountLineDtoSchema),
});
export type SubmitCountLinesDto = z.infer<typeof SubmitCountLinesDtoSchema>;

export const StockCountDtoSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  countNo: z.string(),
  warehouseId: z.string().uuid(),
  warehouseName: z.string().optional(),
  countDate: z.string(),
  status: z.enum(['draft', 'snapshot_frozen', 'counting', 'completed', 'adjusted', 'cancelled']),
  adjustmentId: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
  createdAt: z.string(),
  lines: z.array(z.any()).optional(),
});
export type StockCountDto = z.infer<typeof StockCountDtoSchema>;

// 13. Inventory Valuation & GL Reconciliation
export const InventoryValuationReportDtoSchema = z.object({
  branchId: z.string().uuid(),
  warehouseId: z.string().uuid().nullable().optional(),
  asOfDate: z.string(),
  totalValuation: z.number(),
  itemsCount: z.number(),
  glInventoryAccountBalance: z.number(),
  variance: z.number(),
  reconciled: z.boolean(),
  items: z.array(z.any()),
});
export type InventoryValuationReportDto = z.infer<typeof InventoryValuationReportDtoSchema>;

// ============================================================================
// PHASE 7: RESTAURANT & F&B POS SCHEMAS & TYPES
// ============================================================================

// 1. Dining Outlets
export const CreateOutletDtoSchema = z.object({
  branchId: z.string().uuid(),
  code: z.string().min(1).max(30),
  name: z.string().min(1).max(100),
  outletType: z
    .enum(['restaurant', 'bar', 'cafe', 'room_service', 'banquet'])
    .default('restaurant'),
  warehouseId: z.string().uuid().nullable().optional(),
  depletionMode: z.enum(['at_fire', 'at_settle']).default('at_settle'),
  operatingHours: z.record(z.any()).optional().default({ open: '06:00', close: '23:00' }),
  isActive: z.boolean().optional().default(true),
});
export type CreateOutletDto = z.infer<typeof CreateOutletDtoSchema>;

export const OutletDtoSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  outletType: z.string(),
  warehouseId: z.string().uuid().nullable().optional(),
  warehouseName: z.string().optional(),
  depletionMode: z.enum(['at_fire', 'at_settle']),
  operatingHours: z.record(z.any()).optional(),
  isActive: z.boolean(),
  createdAt: z.string(),
});
export type OutletDto = z.infer<typeof OutletDtoSchema>;

// 2. Kitchen Stations
export const CreateKitchenStationDtoSchema = z.object({
  outletId: z.string().uuid(),
  code: z.string().min(1).max(30),
  name: z.string().min(1).max(100),
  printerIp: z.string().optional(),
});
export type CreateKitchenStationDto = z.infer<typeof CreateKitchenStationDtoSchema>;

export const KitchenStationDtoSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  outletId: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  printerIp: z.string().nullable().optional(),
  isActive: z.boolean(),
  createdAt: z.string(),
});
export type KitchenStationDto = z.infer<typeof KitchenStationDtoSchema>;

// 3. Dining Tables
export const CreateDiningTableDtoSchema = z.object({
  outletId: z.string().uuid(),
  tableNumber: z.string().min(1).max(30),
  name: z.string().min(1).max(100),
  section: z.string().optional().default('Main Dining'),
  capacity: z.number().int().positive().default(4),
});
export type CreateDiningTableDto = z.infer<typeof CreateDiningTableDtoSchema>;

export const DiningTableDtoSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  outletId: z.string().uuid(),
  tableNumber: z.string(),
  name: z.string(),
  section: z.string().nullable().optional(),
  capacity: z.number(),
  status: z.enum(['free', 'seated', 'ordered', 'billed', 'dirty']),
  currentOrderId: z.string().uuid().nullable().optional(),
  isActive: z.boolean(),
  createdAt: z.string(),
});
export type DiningTableDto = z.infer<typeof DiningTableDtoSchema>;

// 4. Menu Categories
export const CreateMenuCategoryDtoSchema = z.object({
  outletId: z.string().uuid(),
  code: z.string().min(1).max(30),
  name: z.string().min(1).max(100),
  kitchenStationId: z.string().uuid().nullable().optional(),
  displayOrder: z.number().int().optional().default(0),
});
export type CreateMenuCategoryDto = z.infer<typeof CreateMenuCategoryDtoSchema>;

export const MenuCategoryDtoSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  outletId: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  kitchenStationId: z.string().uuid().nullable().optional(),
  displayOrder: z.number(),
  isActive: z.boolean(),
  createdAt: z.string(),
});
export type MenuCategoryDto = z.infer<typeof MenuCategoryDtoSchema>;

// 5. Menu Items
export const CreateMenuItemDtoSchema = z.object({
  outletId: z.string().uuid(),
  categoryId: z.string().uuid(),
  kitchenStationId: z.string().uuid().nullable().optional(),
  code: z.string().min(1).max(30),
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  basePrice: z.number().nonnegative(),
  taxRate: z.number().nonnegative().optional().default(0.12),
  serviceChargeRate: z.number().nonnegative().optional().default(0.1),
  itemType: z.enum(['food', 'beverage', 'other']).default('food'),
  isAvailable: z.boolean().optional().default(true),
});
export type CreateMenuItemDto = z.infer<typeof CreateMenuItemDtoSchema>;

export const MenuItemDtoSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  outletId: z.string().uuid(),
  categoryId: z.string().uuid(),
  categoryName: z.string().optional(),
  kitchenStationId: z.string().uuid().nullable().optional(),
  kitchenStationName: z.string().optional(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  basePrice: z.number(),
  taxRate: z.number(),
  serviceChargeRate: z.number(),
  itemType: z.string(),
  isAvailable: z.boolean(),
  isActive: z.boolean(),
  hasRecipe: z.boolean().optional(),
  theoreticalCost: z.number().optional(),
  createdAt: z.string(),
});
export type MenuItemDto = z.infer<typeof MenuItemDtoSchema>;

// 6. Recipes & BOM
export const RecipeLineDtoSchema = z.object({
  itemId: z.string().uuid(),
  qty: z.number().positive(),
  yieldPct: z.number().positive().default(100),
  wastePct: z.number().nonnegative().default(0),
});
export type RecipeLineDto = z.infer<typeof RecipeLineDtoSchema>;

export const CreateRecipeDtoSchema = z.object({
  menuItemId: z.string().uuid(),
  yieldServings: z.number().positive().default(1),
  notes: z.string().optional(),
  lines: z.array(RecipeLineDtoSchema),
});
export type CreateRecipeDto = z.infer<typeof CreateRecipeDtoSchema>;

export const RecipeDtoSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  menuItemId: z.string().uuid(),
  menuItemName: z.string().optional(),
  yieldServings: z.number(),
  notes: z.string().nullable().optional(),
  theoreticalCost: z.number().optional(),
  lines: z.array(z.any()),
  createdAt: z.string(),
});
export type RecipeDto = z.infer<typeof RecipeDtoSchema>;

// 7. POS Shifts
export const OpenShiftDtoSchema = z.object({
  branchId: z.string().uuid(),
  outletId: z.string().uuid(),
  openingFloat: z.number().nonnegative().default(0),
});
export type OpenShiftDto = z.infer<typeof OpenShiftDtoSchema>;

export const CloseShiftDtoSchema = z.object({
  closingCash: z.number().nonnegative(),
});
export type CloseShiftDto = z.infer<typeof CloseShiftDtoSchema>;

export const PosShiftDtoSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  outletId: z.string().uuid(),
  userId: z.string().uuid(),
  userName: z.string().optional(),
  shiftNo: z.string(),
  openedAt: z.string(),
  closedAt: z.string().nullable().optional(),
  openingFloat: z.number(),
  cashDrops: z.number(),
  cashPayments: z.number(),
  closingCash: z.number().nullable().optional(),
  expectedCash: z.number().nullable().optional(),
  variance: z.number().nullable().optional(),
  voucherId: z.string().uuid().nullable().optional(),
  status: z.enum(['open', 'closed']),
});
export type PosShiftDto = z.infer<typeof PosShiftDtoSchema>;

// 8. POS Orders
export const OrderLineItemInputSchema = z.object({
  menuItemId: z.string().uuid(),
  quantity: z.number().positive().default(1),
  seatNo: z.number().int().optional(),
  course: z.enum(['drinks', 'appetizer', 'main', 'dessert']).default('main'),
  notes: z.string().optional(),
  modifiers: z.array(z.any()).optional().default([]),
});
export type OrderLineItemInput = z.infer<typeof OrderLineItemInputSchema>;

export const CreatePosOrderDtoSchema = z.object({
  branchId: z.string().uuid(),
  outletId: z.string().uuid(),
  tableId: z.string().uuid().nullable().optional(),
  shiftId: z.string().uuid().nullable().optional(),
  covers: z.number().int().positive().default(1),
  notes: z.string().optional(),
  lines: z.array(OrderLineItemInputSchema).optional().default([]),
});
export type CreatePosOrderDto = z.infer<typeof CreatePosOrderDtoSchema>;

export const AddOrderLinesDtoSchema = z.object({
  lines: z.array(OrderLineItemInputSchema),
});
export type AddOrderLinesDto = z.infer<typeof AddOrderLinesDtoSchema>;

export const VoidOrderLineDtoSchema = z.object({
  reason: z.string().min(1),
});
export type VoidOrderLineDto = z.infer<typeof VoidOrderLineDtoSchema>;

export const PosOrderDtoSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  outletId: z.string().uuid(),
  outletName: z.string().optional(),
  tableId: z.string().uuid().nullable().optional(),
  tableNumber: z.string().optional(),
  orderNo: z.string(),
  covers: z.number(),
  status: z.enum(['open', 'fired', 'served', 'billed', 'settled', 'voided']),
  subtotal: z.number(),
  taxAmount: z.number(),
  serviceChargeAmount: z.number(),
  totalAmount: z.number(),
  notes: z.string().nullable().optional(),
  createdAt: z.string(),
  lines: z.array(z.any()).optional(),
});
export type PosOrderDto = z.infer<typeof PosOrderDtoSchema>;

// 9. Kitchen Order Tickets (KOT)
export const FireKotDtoSchema = z.object({
  orderLineIds: z.array(z.string().uuid()).optional(),
});
export type FireKotDto = z.infer<typeof FireKotDtoSchema>;

export const KotDtoSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  outletId: z.string().uuid(),
  stationId: z.string().uuid().nullable().optional(),
  stationName: z.string().optional(),
  orderId: z.string().uuid(),
  tableNumber: z.string().optional(),
  kotNo: z.string(),
  isVoid: z.boolean(),
  status: z.enum(['pending', 'cooking', 'ready', 'collected', 'voided']),
  firedAt: z.string(),
  lines: z.array(z.any()).optional(),
});
export type KotDto = z.infer<typeof KotDtoSchema>;

// 10. POS Bills & Settlement
export const CreateBillDtoSchema = z.object({
  orderId: z.string().uuid(),
  discountAmount: z.number().nonnegative().optional().default(0),
  discountReason: z.string().optional(),
  tipAmount: z.number().nonnegative().optional().default(0),
});
export type CreateBillDto = z.infer<typeof CreateBillDtoSchema>;

export const BillPaymentInputSchema = z.object({
  paymentMethod: z.enum(['cash', 'card', 'qr', 'room_charge', 'city_ledger']),
  amount: z.number().positive(),
  tenderReference: z.string().optional(),
  roomNumber: z.string().optional(),
  guestName: z.string().optional(),
});
export type BillPaymentInput = z.infer<typeof BillPaymentInputSchema>;

export const SettleBillDtoSchema = z.object({
  payments: z.array(BillPaymentInputSchema),
});
export type SettleBillDto = z.infer<typeof SettleBillDtoSchema>;

export const PosBillDtoSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  outletId: z.string().uuid(),
  orderId: z.string().uuid(),
  tableNumber: z.string().optional(),
  billNo: z.string(),
  subtotal: z.number(),
  discountAmount: z.number(),
  serviceChargeAmount: z.number(),
  taxAmount: z.number(),
  tipAmount: z.number(),
  totalAmount: z.number(),
  paidAmount: z.number(),
  status: z.enum(['open', 'paid', 'voided']),
  revenueVoucherId: z.string().uuid().nullable().optional(),
  cogsVoucherId: z.string().uuid().nullable().optional(),
  createdAt: z.string(),
  settledAt: z.string().nullable().optional(),
  payments: z.array(z.any()).optional(),
});
export type PosBillDto = z.infer<typeof PosBillDtoSchema>;

// 11. In-House Guest Lookup (for Room Charges)
export const InHouseGuestLookupDtoSchema = z.object({
  stayId: z.string().uuid(),
  folioId: z.string().uuid(),
  guestId: z.string().uuid(),
  guestName: z.string(),
  unitId: z.string().uuid(),
  unitNumber: z.string(),
});
export type InHouseGuestLookupDto = z.infer<typeof InHouseGuestLookupDtoSchema>;

// ============================================================================
// PHASE 8: REPORTING, OBSERVABILITY & GDPR COMPLIANCE CONTRACTS
// ============================================================================

// 1. Executive Dashboard KPIs (REQ-AUD-004, REQ-FNB-011)
export const ExecutiveDashboardKpisDtoSchema = z.object({
  totalUnits: z.number(),
  occupiedUnits: z.number(),
  vacantUnits: z.number(),
  outOfOrderUnits: z.number(),
  occupancyRate: z.number(), // Percentage e.g. 75.50
  adr: z.number(), // Average Daily Rate
  revpar: z.number(), // Revenue per Available Room
  trevpar: z.number(), // Total Revenue per Available Room
  roomsRevenue: z.number(),
  fnbRevenue: z.number(),
  otherRevenue: z.number(),
  totalRevenue: z.number(),
  fnbCovers: z.number(),
  outstandingGuestBalance: z.number(),
  inHouseGuestsCount: z.number(),
  expectedArrivals: z.number(),
  expectedDepartures: z.number(),
  nightAuditStatus: z.object({
    lastRunAt: z.string().nullable().optional(),
    lastRunStatus: z.string().nullable().optional(),
    currentBusinessDate: z.string(),
  }),
});
export type ExecutiveDashboardKpisDto = z.infer<typeof ExecutiveDashboardKpisDtoSchema>;

// 2. Front-Office Reporting Pack
export const DailyFlashReportDtoSchema = z.object({
  businessDate: z.string(),
  branchName: z.string(),
  currency: z.string(),
  rooms: z.object({
    available: z.number(),
    occupied: z.number(),
    complimentary: z.number(),
    ooo: z.number(),
    occupancyPct: z.number(),
    adr: z.number(),
    revpar: z.number(),
    revenue: z.number(),
  }),
  fnb: z.object({
    covers: z.number(),
    averageCheck: z.number(),
    foodRevenue: z.number(),
    beverageRevenue: z.number(),
    totalRevenue: z.number(),
  }),
  ledgerSummary: z.object({
    guestLedgerBeginning: z.number(),
    charges: z.number(),
    payments: z.number(),
    guestLedgerEnding: z.number(),
  }),
  mtd: z.object({
    roomsRevenue: z.number(),
    fnbRevenue: z.number(),
    totalRevenue: z.number(),
    occupancyPct: z.number(),
    adr: z.number(),
  }),
});
export type DailyFlashReportDto = z.infer<typeof DailyFlashReportDtoSchema>;

export const InHouseGuestsReportDtoSchema = z.object({
  records: z.array(
    z.object({
      stayId: z.string().uuid(),
      guestName: z.string(),
      unitNumber: z.string(),
      checkInDate: z.string(),
      expectedCheckOut: z.string(),
      folioNumber: z.string(),
      currentBalance: z.number(),
      adults: z.number(),
      ratePlanCode: z.string().optional(),
    }),
  ),
  totalGuests: z.number(),
  totalBalance: z.number(),
});
export type InHouseGuestsReportDto = z.infer<typeof InHouseGuestsReportDtoSchema>;

export const ArrivalsDeparturesReportDtoSchema = z.object({
  date: z.string(),
  arrivals: z.array(
    z.object({
      reservationId: z.string().uuid(),
      guestName: z.string(),
      unitType: z.string(),
      assignedUnit: z.string().optional(),
      status: z.string(),
      balanceDue: z.number(),
    }),
  ),
  departures: z.array(
    z.object({
      stayId: z.string().uuid(),
      guestName: z.string(),
      unitNumber: z.string(),
      status: z.string(),
      currentBalance: z.number(),
    }),
  ),
});
export type ArrivalsDeparturesReportDto = z.infer<typeof ArrivalsDeparturesReportDtoSchema>;

export const RoomStatusSummaryReportDtoSchema = z.object({
  cleanVacant: z.number(),
  cleanOccupied: z.number(),
  dirtyVacant: z.number(),
  dirtyOccupied: z.number(),
  inspected: z.number(),
  outOfOrder: z.number(),
  totalUnits: z.number(),
  items: z.array(
    z.object({
      unitId: z.string().uuid(),
      unitNumber: z.string(),
      unitType: z.string(),
      housekeepingStatus: z.string(),
      frontOfficeStatus: z.string(),
    }),
  ),
});
export type RoomStatusSummaryReportDto = z.infer<typeof RoomStatusSummaryReportDtoSchema>;

// 3. Asynchronous Report Generation Engine (202 Accepted)
export const CreateReportJobDtoSchema = z.object({
  reportType: z.enum([
    'daily_flash',
    'in_house_guests',
    'arrivals_departures',
    'room_status_summary',
    'night_audit_pack',
    'trial_balance',
    'sales_mix',
  ]),
  branchId: z.string().uuid().optional(),
  format: z.enum(['csv', 'json', 'pdf', 'xlsx']).default('csv'),
  parameters: z.record(z.any()).optional().default({}),
});
export type CreateReportJobDto = z.infer<typeof CreateReportJobDtoSchema>;

export const ReportJobDtoSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid().nullable().optional(),
  reportType: z.string(),
  format: z.string(),
  status: z.enum(['pending', 'processing', 'completed', 'failed']),
  fileUrl: z.string().nullable().optional(),
  fileSizeBytes: z.number().nullable().optional(),
  resultSummary: z.record(z.any()).nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  createdAt: z.string(),
  completedAt: z.string().nullable().optional(),
});
export type ReportJobDto = z.infer<typeof ReportJobDtoSchema>;

// 4. GDPR / Data Privacy Compliance (REQ-GST-004)
export const GdprExportDtoSchema = z.object({
  guestId: z.string().uuid(),
  personalInfo: z.record(z.any()),
  identifications: z.array(z.record(z.any())),
  preferences: z.array(z.record(z.any())),
  reservations: z.array(z.record(z.any())),
  stays: z.array(z.record(z.any())),
  folios: z.array(z.record(z.any())),
  exportedAt: z.string(),
});
export type GdprExportDto = z.infer<typeof GdprExportDtoSchema>;

export const GdprEraseDtoSchema = z.object({
  reason: z.string().min(5),
  confirmConsent: z.boolean().refine((val) => val === true, {
    message: 'Explicit consent confirmation is required for GDPR right-to-erasure',
  }),
});
export type GdprEraseDto = z.infer<typeof GdprEraseDtoSchema>;

// ============================================================================
// PHASE 3: GROUP BLOCKS, QUOTATIONS, WAITLIST & CHANNEL MANAGER (REQ-RSV-009, 010, 015)
// ============================================================================

// 1. Group Blocks & Room Blocks (REQ-RSV-009)
export const GroupBlockAllocationInputSchema = z.object({
  unitTypeId: z.string().uuid(),
  allocatedRooms: z.number().int().positive(),
  agreedRate: z.number().nonnegative(),
});
export type GroupBlockAllocationInput = z.infer<typeof GroupBlockAllocationInputSchema>;

export const CreateGroupBlockDtoSchema = z.object({
  branchId: z.string().uuid(),
  companyId: z.string().uuid().optional(),
  name: z.string().min(2),
  code: z.string().min(2),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  cutoffDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  allocations: z.array(GroupBlockAllocationInputSchema).min(1),
  notes: z.string().optional(),
  attrs: z.record(z.any()).optional().default({}),
});
export type CreateGroupBlockDto = z.infer<typeof CreateGroupBlockDtoSchema>;

export const RoomingListItemSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  unitTypeId: z.string().uuid(),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adults: z.number().int().positive().default(1),
  children: z.number().int().nonnegative().default(0),
});
export type RoomingListItem = z.infer<typeof RoomingListItemSchema>;

export const ImportRoomingListDtoSchema = z.object({
  items: z.array(RoomingListItemSchema).min(1),
});
export type ImportRoomingListDto = z.infer<typeof ImportRoomingListDtoSchema>;

export const GroupBlockDtoSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  companyId: z.string().uuid().nullable().optional(),
  name: z.string(),
  code: z.string(),
  status: z.enum(['tentative', 'definite', 'released', 'cancelled']),
  startDate: z.string(),
  endDate: z.string(),
  cutoffDate: z.string(),
  masterFolioId: z.string().uuid().nullable().optional(),
  totalRooms: z.number(),
  pickedUpRooms: z.number(),
  notes: z.string().nullable().optional(),
  attrs: z.record(z.any()).default({}),
  allocations: z.array(
    z.object({
      id: z.string().uuid(),
      unitTypeId: z.string().uuid(),
      allocatedRooms: z.number(),
      pickedUpRooms: z.number(),
      agreedRate: z.number(),
    })
  ).default([]),
  createdAt: z.string(),
});
export type GroupBlockDto = z.infer<typeof GroupBlockDtoSchema>;

// 2. Non-Binding Quotations & Waitlist (REQ-RSV-010)
export const CreateQuotationDtoSchema = z.object({
  branchId: z.string().uuid(),
  guestId: z.string().uuid().optional(),
  guestName: z.string().min(1),
  guestEmail: z.string().email().optional(),
  guestPhone: z.string().optional(),
  unitTypeId: z.string().uuid(),
  ratePlanId: z.string().uuid(),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adults: z.number().int().positive().default(1),
  children: z.number().int().nonnegative().default(0),
  validDays: z.number().int().positive().default(7),
  notes: z.string().optional(),
});
export type CreateQuotationDto = z.infer<typeof CreateQuotationDtoSchema>;

export const QuotationDtoSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  quotationNo: z.string(),
  guestId: z.string().uuid().nullable().optional(),
  guestName: z.string(),
  guestEmail: z.string().nullable().optional(),
  guestPhone: z.string().nullable().optional(),
  unitTypeId: z.string().uuid(),
  ratePlanId: z.string().uuid(),
  checkIn: z.string(),
  checkOut: z.string(),
  adults: z.number(),
  children: z.number(),
  quotedRate: z.number(),
  quotedTaxes: z.number(),
  totalAmount: z.number(),
  status: z.enum(['active', 'converted', 'expired', 'cancelled']),
  validUntil: z.string(),
  notes: z.string().nullable().optional(),
  convertedReservationId: z.string().uuid().nullable().optional(),
  createdAt: z.string(),
});
export type QuotationDto = z.infer<typeof QuotationDtoSchema>;

export const CreateWaitlistDtoSchema = z.object({
  branchId: z.string().uuid(),
  guestId: z.string().uuid().optional(),
  guestName: z.string().min(1),
  guestEmail: z.string().email().optional(),
  guestPhone: z.string().optional(),
  unitTypeId: z.string().uuid(),
  ratePlanId: z.string().uuid().optional(),
  desiredCheckIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  desiredCheckOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adults: z.number().int().positive().default(1),
  children: z.number().int().nonnegative().default(0),
  priority: z.number().int().positive().default(1),
  notes: z.string().optional(),
});
export type CreateWaitlistDto = z.infer<typeof CreateWaitlistDtoSchema>;

export const WaitlistDtoSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  guestId: z.string().uuid().nullable().optional(),
  guestName: z.string(),
  guestEmail: z.string().nullable().optional(),
  guestPhone: z.string().nullable().optional(),
  unitTypeId: z.string().uuid(),
  ratePlanId: z.string().uuid().nullable().optional(),
  desiredCheckIn: z.string(),
  desiredCheckOut: z.string(),
  adults: z.number(),
  children: z.number(),
  priority: z.number(),
  status: z.enum(['waiting', 'offered', 'converted', 'expired', 'cancelled']),
  notes: z.string().nullable().optional(),
  convertedReservationId: z.string().uuid().nullable().optional(),
  createdAt: z.string(),
});
export type WaitlistDto = z.infer<typeof WaitlistDtoSchema>;

// 3. Channel Manager 2-Way ARI Adapter (REQ-RSV-015)
export const CreateChannelMappingDtoSchema = z.object({
  branchId: z.string().uuid(),
  channelName: z.string().min(2),
  localUnitTypeId: z.string().uuid(),
  localRatePlanId: z.string().uuid(),
  channelRoomCode: z.string().min(1),
  channelRateCode: z.string().min(1),
  isActive: z.boolean().default(true),
});
export type CreateChannelMappingDto = z.infer<typeof CreateChannelMappingDtoSchema>;

export const ChannelMappingDtoSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  channelName: z.string(),
  localUnitTypeId: z.string().uuid(),
  localRatePlanId: z.string().uuid(),
  channelRoomCode: z.string(),
  channelRateCode: z.string(),
  isActive: z.boolean(),
  createdAt: z.string(),
});
export type ChannelMappingDto = z.infer<typeof ChannelMappingDtoSchema>;

export const ChannelAriSyncDtoSchema = z.object({
  branchId: z.string().uuid(),
  channelName: z.string().default('all'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type ChannelAriSyncDto = z.infer<typeof ChannelAriSyncDtoSchema>;

export const ChannelBookingWebhookDtoSchema = z.object({
  channelName: z.string(),
  channelReservationRef: z.string(),
  action: z.enum(['book', 'modify', 'cancel']),
  branchId: z.string().uuid(),
  channelRoomCode: z.string(),
  channelRateCode: z.string(),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adults: z.number().int().positive().default(1),
  children: z.number().int().nonnegative().default(0),
  guest: z.object({
    firstName: z.string(),
    lastName: z.string(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
  }),
  totalPriceOta: z.number().nonnegative(),
  currency: z.string().default('USD'),
  notes: z.string().optional(),
});
export type ChannelBookingWebhookDto = z.infer<typeof ChannelBookingWebhookDtoSchema>;

export const ChannelSyncLogDtoSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  channelName: z.string(),
  syncType: z.enum(['outbound_ari', 'inbound_booking']),
  status: z.enum(['success', 'warning', 'failed']),
  payloadSummary: z.record(z.any()),
  errorMessage: z.string().nullable().optional(),
  createdAt: z.string(),
});
export type ChannelSyncLogDto = z.infer<typeof ChannelSyncLogDtoSchema>;

