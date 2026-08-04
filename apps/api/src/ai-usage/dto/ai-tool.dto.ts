import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export const AI_TOOL_UNITS = ['token', 'credit', 'flat'] as const;
export const AI_TOOL_STATUSES = ['active', 'archived'] as const;

export class CreateAiToolDto {
  @IsString()
  name!: string;

  @IsIn(AI_TOOL_UNITS as unknown as string[])
  unit!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  defaultRateBaht?: number;

  @IsOptional()
  @IsIn(AI_TOOL_STATUSES as unknown as string[])
  status?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateAiToolDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(AI_TOOL_UNITS as unknown as string[])
  unit?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  defaultRateBaht?: number;

  @IsOptional()
  @IsIn(AI_TOOL_STATUSES as unknown as string[])
  status?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class CreateTopupDto {
  @IsDateString()
  purchasedAt!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amountBaht!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  quantity!: number;

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateTopupDto {
  @IsOptional()
  @IsDateString()
  purchasedAt?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amountBaht?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  quantity?: number;

  @IsOptional()
  @IsString()
  note?: string;
}
