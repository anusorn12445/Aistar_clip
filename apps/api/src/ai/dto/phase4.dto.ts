import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';

// POST /ai/episodes/:id/shot-list
export class GenerateShotListDto {
  // true = insert Shot rows (status planned) ทันที — refuse ถ้า episode มี shot อยู่แล้ว
  @IsOptional()
  @IsBoolean()
  create?: boolean;

  @IsOptional()
  @IsInt()
  @Min(3)
  @Max(30)
  maxShots?: number;
}

// POST /ai/content/caption
export class GenerateCaptionDto {
  @IsString()
  title!: string;

  @IsString()
  platform!: string;

  @IsOptional()
  @IsUUID()
  characterId?: string;

  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsUUID()
  episodeId?: string;

  @IsOptional()
  @IsString()
  tone?: string;
}

// POST /ai/qc/assets/:assetId/consistency
export class AssetConsistencyDto {
  @IsUUID()
  characterId!: string;

  // true = บันทึกผลเป็น QcReview (category character_consistency) ด้วย
  @IsOptional()
  @IsBoolean()
  save?: boolean;
}

// POST /ai/weekly-plan
export class WeeklyPlanDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'weekStart ต้องอยู่ในรูปแบบ YYYY-MM-DD' })
  weekStart!: string;
}
