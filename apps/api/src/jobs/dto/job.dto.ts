import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { JobStatus, JobType } from '@prisma/client';

export const JOB_PRIORITIES = ['low', 'normal', 'urgent'] as const;
export const JOB_PAYMENT_STATUS = ['unpaid', 'deposit_paid', 'paid'] as const;

export class CrewInputDto {
  @IsUUID()
  creatorId!: string;

  @IsOptional()
  @IsString()
  roleNote?: string;
}

export class CreateJobDto {
  @IsString()
  title!: string;

  @IsUUID()
  clientId!: string;

  @IsOptional()
  @IsEnum(JobType)
  type?: JobType;

  @IsOptional()
  @IsString()
  brief?: string;

  @IsOptional()
  @IsIn(JOB_PRIORITIES as unknown as string[])
  priority?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  qtyImages?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  qtyClips?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  revisionsIncluded?: number;

  @IsOptional()
  @IsNumber()
  quotePrice?: number;

  @IsOptional()
  @IsNumber()
  depositAmount?: number;

  @IsOptional()
  @IsIn(JOB_PAYMENT_STATUS as unknown as string[])
  paymentStatus?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  productIds?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  characterIds?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CrewInputDto)
  crew?: CrewInputDto[];
}

export class UpdateJobDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsEnum(JobType)
  type?: JobType;

  @IsOptional()
  @IsString()
  brief?: string;

  @IsOptional()
  @IsIn(JOB_PRIORITIES as unknown as string[])
  priority?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  qtyImages?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  qtyClips?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  revisionsIncluded?: number;

  @IsOptional()
  @IsNumber()
  quotePrice?: number;

  @IsOptional()
  @IsNumber()
  depositAmount?: number;

  @IsOptional()
  @IsIn(JOB_PAYMENT_STATUS as unknown as string[])
  paymentStatus?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  productIds?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  characterIds?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CrewInputDto)
  crew?: CrewInputDto[];
}

export class ChangeJobStatusDto {
  @IsEnum(JobStatus)
  status!: JobStatus;
}

export class CreateDeliverableDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  round?: number;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateDeliverableDto {
  @IsOptional()
  @IsIn(['pending', 'submitted', 'approved', 'rejected'])
  status?: string;

  @IsOptional()
  @IsString()
  clientFeedback?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  title?: string;
}
