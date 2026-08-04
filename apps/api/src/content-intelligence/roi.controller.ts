import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { RoiService } from './roi.service';
import { RoiQueryDto } from './dto/roi.dto';

// ROI ต่อคลิป — ต้นทุน AI (AiUsageLog) vs ผลงาน (ContentPerformance) ต่อ ContentItem
// permission ใช้ module 'content' V เหมือน analytics — แต่ฝั่งเงิน (gmv/profit/roi)
// ถูก gate ใน service อีกชั้น: เห็นเฉพาะ CEO (admin/founder)
//
// สำคัญ: ต้อง register controller นี้ "ก่อน" AnalyticsController ใน module
// ไม่งั้น GET content-insights/roi จะไปชน route content-insights/:id (ParseUUIDPipe → 400)
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RoiController {
  constructor(private roi: RoiService) {}

  @Get('content-insights/roi')
  @RequirePermission('content', 'V')
  getRoi(@Query() query: RoiQueryDto, @CurrentUser() user: AuthUser) {
    return this.roi.getRoi(query, user);
  }
}
