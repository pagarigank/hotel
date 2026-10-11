import { Module } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { RolesService } from './roles.service.js';
import { RolesController } from './roles.controller.js';
import { BranchScopeGuard } from './branch-scope.guard.js';

@Module({
  controllers: [AuthController, RolesController],
  providers: [AuthService, RolesService, BranchScopeGuard],
  exports: [AuthService, RolesService, BranchScopeGuard],
})
export class IamModule {}
