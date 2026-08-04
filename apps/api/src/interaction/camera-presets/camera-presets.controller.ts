import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/permissions.guard';
import { RequirePermission } from '../../auth/permissions.decorator';
import { CurrentUser, AuthUser } from '../../auth/current-user.decorator';
import { CameraPresetsService } from './camera-presets.service';
import { CreateCameraPresetDto, UpdateCameraPresetDto } from './dto/camera-preset.dto';

// Camera Library (SRS §3.6) — perm `library` (list V, mutate C)
@Controller('camera-presets')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CameraPresetsController {
  constructor(private cameras: CameraPresetsService) {}

  @Get()
  @RequirePermission('library', 'V')
  list(
    @Query('q') q?: string,
    @Query('shotSize') shotSize?: string,
    @Query('angle') angle?: string,
    @Query('cameraMovement') cameraMovement?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
  ) {
    return this.cameras.list({
      q,
      shotSize,
      angle,
      cameraMovement,
      status,
      page: page ? parseInt(page, 10) : 1,
    });
  }

  @Get(':id')
  @RequirePermission('library', 'V')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.cameras.get(id);
  }

  @Post()
  @RequirePermission('library', 'C')
  create(@Body() dto: CreateCameraPresetDto, @CurrentUser() user: AuthUser) {
    return this.cameras.create(dto, user);
  }

  @Patch(':id')
  @RequirePermission('library', 'C')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCameraPresetDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.cameras.update(id, dto, user);
  }

  @Patch(':id/archive')
  @RequirePermission('library', 'C')
  archive(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.cameras.archive(id, user);
  }
}
