import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import type { Request } from 'express';
import { RequestContext } from '../../kernel/context/request-context.js';

@Injectable()
export class BranchScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const branchId = req.headers['x-branch-id'] as string;

    if (!branchId) {
      return true; // No specific branch scoping requested for this endpoint
    }

    const currentCtx = RequestContext.current();
    if (currentCtx?.branchIds && currentCtx.branchIds.length > 0) {
      if (!currentCtx.branchIds.includes(branchId)) {
        throw new ForbiddenException({
          type: 'https://innkeeper.app/errors/forbidden',
          title: 'Forbidden',
          status: 403,
          detail: `Access denied to branch ${branchId}. Not within permitted branch scope.`,
          code: 'FORBIDDEN_BRANCH_SCOPE',
        });
      }
    }

    return true;
  }
}
