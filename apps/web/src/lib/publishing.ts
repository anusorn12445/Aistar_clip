// Types + constants สำหรับ Content Calendar + Live Commerce Schedule

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PublishingCharacterRef {
  id: string;
  nameTh: string;
  nameEn?: string | null;
  displayCode: string;
}

export interface ContentItemListItem {
  id: string;
  title: string;
  objective: string | null;
  platform: string;
  account: string | null;
  scheduledAt: string | null;
  contentFormat: string | null;
  contentType: string | null;
  episodeId: string | null;
  campaignId: string | null;
  caption: string | null;
  hashtags: string[];
  cta: string | null;
  postUrl: string | null;
  blockedReason: string | null;
  status: string;
  ownerId: string | null;
  updatedAt: string;
  characters: PublishingCharacterRef[];
  products: { id: string; name: string }[];
  episode: { id: string; displayCode: string; title: string } | null;
  campaign: { id: string; displayCode: string; name: string } | null;
}

export interface ContentItemDetail extends ContentItemListItem {
  owner: { id: string; name: string } | null;
  products: { id: string; name: string; displayCode?: string; claimRiskLevel?: string }[];
  readiness: { caption: boolean; scheduledAt: boolean; characters: boolean };
}

export interface CalendarItem {
  id: string;
  title: string;
  platform: string;
  scheduledAt: string;
  status: string;
  blockedReason: string | null;
  characters: string[]; // ชื่อ character
}

export interface LiveSessionListItem {
  id: string;
  title: string;
  platform: string;
  account: string | null;
  scheduledAt: string;
  offer: string | null;
  targetGmv: string | number | null; // Prisma Decimal → string
  status: string;
  updatedAt: string;
  hostCharacters: PublishingCharacterRef[];
  productCount: number;
}

export interface LivePinnedProduct {
  id: string;
  name: string;
  displayCode: string;
  claimRiskLevel: string;
  pinOrder: number;
}

export interface LiveSessionDetail extends Omit<LiveSessionListItem, "productCount"> {
  script: string | null;
  faq: string | null;
  commentGuide: string | null;
  sceneSetup: string | null;
  products: LivePinnedProduct[];
}

// ── constants ────────────────────────────────────────────────

export const PLATFORMS: { value: string; label: string; short: string; icon: string }[] = [
  { value: "tiktok", label: "TikTok", short: "TT", icon: "🎵" },
  { value: "facebook_reels", label: "Facebook Reels", short: "FB", icon: "📘" },
  { value: "instagram_reels", label: "Instagram Reels", short: "IG", icon: "📸" },
  { value: "youtube_shorts", label: "YouTube Shorts", short: "YT", icon: "▶️" },
  { value: "tiktok_shop", label: "TikTok Shop", short: "TTS", icon: "🛒" },
  { value: "shopee_video", label: "Shopee Video", short: "SP", icon: "🧡" },
  { value: "lazada", label: "Lazada", short: "LZ", icon: "💙" },
  { value: "line_oa", label: "LINE OA", short: "LN", icon: "💚" },
];

export function platformMeta(value: string) {
  return PLATFORMS.find((p) => p.value === value) ?? { value, label: value, short: value.slice(0, 2).toUpperCase(), icon: "📱" };
}

// 9 states ตาม §D.1 — label ไทย + สี chip
export const CONTENT_STATUS: Record<string, { label: string; cls: string; dot: string }> = {
  idea: { label: "ไอเดีย", cls: "bg-zinc-800 text-zinc-300", dot: "bg-zinc-400" },
  brief: { label: "Brief", cls: "bg-sky-900 text-sky-200", dot: "bg-sky-400" },
  in_production: { label: "กำลังผลิต", cls: "bg-indigo-900 text-indigo-200", dot: "bg-indigo-400" },
  internal_review: { label: "รอตรวจ", cls: "bg-amber-900 text-amber-200", dot: "bg-amber-400" },
  revision_needed: { label: "ต้องแก้", cls: "bg-red-900 text-red-200", dot: "bg-red-400" },
  approved: { label: "อนุมัติแล้ว", cls: "bg-emerald-900 text-emerald-200", dot: "bg-emerald-400" },
  scheduled: { label: "เข้าคิวโพสต์", cls: "bg-teal-900 text-teal-200", dot: "bg-teal-400" },
  published: { label: "โพสต์แล้ว", cls: "bg-emerald-800 text-emerald-100", dot: "bg-emerald-300" },
  archived: { label: "Archived", cls: "bg-zinc-800 text-zinc-500", dot: "bg-zinc-600" },
};

// Transition ที่ UI แสดงปุ่มได้ (ตรงกับ state machine ฝั่ง API §D.1)
export const CONTENT_NEXT: Record<
  string,
  { to: string; label: string; needs?: "comment" | "postUrl" | "scheduledAt" | "reason" }[]
> = {
  idea: [{ to: "brief", label: "ทำ Brief" }],
  brief: [{ to: "in_production", label: "เริ่มผลิต" }],
  in_production: [{ to: "internal_review", label: "ส่งตรวจ" }],
  internal_review: [
    { to: "approved", label: "อนุมัติ" },
    { to: "revision_needed", label: "ส่งกลับแก้", needs: "comment" },
  ],
  revision_needed: [{ to: "in_production", label: "แก้ต่อ" }],
  approved: [{ to: "scheduled", label: "เข้าคิวโพสต์", needs: "scheduledAt" }],
  scheduled: [{ to: "published", label: "โพสต์แล้ว", needs: "postUrl" }],
  published: [{ to: "archived", label: "เก็บเข้าคลัง" }],
  archived: [],
};

export const LIVE_STATUS: Record<string, { label: string; cls: string }> = {
  scheduled: { label: "รอไลฟ์", cls: "bg-sky-900 text-sky-200" },
  live: { label: "กำลังไลฟ์", cls: "bg-red-900 text-red-200" },
  done: { label: "จบแล้ว", cls: "bg-emerald-900 text-emerald-200" },
  cancelled: { label: "ยกเลิก", cls: "bg-zinc-800 text-zinc-500" },
};

export const CONTENT_FORMATS = [
  { value: "short_video", label: "วิดีโอสั้น" },
  { value: "live", label: "Live" },
  { value: "image_post", label: "โพสต์รูป" },
  { value: "article", label: "บทความ" },
];

export const CONTENT_TYPES = [
  { value: "drama", label: "Drama" },
  { value: "review", label: "Review" },
  { value: "tie_in", label: "Tie-in" },
  { value: "vlog", label: "Vlog" },
  { value: "meme", label: "Meme" },
];

// ── Thai date helpers ────────────────────────────────────────

export const THAI_DAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
export const THAI_DAYS_FULL = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
export const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];
export const THAI_MONTHS_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

export function fmtDateTimeTh(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  return `${THAI_DAYS_FULL[d.getDay()]} ${d.getDate()} ${THAI_MONTHS_SHORT[d.getMonth()]} ${d.getFullYear() + 543} · ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} น.`;
}

export function fmtTimeTh(v: string | null | undefined): string {
  if (!v) return "";
  const d = new Date(v);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function fmtGmv(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (Number.isNaN(n)) return "—";
  return `฿${n.toLocaleString("th-TH", { maximumFractionDigits: 0 })}`;
}

// key วันแบบ local (YYYY-MM-DD) สำหรับจับ item ลงช่องปฏิทิน
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
