// AI Director (SRS slice 4, §3.13) — types + fetchers (additive)
// แนะนำสูตรคลิปด้วย Claude → บันทึกเป็น InteractionTemplate

import { api } from "./api";
import { Paged, PromptPackage } from "./interaction";

export const DIRECTOR_STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  draft: { label: "ร่าง", cls: "bg-zinc-700 text-zinc-200" },
  generating: { label: "กำลังแนะนำ", cls: "bg-blue-900/70 text-blue-200" },
  ready: { label: "พร้อมใช้", cls: "bg-emerald-900 text-emerald-200" },
  applied: { label: "บันทึกเป็นเทมเพลตแล้ว", cls: "bg-amber-900 text-amber-200" },
  failed: { label: "ล้มเหลว", cls: "bg-red-900 text-red-200" },
  archived: { label: "เก็บถาวร", cls: "bg-zinc-800 text-zinc-500" },
};

// step summary ที่ enrich มากับ recommendation (ชื่อ gesture/hand/camera/lighting)
export interface DirectorStepGesture {
  id: string;
  key: string | null;
  name: string;
  category: string | null;
  riskLevel: string;
  naturalDurationSec: number | null;
  requiredProductState: string | null;
  resultingProductState: string | null;
}
export interface DirectorStepHand {
  id: string;
  displayCode: string;
  name: string;
  category: string;
  skinTone: string | null;
}
export interface DirectorStepCamera {
  id: string;
  displayCode: string;
  name: string;
  shotSize: string | null;
  angle: string | null;
  cameraMovement: string | null;
}
export interface DirectorStepLighting {
  id: string;
  displayCode: string;
  name: string;
  mood: string | null;
  colorTemperature: string | null;
}

export interface DirectorRecipeStep {
  stepOrder: number;
  section: string;
  gestureId: string | null;
  handId: string | null;
  cameraId: string | null;
  lightingId: string | null;
  durationSec: number | null;
  reason: string;
  gesture?: DirectorStepGesture | null;
  hand?: DirectorStepHand | null;
  camera?: DirectorStepCamera | null;
  lighting?: DirectorStepLighting | null;
}

export interface DirectorResultJson {
  storyboardType: string | null;
  durationSec: number | null;
  summary: string;
  steps: DirectorRecipeStep[];
  reasons: { topic: string; text: string }[];
  defaults: { handId: string | null; cameraId: string | null; lightingId: string | null };
  promptPackage: PromptPackage;
  validation: { errors: string[]; warnings: string[] };
  dropped: { gestureIds: string[]; handIds: string[]; cameraIds: string[]; lightingIds: string[] };
  meta?: {
    productName?: string | null;
    candidateCounts?: Record<string, number>;
    model?: string;
  };
}

export interface DirectorRun {
  id: string;
  displayCode: string;
  productId: string | null;
  brandId: string | null;
  productCategory: string | null;
  packagingType: string | null;
  platform: string | null;
  targetDurationSec: number | null;
  objective: string | null;
  creativeStyle: string | null;
  language: string;
  preferredHandId: string | null;
  notes: string | null;
  recommendedTemplateId: string | null;
  resultJson: DirectorResultJson | null;
  reasoning: string | null;
  status: string;
  errorMessage: string | null;
  appliedTemplateId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  // enriched (detail/recommend response)
  steps?: DirectorRecipeStep[];
}

export interface RecommendDirectorInput {
  productId?: string;
  brandId?: string;
  productCategory?: string;
  packagingType?: string;
  platform?: string;
  targetDurationSec?: number;
  objective?: string;
  creativeStyle?: string;
  language?: string;
  preferredHandId?: string;
  notes?: string;
}

export interface DirectorStatus {
  configured: boolean;
  model: string;
}

// ─── fetchers ────────────────────────────────────────────────
export const fetchDirectorStatus = () => api<DirectorStatus>("/director/status");

export function fetchDirectorRuns(query: Record<string, string> = {}) {
  const qs = new URLSearchParams();
  Object.entries(query).forEach(([k, v]) => v && qs.set(k, v));
  const s = qs.toString();
  return api<Paged<DirectorRun>>(`/director${s ? `?${s}` : ""}`);
}

export const fetchDirectorRun = (id: string) => api<DirectorRun>(`/director/${id}`);

export const recommendDirector = (body: RecommendDirectorInput) =>
  api<DirectorRun>("/director/recommend", { method: "POST", body: JSON.stringify(body) });

// apply → InteractionTemplate (มี id ให้ลิงก์ต่อ /interaction-templates/[id])
export const applyDirectorRun = (id: string) =>
  api<{ id: string; displayCode: string }>(`/director/${id}/apply`, { method: "POST" });

export const deleteDirectorRun = (id: string) =>
  api<DirectorRun>(`/director/${id}`, { method: "DELETE" });

// ประเภท storyboard / objective / style ให้เลือกในวิซาร์ด (free string ก็ได้ — นี่คือ preset)
export const DIRECTOR_OBJECTIVES = ["awareness", "conversion", "education", "promo"] as const;
export const DIRECTOR_STYLES = ["premium", "playful", "clinical", "natural", "luxury"] as const;
export const DIRECTOR_PLATFORMS = ["tiktok", "facebook_reels", "instagram_reels", "youtube_shorts"] as const;
