import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

// Interaction Template (SRS slice 2) — "สูตรคลิป" ผูก Hand/Gesture/ProductState ต่อ packaging
export const TEMPLATE_SECTIONS = [
  'hook',
  'reveal',
  'interaction',
  'demonstration',
  'result',
  'cta',
] as const;

export class CreateInteractionTemplateDto {
  @IsString()
  name!: string;

  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() productCategory?: string; // ProductCategory.key
  @IsOptional() @IsString() packagingType?: string;
  @IsOptional() @IsString() materialType?: string;
  @IsOptional() @IsString() platform?: string;
  @IsOptional() @IsString() aspectRatio?: string;
  @IsOptional() @IsString() storyboardType?: string;
  @IsOptional() @IsNumber() @Min(0) targetDurationSec?: number;
  @IsOptional() @IsUUID() defaultHandId?: string;
  @IsOptional() @IsUUID() defaultCameraId?: string;
  @IsOptional() @IsUUID() defaultLightingId?: string;
  @IsOptional() @IsIn(['draft', 'active']) status?: string;
  @IsOptional() @IsString() version?: string;
}

export class UpdateInteractionTemplateDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() productCategory?: string;
  @IsOptional() @IsString() packagingType?: string;
  @IsOptional() @IsString() materialType?: string;
  @IsOptional() @IsString() platform?: string;
  @IsOptional() @IsString() aspectRatio?: string;
  @IsOptional() @IsString() storyboardType?: string;
  @IsOptional() @IsNumber() @Min(0) targetDurationSec?: number;

  // null = ล้างมือ default ออก
  @IsOptional()
  @ValidateIf((o: UpdateInteractionTemplateDto) => o.defaultHandId !== null)
  @IsUUID()
  defaultHandId?: string | null;

  // null = ล้างมุมกล้อง default ออก
  @IsOptional()
  @ValidateIf((o: UpdateInteractionTemplateDto) => o.defaultCameraId !== null)
  @IsUUID()
  defaultCameraId?: string | null;

  // null = ล้างแสง default ออก
  @IsOptional()
  @ValidateIf((o: UpdateInteractionTemplateDto) => o.defaultLightingId !== null)
  @IsUUID()
  defaultLightingId?: string | null;

  @IsOptional() @IsIn(['draft', 'active']) status?: string;
  @IsOptional() @IsString() version?: string;
}

export class TemplateStepDto {
  @IsIn(TEMPLATE_SECTIONS as unknown as string[])
  section!: string;

  @IsOptional() @IsUUID() gestureId?: string;
  @IsOptional() @IsUUID() handId?: string;
  @IsOptional() @IsUUID() cameraId?: string;
  @IsOptional() @IsUUID() lightingId?: string;
  @IsOptional() @IsString() cameraNote?: string;
  @IsOptional() @IsString() lightingNote?: string;
  @IsOptional() @IsNumber() @Min(0) durationSec?: number;
  @IsOptional() @IsBoolean() required?: boolean;
  @IsOptional() @IsString() note?: string;
}

// replace-set: ลำดับ step ทั้งชุด (stepOrder = index ใน array)
export class ReplaceTemplateStepsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TemplateStepDto)
  steps!: TemplateStepDto[];
}
