import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { CONTENT_PLATFORMS } from './create-content-item.dto';

export class UpdateLiveSessionDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsIn(CONTENT_PLATFORMS as unknown as string[])
  platform?: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsString()
  account?: string;

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

  // optimistic locking
  @IsOptional()
  @IsDateString()
  expectedUpdatedAt?: string;
}
