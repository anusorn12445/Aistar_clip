// JSON Schema สำหรับ Character Spec Verify (round-trip diff):
// Claude ได้รับ "สเปกที่บันทึกไว้ (visualDna)" + "รูปที่ gen มา" แล้วเทียบเชิงความหมาย
// ต่อฟิลด์ในการเรียกครั้งเดียว — ตอบ observed + verdict ต่อ key และ summary ภาษาไทย
// ข้อจำกัด constrained decoding เหมือน schema อื่น:
//   ทุก object ต้องมี additionalProperties:false + required ครบทุก key, ห้ามใช้ min/max

export const SPEC_VERIFY_VERDICT_VALUES = ['match', 'mismatch', 'uncertain'] as const;
export type SpecVerifyVerdict = (typeof SPEC_VERIFY_VERDICT_VALUES)[number];

export interface CharacterSpecVerifyResult {
  fields: { key: string; observed: string; verdict: SpecVerifyVerdict }[];
  summary: string;
}

export const CHARACTER_SPEC_VERIFY_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    fields: {
      type: 'array',
      description:
        'ผลเทียบต่อฟิลด์ — เฉพาะ key ที่ปรากฏใน SPEC ที่ให้มาเท่านั้น ห้ามเพิ่ม key ใหม่',
      items: {
        type: 'object',
        properties: {
          key: {
            type: 'string',
            description: 'ชื่อฟิลด์ใน visualDna ตาม SPEC ที่ให้มา (เช่น ethnicity, hair_style)',
          },
          observed: {
            type: 'string',
            description:
              'สิ่งที่เห็นจริงในรูปสำหรับฟิลด์นี้ (ภาษาไทย) — มองไม่เห็น/ไม่มีหลักฐานให้เป็น string ว่าง',
          },
          verdict: {
            type: 'string',
            enum: [...SPEC_VERIFY_VERDICT_VALUES],
            description:
              'match = สิ่งที่เห็นตรงกับสเปก (เทียบเชิงความหมาย), mismatch = เห็นชัดว่าไม่ตรง, uncertain = มองไม่เห็น/ตัดสินไม่ได้จากรูป',
          },
        },
        required: ['key', 'observed', 'verdict'],
        additionalProperties: false,
      },
    },
    summary: {
      type: 'string',
      description:
        'สรุปภาษาไทยสั้น ๆ: ภาพรวมตรงสเปกแค่ไหน จุดไหนหลุด จุดไหนตัดสินไม่ได้',
    },
  },
  required: ['fields', 'summary'],
  additionalProperties: false,
};
