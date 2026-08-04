import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ContentItemsController } from './content-items.controller';
import { ContentItemsService } from './content-items.service';
import { LiveSessionsController } from './live-sessions.controller';
import { LiveSessionsService } from './live-sessions.service';

@Module({
  imports: [AuthModule],
  controllers: [ContentItemsController, LiveSessionsController],
  providers: [ContentItemsService, LiveSessionsService],
  exports: [ContentItemsService, LiveSessionsService],
})
export class PublishingModule {}
