import { Module } from '@nestjs/common';
import { ReservationsService } from './reservations.service.js';
import { AvailabilityService } from './availability.service.js';
import { GroupBlocksService } from './group-blocks.service.js';
import { QuotationsWaitlistService } from './quotations-waitlist.service.js';
import { ChannelManagerService } from './channel-manager.service.js';
import { ReservationsController } from './reservations.controller.js';
import { GroupBlocksController } from './group-blocks.controller.js';
import { QuotationsWaitlistController } from './quotations-waitlist.controller.js';
import { ChannelManagerController } from './channel-manager.controller.js';
import { RatesModule } from '../rates/rates.module.js';
import { GuestsModule } from '../guests/guests.module.js';
import { PropertiesModule } from '../properties/properties.module.js';
import { ConfigModule } from '../config/config.module.js';

@Module({
  imports: [RatesModule, GuestsModule, PropertiesModule, ConfigModule],
  controllers: [
    ReservationsController,
    GroupBlocksController,
    QuotationsWaitlistController,
    ChannelManagerController,
  ],
  providers: [
    ReservationsService,
    AvailabilityService,
    GroupBlocksService,
    QuotationsWaitlistService,
    ChannelManagerService,
  ],
  exports: [
    ReservationsService,
    AvailabilityService,
    GroupBlocksService,
    QuotationsWaitlistService,
    ChannelManagerService,
  ],
})
export class ReservationsModule {}
