import { IsObject, IsOptional, IsString } from 'class-validator';

export class CreatePromptVersionDto {
  @IsString()
  body!: string;

  @IsOptional()
  @IsString()
  negativeBody?: string;

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

  @IsOptional()
  @IsString()
  performanceNote?: string;
}
