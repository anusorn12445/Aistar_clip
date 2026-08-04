// UGC Studio v2 — JSON Schemas สำหรับ structured output (concepts + plan)
// ข้อจำกัด constrained decoding เหมือน affiliate.schemas.ts:
// object ทุกตัวต้องมี additionalProperties:false + required ครบทุก key, ห้าม min/max

type JsonSchema = Record<string, unknown>;

const str = (description: string): JsonSchema => ({ type: 'string', description });

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

// ── คอนเซปต์ 3 แบบ (ทุก field ต้องมี emoji ตามกติกาใน system prompt) ──
export const UGC_CONCEPTS_SCHEMA: JsonSchema = obj({
  concepts: arrayOf(
    obj({
      name: str('ชื่อคอนเซปต์ ภาษาไทย — ขึ้นต้นด้วย emoji ธีมของแนวนี้ เช่น "📦 แกะกล่องแล้วอบเลย"'),
      fit: str('เหมาะกับใคร — ขึ้นต้นด้วย "🎯 เหมาะกับ:" เช่น "🎯 เหมาะกับ: คนเพิ่งรู้จักสินค้า"'),
      flow: str(
        'ลำดับการเล่าย่อ ทุก step มี emoji นำ คั่นด้วย " → " เช่น "👋 เปิดหัว → 📦 แกะกล่อง → 🛒 ปิดขาย"',
      ),
      highlight: str('จุดเด่นของแนวนี้ — ขึ้นต้นด้วย "💡 จุดเด่น:"'),
    }),
    'คอนเซปต์คลิป 3 แบบ แนวต่างกันชัดเจน',
  ),
});

export interface UgcConcept {
  name: string;
  fit: string;
  flow: string;
  highlight: string;
}

export interface UgcConceptsResult {
  concepts: UgcConcept[];
}

// ── แผนคลิป (storyboard v2) ──
export const UGC_SCENE_SECTIONS = [
  'hook',
  'reveal',
  'interaction',
  'demonstration',
  'result',
  'cta',
] as const;

// screen (v2.1) = capture หน้าจอจริง — ใช้เฉพาะงานรีวิวซอฟต์แวร์ (service กัน job อื่นด้วย normalize/400)
export const UGC_SCENE_TYPES = ['presenter', 'hands', 'product_only', 'screen'] as const;

export const UGC_PLAN_SCHEMA: JsonSchema = obj({
  headline: str('คำพาดหัวหลักของฉากเปิด ภาษาไทย สั้น กระแทก (ข้อความขึ้นจอ — ใส่ตอนตัดต่อ)'),
  script: str('สคริปต์พูดรวมทั้งคลิป ภาษาไทย (รวมประโยคปิดตาม CTA ที่กำหนด)'),
  caption: str('caption พร้อมโพสต์ ภาษาไทย โทนเป็นกันเอง มีอีโมจิพอดี'),
  hashtags: {
    type: 'array',
    items: { type: 'string' },
    description: 'hashtag 8-15 อัน ผสมไทย/อังกฤษ ใส่ # นำหน้าทุกอัน',
  },
  scenes: arrayOf(
    obj({
      section: {
        type: 'string',
        enum: [...UGC_SCENE_SECTIONS],
        description: 'ช่วงการเล่า: hook เปิด, cta ปิด, ระหว่างทางใช้ reveal/interaction/demonstration/result',
      },
      sceneType: {
        type: 'string',
        enum: [...UGC_SCENE_TYPES],
        description:
          'ประเภทฉาก: presenter = มีตัวละครหันหน้าเข้ากล้อง | hands = เห็นแค่มือ | product_only = ไม่มีคน/มือ/เงาคน | screen = capture หน้าจอจริง (เฉพาะงานรีวิวซอฟต์แวร์เท่านั้น)',
      },
      title: str('ชื่อฉากภาษาไทยตามสูตรรีวิว เช่น "แกะกล่อง", "เปิดประตูห้อง"'),
      cameraNote: str('มุมกล้อง/การเคลื่อนกล้องของฉากนี้ (ห้ามซ้ำมุมกับฉากอื่น) เช่น "POV overhead · โต๊ะไม้"'),
      durationSec: { type: 'number', description: 'ความยาวฉาก (วินาที) — ใส่ตามตัวเลขในกติกาเหล็กของ system prompt เท่ากันทุกฉาก' },
      dialogue: str('บทพูดภาษาไทยของฉากนี้ — ความยาวตามงบพยางค์ใน "กติกาเหล็ก" ของ system prompt เท่านั้น (ห้ามเกินงบ และควรเขียนให้เต็มอิ่มใกล้งบ ไม่ใช่ประโยคสั้นจ๋อย) โทนจริงใจแบบคนรีวิวจริง'),
      onScreenText: str('ข้อความขึ้นจอ 1-4 คำ ภาษาไทย (ใส่ตอนตัดต่อ)'),
      reason: str('เหตุผลสั้น ๆ ว่าฉากนี้ทำหน้าที่อะไรในการเล่า'),
      // v2.1 — ใบสั่ง Capture (เฉพาะฉาก sceneType=screen — ฉากอื่นใส่ค่าว่าง "")
      capturePage: str('เฉพาะฉาก screen: เปิดหน้าไหนของระบบ เช่น "GoSell > ออเดอร์ > รอแพ็ค" — ฉากอื่นใส่ ""'),
      captureAction: str('เฉพาะฉาก screen: ต้องคลิก/ทำอะไรให้เห็น เช่น "กดปุ่มพิมพ์ใบปะหน้าทั้งหมด" — ฉากอื่นใส่ ""'),
      captureZoom: str('เฉพาะฉาก screen: ซูม/ไฮไลต์ตรงไหน เช่น "ซูมปุ่มมุมขวาบน + ตัวเลขจำนวนออเดอร์" — ฉากอื่นใส่ ""'),
      captureExpect: str('เฉพาะฉาก screen: ผลลัพธ์ที่ต้องเห็นบนจอ เช่น "ใบปะหน้า 50 ใบถูกสร้างในคลิกเดียว" — ฉากอื่นใส่ ""'),
      captureEditNote: str('เฉพาะฉาก screen: โน้ตตัดต่อ เช่น "เร่ง speed 1.5x ช่วงโหลด" — ฉากอื่นใส่ ""'),
    }),
    'ฉากทั้งหมดเรียงตามลำดับการเล่า ตามจำนวนที่กำหนดในกติกา',
  ),
});

export interface UgcPlanScene {
  section: string;
  sceneType: string;
  title: string;
  cameraNote: string;
  durationSec: number;
  dialogue: string;
  onScreenText: string;
  reason: string;
  // v2.1 — ใบสั่ง Capture ต่อฉาก screen (optional: แผนเก่า/stub ที่ไม่มี field ยังอ่านได้)
  capturePage?: string;
  captureAction?: string;
  captureZoom?: string;
  captureExpect?: string;
  captureEditNote?: string;
}

export interface UgcPlanResult {
  headline: string;
  script: string;
  caption: string;
  hashtags: string[];
  scenes: UgcPlanScene[];
}
