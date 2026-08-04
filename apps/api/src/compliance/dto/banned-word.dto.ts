import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

// Banned Words Compliance — คลังคำต้องห้าม (TikTok/YouTube/Facebook แบน/ลดการมองเห็น)
export const BANNED_WORD_PLATFORMS = ['tiktok', 'youtube', 'facebook'] as const;
export const BANNED_WORD_SEVERITIES = ['ban', 'risky'] as const;

export class CreateBannedWordDto {
  @IsString()
  @Length(1, 120)
  term!: string;

  @IsOptional()
  @IsArray()
  @IsIn(BANNED_WORD_PLATFORMS, { each: true })
  platforms?: string[]; // ว่าง = ทุกแพลตฟอร์ม

  @IsOptional()
  @IsIn(BANNED_WORD_SEVERITIES)
  severity?: string;

  @IsOptional()
  @IsString()
  @Length(0, 60)
  category?: string;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  replacement?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  note?: string;
}

export class UpdateBannedWordDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  term?: string; // builtin: immutable (เช็คใน service)

  @IsOptional()
  @IsArray()
  @IsIn(BANNED_WORD_PLATFORMS, { each: true })
  platforms?: string[];

  @IsOptional()
  @IsIn(BANNED_WORD_SEVERITIES)
  severity?: string;

  @IsOptional()
  @IsString()
  @Length(0, 60)
  category?: string;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  replacement?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  note?: string;

  @IsOptional()
  @IsIn(['active', 'archived'])
  status?: string;
}

export class ListBannedWordsQuery {
  @IsOptional() @IsIn(BANNED_WORD_PLATFORMS) platform?: string;
  @IsOptional() @IsIn(BANNED_WORD_SEVERITIES) severity?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsIn(['active', 'archived']) status?: string;
  @IsOptional() @IsString() q?: string;
}

export class ScanTextItemDto {
  @IsString()
  @Length(1, 60)
  key!: string; // client ใช้ map ผลกลับไปที่ช่องข้อความ

  @IsString()
  text!: string;
}

export class ScanBannedWordsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScanTextItemDto)
  texts!: ScanTextItemDto[];

  @IsOptional()
  @IsString()
  platform?: string; // รับค่า platform ของ clip job ตรง ๆ (normalize ใน service)
}

export class AiReviewBannedWordsDto {
  @IsString()
  @Length(1, 20000)
  text!: string;

  @IsOptional()
  @IsString()
  platform?: string;
}
