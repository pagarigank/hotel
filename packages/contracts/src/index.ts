import { z } from 'zod';
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
      })
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
  })
);

export const NavigationResponseSchema = z.object({
  items: z.array(NavigationItemSchema),
});
export type NavigationResponse = z.infer<typeof NavigationResponseSchema>;

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
