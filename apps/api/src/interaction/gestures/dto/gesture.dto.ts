import {
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

// Gesture Library (SRS §3.3) — คลังท่าทางมือกับสินค้า
export class CreateGestureDto {
  @IsString()
  name!: string;

  @IsOptional() @IsString() key?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() description?: string;

  @IsOptional() @IsNumber() @Min(0) naturalDurationSec?: number;
  @IsOptional() @IsNumber() @Min(0) minDurationSec?: number;
  @IsOptional() @IsNumber() @Min(0) maxDurationSec?: number;
  @IsOptional() @IsNumber() @Min(0) minSpeedMultiplier?: number;
  @IsOptional() @IsNumber() @Min(0) maxSpeedMultiplier?: number;

  @IsOptional() @IsInt() @Min(1) requiredHandCount?: number;
  @IsOptional() @IsString() requiredProductState?: string; // ProductState.key
  @IsOptional() @IsString() resultingProductState?: string; // ProductState.key

  @IsOptional() @IsArray() @IsString({ each: true }) compatiblePackaging?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) compatibleMaterial?: string[];

  @IsOptional() @IsIn(['low', 'medium', 'high']) riskLevel?: string;
  @IsOptional() @IsString() promptTemplate?: string;
  @IsOptional() @IsString() negativePrompt?: string;
  @IsOptional() @IsIn(['active', 'archived']) status?: string;
}

export class UpdateGestureDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() key?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsNumber() @Min(0) naturalDurationSec?: number;
  @IsOptional() @IsNumber() @Min(0) minDurationSec?: number;
  @IsOptional() @IsNumber() @Min(0) maxDurationSec?: number;
  @IsOptional() @IsNumber() @Min(0) minSpeedMultiplier?: number;
  @IsOptional() @IsNumber() @Min(0) maxSpeedMultiplier?: number;
  @IsOptional() @IsInt() @Min(1) requiredHandCount?: number;
  @IsOptional() @IsString() requiredProductState?: string;
  @IsOptional() @IsString() resultingProductState?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) compatiblePackaging?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) compatibleMaterial?: string[];
  @IsOptional() @IsIn(['low', 'medium', 'high']) riskLevel?: string;
  @IsOptional() @IsString() promptTemplate?: string;
  @IsOptional() @IsString() negativePrompt?: string;
  @IsOptional() @IsIn(['active', 'archived']) status?: string;
}
