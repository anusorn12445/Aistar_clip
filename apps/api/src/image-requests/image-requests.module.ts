import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AiModule } from '../ai/ai.module';
import { ProductsModule } from '../products/products.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ImageRequestsController } from './image-requests.controller';
import { ImageRequestsService } from './image-requests.service';
import { DraftPromptService } from './draft-prompt.service';

// งานภาพ (Image Request) — ticket ผลิตภาพประกอบคอนเทนต์
// พึ่ง: ScopeService (AuthModule) · AiClaudeService (AiModule)
//      BrandKnowledgeService (ProductsModule) · NotificationsService
@Module({
  imports: [AuthModule, AiModule, ProductsModule, NotificationsModule],
  controllers: [ImageRequestsController],
  providers: [ImageRequestsService, DraftPromptService],
  exports: [ImageRequestsService],
})
export class ImageRequestsModule {}
