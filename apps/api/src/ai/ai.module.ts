import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AssetsModule } from '../assets/assets.module';
import { CharactersModule } from '../characters/characters.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiCharacterCaptureService } from './ai-character-capture.service';
import { AiCharacterSpecVerifyService } from './ai-character-spec-verify.service';
import { AiPhase4Controller } from './ai-phase4.controller';
import { AiPhase4Service } from './ai-phase4.service';
import { AiSeriesController } from './ai-series.controller';
import { AiSeriesService } from './ai-series.service';
import { AiClaudeService } from './ai-claude.service';
import { AiAffiliateController } from './ai-affiliate.controller';
import { AiAffiliateService } from './ai-affiliate.service';
import { AiLibraryCaptureController } from './ai-library-capture.controller';
import { AiLibraryCaptureService } from './ai-library-capture.service';

@Module({
  imports: [AuthModule, AssetsModule, CharactersModule],
  controllers: [
    AiController,
    AiPhase4Controller,
    AiSeriesController,
    AiAffiliateController,
    AiLibraryCaptureController,
  ],
  providers: [
    AiService,
    AiCharacterCaptureService,
    AiCharacterSpecVerifyService,
    AiPhase4Service,
    AiSeriesService,
    AiClaudeService,
    AiAffiliateService,
    AiLibraryCaptureService,
  ],
  exports: [AiService, AiPhase4Service, AiSeriesService, AiClaudeService, AiAffiliateService],
})
export class AiModule {}
