import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SeriesController } from './series.controller';
import { SeriesService } from './series.service';
import { EpisodesController } from './episodes.controller';
import { EpisodesService } from './episodes.service';
import { ShotsController } from './shots.controller';
import { ShotsService } from './shots.service';
import { StoryboardController } from './storyboard.controller';
import { StoryboardService } from './storyboard.service';

// Production Pipeline: Series / Episodes / Shots + Handoff (§E.2)
// + Storyboard (Content Intelligence ระบบ 3) — ร่าง image prompt ต่อช็อต
// Integrator: เพิ่ม ProductionModule เข้า imports ของ AppModule
@Module({
  imports: [AuthModule],
  controllers: [SeriesController, EpisodesController, ShotsController, StoryboardController],
  providers: [SeriesService, EpisodesService, ShotsService, StoryboardService],
})
export class ProductionModule {}
