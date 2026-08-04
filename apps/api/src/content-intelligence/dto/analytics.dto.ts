import { IsIn, IsInt, IsOptional, IsString, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

// scope ของ ContentInsight (ตรงกับ schema.prisma) — overall/platform/character/format/time
export const INSIGHT_SCOPES = ['overall', 'platform', 'character', 'format', 'time'] as const;
export type InsightScope = (typeof INSIGHT_SCOPES)[number];

// POST /content-insights/generate — วิเคราะห์คอนเทนต์ที่เคยทำ → insight
export class GenerateInsightDto {
  @IsIn(INSIGHT_SCOPES)
  scope!: InsightScope;

  // ค่าของ scope เช่น platform='tiktok', characterId, contentFormat='short_video'
  @IsOptional()
  @IsString()
  scopeRef?: string;

  // ช่วงวันที่ (ISO หรือ YYYY-MM-DD) — กรองตาม recordedAt ของ performance
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}

// GET /content-insights — filter ประวัติ insight
export class ListInsightsQuery {
  @IsOptional()
  @IsIn(INSIGHT_SCOPES)
  scope?: InsightScope;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
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
  @Max(100)
  pageSize?: number;
}
