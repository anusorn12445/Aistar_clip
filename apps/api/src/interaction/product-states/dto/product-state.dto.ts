import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

// สถานะสินค้า (ProductState taxonomy) — จัดการที่ Settings, mirror CharacterCategory
export class CreateProductStateDto {
  @IsString()
  @Length(1, 60)
  label!: string;

  @IsOptional() @IsInt() sortOrder?: number;
  @IsOptional() @IsBoolean() isInitial?: boolean;
  @IsOptional() @IsBoolean() isTerminal?: boolean;
}

export class UpdateProductStateDto {
  @IsOptional() @IsString() @Length(1, 60) label?: string;
  @IsOptional() @IsInt() sortOrder?: number;
  @IsOptional() @IsBoolean() isInitial?: boolean;
  @IsOptional() @IsBoolean() isTerminal?: boolean;
  @IsOptional() @IsIn(['active', 'archived']) status?: string;
}

export class ReorderProductStatesDto {
  @IsArray()
  @IsString({ each: true })
  ids!: string[];
}

// การเปลี่ยนสถานะ 1 คู่ (from→to โดยอ้าง key)
export class TransitionPairDto {
  @IsString() from!: string;
  @IsString() to!: string;
  @IsOptional() @IsString() note?: string;
  // self-loop (from===to) จะถูกปฏิเสธ เว้นแต่ตั้ง allowSelfLoop = true โดยตั้งใจ
  @IsOptional() @IsBoolean() allowSelfLoop?: boolean;
}

// PUT /product-states/transitions — replace-set ทั้งชุด
export class SetTransitionsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransitionPairDto)
  transitions!: TransitionPairDto[];
}

// POST /product-states/validate-sequence — ตรวจลำดับสถานะว่าสมเหตุผล
export class ValidateSequenceDto {
  @IsArray()
  @IsString({ each: true })
  stateKeys!: string[];
}
