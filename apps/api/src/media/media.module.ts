import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MediaLinksController } from './media-links.controller';
import { MediaLinksService } from './media-links.service';

// Media Center — ลิงก์ Google Drive / คลังงานของทีม
// hub อยู่แถบเมนูหลัก (ดูได้ทุกคน) · จัดการลิงก์อยู่ใน Settings (`setting` = admin)
@Module({
  imports: [AuthModule],
  controllers: [MediaLinksController],
  providers: [MediaLinksService],
})
export class MediaModule {}
