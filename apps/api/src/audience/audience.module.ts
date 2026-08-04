import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AudienceSegmentsController } from './audience-segments.controller';
import { AudienceSegmentsService } from './audience-segments.service';
import { AudienceLinksService } from './audience-links.service';
import { CharacterAudienceController } from './character-audience.controller';
import { SeriesAudienceController } from './series-audience.controller';

// Audience Segment — taxonomy กลางของกลุ่มผู้ชม (Phase 1)
// catalog อยู่ใน Settings (`setting`); link ต่อ character (`character`) / series (`episode`)
@Module({
  imports: [AuthModule],
  controllers: [
    AudienceSegmentsController,
    CharacterAudienceController,
    SeriesAudienceController,
  ],
  providers: [AudienceSegmentsService, AudienceLinksService],
})
export class AudienceModule {}
