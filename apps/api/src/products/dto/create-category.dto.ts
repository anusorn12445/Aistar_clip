import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  @Length(1, 40)
  label!: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateCategoryDto {
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

export class ReorderCategoriesDto {
  @IsArray()
  @IsString({ each: true })
  ids!: string[];
}
