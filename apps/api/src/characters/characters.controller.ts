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
import { ApprovalStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { CharactersService, CharacterSortBy } from './characters.service';
import { CreateCharacterDto } from './dto/create-character.dto';
import { UpdateCharacterDto } from './dto/update-character.dto';

class ChangeStatusDto {
  @IsEnum(ApprovalStatus)
  status!: ApprovalStatus;
}

// query params ทั้งหมด optional และผสมกันได้ — ของเดิม (q/status/page) ยังใช้ได้เหมือนเดิม
class ListCharactersQuery {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsEnum(ApprovalStatus)
  status?: ApprovalStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsString()
  universe?: string;

  @IsOptional()
  @IsString()
  seriesName?: string;

  @IsOptional()
  @IsString()
  gender?: string;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsString()
  roleLabel?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(200)
  ageMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(200)
  ageMax?: number;

  @IsOptional()
  @IsIn(['0', '1'])
  hasImage?: '0' | '1';

  @IsOptional()
  @IsIn(['0', '1'])
  bibleComplete?: '0' | '1';

  @IsOptional()
  @IsIn(['0', '1'])
  hasVoice?: '0' | '1';

  @IsOptional()
  @IsString()
  productCategory?: string;

  @IsOptional()
  @IsIn(['low', 'medium', 'high'])
  claimRisk?: 'low' | 'medium' | 'high';

  @IsOptional()
  @IsIn(['low', 'medium', 'high'])
  brandSafety?: 'low' | 'medium' | 'high';

  @IsOptional()
  @IsIn(['free', 'busy', 'unused'])
  availability?: 'free' | 'busy' | 'unused';

  // comma-separated tag id list — ตัวละครต้องมีครบทุก tag
  @IsOptional()
  @IsString()
  tagIds?: string;

  // ── Relationship-based filters (additive) ──
  // comma-separated category id list — มีประเภทอย่างน้อยหนึ่ง (ANY)
  @IsOptional()
  @IsString()
  categoryIds?: string;

  @IsOptional()
  @IsUUID()
  reviewedProductId?: string;

  @IsOptional()
  @IsUUID()
  seriesId?: string;

  @IsOptional()
  @IsUUID()
  brandId?: string;

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsUUID()
  campaignId?: string;

  @IsOptional()
  @IsUUID()
  tieInProductId?: string;

  @IsOptional()
  @IsUUID()
  audienceSegmentId?: string;

  @IsOptional()
  @IsIn(['0', '1'])
  hasLived?: '0' | '1';

  @IsOptional()
  @IsIn(['0', '1'])
  sortByGmv?: '0' | '1';

  @IsOptional()
  @IsIn(['updatedAt', 'createdAt', 'nameTh', 'gmv', 'views', 'usage'])
  sortBy?: CharacterSortBy;

  // archived=1 → ดูเฉพาะตัวที่เก็บแล้ว (default = ไม่รวม archived)
  @IsOptional()
  @IsIn(['0', '1'])
  archived?: '0' | '1';
}

class CreateVersionDto {
  @IsString()
  label!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

@Controller('characters')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CharactersController {
  constructor(private characters: CharactersService) {}

  @Get()
  @RequirePermission('character', 'V')
  list(@Query() query: ListCharactersQuery) {
    const { tagIds, categoryIds, ...rest } = query;
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    // กัน uuid เพี้ยน ๆ ไม่ให้หลุดไปถึง Prisma (จะกลายเป็น 500)
    const parseCsvUuids = (csv?: string) =>
      csv
        ? csv
            .split(',')
            .map((t) => t.trim())
            .filter((t) => uuidRe.test(t))
        : undefined;
    return this.characters.list({
      ...rest,
      tagIds: parseCsvUuids(tagIds),
      categoryIds: parseCsvUuids(categoryIds),
    });
  }

  // ต้องประกาศก่อน ':id' — ไม่งั้น 'stats' โดน ParseUUIDPipe ดักไว้
  @Get('stats')
  @RequirePermission('character', 'V')
  stats() {
    return this.characters.stats();
  }

  @Get(':id')
  @RequirePermission('character', 'V')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.characters.getWithTags(id);
  }

  @Get(':id/versions')
  @RequirePermission('character', 'V')
  versions(@Param('id', ParseUUIDPipe) id: string) {
    return this.characters.listVersions(id);
  }

  @Post()
  @RequirePermission('character', 'C')
  create(@Body() dto: CreateCharacterDto, @CurrentUser() user: AuthUser) {
    return this.characters.create(dto, user);
  }

  @Patch(':id')
  @RequirePermission('character', 'C')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCharacterDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.characters.update(id, dto, user);
  }

  @Patch(':id/status')
  @RequirePermission('character', 'V') // สิทธิ์ A เช็คละเอียดใน service ตาม state machine
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.characters.changeStatus(id, dto.status, user);
  }

  @Post(':id/versions')
  @RequirePermission('character', 'C')
  createVersion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateVersionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.characters.createVersion(id, dto.label, dto.notes, user);
  }
}
