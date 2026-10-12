import {
  Controller,
  Get,
  Req,
  Res,
  Inject,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { uuidv7 } from 'uuidv7';
import { EventsService } from './events.service.js';
import { RequestContext } from '../../kernel/context/request-context.js';

@Controller()
export class EventsController {
  constructor(@Inject(EventsService) private readonly eventsService: EventsService) {}

  @Get(['api/v1/events', 'events'])
  streamEvents(@Req() req: Request, @Res() res: Response) {
    const tenantId = RequestContext.getTenantId();
    const branchId = RequestContext.current()?.branchId;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const clientId = uuidv7();
    this.eventsService.addClient(clientId, tenantId, branchId, res);

    // Heartbeat ping every 15s to keep connection alive
    const interval = setInterval(() => {
      try {
        res.write(`: ping\n\n`);
      } catch {
        clearInterval(interval);
      }
    }, 15000);

    req.on('close', () => {
      clearInterval(interval);
      this.eventsService.removeClient(clientId);
    });
  }
}
