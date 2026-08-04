import { ShotStatus } from '@prisma/client';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

// camera types ตาม PRD v0.1 §13
export const CAMERA_TYPES = [
  'close_up',
  'medium',
  'wide',
  'over_shoulder',
  'pov',
  'product_close_up',
  'reaction',
  'establishing',
] as const;

export class CreateShotDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3600)
  durationSec?: number;

  @IsOptional()
  @IsIn(CAMERA_TYPES as unknown as string[])
  camera?: string;

  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsString()
  dialogue?: string;

  @IsOptional()
  @IsString()
  emotion?: string;

  @IsOptional()
  @IsString()
  outfit?: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  characterIds?: string[];
}

export class UpdateShotDto extends CreateShotDto {
  // Storyboard (Content Intelligence ระบบ 3) — คนแก้ prompt ภาพต่อช็อตเองได้
  @IsOptional()
  @IsString()
  imagePrompt?: string;
}

export class ChangeShotStatusDto {
  @IsEnum(ShotStatus)
  status!: ShotStatus;
}

export class ReorderShotsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID(undefined, { each: true })
  shotIds!: string[];
}
