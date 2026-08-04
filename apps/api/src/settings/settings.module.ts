import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

// @Global เพื่อให้ AI services (ai, ai-phase4, ai-series, ai-assist) inject SettingsService
// ได้โดยไม่ต้อง import module (กัน import cycle) — integrator ต้อง register ใน AppModule
@Global()
@Module({
  imports: [AuthModule],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
