import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AiModule } from '../ai/ai.module';
import { AssetsModule } from '../assets/assets.module';
import { InteractionModule } from '../interaction/interaction.module';
import { AffiliateClipsController } from './affiliate-clips.controller';
import { AffiliateClipsService } from './affiliate-clips.service';

// Affiliate Video Production — Clip Jobs (สายผลิตคลิป affiliate ที่ CEO อนุมัติ แยกจาก Production ซีรีส์)
// BINDER module: AiModule → AiClaudeService/AiAffiliateService · InteractionModule → DirectorService/TemplatesService
@Module({
  imports: [AuthModule, AiModule, InteractionModule, AssetsModule], // AssetsModule → Vision QC โหลดรูป
  controllers: [AffiliateClipsController],
  providers: [AffiliateClipsService],
})
export class AffiliateClipsModule {}
