import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';

// รายการ link หนึ่งกลุ่ม (segmentId + ธง primary) — mirror ของ character/series
export class BrandAudienceLinkItemDto {
  @IsUUID()
  segmentId!: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

// ตั้งชุด segment ทั้งหมดของ brand ใหม่ (replace)
export class SetBrandAudiencesDto {
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => BrandAudienceLinkItemDto)
  items!: BrandAudienceLinkItemDto[];
}
