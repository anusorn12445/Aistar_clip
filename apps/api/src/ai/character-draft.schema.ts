// JSON Schema สำหรับ structured output ของ AI Character Wizard (addendum §H)
// ข้อจำกัดของ constrained decoding: ทุก object ต้องมี additionalProperties:false + required ครบทุก key
// และห้ามใช้ minLength/maxLength/minimum/maximum

export const DRAFT_SECTIONS = [
  'persona',
  'visualDna',
  'commerceProfile',
  'voiceProfile',
] as const;

export type DraftSection = (typeof DRAFT_SECTIONS)[number];

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

export const PERSONA_SCHEMA = obj(
  {
    one_line_concept: str('คอนเซปต์ตัวละครหนึ่งบรรทัด (ภาษาไทย)'),
    short_bio: str('ประวัติย่อ 2-3 ประโยค'),
    backstory: str('ปูมหลังของตัวละคร 1-2 ย่อหน้า'),
    personality: strArray('ลักษณะนิสัยเด่น 4-6 ข้อ'),
    dream: str('ความฝันของตัวละคร'),
    motivation: str('แรงผลักดันหลัก'),
    weakness: str('จุดอ่อน'),
    fear: str('สิ่งที่กลัว'),
    humor_style: str('สไตล์อารมณ์ขัน'),
    language_style: str('สไตล์ภาษาที่ใช้พูด เช่น สรรพนาม คำลงท้าย ระดับภาษา'),
    catchphrases: strArray('วลีติดปาก 3-5 วลี'),
  },
  'Persona — บุคลิกและตัวตนของตัวละคร',
);

export const VISUAL_DNA_SCHEMA = obj(
  {
    face_shape: str('รูปหน้า'),
    eyes: str('ลักษณะดวงตา'),
    eyebrows: str('ลักษณะคิ้ว'),
    nose: str('ลักษณะจมูก'),
    lips: str('ลักษณะริมฝีปาก'),
    skin_tone: str('โทนสีผิว'),
    distinctive_features: strArray('จุดเด่นเฉพาะตัวบนใบหน้า/ร่างกาย (เช่น ไฝ ลักยิ้ม) 2-4 ข้อ'),
    body_type: str('รูปร่าง'),
    height_impression: str('ความสูงโดยประมาณ/ความรู้สึกด้านส่วนสูง'),
    posture: str('บุคลิกท่าทาง การวางตัว'),
    hair_style: str('ทรงผมและสีผม'),
    makeup_style: str('สไตล์การแต่งหน้า'),
    fashion_style: str('สไตล์การแต่งตัว'),
    color_palette: strArray('โทนสีประจำตัว 3-5 สี'),
    ethnicity: str(
      "เชื้อชาติ/สัญชาติ + ลักษณะเชื้อชาติ เช่น 'ไทย, ลักษณะเอเชียตะวันออกเฉียงใต้' — default เป็นไทย/เอเชียตะวันออกเฉียงใต้ เว้นแต่ region/เรื่องราวบ่งชี้เป็นอย่างอื่น",
    ),
    shot_type: str('ประเภทช็อต เช่น portrait ครึ่งตัว เต็มตัว (default portrait)'),
    camera_angle: str('มุมกล้อง เช่น eye-level, three-quarter'),
    lens: str('เลนส์/ทางยาวโฟกัส เช่น 85mm portrait lens'),
    depth_of_field: str('ระยะชัด เช่น shallow depth of field, blurred background'),
    lighting: str('การจัดแสง เช่น soft studio lighting, golden hour'),
    background_setting: str('ฉากหลัง/สถานที่'),
    art_style: str('สไตล์ภาพ เช่น photorealistic, cinematic (default photorealistic)'),
    color_grade: str('การเกรดสี/โทนภาพ เช่น warm cinematic grade'),
    mood: str('อารมณ์ภาพรวมของภาพ'),
    aspect_ratio: str("อัตราส่วนภาพ เช่น '3:4' (default 3:4 แนวตั้ง)"),
    quality_tags: strArray('quality tags สำหรับ image gen เช่น 8k, sharp focus, high detail'),
    anti_clone_rules: strArray(
      'กฎกันโคลน — จุดที่ต้องคงไว้เสมอเพื่อให้ตัวละครไม่ซ้ำ/ไม่เหมือนใคร และไม่คล้ายบุคคลจริงหรือ IP อื่น',
    ),
    negative_prompt: str('negative prompt สำหรับ image generation — สิ่งที่ห้ามปรากฏ'),
  },
  'Visual DNA — อัตลักษณ์ภาพของตัวละคร ต้องไม่เหมือนบุคคลจริงหรือตัวละครที่มีอยู่แล้ว',
);

export const COMMERCE_PROFILE_SCHEMA = obj(
  {
    suitable_product_categories: strArray('หมวดสินค้าที่เหมาะกับตัวละคร'),
    restricted_product_categories: strArray('หมวดสินค้าที่ไม่ควรรับ/เสี่ยง'),
    best_selling_tone: str('โทนการขายที่เข้ากับตัวละครที่สุด'),
    tie_in_style: str('สไตล์การ tie-in สินค้าในคอนเทนต์'),
    audience_fit: strArray('กลุ่มผู้ชมที่เหมาะสม'),
    claim_risk_level: {
      type: 'string',
      enum: ['low', 'medium', 'high'],
      description: 'ระดับความเสี่ยงด้านการเคลม (ห้ามออกแบบให้ชวนเคลมเกินจริง)',
    },
    brand_safety_level: {
      type: 'string',
      enum: ['low', 'medium', 'high'],
      description: 'ระดับความปลอดภัยต่อแบรนด์',
    },
    live_selling_strength: str('จุดแข็งเวลาไลฟ์ขายของ'),
    review_style: str('สไตล์การรีวิวสินค้า'),
  },
  'Commerce Profile — โปรไฟล์เชิงพาณิชย์ ห้ามมี claim เกินจริง',
);

export const VOICE_PROFILE_SCHEMA = obj(
  {
    voice_type: str('ประเภทเสียง เช่น เสียงใส เสียงทุ้ม'),
    tone: str('โทนเสียงโดยรวม'),
    accent: str('สำเนียง เช่น กลาง เหนือ อีสาน ใต้'),
    speaking_speed: str('ความเร็วในการพูด'),
    laugh_style: str('สไตล์เสียงหัวเราะ'),
    emotional_range: strArray('ช่วงอารมณ์ที่แสดงออกได้'),
    sample_dialogues: strArray('ตัวอย่างบทพูด 3-5 ประโยค ที่สะท้อนตัวตน'),
  },
  'Voice Profile — อัตลักษณ์เสียงของตัวละคร',
);

export const SUGGESTED_SCHEMA = obj(
  {
    age: {
      type: 'integer',
      description: 'อายุของตัวละคร ต้องมากกว่าหรือเท่ากับ 18 ปีเสมอ (บริบท commerce)',
    },
    gender: str('เพศของตัวละคร'),
    region: str('ภูมิภาค/ถิ่นกำเนิด'),
    roleLabel: str('บทบาทในเรื่อง เช่น นางเอกสายฮา เจ้าแม่รีวิว'),
  },
  'ค่าแนะนำสำหรับ Basic Profile',
);

const SECTION_SCHEMAS: Record<DraftSection, JsonSchema> = {
  persona: PERSONA_SCHEMA,
  visualDna: VISUAL_DNA_SCHEMA,
  commerceProfile: COMMERCE_PROFILE_SCHEMA,
  voiceProfile: VOICE_PROFILE_SCHEMA,
};

/** สร้าง schema เฉพาะ section ที่ขอ (default = ทุก section) — suggested ติดมาเสมอ */
export function buildCharacterDraftSchema(sections: readonly DraftSection[] = DRAFT_SECTIONS): JsonSchema {
  const properties: Record<string, JsonSchema> = {};
  for (const section of DRAFT_SECTIONS) {
    if (sections.includes(section)) properties[section] = SECTION_SCHEMAS[section];
  }
  properties.suggested = SUGGESTED_SCHEMA;
  return {
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

export const CHARACTER_DRAFT_SCHEMA = buildCharacterDraftSchema();
