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
import { GesturesService } from './gestures.service';
import { CreateGestureDto, UpdateGestureDto } from './dto/gesture.dto';

// Gesture Library — perm `library` (list V, mutate C)
@Controller('gestures')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class GesturesController {
  constructor(private gestures: GesturesService) {}

  @Get()
  @RequirePermission('library', 'V')
  list(
    @Query('q') q?: string,
    @Query('category') category?: string,
    @Query('riskLevel') riskLevel?: string,
    @Query('compatiblePackaging') compatiblePackaging?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
  ) {
    return this.gestures.list({
      q,
      category,
      riskLevel,
      compatiblePackaging,
      status,
      page: page ? parseInt(page, 10) : 1,
    });
  }

  @Get(':id')
  @RequirePermission('library', 'V')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.gestures.get(id);
  }

  @Post()
  @RequirePermission('library', 'C')
  create(@Body() dto: CreateGestureDto, @CurrentUser() user: AuthUser) {
    return this.gestures.create(dto, user);
  }

  @Patch(':id')
  @RequirePermission('library', 'C')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGestureDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.gestures.update(id, dto, user);
  }

  @Patch(':id/archive')
  @RequirePermission('library', 'C')
  archive(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.gestures.archive(id, user);
  }
}
