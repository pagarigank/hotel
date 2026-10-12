import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  Req,
  Inject,
} from '@nestjs/common';
import type { Request } from 'express';
import { PropertiesService } from './properties.service.js';
import { ZodValidationPipe } from '../../kernel/pipes/zod-validation.pipe.js';
import { RequestContext } from '../../kernel/context/request-context.js';
import {
  CreateUnitTypeDtoSchema,
  CreateUnitDtoSchema,
  BulkCreateUnitsDtoSchema,
  ChangeUnitStatusDtoSchema,
  CreateUnitBlockDtoSchema,
  CreateAmenityDtoSchema,
  CreateBuildingDtoSchema,
  CreateFloorDtoSchema,
  type CreateUnitTypeDto,
  type CreateUnitDto,
  type BulkCreateUnitsDto,
  type ChangeUnitStatusDto,
  type CreateUnitBlockDto,
  type CreateAmenityDto,
  type CreateBuildingDto,
  type CreateFloorDto,
} from '@innkeeper/contracts';

@Controller('api/v1')
export class PropertiesController {
  constructor(@Inject(PropertiesService) private readonly propertiesService: PropertiesService) {}

  @Get('properties/types')
  async getPropertyTypes(@Req() req: Request) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.propertiesService.getPropertyTypes(tenantId);
  }

  @Get('properties/amenities')
  async getAmenities(@Req() req: Request) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.propertiesService.getAmenities(tenantId);
  }

  @Post('properties/amenities')
  async createAmenity(
    @Body(new ZodValidationPipe(CreateAmenityDtoSchema)) body: CreateAmenityDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.propertiesService.createAmenity(tenantId, body);
  }

  @Get('properties/buildings')
  async getBuildings(@Req() req: Request, @Query('branchId') branchId?: string) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const effectiveBranchId = branchId || RequestContext.getBranchId();
    return this.propertiesService.getBuildings(tenantId, effectiveBranchId);
  }

  @Post('properties/buildings')
  async createBuilding(
    @Body(new ZodValidationPipe(CreateBuildingDtoSchema)) body: CreateBuildingDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.propertiesService.createBuilding(tenantId, body);
  }

  @Get('properties/floors')
  async getFloors(@Req() req: Request, @Query('branchId') branchId?: string) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const effectiveBranchId = branchId || RequestContext.getBranchId();
    return this.propertiesService.getFloors(tenantId, effectiveBranchId);
  }

  @Post('properties/floors')
  async createFloor(
    @Body(new ZodValidationPipe(CreateFloorDtoSchema)) body: CreateFloorDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.propertiesService.createFloor(tenantId, body);
  }

  @Get('properties/unit-types')
  async getUnitTypes(@Req() req: Request, @Query('branchId') branchId?: string) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const effectiveBranchId = branchId || RequestContext.getBranchId();
    return this.propertiesService.getUnitTypes(tenantId, effectiveBranchId);
  }

  @Post('properties/unit-types')
  async createUnitType(
    @Body(new ZodValidationPipe(CreateUnitTypeDtoSchema)) body: CreateUnitTypeDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.propertiesService.createUnitType(tenantId, body);
  }

  @Get('properties/units')
  async getUnits(
    @Req() req: Request,
    @Query('branchId') branchId?: string,
    @Query('floor') floor?: string,
    @Query('statusCode') statusCode?: string,
    @Query('unitTypeId') unitTypeId?: string,
    @Query('search') search?: string,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const effectiveBranchId = branchId || RequestContext.getBranchId();

    return this.propertiesService.getUnits(tenantId, {
      branchId: effectiveBranchId,
      floor,
      statusCode,
      unitTypeId,
      search,
    });
  }

  @Get('properties/units/:id')
  async getUnitById(@Param('id') id: string, @Req() req: Request) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.propertiesService.getUnitById(tenantId, id);
  }

  @Get('properties/units/:id/status-log')
  async getUnitStatusLog(@Param('id') id: string, @Req() req: Request) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.propertiesService.getUnitStatusLog(tenantId, id);
  }

  @Post('properties/units')
  async createUnit(
    @Body(new ZodValidationPipe(CreateUnitDtoSchema)) body: CreateUnitDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.propertiesService.createUnit(tenantId, body);
  }

  @Post('properties/units/bulk')
  async bulkCreateUnits(
    @Body(new ZodValidationPipe(BulkCreateUnitsDtoSchema)) body: BulkCreateUnitsDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.propertiesService.bulkCreateUnits(tenantId, body);
  }

  @Put('properties/units/:id')
  async updateUnit(
    @Param('id') id: string,
    @Body() body: Partial<CreateUnitDto>,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.propertiesService.updateUnit(tenantId, id, body);
  }

  @Delete('properties/units/:id')
  async deleteUnit(@Param('id') id: string, @Req() req: Request) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.propertiesService.deleteUnit(tenantId, id);
  }

  /**
   * Status transition endpoints (supporting both /branches/:b/units/:u/status and /properties/units/:u/status)
   */
  @Post('branches/:branchId/units/:unitId/status')
  async changeStatusBranchScoped(
    @Param('branchId') branchId: string,
    @Param('unitId') unitId: string,
    @Body(new ZodValidationPipe(ChangeUnitStatusDtoSchema)) body: ChangeUnitStatusDto,
    @Req() req: Request,
  ) {
    return this.executeStatusChange(branchId, unitId, body, req);
  }

  @Post('properties/units/:unitId/status')
  async changeStatus(
    @Param('unitId') unitId: string,
    @Body(new ZodValidationPipe(ChangeUnitStatusDtoSchema)) body: ChangeUnitStatusDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const branchId = RequestContext.getBranchId();
    return this.executeStatusChange(branchId, unitId, body, req);
  }

  private async executeStatusChange(
    branchId: string,
    unitId: string,
    body: ChangeUnitStatusDto,
    req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const userId = RequestContext.getUserId();
    const permissions = RequestContext.getPermissions();

    return this.propertiesService.changeUnitStatus(
      tenantId,
      branchId,
      unitId,
      body,
      userId,
      permissions,
    );
  }

  @Post('properties/units/:id/block')
  async createUnitBlock(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(CreateUnitBlockDtoSchema)) body: CreateUnitBlockDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const userId = RequestContext.getUserId();

    return this.propertiesService.createUnitBlock(tenantId, { ...body, unitId: id }, userId);
  }

  @Post('properties/blocks/:id/release')
  async releaseUnitBlock(@Param('id') id: string, @Req() req: Request) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const userId = RequestContext.getUserId();

    return this.propertiesService.releaseUnitBlock(tenantId, id, userId);
  }
}
