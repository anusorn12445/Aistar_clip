// ประเมิน "เวลาพูดจริง" ของบทไทย (พยางค์ + เวลาหยุดจากเครื่องหมาย) — pure, ไม่เรียก AI
//
// ทำไมต้องมี: ระบบเดิมคุมบทด้วย "จำนวนพยางค์ ≤ งบ" อย่างเดียว ซึ่งมองข้าม
// เวลาหยุด (comma/จุด/เว้นวรรค) — บทที่พยางค์อยู่ในงบแต่มีจังหวะหยุดเยอะจะพูดเกินเฟรมจริง
// ตัวนี้บวกเวลา pause เข้าไป → จับบทที่ "อ่านทันแต่พูดไม่ทัน" ได้
//
// หลักการคิด: seconds = พยางค์ / rate + Σ(เวลาหยุดต่อเครื่องหมาย)
// rate เริ่มต้น 3.5 พยางค์/วิ ให้ตรงกับค่าที่ระบบใช้อยู่ (ไม่ทำให้งบหลวมลง)

export interface SpeechTimingOptions {
  /** อัตราพูด (พยางค์/วินาที) — ค่าเริ่มต้น 3.5 ตรงกับกติกาเดิมของระบบ */
  syllablesPerSec?: number;
  /** เวลาหยุดสั้น ต่อ comma/เว้นวรรค (วินาที) */
  shortPauseSec?: number;
  /** เวลาหยุดยาว ต่อจุด/!/?/… (วินาที) */
  longPauseSec?: number;
}

const DEFAULTS: Required<SpeechTimingOptions> = {
  syllablesPerSec: 3.5,
  shortPauseSec: 0.12,
  longPauseSec: 0.3,
};

/**
 * นับพยางค์ไทยโดยประมาณ (พฤติกรรมเดียวกับ AffiliateClipsService.thaiSyllableEstimate เดิม
 * เพื่อคง calibration งบเดิม): นับสระหลัก + คำ latin แต่ละคำ = 1 พยางค์. คลาดเคลื่อน ±1-2
 * ใช้เตือน/คุมงบเท่านั้น
 */
export function countThaiSyllables(s: string | null | undefined): number {
  const t = (s ?? '').trim();
  if (!t) return 0;
  const vowels =
    t.match(/[ะัาำิีึืุูเแโใไ]/g)?.length ?? 0;
  const latinWords = t.match(/[a-zA-Z0-9]+/g)?.length ?? 0;
  return Math.max(1, vowels + latinWords);
}

/** นับเวลาหยุดรวมจากเครื่องหมายวรรคตอน/เว้นวรรคในบท (วินาที) */
export function pauseSeconds(s: string | null | undefined, opts: SpeechTimingOptions = {}): number {
  const t = s ?? '';
  const o = { ...DEFAULTS, ...opts };
  const longBreaks = t.match(/[.!?…ฯ]|\.\.\./g)?.length ?? 0;
  const shortBreaks = t.match(/[,;:·、]|\s+/g)?.length ?? 0;
  return longBreaks * o.longPauseSec + shortBreaks * o.shortPauseSec;
}

/** ประเมินเวลาพูดจริงของบท (วินาที) = พยางค์/rate + เวลาหยุด */
export function estimateSpeechSeconds(s: string | null | undefined, opts: SpeechTimingOptions = {}): number {
  const t = (s ?? '').trim();
  if (!t) return 0;
  const o = { ...DEFAULTS, ...opts };
  const syl = countThaiSyllables(t);
  const speak = syl / o.syllablesPerSec;
  return Math.round((speak + pauseSeconds(t, o)) * 10) / 10; // ปัดทศนิยม 1 ตำแหน่ง
}

export interface SpeechFit {
  syllables: number;
  estimatedSec: number;
  windowSec: number;
  /** ผ่านไหม (มี grace เล็กน้อย) */
  fits: boolean;
  /** เกินไปกี่วินาที (0 ถ้าพอดี) */
  overBySec: number;
  /** จำนวนพยางค์สูงสุดที่ยังพอดีเฟรม (ช่วยตอนตัดบท) */
  maxSyllables: number;
}

/**
 * เช็กว่าบทพูดพอดีหน้าต่างเวลาของฉากไหม — คิดทั้งพยางค์และเวลาหยุด
 * @param windowSec หน้าต่างพูดของฉาก (วินาที) เช่น ความยาวฉาก-1
 * @param graceSec ผ่อนปรน (วินาที) — ค่าเริ่มต้น 1.0 ให้ใกล้เกณฑ์เดิม (พยางค์ +4 ≈ 1.14 วิ)
 */
export function checkSpeechFit(
  s: string | null | undefined,
  windowSec: number,
  opts: SpeechTimingOptions & { graceSec?: number } = {},
): SpeechFit {
  const o = { ...DEFAULTS, ...opts };
  const grace = opts.graceSec ?? 1.0;
  const syllables = countThaiSyllables(s);
  const estimatedSec = estimateSpeechSeconds(s, o);
  const budget = windowSec + grace;
  const overBySec = Math.max(0, Math.round((estimatedSec - budget) * 10) / 10);
  // งบพยางค์ล้วน ๆ (ไม่รวม pause) เพื่อชี้เป้าตอนตัดบท
  const maxSyllables = Math.max(1, Math.floor((windowSec - pauseSeconds(s, o)) * o.syllablesPerSec));
  return {
    syllables,
    estimatedSec,
    windowSec,
    fits: estimatedSec <= budget + 1e-9,
    overBySec,
    maxSyllables,
  };
}
