import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';

// Hand Library (SRS §3.2) — โปรไฟล์มือสำหรับงาน product interaction
export class CreateHandProfileDto {
  @IsString()
  name!: string;

  @IsString()
  category!: string; // adult_female | adult_male | child | elderly | teen | professional | ...

  @IsOptional() @IsString() gender?: string;
  @IsOptional() @IsString() ageGroup?: string;
  @IsOptional() @IsString() skinTone?: string;
  @IsOptional() @IsString() handSize?: string;
  @IsOptional() @IsString() fingerLength?: string;
  @IsOptional() @IsString() nailLength?: string;
  @IsOptional() @IsString() nailShape?: string;
  @IsOptional() @IsString() nailColor?: string;
  @IsOptional() @IsString() nailStyle?: string;

  @IsOptional() @IsArray() @IsString({ each: true }) accessories?: string[];
  @IsOptional() @IsString() sleeveStyle?: string;
  @IsOptional() @IsString() skinTexture?: string;
  @IsOptional() @IsString() dominantHand?: string; // left | right

  @IsOptional() @IsArray() @IsString({ each: true }) allowedGestures?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) restrictedGestures?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) productCategorySuitability?: string[];

  // ── Child hand compliance (SRS §3.2.2) ──
  @IsOptional() @IsBoolean() isChild?: boolean;
  @IsOptional() @IsString() policyFlag?: string;
  @IsOptional() @IsBoolean() complianceReviewed?: boolean;

  @IsOptional() @IsIn(['draft', 'active', 'archived']) status?: string;
}

// PATCH — ทุก field optional (mirror UpdateLocationDto pattern) + name/category ก็แก้ได้
export class UpdateHandProfileDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() gender?: string;
  @IsOptional() @IsString() ageGroup?: string;
  @IsOptional() @IsString() skinTone?: string;
  @IsOptional() @IsString() handSize?: string;
  @IsOptional() @IsString() fingerLength?: string;
  @IsOptional() @IsString() nailLength?: string;
  @IsOptional() @IsString() nailShape?: string;
  @IsOptional() @IsString() nailColor?: string;
  @IsOptional() @IsString() nailStyle?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) accessories?: string[];
  @IsOptional() @IsString() sleeveStyle?: string;
  @IsOptional() @IsString() skinTexture?: string;
  @IsOptional() @IsString() dominantHand?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) allowedGestures?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) restrictedGestures?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) productCategorySuitability?: string[];
  @IsOptional() @IsBoolean() isChild?: boolean;
  @IsOptional() @IsString() policyFlag?: string;
  @IsOptional() @IsBoolean() complianceReviewed?: boolean;
  @IsOptional() @IsIn(['draft', 'active', 'archived']) status?: string;
}
