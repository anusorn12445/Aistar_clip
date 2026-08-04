// JSON Schema สำหรับ structured output ของ AI Director (SRS slice 4, §3.13)
// ข้อจำกัดของ constrained decoding (เหมือน content-intelligence.schemas.ts):
// ทุก object ต้องมี additionalProperties:false + required ครบทุก key
// และห้ามใช้ minLength/maxLength/minimum/maximum/minItems/maxItems

type JsonSchema = Record<string, unknown>;

const str = (description: string): JsonSchema => ({ type: 'string', description });
const num = (description: string): JsonSchema => ({ type: 'number', description });

const obj = (properties: Record<string, JsonSchema>, description?: string): JsonSchema => ({
  type: 'object',
  ...(description ? { description } : {}),
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

const arrayOf = (items: JsonSchema, description: string): JsonSchema => ({
  type: 'array',
  items,
  description,
});

export const DIRECTOR_SECTIONS = [
  'hook',
  'reveal',
  'interaction',
  'demonstration',
  'result',
  'cta',
] as const;

// AI ต้องเลือก id จากรายการที่ป้อนให้เท่านั้น (post-process จะ coerce id ที่ไม่มีในคลัง → null)
export const DIRECTOR_SCHEMA: JsonSchema = obj({
  storyboardType: str(
    'ชนิดสตอรี่บอร์ดที่เลือก เช่น how_to_use, unboxing, before_after, problem_solution, review (key อังกฤษ)',
  ),
  durationSec: num('ความยาวรวมของคลิปที่แนะนำ (วินาที)'),
  summary: str('สรุปคอนเซ็ปต์คลิปสั้น ๆ ภาษาไทย 1-2 ประโยค'),
  baseTemplateId: str(
    'id ของ InteractionTemplate อ้างอิงที่ใช้เป็นฐาน (เลือกจากรายการเทมเพลตที่ให้เท่านั้น) — ปล่อยเป็น string ว่างถ้าไม่อิงตัวไหน',
  ),
  steps: arrayOf(
    obj({
      stepOrder: num('ลำดับ step เริ่มที่ 0'),
      section: {
        type: 'string',
        enum: [...DIRECTOR_SECTIONS],
        description: 'ช่วงของคลิป: hook|reveal|interaction|demonstration|result|cta',
      },
      gestureId: str('id ของ Gesture ที่เลือก (จากรายการท่าที่ให้) — string ว่างถ้า step นี้ไม่มีท่า'),
      handId: str('id ของ HandProfile ที่เลือก (จากรายการมือที่ให้) — string ว่างถ้าใช้มือ default'),
      cameraId: str('id ของ CameraPreset ที่เลือก (จากรายการมุมกล้องที่ให้) — string ว่างถ้าไม่ระบุ'),
      lightingId: str('id ของ LightingPreset ที่เลือก (จากรายการแสงที่ให้) — string ว่างถ้าไม่ระบุ'),
      durationSec: num('ความยาว step นี้ (วินาที)'),
      reason: str('เหตุผลภาษาไทยว่าทำไมเลือกท่า/มือ/มุมกล้อง/แสง/ความยาวนี้สำหรับ step นี้'),
    }),
    'ลำดับ step ของคลิป เรียงตามเวลา — เลือก gesture/hand/camera/lighting จาก id ที่ให้เท่านั้น',
  ),
  reasons: arrayOf(
    obj({
      topic: str('หัวข้อเหตุผล เช่น "เลือกมือ", "เลือกมุมกล้อง", "ความยาว", "สิ่งที่ตัดออก"'),
      text: str('คำอธิบายภาษาไทย (§3.13.3 — ทำไมมือนี้/มุมนี้/ความยาวนี้/ตัดอะไรออกเพราะอะไร)'),
    }),
    'เหตุผลภาพรวมของสูตร ภาษาไทย — ต้องมีอย่างน้อย: ทำไมมือ, ทำไมมุมกล้อง, ทำไมความยาว, ตัดอะไรออก',
  ),
});

// รูปผลลัพธ์ที่ parse ได้จาก Claude (ก่อน post-process)
export interface DirectorAiStep {
  stepOrder: number;
  section: string;
  gestureId: string;
  handId: string;
  cameraId: string;
  lightingId: string;
  durationSec: number;
  reason: string;
}
export interface DirectorAiResult {
  storyboardType: string;
  durationSec: number;
  summary: string;
  baseTemplateId: string;
  steps: DirectorAiStep[];
  reasons: { topic: string; text: string }[];
}
