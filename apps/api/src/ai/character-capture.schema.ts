// JSON Schema สำหรับ Character Reverse-capture ("สร้างตัวละครจากภายนอก")
// reuse section schemas ของ Character draft (persona + visualDna v2 + suggested)
// แล้วเติม top-level ชื่อ (nameTh/nameEn) + confidence รวม
// ข้อจำกัด constrained decoding เหมือน character-draft.schema.ts:
//   ทุก object ต้องมี additionalProperties:false + required ครบทุก key, ห้ามใช้ min/max

import {
  COMMERCE_PROFILE_SCHEMA,
  PERSONA_SCHEMA,
  SUGGESTED_SCHEMA,
  VISUAL_DNA_SCHEMA,
  VOICE_PROFILE_SCHEMA,
} from './character-draft.schema';

export const CAPTURE_CONFIDENCE_VALUES = ['high', 'medium', 'low'] as const;
export type CaptureConfidence = (typeof CAPTURE_CONFIDENCE_VALUES)[number];

export interface CharacterCaptureResult {
  nameTh: string;
  nameEn: string;
  persona: Record<string, unknown>;
  visualDna: Record<string, unknown>;
  commerceProfile: Record<string, unknown>;
  voiceProfile: Record<string, unknown>;
  suggested: { age?: number; gender?: string; region?: string; roleLabel?: string };
  confidence: CaptureConfidence;
}

export const CHARACTER_CAPTURE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    nameTh: {
      type: 'string',
      description:
        'ชื่อไทยของตัวละคร — เดาจากสรุป/รูป ถ้าไม่มีชื่อชัดเจนให้ตั้งชื่อไทยที่เข้ากับคาแรกเตอร์',
    },
    nameEn: {
      type: 'string',
      description: 'ชื่ออังกฤษ ถ้ามี/เดาได้ — ไม่มีให้เป็น string ว่าง',
    },
    persona: PERSONA_SCHEMA,
    visualDna: VISUAL_DNA_SCHEMA,
    commerceProfile: COMMERCE_PROFILE_SCHEMA,
    voiceProfile: VOICE_PROFILE_SCHEMA,
    suggested: SUGGESTED_SCHEMA,
    confidence: {
      type: 'string',
      enum: [...CAPTURE_CONFIDENCE_VALUES],
      description:
        'ความมั่นใจโดยรวมว่าแตกข้อมูลได้ตรงกับสรุป+รูป: high = ข้อมูลครบชัด, medium = ต้องเดาบางส่วน, low = ข้อมูลน้อย/กำกวมมาก',
    },
  },
  required: ['nameTh', 'nameEn', 'persona', 'visualDna', 'commerceProfile', 'voiceProfile', 'suggested', 'confidence'],
  additionalProperties: false,
};
