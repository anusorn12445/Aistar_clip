import { TaskPriority, TaskStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

// label รูปแบบ "สี:ชื่อ" เช่น "green:ถ่ายทำ" — สีจำกัด 9 สีตามชุดของบอร์ด
export const LABEL_PATTERN = /^(green|yellow|orange|red|purple|blue|sky|pink|zinc):.{1,24}$/;

export class ChecklistItemDto {
  @IsString({ message: 'checklist item ต้องมี id เป็น string' })
  @IsNotEmpty({ message: 'checklist item ต้องมี id' })
  id!: string;

  @IsString({ message: 'ข้อความ checklist ต้องเป็น string' })
  @Length(1, 200, { message: 'ข้อความ checklist ต้องยาว 1-200 ตัวอักษร' })
  text!: string;

  @IsBoolean({ message: 'สถานะ done ของ checklist ต้องเป็น true/false' })
  done!: boolean;
}

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'ชื่องานห้ามว่าง' })
  title?: string;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  // ส่ง null เพื่อเอาผู้รับผิดชอบออก
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  assigneeId?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  dueDate?: string | null;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  // รายละเอียดยาวแบบ Trello — ส่ง "" หรือ null เพื่อล้าง
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString({ message: 'รายละเอียดต้องเป็นข้อความ' })
  @MaxLength(10000, { message: 'รายละเอียดยาวเกินไป (สูงสุด 10,000 ตัวอักษร)' })
  description?: string | null;

  @IsOptional()
  @IsArray({ message: 'labels ต้องเป็น array' })
  @ArrayMaxSize(10, { message: 'ใส่ label ได้สูงสุด 10 อัน' })
  @IsString({ each: true, message: 'label แต่ละอันต้องเป็นข้อความ' })
  @Matches(LABEL_PATTERN, {
    each: true,
    message:
      'รูปแบบ label ไม่ถูกต้อง — ต้องเป็น "สี:ชื่อ" เช่น "green:ถ่ายทำ" (สีที่ใช้ได้: green, yellow, orange, red, purple, blue, sky, pink, zinc และชื่อยาว 1-24 ตัวอักษร)',
  })
  labels?: string[];

  @IsOptional()
  @IsArray({ message: 'checklist ต้องเป็น array' })
  @ArrayMaxSize(50, { message: 'checklist ใส่ได้สูงสุด 50 รายการ' })
  @ValidateNested({ each: true })
  @Type(() => ChecklistItemDto)
  checklist?: ChecklistItemDto[];
}
