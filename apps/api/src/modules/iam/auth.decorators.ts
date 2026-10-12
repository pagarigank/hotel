import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route (or controller) as reachable without a verified access token.
 * Used for health probes and the pre-authentication auth endpoints.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const SKIP_CSRF_KEY = 'skipCsrf';

/**
 * Marks a route as exempt from the double-submit CSRF check. Required for
 * endpoints that cannot carry the header (the csrf bootstrap) or that establish
 * the session before a CSRF token can be guaranteed (login / refresh).
 */
export const SkipCsrf = () => SetMetadata(SKIP_CSRF_KEY, true);

export const PERMISSIONS_KEY = 'requiredPermissions';

/**
 * Declares the permissions required to reach a route. Enforced by PermissionsGuard
 * against the permissions embedded in the verified access token.
 */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
