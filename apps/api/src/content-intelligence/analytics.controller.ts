import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { AnalyticsService } from './analytics.service';
import { GenerateInsightDto, ListInsightsQuery } from './dto/analytics.dto';

// Content Analytics (Content Intelligence §4) — วิเคราะห์คอนเทนต์ที่เคยทำ → insight → ป้อนกลับ System 2
// permission ใช้ module 'content': วิเคราะห์=C, ดู=V
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AnalyticsController {
  constructor(private analytics: AnalyticsService) {}

  // UI เช็คว่าจะโชว์/enable ปุ่ม "วิเคราะห์ด้วย AI" หรือไม่ (graceful degradation)
  @Get('content-insights/status')
  @RequirePermission('content', 'V')
  status() {
    return this.analytics.status();
  }

  @Post('content-insights/generate')
  @RequirePermission('content', 'C')
  generate(@Body() dto: GenerateInsightDto, @CurrentUser() user: AuthUser) {
    return this.analytics.generate(dto, user);
  }

  @Get('content-insights')
  @RequirePermission('content', 'V')
  list(@Query() query: ListInsightsQuery) {
    return this.analytics.list(query);
  }

  @Get('content-insights/:id')
  @RequirePermission('content', 'V')
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.analytics.getOne(id);
  }
}
