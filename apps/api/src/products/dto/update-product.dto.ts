import { PartialType } from '@nestjs/mapped-types';
import { IsDateString, IsOptional } from 'class-validator';
import { CreateProductDto } from './create-product.dto';

export class UpdateProductDto extends PartialType(CreateProductDto) {
  // optimistic locking (§F.1 ข้อ 6) — client ส่ง updatedAt เดิมมาเทียบ
  @IsOptional()
  @IsDateString()
  expectedUpdatedAt?: string;
}
