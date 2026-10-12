import { Injectable, CanActivate, ExecutionContext, HttpStatus } from '@nestjs/common';
import type { Request } from 'express';
import { RequestContext } from '../../kernel/context/request-context.js';
import { ProblemDetailsException } from '../../kernel/errors/problem-details.exception.js';

/**
 * Global branch-scope guard.
 *
 * Runs after AuthGuard. Resolves the effective branch for the request:
 *  - If the caller sends X-Branch-Id, it must fall within the token's permitted
 *    branch scope (403 otherwise), and becomes the request's branch context.
 *  - Otherwise the first permitted branch is used as the default.
 *
 * The header is only a *selector*; authorization always derives from the token.
 */
@Injectable()
export class BranchScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const ctx = RequestContext.current();
    if (!ctx) {
      return true;
    }

    const permitted = ctx.branchIds && ctx.branchIds.length > 0 ? ctx.branchIds : null;
    const requestedBranchId = req.headers['x-branch-id'] as string | undefined;

    if (requestedBranchId) {
      if (permitted && !permitted.includes(requestedBranchId)) {
        throw new ProblemDetailsException(
          'FORBIDDEN_BRANCH_SCOPE',
          'Forbidden',
          HttpStatus.FORBIDDEN,
          `Access denied to branch ${requestedBranchId}. It is not within your permitted branch scope.`,
        );
      }
      RequestContext.assign({ branchId: requestedBranchId });
      return true;
    }

    if (!ctx.branchId && permitted && permitted.length > 0) {
      RequestContext.assign({ branchId: permitted[0] });
    }

    return true;
  }
}
