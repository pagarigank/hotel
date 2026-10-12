import { Controller, Post, Get, Body, Req, Res, Inject } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import { Public, SkipCsrf } from './auth.decorators.js';
import { ZodValidationPipe } from '../../kernel/pipes/zod-validation.pipe.js';
import { RequestContext } from '../../kernel/context/request-context.js';
import {
  CsrfTokenResponseSchema,
  LoginRequestSchema,
  RefreshTokenRequestSchema,
  ManagerOverrideRequestSchema,
  type CsrfTokenResponse,
  type LoginRequest,
  type RefreshTokenRequest,
  type ManagerOverrideRequest,
} from '@innkeeper/contracts';

@Controller('api/v1/auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Public()
  @SkipCsrf()
  @Get('csrf')
  csrf(@Res({ passthrough: true }) res: Response): CsrfTokenResponse {
    const token = randomBytes(32).toString('base64url');
    res.cookie('XSRF-TOKEN', token, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 1000,
    });
    return CsrfTokenResponseSchema.parse({ token });
  }

  @Public()
  @SkipCsrf()
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

  @Public()
  @SkipCsrf()
  @Post('refresh')
  async refresh(
    @Body(new ZodValidationPipe(RefreshTokenRequestSchema.optional()))
    body: RefreshTokenRequest | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken =
      body?.refreshToken ||
      (req.cookies && req.cookies['innkeeper_refresh_token']) ||
      (req.headers['x-refresh-token'] as string);

    if (!refreshToken) {
      return res.status(401).json({
        type: 'https://innkeeper.app/errors/unauthorized',
        title: 'Unauthorized',
        status: 401,
        detail: 'No refresh token provided in body, cookies, or header',
        code: 'MISSING_REFRESH_TOKEN',
      });
    }

    const result = await this.authService.refresh(refreshToken);

    res.cookie('innkeeper_refresh_token', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return result;
  }

  @Public()
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
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
  async me() {
    return this.authService.me(RequestContext.getUserId(), RequestContext.getTenantId());
  }

  @Post('manager-override')
  async managerOverride(
    @Body(new ZodValidationPipe(ManagerOverrideRequestSchema)) body: ManagerOverrideRequest,
  ) {
    return this.authService.managerOverride(
      body,
      RequestContext.getTenantId(),
      RequestContext.getUserId(),
    );
  }
}
