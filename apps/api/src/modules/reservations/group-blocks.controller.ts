import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Req,
  Inject,
} from '@nestjs/common';
import type { Request } from 'express';
import { GroupBlocksService } from './group-blocks.service.js';
import { RequestContext } from '../../kernel/context/request-context.js';
import { ZodValidationPipe } from '../../kernel/pipes/zod-validation.pipe.js';
import {
  CreateGroupBlockDtoSchema,
  ImportRoomingListDtoSchema,
  type CreateGroupBlockDto,
  type ImportRoomingListDto,
} from '@innkeeper/contracts';

@Controller('api/v1/group-blocks')
export class GroupBlocksController {
  constructor(
    @Inject(GroupBlocksService) private readonly groupBlocksService: GroupBlocksService,
  ) {}

  @Post()
  async createGroupBlock(
    @Body(new ZodValidationPipe(CreateGroupBlockDtoSchema)) body: CreateGroupBlockDto,
    @Req() req: Request,
  ) {
    const tenantId = RequestContext.getTenantId();
    const userId = RequestContext.getUserId();
    return this.groupBlocksService.createGroupBlock(tenantId, body, userId);
  }

  @Get()
  async getGroupBlocks(@Query('branchId') branchId: string, @Req() req: Request) {
    const tenantId = RequestContext.getTenantId();
    const activeBranchId = branchId || RequestContext.getBranchId();
    return this.groupBlocksService.getGroupBlocks(tenantId, activeBranchId);
  }

  @Post(':id/rooming-list')
  async importRoomingList(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ImportRoomingListDtoSchema)) body: ImportRoomingListDto,
    @Req() req: Request,
  ) {
    const tenantId = RequestContext.getTenantId();
    const userId = RequestContext.getUserId();
    return this.groupBlocksService.importRoomingList(tenantId, id, body, userId);
  }

  @Post(':id/release')
  async releaseGroupBlock(@Param('id') id: string, @Req() req: Request) {
    const tenantId = RequestContext.getTenantId();
    return this.groupBlocksService.releaseGroupBlock(tenantId, id);
  }
}
