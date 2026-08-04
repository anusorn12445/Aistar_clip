import { IsInt, IsObject, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

// บันทึกผลการ generate — chain: prompt_version → run → asset → qc_score (§F.2)
export class CreateGenerationRunDto {
  @IsString()
  platform!: string;

  @IsOptional()
  @IsString()
  modelVersion?: string;

  @IsOptional()
  @IsObject()
  paramsUsed?: Record<string, unknown>;

  @IsOptional()
  @IsUUID()
  assetId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  qcScore?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
