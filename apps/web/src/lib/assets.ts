import { clearToken, getToken } from "@/lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

export interface AssetLink {
  id: string;
  assetId: string;
  entityType: string;
  entityId: string;
  linkRole: string; // reference, primary_reference, deliverable, thumbnail
}

export interface Asset {
  id: string;
  assetType: string;
  storageKey: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  width: number | null;
  height: number | null;
  duration: number | null;
  checksumSha256: string | null;
  generationTool: string | null;
  status: string; // AssetStatus
  uploadedBy: string;
  createdAt: string;
  archivedAt: string | null;
  links: AssetLink[];
}

export interface AssetList {
  items: Asset[];
  total: number;
  page: number;
  pageSize: number;
}

export const ASSET_STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  uploaded: { label: "Uploaded", cls: "bg-zinc-700 text-zinc-200" },
  ai_generated: { label: "AI Generated", cls: "bg-violet-900 text-violet-200" },
  selected: { label: "Selected", cls: "bg-blue-900 text-blue-200" },
  rejected: { label: "Rejected", cls: "bg-red-900 text-red-200" },
  approved_reference: { label: "Approved Ref", cls: "bg-emerald-900 text-emerald-200" },
  production_used: { label: "Production Used", cls: "bg-amber-900 text-amber-200" },
  archived: { label: "Archived", cls: "bg-zinc-800 text-zinc-500" },
};

// asset status ถัดไปที่กดได้จาก UI (ตาม state machine ฝั่ง API)
export const ASSET_NEXT_ACTIONS: Record<string, { to: string; label: string }[]> = {
  uploaded: [
    { to: "selected", label: "เลือกใช้" },
    { to: "rejected", label: "ไม่ผ่าน" },
  ],
  ai_generated: [
    { to: "selected", label: "เลือกใช้" },
    { to: "rejected", label: "ไม่ผ่าน" },
  ],
  selected: [{ to: "approved_reference", label: "Approve Ref" }],
  approved_reference: [{ to: "production_used", label: "ใช้ใน Production" }],
};

async function parseError(res: Response): Promise<never> {
  if (res.status === 401 && typeof window !== "undefined") {
    clearToken();
    window.location.href = "/login";
    throw new Error("session หมดอายุ");
  }
  let msg = `HTTP ${res.status}`;
  try {
    const body = await res.json();
    msg = Array.isArray(body.message) ? body.message.join(", ") : (body.message ?? msg);
  } catch {
    // ไม่ใช่ JSON — ใช้ status code ไปก่อน
  }
  throw new Error(msg);
}

// upload แบบ multipart — ใช้ api() ไม่ได้เพราะ helper บังคับ Content-Type: application/json
export async function uploadAsset(
  file: File,
  opts: { assetType: string; entityType?: string; entityId?: string; linkRole?: string },
): Promise<Asset> {
  const token = getToken();
  const form = new FormData();
  form.append("file", file);
  form.append("assetType", opts.assetType);
  if (opts.entityType) form.append("entityType", opts.entityType);
  if (opts.entityId) form.append("entityId", opts.entityId);
  if (opts.linkRole) form.append("linkRole", opts.linkRole);

  const res = await fetch(`${API_BASE}/assets`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form, // browser ใส่ multipart boundary ให้เอง
  });
  if (!res.ok) await parseError(res);
  return res.json();
}

// ลากรูปจากเว็บอื่น (ได้ URL) → ให้ server fetch เก็บเข้า storage (POST /assets/import-url)
// server กัน SSRF ให้แล้ว: https เท่านั้น, image/* ≤10MB, timeout 15 วิ
export async function importAssetFromUrl(
  url: string,
  opts: { entityType: string; entityId: string; linkRole?: string; assetType?: string },
): Promise<Asset> {
  const token = getToken();
  const res = await fetch(`${API_BASE}/assets/import-url`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ url, ...opts }),
  });
  if (!res.ok) await parseError(res);
  return res.json();
}

// 🗑 เอารูปออกจากระบบ (archive — state machine อนุญาตจากทุกสถานะ, หายจากทุก gallery)
export async function archiveAsset(assetId: string): Promise<void> {
  const token = getToken();
  const res = await fetch(`${API_BASE}/assets/${assetId}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ status: "archived" }),
  });
  if (!res.ok) await parseError(res);
}

// รูปทั้งหมดของ entity (ไล่ทุกหน้า — API หน้าละ 20) เอาเฉพาะ image ที่ยังไม่ archive
// ไม่จำกัดจำนวนรูปฝั่ง UI — maxPages เป็นแค่กันชนกัน loop ไม่จบ (25 หน้า = 500 รูป)
export async function fetchEntityImageAssets(
  entityType: string,
  entityId: string,
  maxPages = 25,
): Promise<Asset[]> {
  const token = getToken();
  const all: Asset[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const res = await fetch(
      `${API_BASE}/assets?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}&page=${page}`,
      { headers: token ? { Authorization: `Bearer ${token}` } : {} },
    );
    if (!res.ok) await parseError(res);
    const body: AssetList = await res.json();
    all.push(...body.items);
    if (all.length >= body.total || body.items.length === 0) break;
  }
  return all.filter((a) => a.mimeType.startsWith("image/") && !a.archivedAt);
}

// GET /assets/:id/file ต้องส่ง Bearer token — ใช้เป็น <img src> ตรง ๆ ไม่ได้
// เลย fetch เป็น blob แล้วคืน object URL (caller ต้อง revokeObjectURL เอง)
export async function fetchAssetObjectUrl(assetId: string): Promise<string> {
  const token = getToken();
  const res = await fetch(`${API_BASE}/assets/${assetId}/file`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) await parseError(res);
  return URL.createObjectURL(await res.blob());
}

// ⬇️ ดาวน์โหลดไฟล์ asset (ทุก mime type) — blob + <a download> ชื่อไฟล์เดิม
export async function downloadAssetFile(asset: Pick<Asset, "id" | "originalFilename">): Promise<void> {
  const url = await fetchAssetObjectUrl(asset.id);
  const a = document.createElement("a");
  a.href = url;
  a.download = asset.originalFilename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // revoke หลัง browser เริ่มดาวน์โหลดแล้ว
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ⬇️ โหลดทุกไฟล์ของ entity เป็น zip เดียว (ปุ่ม "โหลดทั้งหมด" ใน Asset Gallery)
export async function downloadEntityAssetsZip(
  entityType: string,
  entityId: string,
  filename: string,
): Promise<void> {
  const token = getToken();
  const res = await fetch(`${API_BASE}/assets/zip/${entityType}/${entityId}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) await parseError(res);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".zip") ? filename : `${filename}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
