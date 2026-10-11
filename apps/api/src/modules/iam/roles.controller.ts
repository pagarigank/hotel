import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  Inject,
} from '@nestjs/common';
import type { Request } from 'express';
import { RolesService } from './roles.service.js';
import { ZodValidationPipe } from '../../kernel/pipes/zod-validation.pipe.js';
import { RequestContext } from '../../kernel/context/request-context.js';
import {
  CreateRoleDtoSchema,
  type CreateRoleDto,
} from '@innkeeper/contracts';

@Controller('api/v1')
export class RolesController {
  constructor(@Inject(RolesService) private readonly rolesService: RolesService) {}

  @Get('roles')
  async getRoles(@Req() req: Request) {
    const ctx = RequestContext.get();
    const tenantId = ctx.tenantId || (req.headers['x-tenant-id'] as string) || 'a0000000-0000-0000-0000-000000000001';
    return this.rolesService.getRoles(tenantId);
  }

  @Post('roles')
  async createRole(
    @Body(new ZodValidationPipe(CreateRoleDtoSchema)) body: CreateRoleDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = ctx.tenantId || (req.headers['x-tenant-id'] as string) || 'a0000000-0000-0000-0000-000000000001';
    return this.rolesService.createRole(tenantId, body);
  }

  @Get('permissions')
  getPermissions() {
    return this.rolesService.getPermissions();
  }
}
