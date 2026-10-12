import { Module } from '@nestjs/common';
import { HousekeepingService } from './housekeeping.service.js';
import { HousekeepingController } from './housekeeping.controller.js';
import { PropertiesModule } from '../properties/properties.module.js';
import { FoliosModule } from '../folios/folios.module.js';

@Module({
  imports: [PropertiesModule, FoliosModule],
  controllers: [HousekeepingController],
  providers: [HousekeepingService],
  exports: [HousekeepingService],
})
export class HousekeepingModule {}
