import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

// ประเภทตัวละคร (taxonomy) — จัดการที่ Settings, mirror ProductCategory
export class CreateCharacterCategoryDto {
  @IsString()
  @Length(1, 40)
  label!: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateCharacterCategoryDto {
  @IsOptional()
  @IsString()
  @Length(1, 40)
  label?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsIn(['active', 'archived'])
  status?: string;
}

export class ReorderCharacterCategoriesDto {
  @IsArray()
  @IsString({ each: true })
  ids!: string[];
}
