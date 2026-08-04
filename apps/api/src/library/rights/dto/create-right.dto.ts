import { IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

export const RIGHT_ENTITY_TYPES = ['character', 'asset', 'voice', 'prompt', 'campaign'] as const;

// Rights / Legal ตาม PRD §16 — polymorphic ผูกได้หลาย entity
export class CreateRightDto {
  @IsIn(RIGHT_ENTITY_TYPES)
  entityType!: string;

  @IsUUID()
  entityId!: string;

  @IsString()
  owner!: string;

  @IsOptional()
  @IsBoolean()
  commercialUsage?: boolean;

  @IsOptional()
  @IsString()
  usageScope?: string;

  @IsOptional()
  @IsString()
  territory?: string;

  @IsOptional()
  @IsString()
  duration?: string;

  @IsOptional()
  @IsString()
  exclusivity?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  restrictedCategories?: string[];

  @IsOptional()
  @IsBoolean()
  disclosureRequired?: boolean;

  @IsOptional()
  @IsIn(['low', 'medium', 'high'])
  riskLevel?: string;
}
