// JSON Schema สำหรับ structured output ของ Affiliate Content Factory
// ข้อจำกัดของ constrained decoding (เหมือน phase4.schemas.ts):
// ทุก object ต้องมี additionalProperties:false + required ครบทุก key
// และห้ามใช้ minLength/maxLength/minimum/maximum/minItems/maxItems

type JsonSchema = Record<string, unknown>;

const str = (description: string): JsonSchema => ({ type: 'string', description });

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

// มุมกล้อง (reuse ชุดเดียวกับ shot-list เพื่อความสม่ำเสมอ)
export const AFFILIATE_CAMERA_VALUES = [
  'close_up',
  'medium',
  'wide',
  'over_shoulder',
  'pov',
  'product_close_up',
  'reaction',
  'establishing',
] as const;

// ผลลัพธ์ต่อสินค้า: สคริปต์รีวิว + shot list + caption + hashtags
export const AFFILIATE_REVIEW_SCHEMA: JsonSchema = obj({
  hook: str('ประโยคเปิด 0-3 วิ ที่หยุดนิ้วคนเลื่อน (scroll-stopping) ภาษาไทย'),
  body: str('เนื้อรีวิวหลัก ภาษาไทย — จุดเด่น/ประโยชน์ที่จับต้องได้ โทนจริงใจ ไม่เว่อร์'),
  cta: str('call-to-action สั้น ๆ ชวนกดลิงก์ affiliate ภาษาไทย'),
  shots: arrayOf(
    obj({
      scene: str('ชื่อ/สรุปฉากสั้น ๆ เช่น "แกะกล่อง", "โชว์เนื้อสัมผัส" (ภาษาไทย)'),
      camera: {
        type: 'string',
        enum: [...AFFILIATE_CAMERA_VALUES],
        description: 'มุมกล้อง',
      },
      action: str('คนถ่ายต้องทำ/ถ่ายอะไรในช็อตนี้ (ภาษาไทย เฉพาะเจาะจง)'),
      dialogue: str('บทพูด/แคปชั่นในช็อต (ภาษาไทย) — ถ้าไม่มีให้เป็น string ว่าง'),
    }),
    'shot list สำหรับถ่ายคลิปรีวิว 5-8 ช็อต เรียงตามลำดับการเล่า',
  ),
  caption: str('caption พร้อมโพสต์ Facebook ภาษาไทย — ห้ามมี claim ต้องห้ามเด็ดขาด'),
  hashtags: strArray('hashtag 8-15 อัน ผสมไทย/อังกฤษ + niche ของสินค้า ใส่ # นำหน้าทุกอัน'),
});
