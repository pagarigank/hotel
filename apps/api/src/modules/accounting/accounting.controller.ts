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
import { AccountingService } from './accounting.service.js';
import { RequestContext } from '../../kernel/context/request-context.js';
import { ZodValidationPipe } from '../../kernel/pipes/zod-validation.pipe.js';
import {
  CreateAccountDtoSchema,
  CreateVoucherDtoSchema,
  ReverseVoucherDtoSchema,
  ClosePeriodDtoSchema,
  type CreateAccountDto,
  type CreateVoucherDto,
  type ReverseVoucherDto,
  type ClosePeriodDto,
} from '@innkeeper/contracts';

@Controller('api/v1/accounting')
export class AccountingController {
  constructor(@Inject(AccountingService) private readonly accountingService: AccountingService) {}

  // 1. Chart of Accounts
  @Get('accounts')
  async getAccounts(@Query('accountClass') accountClass: string, @Req() req: Request) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.accountingService.getAccounts(tenantId, accountClass);
  }

  @Get('accounts/:id')
  async getAccountById(@Param('id') id: string, @Req() req: Request) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.accountingService.getAccountById(tenantId, id);
  }

  @Post('accounts')
  async createAccount(
    @Body(new ZodValidationPipe(CreateAccountDtoSchema)) body: CreateAccountDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.accountingService.createAccount(tenantId, body);
  }

  // 2. Fiscal Calendar
  @Get('fiscal-years')
  async getFiscalYears(@Req() req: Request) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.accountingService.getFiscalYears(tenantId);
  }

  @Get('fiscal-periods')
  async getFiscalPeriods(@Query('fiscalYearId') fiscalYearId: string, @Req() req: Request) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.accountingService.getFiscalPeriods(tenantId, fiscalYearId);
  }

  @Patch('fiscal-periods/:id/status')
  async updatePeriodStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ClosePeriodDtoSchema)) body: ClosePeriodDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const userId = ctx.userId || '10000000-0000-0000-0000-000000000001';
    return this.accountingService.updatePeriodStatus(tenantId, id, body, userId);
  }

  // 3. Vouchers
  @Get('vouchers')
  async getVouchers(@Query() query: any, @Req() req: Request) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.accountingService.getVouchers(tenantId, {
      branchId: query.branchId,
      status: query.status,
      voucherType: query.voucherType,
      startDate: query.startDate,
      endDate: query.endDate,
    });
  }

  @Get('vouchers/:id')
  async getVoucherById(@Param('id') id: string, @Req() req: Request) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.accountingService.getVoucherById(tenantId, id);
  }

  @Post('vouchers')
  async createVoucher(
    @Body(new ZodValidationPipe(CreateVoucherDtoSchema)) body: CreateVoucherDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const userId = ctx.userId || '10000000-0000-0000-0000-000000000001';
    return this.accountingService.createVoucher(tenantId, body, userId);
  }

  @Post('vouchers/:id/post')
  async postVoucher(@Param('id') id: string, @Req() req: Request) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const userId = ctx.userId || '10000000-0000-0000-0000-000000000001';
    return this.accountingService.postVoucher(tenantId, id, userId);
  }

  @Post('vouchers/:id/reverse')
  async reverseVoucher(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ReverseVoucherDtoSchema)) body: ReverseVoucherDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const userId = ctx.userId || '10000000-0000-0000-0000-000000000001';
    return this.accountingService.reverseVoucher(tenantId, id, body, userId);
  }

  // 4. Financial Reports
  @Get('reports/trial-balance')
  async getTrialBalance(
    @Query('branchId') branchId: string,
    @Query('fiscalPeriodId') fiscalPeriodId: string,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const bId = branchId || ctx.branchId || 'b0000000-0000-0000-0000-000000000001';
    return this.accountingService.getTrialBalance(tenantId, bId, fiscalPeriodId);
  }

  @Get('reports/general-ledger/:accountId')
  async getGeneralLedger(
    @Param('accountId') accountId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.accountingService.getGeneralLedger(tenantId, accountId, startDate, endDate);
  }

  @Get('reports/usali-pnl')
  async getUsaliPnl(
    @Query('branchId') branchId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const bId = branchId || ctx.branchId || 'b0000000-0000-0000-0000-000000000001';
    return this.accountingService.getUsaliPnl(tenantId, bId, startDate, endDate);
  }
}
