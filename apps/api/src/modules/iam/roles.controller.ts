import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Inject,
} from '@nestjs/common';
import { RolesService } from './roles.service.js';
import { ZodValidationPipe } from '../../kernel/pipes/zod-validation.pipe.js';
import { RequestContext } from '../../kernel/context/request-context.js';
import { RequirePermissions } from './auth.decorators.js';
import {
  CreateRoleDtoSchema,
  UpdateRoleDtoSchema,
  AssignRoleDtoSchema,
  type CreateRoleDto,
  type UpdateRoleDto,
  type AssignRoleDto,
} from '@innkeeper/contracts';

@Controller('api/v1')
export class RolesController {
  constructor(@Inject(RolesService) private readonly rolesService: RolesService) {}

  @Get('roles')
  async getRoles() {
    const tenantId = RequestContext.getTenantId();
    return this.rolesService.getRoles(tenantId);
  }

  @Post('roles')
  @RequirePermissions('config.roles.manage')
  async createRole(@Body(new ZodValidationPipe(CreateRoleDtoSchema)) body: CreateRoleDto) {
    const tenantId = RequestContext.getTenantId();
    return this.rolesService.createRole(tenantId, body);
  }

  @Patch('roles/:id')
  @RequirePermissions('config.roles.manage')
  async updateRole(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateRoleDtoSchema)) body: UpdateRoleDto,
  ) {
    const tenantId = RequestContext.getTenantId();
    return this.rolesService.updateRole(tenantId, id, body);
  }

  @Delete('roles/:id')
  @RequirePermissions('config.roles.manage')
  async deleteRole(@Param('id') id: string) {
    const tenantId = RequestContext.getTenantId();
    return this.rolesService.deleteRole(tenantId, id);
  }

  @Get('memberships')
  async getMemberships() {
    const tenantId = RequestContext.getTenantId();
    return this.rolesService.getMemberships(tenantId);
  }

  @Post('memberships/:membershipId/roles')
  @RequirePermissions('config.roles.manage')
  async assignRole(
    @Param('membershipId') membershipId: string,
    @Body(new ZodValidationPipe(AssignRoleDtoSchema)) body: AssignRoleDto,
  ) {
    const tenantId = RequestContext.getTenantId();
    return this.rolesService.assignRoleToMembership(tenantId, membershipId, body);
  }

  @Delete('memberships/:membershipId/roles/:roleId')
  @RequirePermissions('config.roles.manage')
  async removeRole(
    @Param('membershipId') membershipId: string,
    @Param('roleId') roleId: string,
  ) {
    const tenantId = RequestContext.getTenantId();
    return this.rolesService.removeRoleFromMembership(tenantId, membershipId, roleId);
  }

  @Get('permissions')
  getPermissions() {
    return this.rolesService.getPermissions();
  }
}
