// Opening Methods — master data "วิธีเปิดบรรจุภัณฑ์" แบบ rich สำหรับคลิป unbox/รีวิว
//
// แยกบทบาทจาก packagingType:
//   packagingType = "สินค้าคืออะไร" (object)   — ไฟล์ packaging-prompts.ts
//   OpeningMethod = "ทำอะไรกับมัน" (action)    — ไฟล์นี้ (ทิศเคลื่อนไหว/มือ/เครื่องมือ/ซีล/เวลา/มุมกล้อง/เสียง)
//
// เฟส 1 (MVP): code-level master data (สไตล์เดียวกับ packaging-prompts) + map packaging→ลำดับเปิด
// เฟส 2: ยกเป็นตาราง Prisma + override + UI ; เฟส 3: per-action clipSec + auto camera preset + taxonomy เต็ม

export type OpeningPhase = 'prep' | 'open' | 'dispense' | 'reclose';
export type OpeningGroup =
  | 'TWIST' | 'PULL' | 'PEEL' | 'TEAR' | 'PUSH' | 'SLIDE' | 'PRY' | 'BREAK' | 'PIERCE' | 'CUT' | 'FOLD' | 'LIFT';
export type MotionAxis =
  | 'rotate_cw' | 'pull_up' | 'pull_lateral' | 'press_down' | 'slide_h' | 'lever_up' | 'fold_open' | 'lift_up';
export type OpeningTool = 'none' | 'scissors' | 'opener' | 'corkscrew';
export type SfxTag = 'click' | 'crack' | 'peel' | 'tear' | 'hiss' | 'pop' | 'pump' | 'none';

export interface OpeningMethod {
  code: string;
  labelTh: string;
  labelEn: string;
  phase: OpeningPhase;
  group: OpeningGroup;
  motionAxis: MotionAxis;
  hands: 1 | 2;
  toolRequired: OpeningTool;
  tamperEvident: boolean; // เปิดครั้งแรกต้องทำลายซีล
  reclosable: boolean; // ปิดซ้ำได้ → คลิปอาจมีจังหวะปิดกลับ
  clipSec: number; // ความยาวแนะนำของ action นี้ (วินาที)
  cameraHint: string; // มุมกล้องเห็นการเคลื่อนไหวชัดสุด
  sfxTag: SfxTag; // เสียงประกอบ ASMR
  motionEn: string; // ประโยค EN สำหรับ motionPrompt (การเคลื่อนไหวจริง)
}

const m = (o: OpeningMethod): OpeningMethod => o;

export const OPENING_METHODS: Record<string, OpeningMethod> = {
  // ── prep: บรรจุภัณฑ์ชั้นนอก & ซีล ──
  OPEN_SHRINK_BAND: m({
    code: 'OPEN_SHRINK_BAND', labelTh: 'ลอกแถบฟิล์มหดที่คอขวด', labelEn: 'peel shrink band at neck',
    phase: 'prep', group: 'PEEL', motionAxis: 'pull_up', hands: 1, toolRequired: 'none',
    tamperEvident: true, reclosable: false, clipSec: 2, cameraHint: 'macro on bottle neck, 3/4 angle',
    sfxTag: 'tear', motionEn: 'fingertips pinch the perforated shrink band at the bottle neck and peel it upward, the thin film crackling as it lifts away',
  }),
  OPEN_PEEL_SEAL: m({
    code: 'OPEN_PEEL_SEAL', labelTh: 'ลอกฟอยล์ปิดปากขวด', labelEn: 'peel foil seal off mouth',
    phase: 'prep', group: 'PEEL', motionAxis: 'pull_lateral', hands: 1, toolRequired: 'none',
    tamperEvident: true, reclosable: false, clipSec: 2, cameraHint: 'top-down macro on opening',
    sfxTag: 'peel', motionEn: 'a fingertip lifts the corner tab of the foil seal and peels it sideways across the jar mouth in one smooth pull',
  }),
  OPEN_PUMP_CLIP_REMOVE: m({
    code: 'OPEN_PUMP_CLIP_REMOVE', labelTh: 'ถอดคลิปกันกดใต้หัวปั๊ม', labelEn: 'remove pump lock clip',
    phase: 'prep', group: 'PULL', motionAxis: 'pull_up', hands: 1, toolRequired: 'none',
    tamperEvident: false, reclosable: true, clipSec: 2, cameraHint: 'macro on pump collar',
    sfxTag: 'click', motionEn: 'thumb and finger pull the small plastic safety clip out from under the pump head with a soft click',
  }),
  OPEN_TUCK_FLAP: m({
    code: 'OPEN_TUCK_FLAP', labelTh: 'คลี่ปีกกล่องกระดาษ', labelEn: 'open carton tuck flap',
    phase: 'prep', group: 'FOLD', motionAxis: 'fold_open', hands: 2, toolRequired: 'none',
    tamperEvident: false, reclosable: true, clipSec: 2, cameraHint: 'medium macro, box centered',
    sfxTag: 'none', motionEn: 'both hands unfold the tucked cardboard flap of the box open, revealing the product inside',
  }),
  OPEN_TEAR_NOTCH: m({
    code: 'OPEN_TEAR_NOTCH', labelTh: 'ฉีกซองที่รอยบาก', labelEn: 'tear sachet at notch',
    phase: 'open', group: 'TEAR', motionAxis: 'pull_lateral', hands: 2, toolRequired: 'none',
    tamperEvident: true, reclosable: false, clipSec: 2, cameraHint: 'macro on sachet top notch',
    sfxTag: 'tear', motionEn: 'both hands grip the sachet at the tear notch and rip it open across the top with a crisp tearing motion',
  }),
  // ── open: ฝา ──
  OPEN_TWIST_CAP: m({
    code: 'OPEN_TWIST_CAP', labelTh: 'หมุนฝาเกลียวออก', labelEn: 'twist screw cap off',
    phase: 'open', group: 'TWIST', motionAxis: 'rotate_cw', hands: 1, toolRequired: 'none',
    tamperEvident: false, reclosable: true, clipSec: 2, cameraHint: '45° angle showing cap rotate',
    sfxTag: 'click', motionEn: 'fingers twist the screw cap counter-clockwise and lift it off, a small click as the thread releases',
  }),
  OPEN_JAR_LID: m({
    code: 'OPEN_JAR_LID', labelTh: 'หมุนฝากระปุกออก', labelEn: 'twist jar lid off',
    phase: 'open', group: 'TWIST', motionAxis: 'rotate_cw', hands: 2, toolRequired: 'none',
    tamperEvident: false, reclosable: true, clipSec: 2, cameraHint: 'slightly high angle on jar',
    sfxTag: 'none', motionEn: 'one hand steadies the jar while the other twists the lid open and lifts it away to reveal the cream surface',
  }),
  OPEN_PUSH_FLIP: m({
    code: 'OPEN_PUSH_FLIP', labelTh: 'กดเปิดฝาพลิก (flip-top)', labelEn: 'push flip-top cap',
    phase: 'open', group: 'PUSH', motionAxis: 'lever_up', hands: 1, toolRequired: 'none',
    tamperEvident: false, reclosable: true, clipSec: 1, cameraHint: 'side macro on flip cap',
    sfxTag: 'click', motionEn: 'the thumb flicks the flip-top cap up and it snaps open with a click',
  }),
  OPEN_TWIST_OFF: m({
    code: 'OPEN_TWIST_OFF', labelTh: 'บิดหักฝา (ขวดช็อต)', labelEn: 'twist-off breakaway cap',
    phase: 'open', group: 'BREAK', motionAxis: 'rotate_cw', hands: 1, toolRequired: 'none',
    tamperEvident: true, reclosable: false, clipSec: 2, cameraHint: 'macro on cap ring',
    sfxTag: 'crack', motionEn: 'fingers twist the cap sharply until the tamper ring snaps with an audible crack, then lift the cap off',
  }),
  OPEN_PULL_TAB: m({
    code: 'OPEN_PULL_TAB', labelTh: 'ดึงแถบ/ห่วงดึง', labelEn: 'pull ring tab',
    phase: 'open', group: 'PULL', motionAxis: 'pull_up', hands: 1, toolRequired: 'none',
    tamperEvident: true, reclosable: false, clipSec: 2, cameraHint: 'top macro on pull tab',
    sfxTag: 'pop', motionEn: 'a finger hooks the ring tab and pulls it up and back, the seal releasing with a soft pop',
  }),
  // ── dispense: จ่ายเนื้อ ──
  OPEN_PUMP_PRESS: m({
    code: 'OPEN_PUMP_PRESS', labelTh: 'กดหัวปั๊ม', labelEn: 'press pump head',
    phase: 'dispense', group: 'PUSH', motionAxis: 'press_down', hands: 1, toolRequired: 'none',
    tamperEvident: false, reclosable: true, clipSec: 2, cameraHint: 'macro, product over palm',
    sfxTag: 'pump', motionEn: 'the index finger presses the pump head down and a dollop of product dispenses onto the open palm',
  }),
  OPEN_SQUEEZE_TUBE: m({
    code: 'OPEN_SQUEEZE_TUBE', labelTh: 'บีบหลอด', labelEn: 'squeeze tube',
    phase: 'dispense', group: 'PUSH', motionAxis: 'press_down', hands: 1, toolRequired: 'none',
    tamperEvident: false, reclosable: true, clipSec: 2, cameraHint: 'macro on tube nozzle',
    sfxTag: 'none', motionEn: 'fingers squeeze the tube from the bottom and a smooth line of product comes out of the nozzle',
  }),
  OPEN_TWIST_UP: m({
    code: 'OPEN_TWIST_UP', labelTh: 'หมุนฐานให้แท่งเลื่อนขึ้น', labelEn: 'twist base to raise stick',
    phase: 'dispense', group: 'TWIST', motionAxis: 'rotate_cw', hands: 1, toolRequired: 'none',
    tamperEvident: false, reclosable: true, clipSec: 2, cameraHint: 'macro, stick vertical',
    sfxTag: 'none', motionEn: 'fingers twist the base and the product stick rises smoothly from the tube',
  }),
  // ── reclose ──
  OPEN_RECLOSE_CAP: m({
    code: 'OPEN_RECLOSE_CAP', labelTh: 'ปิดฝากลับ', labelEn: 'reclose cap',
    phase: 'reclose', group: 'TWIST', motionAxis: 'rotate_cw', hands: 1, toolRequired: 'none',
    tamperEvident: false, reclosable: true, clipSec: 1, cameraHint: '45° angle on cap',
    sfxTag: 'click', motionEn: 'fingers set the cap back on and twist it closed with a final click',
  }),
};

// ลำดับการเปิดเริ่มต้นต่อชนิดแพ็กเกจ (packagingType → codes เรียงลำดับ prep→open→dispense)
export const DEFAULT_OPENING_SEQUENCE: Record<string, string[]> = {
  pump_bottle: ['OPEN_PUMP_CLIP_REMOVE', 'OPEN_PUMP_PRESS'],
  dropper: ['OPEN_TWIST_CAP'],
  spray: ['OPEN_TWIST_CAP', 'OPEN_PUMP_PRESS'],
  cream_jar: ['OPEN_PEEL_SEAL', 'OPEN_JAR_LID'],
  squeeze_tube: ['OPEN_TWIST_CAP', 'OPEN_SQUEEZE_TUBE'],
  toothpaste: ['OPEN_TWIST_CAP', 'OPEN_SQUEEZE_TUBE'],
  flip_top: ['OPEN_PUSH_FLIP'],
  ready_drink: ['OPEN_SHRINK_BAND', 'OPEN_TWIST_CAP'],
  jelly_stick_sachet: ['OPEN_TEAR_NOTCH'],
  powder_mix: ['OPEN_TEAR_NOTCH'],
  pill_capsule: ['OPEN_TWIST_CAP'],
  gummy: ['OPEN_TWIST_CAP'],
  unbox_item: ['OPEN_TUCK_FLAP'],
};

export function getOpeningMethod(code: string): OpeningMethod | null {
  return OPENING_METHODS[code] ?? null;
}

/** EN line สำหรับ motionPrompt: การเคลื่อนไหว + ล็อกจำนวนมือ + เครื่องมือ (ใช้ตอน compose ราย shot — เฟส 2) */
export function openingMotionLine(mth: OpeningMethod): string {
  const handTxt = mth.hands === 1 ? 'using one hand only' : 'using both her own hands';
  const tool = mth.toolRequired !== 'none' ? `, using a ${mth.toolRequired}` : '';
  return `${mth.motionEn}, ${handTxt}${tool}.`;
}

/** EN line เสียง ASMR ตาม sfxTag */
export function openingSfxLine(mth: OpeningMethod): string | null {
  const map: Record<SfxTag, string> = {
    click: 'a crisp click sound as it opens',
    crack: 'a sharp crack of the tamper seal breaking',
    peel: 'a slow satisfying peeling sound',
    tear: 'a crisp tearing sound',
    hiss: 'a soft hiss of released pressure',
    pop: 'a soft pop as the seal releases',
    pump: 'a soft pump sound as product dispenses',
    none: '',
  };
  const line = map[mth.sfxTag];
  return line ? line : null;
}

/** resolve packagingType (CSV รองรับหลายแพ็ก) → ลำดับ OpeningMethod (unique เรียงลำดับ) */
export function openingSequenceFor(packagingType: string | null | undefined): OpeningMethod[] {
  const keys = (packagingType ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const codes: string[] = [];
  for (const k of keys) {
    for (const code of DEFAULT_OPENING_SEQUENCE[k] ?? []) {
      if (!codes.includes(code)) codes.push(code);
    }
  }
  return codes.map((c) => OPENING_METHODS[c]).filter((x): x is OpeningMethod => Boolean(x));
}

/** guide ภาษาไทยสำหรับ plan prompt — ให้ AI จัดฉากแกะ/สาธิตด้วยมือ/ทิศ/เสียงที่ถูกต้อง */
export function openingSequenceGuide(packagingType: string | null | undefined): string[] {
  const seq = openingSequenceFor(packagingType);
  if (seq.length === 0) return [];
  const phaseTh: Record<OpeningPhase, string> = { prep: 'เตรียม/ซีล', open: 'เปิด', dispense: 'จ่ายเนื้อ', reclose: 'ปิดกลับ' };
  const lines = seq.map((mth, i) => {
    const hand = mth.hands === 1 ? '1 มือ' : '2 มือ';
    const sfx = mth.sfxTag !== 'none' ? ` · เสียง ${mth.sfxTag}` : '';
    const tool = mth.toolRequired !== 'none' ? ` · ใช้ ${mth.toolRequired}` : '';
    return `  ${i + 1}. [${phaseTh[mth.phase]}] ${mth.labelTh} — ${hand}${tool}${sfx} · มุม ${mth.cameraHint} (~${mth.clipSec} วิ)`;
  });
  return [
    '- วิธีเปิดสินค้าตามแพ็กเกจ (จัดฉากแกะ/สาธิตให้มือ ทิศการเคลื่อนไหว และเสียงถูกต้องตามนี้):',
    ...lines,
  ];
}
