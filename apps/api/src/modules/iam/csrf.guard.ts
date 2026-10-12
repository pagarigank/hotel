import { CanActivate, ExecutionContext, HttpStatus, Injectable, Optional, Inject } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { ProblemDetailsException } from '../../kernel/errors/problem-details.exception.js';
import { SKIP_CSRF_KEY } from './auth.decorators.js';

const CSRF_COOKIE = 'XSRF-TOKEN';
const CSRF_HEADER = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Synchronized double-submit CSRF token guard (global).
 *
 * The token is delivered as a readable (non-httpOnly) cookie by GET /api/v1/auth/csrf
 * and echoed back in the `x-csrf-token` header on every state-changing request.
 * The server compares both values; a browser under CSRF attack cannot read the
 * cookie value to forge the header.
 *
 * Requests without the token cookie (non-browser API clients, integration tests,
 * curl) are allowed through unchanged so the API stays usable without an initial
 * csrf round-trip. Routes marked @SkipCsrf (login/refresh/csrf bootstrap) bypass
 * the check entirely.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  private readonly reflector: Reflector;

  constructor(@Optional() @Inject(Reflector) reflector?: Reflector) {
    this.reflector = reflector ?? new Reflector();
  }

  canActivate(context: ExecutionContext): boolean {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_CSRF_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) {
      return true;
    }

    const req = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method.toUpperCase())) {
      return true;
    }

    const cookieToken = (req.cookies && req.cookies[CSRF_COOKIE]) as string | undefined;
    if (!cookieToken) {
      return true;
    }

    const headerToken = req.headers[CSRF_HEADER] as string | undefined;
    if (!this.tokensMatch(cookieToken, headerToken)) {
      throw new ProblemDetailsException(
        'CSRF_TOKEN_MISMATCH',
        'CSRF token validation failed',
        HttpStatus.FORBIDDEN,
        'Missing or invalid x-csrf-token header. Re-fetch a fresh token from GET /api/v1/auth/csrf.',
      );
    }

    return true;
  }

  private tokensMatch(a: string | undefined, b: string | undefined): boolean {
    if (typeof a !== 'string' || typeof b !== 'string') {
      return false;
    }
    const digestA = createHash('sha256').update(a, 'utf8').digest();
    const digestB = createHash('sha256').update(b, 'utf8').digest();
    return timingSafeEqual(digestA, digestB);
  }
}
