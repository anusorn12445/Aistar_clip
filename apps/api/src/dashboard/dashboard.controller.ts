import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { DashboardService } from './dashboard.service';

// ทุกคนที่ login (มี character V ซึ่งทุก role มี) เปิด dashboard ได้
// ตัวเลขเงินถูก gate ด้วย performance V ภายใน service (financeVisible)
@Controller('dashboard')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DashboardController {
  constructor(private dashboard: DashboardService) {}

  @Get()
  @RequirePermission('character', 'V')
  overview(@CurrentUser() user: AuthUser) {
    return this.dashboard.overview(user);
  }
}
