import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

// Platforms ตาม PRD v0.1 §21
export const CONTENT_PLATFORMS = [
  'tiktok',
  'facebook_reels',
  'instagram_reels',
  'youtube_shorts',
  'tiktok_shop',
  'shopee_video',
  'lazada',
  'line_oa',
] as const;

export const CONTENT_FORMATS = ['short_video', 'live', 'image_post', 'article'] as const;
export const CONTENT_TYPES = ['drama', 'review', 'tie_in', 'vlog', 'meme'] as const;

export class CreateContentItemDto {
  @IsString()
  title!: string;

  @IsIn(CONTENT_PLATFORMS as unknown as string[])
  platform!: string;

  @IsOptional()
  @IsString()
  objective?: string;

  @IsOptional()
  @IsString()
  account?: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

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
  @IsArray()
  @IsUUID(undefined, { each: true })
  characterIds?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  productIds?: string[];
}
