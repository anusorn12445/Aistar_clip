import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

// ─── Brand Knowledge Base (Content Intelligence ระบบ 1) ──
// array knowledge fields: trim + ตัดค่าว่างทิ้ง (เก็บเฉพาะ string ที่มีเนื้อ)
const trimList = ({ value }: { value: unknown }): unknown => {
  if (!Array.isArray(value)) return value;
  return value
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
};

export class CreateBrandDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  contact?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateBrandDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  contact?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsIn(['active', 'archived'])
  status?: string;

  // ─── Brand Knowledge fields (additive) ──
  @IsOptional()
  @IsString()
  brandStory?: string;

  @IsOptional()
  @IsString()
  toneOfVoice?: string;

  @IsOptional()
  @IsString()
  usp?: string;

  @IsOptional()
  @IsString()
  visualIdentity?: string;

  @IsOptional()
  @IsString()
  competitorsNote?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @Transform(trimList)
  doList?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @Transform(trimList)
  dontList?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @Transform(trimList)
  keyMessages?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @Transform(trimList)
  restrictedClaims?: string[];

  // ─── Brand Book เต็มรูป (spec: _docs/brand_book_requirement.md) — additive ──
  // 1) แก่นแบรนด์ (Foundation)
  @IsOptional()
  @IsString()
  mission?: string;

  @IsOptional()
  @IsString()
  vision?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @Transform(trimList)
  coreValues?: string[];

  @IsOptional()
  @IsString()
  positioning?: string;

  @IsOptional()
  @IsString()
  personality?: string;

  @IsOptional()
  @IsString()
  tagline?: string;

  @IsOptional()
  @IsString()
  taglineFont?: string;

  // 2) ภาษาแบรนด์ (Verbal)
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @Transform(trimList)
  wordBankUse?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @Transform(trimList)
  wordBankAvoid?: string[];

  @IsOptional()
  @IsString()
  exampleOnBrand?: string;

  @IsOptional()
  @IsString()
  exampleOffBrand?: string;

  // object ของ string ต่อแพลตฟอร์ม {facebook, tiktok, ...} — เนื้อในตรวจลึกที่ service
  @IsOptional()
  @IsObject({ message: 'platformGuides ต้องเป็น object เช่น {"facebook": "แนวการเขียน..."}' })
  platformGuides?: Record<string, unknown>;

  // 3) อัตลักษณ์ภาพ (Visual — โครงจาก SRS §2)
  @IsOptional()
  @IsString()
  nameUsage?: string;

  @IsOptional()
  @IsString()
  logoUsageNote?: string;

  @IsOptional()
  @IsString()
  moodNote?: string;

  // [{token, dark?, light?, usage?}] — ตรวจ shape + #hex ลึกที่ service
  @IsOptional()
  @IsArray({ message: 'brandColors ต้องเป็น array ของ {token, dark, light, usage}' })
  @ArrayMaxSize(50)
  brandColors?: unknown[];

  // [{role: heading|body|display|other, family, note?}] — ตรวจ shape ลึกที่ service
  @IsOptional()
  @IsArray({ message: 'brandFonts ต้องเป็น array ของ {role, family, note}' })
  @ArrayMaxSize(20)
  brandFonts?: unknown[];

  // 4) การกำกับ (Governance) — bookVersion เป็น field ที่ user จัดการเอง
  @IsOptional()
  @IsString()
  bookVersion?: string;

  @IsOptional()
  @IsString()
  bookApproverName?: string;

  @IsOptional()
  @IsString()
  bookApproverContact?: string;
}
