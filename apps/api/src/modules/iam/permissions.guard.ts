import { CanActivate, ExecutionContext, HttpStatus, Injectable, Optional, Inject } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RequestContext } from '../../kernel/context/request-context.js';
import { ProblemDetailsException } from '../../kernel/errors/problem-details.exception.js';
import { PERMISSIONS_KEY } from './auth.decorators.js';

/**
 * Enforces @RequirePermissions metadata against the permissions verified from
 * the access token. A wildcard '*' grants everything.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly reflector: Reflector;

  constructor(@Optional() @Inject(Reflector) reflector?: Reflector) {
    this.reflector = reflector ?? new Reflector();
  }

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }

    const granted = RequestContext.getPermissions();
    if (granted.includes('*')) {
      return true;
    }

    const allowed = required.every((permission) => granted.includes(permission));
    if (!allowed) {
      throw new ProblemDetailsException(
        'FORBIDDEN_INSUFFICIENT_PERMISSIONS',
        'Insufficient permissions',
        HttpStatus.FORBIDDEN,
        `This operation requires: ${required.join(', ')}.`,
      );
    }

    return true;
  }
}
