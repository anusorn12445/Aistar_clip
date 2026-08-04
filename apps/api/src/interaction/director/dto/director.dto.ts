import { IsInt, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { Type } from 'class-transformer';

// AI Director (SRS slice 4, §3.13) — รับพารามิเตอร์การถ่าย → แนะนำสูตรคลิป
export class RecommendDirectorDto {
  // เลือกได้: อ้างสินค้าจริง (productId) หรือระบุ category+packaging ตรง ๆ
  @IsOptional() @IsUUID() productId?: string;
  @IsOptional() @IsUUID() brandId?: string;
  @IsOptional() @IsString() productCategory?: string;
  @IsOptional() @IsString() packagingType?: string;

  @IsOptional() @IsString() platform?: string;
  @IsOptional() @IsNumber() @Min(0) targetDurationSec?: number;
  @IsOptional() @IsString() objective?: string; // awareness | conversion | education | promo | ...
  @IsOptional() @IsString() creativeStyle?: string; // premium | playful | clinical | natural | luxury | ...
  @IsOptional() @IsString() language?: string; // default th
  @IsOptional() @IsUUID() preferredHandId?: string;
  @IsOptional() @IsString() notes?: string;
}

export class ListDirectorRunsQuery {
  @IsOptional() @IsUUID() productId?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() q?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
}
