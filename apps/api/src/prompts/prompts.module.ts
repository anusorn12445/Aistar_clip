import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AiModule } from '../ai/ai.module';
import { AssetsModule } from '../assets/assets.module';
import { PromptsController } from './prompts.controller';
import { PlatformsController } from './platforms.controller';
import { PromptVersionsController } from './prompt-versions.controller';
import { PromptCaptureController } from './prompt-capture.controller';
import { PromptHubController } from './prompt-hub.controller';
import { PromptsService } from './prompts.service';
import { PromptCaptureService } from './prompt-capture.service';
import { PromptHubService } from './prompt-hub.service';

@Module({
  imports: [AuthModule, AiModule, AssetsModule],
  // PromptCaptureController/PromptHubController มาก่อน PromptsController
  // — กัน route /prompts/capture และ /prompts/hub ชนกับ :id
  controllers: [
    PromptCaptureController,
    PromptHubController,
    PromptsController,
    PlatformsController,
    PromptVersionsController,
  ],
  providers: [PromptsService, PromptCaptureService, PromptHubService],
})
export class PromptsModule {}
