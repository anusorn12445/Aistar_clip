// Banned Words Compliance — pure matcher (ไม่มี dependency ใด ๆ)
// ⚠️ SYNC NOTE: logic การ match ชุดนี้ถูก "ก๊อปให้ตรงกัน" ที่ฝั่งเว็บ apps/web/src/lib/banned-words.ts
// (live scanner ใต้ช่องข้อความ) — ถ้าแก้กติกาการ match ที่นี่ ต้องแก้ฝั่งเว็บให้เหมือนกันเสมอ
// กติกา (ตั้งใจให้เรียบง่าย): case-insensitive substring บนข้อความที่ trim term แล้ว
// — ภาษาไทยไม่มีตัวพิมพ์เล็ก/ใหญ่ แต่ term อังกฤษ/ผสมยังต้อง fold case

export interface BannedWordLike {
  term: string;
  platforms: string[]; // ว่าง = ห้ามทุกแพลตฟอร์ม
  severity: string; // ban | risky
  replacement?: string | null;
}

export interface BannedTermMatch {
  term: string;
  severity: string;
  replacement: string | null;
  index: number; // ตำแหน่งแรกที่พบในข้อความต้นฉบับ (สำหรับ jump/ไฮไลต์)
}

/** map แพลตฟอร์มโพสต์ของ Clip Job (tiktok/facebook_reels/youtube_shorts/…) → แพลตฟอร์มคำต้องห้าม
 *  แพลตฟอร์มอื่นที่ไม่รู้จัก (IG/Shopee) → undefined = เช็คกับทุกคำ (ปลอดภัยไว้ก่อน) */
export function normalizeCompliancePlatform(platform?: string | null): string | undefined {
  if (!platform) return undefined;
  const p = platform.toLowerCase();
  if (p.includes('tiktok')) return 'tiktok';
  if (p.includes('youtube')) return 'youtube';
  if (p.includes('facebook')) return 'facebook';
  return undefined;
}

/** คำนี้บังคับใช้กับแพลตฟอร์มที่ระบุไหม — platforms ว่าง = ทุกแพลตฟอร์ม, ไม่ระบุ platform = เช็คทุกคำ */
export function wordAppliesToPlatform(word: BannedWordLike, platform?: string): boolean {
  if (!platform) return true;
  return word.platforms.length === 0 || word.platforms.includes(platform);
}

/** สแกนข้อความหาคำต้องห้าม — คืน 1 match ต่อคำ (ตำแหน่งแรกที่พบ)
 *  การแทนที่ฝั่ง UI ให้แทนทุกตำแหน่งของคำนั้น (replaceMatches ฝั่งเว็บ) */
export function scanTextForBannedWords(
  text: string | null | undefined,
  words: BannedWordLike[],
  platform?: string,
): BannedTermMatch[] {
  if (!text) return [];
  const haystack = text.toLowerCase();
  const matches: BannedTermMatch[] = [];
  for (const word of words) {
    if (!wordAppliesToPlatform(word, platform)) continue;
    const needle = word.term.trim().toLowerCase();
    if (!needle) continue;
    const index = haystack.indexOf(needle);
    if (index === -1) continue;
    matches.push({
      term: word.term,
      severity: word.severity,
      replacement: word.replacement ?? null,
      index,
    });
  }
  return matches;
}

/** Layer 1 — บล็อกคำต้องห้ามที่ต่อท้าย system prompt ของ AI script writer (cap กันพรอมป์ตบวม) */
export const BANNED_WORDS_PROMPT_CAP = 120;

export function buildBannedWordsPromptBlock(
  words: BannedWordLike[],
  cap = BANNED_WORDS_PROMPT_CAP,
): string {
  if (words.length === 0) return '';
  const lines = words
    .slice(0, cap)
    .map((w) => `- ${w.term}${w.replacement ? ` (ใช้แทน: ${w.replacement})` : ''}`);
  return `\n\nคำต้องห้าม (แพลตฟอร์มแบน/ลดการมองเห็น) — ห้ามใช้ในทุกข้อความเด็ดขาด:\n${lines.join('\n')}`;
}
