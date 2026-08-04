import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { AssignmentService } from './assignment.service';
import { PERIODS, Period } from './kpi.constants';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Assignment Hub — มอบหมายงาน + KPI รายคน
@Controller('kpi')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AssignmentController {
  constructor(private assignment: AssignmentService) {}

  /**
   * GET /kpi/assignment-summary?period=weekly|monthly&teamId=&roleKey=
   * สิทธิ์: ใช้ 'setting' V เดียวกับ kpi read เดิม (GET /kpi/goals ที่ dashboard/settings ใช้)
   * หมายเหตุ: ข้อมูลรายคน = มุมมองหัวหน้า/lead — role ที่มี setting V (admin/CEO) เห็นเต็มเสมอ
   */
  @Get('assignment-summary')
  @RequirePermission('setting', 'V')
  summary(
    @Query('period') period?: string,
    @Query('teamId') teamId?: string,
    @Query('roleKey') roleKey?: string,
  ) {
    const p: Period = (PERIODS as readonly string[]).includes(period ?? '')
      ? (period as Period)
      : 'weekly';
    if (teamId && !UUID_RE.test(teamId)) {
      throw new BadRequestException('teamId ต้องเป็น uuid');
    }
    return this.assignment.summary(p, teamId || undefined, roleKey || undefined);
  }
}
