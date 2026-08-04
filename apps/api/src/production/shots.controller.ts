import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ShotStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { ShotsService } from './shots.service';
import { ChangeShotStatusDto, UpdateShotDto } from './dto/shot.dto';

@Controller('shots')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ShotsController {
  constructor(private shots: ShotsService) {}

  @Get()
  @RequirePermission('episode', 'V')
  list(
    @CurrentUser() user: AuthUser,
    @Query('episodeId') episodeId?: string,
    @Query('status') status?: ShotStatus,
    @Query('camera') camera?: string,
    @Query('characterId') characterId?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
  ) {
    return this.shots.list({
      episodeId,
      status,
      camera,
      characterId,
      q,
      page: page ? parseInt(page, 10) : 1,
    }, user);
  }

  @Patch(':id')
  @RequirePermission('episode', 'C')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateShotDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.shots.update(id, dto, user);
  }

  @Patch(':id/status')
  @RequirePermission('episode', 'V') // สิทธิ์ A เช็คละเอียดใน service ตาม state machine
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeShotStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.shots.changeStatus(id, dto.status, user);
  }

  @Delete(':id')
  @RequirePermission('episode', 'C')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.shots.remove(id, user);
  }
}
