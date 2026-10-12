import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Query,
  Req,
  Inject,
} from '@nestjs/common';
import type { Request } from 'express';
import { GuestsService } from './guests.service.js';
import { RequestContext } from '../../kernel/context/request-context.js';
import { ZodValidationPipe } from '../../kernel/pipes/zod-validation.pipe.js';
import {
  CreateGuestDtoSchema,
  UpdateGuestDtoSchema,
  MergeGuestsDtoSchema,
  CreateCompanyDtoSchema,
  type CreateGuestDto,
  type UpdateGuestDto,
  type MergeGuestsDto,
  type CreateCompanyDto,
} from '@innkeeper/contracts';

@Controller('api/v1')
export class GuestsController {
  constructor(@Inject(GuestsService) private readonly guestsService: GuestsService) {}

  @Get('guests')
  async getGuests(@Query('search') search: string, @Req() req: Request) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.guestsService.getGuests(tenantId, search);
  }

  @Get('guests/:id')
  async getGuestById(@Param('id') id: string, @Req() req: Request) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.guestsService.getGuestById(tenantId, id);
  }

  @Post('guests')
  async createGuest(
    @Body(new ZodValidationPipe(CreateGuestDtoSchema)) body: CreateGuestDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const userId = RequestContext.getUserId();
    return this.guestsService.createGuest(tenantId, body, userId);
  }

  @Put('guests/:id')
  async updateGuest(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateGuestDtoSchema)) body: UpdateGuestDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.guestsService.updateGuest(tenantId, id, body);
  }

  @Post('guests/merge')
  async mergeGuests(
    @Body(new ZodValidationPipe(MergeGuestsDtoSchema)) body: MergeGuestsDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const userId = RequestContext.getUserId();
    return this.guestsService.mergeGuests(tenantId, body, userId);
  }

  @Get('companies')
  async getCompanies(@Req() req: Request) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.guestsService.getCompanies(tenantId);
  }

  @Post('companies')
  async createCompany(
    @Body(new ZodValidationPipe(CreateCompanyDtoSchema)) body: CreateCompanyDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.guestsService.createCompany(tenantId, body);
  }
}
