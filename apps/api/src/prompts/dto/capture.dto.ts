import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  ValidateNested,
} from 'class-validator';
import { PROMPT_TYPES } from './create-prompt.dto';

// media type ที่ Claude vision รองรับ (และเราอนุญาตให้ paste เข้ามา)
export const CAPTURE_IMAGE_MEDIA_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const;

// รูปแบบ base64 ตรง ๆ (ทางเลือกสำรอง — ปกติ client upload ผ่าน /assets ก่อนแล้วส่ง assetId)
export class CaptureImageBase64Dto {
  @IsIn(CAPTURE_IMAGE_MEDIA_TYPES)
  mediaType!: (typeof CAPTURE_IMAGE_MEDIA_TYPES)[number];

  @IsString()
  @IsNotEmpty()
  data!: string;
}

// POST /prompts/capture/extract — ต้องมี text หรือรูปอย่างน้อยหนึ่งอย่าง (เช็คใน service)
export class CaptureExtractDto {
  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsUUID()
  imageAssetId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CaptureImageBase64Dto)
  imageBase64?: CaptureImageBase64Dto;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  sourceUrl?: string;
}

// POST /prompts/capture/fetch-url — validate ละเอียด (https + SSRF guard) ใน service
export class CaptureFetchUrlDto {
  @IsString()
  @IsNotEmpty()
  url!: string;
}

// POST /prompts/capture — persist หลัง user รีวิวฟอร์มแล้ว
export class CaptureCreateDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsIn(PROMPT_TYPES)
  promptType!: string;

  @IsString()
  @IsNotEmpty()
  body!: string;

  @IsOptional()
  @IsString()
  negativeBody?: string;

  @IsOptional()
  @IsString()
  targetPlatform?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  sourceUrl?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  exampleAssetIds?: string[];
}
