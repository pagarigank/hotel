import {
  Controller,
  Get,
  Put,
  Param,
  Body,
  Query,
  Req,
  Inject,
} from '@nestjs/common';
import type { Request } from 'express';
import { SettingsService } from './settings.service.js';
import { ZodValidationPipe } from '../../kernel/pipes/zod-validation.pipe.js';
import { RequestContext } from '../../kernel/context/request-context.js';
import {
  UpdateSettingDtoSchema,
  type UpdateSettingDto,
} from '@innkeeper/contracts';

@Controller('api/v1/settings')
export class SettingsController {
  constructor(@Inject(SettingsService) private readonly settingsService: SettingsService) {}

  @Get()
  async getSettings(
    @Req() req: Request,
    @Query('scopeType') scopeType?: string,
    @Query('scopeId') scopeId?: string,
  ) {
    const ctx = RequestContext.get();
    const tenantId = ctx.tenantId || (req.headers['x-tenant-id'] as string) || 'a0000000-0000-0000-0000-000000000001';
    return this.settingsService.getSettings(tenantId, { scopeType, scopeId });
  }

  @Get('resolve')
  async resolveSetting(
    @Req() req: Request,
    @Query('key') key: string,
    @Query('branchId') branchId?: string,
    @Query('outletId') outletId?: string,
  ) {
    const ctx = RequestContext.get();
    const tenantId = ctx.tenantId || (req.headers['x-tenant-id'] as string) || 'a0000000-0000-0000-0000-000000000001';
    const effectiveBranchId = branchId || ctx.branchId;
    const userId = ctx.userId;

    return this.settingsService.resolveSetting(tenantId, key, {
      branchId: effectiveBranchId,
      outletId,
      userId,
    });
  }

  @Put(':key')
  async updateSetting(
    @Param('key') key: string,
    @Body(new ZodValidationPipe(UpdateSettingDtoSchema)) body: UpdateSettingDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = ctx.tenantId || (req.headers['x-tenant-id'] as string) || 'a0000000-0000-0000-0000-000000000001';
    const userId = ctx.userId;

    return this.settingsService.updateSetting(tenantId, key, body, userId);
  }
}
