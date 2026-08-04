import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [JobsController, ClientsController],
  providers: [JobsService, ClientsService],
  exports: [JobsService, ClientsService],
})
export class JobsModule {}
