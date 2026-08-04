import { PartialType } from '@nestjs/mapped-types';
import { IsArray, IsDateString, IsOptional, IsUUID } from 'class-validator';
import { CreateCharacterDto } from './create-character.dto';

export class UpdateCharacterDto extends PartialType(CreateCharacterDto) {
  // optimistic locking (addendum §F.1 ข้อ 6) — client ส่ง updatedAt เดิมมาเทียบ
  @IsOptional()
  @IsDateString()
  expectedUpdatedAt?: string;

  // ประเภทตัวละคร (taxonomy) — ส่งมา = replace-set ทั้งชุด (many-to-many)
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  categoryIds?: string[];
}
