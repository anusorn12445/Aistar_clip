import { IsOptional, IsString } from 'class-validator';

// GET /content-insights/roi — ROI ต่อคลิป (ต้นทุน AI vs ผลงาน)
// ทุก filter เป็น optional:
// - from/to  → กรองทั้งสองฝั่ง: AiUsageLog.usedAt (ต้นทุน) และ ContentPerformance.recordedAt (ผลงาน)
// - platform → ContentItem.platform (เช่น tiktok)
// - category → ContentItem.contentType (drama, review, tie_in, vlog, meme)
// - sourceType → ContentItem.sourceType (เช่น 'affiliate')
export class RoiQueryDto {
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsString()
  platform?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  sourceType?: string;
}
