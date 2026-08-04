import { Body, Controller, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { AiSeriesService } from './ai-series.service';
import { ContinuityCheckDto, NextEpisodeDto } from './dto/series-ai.dto';

// Series Hub AI (Layer 2) — ทุก endpoint เป็น draft/pre-check
// AI ไม่เขียน DB เอง (client เลือกใช้ผลลัพธ์แล้ว save ผ่าน endpoint ปกติ) — guardrail §28.2
@Controller('ai/series')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AiSeriesController {
  constructor(private ai: AiSeriesService) {}

  // 1. AI ร่าง Series Bible จาก premise + ตอนที่มีอยู่ (client save เองผ่าน PATCH /series/:id)
  @Post(':id/bible-draft')
  @RequirePermission('episode', 'C')
  draftBible(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.ai.draftBible(id, user);
  }

  // 2. AI ตรวจ continuity ของ script ตอน เทียบ bible + ตอนก่อนหน้า
  @Post(':id/continuity-check')
  @RequirePermission('episode', 'C')
  continuityCheck(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ContinuityCheckDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ai.continuityCheck(id, dto, user);
  }

  // 3. AI เสนอตอนถัดไป 3 ตัวเลือก (client เลือกแล้วเรียก POST /series/:id/episodes)
  @Post(':id/next-episode')
  @RequirePermission('episode', 'C')
  nextEpisode(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: NextEpisodeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ai.nextEpisode(id, dto, user);
  }
}
