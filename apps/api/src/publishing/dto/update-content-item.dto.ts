import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { CONTENT_FORMATS, CONTENT_PLATFORMS, CONTENT_TYPES } from './create-content-item.dto';

export class UpdateContentItemDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsIn(CONTENT_PLATFORMS as unknown as string[])
  platform?: string;

  @IsOptional()
  @IsString()
  objective?: string;

  @IsOptional()
  @IsString()
  account?: string;

  // ส่ง null เพื่อลบกำหนดโพสต์ — validate เองใน service
  @IsOptional()
  @IsDateString()
  scheduledAt?: string | null;

  @IsOptional()
  @IsIn(CONTENT_FORMATS as unknown as string[])
  contentFormat?: string;

  @IsOptional()
  @IsIn(CONTENT_TYPES as unknown as string[])
  contentType?: string;

  @IsOptional()
  @IsUUID()
  episodeId?: string;

  @IsOptional()
  @IsUUID()
  campaignId?: string;

  @IsOptional()
  @IsString()
  caption?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(30)
  hashtags?: string[];

  @IsOptional()
  @IsString()
  cta?: string;

  @IsOptional()
  @IsString()
  postUrl?: string;

  @IsOptional()
  @IsUUID()
  ownerId?: string;

  // optimistic locking (§F.1 ข้อ 6)
  @IsOptional()
  @IsDateString()
  expectedUpdatedAt?: string;
}
