// JSON Schemas สำหรับ structured output ของ Series Hub AI (Layer 2)
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

// ─── 1. Series Bible Draft ───────────────────────────────────

export const SERIES_BIBLE_SCHEMA: JsonSchema = obj({
  world_rules: strArray('กฎของโลกในเรื่อง — ข้อละหนึ่งประโยคภาษาไทย เฉพาะเจาะจง'),
  timeline: arrayOf(
    obj({
      when: str('ช่วงเวลา/ลำดับเหตุการณ์ เช่น "S1 EP1", "ก่อนเรื่องเริ่ม 5 ปี"'),
      event: str('เหตุการณ์สำคัญที่เกิดขึ้น (ภาษาไทย)'),
    }),
    'ไทม์ไลน์เหตุการณ์สำคัญของเรื่อง เรียงตามลำดับเวลา',
  ),
  relationships: arrayOf(
    obj({
      pair: str('คู่ตัวละคร เช่น "มีนา × ต้นน้ำ"'),
      status: str('สถานะความสัมพันธ์ปัจจุบัน (ภาษาไทย) เช่น "รักกันแต่ปิดบังครอบครัว"'),
    }),
    'ความสัมพันธ์ระหว่างตัวละครหลัก ณ จุดล่าสุดของเรื่อง',
  ),
  last_cliffhanger: str('cliffhanger ล่าสุดที่ค้างไว้ท้ายตอนล่าสุด (ภาษาไทย) — ว่างได้ถ้ายังไม่มี'),
  notes: str('โน้ตเพิ่มเติมสำหรับทีมเขียนบท เช่น โทนเรื่อง สิ่งที่ห้ามลืม (ภาษาไทย)'),
});

// ─── 2. Continuity Check ─────────────────────────────────────

export const CONTINUITY_CHECK_SCHEMA: JsonSchema = obj({
  issues: arrayOf(
    obj({
      severity: {
        type: 'string',
        enum: ['low', 'medium', 'high'],
        description: 'ความรุนแรงของปัญหา continuity',
      },
      what: str('ปัญหาคืออะไร (ภาษาไทย เฉพาะเจาะจง)'),
      where: str('พบที่ไหนใน script เช่น อ้างฉาก/บทพูด/ช่วงของตอน (ภาษาไทย)'),
      suggestion: str('ข้อเสนอแนะวิธีแก้ (ภาษาไทย)'),
    }),
    'รายการปัญหา continuity ที่พบ — array ว่างได้ถ้าไม่พบปัญหา',
  ),
  relationshipUpdates: arrayOf(
    obj({
      pair: str('คู่ตัวละคร เช่น "มีนา × ต้นน้ำ"'),
      newStatus: str('สถานะความสัมพันธ์ใหม่หลังเหตุการณ์ในตอนนี้ (ภาษาไทย)'),
    }),
    'ความสัมพันธ์ที่เปลี่ยนไปจากตอนนี้ ควรอัปเดตเข้า series bible',
  ),
  cliffhangerSuggestion: str('cliffhanger ท้ายตอนนี้ที่ควรบันทึกเข้า bible (ภาษาไทย)'),
  verdict: str('สรุปผลตรวจภาษาไทย 2-3 ประโยค — ตอนนี้ต่อเนื่องกับเรื่องหรือไม่ ควรแก้อะไรก่อน'),
});

// ─── 3. Next Episode Options ─────────────────────────────────

export const NEXT_EPISODE_SCHEMA: JsonSchema = obj({
  options: arrayOf(
    obj({
      title: str('ชื่อตอน (ภาษาไทย สั้น ดึงดูด)'),
      logline: str('เรื่องย่อหนึ่งย่อหน้าสั้น ๆ ของตอน (ภาษาไทย)'),
      hook: str('Hook 0-3 วินาทีแรกที่ดึงคนดูทันที (ภาษาไทย)'),
      twist: str('จุดหักมุมของตอน (ภาษาไทย)'),
      cta: str('call-to-action ท้ายตอน (ภาษาไทย)'),
      rationale: str('เหตุผลว่าทำไมตอนนี้จะเวิร์ก อิง bible/cliffhanger/performance ที่ให้ (ภาษาไทย)'),
    }),
    'ตัวเลือกตอนถัดไป 3 ทางที่แตกต่างกันชัดเจน — ต้องมี 3 ตัวเลือกเสมอ',
  ),
});
