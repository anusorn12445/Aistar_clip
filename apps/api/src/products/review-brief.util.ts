// Review Brief ของสินค้า (Product.reviewBrief Json?) — "ข้อมูลรีวิว" กรอกครั้งเดียว
// ใช้ซ้ำทุก Clip Job: จุดเด่น/สเปก/กลุ่มเป้าหมาย/วิธีใช้/โปร/ข้อควรระวัง/โน้ต
// util นี้เป็น source of truth ของ shape + sanitizer (ฝั่ง API เชื่อ input จาก client ไม่ได้)

export interface ReviewBriefShape {
  highlights: string[]; // จุดเด่น/USP
  specs: string; // สรรพคุณ/สเปกหลัก
  targetAudience: string; // กลุ่มเป้าหมาย
  painPoint: string; // ปัญหาที่แก้
  howToUse: string[]; // วิธีใช้ (ทีละขั้น)
  promo: string; // โปรโมชั่น
  cautions: string; // ข้อควรระวัง/ห้ามพูด
  extraNote: string; // โน้ตเพิ่มเติม
}

const MAX_LIST_ITEMS = 20; // cap array ~20 รายการ (กัน payload บวม)
const MAX_TEXT_LENGTH = 4000; // cap ความยาวต่อช่อง (กันยัด text ยาวผิดปกติ)

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, MAX_TEXT_LENGTH) : '';
}

function cleanList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => cleanText(v))
    .filter(Boolean)
    .slice(0, MAX_LIST_ITEMS);
}

/** sanitize input (จาก client หรือจาก AI) → shape มาตรฐาน: strings trimmed, arrays cap 20 */
export function sanitizeReviewBrief(raw: unknown): ReviewBriefShape {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    highlights: cleanList(r.highlights),
    specs: cleanText(r.specs),
    targetAudience: cleanText(r.targetAudience),
    painPoint: cleanText(r.painPoint),
    howToUse: cleanList(r.howToUse),
    promo: cleanText(r.promo),
    cautions: cleanText(r.cautions),
    extraNote: cleanText(r.extraNote),
  };
}

/** true เมื่อ brief มีข้อมูลจริงอย่างน้อย 1 ช่อง (ใช้ตัดสิน badge/warning) */
export function reviewBriefHasContent(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const b = sanitizeReviewBrief(raw);
  return (
    b.highlights.length > 0 ||
    b.howToUse.length > 0 ||
    Boolean(b.specs || b.targetAudience || b.painPoint || b.promo || b.cautions || b.extraNote)
  );
}
