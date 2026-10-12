import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Req,
  Inject,
} from '@nestjs/common';
import type { Request } from 'express';
import { InventoryService } from './inventory.service.js';
import { RequestContext } from '../../kernel/context/request-context.js';
import { ZodValidationPipe } from '../../kernel/pipes/zod-validation.pipe.js';
import {
  CreateUomDtoSchema,
  CreateItemCategoryDtoSchema,
  CreateWarehouseDtoSchema,
  CreateSupplierDtoSchema,
  CreateItemDtoSchema,
  CreatePurchaseOrderDtoSchema,
  CreateGrnDtoSchema,
  CreateStockIssueDtoSchema,
  CreateStockTransferDtoSchema,
  CreateStockAdjustmentDtoSchema,
  CreateStockCountDtoSchema,
  SubmitCountLinesDtoSchema,
  type CreateUomDto,
  type CreateItemCategoryDto,
  type CreateWarehouseDto,
  type CreateSupplierDto,
  type CreateItemDto,
  type CreatePurchaseOrderDto,
  type CreateGrnDto,
  type CreateStockIssueDto,
  type CreateStockTransferDto,
  type CreateStockAdjustmentDto,
  type CreateStockCountDto,
  type SubmitCountLinesDto,
} from '@innkeeper/contracts';

@Controller('api/v1/inventory')
export class InventoryController {
  constructor(@Inject(InventoryService) private readonly inventoryService: InventoryService) {}

  // 1. Units of Measure
  @Get('uoms')
  async getUoms(@Req() req: Request) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.inventoryService.getUoms(tenantId);
  }

  @Post('uoms')
  async createUom(
    @Body(new ZodValidationPipe(CreateUomDtoSchema)) body: CreateUomDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.inventoryService.createUom(tenantId, body);
  }

  // 2. Item Categories
  @Get('categories')
  async getItemCategories(@Req() req: Request) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.inventoryService.getItemCategories(tenantId);
  }

  @Post('categories')
  async createItemCategory(
    @Body(new ZodValidationPipe(CreateItemCategoryDtoSchema)) body: CreateItemCategoryDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.inventoryService.createItemCategory(tenantId, body);
  }

  // 3. Storage Warehouses
  @Get('warehouses')
  async getWarehouses(@Query('branchId') branchId: string, @Req() req: Request) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const bId = branchId || RequestContext.getBranchId();
    return this.inventoryService.getWarehouses(tenantId, bId);
  }

  @Post('warehouses')
  async createWarehouse(
    @Body(new ZodValidationPipe(CreateWarehouseDtoSchema)) body: CreateWarehouseDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.inventoryService.createWarehouse(tenantId, body);
  }

  // 4. Suppliers
  @Get('suppliers')
  async getSuppliers(@Req() req: Request) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.inventoryService.getSuppliers(tenantId);
  }

  @Post('suppliers')
  async createSupplier(
    @Body(new ZodValidationPipe(CreateSupplierDtoSchema)) body: CreateSupplierDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.inventoryService.createSupplier(tenantId, body);
  }

  // 5. Item Catalog
  @Get('items')
  async getItems(
    @Query('categoryId') categoryId: string,
    @Query('search') search: string,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.inventoryService.getItems(tenantId, categoryId, search);
  }

  @Get('items/:id')
  async getItemById(@Param('id') id: string, @Req() req: Request) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.inventoryService.getItemById(tenantId, id);
  }

  @Post('items')
  async createItem(
    @Body(new ZodValidationPipe(CreateItemDtoSchema)) body: CreateItemDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.inventoryService.createItem(tenantId, body);
  }

  // 6. Purchase Orders
  @Get('purchase-orders')
  async getPurchaseOrders(
    @Query('branchId') branchId: string,
    @Query('status') status: string,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const bId = branchId || RequestContext.getBranchId();
    return this.inventoryService.getPurchaseOrders(tenantId, bId, status);
  }

  @Post('purchase-orders')
  async createPurchaseOrder(
    @Body(new ZodValidationPipe(CreatePurchaseOrderDtoSchema)) body: CreatePurchaseOrderDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const userId = ctx.userId || '10000000-0000-0000-0000-000000000001';
    return this.inventoryService.createPurchaseOrder(tenantId, body, userId);
  }

  // 7. Goods Receipt Notes (GRN)
  @Get('grns')
  async getGoodsReceiptNotes(
    @Query('branchId') branchId: string,
    @Query('warehouseId') warehouseId: string,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const bId = branchId || RequestContext.getBranchId();
    return this.inventoryService.getGoodsReceiptNotes(tenantId, bId, warehouseId);
  }

  @Get('grns/:id')
  async getGrnById(@Param('id') id: string, @Req() req: Request) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.inventoryService.getGrnById(tenantId, id);
  }

  @Post('grns')
  async createGrn(
    @Body(new ZodValidationPipe(CreateGrnDtoSchema)) body: CreateGrnDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const userId = ctx.userId || '10000000-0000-0000-0000-000000000001';
    return this.inventoryService.createGrn(tenantId, body, userId);
  }

  // 8. Material Issues
  @Get('issues')
  async getStockIssues(@Query('branchId') branchId: string, @Req() req: Request) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const bId = branchId || RequestContext.getBranchId();
    return this.inventoryService.getStockIssues(tenantId, bId);
  }

  @Post('issues')
  async createStockIssue(
    @Body(new ZodValidationPipe(CreateStockIssueDtoSchema)) body: CreateStockIssueDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const userId = ctx.userId || '10000000-0000-0000-0000-000000000001';
    return this.inventoryService.createStockIssue(tenantId, body, userId);
  }

  // 9. Stock Transfers
  @Get('transfers')
  async getStockTransfers(@Query('branchId') branchId: string, @Req() req: Request) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const bId = branchId || RequestContext.getBranchId();
    return this.inventoryService.getStockTransfers(tenantId, bId);
  }

  @Post('transfers')
  async createStockTransfer(
    @Body(new ZodValidationPipe(CreateStockTransferDtoSchema)) body: CreateStockTransferDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const userId = ctx.userId || '10000000-0000-0000-0000-000000000001';
    return this.inventoryService.createStockTransfer(tenantId, body, userId);
  }

  // 10. Stock Adjustments
  @Get('adjustments')
  async getStockAdjustments(@Query('branchId') branchId: string, @Req() req: Request) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const bId = branchId || RequestContext.getBranchId();
    return this.inventoryService.getStockAdjustments(tenantId, bId);
  }

  @Post('adjustments')
  async createStockAdjustment(
    @Body(new ZodValidationPipe(CreateStockAdjustmentDtoSchema)) body: CreateStockAdjustmentDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const userId = ctx.userId || '10000000-0000-0000-0000-000000000001';
    return this.inventoryService.createStockAdjustment(tenantId, body, userId);
  }

  // 11. Stock Counts
  @Get('counts')
  async getStockCounts(@Query('branchId') branchId: string, @Req() req: Request) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const bId = branchId || RequestContext.getBranchId();
    return this.inventoryService.getStockCounts(tenantId, bId);
  }

  @Post('counts')
  async createStockCount(
    @Body(new ZodValidationPipe(CreateStockCountDtoSchema)) body: CreateStockCountDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const userId = ctx.userId || '10000000-0000-0000-0000-000000000001';
    return this.inventoryService.createStockCount(tenantId, body, userId);
  }

  @Post('counts/:id/lines')
  async recordCountLines(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(SubmitCountLinesDtoSchema)) body: SubmitCountLinesDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.inventoryService.recordCountLines(tenantId, id, body);
  }

  @Post('counts/:id/reconcile')
  async reconcileCount(@Param('id') id: string, @Req() req: Request) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const userId = ctx.userId || '10000000-0000-0000-0000-000000000001';
    return this.inventoryService.reconcileCount(tenantId, id, userId);
  }

  // 12. Reports: Stock on Hand, Valuation & GL Reconciliation, Stock Ledger
  @Get('stock-on-hand')
  async getStockOnHand(
    @Query('branchId') branchId: string,
    @Query('warehouseId') warehouseId: string,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const bId = branchId || RequestContext.getBranchId();
    return this.inventoryService.getStockOnHand(tenantId, bId, warehouseId);
  }

  @Get('valuation-report')
  async getValuationReport(
    @Query('branchId') branchId: string,
    @Query('warehouseId') warehouseId: string,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const bId = branchId || RequestContext.getBranchId();
    return this.inventoryService.getInventoryValuationReport(tenantId, bId, warehouseId);
  }

  @Get('ledger')
  async getStockLedger(
    @Query('branchId') branchId: string,
    @Query('itemId') itemId: string,
    @Query('warehouseId') warehouseId: string,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const bId = branchId || RequestContext.getBranchId();
    return this.inventoryService.getStockLedger(tenantId, bId, itemId, warehouseId);
  }
}
