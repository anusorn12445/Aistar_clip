import { IsDateString, IsIn, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';

export const CAMPAIGN_OBJECTIVES = [
  'awareness',
  'engagement',
  'follower_growth',
  'product_click',
  'order',
  'gmv',
  'character_launch',
  'series_launch',
] as const;

export class CreateCampaignDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  clientBrand?: string;

  @IsOptional()
  @IsIn(CAMPAIGN_OBJECTIVES as unknown as string[])
  objective?: string;

  @IsOptional()
  @IsString()
  campaignType?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsObject()
  targetKpi?: Record<string, unknown>;

  @IsOptional()
  @IsUUID()
  ownerId?: string;
}
