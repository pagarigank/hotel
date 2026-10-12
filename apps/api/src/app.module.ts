import {
  Module,
  NestModule,
  MiddlewareConsumer,
  Global,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { DatabaseService } from './kernel/database/database.service.js';
import { OutboxService } from './kernel/outbox/outbox.service.js';
import { AuditService } from './kernel/audit/audit.service.js';
import { IdempotencyInterceptor } from './kernel/idempotency/idempotency.interceptor.js';
import { HealthController } from './kernel/health/health.controller.js';
import { RequestContextMiddleware } from './kernel/middleware/request-context.middleware.js';
import { TestRecordsModule } from './modules/test-records/test-records.module.js';
import { IamModule } from './modules/iam/iam.module.js';
import { ConfigModule } from './modules/config/config.module.js';
import { PropertiesModule } from './modules/properties/properties.module.js';
import { EventsModule } from './modules/properties/events.module.js';
import { RatesModule } from './modules/rates/rates.module.js';
import { GuestsModule } from './modules/guests/guests.module.js';
import { ReservationsModule } from './modules/reservations/reservations.module.js';
import { FoliosModule } from './modules/folios/folios.module.js';
import { FrontDeskModule } from './modules/front-desk/front-desk.module.js';
import { NightAuditModule } from './modules/night-audit/night-audit.module.js';
import { HousekeepingModule } from './modules/housekeeping/housekeeping.module.js';
import { AccountingModule } from './modules/accounting/accounting.module.js';
import { InventoryModule } from './modules/inventory/inventory.module.js';
import { RestaurantModule } from './modules/restaurant/restaurant.module.js';
import { ReportingModule } from './modules/reporting/reporting.module.js';
import { ComplianceModule } from './modules/compliance/compliance.module.js';
import { AuthGuard } from './modules/iam/auth.guard.js';
import { BranchScopeGuard } from './modules/iam/branch-scope.guard.js';
import { PermissionsGuard } from './modules/iam/permissions.guard.js';
import { CsrfGuard } from './modules/iam/csrf.guard.js';

@Global()
@Module({
  providers: [DatabaseService, OutboxService, AuditService, IdempotencyInterceptor],
  exports: [DatabaseService, OutboxService, AuditService, IdempotencyInterceptor],
})
export class KernelModule {}

@Module({
  imports: [
    KernelModule,
    TestRecordsModule,
    IamModule,
    ConfigModule,
    PropertiesModule,
    EventsModule,
    RatesModule,
    GuestsModule,
    ReservationsModule,
    FoliosModule,
    FrontDeskModule,
    NightAuditModule,
    HousekeepingModule,
    AccountingModule,
    InventoryModule,
    RestaurantModule,
    ReportingModule,
    ComplianceModule,
  ],
  controllers: [HealthController],
  providers: [
    // Global guard order matters: authenticate -> resolve branch scope ->
    // enforce permissions -> validate CSRF.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: BranchScopeGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
