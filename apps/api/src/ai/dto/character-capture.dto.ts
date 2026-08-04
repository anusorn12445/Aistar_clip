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

// media type ที่ Claude vision รองรับ (และเราอนุญาตให้ paste เข้ามา)
export const CAPTURE_IMAGE_MEDIA_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const;

export type CaptureImageMediaType = (typeof CAPTURE_IMAGE_MEDIA_TYPES)[number];

// รูปแบบ base64 ตรง ๆ (ทางเลือกสำรอง — ปกติ client upload ผ่าน /assets ก่อนแล้วส่ง imageAssetIds)
export class CharacterCaptureImageDto {
  @IsIn(CAPTURE_IMAGE_MEDIA_TYPES)
  mediaType!: CaptureImageMediaType;

  @IsString()
  @IsNotEmpty()
  data!: string;
}

// POST /ai/characters/capture — ต้องมี text หรือรูปอย่างน้อยหนึ่งอย่าง (เช็คใน service)
export class CharacterCaptureDto {
  // สรุปตัวละครที่ผู้ใช้ก๊อปกลับมาจาก AI ค่ายนอก (ChatGPT/Gemini/Grok)
  @IsOptional()
  @IsString()
  text?: string;

  // รูปที่ upload ผ่าน /assets แล้ว (ทางหลัก) — ตัวแรก = ปก/primary_reference
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
  @Type(() => CharacterCaptureImageDto)
  imageBase64?: CharacterCaptureImageDto[];

  // ไอเดียตั้งต้น (seed) จาก step 1 — ช่วยให้ AI ตีความบริบทได้ตรงขึ้น
  @IsOptional()
  @IsString()
  seed?: string;

  // Blueprint (พิมพ์เขียว) ที่เลือกในหน้าสร้าง — inject house-rules/defaults/required เข้า system prompt
  @IsOptional()
  @IsUUID()
  blueprintId?: string;
}
