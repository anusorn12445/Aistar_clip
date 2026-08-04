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
import { LightingPresetsService } from './lighting-presets.service';
import { CreateLightingPresetDto, UpdateLightingPresetDto } from './dto/lighting-preset.dto';

// Lighting Library (SRS §3.7) — perm `library` (list V, mutate C)
@Controller('lighting-presets')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LightingPresetsController {
  constructor(private lightings: LightingPresetsService) {}

  @Get()
  @RequirePermission('library', 'V')
  list(
    @Query('q') q?: string,
    @Query('mood') mood?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
  ) {
    return this.lightings.list({
      q,
      mood,
      status,
      page: page ? parseInt(page, 10) : 1,
    });
  }

  @Get(':id')
  @RequirePermission('library', 'V')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.lightings.get(id);
  }

  @Post()
  @RequirePermission('library', 'C')
  create(@Body() dto: CreateLightingPresetDto, @CurrentUser() user: AuthUser) {
    return this.lightings.create(dto, user);
  }

  @Patch(':id')
  @RequirePermission('library', 'C')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLightingPresetDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.lightings.update(id, dto, user);
  }

  @Patch(':id/archive')
  @RequirePermission('library', 'C')
  archive(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.lightings.archive(id, user);
  }
}
