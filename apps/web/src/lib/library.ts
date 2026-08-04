// Types + labels ของ Library wave — Locations (§14) / Voice Profiles (§15) / Rights (§16) / QC Reviews (§10)

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ─── Locations ───────────────────────────────────────────────

export interface LocationItem {
  id: string;
  name: string;
  type: string | null;
  regionStyle: string | null;
  mood: string | null;
  lighting: string | null;
  timeOfDay: string | null;
  prompt: string | null;
  negativePrompt: string | null;
  continuityNotes: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface LocationDetail extends LocationItem {
  episodesCount: number;
}

export const LOCATION_STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  active: { label: "Active", cls: "bg-emerald-900 text-emerald-200" },
  archived: { label: "Archived", cls: "bg-zinc-800 text-zinc-500" },
};

// ─── Voice Profiles ──────────────────────────────────────────

export interface VoiceProfile {
  id: string;
  characterId: string;
  voiceType: string | null;
  tone: string | null;
  accent: string | null;
  speakingSpeed: string | null;
  laughStyle: string | null;
  emotionalRange: string[];
  sampleDialogues: string[];
  aiVoiceModel: string | null;
  humanVoiceActor: string | null;
  usageRights: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  character?: { id: string; nameTh: string; displayCode: string } | null;
}

export const VOICE_STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-zinc-700 text-zinc-200" },
  approved: { label: "Approved", cls: "bg-emerald-900 text-emerald-200" },
  archived: { label: "Archived", cls: "bg-zinc-800 text-zinc-500" },
};

// ─── Rights ──────────────────────────────────────────────────

export const RIGHT_ENTITY_TYPES = ["character", "asset", "voice", "prompt", "campaign"] as const;

export interface RightItem {
  id: string;
  entityType: string;
  entityId: string;
  owner: string;
  commercialUsage: boolean;
  usageScope: string | null;
  territory: string | null;
  duration: string | null;
  exclusivity: string | null;
  restrictedCategories: string[];
  disclosureRequired: boolean;
  legalStatus: string;
  riskLevel: string;
  createdAt: string;
  updatedAt: string;
}

export const LEGAL_STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-zinc-700 text-zinc-200" },
  internal_only: { label: "ใช้ภายในเท่านั้น", cls: "bg-blue-900 text-blue-200" },
  commercial_approved: { label: "อนุมัติเชิงพาณิชย์", cls: "bg-emerald-900 text-emerald-200" },
  restricted: { label: "จำกัดการใช้", cls: "bg-orange-900 text-orange-200" },
  expired: { label: "หมดอายุ", cls: "bg-red-900 text-red-200" },
  archived: { label: "Archived", cls: "bg-zinc-800 text-zinc-500" },
};

// mirror state machine ฝั่ง server (rights.service)
export const LEGAL_TRANSITIONS: Record<string, string[]> = {
  draft: ["internal_only", "restricted", "expired", "archived"],
  internal_only: ["commercial_approved", "restricted", "expired", "archived"],
  commercial_approved: ["restricted", "expired", "archived"],
  restricted: ["expired", "archived"],
  expired: ["archived"],
  archived: [],
};

export const RISK_LABEL: Record<string, { label: string; cls: string }> = {
  low: { label: "เสี่ยงต่ำ", cls: "bg-emerald-900 text-emerald-200" },
  medium: { label: "เสี่ยงกลาง", cls: "bg-amber-900 text-amber-200" },
  high: { label: "เสี่ยงสูง", cls: "bg-red-900 text-red-200" },
};

// ─── QC Reviews ──────────────────────────────────────────────

export const QC_ENTITY_TYPES = [
  "character",
  "asset",
  "prompt",
  "episode",
  "shot",
  "content",
] as const;

export const QC_CATEGORIES = [
  "character_consistency",
  "visual_quality",
  "prompt_quality",
  "asset_readiness",
  "product_claim",
  "brand_safety",
  "rights",
  "originality",
  "publishing_readiness",
] as const;

export const QC_CATEGORY_LABEL: Record<string, string> = {
  character_consistency: "ความคงเส้นคงวาของตัวละคร",
  visual_quality: "คุณภาพงานภาพ",
  prompt_quality: "คุณภาพ prompt",
  asset_readiness: "ความพร้อมของ asset",
  product_claim: "คำกล่าวอ้างสินค้า",
  brand_safety: "ความปลอดภัยของแบรนด์",
  rights: "สิทธิ์การใช้งาน",
  originality: "ความเป็นต้นฉบับ",
  publishing_readiness: "ความพร้อมเผยแพร่",
};

// ความหมาย score ตาม PRD §10
export const SCORE_LABEL: Record<number, { label: string; cls: string }> = {
  5: { label: "5 — ดีมาก ใช้ production ได้", cls: "bg-emerald-900 text-emerald-200" },
  4: { label: "4 — ใช้ได้ มีจุดเล็กน้อย", cls: "bg-emerald-900 text-emerald-200" },
  3: { label: "3 — พอใช้ ต้องระวัง", cls: "bg-amber-900 text-amber-200" },
  2: { label: "2 — หลุด ต้องแก้", cls: "bg-red-900 text-red-200" },
  1: { label: "1 — ใช้ไม่ได้", cls: "bg-red-900 text-red-200" },
};

export interface QcReviewItem {
  id: string;
  entityType: string;
  entityId: string;
  category: string;
  score: number;
  comment: string | null;
  reviewerId: string;
  createdAt: string;
  reviewerName?: string | null;
}

export interface QcSummary {
  avgScore: number | null;
  byCategory: Record<string, number>;
  count: number;
  latest: QcReviewItem | null;
}
