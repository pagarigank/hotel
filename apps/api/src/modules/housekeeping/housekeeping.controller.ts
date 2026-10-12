import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Req,
  Inject,
} from '@nestjs/common';
import type { Request } from 'express';
import { HousekeepingService } from './housekeeping.service.js';
import { RequestContext } from '../../kernel/context/request-context.js';
import { ZodValidationPipe } from '../../kernel/pipes/zod-validation.pipe.js';
import {
  UpdateHkTaskStatusDtoSchema,
  PostMinibarChargeDtoSchema,
  type UpdateHkTaskStatusDto,
  type PostMinibarChargeDto,
} from '@innkeeper/contracts';

@Controller('api/v1/housekeeping')
export class HousekeepingController {
  constructor(@Inject(HousekeepingService) private readonly hkService: HousekeepingService) {}

  @Get('tasks')
  async getTasks(@Query() query: any, @Req() req: Request) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.hkService.getTasks(tenantId, {
      branchId: query.branchId,
      status: query.status,
      attendantId: query.attendantId,
      unitId: query.unitId,
    });
  }

  @Patch('tasks/:id/status')
  async updateTaskStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateHkTaskStatusDtoSchema)) body: UpdateHkTaskStatusDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const userId = ctx.userId || '10000000-0000-0000-0000-000000000001';
    return this.hkService.updateTaskStatus(tenantId, id, body, userId);
  }

  @Post('minibar-charges')
  async postMinibarCharge(
    @Body(new ZodValidationPipe(PostMinibarChargeDtoSchema)) body: PostMinibarChargeDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const userId = ctx.userId || '10000000-0000-0000-0000-000000000001';
    return this.hkService.postMinibarCharge(tenantId, body, userId);
  }

  @Get('maintenance')
  async getMaintenanceOrders(@Query('branchId') branchId: string, @Req() req: Request) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.hkService.getMaintenanceOrders(tenantId, branchId);
  }

  @Post('maintenance')
  async createMaintenanceOrder(@Body() body: any, @Req() req: Request) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const branchId = body.branchId || ctx.branchId || 'b0000000-0000-0000-0000-000000000001';
    const userId = ctx.userId || '10000000-0000-0000-0000-000000000001';
    return this.hkService.createMaintenanceOrder(tenantId, branchId, body, userId);
  }

  @Get('lost-found')
  async getLostFoundItems(@Query('branchId') branchId: string, @Req() req: Request) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.hkService.getLostFoundItems(tenantId, branchId);
  }

  @Post('lost-found')
  async createLostFoundItem(@Body() body: any, @Req() req: Request) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const branchId = body.branchId || ctx.branchId || 'b0000000-0000-0000-0000-000000000001';
    const userId = ctx.userId || '10000000-0000-0000-0000-000000000001';
    return this.hkService.createLostFoundItem(tenantId, branchId, body, userId);
  }
}
