import { Module } from '@nestjs/common';
import { SettingsService } from './settings.service.js';
import { SettingsController } from './settings.controller.js';
import { UiService } from './ui.service.js';
import { UiController } from './ui.controller.js';
import { NumberingService } from './numbering.service.js';
import { NumberingController } from './numbering.controller.js';

@Module({
  controllers: [SettingsController, UiController, NumberingController],
  providers: [SettingsService, UiService, NumberingService],
  exports: [SettingsService, UiService, NumberingService],
})
export class ConfigModule {}
