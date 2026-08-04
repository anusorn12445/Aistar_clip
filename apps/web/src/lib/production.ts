// Types + helpers ของ Production Pipeline (Series / Episodes / Shots + Handoff §E.2)
import { api } from "@/lib/api";

export interface Series {
  id: string;
  name: string;
  universe: string | null;
  description: string | null;
  status: string;
  updatedAt: string;
  _count?: { episodes: number };
}

export interface SeriesList {
  items: Series[];
  total: number;
}

export type EpisodeStatus =
  | "idea"
  | "script_draft"
  | "script_review"
  | "script_approved"
  | "shot_breakdown"
  | "production"
  | "edited"
  | "published"
  | "archived";

export type ShotStatus =
  | "planned"
  | "prompt_ready"
  | "generating"
  | "generated"
  | "selected"
  | "rejected"
  | "edited"
  | "approved";

export interface EpisodeListItem {
  id: string;
  displayCode: string;
  title: string;
  logline: string | null;
  season: string | null;
  episodeNumber: number | null;
  seriesId: string | null;
  campaignId: string | null;
  status: EpisodeStatus;
  ownerId: string | null;
  owner: { id: string; name: string } | null;
  updatedAt: string;
  series: { id: string; name: string } | null;
  campaign: { id: string; name: string } | null;
  characterCount: number;
  shotCounts: {
    total: number;
    approved: number;
    byStatus: Partial<Record<ShotStatus, number>>;
  };
}

export interface EpisodeList {
  items: EpisodeListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CharacterRef {
  id: string;
  displayCode: string;
  nameTh: string;
  nameEn: string | null;
  status: string;
}

export interface Shot {
  id: string;
  episodeId: string;
  shotNumber: number;
  durationSec: number | null;
  camera: string | null;
  action: string | null;
  dialogue: string | null;
  emotion: string | null;
  outfit: string | null;
  status: ShotStatus;
  updatedAt: string;
  characterIds: string[];
}

export interface EpisodeDetail {
  id: string;
  displayCode: string;
  title: string;
  logline: string | null;
  season: string | null;
  episodeNumber: number | null;
  script: string | null;
  hook: string | null;
  conflict: string | null;
  twist: string | null;
  cta: string | null;
  status: EpisodeStatus;
  ownerId: string | null;
  owner: { id: string; name: string } | null;
  updatedAt: string;
  seriesId: string | null;
  campaignId: string | null;
  locationId: string | null;
  series: Series | null;
  campaign: { id: string; displayCode: string; name: string } | null;
  location: { id: string; name: string } | null;
  characters: { characterId: string; character: CharacterRef | null }[];
  products: { productId: string; product: { id: string; displayCode: string; name: string } }[];
  shots: Shot[];
  characterDetails: CharacterRef[];
  scriptVersionCount: number;
}

export interface HandoffResult {
  taskCount: number;
  shotCount: number;
  status: string;
}

// ─── labels (Thai UI) ────────────────────────────────────────

export const EPISODE_STATUS_LABEL: Record<EpisodeStatus, { label: string; cls: string }> = {
  idea: { label: "ไอเดีย", cls: "bg-zinc-700 text-zinc-200" },
  script_draft: { label: "ร่างสคริปต์", cls: "bg-sky-950 text-sky-300" },
  script_review: { label: "รอตรวจสคริปต์", cls: "bg-blue-900 text-blue-200" },
  script_approved: { label: "สคริปต์อนุมัติ", cls: "bg-emerald-900 text-emerald-200" },
  shot_breakdown: { label: "แตก Shot", cls: "bg-violet-900 text-violet-200" },
  production: { label: "Production", cls: "bg-amber-900 text-amber-200" },
  edited: { label: "ตัดต่อแล้ว", cls: "bg-teal-900 text-teal-200" },
  published: { label: "เผยแพร่แล้ว", cls: "bg-green-900 text-green-200" },
  archived: { label: "Archived", cls: "bg-zinc-800 text-zinc-500" },
};

// ปุ่ม transition ต่อ status (ฝั่ง API เช็ค state machine + สิทธิ์ซ้ำอีกชั้น)
export const EPISODE_ACTIONS: Record<
  EpisodeStatus,
  { to: EpisodeStatus; label: string; primary?: boolean }[]
> = {
  idea: [{ to: "script_draft", label: "เริ่มร่างสคริปต์", primary: true }],
  script_draft: [{ to: "script_review", label: "ส่งตรวจสคริปต์", primary: true }],
  script_review: [
    { to: "script_approved", label: "อนุมัติสคริปต์", primary: true },
    { to: "script_draft", label: "ตีกลับไปแก้" },
  ],
  script_approved: [{ to: "shot_breakdown", label: "แตก Shot List", primary: true }],
  shot_breakdown: [], // → production ผ่านปุ่ม Handoff
  production: [{ to: "edited", label: "ตัดต่อเสร็จ", primary: true }],
  edited: [{ to: "published", label: "เผยแพร่", primary: true }],
  published: [{ to: "archived", label: "Archive" }],
  archived: [],
};

export const SHOT_STATUS_LABEL: Record<ShotStatus, { label: string; cls: string }> = {
  planned: { label: "Planned", cls: "bg-zinc-700 text-zinc-200" },
  prompt_ready: { label: "Prompt พร้อม", cls: "bg-sky-950 text-sky-300" },
  generating: { label: "กำลัง Gen", cls: "bg-blue-900 text-blue-200" },
  generated: { label: "Gen แล้ว", cls: "bg-violet-900 text-violet-200" },
  selected: { label: "เลือกแล้ว", cls: "bg-teal-900 text-teal-200" },
  rejected: { label: "ไม่ผ่าน", cls: "bg-red-900 text-red-200" },
  edited: { label: "ตัดต่อแล้ว", cls: "bg-amber-900 text-amber-200" },
  approved: { label: "Approved", cls: "bg-emerald-900 text-emerald-200" },
};

export const SHOT_ACTIONS: Record<ShotStatus, { to: ShotStatus; label: string }[]> = {
  planned: [{ to: "prompt_ready", label: "Prompt พร้อม" }],
  prompt_ready: [{ to: "generating", label: "เริ่ม Gen" }],
  generating: [{ to: "generated", label: "Gen เสร็จ" }],
  generated: [
    { to: "selected", label: "เลือก" },
    { to: "rejected", label: "ไม่ผ่าน" },
  ],
  selected: [
    { to: "edited", label: "ตัดต่อแล้ว" },
    { to: "approved", label: "อนุมัติ" },
  ],
  rejected: [{ to: "prompt_ready", label: "Gen ใหม่" }],
  edited: [{ to: "approved", label: "อนุมัติ" }],
  approved: [],
};

// camera types ตาม PRD v0.1 §13
export const CAMERA_OPTIONS = [
  { value: "close_up", label: "Close-up" },
  { value: "medium", label: "Medium" },
  { value: "wide", label: "Wide" },
  { value: "over_shoulder", label: "Over Shoulder" },
  { value: "pov", label: "POV" },
  { value: "product_close_up", label: "Product Close-up" },
  { value: "reaction", label: "Reaction" },
  { value: "establishing", label: "Establishing" },
];

export const EPISODE_SORT_OPTIONS = [
  { value: "updatedAt", label: "อัปเดตล่าสุด" },
  { value: "episodeNumber", label: "EP Number" },
  { value: "title", label: "ชื่อตอน" },
  { value: "status", label: "Status" },
];

// ─── Storyboard (Content Intelligence ระบบ 3) ────────────────────

export interface StoryboardFrame {
  linkId: string;
  assetId: string;
  assetType: string;
  mimeType: string;
  linkRole: string;
  status: string;
  createdAt: string;
}

export interface StoryboardShotChar {
  characterId: string;
  nameTh: string | null;
  nameEn: string | null;
  displayCode: string | null;
}

export interface StoryboardShot {
  id: string;
  shotNumber: number;
  camera: string | null;
  action: string | null;
  dialogue: string | null;
  emotion: string | null;
  outfit: string | null;
  status: ShotStatus;
  imagePrompt: string | null;
  characters: StoryboardShotChar[];
  frames: StoryboardFrame[];
}

export interface Storyboard {
  episode: {
    id: string;
    displayCode: string;
    title: string;
    status: EpisodeStatus;
    location: { id: string; name: string } | null;
  };
  shots: StoryboardShot[];
}

export interface StoryboardPromptResult {
  episodeId: string;
  total: number;
  generated: number;
  skipped: number;
  failed: number;
  provenance: "deterministic";
  results: { shotId: string; shotNumber: number; status: "generated" | "skipped" | "failed" }[];
}

// เฟรม storyboard แนบผ่าน AssetLink entityType 'shot' (linkRole 'deliverable')
export const STORYBOARD_FRAME_LINK_ROLE = "deliverable";
export const STORYBOARD_FRAME_ASSET_TYPE = "storyboard_frame";

export function fetchStoryboard(episodeId: string): Promise<Storyboard> {
  return api<Storyboard>(`/episodes/${episodeId}/storyboard`);
}

// ร่าง image prompt ทั้งอีพี — regenerate=true เขียนทับของเดิม
export function generateStoryboardPrompts(
  episodeId: string,
  regenerate = false,
): Promise<StoryboardPromptResult> {
  return api<StoryboardPromptResult>(`/episodes/${episodeId}/storyboard-prompts`, {
    method: "POST",
    body: JSON.stringify({ regenerate }),
  });
}

// ร่าง prompt ใหม่ให้ช็อตเดียว
export function regenerateShotPrompt(shotId: string): Promise<Shot & { imagePrompt: string | null }> {
  return api<Shot & { imagePrompt: string | null }>(`/shots/${shotId}/image-prompt`, {
    method: "POST",
  });
}

// คนแก้ prompt เอง (PATCH /shots/:id)
export function updateShotImagePrompt(shotId: string, imagePrompt: string): Promise<Shot> {
  return api<Shot>(`/shots/${shotId}`, {
    method: "PATCH",
    body: JSON.stringify({ imagePrompt }),
  });
}
