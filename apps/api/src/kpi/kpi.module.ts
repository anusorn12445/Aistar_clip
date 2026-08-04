import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { KpiController } from './kpi.controller';
import { KpiService } from './kpi.service';
import { AssignmentController } from './assignment.controller';
import { AssignmentService } from './assignment.service';

@Module({
  imports: [AuthModule],
  controllers: [KpiController, AssignmentController],
  providers: [KpiService, AssignmentService],
})
export class KpiModule {}
