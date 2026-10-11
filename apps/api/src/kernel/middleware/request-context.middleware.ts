import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { uuidv7 } from 'uuidv7';
import { RequestContext } from '../context/request-context.js';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const correlationId = (req.headers['x-correlation-id'] as string) || uuidv7();
    res.setHeader('x-correlation-id', correlationId);

    // Tenant resolution: prioritize explicit header, then subdomain (e.g. acme.innkeeper.app -> lookup)
    let tenantId = req.headers['x-tenant-id'] as string;
    const branchId = req.headers['x-branch-id'] as string;
    const userId = req.headers['x-user-id'] as string;

    // Default to Tenant A in dev/demo if not supplied
    if (!tenantId && req.headers['host']?.includes('boracay')) {
      tenantId = 'a0000000-0000-0000-0000-000000000002';
    }

    const contextData = {
      correlationId,
      tenantId,
      branchId,
      userId,
      timezone: (req.headers['x-timezone'] as string) || 'Asia/Manila',
      locale: (req.headers['accept-language'] as string) || 'en-US',
      branchIds: branchId ? [branchId] : undefined,
    };

    RequestContext.run(contextData, () => next());
  }
}
