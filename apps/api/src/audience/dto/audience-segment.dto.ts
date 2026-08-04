import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export const AUDIENCE_GENDERS = ['any', 'female', 'male', 'mixed'] as const;
export const AUDIENCE_SPENDING = ['low', 'medium', 'high'] as const;
export const AUDIENCE_STATUSES = ['active', 'archived'] as const;

export class CreateAudienceSegmentDto {
  @IsString()
  @Length(1, 80, { message: 'ชื่อกลุ่มผู้ชมต้องมี 1-80 ตัวอักษร' })
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  ageMin?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  ageMax?: number;

  @IsOptional()
  @IsIn([...AUDIENCE_GENDERS], { message: 'gender ต้องเป็น any | female | male | mixed' })
  gender?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  interests?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  platforms?: string[];

  @IsOptional()
  @IsIn([...AUDIENCE_SPENDING], { message: 'spendingPower ต้องเป็น low | medium | high' })
  spendingPower?: string;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsString()
  painPoint?: string;
}

export class UpdateAudienceSegmentDto extends CreateAudienceSegmentDto {
  @IsOptional()
  @IsString()
  @Length(1, 80, { message: 'ชื่อกลุ่มผู้ชมต้องมี 1-80 ตัวอักษร' })
  declare name: string;

  @IsOptional()
  @IsIn([...AUDIENCE_STATUSES], { message: 'status ต้องเป็น active | archived' })
  status?: string;
}

// รายการ link หนึ่งกลุ่ม (segmentId + ธง primary)
export class AudienceLinkItemDto {
  @IsUUID()
  segmentId!: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

// ตั้งชุด segment ทั้งหมดของ character/series ใหม่ (replace)
export class SetAudiencesDto {
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => AudienceLinkItemDto)
  items!: AudienceLinkItemDto[];
}
