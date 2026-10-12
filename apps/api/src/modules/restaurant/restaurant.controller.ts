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
import { RestaurantService } from './restaurant.service.js';
import { RequestContext } from '../../kernel/context/request-context.js';
import { ZodValidationPipe } from '../../kernel/pipes/zod-validation.pipe.js';
import {
  CreateOutletDtoSchema,
  CreateKitchenStationDtoSchema,
  CreateDiningTableDtoSchema,
  CreateMenuCategoryDtoSchema,
  CreateMenuItemDtoSchema,
  CreateRecipeDtoSchema,
  OpenShiftDtoSchema,
  CloseShiftDtoSchema,
  CreatePosOrderDtoSchema,
  AddOrderLinesDtoSchema,
  VoidOrderLineDtoSchema,
  FireKotDtoSchema,
  CreateBillDtoSchema,
  SettleBillDtoSchema,
  type CreateOutletDto,
  type CreateKitchenStationDto,
  type CreateDiningTableDto,
  type CreateMenuCategoryDto,
  type CreateMenuItemDto,
  type CreateRecipeDto,
  type OpenShiftDto,
  type CloseShiftDto,
  type CreatePosOrderDto,
  type AddOrderLinesDto,
  type VoidOrderLineDto,
  type FireKotDto,
  type CreateBillDto,
  type SettleBillDto,
} from '@innkeeper/contracts';

@Controller('api/v1/restaurant')
export class RestaurantController {
  constructor(@Inject(RestaurantService) private readonly restaurantService: RestaurantService) {}

  // 1. Outlets & Stations & Tables
  @Get('outlets')
  async getOutlets(@Query('branchId') branchId: string, @Req() req: Request) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const bId = branchId || RequestContext.getBranchId();
    return this.restaurantService.getOutlets(tenantId, bId);
  }

  @Post('outlets')
  async createOutlet(
    @Body(new ZodValidationPipe(CreateOutletDtoSchema)) body: CreateOutletDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.restaurantService.createOutlet(tenantId, body);
  }

  @Get('kitchen-stations')
  async getKitchenStations(@Query('outletId') outletId: string, @Req() req: Request) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.restaurantService.getKitchenStations(tenantId, outletId);
  }

  @Post('kitchen-stations')
  async createKitchenStation(
    @Body(new ZodValidationPipe(CreateKitchenStationDtoSchema)) body: CreateKitchenStationDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.restaurantService.createKitchenStation(tenantId, body);
  }

  @Get('tables')
  async getDiningTables(@Query('outletId') outletId: string, @Req() req: Request) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.restaurantService.getDiningTables(tenantId, outletId);
  }

  @Post('tables')
  async createDiningTable(
    @Body(new ZodValidationPipe(CreateDiningTableDtoSchema)) body: CreateDiningTableDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.restaurantService.createDiningTable(tenantId, body);
  }

  @Patch('tables/:id/status')
  async updateTableStatus(
    @Param('id') tableId: string,
    @Body('status') status: 'free' | 'seated' | 'ordered' | 'billed' | 'dirty',
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.restaurantService.updateTableStatus(tenantId, tableId, status);
  }

  // 2. Menu Categories, Items & Recipes
  @Get('categories')
  async getMenuCategories(@Query('outletId') outletId: string, @Req() req: Request) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.restaurantService.getMenuCategories(tenantId, outletId);
  }

  @Post('categories')
  async createMenuCategory(
    @Body(new ZodValidationPipe(CreateMenuCategoryDtoSchema)) body: CreateMenuCategoryDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.restaurantService.createMenuCategory(tenantId, body);
  }

  @Get('items')
  async getMenuItems(
    @Query('outletId') outletId: string,
    @Query('categoryId') categoryId: string,
    @Query('search') search: string,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.restaurantService.getMenuItems(tenantId, outletId, categoryId, search);
  }

  @Get('items/:id')
  async getMenuItemById(@Param('id') id: string, @Req() req: Request) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.restaurantService.getMenuItemById(tenantId, id);
  }

  @Post('items')
  async createMenuItem(
    @Body(new ZodValidationPipe(CreateMenuItemDtoSchema)) body: CreateMenuItemDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.restaurantService.createMenuItem(tenantId, body);
  }

  @Patch('items/:id/availability')
  async toggleMenuItemAvailability(
    @Param('id') id: string,
    @Body('isAvailable') isAvailable: boolean,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.restaurantService.toggleMenuItemAvailability(tenantId, id, isAvailable);
  }

  @Get('recipes/:menuItemId')
  async getRecipe(@Param('menuItemId') menuItemId: string, @Req() req: Request) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.restaurantService.getRecipe(tenantId, menuItemId);
  }

  @Post('recipes')
  async createOrUpdateRecipe(
    @Body(new ZodValidationPipe(CreateRecipeDtoSchema)) body: CreateRecipeDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.restaurantService.createOrUpdateRecipe(tenantId, body);
  }

  // 3. POS Shifts
  @Get('shifts')
  async getShifts(
    @Query('outletId') outletId: string,
    @Query('status') status: string,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.restaurantService.getShifts(tenantId, outletId, status);
  }

  @Get('shifts/current')
  async getCurrentShift(@Query('outletId') outletId: string, @Req() req: Request) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const userId = ctx.userId || '10000000-0000-0000-0000-000000000001';
    return this.restaurantService.getCurrentShift(tenantId, outletId, userId);
  }

  @Post('shifts/open')
  async openShift(
    @Body(new ZodValidationPipe(OpenShiftDtoSchema)) body: OpenShiftDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const userId = ctx.userId || '10000000-0000-0000-0000-000000000001';
    return this.restaurantService.openShift(tenantId, body, userId);
  }

  @Post('shifts/:id/cash-drop')
  async recordCashDrop(
    @Param('id') id: string,
    @Body('amount') amount: number,
    @Body('reason') reason: string,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.restaurantService.recordCashDrop(tenantId, id, amount, reason);
  }

  @Post('shifts/:id/close')
  async closeShift(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(CloseShiftDtoSchema)) body: CloseShiftDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const userId = ctx.userId || '10000000-0000-0000-0000-000000000001';
    return this.restaurantService.closeShift(tenantId, id, body, userId);
  }

  // 4. In-House Guest Lookup (for Room Charges)
  @Get('in-house-guests')
  async lookupInHouseGuests(
    @Query('branchId') branchId: string,
    @Query('search') search: string,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const bId = branchId || RequestContext.getBranchId();
    return this.restaurantService.lookupInHouseGuests(tenantId, bId, search);
  }

  // 5. Orders & KOTs
  @Get('orders')
  async getOrders(
    @Query('outletId') outletId: string,
    @Query('status') status: string,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.restaurantService.getOrders(tenantId, outletId, status);
  }

  @Get('orders/:id')
  async getOrderById(@Param('id') id: string, @Req() req: Request) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.restaurantService.getOrderById(tenantId, id);
  }

  @Post('orders')
  async createOrder(
    @Body(new ZodValidationPipe(CreatePosOrderDtoSchema)) body: CreatePosOrderDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const userId = ctx.userId || '10000000-0000-0000-0000-000000000001';
    return this.restaurantService.createOrder(tenantId, body, userId);
  }

  @Post('orders/:id/lines')
  async addOrderLines(
    @Param('id') orderId: string,
    @Body(new ZodValidationPipe(AddOrderLinesDtoSchema)) body: AddOrderLinesDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.restaurantService.addOrderLines(tenantId, orderId, body);
  }

  @Post('orders/:id/fire')
  async fireOrderLines(
    @Param('id') orderId: string,
    @Body(new ZodValidationPipe(FireKotDtoSchema)) body: FireKotDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.restaurantService.fireOrderLines(tenantId, orderId, body);
  }

  @Post('orders/:id/lines/:lineId/void')
  async voidOrderLine(
    @Param('id') orderId: string,
    @Param('lineId') lineId: string,
    @Body(new ZodValidationPipe(VoidOrderLineDtoSchema)) body: VoidOrderLineDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const userId = ctx.userId || '10000000-0000-0000-0000-000000000001';
    return this.restaurantService.voidOrderLine(tenantId, orderId, lineId, body, userId);
  }

  // 6. Bills & Settlement
  @Get('bills')
  async getBills(
    @Query('outletId') outletId: string,
    @Query('status') status: string,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.restaurantService.getBills(tenantId, outletId, status);
  }

  @Get('bills/:id')
  async getBillById(@Param('id') id: string, @Req() req: Request) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.restaurantService.getBillById(tenantId, id);
  }

  @Post('bills')
  async createBill(
    @Body(new ZodValidationPipe(CreateBillDtoSchema)) body: CreateBillDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const userId = ctx.userId || '10000000-0000-0000-0000-000000000001';
    return this.restaurantService.createBill(tenantId, body, userId);
  }

  @Post('bills/:id/settle')
  async settleBill(
    @Param('id') billId: string,
    @Body(new ZodValidationPipe(SettleBillDtoSchema)) body: SettleBillDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const userId = ctx.userId || '10000000-0000-0000-0000-000000000001';
    return this.restaurantService.settleBill(tenantId, billId, body, userId);
  }
}
