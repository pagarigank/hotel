import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  Req,
  Res,
  Inject,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ReportingService } from './reporting.service.js';
import { RequestContext } from '../../kernel/context/request-context.js';
import { ZodValidationPipe } from '../../kernel/pipes/zod-validation.pipe.js';
import {
  CreateReportJobDtoSchema,
  type CreateReportJobDto,
} from '@innkeeper/contracts';

@Controller('api/v1/reporting')
export class ReportingController {
  constructor(@Inject(ReportingService) private readonly reportingService: ReportingService) {}

  @Get('dashboard/kpis')
  async getDashboardKpis(@Query('branchId') branchIdQuery: string, @Req() req: Request) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const branchId = branchIdQuery || ctx.branchId || undefined;
    return this.reportingService.getExecutiveDashboardKpis(tenantId, branchId);
  }

  @Get('flash-report')
  async getFlashReport(
    @Query('branchId') branchIdQuery: string,
    @Query('date') dateQuery: string,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const branchId = branchIdQuery || ctx.branchId || undefined;
    return this.reportingService.getDailyFlashReport(tenantId, branchId, dateQuery);
  }

  @Get('in-house-guests')
  async getInHouseGuests(@Query('branchId') branchIdQuery: string, @Req() req: Request) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const branchId = branchIdQuery || ctx.branchId || undefined;
    return this.reportingService.getInHouseGuests(tenantId, branchId);
  }

  @Get('arrivals-departures')
  async getArrivalsDepartures(
    @Query('branchId') branchIdQuery: string,
    @Query('date') dateQuery: string,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const branchId = branchIdQuery || ctx.branchId || undefined;
    return this.reportingService.getArrivalsDepartures(tenantId, branchId, dateQuery);
  }

  @Get('room-status-summary')
  async getRoomStatusSummary(@Query('branchId') branchIdQuery: string, @Req() req: Request) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const branchId = branchIdQuery || ctx.branchId || undefined;
    return this.reportingService.getRoomStatusSummary(tenantId, branchId);
  }

  @Post('jobs')
  @HttpCode(HttpStatus.ACCEPTED)
  async createReportJob(
    @Body(new ZodValidationPipe(CreateReportJobDtoSchema)) body: CreateReportJobDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const userId = ctx.userId || '10000000-0000-0000-0000-000000000001';
    return this.reportingService.createReportJob(tenantId, body, userId);
  }

  @Get('jobs')
  async getReportJobs(@Query('branchId') branchIdQuery: string, @Req() req: Request) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const branchId = branchIdQuery || ctx.branchId || undefined;
    return this.reportingService.getReportJobs(tenantId, branchId);
  }

  @Get('jobs/:id')
  async getReportJobById(@Param('id') id: string, @Req() req: Request) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.reportingService.getReportJobById(tenantId, id);
  }

  @Get('jobs/:id/download')
  async downloadReportFile(
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const file = await this.reportingService.streamReportFile(tenantId, id);

    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    return res.status(200).send(file.content);
  }
}
