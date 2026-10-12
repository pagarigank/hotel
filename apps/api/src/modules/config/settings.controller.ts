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
import { RequirePermissions } from '../iam/auth.decorators.js';
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
    const tenantId = RequestContext.getTenantId();
    return this.settingsService.getSettings(tenantId, { scopeType, scopeId });
  }

  @Get('registry')
  getRegistry() {
    return this.settingsService.getRegistry();
  }

  @Get('resolve')
  async resolveSetting(
    @Req() req: Request,
    @Query('key') key: string,
    @Query('branchId') branchId?: string,
    @Query('outletId') outletId?: string,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const effectiveBranchId = branchId;
    const userId = ctx.userId;

    return this.settingsService.resolveSetting(tenantId, key, {
      branchId: effectiveBranchId,
      outletId,
      userId,
    });
  }

  @Put(':key')
  @RequirePermissions('config.settings.update')
  async updateSetting(
    @Param('key') key: string,
    @Body(new ZodValidationPipe(UpdateSettingDtoSchema)) body: UpdateSettingDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const userId = ctx.userId;

    return this.settingsService.updateSetting(tenantId, key, body, userId);
  }
}
