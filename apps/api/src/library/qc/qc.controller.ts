import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/permissions.guard';
import { RequirePermission } from '../../auth/permissions.decorator';
import { CurrentUser, AuthUser } from '../../auth/current-user.decorator';
import { QcService } from './qc.service';
import { CreateQcReviewDto } from './dto/create-qc-review.dto';

@Controller('qc-reviews')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class QcController {
  constructor(private qc: QcService) {}

  // ต้องอยู่ก่อน route แบบ param เสมอ
  @Get('summary')
  @RequirePermission('qc', 'V')
  summary(@Query('entityType') entityType: string, @Query('entityId') entityId: string) {
    return this.qc.summary(entityType, entityId);
  }

  @Get()
  @RequirePermission('qc', 'V')
  list(
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('category') category?: string,
    @Query('scoreMin') scoreMin?: string,
    @Query('scoreMax') scoreMax?: string,
    @Query('reviewerId') reviewerId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('sortBy') sortBy?: string,
    @Query('page') page?: string,
  ) {
    return this.qc.list({
      entityType,
      entityId,
      category,
      scoreMin: scoreMin ? parseInt(scoreMin, 10) : undefined,
      scoreMax: scoreMax ? parseInt(scoreMax, 10) : undefined,
      reviewerId,
      dateFrom,
      dateTo,
      sortBy,
      page: page ? parseInt(page, 10) : 1,
    });
  }

  @Post()
  @RequirePermission('qc', 'C')
  create(@Body() dto: CreateQcReviewDto, @CurrentUser() user: AuthUser) {
    return this.qc.create(dto, user);
  }
}
