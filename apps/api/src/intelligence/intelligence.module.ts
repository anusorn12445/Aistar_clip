import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AiAssistService } from './ai-assist.service';
import { IdeasController } from './ideas.controller';
import { IdeasService } from './ideas.service';
import { PostitsController } from './postits.controller';
import { PostitsService } from './postits.service';
import { CompetitorsController, InsightsController } from './competitors.controller';
import { CompetitorsService } from './competitors.service';

// Intelligence wave: Idea Library (§19) + Post-it Board (§20) + Competitor Intelligence (§18)
@Module({
  imports: [AuthModule],
  controllers: [IdeasController, PostitsController, CompetitorsController, InsightsController],
  providers: [AiAssistService, IdeasService, PostitsService, CompetitorsService],
})
export class IntelligenceModule {}
