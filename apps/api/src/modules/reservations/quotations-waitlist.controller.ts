import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Req,
  Inject,
} from '@nestjs/common';
import type { Request } from 'express';
import { QuotationsWaitlistService } from './quotations-waitlist.service.js';
import { RequestContext } from '../../kernel/context/request-context.js';
import { ZodValidationPipe } from '../../kernel/pipes/zod-validation.pipe.js';
import {
  CreateQuotationDtoSchema,
  CreateWaitlistDtoSchema,
  type CreateQuotationDto,
  type CreateWaitlistDto,
} from '@innkeeper/contracts';

@Controller('api/v1')
export class QuotationsWaitlistController {
  constructor(
    @Inject(QuotationsWaitlistService)
    private readonly quotationsWaitlistService: QuotationsWaitlistService,
  ) {}

  // --- Quotations (REQ-RSV-010) ---
  @Post('quotations')
  async createQuotation(
    @Body(new ZodValidationPipe(CreateQuotationDtoSchema)) body: CreateQuotationDto,
    @Req() req: Request,
  ) {
    const tenantId = RequestContext.getTenantId();
    const userId = RequestContext.getUserId();
    return this.quotationsWaitlistService.createQuotation(tenantId, body, userId);
  }

  @Get('quotations')
  async getQuotations(@Query('branchId') branchId: string, @Req() req: Request) {
    const tenantId = RequestContext.getTenantId();
    const activeBranchId = branchId || RequestContext.getBranchId();
    return this.quotationsWaitlistService.getQuotations(tenantId, activeBranchId);
  }

  @Post('quotations/:id/convert')
  async convertQuotation(@Param('id') id: string, @Req() req: Request) {
    const tenantId = RequestContext.getTenantId();
    const userId = RequestContext.getUserId();
    return this.quotationsWaitlistService.convertQuotation(tenantId, id, userId);
  }

  // --- Waitlist (REQ-RSV-010) ---
  @Post('waitlists')
  async createWaitlist(
    @Body(new ZodValidationPipe(CreateWaitlistDtoSchema)) body: CreateWaitlistDto,
    @Req() req: Request,
  ) {
    const tenantId = RequestContext.getTenantId();
    const userId = RequestContext.getUserId();
    return this.quotationsWaitlistService.createWaitlist(tenantId, body, userId);
  }

  @Get('waitlists')
  async getWaitlists(@Query('branchId') branchId: string, @Req() req: Request) {
    const tenantId = RequestContext.getTenantId();
    const activeBranchId = branchId || RequestContext.getBranchId();
    return this.quotationsWaitlistService.getWaitlists(tenantId, activeBranchId);
  }

  @Post('waitlists/:id/convert')
  async convertWaitlist(
    @Param('id') id: string,
    @Body('ratePlanId') ratePlanId: string,
    @Req() req: Request,
  ) {
    const tenantId = RequestContext.getTenantId();
    const userId = RequestContext.getUserId();
    return this.quotationsWaitlistService.convertWaitlist(tenantId, id, ratePlanId, userId);
  }
}
