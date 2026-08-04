import { IsIn, IsUUID } from 'class-validator';

// ความสัมพันธ์ระดับ Prompt (UX มอง per-Prompt แต่เก็บจริงเป็น PromptLink ระดับ version)
// — 4 ค่ายที่ CEO อนุมัติ: ตัวละคร / สินค้า / ลูกค้า / แบรนด์
export const RELATION_ENTITY_TYPES = ['character', 'product', 'client', 'brand'] as const;
export type RelationEntityType = (typeof RELATION_ENTITY_TYPES)[number];

export class PromptRelationDto {
  @IsIn(RELATION_ENTITY_TYPES)
  entityType!: RelationEntityType;

  @IsUUID()
  entityId!: string;
}
