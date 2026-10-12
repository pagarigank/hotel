import { Module } from '@nestjs/common';
import { RatesService } from './rates.service.js';
import { RatesController } from './rates.controller.js';

@Module({
  controllers: [RatesController],
  providers: [RatesService],
  exports: [RatesService],
})
export class RatesModule {}
