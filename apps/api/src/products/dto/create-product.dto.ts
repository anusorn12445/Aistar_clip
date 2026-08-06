import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ReviewBriefDto } from './review-brief.dto';

export const PRODUCT_CATEGORIES = [
  'fashion',
  'beauty',
  'food',
  'supplement',
  'home',
  'gadget',
  'other',
] as const;

export const CLAIM_RISK_LEVELS = ['low', 'medium', 'high'] as const;

// แพลตฟอร์ม affiliate ที่รองรับ (Phase 1)
export const AFFILIATE_PLATFORMS = ['shopee', 'tiktok_shop', 'lazada', 'other'] as const;

export class CreateProductDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsUUID()
  brandId?: string;

  // category = key ของ ProductCategory — validate ว่ามีจริงในตาราง (ที่ service ชั้น)
  @IsOptional()
  @IsString()
  category?: string;

  // รูปแบบแพ็กเกจ — key จาก PACKAGING_PROMPTS (เช่น pump_bottle) — validate หลวม (custom key ได้)
  @IsOptional()
  @IsString()
  packagingType?: string;

  // 🧴 เนื้อสัมผัส — key จาก TEXTURE_PROMPTS (gel/cream/pill/foam ...) CSV
  @IsOptional()
  @IsString()
  textureType?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  salePrice?: number;

  // {shopee: url, tiktok_shop: url, lazada: url}
  @IsOptional()
  @IsObject()
  platformLinks?: Record<string, string>;

  @IsOptional()
  @IsIn(CLAIM_RISK_LEVELS as unknown as string[])
  claimRiskLevel?: string;

  // คำเคลมต้องห้าม — feed เข้า AI QC claim check ภายหลัง
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  restrictedClaims?: string[];

  @IsOptional()
  @IsString()
  commissionNote?: string;

  @IsOptional()
  @IsUUID()
  ownerId?: string;

  // ─── Affiliate Content Factory (Phase 1) ─────────────────────
  @IsOptional()
  @IsBoolean()
  isAffiliate?: boolean;

  // affiliate URL — validate ว่าเป็น URL จริงเมื่อส่งมา
  @IsOptional()
  @IsUrl({ require_tld: false }, { message: 'affiliateUrl ต้องเป็น URL ที่ถูกต้อง' })
  affiliateUrl?: string;

  @IsOptional()
  @IsIn(AFFILIATE_PLATFORMS as unknown as string[])
  affiliatePlatform?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  commissionPct?: number;

  // ─── Review Brief (ข้อมูลรีวิว — กรอกครั้งเดียว ใช้ทุก Clip Job) ─────
  // ส่ง null (เฉพาะ PATCH) = ล้าง brief ทิ้ง; sanitize จริงที่ service
  @IsOptional()
  @ValidateNested()
  @Type(() => ReviewBriefDto)
  reviewBrief?: ReviewBriefDto | null;
}
