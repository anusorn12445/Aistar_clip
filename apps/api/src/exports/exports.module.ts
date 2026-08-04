import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ExportsController } from './exports.controller';
import { ExportsService } from './exports.service';
import { ObsidianController } from './obsidian.controller';
import { ObsidianService } from './obsidian.service';

@Module({
  imports: [AuthModule],
  // ObsidianController มาก่อน — route /exports/obsidian ต้อง match ก่อน /exports/:jobId
  controllers: [ObsidianController, ExportsController],
  providers: [ExportsService, ObsidianService],
})
export class ExportsModule {}
