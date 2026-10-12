import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { uuidv7 } from 'uuidv7';
import { RequestContext } from '../context/request-context.js';

/**
 * Seeds the per-request AsyncLocalStorage store with non-identity metadata.
 *
 * Identity (tenant/user/branch scope/roles/permissions) is intentionally NOT
 * read from headers here; it is populated by the global AuthGuard after the
 * access token is verified.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const correlationId = (req.headers['x-correlation-id'] as string) || uuidv7();
    res.setHeader('x-correlation-id', correlationId);

    const contextData = {
      correlationId,
      timezone: (req.headers['x-timezone'] as string) || 'Asia/Manila',
      locale: (req.headers['accept-language'] as string) || 'en-US',
    };

    RequestContext.run(contextData, () => next());
  }
}
