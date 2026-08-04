import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { ASSET_LINK_ROLES } from './create-asset-link.dto';

// POST /assets/import-url — ลากรูปจากแท็บอื่น (ได้ URL) → server fetch แล้วเก็บเข้า storage
// เหมือน upload ปกติทุกอย่าง (Asset + AssetLink) — default linkRole 'review_image'
export class ImportAssetUrlDto {
  @IsString()
  @IsNotEmpty()
  url!: string;

  @IsString()
  @IsNotEmpty()
  entityType!: string; // product, character, ...

  @IsUUID()
  entityId!: string;

  @IsOptional()
  @IsIn(ASSET_LINK_ROLES)
  linkRole?: string;

  // default 'product_image' — เผื่อ entity อื่นใช้ role อื่นในอนาคต
  @IsOptional()
  @IsString()
  assetType?: string;
}
