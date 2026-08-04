// JSON Schemas สำหรับ structured output ของ Phase 4 AI Intelligence
// ข้อจำกัดของ constrained decoding (เหมือน character-draft.schema.ts):
// ทุก object ต้องมี additionalProperties:false + required ครบทุก key
// และห้ามใช้ minLength/maxLength/minimum/maximum/minItems/maxItems

type JsonSchema = Record<string, unknown>;

const str = (description: string): JsonSchema => ({ type: 'string', description });

const int = (description: string): JsonSchema => ({ type: 'integer', description });

const strArray = (description: string): JsonSchema => ({
  type: 'array',
  items: { type: 'string' },
  description,
});

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

// ─── 1. Shot List (v0.1 §12.4 + §13.2) ───────────────────────

export const CAMERA_VALUES = [
  'close_up',
  'medium',
  'wide',
  'over_shoulder',
  'pov',
  'product_close_up',
  'reaction',
  'establishing',
] as const;

export const SHOT_LIST_SCHEMA: JsonSchema = obj({
  shots: arrayOf(
    obj({
      shotNumber: int('ลำดับ shot เริ่มจาก 1'),
      durationSec: int('ความยาว shot เป็นวินาที (1-10 วิ ต่อ shot)'),
      camera: {
        type: 'string',
        enum: [...CAMERA_VALUES],
        description: 'มุมกล้อง',
      },
      action: str('ตัวละครทำอะไรในช็อตนี้ (ภาษาไทย เฉพาะเจาะจง)'),
      dialogue: str('บทพูดในช็อต (ภาษาไทย) — ถ้าไม่มีบทพูดให้เป็น string ว่าง'),
      emotion: str('อารมณ์ของช็อต เช่น ตื่นเต้น ขำ ซึ้ง'),
      characterNames: strArray('ชื่อตัวละครที่อยู่ในช็อต — ใช้ชื่อไทยตรงตามรายชื่อที่ให้เท่านั้น'),
    }),
    'shot breakdown เรียงตามโครงสร้าง Hook 0-3s → Setup → Conflict → Twist → Product tie-in → Punchline → CTA',
  ),
});

// ─── 2. Caption ──────────────────────────────────────────────

export const CAPTION_SCHEMA: JsonSchema = obj({
  caption: str('caption ภาษาไทย ความยาวเหมาะกับ platform ที่ระบุ — ห้ามมี claim ต้องห้ามเด็ดขาด'),
  hashtags: strArray('hashtag 8-15 อัน ผสมไทย/อังกฤษ ใส่ # นำหน้าทุกอัน'),
  cta: str('call-to-action สั้น ๆ ภาษาไทย ชวนทำสิ่งที่สอดคล้องกับ objective'),
});

// ─── 3. Asset QC (vision consistency check) ──────────────────

export const ASSET_QC_SCHEMA: JsonSchema = obj({
  score: int('คะแนนความตรงกับ Visual DNA 1-5 (5 = ตรงมาก)'),
  matches: strArray('จุดที่ภาพตรงกับ Visual DNA spec (ภาษาไทย)'),
  mismatches: strArray('จุดที่ภาพไม่ตรงกับ Visual DNA spec (ภาษาไทย) — ว่างได้ถ้าไม่มี'),
  antiCloneViolations: strArray('จุดที่ละเมิด anti_clone_rules ถ้ามี (ภาษาไทย) — ว่างได้ถ้าไม่มี'),
  verdict: str('สรุปผลตรวจภาษาไทย 1-3 ประโยค พร้อมคำแนะนำ'),
});

// ─── 4. Character Similarity ─────────────────────────────────

export const SIMILARITY_SCHEMA: JsonSchema = obj({
  results: arrayOf(
    obj({
      characterId: str('id ของตัวละครที่นำมาเทียบ — ใช้ค่า id ที่ให้มาเท่านั้น'),
      name: str('ชื่อตัวละครที่นำมาเทียบ'),
      similarityScore: int('คะแนนความคล้าย 0-100 (100 = แทบเหมือนกัน)'),
      overlappingTraits: strArray('จุดที่ทับซ้อนกัน เช่น บุคลิก รูปลักษณ์ สไตล์ภาษา (ภาษาไทย)'),
      riskNote: str('ความเสี่ยง/ข้อแนะนำสั้น ๆ ภาษาไทย'),
    }),
    'ผลเปรียบเทียบครบทุกตัวละครที่ให้มา',
  ),
  summary: str('สรุปภาพรวมความซ้ำภาษาไทย 2-3 ประโยค'),
});

// ─── 5. Weekly Plan ──────────────────────────────────────────

export const WEEKLY_PLAN_SCHEMA: JsonSchema = obj({
  days: arrayOf(
    obj({
      date: str('วันที่ในรูปแบบ YYYY-MM-DD'),
      items: arrayOf(
        obj({
          platform: str('platform เช่น tiktok, facebook_reels, instagram_reels, youtube_shorts, tiktok_shop'),
          characterName: str('ชื่อตัวละครที่แนะนำ — ใช้ชื่อจากรายชื่อ approved characters ที่ให้เท่านั้น'),
          contentIdea: str('ไอเดียคอนเทนต์ภาษาไทย เฉพาะเจาะจง 1-2 ประโยค'),
          rationale: str('เหตุผลที่แนะนำ อิงข้อมูล performance/campaign ที่ให้ (ภาษาไทย)'),
        }),
        'รายการคอนเทนต์แนะนำของวันนั้น 1-3 รายการ',
      ),
    }),
    'แผนรายวัน 7 วัน เริ่มจาก weekStart',
  ),
  planNotes: str('หมายเหตุ/กลยุทธ์ภาพรวมของสัปดาห์ ภาษาไทย'),
});
