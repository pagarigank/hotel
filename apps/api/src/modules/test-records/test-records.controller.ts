import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseInterceptors,
  UsePipes,
  Inject,
} from '@nestjs/common';
import { TestRecordsService } from './test-records.service.js';
import { ZodValidationPipe } from '../../kernel/pipes/zod-validation.pipe.js';
import { IdempotencyInterceptor } from '../../kernel/idempotency/idempotency.interceptor.js';
import {
  CreateTestTenantRecordSchema,
  type CreateTestTenantRecordDto,
} from '@innkeeper/contracts';

@Controller('api/v1/test-records')
export class TestRecordsController {
  constructor(
    @Inject(TestRecordsService) private readonly service: TestRecordsService
  ) {}

  @Post()
  @UseInterceptors(IdempotencyInterceptor)
  @UsePipes(new ZodValidationPipe(CreateTestTenantRecordSchema))
  async create(@Body() body: CreateTestTenantRecordDto) {
    return this.service.create(body);
  }

  @Get()
  async findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }
}
