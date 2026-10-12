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
import { ChannelManagerService } from './channel-manager.service.js';
import { RequestContext } from '../../kernel/context/request-context.js';
import { ZodValidationPipe } from '../../kernel/pipes/zod-validation.pipe.js';
import {
  CreateChannelMappingDtoSchema,
  ChannelAriSyncDtoSchema,
  ChannelBookingWebhookDtoSchema,
  type CreateChannelMappingDto,
  type ChannelAriSyncDto,
  type ChannelBookingWebhookDto,
} from '@innkeeper/contracts';

@Controller('api/v1/channel-manager')
export class ChannelManagerController {
  constructor(
    @Inject(ChannelManagerService) private readonly channelManagerService: ChannelManagerService,
  ) {}

  @Get('mappings')
  async getMappings(@Query('branchId') branchId: string, @Req() req: Request) {
    const tenantId = RequestContext.getTenantId();
    const activeBranchId = branchId || RequestContext.getBranchId();
    return this.channelManagerService.getMappings(tenantId, activeBranchId);
  }

  @Post('mappings')
  async createOrUpdateMapping(
    @Body(new ZodValidationPipe(CreateChannelMappingDtoSchema)) body: CreateChannelMappingDto,
    @Req() req: Request,
  ) {
    const tenantId = RequestContext.getTenantId();
    return this.channelManagerService.createOrUpdateMapping(tenantId, body);
  }

  @Post('sync/ari')
  async syncAri(
    @Body(new ZodValidationPipe(ChannelAriSyncDtoSchema)) body: ChannelAriSyncDto,
    @Req() req: Request,
  ) {
    const tenantId = RequestContext.getTenantId();
    return this.channelManagerService.syncAri(tenantId, body);
  }

  @Post('webhook/booking')
  async ingestWebhookBooking(
    @Body(new ZodValidationPipe(ChannelBookingWebhookDtoSchema)) body: ChannelBookingWebhookDto,
    @Req() req: Request,
  ) {
    const tenantId = RequestContext.getTenantId();
    return this.channelManagerService.ingestWebhookBooking(tenantId, body);
  }

  @Get('logs')
  async getSyncLogs(@Query('branchId') branchId: string, @Req() req: Request) {
    const tenantId = RequestContext.getTenantId();
    const activeBranchId = branchId || RequestContext.getBranchId();
    return this.channelManagerService.getSyncLogs(tenantId, activeBranchId);
  }
}
