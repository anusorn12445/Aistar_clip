import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export const IDEATION_MODES = ['auto', 'guided', 'iterate'] as const;
export const CONVERT_TARGETS = ['idea', 'content'] as const;

// POST /ai/ideate — คิดไอเดียคอนเทนต์ (auto / guided / iterate)
export class IdeateDto {
  @IsIn(IDEATION_MODES)
  mode!: (typeof IDEATION_MODES)[number];

  @IsOptional()
  @IsUUID()
  brandId?: string;

  // guided: ไอเดียดิบ/โจทย์ที่คนโยนเข้า
  @IsOptional()
  @IsString()
  seedText?: string;

  // guided: ดึงจาก Idea Library มาต่อยอด
  @IsOptional()
  @IsUUID()
  seedIdeaId?: string;

  // เลือก AudienceSegment เพิ่มเติม (นอกจากที่ผูกกับแบรนด์)
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  audienceSegmentIds?: string[];

  @IsOptional()
  @IsString()
  platformHint?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  count?: number;

  // iterate: รอบก่อนหน้าที่จะปรับต่อ
  @IsOptional()
  @IsUUID()
  priorRunId?: string;

  // iterate: คอมเมนต์/ทิศทางที่อยากปรับ
  @IsOptional()
  @IsString()
  comment?: string;

  // ดึงเทรนด์คอนเทนต์ภายนอกล่าสุดผ่าน Claude web search (step 1) ก่อนคิดไอเดีย
  // default OFF — มีค่าใช้จ่าย web search เพิ่ม; step 1 พังก็คิดไอเดียต่อได้ (ไม่ fail ทั้ง call)
  @IsOptional()
  @IsBoolean()
  useWebTrends?: boolean;
}

// POST /ideation-runs/:id/convert — แปลงไอเดีย 1 อัน → Idea Library หรือ ContentItem
export class ConvertIdeaDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  ideaIndex!: number;

  @IsIn(CONVERT_TARGETS)
  target!: (typeof CONVERT_TARGETS)[number];
}

// GET /ideation-runs — filter history
export class ListRunsQuery {
  @IsOptional()
  @IsIn(IDEATION_MODES)
  mode?: (typeof IDEATION_MODES)[number];

  @IsOptional()
  @IsUUID()
  brandId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
