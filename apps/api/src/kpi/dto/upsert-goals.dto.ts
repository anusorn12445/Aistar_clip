import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { METRIC_KEYS, PERIODS } from '../kpi.constants';

export class GoalRowDto {
  @IsString()
  @IsIn(METRIC_KEYS, { message: 'metric ไม่ถูกต้อง' })
  metric!: string;

  @IsString()
  @IsIn(PERIODS as unknown as string[], { message: 'period ต้องเป็น weekly หรือ monthly' })
  period!: string;

  @IsInt({ message: 'target ต้องเป็นจำนวนเต็ม' })
  @Min(0, { message: 'target ต้องไม่ติดลบ' })
  @Max(1000, { message: 'target ต้องไม่เกิน 1000' })
  target!: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpsertGoalsDto {
  // scope 'role' (default, phase 1) | 'user' (phase 2 — เป้ารายคน override เป้า role)
  @IsOptional()
  @IsIn(['role', 'user'], { message: "scope ต้องเป็น 'role' หรือ 'user'" })
  scope?: string;

  @ValidateIf((o: UpsertGoalsDto) => o.scope !== 'user')
  @IsString()
  @IsNotEmpty({ message: 'ต้องระบุ roleKey' })
  roleKey?: string;

  @ValidateIf((o: UpsertGoalsDto) => o.scope === 'user')
  @IsUUID(undefined, { message: 'ต้องระบุ userId (uuid) เมื่อ scope=user' })
  userId?: string;

  @IsArray()
  @ArrayNotEmpty({ message: 'ไม่มีเป้าหมายให้บันทึก' })
  @ValidateNested({ each: true })
  @Type(() => GoalRowDto)
  goals!: GoalRowDto[];
}
