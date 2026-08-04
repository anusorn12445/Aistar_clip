import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import {
  LIBRARY_CAPTURE_TARGETS,
  LibraryCaptureTarget,
} from '../library-capture.schemas';

// media type ที่ Claude vision รองรับ (ชุดเดียวกับ character/prompt capture)
export const CAPTURE_IMAGE_MEDIA_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const;

export type CaptureImageMediaType = (typeof CAPTURE_IMAGE_MEDIA_TYPES)[number];

// รูปแบบ base64 ตรง ๆ (ทางเลือกสำรอง — ปกติ client upload ผ่าน /assets ก่อนแล้วส่ง imageAssetIds)
export class LibraryCaptureImageDto {
  @IsIn(CAPTURE_IMAGE_MEDIA_TYPES)
  mediaType!: CaptureImageMediaType;

  @IsString()
  @IsNotEmpty()
  data!: string;
}

// POST /library-capture/extract — ต้องมี text หรือรูปอย่างน้อยหนึ่งอย่าง (เช็คใน service)
export class LibraryCaptureExtractDto {
  // คลังปลายทางที่จะแตกข้อมูลเข้า — unknown ค่าอื่น → 400 จาก validation
  @IsIn(LIBRARY_CAPTURE_TARGETS)
  targetType!: LibraryCaptureTarget;

  // ข้อความ/สรุปที่ผู้ใช้ก๊อปกลับมาจาก AI ค่ายนอก (ChatGPT/Gemini/Grok)
  @IsOptional()
  @IsString()
  text?: string;

  // รูปที่ upload ผ่าน /assets แล้ว (ทางหลัก)
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsUUID('all', { each: true })
  imageAssetIds?: string[];

  // base64 ตรง ๆ (สำรอง)
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => LibraryCaptureImageDto)
  imageBase64?: LibraryCaptureImageDto[];
}
