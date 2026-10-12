import { AsyncLocalStorage } from 'node:async_hooks';
import { HttpStatus } from '@nestjs/common';
import { ProblemDetailsException } from '../errors/problem-details.exception.js';

export interface RequestContextData {
  tenantId?: string;
  branchId?: string;
  userId?: string;
  correlationId: string;
  timezone: string;
  locale: string;
  branchIds?: string[];
  roles?: string[];
  permissions?: string[];
}

const asyncLocalStorage = new AsyncLocalStorage<RequestContextData>();

export class RequestContext {
  static run<R>(data: RequestContextData, fn: () => R): R {
    return asyncLocalStorage.run(data, fn);
  }

  static current(): RequestContextData | undefined {
    return asyncLocalStorage.getStore();
  }

  static get(): RequestContextData {
    const ctx = asyncLocalStorage.getStore();
    if (!ctx) {
      throw new Error('RequestContext is not available in the current execution context');
    }
    return ctx;
  }

  /**
   * Mutates the active request context. Called by the global AuthGuard once the
   * access token has been verified, so downstream handlers never trust inbound
   * identity headers.
   */
  static assign(update: Partial<RequestContextData>): void {
    const ctx = asyncLocalStorage.getStore();
    if (!ctx) {
      throw new Error('RequestContext is not available in the current execution context');
    }
    Object.assign(ctx, update);
  }

  static getTenantId(): string {
    const tid = this.get().tenantId;
    if (!tid) {
      throw new ProblemDetailsException(
        'TENANT_CONTEXT_MISSING',
        'Tenant context is not available',
        HttpStatus.UNAUTHORIZED,
        'The authenticated session is missing a tenant claim.',
      );
    }
    return tid;
  }

  static getUserId(): string {
    const userId = this.get().userId;
    if (!userId) {
      throw new ProblemDetailsException(
        'USER_CONTEXT_MISSING',
        'User context is not available',
        HttpStatus.UNAUTHORIZED,
        'The authenticated session is missing a user claim.',
      );
    }
    return userId;
  }

  static getBranchId(): string {
    const branchId = this.get().branchId;
    if (!branchId) {
      throw new ProblemDetailsException(
        'BRANCH_CONTEXT_MISSING',
        'A branch context is required for this operation',
        HttpStatus.BAD_REQUEST,
        'Provide an X-Branch-Id header within your permitted branch scope.',
      );
    }
    return branchId;
  }

  static getBranchIds(): string[] {
    return this.get().branchIds ?? [];
  }

  static getPermissions(): string[] {
    return this.get().permissions ?? [];
  }

  static getRoles(): string[] {
    return this.get().roles ?? [];
  }
}
