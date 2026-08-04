import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { AiClaudeService } from '../ai/ai-claude.service';
import { PromptCaptureService } from './prompt-capture.service';
import { CaptureCreateDto, CaptureExtractDto, CaptureFetchUrlDto } from './dto/capture.dto';

// Prompt Quick-Capture ("เพิ่มเร็ว") — วางโพสต์จาก Facebook → AI แตกฟิลด์ → รีวิว → บันทึก
// permission 'prompt' C เหมือนการสร้าง prompt ปกติ
@Controller('prompts/capture')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PromptCaptureController {
  constructor(
    private capture: PromptCaptureService,
    private claude: AiClaudeService,
  ) {}

  // UI probe — โชว์/ซ่อนปุ่ม AI (graceful degradation แบบเดียวกับหน้า AI อื่น ๆ)
  @Get('status')
  @RequirePermission('prompt', 'V')
  async status() {
    return {
      configured: await this.claude.isConfigured(),
      model: await this.claude.resolveModel(),
    };
  }

  // วางรูป+ข้อความ → Claude แตกเป็นฟิลด์ (ไม่ persist — user รีวิวก่อน)
  @Post('extract')
  @RequirePermission('prompt', 'C')
  extract(@Body() dto: CaptureExtractDto, @CurrentUser() user: AuthUser) {
    return this.capture.extract(dto, user);
  }

  // วางลิงก์สาธารณะ → best-effort ดึง Open Graph (title/description/รูป)
  @Post('fetch-url')
  @RequirePermission('prompt', 'C')
  fetchUrl(@Body() dto: CaptureFetchUrlDto, @CurrentUser() user: AuthUser) {
    return this.capture.fetchUrl(dto.url, user);
  }

  // บันทึกหลังรีวิว → Prompt (draft) + PromptVersion v1 (+sourceUrl) + รูปตัวอย่าง
  @Post()
  @RequirePermission('prompt', 'C')
  create(@Body() dto: CaptureCreateDto, @CurrentUser() user: AuthUser) {
    return this.capture.capture(dto, user);
  }
}
