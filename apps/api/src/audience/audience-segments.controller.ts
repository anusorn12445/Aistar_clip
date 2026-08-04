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
import { AudienceSegmentsService } from './audience-segments.service';
import {
  CreateAudienceSegmentDto,
  UpdateAudienceSegmentDto,
} from './dto/audience-segment.dto';

// จัดการ taxonomy กลุ่มผู้ชม — อยู่ใน Settings (permission `setting`)
@Controller('audience-segments')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AudienceSegmentsController {
  constructor(private segments: AudienceSegmentsService) {}

  @Get()
  @RequirePermission('setting', 'V')
  list(@Query('status') status?: string, @Query('q') q?: string) {
    return this.segments.list({ status, q });
  }

  @Get(':id')
  @RequirePermission('setting', 'V')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.segments.get(id);
  }

  @Post()
  @RequirePermission('setting', 'C')
  create(@Body() dto: CreateAudienceSegmentDto, @CurrentUser() user: AuthUser) {
    return this.segments.create(dto, user);
  }

  @Patch(':id')
  @RequirePermission('setting', 'C')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAudienceSegmentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.segments.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermission('setting', 'C')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.segments.remove(id, user);
  }
}
