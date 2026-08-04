import { BadRequestException, Body, Controller, Get, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { KpiService } from './kpi.service';
import { UpsertGoalsDto } from './dto/upsert-goals.dto';
import { METRIC_AUDIT, METRIC_KEYS, PERIODS } from './kpi.constants';

// กัน uuid เพี้ยนก่อนถึง Prisma (invalid uuid ใน where id → 500)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Team KPI / Goal-setting — editor อยู่ที่ Settings (module 'setting'), widget ที่ Dashboard
@Controller('kpi')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class KpiController {
  constructor(private kpi: KpiService) {}

  // แคตตาล็อก metric ที่รองรับ + periods — ให้ Settings เรนเดอร์แถวครบทุก metric
  @Get('metrics')
  @RequirePermission('setting', 'V')
  metrics() {
    return {
      metrics: METRIC_KEYS.map((k) => ({
        metric: k,
        label: METRIC_AUDIT[k].label,
        icon: METRIC_AUDIT[k].icon,
      })),
      periods: PERIODS,
    };
  }

  // scope=role (default): ?roleKey= · scope=user (เป้ารายคน): ?scope=user&userId=
  @Get('goals')
  @RequirePermission('setting', 'V')
  goals(
    @Query('roleKey') roleKey?: string,
    @Query('scope') scope?: string,
    @Query('userId') userId?: string,
  ) {
    if (scope === 'user') {
      if (!userId || !UUID_RE.test(userId)) {
        throw new BadRequestException('ต้องระบุ userId (uuid) เมื่อ scope=user');
      }
      return this.kpi.goalsForUser(userId);
    }
    return this.kpi.goalsForRole(roleKey ?? 'creator');
  }

  @Put('goals')
  @RequirePermission('setting', 'C')
  upsert(@Body() dto: UpsertGoalsDto, @CurrentUser() user: AuthUser) {
    return this.kpi.upsertGoals(dto, user);
  }

  // เป้าหมายของตัวเอง — ทุกคนที่ล็อกอินเข้าถึงได้ (ไม่ต้องมีสิทธิ์ setting)
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.kpi.myGoals(user);
  }
}
