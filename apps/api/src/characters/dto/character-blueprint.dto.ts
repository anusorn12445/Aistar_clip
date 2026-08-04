import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

// Character Blueprint (พิมพ์เขียว) — "creation directive" ที่ CEO แก้ได้
// จัดการที่ Settings (setting permission) — คุมมาตรฐานการสร้างตัวละคร (AI Wizard + Reverse-capture)
export class CreateCharacterBlueprintDto {
  @IsString()
  @Length(1, 80)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;

  @IsOptional()
  @IsString()
  @Length(0, 16)
  icon?: string; // emoji

  @IsOptional()
  @IsString()
  @Length(0, 4000)
  houseRules?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredFields?: string[];

  // ค่าแนะนำที่ฉีดให้ AI ยึด — { ethnicity, art_style, aspect_ratio, ... }
  @IsOptional()
  @IsObject()
  defaults?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateCharacterBlueprintDto {
  @IsOptional()
  @IsString()
  @Length(1, 80)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;

  @IsOptional()
  @IsString()
  @Length(0, 16)
  icon?: string;

  @IsOptional()
  @IsString()
  @Length(0, 4000)
  houseRules?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredFields?: string[];

  @IsOptional()
  @IsObject()
  defaults?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsIn(['active', 'archived'])
  status?: string;
}

export class ReorderCharacterBlueprintsDto {
  @IsArray()
  @IsString({ each: true })
  ids!: string[];
}
