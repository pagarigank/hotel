import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  Req,
  Inject,
} from '@nestjs/common';
import type { Request } from 'express';
import { ComplianceService } from './compliance.service.js';
import { RequestContext } from '../../kernel/context/request-context.js';
import { ZodValidationPipe } from '../../kernel/pipes/zod-validation.pipe.js';
import {
  GdprEraseDtoSchema,
  type GdprEraseDto,
} from '@innkeeper/contracts';

@Controller('api/v1/compliance')
export class ComplianceController {
  constructor(@Inject(ComplianceService) private readonly complianceService: ComplianceService) {}

  @Get('gdpr/export/:guestId')
  async exportGuestData(@Param('guestId') guestId: string, @Req() req: Request) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const userId = ctx.userId || '10000000-0000-0000-0000-000000000001';
    return this.complianceService.exportGuestData(tenantId, guestId, userId);
  }

  @Post('gdpr/erase/:guestId')
  async eraseGuestData(
    @Param('guestId') guestId: string,
    @Body(new ZodValidationPipe(GdprEraseDtoSchema)) body: GdprEraseDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const userId = ctx.userId || '10000000-0000-0000-0000-000000000001';
    return this.complianceService.eraseGuestData(tenantId, guestId, body, userId);
  }

  @Get('gdpr/audit-logs')
  async getAuditLogs(
    @Query('guestId') guestIdQuery: string,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.complianceService.getAuditLogs(tenantId, guestIdQuery);
  }
}
