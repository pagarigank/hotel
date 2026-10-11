import {
  Module,
  NestModule,
  MiddlewareConsumer,
  Global,
} from '@nestjs/common';
import { DatabaseService } from './kernel/database/database.service.js';
import { OutboxService } from './kernel/outbox/outbox.service.js';
import { AuditService } from './kernel/audit/audit.service.js';
import { IdempotencyInterceptor } from './kernel/idempotency/idempotency.interceptor.js';
import { HealthController } from './kernel/health/health.controller.js';
import { RequestContextMiddleware } from './kernel/middleware/request-context.middleware.js';
import { TestRecordsModule } from './modules/test-records/test-records.module.js';
import { IamModule } from './modules/iam/iam.module.js';
import { ConfigModule } from './modules/config/config.module.js';

@Global()
@Module({
  providers: [DatabaseService, OutboxService, AuditService, IdempotencyInterceptor],
  exports: [DatabaseService, OutboxService, AuditService, IdempotencyInterceptor],
})
export class KernelModule {}

@Module({
  imports: [KernelModule, TestRecordsModule, IamModule, ConfigModule],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
