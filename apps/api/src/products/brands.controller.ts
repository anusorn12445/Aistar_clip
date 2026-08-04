import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { BrandsService } from './brands.service';
import { CreateBrandDto, UpdateBrandDto } from './dto/create-brand.dto';
import { SetBrandAudiencesDto } from './dto/brand-audiences.dto';
import { ShareBrandBookDto } from './dto/share-brand-book.dto';

@Controller('brands')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BrandsController {
  constructor(private brands: BrandsService) {}

  @Get()
  @RequirePermission('product', 'V')
  list(@Query('q') q?: string, @Query('status') status?: string) {
    return this.brands.list({ q, status });
  }

  @Get(':id')
  @RequirePermission('product', 'V')
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.brands.getOne(id);
  }

  // aggregate เดียวจบสำหรับมุมมองอ่าน Brand Book (/brands/[id]/book ฝั่งเว็บ)
  @Get(':id/book')
  @RequirePermission('product', 'V')
  book(@Param('id', ParseUUIDPipe) id: string) {
    return this.brands.getBook(id);
  }

  @Get(':id/audiences')
  @RequirePermission('product', 'V')
  audiences(@Param('id', ParseUUIDPipe) id: string) {
    return this.brands.getAudiences(id);
  }

  @Put(':id/audiences')
  @RequirePermission('product', 'C')
  setAudiences(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetBrandAudiencesDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.brands.setAudiences(id, dto.items, user);
  }

  // เปิด/หมุนลิงก์แชร์ Brand Book ให้ลูกค้า (read-only, ไม่ต้อง login) — คืน {token}
  @Post(':id/share')
  @RequirePermission('product', 'C')
  share(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ShareBrandBookDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.brands.enableShare(id, !!dto.rotate, user);
  }

  // ปิดลิงก์แชร์ (revoke) — ลิงก์เดิมใช้ไม่ได้ทันที
  @Delete(':id/share')
  @RequirePermission('product', 'C')
  unshare(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.brands.revokeShare(id, user);
  }

  @Post()
  @RequirePermission('product', 'C')
  create(@Body() dto: CreateBrandDto, @CurrentUser() user: AuthUser) {
    return this.brands.create(dto, user);
  }

  @Patch(':id')
  @RequirePermission('product', 'C')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBrandDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.brands.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermission('product', 'C')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.brands.remove(id, user);
  }
}
