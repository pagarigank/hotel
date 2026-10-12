import { Global, Module } from '@nestjs/common';
import { EventsService } from './events.service.js';

/**
 * Provides the in-process SSE fan-out service. Declared global so any module
 * (board, settings, housekeeping, ...) can broadcast without re-providing it,
 * which would otherwise create separate instances whose clients never see each
 * other's events.
 */
@Global()
@Module({
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
