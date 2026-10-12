import { Module } from '@nestjs/common';
import { FoliosModule } from '../folios/folios.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { AccountingModule } from '../accounting/accounting.module.js';
import { RestaurantService } from './restaurant.service.js';
import { RestaurantController } from './restaurant.controller.js';

@Module({
  imports: [FoliosModule, InventoryModule, AccountingModule],
  controllers: [RestaurantController],
  providers: [RestaurantService],
  exports: [RestaurantService],
})
export class RestaurantModule {}
