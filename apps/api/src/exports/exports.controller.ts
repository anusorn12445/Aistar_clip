import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { IsIn, IsOptional } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { ExportsService } from './exports.service';

class CreateExportDto {
  // Phase 1 รองรับเฉพาะ zip (default) — pdf/markdown/json มาทีหลัง
  @IsOptional()
  @IsIn(['zip'])
  format?: string;
}

// สิทธิ์ E (Export/Download package) จำกัดเฉพาะ Admin, Founder, Creative Lead (§C)
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ExportsController {
  constructor(private exports: ExportsService) {}

  @Post('characters/:id/export')
  @RequirePermission('character', 'E')
  createCharacterExport(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateExportDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.exports.createCharacterExport(id, dto.format ?? 'zip', user);
  }

  @Get('exports/:jobId')
  @RequirePermission('character', 'E')
  getJob(@Param('jobId', ParseUUIDPipe) jobId: string) {
    return this.exports.getJob(jobId);
  }

  @Get('exports/:jobId/download')
  @RequirePermission('character', 'E')
  download(
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    return this.exports.download(jobId, user, res);
  }
}
