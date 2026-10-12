import {
  Controller,
  Get,
  Param,
  Req,
  Res,
  Inject,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { BoardService } from './board.service.js';
import { RequestContext } from '../../kernel/context/request-context.js';
import { ProblemDetailsException } from '../../kernel/errors/problem-details.exception.js';

@Controller()
export class BoardController {
  constructor(@Inject(BoardService) private readonly boardService: BoardService) {}

  /**
   * The path-param branch is attacker-controlled, so it must be re-checked
   * against the token's permitted branch scope (the BranchScopeGuard only
   * validates the X-Branch-Id header, not route params).
   */
  private assertBranchAccess(branchId: string): void {
    const permitted = RequestContext.getBranchIds();
    if (permitted.length > 0 && !permitted.includes(branchId)) {
      throw new ProblemDetailsException(
        'FORBIDDEN_BRANCH_SCOPE',
        'Forbidden',
        HttpStatus.FORBIDDEN,
        `Access denied to branch ${branchId}. It is not within your permitted branch scope.`,
      );
    }
  }

  @Get(['api/v1/branches/:branchId/board', 'branches/:branchId/board'])
  async getBoardByBranch(
    @Param('branchId') branchId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    this.assertBranchAccess(branchId);
    const tenantId = RequestContext.getTenantId();

    const board = await this.boardService.getBoard(tenantId, branchId);

    // ETag check
    const clientEtag = req.headers['if-none-match'];
    if (clientEtag && clientEtag === board.etag) {
      return res.status(304).end();
    }

    res.setHeader('ETag', board.etag);
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    return res.status(200).json(board);
  }

  @Get('api/v1/properties/board')
  async getBoardGeneric(@Req() req: Request, @Res() res: Response) {
    const tenantId = RequestContext.getTenantId();
    const branchId = RequestContext.getBranchId();

    const board = await this.boardService.getBoard(tenantId, branchId);

    const clientEtag = req.headers['if-none-match'];
    if (clientEtag && clientEtag === board.etag) {
      return res.status(304).end();
    }

    res.setHeader('ETag', board.etag);
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    return res.status(200).json(board);
  }
}
