const DEV_FALLBACK_SECRET = 'innkeeper-dev-secret-key-1234567890';

/**
 * Access token lifetime in seconds (10 minutes). Kept short so a leaked token
 * has a narrow exposure window; the client silently refreshes on 401.
 */
export const ACCESS_TOKEN_EXPIRY = 600;

/**
 * Resolves the JWT signing secret. Production must supply JWT_SECRET explicitly;
 * development falls back to a well-known value so a clean checkout still boots.
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length > 0) {
    return secret;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET environment variable is required in production');
  }
  return DEV_FALLBACK_SECRET;
}
