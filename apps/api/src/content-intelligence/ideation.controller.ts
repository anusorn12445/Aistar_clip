import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { IdeationService } from './ideation.service';
import { ConvertIdeaDto, IdeateDto, ListRunsQuery } from './dto/ideation.dto';

// AI Content Ideation (Content Intelligence §2 + §2.0) — auto/guided/iterate
// permission ใช้ module 'content': คิด/แปลง=C, ดูประวัติ=V
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class IdeationController {
  constructor(private ideation: IdeationService) {}

  // UI เช็คว่าจะโชว์ปุ่ม "คิดไอเดีย" หรือไม่ (graceful degradation)
  @Get('ai/ideate/status')
  @RequirePermission('content', 'V')
  status() {
    return this.ideation.status();
  }

  @Post('ai/ideate')
  @RequirePermission('content', 'C')
  ideate(@Body() dto: IdeateDto, @CurrentUser() user: AuthUser) {
    return this.ideation.ideate(dto, user);
  }

  @Get('ideation-runs')
  @RequirePermission('content', 'V')
  listRuns(@Query() query: ListRunsQuery) {
    return this.ideation.listRuns(query);
  }

  @Get('ideation-runs/:id')
  @RequirePermission('content', 'V')
  getRun(@Param('id', ParseUUIDPipe) id: string) {
    return this.ideation.getRun(id);
  }

  @Post('ideation-runs/:id/convert')
  @RequirePermission('content', 'C')
  convert(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConvertIdeaDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ideation.convert(id, dto, user);
  }
}
