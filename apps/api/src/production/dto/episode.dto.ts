import { PartialType } from '@nestjs/mapped-types';
import { EpisodeStatus } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateEpisodeDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsUUID()
  seriesId?: string;

  @IsOptional()
  @IsUUID()
  campaignId?: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsString()
  season?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  episodeNumber?: number;

  @IsOptional()
  @IsString()
  logline?: string;

  @IsOptional()
  @IsString()
  script?: string;

  @IsOptional()
  @IsString()
  hook?: string;

  @IsOptional()
  @IsString()
  conflict?: string;

  @IsOptional()
  @IsString()
  twist?: string;

  @IsOptional()
  @IsString()
  cta?: string;
}

export class UpdateEpisodeDto extends PartialType(CreateEpisodeDto) {
  // ผู้รับผิดชอบอีพี (ใช้กับ row-level viewScope 'own') — ส่ง null เพื่อเอาเจ้าของออก
  @ValidateIf((o) => o.ownerId !== null)
  @IsOptional()
  @IsUUID()
  ownerId?: string | null;

  // optimistic locking (§F.1 ข้อ 6)
  @IsOptional()
  @IsDateString()
  expectedUpdatedAt?: string;
}

export class ChangeEpisodeStatusDto {
  @IsEnum(EpisodeStatus)
  status!: EpisodeStatus;
}

export class LinkCharacterDto {
  @IsUUID()
  characterId!: string;
}

export class LinkProductDto {
  @IsUUID()
  productId!: string;
}

export class HandoffDto {
  @IsOptional()
  @IsUUID()
  operatorId?: string;

  @IsOptional()
  @IsUUID()
  editorId?: string;
}
