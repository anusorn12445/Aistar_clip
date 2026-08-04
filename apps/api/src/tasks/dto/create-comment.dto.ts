import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateCommentDto {
  @IsString({ message: 'ความคิดเห็นต้องเป็นข้อความ' })
  @IsNotEmpty({ message: 'ความคิดเห็นห้ามว่าง' })
  @MaxLength(2000, { message: 'ความคิดเห็นยาวเกินไป (สูงสุด 2,000 ตัวอักษร)' })
  content!: string;
}
