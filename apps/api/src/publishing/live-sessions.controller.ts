import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { LiveStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsArray, IsEnum, ValidateNested } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { LiveSessionsService } from './live-sessions.service';
import { CreateLiveSessionDto, LiveProductItemDto } from './dto/create-live-session.dto';
import { UpdateLiveSessionDto } from './dto/update-live-session.dto';

class ChangeLiveStatusDto {
  @IsEnum(LiveStatus)
  status!: LiveStatus;
}

class ReplaceLiveProductsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LiveProductItemDto)
  items!: LiveProductItemDto[];
}

@Controller('live-sessions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LiveSessionsController {
  constructor(private liveSessions: LiveSessionsService) {}

  @Get()
  @RequirePermission('live', 'V')
  list(
    @Query('q') q?: string,
    @Query('platform') platform?: string,
    @Query('status') status?: LiveStatus,
    @Query('characterId') characterId?: string,
    @Query('scheduledFrom') scheduledFrom?: string,
    @Query('scheduledTo') scheduledTo?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.liveSessions.list({
      q,
      platform,
      status,
      characterId,
      scheduledFrom,
      scheduledTo,
      sortBy,
      sortDir,
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }

  @Get(':id')
  @RequirePermission('live', 'V')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.liveSessions.get(id);
  }

  @Post()
  @RequirePermission('live', 'C')
  create(@Body() dto: CreateLiveSessionDto, @CurrentUser() user: AuthUser) {
    return this.liveSessions.create(dto, user);
  }

  @Patch(':id')
  @RequirePermission('live', 'C')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLiveSessionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.liveSessions.update(id, dto, user);
  }

  // scheduled→live→done ต้องมีสิทธิ์ P, scheduled→cancelled ต้องมี C — เช็คใน service
  @Patch(':id/status')
  @RequirePermission('live', 'V')
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeLiveStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.liveSessions.changeStatus(id, dto.status, user);
  }

  @Put(':id/products')
  @RequirePermission('live', 'C')
  replaceProducts(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplaceLiveProductsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.liveSessions.replaceProducts(id, dto.items, user);
  }
}
