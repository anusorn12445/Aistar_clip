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
import { HandProfilesService } from './hand-profiles.service';
import { CreateHandProfileDto, UpdateHandProfileDto } from './dto/hand-profile.dto';

// Hand Library — perm `library` (list V, mutate C)
@Controller('hands')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class HandProfilesController {
  constructor(private hands: HandProfilesService) {}

  @Get()
  @RequirePermission('library', 'V')
  list(
    @Query('q') q?: string,
    @Query('category') category?: string,
    @Query('status') status?: string,
    @Query('productCategorySuitability') productCategorySuitability?: string,
    @Query('isChild') isChild?: string,
    @Query('page') page?: string,
  ) {
    return this.hands.list({
      q,
      category,
      status,
      productCategorySuitability,
      isChild,
      page: page ? parseInt(page, 10) : 1,
    });
  }

  @Get(':id')
  @RequirePermission('library', 'V')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.hands.get(id);
  }

  @Post()
  @RequirePermission('library', 'C')
  create(@Body() dto: CreateHandProfileDto, @CurrentUser() user: AuthUser) {
    return this.hands.create(dto, user);
  }

  @Patch(':id')
  @RequirePermission('library', 'C')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateHandProfileDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.hands.update(id, dto, user);
  }

  @Patch(':id/archive')
  @RequirePermission('library', 'C')
  archive(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.hands.archive(id, user);
  }
}
