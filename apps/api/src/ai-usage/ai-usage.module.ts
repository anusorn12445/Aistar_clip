import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AiToolsController } from './ai-tools.controller';
import { AiToolsService } from './ai-tools.service';
import { AiUsageController } from './ai-usage.controller';
import { AiUsageService } from './ai-usage.service';

@Module({
  imports: [AuthModule],
  controllers: [AiToolsController, AiUsageController],
  providers: [AiToolsService, AiUsageService],
})
export class AiUsageModule {}
