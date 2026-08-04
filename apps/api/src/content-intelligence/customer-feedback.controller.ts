import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { CustomerFeedbackService } from './customer-feedback.service';
import {
  BulkFeedbackDto,
  CreateFeedbackDto,
  ExtractReviewsDto,
  InsightsQuery,
  ListFeedbackQuery,
  UpdateFeedbackDto,
} from './dto/customer-feedback.dto';

// Customer Voice (Content Intelligence §2.1) — เก็บ+วิเคราะห์เสียงลูกค้า
// permission ใช้ module 'content' (สอดคล้อง ideation/affiliate): view=V, เขียน=C
@Controller('customer-feedback')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CustomerFeedbackController {
  constructor(private feedback: CustomerFeedbackService) {}

  @Post()
  @RequirePermission('content', 'C')
  create(@Body() dto: CreateFeedbackDto, @CurrentUser() user: AuthUser) {
    return this.feedback.create(dto, user);
  }

  @Post('bulk')
  @RequirePermission('content', 'C')
  bulk(@Body() dto: BulkFeedbackDto, @CurrentUser() user: AuthUser) {
    return this.feedback.createBulk(dto, user);
  }

  // วางก้อนรีวิว Shopee ทั้งหน้า → AI แยกรายรีวิว อ่านดาว เก็บเฉพาะ 4-5 ดาวเข้าคลังของสินค้า
  @Post('extract-reviews')
  @RequirePermission('content', 'C')
  extractReviews(@Body() dto: ExtractReviewsDto, @CurrentUser() user: AuthUser) {
    return this.feedback.extractReviews(dto, user);
  }

  @Get()
  @RequirePermission('content', 'V')
  list(@Query() query: ListFeedbackQuery) {
    return this.feedback.list(query);
  }

  @Get('insights')
  @RequirePermission('content', 'V')
  insights(@Query() query: InsightsQuery) {
    return this.feedback.insights(query);
  }

  @Patch(':id')
  @RequirePermission('content', 'C')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFeedbackDto) {
    return this.feedback.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('content', 'C')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.feedback.remove(id);
  }

  @Post(':id/reprocess')
  @RequirePermission('content', 'C')
  reprocess(@Param('id', ParseUUIDPipe) id: string) {
    return this.feedback.reprocess(id);
  }
}
