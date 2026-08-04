import { IsIn, IsOptional, IsUUID } from 'class-validator';

// polymorphic link (§F.2) — ผูก prompt version เข้ากับ entity อื่น
// (product/client/brand เพิ่มมากับ Prompt Relations — เชื่อม ตัวละคร/สินค้า/ลูกค้า/แบรนด์)
export class CreatePromptLinkDto {
  @IsIn(['character', 'shot', 'campaign', 'episode', 'product', 'client', 'brand'])
  entityType!: string;

  @IsUUID()
  entityId!: string;

  // ถ้าไม่ระบุ = ผูก version ล่าสุด
  @IsOptional()
  @IsUUID()
  versionId?: string;
}
