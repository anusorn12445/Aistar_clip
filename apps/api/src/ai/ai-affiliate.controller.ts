import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { AiAffiliateService } from './ai-affiliate.service';
import { AffiliateBatchDto, AffiliateReviewDto } from './dto/affiliate.dto';

// Affiliate Content Factory (Phase 1) — AI สร้างชุดคอนเทนต์รีวิวสินค้า affiliate
// permission ใช้ 'content' 'C' เหมือน AI Caption tool (สร้างคอนเทนต์)
@Controller('ai/affiliate')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AiAffiliateController {
  constructor(private affiliate: AiAffiliateService) {}

  // UI เช็คว่าจะโชว์ปุ่ม generate หรือไม่ (graceful degradation)
  @Get('status')
  @RequirePermission('content', 'V')
  status() {
    return this.affiliate.status();
  }

  // สินค้า 1 ตัว → ชุดคอนเทนต์พร้อมโพสต์ (script + shot list + caption + hashtags)
  @Post('review')
  @RequirePermission('content', 'C')
  review(@Body() dto: AffiliateReviewDto, @CurrentUser() user: AuthUser) {
    return this.affiliate.generateReview(dto, user);
  }

  // สร้างทีเดียวทั้งหมวด หรือ productIds[]
  @Post('batch')
  @RequirePermission('content', 'C')
  batch(@Body() dto: AffiliateBatchDto, @CurrentUser() user: AuthUser) {
    return this.affiliate.generateBatch(dto, user);
  }

  // คอนเทนต์ affiliate ที่สร้างแล้ว — กรองด้วย category หรือ productId
  @Get('content')
  @RequirePermission('content', 'V')
  content(@Query('category') category?: string, @Query('productId') productId?: string) {
    return this.affiliate.listContent({ category, productId });
  }
}
