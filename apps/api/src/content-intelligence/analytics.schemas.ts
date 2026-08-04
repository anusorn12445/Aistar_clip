// JSON Schema สำหรับ structured output ของ Content Analytics (Content Intelligence §4)
// ข้อจำกัด constrained decoding (เหมือน content-intelligence.schemas.ts / affiliate.schemas.ts):
// ทุก object ต้องมี additionalProperties:false + required ครบทุก key
// ห้ามใช้ minLength/maxLength/minimum/maximum/minItems/maxItems
//
// สำคัญ: AI ทำหน้าที่ "ตีความ" ตัวเลขที่คำนวณมาแล้ว (deterministic aggregates) เท่านั้น
// — ตัวเลข/อันดับทั้งหมดมาจาก AnalyticsService.computeAggregates ไม่ใช่จาก AI

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

// ─── §4 Content Analytics — สังเคราะห์ insight จาก aggregates ที่คำนวณมาแล้ว ──
export const INSIGHT_SYNTHESIS_SCHEMA: JsonSchema = obj({
  summary: str('สรุปภาพรวม insight สั้น 2-4 ประโยค ภาษาไทย อ่านง่าย — ตีความจากตัวเลขที่ให้'),
  patterns: arrayOf(
    obj({
      signal: str('รูปแบบ/สัญญาณที่พบ ภาษาไทย เช่น "ฟอร์แมต short_video ทำยอดวิวสูงกว่าฟอร์แมตอื่นชัดเจน"'),
      evidence: str('หลักฐานเชิงตัวเลขที่อ้างอิงจาก aggregates ที่ให้มา (ห้ามแต่งตัวเลขเอง)'),
      metric: str('ตัวชี้วัดหลักที่ใช้ยืนยัน pattern นี้ เช่น views, gmv, ctr, completionRate, roas'),
    }),
    'รายการ pattern ที่ตีความได้จาก aggregates (เรียงจากมีนัยสำคัญมากสุด)',
  ),
  recommendations: arrayOf(
    obj({
      action: str('คำแนะนำที่ลงมือทำได้จริง ภาษาไทย — บอกว่าควรทำคอนเทนต์แบบไหนต่อ'),
      rationale: str('เหตุผลอ้างอิงจาก pattern/ตัวเลขที่พบ ภาษาไทย'),
      targetPlatform: str('แพลตฟอร์มที่ควรโฟกัสสำหรับคำแนะนำนี้ (ถ้าไม่เจาะจงให้เป็น string ว่าง)'),
    }),
    'คำแนะนำเชิงปฏิบัติที่ป้อนกลับเข้าระบบคิดคอนเทนต์ (System 2)',
  ),
  bestHook: str('hook/แนวเปิดที่ได้ผลดีที่สุดจากข้อมูล ภาษาไทย (ถ้าข้อมูลไม่พอให้เป็น string ว่าง)'),
  bestFormat: str('ฟอร์แมตที่ได้ผลดีที่สุด เช่น short_video, live (ถ้าข้อมูลไม่พอให้เป็น string ว่าง)'),
  bestCharacter: str('ตัวละคร/พรีเซนเตอร์ที่ทำผลงานดีที่สุด ภาษาไทย (ถ้าข้อมูลไม่พอให้เป็น string ว่าง)'),
  bestTime: str('ช่วงเวลา/วันที่โพสต์แล้วได้ผลดีที่สุด ภาษาไทย (ถ้าข้อมูลไม่พอให้เป็น string ว่าง)'),
});
