import { Module } from '@nestjs/common';
import { StaysService } from './stays.service.js';
import { StaysController } from './stays.controller.js';
import { PropertiesModule } from '../properties/properties.module.js';
import { FoliosModule } from '../folios/folios.module.js';

@Module({
  imports: [PropertiesModule, FoliosModule],
  controllers: [StaysController],
  providers: [StaysService],
  exports: [StaysService],
})
export class FrontDeskModule {}
