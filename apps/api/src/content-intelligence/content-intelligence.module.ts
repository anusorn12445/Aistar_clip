import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AiModule } from '../ai/ai.module';
import { ProductsModule } from '../products/products.module';
import { CustomerFeedbackController } from './customer-feedback.controller';
import { CustomerFeedbackService } from './customer-feedback.service';
import { IdeationController } from './ideation.controller';
import { IdeationService } from './ideation.service';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { RoiController } from './roi.controller';
import { RoiService } from './roi.service';

// Content Intelligence — System 2: AI Content Ideation + Customer Voice + System 4: Content Analytics
// - AiModule → AiClaudeService (shared Claude client)
// - ProductsModule → BrandKnowledgeService.buildBrandContext (ฉีดความรู้แบรนด์เข้า prompt)
// - System 4 (AnalyticsService) ปิดวง: วิเคราะห์ผลงานเก่า → ContentInsight → ป้อนกลับ IdeationService.assembleContext
// หมายเหตุ route order: RoiController (content-insights/roi) ต้องมาก่อน AnalyticsController
// เพราะ analytics มี GET content-insights/:id (ParseUUIDPipe) — ถ้าสลับกัน 'roi' จะโดนจับเป็น :id
@Module({
  imports: [AuthModule, AiModule, ProductsModule],
  controllers: [CustomerFeedbackController, IdeationController, RoiController, AnalyticsController],
  providers: [CustomerFeedbackService, IdeationService, AnalyticsService, RoiService],
  exports: [CustomerFeedbackService, IdeationService, AnalyticsService, RoiService],
})
export class ContentIntelligenceModule {}
