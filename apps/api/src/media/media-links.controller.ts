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
import { MediaLinksService } from './media-links.service';
import { CreateMediaLinkDto, UpdateMediaLinkDto } from './dto/media-link.dto';

// Media Center — ลิงก์ Google Drive / คลังงานของทีม
// GET (hub) = ทุกคนที่ล็อกอิน · จัดการ (admin catalog) = permission `setting`
@Controller('media-links')
@UseGuards(JwtAuthGuard)
export class MediaLinksController {
  constructor(private media: MediaLinksService) {}

  // หน้า hub — เฉพาะ active (หรือ filter category)
  @Get()
  list(@Query('category') category?: string) {
    return this.media.list({ category });
  }

  // หน้าจัดการใน Settings — รวม archived (admin)
  @Get('manage')
  @UseGuards(PermissionsGuard)
  @RequirePermission('setting', 'V')
  listAll() {
    return this.media.listAll();
  }

  @Post()
  @UseGuards(PermissionsGuard)
  @RequirePermission('setting', 'C')
  create(@Body() dto: CreateMediaLinkDto, @CurrentUser() user: AuthUser) {
    return this.media.create(dto, user);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermission('setting', 'C')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMediaLinkDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.media.update(id, dto, user);
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermission('setting', 'C')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.media.remove(id, user);
  }
}
