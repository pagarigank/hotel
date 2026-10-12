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
import { StaysService } from './stays.service.js';
import { RequestContext } from '../../kernel/context/request-context.js';
import { ZodValidationPipe } from '../../kernel/pipes/zod-validation.pipe.js';
import {
  CheckInDtoSchema,
  RoomMoveDtoSchema,
  StayExtensionDtoSchema,
  CheckOutDtoSchema,
  type CheckInDto,
  type RoomMoveDto,
  type StayExtensionDto,
  type CheckOutDto,
} from '@innkeeper/contracts';

@Controller('api/v1/stays')
export class StaysController {
  constructor(@Inject(StaysService) private readonly staysService: StaysService) {}

  @Post('check-in')
  async checkIn(
    @Body(new ZodValidationPipe(CheckInDtoSchema)) body: CheckInDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const userId = ctx.userId || '10000000-0000-0000-0000-000000000001';
    return this.staysService.checkIn(tenantId, body, userId);
  }

  @Get()
  async getStays(@Query() query: any, @Req() req: Request) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.staysService.getStays(tenantId, {
      branchId: query.branchId,
      status: query.status,
      unitId: query.unitId,
    });
  }

  @Get(':id')
  async getStayById(@Param('id') id: string, @Req() req: Request) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.staysService.getStayById(tenantId, id);
  }

  @Post(':id/room-move')
  async roomMove(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(RoomMoveDtoSchema)) body: RoomMoveDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const userId = ctx.userId || '10000000-0000-0000-0000-000000000001';
    return this.staysService.roomMove(tenantId, id, body, userId);
  }

  @Post(':id/extend')
  async extendStay(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(StayExtensionDtoSchema)) body: StayExtensionDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const userId = ctx.userId || '10000000-0000-0000-0000-000000000001';
    return this.staysService.extendStay(tenantId, id, body, userId);
  }

  @Post(':id/check-out')
  async checkOut(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(CheckOutDtoSchema)) body: CheckOutDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const userId = ctx.userId || '10000000-0000-0000-0000-000000000001';
    return this.staysService.checkOut(tenantId, id, body, userId);
  }

  @Get(':id/registration-card')
  async getRegistrationCard(@Param('id') id: string, @Req() req: Request) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const stay = await this.staysService.getStayById(tenantId, id);
    return {
      stayId: stay.id,
      guestName: stay.guestName,
      unitNumber: stay.unitNumber,
      unitTypeName: stay.unitTypeName,
      actualCheckIn: stay.actualCheckIn,
      expectedCheckOut: stay.expectedCheckOut,
      keycardCode: stay.keycardCode,
      disclaimer: 'I agree to the hotel policies, check-out time of 11:00 AM, and non-smoking regulations.',
      signatureUrl: stay.registrationCardSigned ? `/signatures/${stay.id}.png` : null,
    };
  }
}
