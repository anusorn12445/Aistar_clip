import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

// รายการสินค้า tie-in หนึ่งรายการ (productId + note บริบทการ tie-in)
export class TieInItemDto {
  @IsUUID()
  productId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'note ยาวได้ไม่เกิน 500 ตัวอักษร' })
  note?: string;
}

// ตั้งชุดสินค้า tie-in ทั้งหมดใหม่ (replace) — ไม่บังคับ ส่ง [] ได้เพื่อ unlink หมด
export class SetTieInsDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => TieInItemDto)
  items!: TieInItemDto[];
}
