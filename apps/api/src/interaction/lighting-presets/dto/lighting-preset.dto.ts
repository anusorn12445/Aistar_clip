import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';

// Lighting Library (SRS §3.7) — คลังแสง reference สำหรับประกอบ prompt (human-curated, ไม่มี AI)
export class CreateLightingPresetDto {
  @IsString()
  name!: string;

  @IsOptional() @IsString() key?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() keyLight?: string;
  @IsOptional() @IsString() fillLight?: string;
  @IsOptional() @IsString() backLight?: string;
  @IsOptional() @IsString() colorTemperature?: string;
  @IsOptional() @IsString() contrast?: string;
  @IsOptional() @IsString() shadowLevel?: string;
  @IsOptional() @IsString() highlightControl?: string;
  @IsOptional() @IsString() reflectiveProductRule?: string;
  @IsOptional() @IsString() transparentProductRule?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) skinToneCompatibility?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) backgroundCompatibility?: string[];
  @IsOptional() @IsString() mood?: string;
  @IsOptional() @IsString() promptTemplate?: string;
  @IsOptional() @IsString() negativePrompt?: string;
  @IsOptional() @IsIn(['active', 'archived']) status?: string;
}

export class UpdateLightingPresetDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() key?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() keyLight?: string;
  @IsOptional() @IsString() fillLight?: string;
  @IsOptional() @IsString() backLight?: string;
  @IsOptional() @IsString() colorTemperature?: string;
  @IsOptional() @IsString() contrast?: string;
  @IsOptional() @IsString() shadowLevel?: string;
  @IsOptional() @IsString() highlightControl?: string;
  @IsOptional() @IsString() reflectiveProductRule?: string;
  @IsOptional() @IsString() transparentProductRule?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) skinToneCompatibility?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) backgroundCompatibility?: string[];
  @IsOptional() @IsString() mood?: string;
  @IsOptional() @IsString() promptTemplate?: string;
  @IsOptional() @IsString() negativePrompt?: string;
  @IsOptional() @IsIn(['active', 'archived']) status?: string;
}
