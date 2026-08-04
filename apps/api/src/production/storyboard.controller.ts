import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { StoryboardService } from './storyboard.service';
import { GenerateStoryboardPromptsDto } from './dto/storyboard.dto';

// Storyboard (Content Intelligence ระบบ 3) — ต่อยอด shot-list เดิม
// เส้นทางคร่อมทั้ง episodes/ และ shots/ จึงใช้ controller ไม่มี prefix
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class StoryboardController {
  constructor(private storyboard: StoryboardService) {}

  // ร่าง image prompt ให้ทุกช็อตในอีพี (สิทธิ์เดียวกับ shot-list gen = episode C)
  @Post('episodes/:id/storyboard-prompts')
  @RequirePermission('episode', 'C')
  generatePrompts(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GenerateStoryboardPromptsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.storyboard.generatePrompts(id, { regenerate: dto.regenerate }, user);
  }

  // comic-panel view: ช็อตเรียง + prompt + เฟรม
  @Get('episodes/:id/storyboard')
  @RequirePermission('episode', 'V')
  getStoryboard(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.storyboard.getStoryboard(id, user);
  }

  // ร่าง prompt ใหม่ให้ช็อตเดียว (regenerate one)
  @Post('shots/:id/image-prompt')
  @RequirePermission('episode', 'C')
  generateOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.storyboard.generateOne(id, user);
  }
}
