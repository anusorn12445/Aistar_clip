import { IsDateString, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

// งานภาพ (Image Request) — ค่าคงที่ตรงกับคอลัมน์ string บน ImageRequest (schema §image_requests)
export const IMAGE_TYPES = ['banner', 'cover', 'illustration', 'other'] as const;
export const IMAGE_PRIORITIES = ['low', 'normal', 'urgent'] as const;
export const IMAGE_STATUSES = [
  'open',
  'in_progress',
  'review',
  'revision',
  'approved',
  'cancelled',
] as const;
// ปลายทางที่ภาพจะไปติด
export const IMAGE_TARGET_TYPES = ['content', 'campaign', 'episode'] as const;

export class CreateImageRequestDto {
  @IsString()
  title!: string;

  @IsIn(IMAGE_TYPES as unknown as string[])
  imageType!: string;

  @IsOptional()
  @IsString()
  platform?: string;

  @IsOptional()
  @IsString()
  sizeNote?: string;

  @IsOptional()
  @IsString()
  copyText?: string;

  @IsOptional()
  @IsString()
  brief?: string;

  @IsOptional()
  @IsUUID()
  brandId?: string;

  @IsOptional()
  @IsIn(IMAGE_TARGET_TYPES as unknown as string[])
  entityType?: string;

  @IsOptional()
  @IsUUID()
  entityId?: string;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsOptional()
  @IsIn(IMAGE_PRIORITIES as unknown as string[])
  priority?: string;
}

// PATCH — แก้ brief fields + มอบหมาย/กำหนดส่ง/ความสำคัญ + draftPrompt (แก้ prompt ที่ AI ร่างได้)
// หมายเหตุ: @IsOptional() ข้าม null ด้วย — ส่ง null = เคลียร์ค่า (service เช็ค !== undefined)
export class UpdateImageRequestDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsIn(IMAGE_TYPES as unknown as string[])
  imageType?: string;

  @IsOptional()
  @IsString()
  platform?: string | null;

  @IsOptional()
  @IsString()
  sizeNote?: string | null;

  @IsOptional()
  @IsString()
  copyText?: string | null;

  @IsOptional()
  @IsString()
  brief?: string | null;

  @IsOptional()
  @IsUUID()
  brandId?: string | null;

  @IsOptional()
  @IsIn(IMAGE_TARGET_TYPES as unknown as string[])
  entityType?: string | null;

  @IsOptional()
  @IsUUID()
  entityId?: string | null;

  @IsOptional()
  @IsString()
  draftPrompt?: string | null;

  @IsOptional()
  @IsUUID()
  assigneeId?: string | null;

  @IsOptional()
  @IsDateString()
  dueAt?: string | null;

  @IsOptional()
  @IsIn(IMAGE_PRIORITIES as unknown as string[])
  priority?: string;
}

export class ChangeImageRequestStatusDto {
  @IsIn(IMAGE_STATUSES as unknown as string[])
  status!: string;

  // ใช้ตอน review → approved: เลือกเวอร์ชันภาพที่อนุมัติ (ต้องเป็น asset ที่ link กับ request นี้)
  @IsOptional()
  @IsUUID()
  approvedAssetId?: string;

  // คอมเมนต์ประกอบ (เช่นตอนขอแก้) — สร้างเป็น Postit ผูกกับ request
  @IsOptional()
  @IsString()
  comment?: string;
}
