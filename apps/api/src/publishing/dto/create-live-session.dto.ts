import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { CONTENT_PLATFORMS } from './create-content-item.dto';

export class LiveProductItemDto {
  @IsUUID()
  productId!: string;

  @IsInt()
  @Min(0)
  pinOrder!: number;
}

export class CreateLiveSessionDto {
  @IsString()
  title!: string;

  @IsIn(CONTENT_PLATFORMS as unknown as string[])
  platform!: string;

  @IsDateString()
  scheduledAt!: string;

  @IsOptional()
  @IsString()
  account?: string;

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  hostCharacterIds?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LiveProductItemDto)
  products?: LiveProductItemDto[];

  @IsOptional()
  @IsString()
  offer?: string;

  @IsOptional()
  @IsString()
  script?: string;

  @IsOptional()
  @IsString()
  faq?: string;

  @IsOptional()
  @IsString()
  commentGuide?: string;

  @IsOptional()
  @IsString()
  sceneSetup?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  targetGmv?: number;
}
