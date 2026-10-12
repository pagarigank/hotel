import { Controller, Get, HttpStatus, Res, Inject } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../../modules/iam/auth.decorators.js';
import { DatabaseService } from '../database/database.service.js';

@Controller('health')
@Public()
export class HealthController {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  @Get('live')
  live(@Res() res: Response) {
    res.status(HttpStatus.OK).json({
      status: 'UP',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  }

  @Get('ready')
  async ready(@Res() res: Response) {
    try {
      const pool = this.db.getPool();
      const dbRes = await pool.query('SELECT 1 as connected, current_user');
      res.status(HttpStatus.OK).json({
        status: 'READY',
        database: {
          connected: true,
          user: dbRes.rows[0].current_user,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        status: 'DOWN',
        database: {
          connected: false,
          error: err.message,
        },
        timestamp: new Date().toISOString(),
      });
    }
  }
}
