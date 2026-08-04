// Character Blueprint (พิมพ์เขียว) — pure helpers ที่แชร์กันระหว่าง
// ai.service (AI Wizard) + ai-character-capture.service (Reverse-capture) + characters.service
// ไม่มี DI / prisma — รับ blueprint object ที่ load มาแล้วเข้ามา แล้วคืน string/array ตรง ๆ
// (แต่ละ service load blueprint จาก prisma เอง เพื่อเลี่ยง cross-module dependency)

// blueprint ที่พอสำหรับ injection (subset ของ CharacterBlueprint)
export interface BlueprintForInject {
  name: string;
  houseRules: string | null;
  requiredFields: string[];
  defaults: unknown; // Json? — คาดว่าเป็น object { key: value }
}

// ชุด field ที่ "รู้จัก" สำหรับ defaults editor (web) — keys ของ visualDna/suggested ที่มัก set เป็นค่ามาตรฐาน
export const BLUEPRINT_DEFAULT_FIELDS = [
  'ethnicity',
  'art_style',
  'aspect_ratio',
  'lighting',
  'age_range',
  'region',
  'skin_tone',
  'shot_type',
  'camera_angle',
  'color_grade',
  'background_setting',
  'mood',
] as const;

// แปลง defaults (Json object) → readable lines ภาษาไทย/อังกฤษ เช่น "- ethnicity: ไทย ..."
function defaultsToLines(defaults: unknown): string {
  if (!defaults || typeof defaults !== 'object' || Array.isArray(defaults)) return '(ไม่มี)';
  const entries = Object.entries(defaults as Record<string, unknown>).filter(
    ([, v]) => v !== undefined && v !== null && String(v).trim() !== '',
  );
  if (entries.length === 0) return '(ไม่มี)';
  return entries
    .map(([k, v]) => `- ${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`)
    .join('\n');
}

/**
 * สร้างบล็อก directive ภาษาไทยที่ต่อท้าย SYSTEM_PROMPT ของ AI ทั้งสองเส้นทาง
 * (AI Wizard + Reverse-capture) — คุมมาตรฐานการสร้างตัวละครตาม blueprint ที่ CEO ตั้งไว้
 *
 * @param reverseCapture true = เพิ่มบรรทัดกันชนกับกติกา "ห้ามแต่งข้อมูลที่ไม่มีหลักฐาน" ของ capture
 */
export function buildBlueprintPromptBlock(
  bp: BlueprintForInject,
  opts: { reverseCapture?: boolean } = {},
): string {
  const houseRules = bp.houseRules?.trim() ? bp.houseRules.trim() : '(ไม่มีกฎเพิ่มเติม)';
  const required =
    bp.requiredFields.length > 0 ? bp.requiredFields.join(', ') : '(ไม่มี)';

  const lines = [
    '',
    '',
    `# BLUEPRINT: ${bp.name}`,
    houseRules,
    '',
    `DEFAULTS (ยึดค่าเหล่านี้เว้นแต่ข้อมูลตั้งต้นระบุเป็นอย่างอื่น):\n${defaultsToLines(bp.defaults)}`,
    '',
    `REQUIRED (ต้องเติมให้ครบ ห้ามเว้นว่าง): ${required}`,
  ];

  if (opts.reverseCapture) {
    // reverse-capture: กติกา "ห้ามแต่งข้อมูลที่ไม่มีหลักฐาน" ต้องเหนือกว่า blueprint เสมอ
    lines.push(
      '',
      'หมายเหตุ (reverse-capture): กติกา "ห้ามแต่งข้อมูลที่ไม่มีหลักฐาน" อยู่เหนือ blueprint เสมอ — ' +
        'DEFAULTS ใช้เติมเฉพาะฟิลด์ที่ไม่มีหลักฐานจากสรุป/รูปจริงเท่านั้น ห้ามเขียนทับสิ่งที่เห็นในรูป/สรุป; ' +
        'REQUIRED ที่ไม่มีหลักฐานให้ใส่ค่า default แล้วตั้ง confidence ต่ำ ห้ามกุรายละเอียดเฉพาะเจาะจงขึ้นมาเอง',
    );
  }

  return lines.join('\n');
}

// ค่าที่ถือว่า "ว่าง" สำหรับ required-field completeness check
function isEmptyValue(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

/**
 * คำนวณ requiredFields ที่ยัง "ว่าง" หลัง draft/capture — key map เข้าได้ทั้ง persona และ visualDna
 * (มีค่าใน object ใด object หนึ่งก็ถือว่าครบ) — คืน list ของ key ที่ยังต้องเติม
 * ไม่ block การสร้าง — UI เอาไปโชว์ amber warning เท่านั้น
 */
export function computeMissingRequired(
  requiredFields: string[] | undefined,
  persona: Record<string, unknown> | null | undefined,
  visualDna: Record<string, unknown> | null | undefined,
): string[] {
  if (!requiredFields || requiredFields.length === 0) return [];
  const p = persona ?? {};
  const v = visualDna ?? {};
  return requiredFields.filter((key) => isEmptyValue(p[key]) && isEmptyValue(v[key]));
}
