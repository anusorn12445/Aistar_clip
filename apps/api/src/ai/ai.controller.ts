import { Body, Controller, Get, Post, UseGuards, Param, ParseUUIDPipe } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { AiService } from './ai.service';
import { AiCharacterCaptureService } from './ai-character-capture.service';
import { AiCharacterSpecVerifyService } from './ai-character-spec-verify.service';
import { GenerateCharacterDraftDto } from './dto/generate-character-draft.dto';
import { DraftSection } from './character-draft.schema';
import { CharacterCaptureDto } from './dto/character-capture.dto';
import { CharacterSpecVerifyDto } from './dto/character-spec-verify.dto';

@Controller('ai')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AiController {
  constructor(
    private ai: AiService,
    private characterCapture: AiCharacterCaptureService,
    private specVerify: AiCharacterSpecVerifyService,
  ) {}

  // UI ใช้เช็คว่าจะโชว์ปุ่ม AI generate หรือไม่ (ยังไม่ตั้ง key = ซ่อนปุ่ม กรอกมือได้ตามปกติ)
  @Get('status')
  status() {
    return this.ai.status();
  }

  // AI Fill สำหรับ Character Wizard (addendum §H) — ต้องมีสิทธิ์สร้าง character
  // ให้ AI ร่าง Character Bible ให้ตัวละครที่มีอยู่แล้ว (ไม่ต้องมีรูป) — เติม/regenerate ต่อ section
  @Post('characters/:id/generate-bible')
  @RequirePermission('character', 'C')
  generateBible(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { sections?: DraftSection[]; mode?: 'fill_empty' | 'overwrite' },
    @CurrentUser() user: AuthUser,
  ) {
    return this.ai.generateBibleForCharacter(id, dto, user);
  }

  @Post('characters/draft')
  @RequirePermission('character', 'C')
  generateCharacterDraft(@Body() dto: GenerateCharacterDraftDto, @CurrentUser() user: AuthUser) {
    return this.ai.generateCharacterDraft(dto, user);
  }

  // Reverse-capture ("สร้างจากภายนอก") — วางสรุป + รูปที่ค่ายนอก gen มา → แตกเป็น Character draft
  // ไม่ persist (review-first) — ค่ายนอกสร้างรูปเสร็จแล้วผู้ใช้เอากลับมาให้ Claude อ่าน multimodal
  @Post('characters/capture')
  @RequirePermission('character', 'C')
  captureCharacter(@Body() dto: CharacterCaptureDto, @CurrentUser() user: AuthUser) {
    return this.characterCapture.capture(dto, user);
  }

  // วิเคราะห์ตัวละครจากรูป → เติมรายละเอียดลง Bible ตัวเดิม (ไม่ส่งรูป = ใช้รูปในแกลเลอรีตัวละคร)
  @Post('characters/:id/analyze-image')
  @RequirePermission('character', 'C')
  analyzeCharacterImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CharacterCaptureDto & { mode?: 'fill_empty' | 'overwrite' },
    @CurrentUser() user: AuthUser,
  ) {
    return this.characterCapture.analyzeIntoCharacter(id, dto, user);
  }

  // Verify: ตรวจ "รูปที่ gen มาจากค่ายนอก" เทียบ visualDna ที่บันทึกไว้ (round-trip diff)
  // per-field checklist (match/mismatch/uncertain) + score — ปิดลูป Master Prompt → gen → ตรวจ
  @Post('character-spec-verify')
  @RequirePermission('character', 'C')
  verifyCharacterSpec(@Body() dto: CharacterSpecVerifyDto, @CurrentUser() user: AuthUser) {
    return this.specVerify.verify(dto, user);
  }
}
