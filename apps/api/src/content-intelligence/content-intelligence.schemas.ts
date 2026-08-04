// JSON Schema สำหรับ structured output ของ Content Intelligence (ระบบ 2 + 2.1)
// ข้อจำกัดของ constrained decoding (เหมือน affiliate.schemas.ts / phase4.schemas.ts):
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

// ─── 2.1 Customer Voice — จัด sentiment + แตก theme ต่อ feedback 1 ก้อน ──
export const SENTIMENT_VALUES = ['positive', 'negative', 'neutral'] as const;

export const FEEDBACK_CLASSIFY_SCHEMA: JsonSchema = obj({
  sentiment: {
    type: 'string',
    enum: [...SENTIMENT_VALUES],
    description: 'อารมณ์รวมของ feedback: positive=ชื่นชม/พอใจ, negative=บ่น/ไม่พอใจ, neutral=ถาม/กลาง ๆ',
  },
  themes: strArray(
    'ประเด็นสั้น ๆ ภาษาไทย 1-4 ป้าย เช่น "บ่นราคา","ถามวิธีใช้","อยากได้สีใหม่","ชมพรีเซนเตอร์" — คำสั้น กระชับ ใช้ซ้ำได้ (ไม่ใช่ประโยคยาว)',
  ),
});

// ─── 2.1b Customer Review Capture — แตกก้อนรีวิว Shopee ที่วางมา เป็นรีวิวรายตัว + ดาว + gem ──
export const REVIEW_EXTRACT_SCHEMA: JsonSchema = obj({
  reviews: arrayOf(
    obj({
      text: str('ข้อความรีวิวเต็ม 1 รีวิว (คงคำพูดลูกค้าตามต้นฉบับ ตัดชื่อผู้ใช้/วันที่/ตัวเลือกสินค้า/ข้อความ UI ทิ้ง)'),
      rating: {
        type: 'integer',
        description: 'คะแนนดาวของรีวิวนี้ 1-5 ตามที่ระบุในข้อความ — ถ้าไม่เห็นดาวชัดเจนให้เป็น 0 (ห้ามเดา)',
      },
      gem: str('ประเด็นเด็ด/คำคมสั้น ๆ จากรีวิวนี้ที่เอาไปทำ hook คลิปได้ (ภาษาไทย สั้น กระชับ) — ไม่มีให้เป็น string ว่าง'),
      sentiment: {
        type: 'string',
        enum: [...SENTIMENT_VALUES],
        description: 'อารมณ์รวมของรีวิวนี้: positive=ชื่นชม/พอใจ, negative=บ่น/ไม่พอใจ, neutral=กลาง ๆ',
      },
    }),
    'รายการรีวิวรายตัวที่แยกออกจากก้อนข้อความ (เรียงตามลำดับที่ปรากฏ)',
  ),
});

// ─── 2 + 2.0 AI Ideation — ชุดไอเดียคอนเทนต์ ──
export const IDEATION_SCHEMA: JsonSchema = obj({
  ideas: arrayOf(
    obj({
      title: str('ชื่อไอเดียสั้น ๆ ภาษาไทย'),
      hook: str('ประโยคเปิด 0-3 วิ ที่หยุดนิ้วคนเลื่อน (scroll-stopping) ภาษาไทย'),
      angle: str('มุมเล่า/แนวคิดหลักของคอนเทนต์นี้ ภาษาไทย'),
      platform: str('แพลตฟอร์มที่เหมาะสุด เช่น tiktok, facebook_reels, instagram_reels, youtube_shorts'),
      format: str('ฟอร์แมต เช่น short_video, live, image_post, article'),
      contentType: str('ประเภทคอนเทนต์ เช่น drama, review, tie_in, vlog, meme, howto'),
      characterHint: str('ตัวละคร/พรีเซนเตอร์ที่แนะนำ (ภาษาไทย) — ถ้าไม่เจาะจงให้เป็น string ว่าง'),
      productHint: str('สินค้าที่ควรผูก (ภาษาไทย) — ถ้าไม่เจาะจงให้เป็น string ว่าง'),
      captionDirection: str('แนวทางแคปชั่น/โทนการเขียน ภาษาไทย (ยังไม่ต้องเขียนแคปชั่นเต็ม)'),
      rationale: str('เหตุผลว่าทำไมไอเดียนี้ถึงน่าจะเวิร์ค ภาษาไทย — อ้างอิง context ที่ให้'),
      sourceSignals: strArray(
        'สัญญาณ/อินพุตที่จุดประกายไอเดียนี้ เช่น "customer theme: บ่นราคา","performance: hook สายดราม่าเวิร์ค","seed","brand USP" — ระบุที่มาจริงจาก context',
      ),
    }),
    'รายการไอเดียคอนเทนต์ (จำนวนตามที่ขอ) เรียงจากที่แนะนำมากสุด',
  ),
});
