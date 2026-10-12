import { Module } from '@nestjs/common';
import { FoliosService } from './folios.service.js';
import { FoliosController } from './folios.controller.js';
import { PropertiesModule } from '../properties/properties.module.js';

@Module({
  imports: [PropertiesModule],
  controllers: [FoliosController],
  providers: [FoliosService],
  exports: [FoliosService],
})
export class FoliosModule {}
