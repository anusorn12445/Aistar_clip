import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// health-check สำหรับ Railway/monitoring — ไม่ต้อง auth (ต้องเช็คได้จากภายนอก)
// route = /api/health (มี global prefix 'api')
@Controller('health')
export class HealthController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', db: 'up', time: new Date().toISOString() };
    } catch {
      // ให้ตอบ 200 พร้อม db:down เพื่อไม่ให้ container ถูกฆ่าทันทีตอน DB สะดุดชั่วคราว
      // (Railway healthcheck ใช้ status field ได้ ถ้าต้องการเข้มกว่านี้ค่อยปรับเป็น 503)
      return { status: 'degraded', db: 'down', time: new Date().toISOString() };
    }
  }
}
