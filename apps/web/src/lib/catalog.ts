// Types + constants สำหรับ Products/Brands + Campaigns

import { api } from "./api";

export interface Brand {
  id: string;
  name: string;
  contact: string | null;
  notes: string | null;
  status: string; // active, archived
  createdAt: string;
  updatedAt: string;
  _count?: { products: number };
  productCount?: number; // API build ใหม่แนบมาด้วย (เท่ากับ _count.products)
}

// หมวดหมู่สินค้า — มาจาก API (GET /categories) แทน constant เดิม
export interface ProductCategory {
  id: string;
  key: string; // ค่าที่เก็บใน Product.category
  label: string; // ชื่อไทย แก้ได้
  sortOrder: number;
  status: string; // active, archived
  builtin: boolean; // 7 ตัวพื้นฐาน ลบไม่ได้ / key แก้ไม่ได้
  productCount: number;
}

export interface PlatformLinks {
  shopee?: string;
  tiktok_shop?: string;
  lazada?: string;
}

// ── 📋 Review Brief (ข้อมูลรีวิว) — กรอกครั้งเดียวที่ตัวสินค้า ใช้ทุก Clip Job ──
export interface ReviewBrief {
  highlights?: string[]; // จุดเด่น/USP
  specs?: string; // สรรพคุณ/สเปกหลัก
  targetAudience?: string; // กลุ่มเป้าหมาย
  painPoint?: string; // ปัญหาที่แก้
  howToUse?: string[]; // วิธีใช้ (ทีละขั้น)
  promo?: string; // โปรโมชั่น
  cautions?: string; // ข้อควรระวัง/ห้ามพูด
  extraNote?: string; // โน้ตเพิ่มเติม
}

/** true เมื่อ brief มีข้อมูลจริงอย่างน้อย 1 ช่อง (ใช้โชว์ badge 📋 / warning) */
export function hasReviewBrief(b: ReviewBrief | null | undefined): boolean {
  if (!b) return false;
  return Boolean(
    (b.highlights ?? []).some((h) => h.trim()) ||
      (b.howToUse ?? []).some((h) => h.trim()) ||
      b.specs?.trim() ||
      b.targetAudience?.trim() ||
      b.painPoint?.trim() ||
      b.promo?.trim() ||
      b.cautions?.trim() ||
      b.extraNote?.trim(),
  );
}

export interface Product {
  id: string;
  displayCode: string;
  name: string;
  brandId: string | null;
  category: string | null;
  productType?: string | null;
  packagingType?: string | null;
  textureType?: string | null;
  description: string | null;
  price: string | number | null; // Prisma Decimal → serialize เป็น string
  salePrice: string | number | null;
  platformLinks: PlatformLinks | null;
  claimRiskLevel: string; // low, medium, high
  restrictedClaims: string[];
  commissionNote: string | null;
  status: string; // active, paused, discontinued
  createdAt: string;
  updatedAt: string;
  brand?: { id: string; name: string } | null;
  // ─── Affiliate (Phase 1) — optional (API build ใหม่) ─────────
  isAffiliate?: boolean;
  affiliateUrl?: string | null;
  affiliatePlatform?: string | null;
  commissionPct?: number | null;
  // ─── นำเข้าจากไฟล์ export (shoptool.app / pyptools.io / ...) — optional ──
  sourcePlatform?: string | null; // เครื่องมือต้นทาง
  sourceType?: string | null; // variant เช่น flash_sale | livextra | product_v3v4
  externalItemId?: string | null; // shopee item id
  externalShopId?: string | null;
  shopName?: string | null;
  rating?: number | null;
  soldMonth?: number | null;
  soldTotal?: number | null;
  stockQty?: number | null;
  sourceRaw?: Record<string, unknown> | null; // ทุกคอลัมน์ต้นฉบับ (แสดง "ข้อมูลต้นทาง")
  importedAt?: string | null;
  archivedAt?: string | null; // มีค่า = อยู่ในกรุ (มุมมอง archived=1)
  // 📋 ข้อมูลรีวิว — optional (API build เก่าไม่มี)
  reviewBrief?: ReviewBrief | null;
}

export interface ProductDetail extends Product {
  usage: { campaigns: number; episodes: number; contents: number; lives: number };
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CampaignCharacterRef {
  id: string;
  nameTh: string;
  nameEn?: string | null;
  displayCode: string;
  status?: string;
}

export interface CampaignListItem {
  id: string;
  displayCode: string;
  name: string;
  clientBrand: string | null;
  objective: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  updatedAt: string;
  characters: CampaignCharacterRef[];
  products: { id: string; name: string }[];
  counts: { episodes: number; contents: number };
}

export interface CampaignDetail {
  id: string;
  displayCode: string;
  name: string;
  clientBrand: string | null;
  objective: string | null;
  campaignType: string | null;
  startDate: string | null;
  endDate: string | null;
  targetKpi: Record<string, unknown> | null;
  ownerId: string | null;
  status: string;
  updatedAt: string;
  characters: CampaignCharacterRef[];
  products: { id: string; name: string; displayCode: string; status: string; claimRiskLevel: string }[];
  episodes: { id: string; displayCode: string; title: string; status: string }[];
  contents: { id: string; title: string; status: string; platform: string }[];
}

// ── constants ────────────────────────────────────────────────

// หมวดหลัก Shopee — sync กับ BUILTIN_CATEGORIES ใน apps/api/prisma/seed.ts
// ใช้เป็น fallback ตอน API เก่า + map key→label บนการ์ด/list
export const PRODUCT_CATEGORIES = [
  { value: "fashion", label: "แฟชั่น" },
  { value: "bags", label: "กระเป๋า" },
  { value: "shoes", label: "รองเท้า" },
  { value: "accessories", label: "เครื่องประดับและอัญมณี" },
  { value: "watches_eyewear", label: "นาฬิกาและแว่นตา" },
  { value: "beauty", label: "ความงาม" },
  { value: "supplement", label: "สุขภาพและอาหารเสริม" },
  { value: "mom_baby", label: "แม่และเด็ก" },
  { value: "home", label: "ของใช้ในบ้าน" },
  { value: "home_appliances", label: "เครื่องใช้ไฟฟ้าในบ้าน" },
  { value: "gadget", label: "มือถือและแกดเจ็ต" },
  { value: "computers", label: "คอมพิวเตอร์และแล็ปท็อป" },
  { value: "cameras", label: "กล้องและอุปกรณ์ถ่ายภาพ" },
  { value: "gaming", label: "เกมและอุปกรณ์เกม" },
  { value: "food", label: "อาหารและเครื่องดื่ม" },
  { value: "sports_outdoor", label: "กีฬาและกิจกรรมกลางแจ้ง" },
  { value: "pets", label: "สัตว์เลี้ยง" },
  { value: "automotive", label: "ยานยนต์" },
  { value: "tools_home_improvement", label: "เครื่องมือช่างและปรับปรุงบ้าน" },
  { value: "books_stationery", label: "หนังสือและเครื่องเขียน" },
  { value: "toys_hobbies", label: "ของเล่นและงานอดิเรก" },
  { value: "travel_luggage", label: "การเดินทางและกระเป๋าเดินทาง" },
  { value: "other", label: "อื่นๆ" },
];

export const CLAIM_RISK: Record<string, { label: string; cls: string }> = {
  low: { label: "Low", cls: "bg-emerald-900 text-emerald-200" },
  medium: { label: "Medium", cls: "bg-amber-900 text-amber-200" },
  high: { label: "High", cls: "bg-red-900 text-red-200" },
};

export const PRODUCT_STATUS: Record<string, { label: string; cls: string }> = {
  active: { label: "ขายอยู่", cls: "bg-emerald-900 text-emerald-200" },
  paused: { label: "พักขาย", cls: "bg-amber-900 text-amber-200" },
  discontinued: { label: "เลิกขาย", cls: "bg-zinc-800 text-zinc-500" },
};

export const CAMPAIGN_OBJECTIVES = [
  { value: "awareness", label: "Awareness" },
  { value: "engagement", label: "Engagement" },
  { value: "follower_growth", label: "Follower Growth" },
  { value: "product_click", label: "Product Click" },
  { value: "order", label: "Order" },
  { value: "gmv", label: "GMV" },
  { value: "character_launch", label: "Character Launch" },
  { value: "series_launch", label: "Series Launch" },
];

export const CAMPAIGN_STATUS: Record<string, { label: string; cls: string }> = {
  brief: { label: "Brief", cls: "bg-zinc-700 text-zinc-200" },
  planning: { label: "Planning", cls: "bg-blue-900 text-blue-200" },
  production: { label: "Production", cls: "bg-purple-900 text-purple-200" },
  review: { label: "Review", cls: "bg-orange-900 text-orange-200" },
  published: { label: "Published", cls: "bg-emerald-900 text-emerald-200" },
  completed: { label: "Completed", cls: "bg-amber-900 text-amber-200" },
  archived: { label: "Archived", cls: "bg-zinc-800 text-zinc-500" },
};

// ปุ่ม transition ต่อ status (ตาม state machine ฝั่ง API)
export const CAMPAIGN_NEXT: Record<string, { to: string; label: string; approve?: boolean }[]> = {
  brief: [{ to: "planning", label: "เริ่มวางแผน →" }],
  planning: [{ to: "production", label: "เข้าโปรดักชัน →" }],
  production: [{ to: "review", label: "ส่งตรวจ →" }],
  review: [{ to: "published", label: "Approve & Publish", approve: true }],
  published: [{ to: "completed", label: "ปิดแคมเปญ" }],
  completed: [],
  archived: [],
};

export function fmtPrice(v: string | number | null | undefined): string {
  if (v == null || v === "") return "—";
  const n = typeof v === "number" ? v : parseFloat(v);
  if (Number.isNaN(n)) return "—";
  return n.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function fmtDate(v: string | null | undefined): string {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}

// ─── Product Import จากไฟล์ export (shoptool.app / pyptools.io / ...) ─────────
export interface ImportMappedRow {
  name?: string;
  productUrl?: string;
  affiliateUrl?: string;
  price?: number;
  salePrice?: number;
  commissionPct?: number;
  externalItemId?: string;
  externalShopId?: string;
  shopName?: string;
  rating?: number;
  soldMonth?: number;
  soldTotal?: number;
  stockQty?: number;
  category?: string;
  firstImage?: string;
  sourceRaw: Record<string, unknown>;
}

export interface ImportPreviewResult {
  detectedPlatform: string;
  sourceType: string | null;
  profileId: string;
  totalRows: number;
  headers: string[];
  mappedColumns: string[];
  unmappedColumns: string[];
  mappedPreview: ImportMappedRow[];
}

export interface ImportFailedRow {
  row: number;
  reason: string;
}

export interface ImportResult {
  platform: string;
  sourceType: string | null;
  profileId: string;
  total: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  truncated: boolean;
  truncatedNote?: string;
  failedRows: ImportFailedRow[];
}

// ป้ายชื่อเครื่องมือต้นทาง (badge) — เพิ่มเครื่องมือใหม่ = เพิ่ม 1 แถว
export const SOURCE_PLATFORM_LABEL: Record<string, { label: string; cls: string }> = {
  "shoptool.app": { label: "ShopTool", cls: "bg-orange-900 text-orange-200" },
  "pyptools.io": { label: "PYP Tools", cls: "bg-indigo-900 text-indigo-200" },
  generic: { label: "อื่นๆ", cls: "bg-zinc-800 text-zinc-300" },
};

// import ใช้ multipart — api() บังคับ Content-Type: application/json เลยต้อง fetch ตรง
async function postImportFile<T>(path: string, file: File, fields?: Record<string, string>): Promise<T> {
  const token = getTokenForImport();
  const form = new FormData();
  form.append("file", file);
  for (const [k, v] of Object.entries(fields ?? {})) if (v) form.append(k, v);
  const res = await fetch(`${IMPORT_API_BASE}${path}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form, // browser ใส่ multipart boundary ให้เอง
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = Array.isArray(body.message) ? body.message.join(", ") : body.message;
    throw new Error(msg ?? `HTTP ${res.status}`);
  }
  return body as T;
}

const IMPORT_API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
function getTokenForImport(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("aistar_token");
}

// ─── Products Management: archive/restore/bulk/hard-delete ──────────────

export const archiveProduct = (id: string) =>
  api<Product>(`/products/${id}/archive`, { method: "POST" });

export const restoreProduct = (id: string) =>
  api<Product>(`/products/${id}/restore`, { method: "POST" });

export const bulkArchiveProducts = (ids: string[]) =>
  api<{ archived: number }>("/products/bulk/archive", {
    method: "POST",
    body: JSON.stringify({ ids }),
  });

export const bulkRestoreProducts = (ids: string[]) =>
  api<{ restored: number }>("/products/bulk/restore", {
    method: "POST",
    body: JSON.stringify({ ids }),
  });

export const bulkSetProductCategory = (ids: string[], category: string) =>
  api<{ updated: number }>("/products/bulk/set-category", {
    method: "POST",
    body: JSON.stringify({ ids, category }),
  });

export const bulkSetProductBrand = (ids: string[], brandId: string | null) =>
  api<{ updated: number }>("/products/bulk/set-brand", {
    method: "POST",
    body: JSON.stringify({ ids, brandId }),
  });

// ลบถาวร (admin เท่านั้น) — 409 ถ้ามีงานอ้างอิง (message ภาษาไทยแจกแจงจำนวนต่อประเภท)
export const hardDeleteProduct = (id: string) =>
  api<{ ok: boolean }>(`/products/${id}`, { method: "DELETE" });

// ── 📋 Review Brief helpers ──────────────────────────────────────────────

/** บันทึก Review Brief กลับเข้าตัวสินค้า (PATCH /products/:id) */
export const saveReviewBrief = (id: string, reviewBrief: ReviewBrief) =>
  api<Product>(`/products/${id}`, { method: "PATCH", body: JSON.stringify({ reviewBrief }) });

/** 🤖 AI แตกฟิลด์จากข้อความหน้า Shopee (+รูปในคลังสูงสุด 4) — ไม่ auto-save (โชว์ preview ก่อน) */
export const extractReviewBrief = (id: string, text: string, assetIds: string[]) =>
  api<{ brief: ReviewBrief; usage: { inputTokens: number; outputTokens: number }; model: string }>(
    `/products/${id}/review-brief/extract`,
    { method: "POST", body: JSON.stringify({ text, assetIds }) },
  );

export const previewProductImport = (file: File) =>
  postImportFile<ImportPreviewResult>("/products/import/preview", file);

export const runProductImport = (
  file: File,
  override?: { platform?: string; sourceType?: string },
) => postImportFile<ImportResult>("/products/import", file, override as Record<string, string>);
