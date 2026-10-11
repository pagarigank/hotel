import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContextData {
  tenantId?: string;
  branchId?: string;
  userId?: string;
  correlationId: string;
  timezone: string;
  locale: string;
  branchIds?: string[];
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

  static getTenantId(): string {
    const tid = this.get().tenantId;
    if (!tid) {
      throw new Error('Tenant ID is not defined in RequestContext');
    }
    return tid;
  }
}
