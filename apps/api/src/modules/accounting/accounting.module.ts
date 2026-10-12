import { Module } from '@nestjs/common';
import { PropertiesModule } from '../properties/properties.module.js';
import { AccountingService } from './accounting.service.js';
import { AccountingController } from './accounting.controller.js';

@Module({
  imports: [PropertiesModule],
  controllers: [AccountingController],
  providers: [AccountingService],
  exports: [AccountingService],
})
export class AccountingModule {}
