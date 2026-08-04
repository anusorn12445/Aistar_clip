import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { ASSET_LINK_ROLES } from './create-asset-link.dto';

// multipart body ของ POST /assets — file แนบมาแยกผ่าน FileInterceptor
export class CreateAssetDto {
  @IsString()
  assetType!: string; // face_reference, full_body, expression_sheet, ...

  @IsOptional()
  @IsString()
  generationTool?: string; // provenance: grok, kling, ...

  // link ทันทีตอน upload (optional) — polymorphic ตาม §F.1 ข้อ 3
  @IsOptional()
  @IsString()
  entityType?: string; // character, episode, shot, campaign

  @IsOptional()
  @IsUUID()
  entityId?: string;

  // ชุด role กลางอยู่ที่ create-asset-link.dto.ts (ASSET_LINK_ROLES) — ใช้ชุดเดียวกันทุก endpoint
  @IsOptional()
  @IsIn(ASSET_LINK_ROLES)
  linkRole?: string;
}
