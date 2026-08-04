// brand-book.ts — client fetchers/types ของ Brand Book share link + Export PDF (เฟส 2)
// แยกไฟล์จาก lib/api.ts (ไฟล์นั้นมีเจ้าของงานอื่นอยู่ — import แบบ read-only เท่านั้น)

import { api, type BrandBookData } from "@/lib/api";

// mirror ของค่าใน lib/api.ts (ตัวโน้นไม่ได้ export API_BASE)
export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

// ─── internal (ต้อง login) ───────────────────────────────────

// book aggregate ภายในมี bookShareToken ติดมาด้วย (spread จาก Brand) — ใช้ขับ share UI
export type BrandBookWithShare = BrandBookData & { bookShareToken?: string | null };

export function fetchBrandBookWithShare(id: string): Promise<BrandBookWithShare> {
  return api<BrandBookWithShare>(`/brands/${id}/book`);
}

/** เปิดลิงก์แชร์ (idempotent) — rotate=true สร้าง token ใหม่ ลิงก์เก่าตายทันที */
export function enableBrandShare(id: string, rotate = false): Promise<{ token: string }> {
  return api<{ token: string }>(`/brands/${id}/share`, {
    method: "POST",
    body: JSON.stringify({ rotate }),
  });
}

/** ปิดลิงก์แชร์ (revoke) */
export function revokeBrandShare(id: string): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>(`/brands/${id}/share`, { method: "DELETE" });
}

/** URL หน้าแชร์ฝั่งเว็บ (โดเมนปัจจุบัน) — เรียกได้เฉพาะฝั่ง client */
export function shareUrlFor(token: string): string {
  return `${window.location.origin}/share/brand-book/${token}`;
}

// ─── public (ไม่ต้อง login — หน้า /share/brand-book/[token]) ──

// payload สาธารณะ = BrandBookData ตัดข้อมูลภายในออก (ฝั่ง API เป็นคนตัด)
export type PublicBrandBook = Omit<
  BrandBookData,
  "clients" | "productCount" | "bookApproverContact" | "contact" | "notes"
>;

/** error เฉพาะกรณีลิงก์ถูกปิด/ไม่ถูกต้อง (404) — หน้าแชร์ใช้แยก state */
export class ShareLinkInvalidError extends Error {
  constructor() {
    super("ลิงก์นี้ถูกปิดหรือไม่ถูกต้อง");
    this.name = "ShareLinkInvalidError";
  }
}

/** ดึง book สาธารณะด้วย plain fetch — ไม่แนบ Bearer token, ไม่เด้ง /login */
export async function fetchPublicBrandBook(token: string): Promise<PublicBrandBook> {
  const res = await fetch(`${API_BASE}/public/brand-book/${encodeURIComponent(token)}`);
  if (res.status === 404) throw new ShareLinkInvalidError();
  if (!res.ok) throw new Error("โหลด Brand Book ไม่สำเร็จ");
  return (await res.json()) as PublicBrandBook;
}

/** URL รูป/ไฟล์สาธารณะ — ใช้เป็น <img src> ตรงๆ ได้ (ไม่ต้องมี auth header) */
export function publicAssetUrl(token: string, assetId: string): string {
  return `${API_BASE}/public/brand-book/${encodeURIComponent(token)}/asset/${assetId}`;
}

// ─── Export PDF (print stylesheet) ───────────────────────────
// ใช้ร่วมกันทั้งหน้า /brands/[id]/book (ภายใน) และ /share/brand-book/[token] (ลูกค้า):
// - ซ่อน chrome ของแอป (sidebar/header/nav/TOC) + ปุ่ม action/อัปโหลด (.print-hide)
// - บังคับพื้นขาว + ตัวหนังสือเข้ม (พื้น zinc-950 กินหมึกเปล่าๆ)
// - swatch สี (.print-color) คงสีจริงด้วย print-color-adjust: exact
// - การ์ด (.print-card) ไม่ให้โดนตัดกลางหน้า
export const BRAND_BOOK_PRINT_CSS = `
@media print {
  aside, header, nav, .print-hide { display: none !important; }
  .ml-56 { margin-left: 0 !important; }
  .sticky { position: static !important; }
  html, body { background: #ffffff !important; }
  body *:not(.print-color) {
    background: transparent !important;
    box-shadow: none !important;
    text-shadow: none !important;
    backdrop-filter: none !important;
  }
  body * {
    color: #18181b !important;
    border-color: #d4d4d8 !important;
  }
  [class*="text-zinc-5"], [class*="text-zinc-6"], [class*="text-zinc-4"] {
    color: #52525b !important;
  }
  .print-color {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .print-card, figure, tr { break-inside: avoid; page-break-inside: avoid; }
  h1, h2 { break-after: avoid; }
  a { text-decoration: none !important; }
}
`;
