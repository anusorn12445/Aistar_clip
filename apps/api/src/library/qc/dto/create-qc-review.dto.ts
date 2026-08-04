import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export const QC_ENTITY_TYPES = [
  'character',
  'asset',
  'prompt',
  'episode',
  'shot',
  'content',
] as const;

// QC categories ตาม PRD §10
export const QC_CATEGORIES = [
  'character_consistency',
  'visual_quality',
  'prompt_quality',
  'asset_readiness',
  'product_claim',
  'brand_safety',
  'rights',
  'originality',
  'publishing_readiness',
] as const;

export class CreateQcReviewDto {
  @IsIn(QC_ENTITY_TYPES)
  entityType!: string;

  @IsUUID()
  entityId!: string;

  @IsIn(QC_CATEGORIES)
  category!: string;

  // score 1–5 (5=ดีมาก ใช้ production ได้ ... 1=ใช้ไม่ได้)
  @IsInt()
  @Min(1)
  @Max(5)
  score!: number;

  @IsOptional()
  @IsString()
  comment?: string;
}
