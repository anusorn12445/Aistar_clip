import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

// POST /ai/affiliate/review — สร้างชุดคอนเทนต์รีวิวต่อสินค้า 1 ตัว
export class AffiliateReviewDto {
  @IsUUID()
  productId!: string;

  // platform ปลายทาง (default facebook) — เก็บใน ContentItem.platform
  @IsOptional()
  @IsString()
  platform?: string;

  // true = ถ้ามีคอนเทนต์ affiliate ของสินค้านี้อยู่แล้ว ให้เขียนทับ (update) แทนสร้างใหม่
  @IsOptional()
  @IsBoolean()
  regenerate?: boolean;
}

// POST /ai/affiliate/batch — สร้างทีเดียวทั้งหมวด หรือรายการสินค้าที่ระบุ
export class AffiliateBatchDto {
  // ระบุอย่างใดอย่างหนึ่ง: ทั้งหมวด (categoryKey) หรือ productIds[]
  @IsOptional()
  @IsString()
  categoryKey?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  productIds?: string[];

  // platform ปลายทาง (default facebook)
  @IsOptional()
  @IsString()
  platform?: string;

  // default true = ข้ามสินค้าที่มีคอนเทนต์ affiliate อยู่แล้ว
  @IsOptional()
  @IsBoolean()
  onlyMissing?: boolean;
}
