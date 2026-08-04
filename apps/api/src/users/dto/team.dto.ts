import { ArrayUnique, IsArray, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export const TEAM_STATUSES = ['active', 'archived'] as const;

// POST /teams — สร้างทีม
export class CreateTeamDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;
}

// PATCH /teams/:id — เปลี่ยนชื่อ/สถานะ (archive = ทีมพัก ไม่นับใน scope 'team')
export class UpdateTeamDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsIn(TEAM_STATUSES)
  status?: (typeof TEAM_STATUSES)[number];
}

// PUT /teams/:id/members — replace-set สมาชิกทั้งชุด
export class SetTeamMembersDto {
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  userIds!: string[];
}
