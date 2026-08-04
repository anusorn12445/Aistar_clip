import { Body, Controller, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { AiPhase4Service } from './ai-phase4.service';
import {
  AssetConsistencyDto,
  GenerateCaptionDto,
  GenerateShotListDto,
  WeeklyPlanDto,
} from './dto/phase4.dto';

// Phase 4 AI Intelligence (v0.1 PRD Phase 4 + §28.1) — ทุก endpoint เป็น draft/pre-check
// AI ไม่ approve/publish แทนมนุษย์ (guardrail §28.2)
@Controller('ai')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AiPhase4Controller {
  constructor(private ai: AiPhase4Service) {}

  // 1. AI แตก shot list จาก script (create=true → insert Shot rows ทันที)
  @Post('episodes/:id/shot-list')
  @RequirePermission('episode', 'C')
  generateShotList(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GenerateShotListDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ai.generateShotList(id, dto, user);
  }

  // 2. AI เขียน caption + hashtags + cta (guardrail restrictedClaims ของสินค้า)
  @Post('content/caption')
  @RequirePermission('content', 'C')
  generateCaption(@Body() dto: GenerateCaptionDto, @CurrentUser() user: AuthUser) {
    return this.ai.generateCaption(dto, user);
  }

  // 3. AI ตรวจ character consistency ของรูป asset (vision) — save=true บันทึกเป็น QcReview
  @Post('qc/assets/:assetId/consistency')
  @RequirePermission('qc', 'C')
  checkAssetConsistency(
    @Param('assetId', ParseUUIDPipe) assetId: string,
    @Body() dto: AssetConsistencyDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ai.checkAssetConsistency(assetId, dto, user);
  }

  // 4. AI เช็คความซ้ำของตัวละครเทียบตัวละครอื่นทั้งหมด (text-based v1, cap 20 ตัว)
  @Post('characters/:id/similarity')
  @RequirePermission('character', 'V')
  checkCharacterSimilarity(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.ai.checkCharacterSimilarity(id, user);
  }

  // 5. AI วางแผนคอนเทนต์รายสัปดาห์ (draft เท่านั้น — ไม่เขียน DB)
  @Post('weekly-plan')
  @RequirePermission('content', 'C')
  generateWeeklyPlan(@Body() dto: WeeklyPlanDto, @CurrentUser() user: AuthUser) {
    return this.ai.generateWeeklyPlan(dto, user);
  }
}
