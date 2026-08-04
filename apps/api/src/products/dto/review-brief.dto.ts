import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

// Review Brief ของสินค้า — validate เป็น object (ทุกช่อง optional)
// sanitize จริง (trim + cap 20 รายการแบบเงียบ ๆ) ทำที่ products/review-brief.util.ts ชั้น service
// จงใจไม่ใส่ ArrayMaxSize ตรงนี้ — วางเกินมา (เช่นจาก AI/ก๊อปยาว) ให้ตัดทิ้งแทนการ 400
export class ReviewBriefDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  highlights?: string[];

  @IsOptional()
  @IsString()
  specs?: string;

  @IsOptional()
  @IsString()
  targetAudience?: string;

  @IsOptional()
  @IsString()
  painPoint?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  howToUse?: string[];

  @IsOptional()
  @IsString()
  promo?: string;

  @IsOptional()
  @IsString()
  cautions?: string;

  @IsOptional()
  @IsString()
  extraNote?: string;
}

// POST /products/:id/review-brief/extract — วางข้อความจากหน้า Shopee (+รูปในคลัง) → AI แตกฟิลด์
// ไม่ auto-save: frontend โชว์ preview ก่อนแล้วค่อย PATCH กลับมา
export class ExtractReviewBriefDto {
  @IsString()
  text!: string;

  // asset ids ของรูปในคลังสินค้า — service ใช้สูงสุด 4 รูปแรก (ช่วย AI อ่านฉลาก/สเปกจากภาพ)
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsUUID('all', { each: true })
  assetIds?: string[];
}
