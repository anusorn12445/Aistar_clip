import { IdeaStatus } from '@prisma/client';
import { IsEnum, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

// Idea types ตาม PRD §19.2
export const IDEA_TYPES = [
  'hook',
  'story',
  'visual',
  'character',
  'comedy',
  'tie_in',
  'live_selling',
  'caption',
  'trend',
  'music',
  'editing',
] as const;

export class CreateIdeaDto {
  @IsString()
  @IsNotEmpty({ message: 'ต้องระบุชื่อไอเดีย' })
  @MaxLength(300)
  title!: string;

  @IsOptional()
  @IsIn(IDEA_TYPES as unknown as string[], { message: 'ideaType ไม่ถูกต้อง' })
  ideaType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  url?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateIdeaDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'ชื่อไอเดียห้ามว่าง' })
  @MaxLength(300)
  title?: string;

  @IsOptional()
  @IsIn(IDEA_TYPES as unknown as string[], { message: 'ideaType ไม่ถูกต้อง' })
  ideaType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  url?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class ChangeIdeaStatusDto {
  @IsEnum(IdeaStatus, { message: 'status ไม่ถูกต้อง' })
  status!: IdeaStatus;
}

export class ConvertIdeaDto {
  @IsIn(['campaign', 'episode'], { message: "to ต้องเป็น 'campaign' หรือ 'episode'" })
  to!: 'campaign' | 'episode';

  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;
}
