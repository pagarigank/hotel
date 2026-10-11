import {
  Controller,
  Post,
  Body,
  Req,
  Inject,
} from '@nestjs/common';
import type { Request } from 'express';
import { NumberingService } from './numbering.service.js';
import { ZodValidationPipe } from '../../kernel/pipes/zod-validation.pipe.js';
import { RequestContext } from '../../kernel/context/request-context.js';
import {
  GenerateNextNumberDtoSchema,
  type GenerateNextNumberDto,
} from '@innkeeper/contracts';

@Controller('api/v1/numbering')
export class NumberingController {
  constructor(@Inject(NumberingService) private readonly numberingService: NumberingService) {}

  @Post('next')
  async generateNextNumber(
    @Body(new ZodValidationPipe(GenerateNextNumberDtoSchema)) body: GenerateNextNumberDto,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = ctx.tenantId || (req.headers['x-tenant-id'] as string) || 'a0000000-0000-0000-0000-000000000001';

    return this.numberingService.generateNextNumber(tenantId, body);
  }
}
