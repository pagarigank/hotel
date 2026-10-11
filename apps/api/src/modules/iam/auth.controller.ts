import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  Inject,
  UsePipes,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import { ZodValidationPipe } from '../../kernel/pipes/zod-validation.pipe.js';
import { RequestContext } from '../../kernel/context/request-context.js';
import {
  LoginRequestSchema,
  RefreshTokenRequestSchema,
  ManagerOverrideRequestSchema,
  type LoginRequest,
  type RefreshTokenRequest,
  type ManagerOverrideRequest,
} from '@innkeeper/contracts';

@Controller('api/v1/auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post('login')
  async login(
    @Body(new ZodValidationPipe(LoginRequestSchema)) body: LoginRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userAgent = req.headers['user-agent'] as string;
    const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket?.remoteAddress;
    const requestedTenantId = req.headers['x-tenant-id'] as string;

    const result = await this.authService.login(body, userAgent, ipAddress, requestedTenantId);

    // Set secure httpOnly cookie
    res.cookie('innkeeper_refresh_token', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return result;
  }

  @Post('refresh')
  async refresh(
    @Body(new ZodValidationPipe(RefreshTokenRequestSchema.optional())) body: RefreshTokenRequest | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken =
      body?.refreshToken || (req.cookies && req.cookies['innkeeper_refresh_token']) || (req.headers['x-refresh-token'] as string);

    if (!refreshToken) {
      return res.status(401).json({
        type: 'https://innkeeper.app/errors/unauthorized',
        title: 'Unauthorized',
        status: 401,
        detail: 'No refresh token provided in body, cookies, or header',
        code: 'MISSING_REFRESH_TOKEN',
      });
    }

    const tenantId = req.headers['x-tenant-id'] as string;
    const result = await this.authService.refresh(refreshToken, tenantId);

    res.cookie('innkeeper_refresh_token', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return result;
  }

  @Post('logout')
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken =
      (req.body && req.body.refreshToken) ||
      (req.cookies && req.cookies['innkeeper_refresh_token']) ||
      (req.headers['x-refresh-token'] as string);

    if (refreshToken) {
      await this.authService.logout(refreshToken);
    }

    res.clearCookie('innkeeper_refresh_token');
    return { success: true };
  }

  @Get('me')
  async me(@Req() req: Request) {
    const ctx = RequestContext.get();
    const userId = ctx.userId || (req.headers['x-user-id'] as string) || '10000000-0000-0000-0000-000000000001';
    const tenantId = ctx.tenantId || (req.headers['x-tenant-id'] as string) || 'a0000000-0000-0000-0000-000000000001';

    return this.authService.me(userId, tenantId);
  }

  @Post('manager-override')
  async managerOverride(
    @Body(new ZodValidationPipe(ManagerOverrideRequestSchema)) body: ManagerOverrideRequest,
    @Req() req: Request,
  ) {
    const ctx = RequestContext.get();
    const tenantId = ctx.tenantId || (req.headers['x-tenant-id'] as string) || 'a0000000-0000-0000-0000-000000000001';
    const currentUserId = ctx.userId || (req.headers['x-user-id'] as string) || '10000000-0000-0000-0000-000000000001';

    return this.authService.managerOverride(body, tenantId, currentUserId);
  }
}
