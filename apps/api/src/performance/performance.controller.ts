import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { PerformanceService } from './performance.service';
import { CreatePerformanceDto } from './dto/create-performance.dto';

const MAX_CSV_SIZE = 10 * 1024 * 1024; // 10MB พอสำหรับ CSV performance

@Controller('performance')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PerformanceController {
  constructor(private performance: PerformanceService) {}

  // ── insight engine (ต้องมาก่อน :id routes) ────────────────

  @Get('summary')
  @RequirePermission('performance', 'V')
  summary(
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('groupBy') groupBy?: string,
  ) {
    return this.performance.summary({ dateFrom, dateTo, groupBy });
  }

  @Get('overview')
  @RequirePermission('performance', 'V')
  overview(@Query('dateFrom') dateFrom?: string, @Query('dateTo') dateTo?: string) {
    return this.performance.overview({ dateFrom, dateTo });
  }

  // ── CSV import (D6) ────────────────────────────────────────

  @Get('import/template')
  @RequirePermission('performance', 'V')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="performance_import_template.csv"')
  template(): string {
    return this.performance.csvTemplate();
  }

  @Post('import')
  @RequirePermission('performance', 'C')
  @UseInterceptors(
    FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_CSV_SIZE } }),
  )
  importCsv(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: AuthUser) {
    return this.performance.importCsv(file, user);
  }

  // ── manual entry + list + delete ───────────────────────────

  @Post()
  @RequirePermission('performance', 'C')
  create(@Body() dto: CreatePerformanceDto, @CurrentUser() user: AuthUser) {
    return this.performance.create(dto, user);
  }

  @Get()
  @RequirePermission('performance', 'V')
  list(
    @Query('contentItemId') contentItemId?: string,
    @Query('liveSessionId') liveSessionId?: string,
    @Query('platform') platform?: string,
    @Query('source') source?: string,
    @Query('recordedFrom') recordedFrom?: string,
    @Query('recordedTo') recordedTo?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
    @Query('page') page?: string,
  ) {
    return this.performance.list({
      contentItemId,
      liveSessionId,
      platform,
      source,
      recordedFrom,
      recordedTo,
      sortBy,
      sortDir,
      page: page ? parseInt(page, 10) : 1,
    });
  }

  @Delete(':id')
  @RequirePermission('performance', 'C') // แก้ผิดลบได้ — บันทึกใหม่แทน
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.performance.remove(id, user);
  }
}
