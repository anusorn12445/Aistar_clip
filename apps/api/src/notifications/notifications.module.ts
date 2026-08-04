import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService], // ให้ module อื่น (tasks, characters, ...) เรียก notify() ได้
})
export class NotificationsModule {}
