import { PartialType } from '@nestjs/mapped-types';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export const COMPETITOR_TYPES = ['brand', 'creator', 'studio', 'shop'] as const;
export const THREAT_LEVELS = ['low', 'medium', 'high'] as const;
export const WATCH_STATUSES = ['active', 'paused'] as const;

export class CreateCompetitorDto {
  @IsString()
  @IsNotEmpty({ message: 'ต้องระบุชื่อคู่แข่ง' })
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsIn(COMPETITOR_TYPES as unknown as string[], { message: 'type ไม่ถูกต้อง' })
  type?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  category?: string[];

  @IsOptional()
  @IsString()
  positioning?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  audience?: string[];

  @IsOptional()
  @IsString()
  strength?: string;

  @IsOptional()
  @IsString()
  weakness?: string;

  @IsOptional()
  @IsIn(THREAT_LEVELS as unknown as string[], { message: 'threatLevel ไม่ถูกต้อง' })
  threatLevel?: string;

  @IsOptional()
  @IsIn(WATCH_STATUSES as unknown as string[], { message: 'watchStatus ไม่ถูกต้อง' })
  watchStatus?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateCompetitorDto extends PartialType(CreateCompetitorDto) {}

export class CreateChannelDto {
  @IsString()
  @IsNotEmpty({ message: 'ต้องระบุ platform' })
  @MaxLength(50)
  platform!: string;

  @IsString()
  @IsNotEmpty({ message: 'ต้องระบุ handle' })
  @MaxLength(200)
  handle!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  url?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  followers?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateChannelDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  platform?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  handle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  url?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  followers?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

// §18.5: เก็บ link + observation เท่านั้น (ไม่มี scraping)
export class CreateContentDto {
  @IsString()
  @IsNotEmpty({ message: 'ต้องระบุ URL' })
  @MaxLength(2000)
  url!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  platform?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  contentType?: string;

  @IsOptional()
  @IsString()
  hook?: string;

  @IsOptional()
  @IsString()
  metricsNote?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

// §18.4: บังคับแยก Fact / Assumption / Recommendation — fact เท่านั้นที่บังคับ
export class CreateInsightDto {
  @IsString()
  @IsNotEmpty({ message: 'ต้องระบุ Fact (ข้อเท็จจริงที่สังเกตได้) — ตามกฎ §18.4 ต้องแยก Fact ออกจาก Assumption/Recommendation' })
  fact!: string;

  @IsOptional()
  @IsString()
  assumption?: string;

  @IsOptional()
  @IsString()
  recommendation?: string;
}

export class ConvertInsightDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  name?: string;
}
