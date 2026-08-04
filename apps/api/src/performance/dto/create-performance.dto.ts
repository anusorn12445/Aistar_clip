import { IsDateString, IsInt, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreatePerformanceDto {
  @IsOptional()
  @IsUUID()
  contentItemId?: string;

  @IsOptional()
  @IsUUID()
  liveSessionId?: string;

  @IsString()
  platform!: string;

  @IsDateString()
  recordedAt!: string;

  // ── Reach ──
  @IsOptional() @IsInt() @Min(0) views?: number;
  @IsOptional() @IsInt() @Min(0) reach?: number;
  @IsOptional() @IsInt() @Min(0) impressions?: number;

  // ── Engagement ──
  @IsOptional() @IsInt() @Min(0) likes?: number;
  @IsOptional() @IsInt() @Min(0) comments?: number;
  @IsOptional() @IsInt() @Min(0) shares?: number;
  @IsOptional() @IsInt() @Min(0) saves?: number;
  @IsOptional() @IsInt() @Min(0) watchTimeSec?: number;
  @IsOptional() @IsNumber() @Min(0) retention3Sec?: number;
  @IsOptional() @IsNumber() @Min(0) completionRate?: number;
  @IsOptional() @IsNumber() @Min(0) ctr?: number;

  // ── Commerce ──
  @IsOptional() @IsInt() @Min(0) productClicks?: number;
  @IsOptional() @IsInt() @Min(0) addToCart?: number;
  @IsOptional() @IsInt() @Min(0) orders?: number;
  @IsOptional() @IsNumber() @Min(0) revenue?: number;
  @IsOptional() @IsNumber() @Min(0) gmv?: number;
  @IsOptional() @IsNumber() @Min(0) cvr?: number;
  @IsOptional() @IsNumber() @Min(0) roas?: number;
}
