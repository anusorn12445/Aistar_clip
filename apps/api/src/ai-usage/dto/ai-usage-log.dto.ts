import { Type } from 'class-transformer';
import {
  ArrayMinSize,
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

export const AI_LINK_ENTITY_TYPES = ['episode', 'shot', 'content', 'image_request'] as const;
export const AI_OUTPUT_TYPES = ['video', 'image', 'other'] as const;

export class AiUsageLinkDto {
  @IsIn(AI_LINK_ENTITY_TYPES as unknown as string[])
  entityType!: string;

  @IsUUID()
  entityId!: string;

  @IsOptional()
  @IsString()
  label?: string;
}

export class CreateAiUsageLogDto {
  @IsUUID()
  aiToolId!: string;

  @IsDateString()
  usedAt!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  quantity!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  outputsCount!: number;

  @IsIn(AI_OUTPUT_TYPES as unknown as string[])
  outputType!: string;

  @IsOptional()
  @IsString()
  note?: string;

  // ถ้าไม่ส่ง → auto = quantity × blended rate ของ tool
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  costBaht?: number;

  // บังคับผูกงานจริง ≥1 — ArrayMinSize ให้ 400 เมื่อว่าง
  @IsArray()
  @ArrayMinSize(1, { message: 'ต้องผูกงานอย่างน้อย 1 ชิ้น (episode/shot/content/image_request)' })
  @ValidateNested({ each: true })
  @Type(() => AiUsageLinkDto)
  links!: AiUsageLinkDto[];
}

export class UpdateAiUsageLogDto {
  @IsOptional()
  @IsUUID()
  aiToolId?: string;

  @IsOptional()
  @IsDateString()
  usedAt?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  quantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  outputsCount?: number;

  @IsOptional()
  @IsIn(AI_OUTPUT_TYPES as unknown as string[])
  outputType?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  costBaht?: number;

  // ถ้าส่ง → แทนที่ links เดิมทั้งชุด (ยังบังคับ ≥1)
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'ต้องผูกงานอย่างน้อย 1 ชิ้น (episode/shot/content/image_request)' })
  @ValidateNested({ each: true })
  @Type(() => AiUsageLinkDto)
  links?: AiUsageLinkDto[];
}
