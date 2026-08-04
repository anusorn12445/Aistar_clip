import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export const SERIES_STATUSES = ['active', 'hiatus', 'completed'] as const;
export const SERIES_CAST_ROLES = ['main', 'supporting', 'recurring_guest'] as const;
export const SEASON_STATUSES = ['planning', 'active', 'completed'] as const;
export const BROADCAST_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

// slot ตารางออกอากาศ เช่น {day:'tue', time:'19:00', platform:'tiktok'}
export class BroadcastSlotDto {
  @IsIn([...BROADCAST_DAYS], { message: 'day ต้องเป็น mon..sun' })
  day!: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'time ต้องเป็นรูปแบบ HH:MM (24 ชม.)' })
  time!: string;

  @IsString()
  platform!: string;
}

export class CreateSeriesDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  universe?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  premise?: string;

  @IsOptional()
  @IsIn([...SERIES_STATUSES], { message: 'status ต้องเป็น active | hiatus | completed' })
  status?: string;
}

export class UpdateSeriesDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  universe?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  premise?: string;

  @IsOptional()
  @IsIn([...SERIES_STATUSES], { message: 'status ต้องเป็น active | hiatus | completed' })
  status?: string;

  // Series Bible — โครงสร้าง Json อิสระ (world_rules[], timeline[], relationships[], last_cliffhanger, notes)
  @IsOptional()
  @IsObject({ message: 'bible ต้องเป็น object' })
  bible?: Record<string, unknown>;

  @IsOptional()
  @IsArray({ message: 'broadcastSchedule ต้องเป็น array ของ slot' })
  @ValidateNested({ each: true })
  @Type(() => BroadcastSlotDto)
  broadcastSchedule?: BroadcastSlotDto[];

  @IsOptional()
  @IsUUID()
  coverAssetId?: string;

  // เป้ายอดวิว (คนดูเป้าหมาย) — จำนวนวิว + หน่วย (ต่อ EP / รวมทั้งซีรีส์)
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  targetViews?: number;

  @IsOptional()
  @IsIn(['per_episode', 'series_total'], {
    message: 'targetViewsUnit ต้องเป็น per_episode | series_total',
  })
  targetViewsUnit?: string;
}

export class SeriesCastDto {
  @IsUUID()
  characterId!: string;

  @IsOptional()
  @IsIn([...SERIES_CAST_ROLES], { message: 'role ต้องเป็น main | supporting | recurring_guest' })
  role?: string;
}

export class SeriesLocationDto {
  @IsUUID()
  locationId!: string;
}

export class CreateSeasonDto {
  @IsString()
  label!: string;

  @IsOptional()
  @IsString()
  arc?: string;
}

export class UpdateSeasonDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  arc?: string;

  @IsOptional()
  @IsIn([...SEASON_STATUSES], { message: 'status ต้องเป็น planning | active | completed' })
  status?: string;
}

export class SeasonProductDto {
  @IsUUID()
  productId!: string;
}

// สร้างตอนถัดไปจากหน้า Series Hub — episodeNumber คำนวณอัตโนมัติจาก max ใน season
export class CreateSeriesEpisodeDto {
  @IsString()
  title!: string;

  @IsString()
  season!: string;

  @IsOptional()
  @IsString()
  logline?: string;

  @IsOptional()
  @IsString()
  hook?: string;

  @IsOptional()
  @IsString()
  twist?: string;

  @IsOptional()
  @IsString()
  cta?: string;

  @IsOptional()
  @IsString()
  script?: string;
}

export class CalendarSuggestDto {
  @IsString()
  season!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8)
  weeks?: number;

  @IsOptional()
  @IsDateString({}, { message: 'startDate ต้องเป็นวันที่รูปแบบ YYYY-MM-DD' })
  startDate?: string;
}
