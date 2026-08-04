import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { AiClaudeService } from './ai-claude.service';
import { AiLibraryCaptureService } from './ai-library-capture.service';
import { LibraryCaptureExtractDto } from './dto/library-capture.dto';

// External Capture ("สร้างจากภายนอก") ของคลัง production —
// วางข้อความ+รูปที่ gen จาก AI ค่ายนอก → Claude แตกเป็นฟิลด์ของคลังปลายทาง (review-first, ไม่ persist)
// permission เช็คต่อ targetType ใน service (= สิทธิ์ C ของ entity ปลายทาง: location หรือ library)
@Controller('library-capture')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AiLibraryCaptureController {
  constructor(
    private capture: AiLibraryCaptureService,
    private claude: AiClaudeService,
  ) {}

  // UI probe — โชว์/ซ่อนปุ่ม AI (graceful degradation แบบเดียวกับ /ai/status)
  @Get('status')
  async status() {
    return {
      configured: await this.claude.isConfigured(),
      model: await this.claude.resolveActiveModel(),
    };
  }

  // วางข้อความ+รูป → Claude แตกเป็นฟิลด์ของ targetType (ไม่ persist — user รีวิวในฟอร์ม create ปกติ)
  @Post('extract')
  extract(@Body() dto: LibraryCaptureExtractDto, @CurrentUser() user: AuthUser) {
    return this.capture.extract(dto, user);
  }
}
