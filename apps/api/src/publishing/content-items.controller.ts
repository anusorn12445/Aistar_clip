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
import { ContentStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, ValidateIf } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { ContentItemsService } from './content-items.service';
import { CreateContentItemDto } from './dto/create-content-item.dto';
import { UpdateContentItemDto } from './dto/update-content-item.dto';

class ChangeContentStatusDto {
  @IsEnum(ContentStatus)
  status!: ContentStatus;

  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  postUrl?: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}

class BlockContentDto {
  // ส่ง null/ค่าว่าง = ล้าง blockedReason
  @ValidateIf((o) => o.reason !== null)
  @IsOptional()
  @IsString()
  reason?: string | null;
}

class LinkCharacterDto {
  @IsUUID()
  characterId!: string;
}

class LinkProductDto {
  @IsUUID()
  productId!: string;
}

@Controller('content-items')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ContentItemsController {
  constructor(private contentItems: ContentItemsService) {}

  @Get()
  @RequirePermission('content', 'V')
  list(
    @CurrentUser() user: AuthUser,
    @Query('q') q?: string,
    @Query('platform') platform?: string,
    @Query('status') status?: ContentStatus,
    @Query('characterId') characterId?: string,
    @Query('productId') productId?: string,
    @Query('campaignId') campaignId?: string,
    @Query('episodeId') episodeId?: string,
    @Query('scheduledFrom') scheduledFrom?: string,
    @Query('scheduledTo') scheduledTo?: string,
    @Query('ownerId') ownerId?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.contentItems.list({
      q,
      platform,
      status,
      characterId,
      productId,
      campaignId,
      episodeId,
      scheduledFrom,
      scheduledTo,
      ownerId,
      sortBy,
      sortDir,
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    }, user);
  }

  // ต้องอยู่ก่อน :id — ไม่งั้น 'calendar' โดน ParseUUIDPipe
  @Get('calendar')
  @RequirePermission('content', 'V')
  calendar(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('platform') platform?: string,
    @Query('characterId') characterId?: string,
    @Query('status') status?: ContentStatus,
  ) {
    return this.contentItems.calendar({ from, to, platform, characterId, status }, user);
  }

  @Get(':id')
  @RequirePermission('content', 'V')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.contentItems.get(id, user);
  }

  @Post()
  @RequirePermission('content', 'C')
  create(@Body() dto: CreateContentItemDto, @CurrentUser() user: AuthUser) {
    return this.contentItems.create(dto, user);
  }

  @Patch(':id')
  @RequirePermission('content', 'C')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContentItemDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.contentItems.update(id, dto, user);
  }

  // สิทธิ์ต่อ transition (C/A/P) เช็คละเอียดใน service ตามตาราง §D.1
  @Patch(':id/status')
  @RequirePermission('content', 'V')
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeContentStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.contentItems.changeStatus(id, dto, user);
  }

  @Patch(':id/block')
  @RequirePermission('content', 'C')
  block(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BlockContentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.contentItems.setBlockedReason(id, dto.reason ?? null, user);
  }

  @Post(':id/characters')
  @RequirePermission('content', 'C')
  addCharacter(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LinkCharacterDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.contentItems.addCharacter(id, dto.characterId, user);
  }

  @Delete(':id/characters/:characterId')
  @RequirePermission('content', 'C')
  removeCharacter(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('characterId', ParseUUIDPipe) characterId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.contentItems.removeCharacter(id, characterId, user);
  }

  @Post(':id/products')
  @RequirePermission('content', 'C')
  addProduct(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LinkProductDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.contentItems.addProduct(id, dto.productId, user);
  }

  @Delete(':id/products/:productId')
  @RequirePermission('content', 'C')
  removeProduct(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.contentItems.removeProduct(id, productId, user);
  }
}
