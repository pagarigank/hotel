import { CanActivate, ExecutionContext, HttpStatus, Injectable, Optional, Inject } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import jwt from 'jsonwebtoken';
import type { Request } from 'express';
import { RequestContext } from '../../kernel/context/request-context.js';
import { ProblemDetailsException } from '../../kernel/errors/problem-details.exception.js';
import { IS_PUBLIC_KEY } from './auth.decorators.js';
import { getJwtSecret } from './jwt.constants.js';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  tid: string;
  bids: string[];
  roles: string[];
  permissions: string[];
}

/**
 * Global authentication guard.
 *
 * Verifies the access token issued by AuthService and writes the resulting
 * identity (tenant, user, branch scope, roles, permissions) into the request
 * context. Downstream handlers and guards NEVER read identity from inbound
 * headers.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly reflector: Reflector;

  constructor(@Optional() @Inject(Reflector) reflector?: Reflector) {
    this.reflector = reflector ?? new Reflector();
  }

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      const req = context.switchToHttp().getRequest<Request>();
      const tenantHeader = (req.headers['x-tenant-id'] as string) || (req.query?.tenantId as string);
      if (tenantHeader) {
        RequestContext.assign({ tenantId: tenantHeader });
      }
      return true;
    }

    const req = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(req);
    if (!token) {
      throw new ProblemDetailsException(
        'MISSING_ACCESS_TOKEN',
        'Authentication required',
        HttpStatus.UNAUTHORIZED,
        'Provide an access token in the Authorization: Bearer header.',
      );
    }

    let payload: AccessTokenPayload;
    try {
      payload = jwt.verify(token, getJwtSecret()) as AccessTokenPayload;
    } catch {
      throw new ProblemDetailsException(
        'INVALID_ACCESS_TOKEN',
        'Authentication failed',
        HttpStatus.UNAUTHORIZED,
        'The access token is invalid or has expired.',
      );
    }

    RequestContext.assign({
      userId: payload.sub,
      tenantId: payload.tid,
      branchIds: payload.bids ?? [],
      roles: payload.roles ?? [],
      permissions: payload.permissions ?? [],
    });

    return true;
  }

  private extractToken(req: Request): string | undefined {
    const header = req.headers['authorization'];
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.slice('Bearer '.length).trim();
    }

    // EventSource cannot set headers, so SSE clients pass the token as a query
    // parameter. Only honored for the read-only event stream.
    if (req.method === 'GET' && typeof req.query?.access_token === 'string') {
      return req.query.access_token;
    }

    return undefined;
  }
}
