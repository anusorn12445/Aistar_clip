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
import { CategoriesService } from './categories.service';
import {
  CreateCategoryDto,
  ReorderCategoriesDto,
  UpdateCategoryDto,
} from './dto/create-category.dto';

@Controller('categories')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CategoriesController {
  constructor(private categories: CategoriesService) {}

  @Get()
  @RequirePermission('product', 'V')
  list(@Query('status') status?: string) {
    return this.categories.list({ status });
  }

  @Post()
  @RequirePermission('product', 'C')
  create(@Body() dto: CreateCategoryDto, @CurrentUser() user: AuthUser) {
    return this.categories.create(dto, user);
  }

  @Post('reorder')
  @RequirePermission('product', 'C')
  reorder(@Body() dto: ReorderCategoriesDto, @CurrentUser() user: AuthUser) {
    return this.categories.reorder(dto, user);
  }

  @Patch(':id')
  @RequirePermission('product', 'C')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.categories.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermission('product', 'C')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.categories.remove(id, user);
  }
}
