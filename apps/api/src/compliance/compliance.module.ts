import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AiModule } from '../ai/ai.module';
import { BannedWordsController } from './banned-words.controller';
import { BannedWordsService } from './banned-words.service';

// Banned Words Compliance — คลังคำต้องห้าม 3 ชั้น:
// L1 ฉีดเข้า prompt AI script writer (ai-affiliate.service ใช้ util + prisma ตรง — ไม่พึ่งโมดูลนี้ กันวงกลม)
// L2 scanner (endpoint /banned-words/scan + เว็บ mirror ใน lib/banned-words.ts)
// L3 hard gate ตอน Clip Job → ready/published (affiliate-clips.service ใช้ util + prisma ตรงเช่นกัน)
@Module({
  imports: [AuthModule, AiModule],
  controllers: [BannedWordsController],
  providers: [BannedWordsService],
  exports: [BannedWordsService],
})
export class ComplianceModule {}
