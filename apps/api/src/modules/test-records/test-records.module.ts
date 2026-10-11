import { Module } from '@nestjs/common';
import { TestRecordsController } from './test-records.controller.js';
import { TestRecordsService } from './test-records.service.js';

@Module({
  controllers: [TestRecordsController],
  providers: [TestRecordsService],
  exports: [TestRecordsService],
})
export class TestRecordsModule {}
