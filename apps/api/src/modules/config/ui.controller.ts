import {
  Controller,
  Get,
  Query,
  Req,
  Inject,
} from '@nestjs/common';
import type { Request } from 'express';
import { UiService } from './ui.service.js';
import { RequestContext } from '../../kernel/context/request-context.js';

@Controller('api/v1/ui')
export class UiController {
  constructor(@Inject(UiService) private readonly uiService: UiService) {}

  @Get('status-defs')
  async getStatusDefs(
    @Req() req: Request,
    @Query('entity') entity: string = 'unit',
    @Query('branchId') branchId?: string,
  ) {
    const ctx = RequestContext.get();
    const tenantId = ctx.tenantId || (req.headers['x-tenant-id'] as string) || 'a0000000-0000-0000-0000-000000000001';
    const effectiveBranchId = branchId || ctx.branchId;

    return this.uiService.getStatusDefs(tenantId, entity, effectiveBranchId);
  }

  @Get('actions')
  async getActions(
    @Req() req: Request,
    @Query('entity') entity: string = 'unit',
    @Query('status') status?: string,
    @Query('branchId') branchId?: string,
  ) {
    const ctx = RequestContext.get();
    const tenantId = ctx.tenantId || (req.headers['x-tenant-id'] as string) || 'a0000000-0000-0000-0000-000000000001';
    const effectiveBranchId = branchId || ctx.branchId;

    // Permissions: extract from header or default to wildcard for full admin test
    const permissionsHeader = req.headers['x-permissions'] as string;
    const permissions = permissionsHeader ? permissionsHeader.split(',') : ['*'];

    return this.uiService.getActions(
      tenantId,
      entity,
      { status, branchId: effectiveBranchId },
      permissions,
    );
  }

  @Get('custom-fields')
  async getCustomFields(
    @Req() req: Request,
    @Query('entity') entity: string = 'unit',
  ) {
    const ctx = RequestContext.get();
    const tenantId = ctx.tenantId || (req.headers['x-tenant-id'] as string) || 'a0000000-0000-0000-0000-000000000001';

    return this.uiService.getCustomFields(tenantId, entity);
  }

  @Get('navigation')
  getNavigation(@Req() req: Request) {
    const permissionsHeader = req.headers['x-permissions'] as string;
    const permissions = permissionsHeader ? permissionsHeader.split(',') : ['*'];

    return this.uiService.getNavigation(permissions);
  }
}
