import { ArrayNotEmpty, IsArray, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { DRAFT_SECTIONS, DraftSection } from '../character-draft.schema';

// Character Wizard step 1 → AI generate (addendum §H): กรอกแค่ 3-5 ช่องแล้วให้ AI ร่างที่เหลือ
export class GenerateCharacterDraftDto {
  @IsString()
  nameTh!: string;

  // Blueprint (พิมพ์เขียว) ที่เลือกในหน้าสร้าง — inject house-rules/defaults/required เข้า system prompt
  @IsOptional()
  @IsUUID()
  blueprintId?: string;

  @IsOptional()
  @IsString()
  nameEn?: string;

  @IsString()
  oneLineConcept!: string;

  @IsOptional()
  @IsString()
  universe?: string;

  @IsOptional()
  @IsString()
  series?: string;

  // subset ของ section ที่ให้ AI ร่าง — ไม่ส่ง = ร่างทุก section (ใช้ตอน regenerate ต่อ section)
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(DRAFT_SECTIONS, { each: true })
  sections?: DraftSection[];
}
