// Banned Words Compliance — types + fetchers + pure scanner (additive)
// ⚠️ SYNC NOTE: scanText/wordAppliesToPlatform/normalizeCompliancePlatform ก๊อปให้ตรงกับ
// apps/api/src/compliance/banned-words.util.ts (matcher กลางฝั่ง API) — แก้กติกาที่ไหนต้องแก้อีกที่เสมอ
// กติกา (เรียบง่ายตั้งใจ): case-insensitive substring, term trim แล้ว — ไทยไม่มี case แต่คำอังกฤษต้อง fold

import { api } from "./api";

export interface BannedWord {
  id: string;
  term: string;
  platforms: string[]; // ว่าง = ทุกแพลตฟอร์ม
  severity: string; // ban | risky
  category: string | null;
  replacement: string | null;
  note: string | null;
  status: string; // active | archived
  builtin: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BannedMatch {
  term: string;
  severity: string;
  replacement: string | null;
  index: number;
}

export interface AiReviewFinding {
  phrase: string;
  reason: string;
  suggestion: string;
  severity: string; // ban | risky
}

export const BANNED_PLATFORM_LABEL: Record<string, string> = {
  tiktok: "TikTok",
  youtube: "YouTube",
  facebook: "Facebook",
};

export const BANNED_SEVERITY_LABEL: Record<string, { label: string; cls: string }> = {
  ban: { label: "แบน", cls: "bg-red-900/60 text-red-200 ring-1 ring-red-700/60" },
  risky: { label: "เสี่ยง", cls: "bg-amber-900/50 text-amber-200 ring-1 ring-amber-700/50" },
};

export const BANNED_CATEGORY_LABEL: Record<string, string> = {
  health_claim: "เคลมสุขภาพ",
  beauty_claim: "เคลมความงาม",
  superlative: "คำเว่อร์/อวดอ้าง",
  weight_loss: "ลดน้ำหนัก",
  finance: "การเงิน",
  gambling: "การพนัน",
  medical: "การแพทย์",
};

// ─── pure matcher (mirror ของ API) ───────────────────────────
export function normalizeCompliancePlatform(platform?: string | null): string | undefined {
  if (!platform) return undefined;
  const p = platform.toLowerCase();
  if (p.includes("tiktok")) return "tiktok";
  if (p.includes("youtube")) return "youtube";
  if (p.includes("facebook")) return "facebook";
  return undefined; // แพลตฟอร์มอื่น (IG/Shopee) → เช็คกับทุกคำ (ปลอดภัยไว้ก่อน)
}

export function wordAppliesToPlatform(
  word: Pick<BannedWord, "platforms">,
  platform?: string,
): boolean {
  if (!platform) return true;
  return word.platforms.length === 0 || word.platforms.includes(platform);
}

/** สแกนข้อความหาคำต้องห้าม — 1 match ต่อคำ (ตำแหน่งแรกที่พบ) */
export function scanText(
  text: string | null | undefined,
  words: Pick<BannedWord, "term" | "platforms" | "severity" | "replacement">[],
  platform?: string,
): BannedMatch[] {
  if (!text) return [];
  const haystack = text.toLowerCase();
  const matches: BannedMatch[] = [];
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

/** แทนที่คำต้องห้ามทุกตำแหน่ง (case-insensitive) ด้วยคำแทนที่แนะนำ — match ที่ไม่มี replacement จะถูกข้าม */
export function replaceMatches(text: string, matches: BannedMatch[]): string {
  let out = text;
  for (const m of matches) {
    if (!m.replacement) continue;
    const pattern = new RegExp(m.term.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    out = out.replace(pattern, m.replacement);
  }
  return out;
}

// ─── fetchers ────────────────────────────────────────────────

// cache รายชื่อคำ active ต่อ session (scanner ใช้ถี่ — ไม่ยิงซ้ำทุกครั้งที่พิมพ์)
let activeWordsPromise: Promise<BannedWord[]> | null = null;

export function fetchActiveBannedWords(force = false): Promise<BannedWord[]> {
  if (!activeWordsPromise || force) {
    activeWordsPromise = api<BannedWord[]>("/banned-words?status=active").catch((err) => {
      activeWordsPromise = null; // ล้มแล้วลองใหม่ครั้งหน้า (เช่น API build เก่า)
      throw err;
    });
  }
  return activeWordsPromise;
}

export function invalidateBannedWordsCache() {
  activeWordsPromise = null;
}

export function fetchBannedWords(params: Record<string, string> = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v && qs.set(k, v));
  const s = qs.toString();
  return api<BannedWord[]>(`/banned-words${s ? `?${s}` : ""}`);
}

export interface BannedWordInput {
  term?: string;
  platforms?: string[];
  severity?: string;
  category?: string;
  replacement?: string;
  note?: string;
  status?: string;
}

export const createBannedWord = (body: BannedWordInput) =>
  api<BannedWord>("/banned-words", { method: "POST", body: JSON.stringify(body) });

export const updateBannedWord = (id: string, body: BannedWordInput) =>
  api<BannedWord>(`/banned-words/${id}`, { method: "PATCH", body: JSON.stringify(body) });

export const archiveBannedWord = (id: string) =>
  api<BannedWord>(`/banned-words/${id}/archive`, { method: "POST" });

export const aiReviewBannedWords = (text: string, platform?: string | null) =>
  api<{ findings: AiReviewFinding[]; model: string }>("/banned-words/ai-review", {
    method: "POST",
    body: JSON.stringify({ text, ...(platform ? { platform } : {}) }),
  });
