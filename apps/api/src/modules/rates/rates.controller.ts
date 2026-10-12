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
import { RatesService } from './rates.service.js';
import { RequestContext } from '../../kernel/context/request-context.js';
import { ZodValidationPipe } from '../../kernel/pipes/zod-validation.pipe.js';
import {
  CreateRatePlanDtoSchema,
  SetRateCalendarDtoSchema,
  SetRestrictionsDtoSchema,
  PriceQuoteRequestSchema,
  type CreateRatePlanDto,
  type SetRateCalendarDto,
  type SetRestrictionsDto,
  type PriceQuoteRequestDto,
} from '@innkeeper/contracts';

@Controller('api/v1')
export class RatesController {
  constructor(@Inject(RatesService) private readonly ratesService: RatesService) {}

  @Get('branches/:branchId/rate-plans')
  async getRatePlans(@Param('branchId') branchId: string, @Req() req: Request) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.ratesService.getRatePlans(tenantId, branchId);
  }

  @Post('branches/:branchId/rate-plans')
  async createRatePlan(
    @Param('branchId') branchId: string,
    @Body(new ZodValidationPipe(CreateRatePlanDtoSchema)) body: CreateRatePlanDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.ratesService.createRatePlan(tenantId, { ...body, branchId });
  }

  @Get('branches/:branchId/rate-calendar')
  async getRateCalendar(
    @Param('branchId') branchId: string,
    @Query('ratePlanId') ratePlanId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.ratesService.getRateCalendar(tenantId, branchId, ratePlanId, startDate, endDate);
  }

  @Post('branches/:branchId/rate-calendar')
  async setRateCalendar(
    @Param('branchId') branchId: string,
    @Body(new ZodValidationPipe(SetRateCalendarDtoSchema)) body: SetRateCalendarDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.ratesService.setRateCalendar(tenantId, { ...body, branchId });
  }

  @Get('branches/:branchId/restrictions')
  async getRestrictions(
    @Param('branchId') branchId: string,
    @Query('ratePlanId') ratePlanId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.ratesService.getRestrictions(tenantId, branchId, ratePlanId, startDate, endDate);
  }

  @Post('branches/:branchId/restrictions')
  async setRestrictions(
    @Param('branchId') branchId: string,
    @Body(new ZodValidationPipe(SetRestrictionsDtoSchema)) body: SetRestrictionsDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.ratesService.setRestrictions(tenantId, { ...body, branchId });
  }

  @Get('taxes')
  async getTaxes(@Req() req: Request) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.ratesService.getTaxes(tenantId);
  }

  @Get('branches/:branchId/tax-rules')
  async getTaxRules(@Param('branchId') branchId: string, @Req() req: Request) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.ratesService.getTaxRules(tenantId, branchId);
  }

  @Post('rates/quote')
  async quotePricePost(
    @Body(new ZodValidationPipe(PriceQuoteRequestSchema)) body: PriceQuoteRequestDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.ratesService.calculatePriceQuote(tenantId, body);
  }

  @Get('rates/quote')
  async quotePriceGet(@Query() query: any, @Req() req: Request) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const parsed = PriceQuoteRequestSchema.parse({
      branchId: query.branchId,
      unitTypeId: query.unitTypeId,
      ratePlanId: query.ratePlanId,
      checkIn: query.checkIn,
      checkOut: query.checkOut,
      adults: Number(query.adults || 1),
      children: Number(query.children || 0),
    });
    return this.ratesService.calculatePriceQuote(tenantId, parsed);
  }
}
