// External Capture ("สร้างจากภายนอก") ของคลัง production —
// fetcher ของ POST /library-capture/extract + helper merge draft เข้าโครงฟอร์มของแต่ละหน้า

import { api } from "./api";

export type LibraryCaptureTarget =
  | "location"
  | "gesture"
  | "camera_preset"
  | "lighting_preset"
  | "hand";

export interface LibraryCaptureStatus {
  configured: boolean;
  model: string;
}

export interface LibraryCaptureDraft {
  targetType: LibraryCaptureTarget;
  // ฟิลด์ตาม create-DTO ของคลังปลายทาง — scalar เป็น string, list เป็น string[], isChild เป็น boolean
  fields: Record<string, unknown>;
  confidence: "high" | "medium" | "low";
  notes: string;
  provenance: "ai";
  model: string;
}

export const fetchLibraryCaptureStatus = () =>
  api<LibraryCaptureStatus>("/library-capture/status");

export const extractLibraryCapture = (body: {
  targetType: LibraryCaptureTarget;
  text?: string;
  imageAssetIds?: string[];
}) =>
  api<LibraryCaptureDraft>("/library-capture/extract", {
    method: "POST",
    body: JSON.stringify(body),
  });

// merge draft ของ AI เข้าโครงฟอร์มเดิมของหน้า (empty form) — type-safe ต่อโครงเดิม:
// string เขียนทับเมื่อไม่ว่าง, array เขียนทับเมื่อเป็น array, boolean เขียนทับเมื่อเป็น boolean
// key ที่ฟอร์มไม่มี (เช่น notes) ถูกทิ้ง — ฟอร์ม create เดิมยัง submit ผ่าน endpoint ปกติ
export function mergeCaptureDraft<T extends Record<string, unknown>>(
  empty: T,
  fields: Record<string, unknown>,
): T {
  const next: Record<string, unknown> = { ...empty };
  for (const key of Object.keys(empty)) {
    const base = empty[key];
    const v = fields[key];
    if (v == null) continue;
    if (Array.isArray(base)) {
      if (Array.isArray(v)) next[key] = v.map(String).filter(Boolean);
    } else if (typeof base === "boolean") {
      if (typeof v === "boolean") next[key] = v;
    } else if (typeof v === "string" && v.trim()) {
      next[key] = v.trim();
    }
  }
  return next as T;
}
