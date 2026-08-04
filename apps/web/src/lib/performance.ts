// Performance Data Loop (D6: manual + CSV — ไม่มี platform API)
import { getToken } from "./api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

// ── types ────────────────────────────────────────────────────

export interface PerformanceEntry {
  id: string;
  contentItemId: string | null;
  liveSessionId: string | null;
  platform: string;
  recordedAt: string;
  views: number | null;
  reach: number | null;
  impressions: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  watchTimeSec: number | null;
  retention3Sec: number | null;
  completionRate: number | null;
  ctr: number | null;
  productClicks: number | null;
  addToCart: number | null;
  orders: number | null;
  revenue: string | null; // Prisma Decimal → string ใน JSON
  gmv: string | null;
  cvr: number | null;
  roas: number | null;
  source: string;
  createdAt: string;
  contentItem: { id: string; title: string } | null;
  liveSession: { id: string; title: string } | null;
}

export interface PerformanceList {
  items: PerformanceEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SummaryRow {
  key: string;
  label: string;
  views: number;
  likes: number;
  orders: number;
  revenue: number;
  gmv: number;
  productClicks: number;
  roas: number | null;
  completionRate: number | null;
  ctr: number | null;
  count: number;
}

export interface PerformanceOverview {
  views: number;
  likes: number;
  orders: number;
  gmv: number;
  revenue: number;
  entryCount: number;
  topPlatform: string | null;
  topCharacter: string | null;
}

export interface ImportResult {
  imported: number;
  errors: { line: number; error: string }[];
  jobId: string;
}

export interface ContentItemOption {
  id: string;
  title: string;
  platform: string;
  status?: string;
}

export interface LiveSessionOption {
  id: string;
  title: string;
  platform: string;
}

// ── constants ────────────────────────────────────────────────

export const PLATFORMS: { value: string; label: string }[] = [
  { value: "tiktok", label: "TikTok" },
  { value: "facebook_reels", label: "Facebook Reels" },
  { value: "instagram_reels", label: "Instagram Reels" },
  { value: "youtube_shorts", label: "YouTube Shorts" },
  { value: "tiktok_shop", label: "TikTok Shop" },
  { value: "shopee_video", label: "Shopee Video" },
  { value: "lazada", label: "Lazada" },
  { value: "line_oa", label: "LINE OA" },
];

export function platformLabel(value: string): string {
  return PLATFORMS.find((p) => p.value === value)?.label ?? value;
}

// ── format helpers ───────────────────────────────────────────

export function fmtCompact(n: number | string | null | undefined): string {
  const num = n === null || n === undefined || n === "" ? null : Number(n);
  if (num === null || Number.isNaN(num)) return "—";
  return new Intl.NumberFormat("th-TH", { notation: "compact", maximumFractionDigits: 1 }).format(num);
}

export function fmtMoney(n: number | string | null | undefined): string {
  const num = n === null || n === undefined || n === "" ? null : Number(n);
  if (num === null || Number.isNaN(num)) return "—";
  return `฿${new Intl.NumberFormat("th-TH", { maximumFractionDigits: 0 }).format(num)}`;
}

export function fmtDateTimeTh(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("th-TH", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** YYYY-MM-DD ตามเวลาเครื่อง (เลี่ยง toISOString ที่เพี้ยนเป็น UTC) */
export function localDay(d: Date): string {
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** ค่า default ของ input datetime-local = ตอนนี้ */
export function localDateTimeNow(): string {
  const d = new Date();
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${localDay(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** รับ response ที่อาจเป็น array ตรง ๆ หรือ {items: []} */
export function asList<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  if (res && typeof res === "object" && Array.isArray((res as { items?: unknown }).items)) {
    return (res as { items: T[] }).items;
  }
  return [];
}

// ── multipart / download (ใช้ fetch ตรงเพราะ api() ตั้ง Content-Type: application/json) ──

export async function uploadPerformanceCsv(file: File): Promise<ImportResult> {
  const token = getToken();
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/performance/import`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const body = await res.json();
  if (!res.ok) {
    const msg = Array.isArray(body.message) ? body.message.join(", ") : body.message;
    throw new Error(msg ?? `HTTP ${res.status}`);
  }
  return body as ImportResult;
}

export async function downloadCsvTemplate(): Promise<void> {
  const token = getToken();
  const res = await fetch(`${API_BASE}/performance/import/template`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("ดาวน์โหลด template ไม่สำเร็จ");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "performance_import_template.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
