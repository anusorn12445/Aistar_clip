import { PostitStatus, TaskPriority } from '@prisma/client';
import { IsEnum, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

// Post-it types ตาม PRD §20.2
export const POSTIT_TYPES = [
  'note',
  'idea',
  'todo',
  'issue',
  'feedback',
  'qc_note',
  'risk',
  'reference',
  'decision',
  'question',
] as const;

export class CreatePostitDto {
  @IsIn(POSTIT_TYPES as unknown as string[], { message: 'type ไม่ถูกต้อง' })
  type!: string;

  @IsString()
  @IsNotEmpty({ message: 'ต้องระบุเนื้อหาโน้ต' })
  content!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  entityType?: string;

  @IsOptional()
  @IsUUID()
  entityId?: string;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;
}

export class UpdatePostitDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'เนื้อหาโน้ตห้ามว่าง' })
  content?: string;

  // เปลี่ยนประเภท (= สีกระดาษ) ของโน้ตได้
  @IsOptional()
  @IsIn(POSTIT_TYPES as unknown as string[], { message: 'type ไม่ถูกต้อง' })
  type?: string;

  // ส่ง null เพื่อถอด assignee ออก
  @IsOptional()
  @IsUUID()
  assigneeId?: string | null;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional()
  @IsEnum(PostitStatus, { message: 'status ไม่ถูกต้อง' })
  status?: PostitStatus;
}

export class CreatePostitCommentDto {
  @IsString()
  @IsNotEmpty({ message: 'ต้องระบุเนื้อหาคอมเมนต์' })
  content!: string;
}
