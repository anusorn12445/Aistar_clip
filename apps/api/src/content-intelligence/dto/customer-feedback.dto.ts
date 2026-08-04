import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export const FEEDBACK_SOURCES = ['comment', 'chat', 'sales_note'] as const;
export const SENTIMENTS = ['positive', 'negative', 'neutral'] as const;

// POST /customer-feedback — บันทึก feedback 1 ก้อน (AI จัด sentiment+theme ตอน save)
export class CreateFeedbackDto {
  @IsString()
  @MinLength(1)
  text!: string;

  @IsIn(FEEDBACK_SOURCES)
  source!: (typeof FEEDBACK_SOURCES)[number];

  // ดาวรีวิว marketplace (1-5) — เส้นทาง "คนคัดเองจาก extension" ใส่ตรงได้เลย ไม่ต้องผ่าน AI คัด
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @IsString()
  sourceRef?: string;

  @IsOptional()
  @IsUUID()
  brandId?: string;

  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsUUID()
  characterId?: string;

  @IsOptional()
  @IsUUID()
  contentItemId?: string;
}

// POST /customer-feedback/bulk — วางหลายบรรทัด (text) หรือ array (texts), source/links ร่วมกัน
export class BulkFeedbackDto {
  // วางข้อความหลายบรรทัด — 1 บรรทัด = 1 feedback
  @IsOptional()
  @IsString()
  text?: string;

  // หรือส่งเป็น array มาตรง ๆ
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  texts?: string[];

  @IsIn(FEEDBACK_SOURCES)
  source!: (typeof FEEDBACK_SOURCES)[number];

  @IsOptional()
  @IsString()
  sourceRef?: string;

  @IsOptional()
  @IsUUID()
  brandId?: string;

  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsUUID()
  characterId?: string;

  @IsOptional()
  @IsUUID()
  contentItemId?: string;
}

// POST /customer-feedback/extract-reviews — วางก้อนรีวิว Shopee ทั้งหน้า → AI แยกรายรีวิว
// อ่านดาว เก็บเฉพาะ 4-5 ดาว (หรือไม่รู้ดาวแต่ positive ชัด) เข้าคลังผูกกับสินค้า
export class ExtractReviewsDto {
  @IsUUID()
  productId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  text!: string;
}

// PATCH /customer-feedback/:id — แก้ข้อความ/แหล่ง หรือ override sentiment/themes ที่ AI จัด
export class UpdateFeedbackDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  text?: string;

  @IsOptional()
  @IsIn(FEEDBACK_SOURCES)
  source?: (typeof FEEDBACK_SOURCES)[number];

  @IsOptional()
  @IsIn(SENTIMENTS)
  sentiment?: (typeof SENTIMENTS)[number];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  themes?: string[];

  @IsOptional()
  @IsString()
  sourceRef?: string;

  @IsOptional()
  @IsUUID()
  brandId?: string;

  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsUUID()
  characterId?: string;

  @IsOptional()
  @IsUUID()
  contentItemId?: string;
}

// GET /customer-feedback — filter + paginate
export class ListFeedbackQuery {
  @IsOptional()
  @IsIn(FEEDBACK_SOURCES)
  source?: (typeof FEEDBACK_SOURCES)[number];

  @IsOptional()
  @IsIn(SENTIMENTS)
  sentiment?: (typeof SENTIMENTS)[number];

  @IsOptional()
  @IsUUID()
  brandId?: string;

  @IsOptional()
  @IsUUID()
  productId?: string;

  // กรองเรตติ้งขั้นต่ำ (เช่น 4 = เอาเฉพาะรีวิว 4-5 ดาว) — แถวที่ rating เป็น null จะไม่ติดมา
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  minRating?: number;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}

// GET /customer-feedback/insights — mini-dashboard
export class InsightsQuery {
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsUUID()
  brandId?: string;
}
