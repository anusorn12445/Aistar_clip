import { IsIn, IsOptional, IsString } from 'class-validator';

// Location library ตาม PRD §14
export class CreateLocationDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  regionStyle?: string;

  @IsOptional()
  @IsString()
  mood?: string;

  @IsOptional()
  @IsString()
  lighting?: string;

  @IsOptional()
  @IsString()
  timeOfDay?: string;

  @IsOptional()
  @IsString()
  prompt?: string;

  @IsOptional()
  @IsString()
  negativePrompt?: string;

  @IsOptional()
  @IsString()
  continuityNotes?: string;

  @IsOptional()
  @IsIn(['active', 'archived'])
  status?: string;
}
