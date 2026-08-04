import { IsArray, IsOptional, IsString, IsUUID } from 'class-validator';

// Voice Profile ตาม PRD §15 — ผูกกับ character
export class CreateVoiceDto {
  @IsUUID()
  characterId!: string;

  @IsOptional()
  @IsString()
  voiceType?: string;

  @IsOptional()
  @IsString()
  tone?: string;

  @IsOptional()
  @IsString()
  accent?: string;

  @IsOptional()
  @IsString()
  speakingSpeed?: string;

  @IsOptional()
  @IsString()
  laughStyle?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  emotionalRange?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sampleDialogues?: string[];

  @IsOptional()
  @IsString()
  aiVoiceModel?: string;

  @IsOptional()
  @IsString()
  humanVoiceActor?: string;

  @IsOptional()
  @IsString()
  usageRights?: string;
}
