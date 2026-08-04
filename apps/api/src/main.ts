import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // CORS origin ตั้งผ่าน env ได้ (comma-separated) — production ชี้มาที่โดเมนของ web
  const origins = (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api');
  // 0.0.0.0 เพื่อให้ Railway/container เข้าถึงได้ (ไม่ใช่แค่ localhost)
  await app.listen(process.env.PORT ?? 4000, '0.0.0.0');
}
bootstrap();
