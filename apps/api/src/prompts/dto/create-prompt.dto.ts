import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';

// prompt_type ตาม addendum §F.2
export const PROMPT_TYPES = [
  'identity',
  'character_sheet',
  'expression',
  'outfit',
  'scene',
  'shot',
  'negative',
  'anti_clone',
] as const;

export class CreatePromptDto {
  @IsString()
  name!: string;

  @IsIn(PROMPT_TYPES)
  promptType!: string;

  @IsString()
  body!: string;

  @IsOptional()
  @IsString()
  negativeBody?: string;

  // string เปิด ไม่ใช่ enum ปิด (D4) — platform ใหม่มาก็ใช้ได้เลย
  @IsString()
  targetPlatform!: string;

  @IsOptional()
  @IsString()
  modelName?: string;

  @IsOptional()
  @IsString()
  modelVersion?: string;

  @IsOptional()
  @IsObject()
  generationParams?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  seed?: string;
}
