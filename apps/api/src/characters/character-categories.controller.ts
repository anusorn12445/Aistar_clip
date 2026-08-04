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
import { CharacterCategoriesService } from './character-categories.service';
import {
  CreateCharacterCategoryDto,
  ReorderCharacterCategoriesDto,
  UpdateCharacterCategoryDto,
} from './dto/character-category.dto';

// จัดการ taxonomy ประเภทตัวละคร — อยู่ใน Settings (permission `setting`) mirror audience-segments
@Controller('character-categories')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CharacterCategoriesController {
  constructor(private categories: CharacterCategoriesService) {}

  @Get()
  @RequirePermission('setting', 'V')
  list(@Query('status') status?: string) {
    return this.categories.list({ status });
  }

  @Post()
  @RequirePermission('setting', 'C')
  create(@Body() dto: CreateCharacterCategoryDto, @CurrentUser() user: AuthUser) {
    return this.categories.create(dto, user);
  }

  @Post('reorder')
  @RequirePermission('setting', 'C')
  reorder(
    @Body() dto: ReorderCharacterCategoriesDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.categories.reorder(dto, user);
  }

  @Patch(':id')
  @RequirePermission('setting', 'C')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCharacterCategoryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.categories.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermission('setting', 'C')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.categories.remove(id, user);
  }
}
