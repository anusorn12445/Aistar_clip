import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Min,
} from 'class-validator';

export const MEDIA_LINK_STATUSES = ['active', 'archived'] as const;

export class CreateMediaLinkDto {
  @IsString()
  @Length(1, 100, { message: 'ชื่อลิงก์ต้องมี 1-100 ตัวอักษร' })
  label!: string;

  @IsUrl({ require_protocol: true }, { message: 'ลิงก์ต้องเป็น URL ที่ถูกต้อง (ขึ้นต้น https://)' })
  url!: string;

  @IsOptional()
  @IsString()
  @Length(0, 60)
  category?: string;

  @IsOptional()
  @IsString()
  @Length(0, 8)
  icon?: string;

  @IsOptional()
  @IsString()
  @Length(0, 300)
  note?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsIn([...MEDIA_LINK_STATUSES], { message: 'status ต้องเป็น active | archived' })
  status?: string;
}

export class UpdateMediaLinkDto extends CreateMediaLinkDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  declare label: string;

  @IsOptional()
  @IsUrl({ require_protocol: true }, { message: 'ลิงก์ต้องเป็น URL ที่ถูกต้อง (ขึ้นต้น https://)' })
  declare url: string;
}
