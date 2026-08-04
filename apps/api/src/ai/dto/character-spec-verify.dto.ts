import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsOptional, IsUUID, ValidateNested } from 'class-validator';
import { CharacterCaptureImageDto } from './character-capture.dto';

// POST /ai/character-spec-verify — ตรวจ "รูปที่ gen มาจากค่ายนอก" เทียบ visualDna ที่บันทึกไว้
// ต้องมีรูปอย่างน้อย 1 รูป (เช็คใน service) — reuse รูปแบบรูปเดียวกับ reverse-capture
export class CharacterSpecVerifyDto {
  @IsUUID()
  characterId!: string;

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
  @Type(() => CharacterCaptureImageDto)
  imageBase64?: CharacterCaptureImageDto[];
}
