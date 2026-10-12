import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  Inject,
} from '@nestjs/common';
import type { Request } from 'express';
import { NightAuditService } from './night-audit.service.js';
import { RequestContext } from '../../kernel/context/request-context.js';
import { ZodValidationPipe } from '../../kernel/pipes/zod-validation.pipe.js';
import {
  TriggerNightAuditDtoSchema,
  type TriggerNightAuditDto,
} from '@innkeeper/contracts';

@Controller('api/v1/night-audit')
export class NightAuditController {
  constructor(@Inject(NightAuditService) private readonly nightAuditService: NightAuditService) {}

  @Post('run')
  async runNightAudit(
    @Body(new ZodValidationPipe(TriggerNightAuditDtoSchema)) body: TriggerNightAuditDto,
    @Query('branchId') branchIdQuery: string,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const branchId = branchIdQuery || ctx.branchId || 'b0000000-0000-0000-0000-000000000001';
    const userId = ctx.userId || '10000000-0000-0000-0000-000000000001';
    return this.nightAuditService.runNightAudit(tenantId, branchId, body, userId);
  }

  @Get('status')
  async getStatus(@Query('branchId') branchIdQuery: string, @Req() req: Request) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const branchId = branchIdQuery || ctx.branchId || 'b0000000-0000-0000-0000-000000000001';
    return this.nightAuditService.getNightAuditStatus(tenantId, branchId);
  }

  @Get('kpis')
  async getKpis(@Query('branchId') branchIdQuery: string, @Req() req: Request) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const branchId = branchIdQuery || ctx.branchId || 'b0000000-0000-0000-0000-000000000001';
    return this.nightAuditService.getKpiSnapshots(tenantId, branchId);
  }
}
