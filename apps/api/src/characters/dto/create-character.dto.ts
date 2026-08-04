import { IsArray, IsInt, IsObject, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

// Character Wizard step 1 — required แค่ 3 ช่อง (addendum §H)
export class CreateCharacterDto {
  @IsString()
  nameTh!: string;

  @IsOptional()
  @IsString()
  nameEn?: string;

  @IsOptional()
  @IsString()
  nickname?: string;

  @IsOptional()
  @IsString()
  oneLineConcept?: string;

  @IsOptional()
  @IsString()
  universe?: string;

  @IsOptional()
  @IsString()
  series?: string;

  @IsOptional()
  @IsString()
  roleLabel?: string;

  @IsOptional()
  @IsInt()
  @Min(18) // guardrail: commerce character ต้อง ≥ 18 (addendum §G.2)
  @Max(120)
  age?: number;

  @IsOptional()
  @IsString()
  gender?: string;

  @IsOptional()
  @IsString()
  region?: string;

  // ผู้สร้างตัวละคร (freelance/ทีมใน) — ต้องมีอยู่จริงใน creators
  // PATCH ส่ง null ได้เพื่อเอาออก (IsOptional ข้าม null ให้ผ่านไปถึง service)
  @IsOptional()
  @IsUUID()
  creatorId?: string;

  // Blueprint (พิมพ์เขียว) ที่ใช้สร้าง — บันทึกไว้บน Character (ไม่ส่ง = ใช้ default blueprint)
  @IsOptional()
  @IsUUID()
  blueprintId?: string;

  @IsOptional()
  @IsObject()
  persona?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  visualDna?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  commerceProfile?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  voiceProfile?: Record<string, unknown>;

  // Do's & Don'ts ประจำตัวละคร (Character Sheet) — ส่งมา = replace ทั้ง array
  // ฝังเข้า Master Prompt DIRECTIVE เป็น ALWAYS/NEVER bullets ทุกครั้งที่ก๊อป prompt
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dos?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  donts?: string[];
}
