import { Module } from '@nestjs/common';
import { NightAuditService } from './night-audit.service.js';
import { NightAuditController } from './night-audit.controller.js';
import { PropertiesModule } from '../properties/properties.module.js';
import { AccountingModule } from '../accounting/accounting.module.js';

@Module({
  imports: [PropertiesModule, AccountingModule],
  controllers: [NightAuditController],
  providers: [NightAuditService],
  exports: [NightAuditService],
})
export class NightAuditModule {}
