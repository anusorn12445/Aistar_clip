// Types + helpers ของ Prompt Library (§F.2 — platform-agnostic ตาม D4)

import { api } from "./api";

export interface Platform {
  id: string;
  key: string;
  name: string;
  status: string;
}

export interface PromptVersion {
  id: string;
  promptId: string;
  versionLabel: string;
  body: string;
  negativeBody: string | null;
  targetPlatform: string;
  modelName: string | null;
  modelVersion: string | null;
  generationParams: Record<string, unknown> | null;
  seed: string | null;
  performanceNote: string | null;
  sourceUrl?: string | null; // ที่มา (โพสต์/กลุ่ม Facebook) — quick-capture บันทึกให้
  createdAt: string;
}

// ─── Relations (เชื่อม ตัวละคร/สินค้า/ลูกค้า/แบรนด์) ─────────

export type RelationEntityType = "character" | "product" | "client" | "brand";

export const RELATION_ENTITY_TYPES: RelationEntityType[] = [
  "character",
  "product",
  "client",
  "brand",
];

export const RELATION_TYPE_META: Record<RelationEntityType, { icon: string; label: string }> = {
  character: { icon: "🎭", label: "ตัวละคร" },
  product: { icon: "🛍️", label: "สินค้า" },
  client: { icon: "🤝", label: "ลูกค้า" },
  brand: { icon: "🏷️", label: "แบรนด์" },
};

// item จาก GET /prompts/:id/relations และ relations[] ใน list
export interface PromptRelation {
  id?: string; // linkId — ของ staged (ยังไม่บันทึก) ไม่มี
  entityType: RelationEntityType;
  entityId: string;
  name: string;
  code?: string | null; // displayCode ของ character/product
}

export const fetchPromptRelations = (promptId: string) =>
  api<PromptRelation[]>(`/prompts/${promptId}/relations`);

export const addPromptRelation = (
  promptId: string,
  rel: { entityType: RelationEntityType; entityId: string },
) =>
  api(`/prompts/${promptId}/relations`, {
    method: "POST",
    body: JSON.stringify({ entityType: rel.entityType, entityId: rel.entityId }),
  });

export const removePromptRelation = (
  promptId: string,
  rel: { entityType: RelationEntityType; entityId: string },
) =>
  api<{ removed: number }>(`/prompts/${promptId}/relations`, {
    method: "DELETE",
    body: JSON.stringify({ entityType: rel.entityType, entityId: rel.entityId }),
  });

export interface Prompt {
  id: string;
  name: string;
  promptType: string;
  status: string;
  bestFlag: boolean;
  createdAt: string;
  updatedAt: string;
  latestVersion?: PromptVersion | null;
  relations?: PromptRelation[]; // API build ใหม่แนบมากับ list — build เก่าไม่มี
}

export interface PromptDetail extends Omit<Prompt, "latestVersion"> {
  versions: PromptVersion[];
}

export interface PromptList {
  items: Prompt[];
  total: number;
  page: number;
  pageSize: number;
}

// ─── Prompt Hub (🌐 ทุกแหล่ง) — live reference จาก 6 คลัง ────
// แถว hub อ่านสดจากตารางต้นทางทุกครั้ง (ไม่ก๊อปอัตโนมัติ) — แก้ไขที่ต้นทางเท่านั้น

export type HubSourceType =
  | "location"
  | "gesture"
  | "camera_preset"
  | "lighting_preset"
  | "hand"
  | "character";

export const HUB_SOURCE_TYPES: HubSourceType[] = [
  "location",
  "gesture",
  "camera_preset",
  "lighting_preset",
  "hand",
  "character",
];

export const HUB_SOURCE_META: Record<HubSourceType, { icon: string; label: string }> = {
  location: { icon: "🗂️", label: "Location" },
  gesture: { icon: "🤲", label: "Gesture" },
  camera_preset: { icon: "🎥", label: "Camera" },
  lighting_preset: { icon: "💡", label: "Lighting" },
  hand: { icon: "🖐️", label: "Hand" },
  character: { icon: "🎭", label: "Master Prompt" },
};

/** 🔗 ไปที่ต้นทาง — deep-link ต่อชนิดแหล่ง */
export function hubSourceHref(sourceType: HubSourceType, sourceId: string): string {
  switch (sourceType) {
    case "location":
      return "/library?tab=locations";
    case "gesture":
      return "/gestures";
    case "camera_preset":
      return "/camera-presets";
    case "lighting_preset":
      return "/lighting-presets";
    case "hand":
      return "/hands";
    case "character":
      return `/characters/${sourceId}`;
  }
}

export interface HubCharacterVariant {
  tool: "chatgpt" | "gemini" | "grok";
  label: string;
  text: string;
}

export interface PromptHubRow {
  sourceType: HubSourceType;
  sourceId: string;
  name: string;
  code: string | null;
  updatedAt: string;
  thumbnailAssetId: string | null;
  preview: string;
  /** raw record ต้นทาง (5 คลัง library) — web compose variants เองด้วย promptBuilders */
  source?: Record<string, unknown>;
  /** character เท่านั้น — Master Prompt 3 ค่าย compose ฝั่ง server (exports builder) */
  characterVariants?: HubCharacterVariant[];
}

export interface PromptHubList {
  items: PromptHubRow[];
  total: number;
  page: number;
  pageSize: number;
}

export const fetchPromptHub = (params: {
  q?: string;
  sourceType?: HubSourceType | "";
  page?: number;
}) => {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.sourceType) qs.set("sourceType", params.sourceType);
  if (params.page && params.page > 1) qs.set("page", String(params.page));
  const s = qs.toString();
  return api<PromptHubList>(`/prompts/hub${s ? `?${s}` : ""}`);
};

export interface HubSnapshotResult {
  prompt: PromptDetail;
  versionLabel: string;
}

/** ⭐ เก็บเข้าคลังหลัก — snapshot ต้นทางเป็น Prompt/version (idempotent-by-origin ฝั่ง API) */
export const snapshotHubSource = (sourceType: HubSourceType, sourceId: string) =>
  api<HubSnapshotResult>("/prompts/hub/snapshot", {
    method: "POST",
    body: JSON.stringify({ sourceType, sourceId }),
  });

export const PROMPT_TYPES = [
  "identity",
  "character_sheet",
  "expression",
  "outfit",
  "scene",
  "shot",
  "negative",
  "anti_clone",
] as const;

export const PROMPT_TYPE_LABEL: Record<string, string> = {
  identity: "Identity",
  character_sheet: "Character Sheet",
  expression: "Expression",
  outfit: "Outfit",
  scene: "Scene",
  shot: "Shot",
  negative: "Negative",
  anti_clone: "Anti-clone",
};
