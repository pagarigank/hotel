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
  UseInterceptors,
} from '@nestjs/common';
import type { Request } from 'express';
import { ReservationsService } from './reservations.service.js';
import { AvailabilityService } from './availability.service.js';
import { RequestContext } from '../../kernel/context/request-context.js';
import { IdempotencyInterceptor } from '../../kernel/idempotency/idempotency.interceptor.js';
import { ZodValidationPipe } from '../../kernel/pipes/zod-validation.pipe.js';
import { Public } from '../iam/auth.decorators.js';
import {
  CreateReservationDtoSchema,
  WalkInBookingDtoSchema,
  ModifyReservationDtoSchema,
  AvailabilitySearchRequestSchema,
  type CreateReservationDto,
  type WalkInBookingDto,
  type ModifyReservationDto,
  type AvailabilitySearchRequestDto,
} from '@innkeeper/contracts';

@Controller('api/v1')
export class ReservationsController {
  constructor(
    @Inject(ReservationsService) private readonly reservationsService: ReservationsService,
    @Inject(AvailabilityService) private readonly availabilityService: AvailabilityService,
  ) {}

  /**
   * Real-time Availability Search (REQ-RSV-001)
   */
  @Post('availability/search')
  async searchAvailabilityPost(
    @Body(new ZodValidationPipe(AvailabilitySearchRequestSchema)) body: AvailabilitySearchRequestDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.availabilityService.searchAvailability(tenantId, body);
  }

  @Get('availability')
  async searchAvailabilityGet(@Query() query: any, @Req() req: Request) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const parsed = AvailabilitySearchRequestSchema.parse({
      branchId: query.branchId,
      checkIn: query.checkIn,
      checkOut: query.checkOut,
      adults: Number(query.adults || 2),
      children: Number(query.children || 0),
      unitTypeId: query.unitTypeId || undefined,
    });
    return this.availabilityService.searchAvailability(tenantId, parsed);
  }

  /**
   * Reservation Booking Lifecycle (REQ-RSV-002 / REQ-RSV-005)
   */
  @Post('reservations')
  @UseInterceptors(IdempotencyInterceptor)
  async createReservation(
    @Body(new ZodValidationPipe(CreateReservationDtoSchema)) body: CreateReservationDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const userId = RequestContext.getUserId();
    return this.reservationsService.createReservation(tenantId, body, userId);
  }

  @Post('reservations/walk-in')
  async walkInBooking(
    @Body(new ZodValidationPipe(WalkInBookingDtoSchema)) body: WalkInBookingDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const userId = RequestContext.getUserId();
    return this.reservationsService.walkInBooking(tenantId, body, userId);
  }

  @Post('reservations/hold')
  async holdReservation(@Body() body: any, @Req() req: Request) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const sessionId = (req.headers['x-session-id'] as string) || crypto.randomUUID();
    return this.reservationsService.holdReservation(tenantId, body, sessionId);
  }

  @Get('reservations')
  async getReservations(
    @Query('branchId') branchId: string,
    @Query('status') status: string,
    @Query('search') search: string,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    const activeBranchId = branchId || RequestContext.getBranchId();
    return this.reservationsService.getReservations(tenantId, activeBranchId, status, search);
  }

  @Get('reservations/:id')
  async getReservationById(@Param('id') id: string, @Req() req: Request) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.reservationsService.getReservationById(tenantId, id);
  }

  @Post('reservations/:id/cancel')
  async cancelReservation(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.reservationsService.cancelReservation(tenantId, id, reason);
  }

  @Post('reservations/:id/no-show')
  async noShowReservation(
    @Param('id') id: string,
    @Body('notes') notes: string,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.reservationsService.noShowReservation(tenantId, id, notes);
  }

  @Put('reservations/:id')
  async modifyReservation(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ModifyReservationDtoSchema)) body: ModifyReservationDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = RequestContext.getTenantId();
    return this.reservationsService.modifyReservation(tenantId, id, body);
  }

  /**
   * Public Direct Booking Engine API (REQ-RSV-015)
   */
  @Public()
  @Get('public/availability')
  async publicAvailability(@Query() query: any, @Req() req: Request) {
    const tenantId = RequestContext.getTenantId();
    const parsed = AvailabilitySearchRequestSchema.parse({
      branchId: query.branchId,
      checkIn: query.checkIn,
      checkOut: query.checkOut,
      adults: Number(query.adults || 2),
      children: Number(query.children || 0),
    });
    return this.availabilityService.searchAvailability(tenantId, parsed);
  }

  @Public()
  @Post('public/bookings')
  async publicBooking(
    @Body(new ZodValidationPipe(CreateReservationDtoSchema)) body: CreateReservationDto,
    @Req() req: Request,
  ) {
    const tenantId = RequestContext.getTenantId();
    return this.reservationsService.createReservation(tenantId, { ...body, source: 'booking_engine' });
  }
}
