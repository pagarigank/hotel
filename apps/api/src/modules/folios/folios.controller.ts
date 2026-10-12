import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Req,
  Inject,
} from '@nestjs/common';
import type { Request } from 'express';
import { FoliosService } from './folios.service.js';
import { RequestContext } from '../../kernel/context/request-context.js';
import { ZodValidationPipe } from '../../kernel/pipes/zod-validation.pipe.js';
import {
  PostFolioLineDtoSchema,
  VoidFolioLineDtoSchema,
  TransferFolioLineDtoSchema,
  RecordPaymentDtoSchema,
  type PostFolioLineDto,
  type VoidFolioLineDto,
  type TransferFolioLineDto,
  type RecordPaymentDto,
} from '@innkeeper/contracts';

@Controller('api/v1')
export class FoliosController {
  constructor(@Inject(FoliosService) private readonly foliosService: FoliosService) {}

  @Get('folios/:id')
  async getFolioById(@Param('id') id: string, @Req() req: Request) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.foliosService.getFolioById(tenantId, id);
  }

  @Get('stays/:stayId/folio')
  async getFolioByStayId(@Param('stayId') stayId: string, @Req() req: Request) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.foliosService.getFolioByStayId(tenantId, stayId);
  }

  @Post('folios/:id/lines')
  async postCharge(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(PostFolioLineDtoSchema)) body: PostFolioLineDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const userId = ctx.userId || '10000000-0000-0000-0000-000000000001';
    return this.foliosService.postCharge(tenantId, id, body, userId);
  }

  @Post('folios/:id/payments')
  async recordPayment(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(RecordPaymentDtoSchema)) body: RecordPaymentDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const userId = ctx.userId || '10000000-0000-0000-0000-000000000001';
    return this.foliosService.recordPayment(tenantId, id, body, userId);
  }

  @Post('folios/:id/lines/:lineId/void')
  async voidLine(
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Body(new ZodValidationPipe(VoidFolioLineDtoSchema)) body: VoidFolioLineDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const userId = ctx.userId || '10000000-0000-0000-0000-000000000001';
    return this.foliosService.voidLine(tenantId, id, lineId, body, userId);
  }

  @Post('folios/:id/lines/:lineId/transfer')
  async transferLine(
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Body(new ZodValidationPipe(TransferFolioLineDtoSchema)) body: TransferFolioLineDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const userId = ctx.userId || '10000000-0000-0000-0000-000000000001';
    return this.foliosService.transferLine(tenantId, id, lineId, body, userId);
  }

  @Get('folios/:id/invoice')
  async getInvoice(@Param('id') id: string, @Req() req: Request) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.foliosService.getInvoiceData(tenantId, id);
  }
}
