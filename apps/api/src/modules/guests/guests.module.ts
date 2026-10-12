import { Module } from '@nestjs/common';
import { GuestsService } from './guests.service.js';
import { GuestsController } from './guests.controller.js';
import { ConfigModule } from '../config/config.module.js';

@Module({
  imports: [ConfigModule],
  controllers: [GuestsController],
  providers: [GuestsService],
  exports: [GuestsService],
})
export class GuestsModule {}
