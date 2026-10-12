import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Query,
  Body,
  Param,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { UiService } from './ui.service.js';
import { ZodValidationPipe } from '../../kernel/pipes/zod-validation.pipe.js';
import { RequestContext } from '../../kernel/context/request-context.js';
import { RequirePermissions } from '../iam/auth.decorators.js';
import {
  CreateStatusDefDtoSchema,
  UpdateStatusDefDtoSchema,
  CreateStatusTransitionDtoSchema,
  CreateActionDefDtoSchema,
  UpdateActionDefDtoSchema,
  CreateCustomFieldDefDtoSchema,
  UpdateCustomFieldDefDtoSchema,
  UpdateNavigationConfigDtoSchema,
  type CreateStatusDefDto,
  type UpdateStatusDefDto,
  type CreateStatusTransitionDto,
  type CreateActionDefDto,
  type UpdateActionDefDto,
  type CreateCustomFieldDefDto,
  type UpdateCustomFieldDefDto,
  type UpdateNavigationConfigDto,
} from '@innkeeper/contracts';

@Controller('api/v1/ui')
export class UiController {
  constructor(@Inject(UiService) private readonly uiService: UiService) {}

  @Get('status-defs')
  async getStatusDefs(
    @Query('entity') entity: string = 'unit',
    @Query('branchId') branchId?: string,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const effectiveBranchId = branchId || ctx.branchId;

    return this.uiService.getStatusDefs(tenantId, entity, effectiveBranchId);
  }

  @Post('status-defs')
  @RequirePermissions('config.status.modify')
  async createStatusDef(
    @Body(new ZodValidationPipe(CreateStatusDefDtoSchema)) body: CreateStatusDefDto,
  ) {
    const tenantId = RequestContext.getTenantId();
    return this.uiService.createStatusDef(tenantId, body);
  }

  @Patch('status-defs/:id')
  @RequirePermissions('config.status.modify')
  async updateStatusDef(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateStatusDefDtoSchema)) body: UpdateStatusDefDto,
  ) {
    const tenantId = RequestContext.getTenantId();
    return this.uiService.updateStatusDef(tenantId, id, body);
  }

  @Delete('status-defs/:id')
  @RequirePermissions('config.status.modify')
  async deleteStatusDef(@Param('id') id: string) {
    const tenantId = RequestContext.getTenantId();
    return this.uiService.deleteStatusDef(tenantId, id);
  }

  @Post('status-transitions')
  @RequirePermissions('config.status.modify')
  async createStatusTransition(
    @Body(new ZodValidationPipe(CreateStatusTransitionDtoSchema)) body: CreateStatusTransitionDto,
  ) {
    const tenantId = RequestContext.getTenantId();
    return this.uiService.createStatusTransition(tenantId, body);
  }

  @Delete('status-transitions/:id')
  @RequirePermissions('config.status.modify')
  async deleteStatusTransition(@Param('id') id: string) {
    const tenantId = RequestContext.getTenantId();
    return this.uiService.deleteStatusTransition(tenantId, id);
  }

  @Get('actions')
  async getActions(
    @Query('entity') entity: string = 'unit',
    @Query('status') status?: string,
    @Query('branchId') branchId?: string,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const effectiveBranchId = branchId || ctx.branchId;
    const permissions = RequestContext.getPermissions();

    return this.uiService.getActions(
      tenantId,
      entity,
      { status, branchId: effectiveBranchId },
      permissions,
    );
  }

  @Post('actions')
  @RequirePermissions('config.action.modify')
  async createActionDef(
    @Body(new ZodValidationPipe(CreateActionDefDtoSchema)) body: CreateActionDefDto,
  ) {
    const tenantId = RequestContext.getTenantId();
    return this.uiService.createActionDef(tenantId, body);
  }

  @Patch('actions/:id')
  @RequirePermissions('config.action.modify')
  async updateActionDef(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateActionDefDtoSchema)) body: UpdateActionDefDto,
  ) {
    const tenantId = RequestContext.getTenantId();
    return this.uiService.updateActionDef(tenantId, id, body);
  }

  @Delete('actions/:id')
  @RequirePermissions('config.action.modify')
  async deleteActionDef(@Param('id') id: string) {
    const tenantId = RequestContext.getTenantId();
    return this.uiService.deleteActionDef(tenantId, id);
  }

  @Get('custom-fields')
  async getCustomFields(@Query('entity') entity: string = 'unit') {
    const tenantId = RequestContext.getTenantId();
    return this.uiService.getCustomFields(tenantId, entity);
  }

  @Post('custom-fields')
  @RequirePermissions('config.customfield.modify')
  async createCustomFieldDef(
    @Body(new ZodValidationPipe(CreateCustomFieldDefDtoSchema)) body: CreateCustomFieldDefDto,
  ) {
    const tenantId = RequestContext.getTenantId();
    return this.uiService.createCustomFieldDef(tenantId, body);
  }

  @Post('custom-fields/validate')
  async validateCustomFields(@Body() body: { entity?: string; attrs?: Record<string, unknown> }) {
    if (!body?.entity) {
      throw new BadRequestException('entity is required');
    }
    const tenantId = RequestContext.getTenantId();
    const result = await this.uiService.validateEntityAttrs(tenantId, body.entity, body.attrs);
    if (!result.success) {
      throw new BadRequestException({
        error: 'invalid_custom_fields',
        message: `Attributes for entity '${body.entity}' failed validation`,
        details: result.issues,
      });
    }
    return { valid: true, attrs: result.data };
  }

  @Patch('custom-fields/:id')
  @RequirePermissions('config.customfield.modify')
  async updateCustomFieldDef(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateCustomFieldDefDtoSchema)) body: UpdateCustomFieldDefDto,
  ) {
    const tenantId = RequestContext.getTenantId();
    return this.uiService.updateCustomFieldDef(tenantId, id, body);
  }

  @Delete('custom-fields/:id')
  @RequirePermissions('config.customfield.modify')
  async deleteCustomFieldDef(@Param('id') id: string) {
    const tenantId = RequestContext.getTenantId();
    return this.uiService.deleteCustomFieldDef(tenantId, id);
  }

  @Get('navigation')
  getNavigation() {
    const tenantId = RequestContext.getTenantId();
    const permissions = RequestContext.getPermissions();
    const roles = RequestContext.getRoles();
    return this.uiService.getNavigation(tenantId, permissions, roles);
  }

  @Get('navigation/configs')
  @RequirePermissions('config.navigation.modify')
  getNavigationConfigs() {
    const tenantId = RequestContext.getTenantId();
    return this.uiService.listNavigationConfigs(tenantId);
  }

  @Put('navigation/configs')
  @RequirePermissions('config.navigation.modify')
  updateNavigationConfig(
    @Body(new ZodValidationPipe(UpdateNavigationConfigDtoSchema)) body: UpdateNavigationConfigDto,
  ) {
    const tenantId = RequestContext.getTenantId();
    const userId = RequestContext.getUserId();
    return this.uiService.upsertNavigationConfig(tenantId, body, userId);
  }

  @Delete('navigation/configs')
  @RequirePermissions('config.navigation.modify')
  deleteNavigationConfig(@Query('roleCode') roleCode?: string) {
    const tenantId = RequestContext.getTenantId();
    return this.uiService.deleteNavigationConfig(tenantId, roleCode ?? null);
  }
}
