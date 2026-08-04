// JSON Schema สำหรับ structured output ของ Prompt Quick-Capture
// ข้อจำกัดของ constrained decoding (เหมือน affiliate.schemas.ts / phase4.schemas.ts):
// ทุก object ต้องมี additionalProperties:false + required ครบทุก key
// และห้ามใช้ minLength/maxLength/minimum/maximum/minItems/maxItems
// → field "optional" จึงเป็น string ที่ปล่อยว่าง ('') แทน

import { PROMPT_TYPES } from './dto/create-prompt.dto';

type JsonSchema = Record<string, unknown>;

const str = (description: string): JsonSchema => ({ type: 'string', description });

export const CAPTURE_CONFIDENCE_VALUES = ['high', 'medium', 'low'] as const;
export type CaptureConfidence = (typeof CAPTURE_CONFIDENCE_VALUES)[number];

// platform hint ที่อยากให้ AI ทายเป็นพิเศษ (targetPlatform เป็น free string ใน DB — D4)
export const CAPTURE_PLATFORM_HINTS = ['midjourney', 'grok', 'chatgpt', 'kling', 'unknown'];

export interface CaptureExtractionResult {
  name: string;
  promptType: string;
  body: string;
  negativeBody: string;
  targetPlatform: string;
  notes: string;
  confidence: CaptureConfidence;
}

export const CAPTURE_EXTRACTION_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    name: str('ชื่อ prompt สั้น ๆ สื่อความหมาย (ไทยหรืออังกฤษ) เช่น "Cinematic street portrait"'),
    promptType: {
      type: 'string',
      enum: [...PROMPT_TYPES],
      description: 'ประเภท prompt — เดาที่ใกล้เคียงที่สุด (ภาพฉาก/บรรยากาศ = scene, มุมกล้อง/ช็อต = shot)',
    },
    body: str(
      'ตัว generation prompt จริง ๆ ที่ก๊อปไปใช้ได้เลย — ตัด emoji, บรรทัดเครดิต, CTA, ข้อความชวนแชร์ออกให้หมด ถ้าในโพสต์ไม่มี prompt เลยให้เป็น string ว่าง ห้ามแต่งเอง',
    ),
    negativeBody: str('negative prompt ถ้าโพสต์ระบุมา — ไม่มีให้เป็น string ว่าง'),
    targetPlatform: {
      type: 'string',
      description: `platform ที่ prompt นี้น่าจะใช้ เช่น ${CAPTURE_PLATFORM_HINTS.join(
        '|',
      )} — ไม่แน่ใจให้ตอบ unknown`,
    },
    notes: str(
      'ข้อมูลเสริมที่มีประโยชน์: พารามิเตอร์ (--ar, cfg ฯลฯ), model ที่โพสต์บอก, เทคนิค/บริบทจากโพสต์ — ไม่มีให้เป็น string ว่าง',
    ),
    confidence: {
      type: 'string',
      enum: [...CAPTURE_CONFIDENCE_VALUES],
      description:
        'ความมั่นใจว่าแตกฟิลด์ถูก: high = โพสต์มี prompt ชัดเจน, medium = ต้องเดาบางส่วน, low = ไม่เจอ prompt หรือข้อมูลกำกวมมาก',
    },
  },
  required: ['name', 'promptType', 'body', 'negativeBody', 'targetPlatform', 'notes', 'confidence'],
  additionalProperties: false,
};
