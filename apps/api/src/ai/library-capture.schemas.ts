// JSON Schemas สำหรับ External Capture ของคลัง production (Location / Gesture / Camera / Lighting / Hand)
// ข้อจำกัดของ constrained decoding (เหมือน capture.schemas.ts / character-capture.schema.ts):
// ทุก object ต้องมี additionalProperties:false + required ครบทุก key
// และห้ามใช้ minLength/maxLength/minimum/maximum/minItems/maxItems
// → field "optional" จึงเป็น string ที่ปล่อยว่าง ('') แทน และตัวเลขส่งเป็น string ("2.5")
//   เพื่อ map ตรงเข้าฟอร์มรีวิวฝั่ง web (ฟอร์มเก็บตัวเลขเป็น string อยู่แล้ว)

type JsonSchema = Record<string, unknown>;

const str = (description: string): JsonSchema => ({ type: 'string', description });
const strArr = (description: string): JsonSchema => ({
  type: 'array',
  items: { type: 'string' },
  description,
});
const strEnum = (values: readonly string[], description: string): JsonSchema => ({
  type: 'string',
  enum: [...values],
  description,
});

export const CAPTURE_CONFIDENCE_VALUES = ['high', 'medium', 'low'] as const;
export type CaptureConfidence = (typeof CAPTURE_CONFIDENCE_VALUES)[number];

// targetType ที่รองรับ — ตรงกับคลังที่มีหน้า create อยู่แล้ว
export const LIBRARY_CAPTURE_TARGETS = [
  'location',
  'gesture',
  'camera_preset',
  'lighting_preset',
  'hand',
] as const;
export type LibraryCaptureTarget = (typeof LIBRARY_CAPTURE_TARGETS)[number];

// ProductState keys ที่ seed ไว้ — gesture required/resulting ใช้ได้เฉพาะชุดนี้ (หรือเว้นว่าง)
export const PRODUCT_STATE_KEYS = [
  'sealed',
  'opened',
  'cap_removed',
  'in_use',
  'partially_used',
  'result',
  'empty',
] as const;

const confidenceProp: JsonSchema = strEnum(
  CAPTURE_CONFIDENCE_VALUES,
  'ความมั่นใจว่าแตกฟิลด์ถูก: high = ข้อมูลครบชัดเจน, medium = ต้องเดาบางส่วน, low = ข้อมูลน้อย/กำกวมมาก',
);
const notesProp: JsonSchema = str(
  'สิ่งที่ AI ไม่แน่ใจหรืออยากให้คนตรวจก่อนบันทึก (ภาษาไทย) — ไม่มีให้เป็น string ว่าง',
);

// helper ประกอบ schema: เติม confidence+notes + required ทุก key + additionalProperties:false
function buildSchema(properties: Record<string, JsonSchema>): JsonSchema {
  const all = { ...properties, confidence: confidenceProp, notes: notesProp };
  return {
    type: 'object',
    properties: all,
    required: Object.keys(all),
    additionalProperties: false,
  };
}

// ─── Location (PRD §14 — คุม continuity ของฉากข้าม EP) ─────────────────────
const LOCATION_SCHEMA = buildSchema({
  name: str('ชื่อ location สั้น ๆ สื่อความหมาย (ไทย) เช่น "คาเฟ่ริมคลองย่านเก่า"'),
  type: str('ประเภทฉาก เช่น คาเฟ่ / ครัว / ริมทะเล / สตูดิโอ — ไม่รู้ให้เว้นว่าง'),
  regionStyle: str('สไตล์ภูมิภาค เช่น ไทยโมเดิร์น / มินิมอลญี่ปุ่น — ไม่รู้ให้เว้นว่าง'),
  mood: str('อารมณ์ของฉาก เช่น อบอุ่น สดใส — ไม่รู้ให้เว้นว่าง'),
  lighting: str('ลักษณะแสงของฉาก เช่น soft window light — ไม่รู้ให้เว้นว่าง'),
  timeOfDay: str('ช่วงเวลา เช่น golden hour / กลางวัน / กลางคืน — ไม่รู้ให้เว้นว่าง'),
  prompt: str(
    'generation prompt ของฉาก — ถ้าในข้อความมี prompt จริงให้คงของจริงไว้ (ภาษาเดิม ส่วนใหญ่อังกฤษ) ห้ามแต่งใหม่แทน ถ้าไม่มีให้สรุปจากหลักฐานที่เห็นเท่านั้น',
  ),
  negativePrompt: str('negative prompt ถ้าระบุมา — ไม่มีให้เป็น string ว่าง'),
  continuityNotes: str(
    'รายละเอียดที่ต้องเหมือนเดิมทุก EP เช่น เฟอร์นิเจอร์/พร็อพ/ตำแหน่งของ — เก็บจากหลักฐานเท่านั้น',
  ),
});

// ─── Gesture (SRS §3.3 — ท่าทางมือกับสินค้า) ────────────────────────────────
const GESTURE_SCHEMA = buildSchema({
  name: str('ชื่อท่า (ไทย) เช่น "เทครีมลงฝ่ามือ"'),
  key: str('key ภาษาอังกฤษ snake_case เช่น pour_cream — ไม่แน่ใจให้เว้นว่าง'),
  category: str('หมวดท่า เช่น hold / pour / apply / open / spray — ไม่รู้ให้เว้นว่าง'),
  description: str('คำอธิบายท่า (ไทย) — ไม่รู้ให้เว้นว่าง'),
  naturalDurationSec: str('ระยะเวลาธรรมชาติของท่า (วินาที) เป็นตัวเลขในรูป string เช่น "2.5" — ไม่รู้ให้เว้นว่าง'),
  minDurationSec: str('ระยะเวลาสั้นสุด (วินาที) string ตัวเลข — ไม่รู้ให้เว้นว่าง'),
  maxDurationSec: str('ระยะเวลายาวสุด (วินาที) string ตัวเลข — ไม่รู้ให้เว้นว่าง'),
  minSpeedMultiplier: str('ตัวคูณความเร็วต่ำสุด string ตัวเลข เช่น "0.5" — ไม่รู้ให้เว้นว่าง'),
  maxSpeedMultiplier: str('ตัวคูณความเร็วสูงสุด string ตัวเลข เช่น "1.5" — ไม่รู้ให้เว้นว่าง'),
  requiredHandCount: str('จำนวนมือที่ต้องใช้ ("1" หรือ "2") — ไม่รู้ให้เว้นว่าง'),
  requiredProductState: strEnum(
    ['', ...PRODUCT_STATE_KEYS],
    `สถานะสินค้าที่ต้องเป็นก่อนทำท่า — ใช้ได้เฉพาะ: ${PRODUCT_STATE_KEYS.join(', ')} ถ้าไม่ชัดให้เว้นว่าง`,
  ),
  resultingProductState: strEnum(
    ['', ...PRODUCT_STATE_KEYS],
    `สถานะสินค้าหลังทำท่า — ใช้ได้เฉพาะ: ${PRODUCT_STATE_KEYS.join(', ')} ถ้าไม่ชัดให้เว้นว่าง`,
  ),
  compatiblePackaging: strArr('แพ็กเกจที่รองรับ เช่น bottle, tube, jar — ไม่รู้ให้เป็น array ว่าง'),
  compatibleMaterial: strArr('วัสดุที่รองรับ เช่น glass, plastic — ไม่รู้ให้เป็น array ว่าง'),
  riskLevel: strEnum(
    ['low', 'medium', 'high'],
    'ความเสี่ยงที่ AI จะ gen มือเพี้ยนตอนทำท่านี้ (นิ้วเยอะ/ทะลุวัตถุ) — ไม่ชัดให้ low',
  ),
  promptTemplate: str('prompt template ของท่า (อังกฤษ) — ถ้ามีของจริงในข้อความให้คงไว้ ไม่มีให้เว้นว่าง'),
  negativePrompt: str('negative prompt ถ้าระบุมา — ไม่มีให้เป็น string ว่าง'),
});

// ─── Camera preset (SRS §3.6) ───────────────────────────────────────────────
const CAMERA_SCHEMA = buildSchema({
  name: str('ชื่อมุมกล้อง (ไทยหรืออังกฤษ) เช่น "มาโครเห็นเนื้อครีม"'),
  key: str('key ภาษาอังกฤษ snake_case เช่น macro_product — ไม่แน่ใจให้เว้นว่าง'),
  description: str('คำอธิบายมุมกล้อง (ไทย) — ไม่รู้ให้เว้นว่าง'),
  shotSize: str('ขนาดช็อต ศัพท์มาตรฐานอังกฤษ เช่น extreme_closeup / closeup / medium / wide — ไม่รู้ให้เว้นว่าง'),
  angle: str('มุมกล้อง เช่น eye-level / high / low / top-down / 45deg — ไม่รู้ให้เว้นว่าง'),
  lens: str('เลนส์ เช่น macro / 85mm portrait — ไม่รู้ให้เว้นว่าง'),
  focalLength: str('ทางยาวโฟกัส เช่น 50mm — ไม่รู้ให้เว้นว่าง'),
  cameraMovement: str('การเคลื่อนกล้อง เช่น static / pan / tilt / orbit / dolly / handheld — ไม่รู้ให้เว้นว่าง'),
  movementSpeed: str('ความเร็วการเคลื่อน เช่น slow / medium / fast — ไม่รู้ให้เว้นว่าง'),
  distance: str('ระยะกล้องถึงตัวแบบ เช่น 30cm / arm-length — ไม่รู้ให้เว้นว่าง'),
  focusTarget: str('จุดโฟกัส เช่น product / face / hands — ไม่รู้ให้เว้นว่าง'),
  depthOfField: str('ความชัดลึก เช่น shallow / deep — ไม่รู้ให้เว้นว่าง'),
  stabilization: str('การกันสั่น เช่น tripod / gimbal / handheld — ไม่รู้ให้เว้นว่าง'),
  aspectRatio: str('อัตราส่วนภาพ เช่น 9:16 / 16:9 / 1:1 — ไม่รู้ให้เว้นว่าง'),
  safeArea: str('พื้นที่ปลอดภัยสำหรับ text/UI overlay — ไม่รู้ให้เว้นว่าง'),
  productVisibility: strEnum(
    ['', 'required', 'optional', 'hero'],
    'การมองเห็นสินค้าในเฟรม — ไม่ชัดให้เว้นว่าง',
  ),
  handVisibility: strEnum(
    ['', 'required', 'optional', 'hidden'],
    'การมองเห็นมือในเฟรม — ไม่ชัดให้เว้นว่าง',
  ),
  compatiblePackaging: strArr('แพ็กเกจที่เหมาะกับมุมนี้ เช่น bottle, pump — ไม่รู้ให้เป็น array ว่าง'),
  promptTemplate: str('prompt template ของมุมกล้อง (อังกฤษ) — ถ้ามีของจริงให้คงไว้ ไม่มีให้เว้นว่าง'),
  negativePrompt: str('negative prompt ถ้าระบุมา — ไม่มีให้เป็น string ว่าง'),
});

// ─── Lighting preset (SRS §3.7) ─────────────────────────────────────────────
const LIGHTING_SCHEMA = buildSchema({
  name: str('ชื่อ preset แสง (ไทยหรืออังกฤษ) เช่น "Golden hour อุ่นนุ่ม"'),
  key: str('key ภาษาอังกฤษ snake_case เช่น golden_hour_warm — ไม่แน่ใจให้เว้นว่าง'),
  description: str('คำอธิบายแสง (ไทย) — ไม่รู้ให้เว้นว่าง'),
  keyLight: str('ไฟหลัก เช่น soft window light จากซ้าย 45° — ไม่รู้ให้เว้นว่าง'),
  fillLight: str('ไฟเสริม เช่น bounce ขวา ratio 1:2 — ไม่รู้ให้เว้นว่าง'),
  backLight: str('ไฟหลัง/rim เช่น warm rim จากหลังซ้าย — ไม่รู้ให้เว้นว่าง'),
  colorTemperature: str('อุณหภูมิสี เช่น 3200K warm / 5600K daylight — ไม่รู้ให้เว้นว่าง'),
  contrast: str('ระดับ contrast เช่น low / medium / high — ไม่รู้ให้เว้นว่าง'),
  shadowLevel: str('ระดับเงา เช่น soft / medium / hard — ไม่รู้ให้เว้นว่าง'),
  highlightControl: str('การคุม highlight เช่น diffused, no blown highlights — ไม่รู้ให้เว้นว่าง'),
  reflectiveProductRule: str(
    'กฎจัดแสงเมื่อสินค้าผิวสะท้อน (ขวดแก้ว/โลหะ) เช่น ใช้ diffuser กันแสงแฟลร์ — ใส่เมื่อมีหลักฐานเท่านั้น',
  ),
  transparentProductRule: str(
    'กฎจัดแสงเมื่อสินค้าโปร่งใส เช่น backlight เน้นเนื้อสินค้า — ใส่เมื่อมีหลักฐานเท่านั้น',
  ),
  skinToneCompatibility: strArr('โทนผิวที่เข้ากับแสงนี้ เช่น fair, tan — ไม่รู้ให้เป็น array ว่าง'),
  backgroundCompatibility: strArr('พื้นหลังที่เข้ากัน เช่น cream, wood — ไม่รู้ให้เป็น array ว่าง'),
  mood: str('อารมณ์ของแสง เช่น อบอุ่น / หรูหรา / สดชื่น — ไม่รู้ให้เว้นว่าง'),
  promptTemplate: str('prompt template ของแสง (อังกฤษ) — ถ้ามีของจริงให้คงไว้ ไม่มีให้เว้นว่าง'),
  negativePrompt: str('negative prompt ถ้าระบุมา — ไม่มีให้เป็น string ว่าง'),
});

// ─── Hand profile (SRS §3.2 — รวม child-hand compliance §3.2.2) ─────────────
const HAND_SCHEMA = buildSchema({
  name: str('ชื่อโปรไฟล์มือ (ไทย) เช่น "มือผู้หญิงวัยทำงาน เล็บเจลนู้ด"'),
  category: str(
    'หมวดมือ เช่น adult_female, adult_male, child, elderly, teen, professional, working — ไม่ตรงชุดนี้ให้ใช้ custom',
  ),
  gender: str('เพศ เช่น female / male — ไม่รู้ให้เว้นว่าง'),
  ageGroup: str('ช่วงวัย เช่น 25-35 — ไม่รู้ให้เว้นว่าง'),
  skinTone: str('โทนผิว เช่น ผิวสองสี / fair / tan — ไม่รู้ให้เว้นว่าง'),
  handSize: str('ขนาดมือ เช่น small / medium / large — ไม่รู้ให้เว้นว่าง'),
  fingerLength: str('ความยาวนิ้ว เช่น slender long — ไม่รู้ให้เว้นว่าง'),
  nailLength: str('ความยาวเล็บ เช่น short / medium / long — ไม่รู้ให้เว้นว่าง'),
  nailShape: str('ทรงเล็บ เช่น almond / square / oval — ไม่รู้ให้เว้นว่าง'),
  nailColor: str('สีเล็บ เช่น nude pink — ไม่รู้ให้เว้นว่าง'),
  nailStyle: str('สไตล์เล็บ เช่น เจลเรียบ / french tip — ไม่รู้ให้เว้นว่าง'),
  accessories: strArr('เครื่องประดับบนมือ เช่น แหวนเงินเรียบ — เห็นจริงเท่านั้น ไม่มีให้เป็น array ว่าง'),
  sleeveStyle: str('แขนเสื้อที่เห็น เช่น แขนยาวสีครีม — ไม่รู้ให้เว้นว่าง'),
  skinTexture: str('ผิวสัมผัส เช่น smooth / มีร่องรอยทำงาน — ไม่รู้ให้เว้นว่าง'),
  dominantHand: str('มือข้างถนัดที่ใช้ในภาพ (left / right) — ไม่รู้ให้เว้นว่าง'),
  allowedGestures: strArr('ท่าที่เหมาะกับมือนี้ (gesture key) — ไม่รู้ให้เป็น array ว่าง'),
  restrictedGestures: strArr('ท่าที่ห้ามใช้กับมือนี้ (gesture key) — ไม่รู้ให้เป็น array ว่าง'),
  productCategorySuitability: strArr('หมวดสินค้าที่เหมาะ เช่น beauty, food — ไม่รู้ให้เป็น array ว่าง'),
  isChild: {
    type: 'boolean',
    description:
      'true เมื่อประเมินว่าเป็นมือเด็ก (ต้องผ่าน compliance ก่อนใช้) — ไม่แน่ใจแต่มีเค้าว่าเด็กให้ true',
  },
  policyFlag: str('ธง policy เช่น child_supervision_required — ไม่มีให้เว้นว่าง'),
});

export const LIBRARY_CAPTURE_SCHEMAS: Record<LibraryCaptureTarget, JsonSchema> = {
  location: LOCATION_SCHEMA,
  gesture: GESTURE_SCHEMA,
  camera_preset: CAMERA_SCHEMA,
  lighting_preset: LIGHTING_SCHEMA,
  hand: HAND_SCHEMA,
};

// ผลลัพธ์ดิบจาก Claude — ฟิลด์ตาม schema ของ targetType + confidence + notes (flat)
export type LibraryCaptureRaw = Record<string, unknown> & {
  confidence?: string;
  notes?: string;
};
