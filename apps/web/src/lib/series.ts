// Types + labels ของ Series Hub (จัดการซีรีส์ end-to-end: pipeline / cast / bible / broadcast / analytics)

import type { EpisodeStatus } from "@/lib/production";
import type { AudienceLink } from "@/lib/api";

export interface SeriesCastPreview {
  id: string;
  nameTh: string;
  displayCode: string;
}

export interface SeriesListItem {
  id: string;
  name: string;
  universe: string | null;
  description: string | null;
  premise: string | null;
  coverAssetId: string | null;
  status: string;
  updatedAt: string;
  episodeCount?: number;
  seasonCount?: number;
  castPreview?: SeriesCastPreview[];
  latestEpisode?: { displayCode: string; status: string } | null;
  _count?: { episodes: number };
}

export interface SeriesListResponse {
  items: SeriesListItem[];
  total: number;
  page?: number;
  pageSize?: number;
}

export interface SeasonInfo {
  id: string;
  label: string;
  arc: string | null;
  status: string;
  sortOrder: number;
  products: { id: string; name: string; displayCode?: string }[];
}

export interface SeriesCastMember {
  characterId: string;
  role: string;
  character: {
    id: string;
    displayCode: string;
    nameTh: string;
    nameEn: string | null;
    status: string;
  } | null;
}

export interface SeriesLocationLink {
  locationId: string;
  location: { id: string; name: string; type: string | null; mood: string | null } | null;
}

export interface SeriesEpisodeRow {
  id: string;
  displayCode: string;
  episodeNumber: number | null;
  season: string | null;
  title: string;
  logline: string | null;
  status: EpisodeStatus;
  updatedAt: string;
  shotCounts: { approved: number; total: number };
}

export interface BroadcastSlot {
  day: string;
  time: string;
  platform: string;
}

export interface TimelineEntry {
  when: string;
  event: string;
}

export interface RelationshipEntry {
  pair: string;
  status: string;
}

export interface SeriesBible {
  world_rules?: string[];
  timeline?: TimelineEntry[];
  relationships?: RelationshipEntry[];
  last_cliffhanger?: string;
  notes?: string;
}

export interface SeriesDetail {
  id: string;
  name: string;
  universe: string | null;
  description: string | null;
  premise: string | null;
  coverAssetId: string | null;
  bible: SeriesBible | null;
  broadcastSchedule: BroadcastSlot[] | null;
  status: string;
  updatedAt: string;
  seasons: SeasonInfo[];
  cast: SeriesCastMember[];
  locations: SeriesLocationLink[];
  episodes: SeriesEpisodeRow[];
  episodeCount: number;
  // คนดูเป้าหมาย — อ้างอิง taxonomy กลาง (Audience Segment) + เป้ายอดวิว
  audiences?: AudienceLink[];
  targetViews?: number | null;
  targetViewsUnit?: string | null; // per_episode | series_total
}

// ─── Layer 2: AI ─────────────────────────────────────────────

export interface ContinuityIssue {
  severity: "low" | "medium" | "high";
  what: string;
  where: string;
  suggestion: string;
}

export interface ContinuityResult {
  issues: ContinuityIssue[];
  relationshipUpdates: { pair: string; newStatus: string }[];
  cliffhangerSuggestion: string;
  verdict: string;
  episode: { id: string; displayCode: string; title: string };
}

export interface NextEpisodeOption {
  title: string;
  logline: string;
  hook: string;
  twist: string;
  cta: string;
  rationale: string;
}

export interface NextEpisodeResult {
  options: NextEpisodeOption[];
  season: string;
}

export interface BibleDraftResult {
  bible: Required<SeriesBible>;
}

// ─── Layer 3: Analytics + Calendar ──────────────────────────

export interface EpisodeAnalyticsRow {
  episodeId: string;
  displayCode: string;
  episodeNumber: number | null;
  season: string | null;
  title: string;
  views: number;
  likes: number;
  gmv: number;
  orders: number;
  dropOffPct: number | null;
}

export interface SeasonRollup {
  season: string;
  views: number;
  gmv: number;
  episodeCount: number;
  avgDropOff: number | null;
}

export interface SeriesAnalytics {
  items: EpisodeAnalyticsRow[];
  seasons: SeasonRollup[];
  sequelSuggestion: { episodeId: string; title: string; displayCode: string; reason: string } | null;
  hasData: boolean;
}

export interface CalendarSuggestResult {
  created: number;
  skipped: number;
  items: {
    title: string;
    platform: string;
    scheduledAt: string;
    episodeCode: string | null;
    skipped: boolean;
  }[];
}

// ─── labels (Thai UI) ────────────────────────────────────────

export const SERIES_STATUS_LABEL: Record<string, { label: string; cls: string; dot: string }> = {
  active: { label: "ออนแอร์", cls: "bg-emerald-900 text-emerald-200", dot: "bg-emerald-400" },
  hiatus: { label: "พักออนแอร์", cls: "bg-amber-900 text-amber-200", dot: "bg-amber-400" },
  completed: { label: "จบแล้ว", cls: "bg-zinc-700 text-zinc-300", dot: "bg-zinc-400" },
  // legacy status จาก schema เดิม
  archived: { label: "Archived", cls: "bg-zinc-800 text-zinc-500", dot: "bg-zinc-600" },
};

export function seriesStatusMeta(status: string) {
  return (
    SERIES_STATUS_LABEL[status] ?? { label: status, cls: "bg-zinc-700 text-zinc-300", dot: "bg-zinc-400" }
  );
}

// ปุ่มเปลี่ยนสถานะจากสถานะปัจจุบัน
export const SERIES_STATUS_ACTIONS: Record<string, { to: string; label: string }[]> = {
  active: [
    { to: "hiatus", label: "พักออนแอร์" },
    { to: "completed", label: "จบซีรีส์" },
  ],
  hiatus: [
    { to: "active", label: "กลับมาออนแอร์" },
    { to: "completed", label: "จบซีรีส์" },
  ],
  completed: [{ to: "active", label: "กลับมาออนแอร์" }],
};

export const CAST_ROLE_LABEL: Record<string, { label: string; cls: string }> = {
  main: { label: "บทนำ", cls: "bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/40" },
  supporting: { label: "สมทบ", cls: "bg-sky-950 text-sky-300" },
  recurring_guest: { label: "รับเชิญประจำ", cls: "bg-violet-950 text-violet-300" },
};

export const CAST_ROLE_OPTIONS = [
  { value: "main", label: "บทนำ" },
  { value: "supporting", label: "สมทบ" },
  { value: "recurring_guest", label: "รับเชิญประจำ" },
];

export const SEASON_STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  planning: { label: "วางแผน", cls: "bg-sky-950 text-sky-300" },
  active: { label: "กำลังผลิต", cls: "bg-emerald-900 text-emerald-200" },
  completed: { label: "จบซีซัน", cls: "bg-zinc-700 text-zinc-300" },
};

export const BROADCAST_DAY_OPTIONS = [
  { value: "mon", label: "จันทร์" },
  { value: "tue", label: "อังคาร" },
  { value: "wed", label: "พุธ" },
  { value: "thu", label: "พฤหัส" },
  { value: "fri", label: "ศุกร์" },
  { value: "sat", label: "เสาร์" },
  { value: "sun", label: "อาทิตย์" },
];

export function broadcastDayLabel(day: string) {
  return BROADCAST_DAY_OPTIONS.find((d) => d.value === day)?.label ?? day;
}

export const CONTINUITY_SEVERITY: Record<string, { label: string; cls: string }> = {
  high: { label: "ร้ายแรง", cls: "border-red-900 bg-red-950/60 text-red-300" },
  medium: { label: "ปานกลาง", cls: "border-amber-900 bg-amber-950/60 text-amber-300" },
  low: { label: "เล็กน้อย", cls: "border-zinc-700 bg-zinc-900 text-zinc-400" },
};

// bible ว่างสำหรับเริ่ม editor
export function emptyBible(): Required<SeriesBible> {
  return { world_rules: [], timeline: [], relationships: [], last_cliffhanger: "", notes: "" };
}

export function normalizeBible(b: SeriesBible | null | undefined): Required<SeriesBible> {
  return {
    world_rules: Array.isArray(b?.world_rules) ? b.world_rules.map(String) : [],
    timeline: Array.isArray(b?.timeline)
      ? b.timeline.map((t) => ({ when: String(t?.when ?? ""), event: String(t?.event ?? "") }))
      : [],
    relationships: Array.isArray(b?.relationships)
      ? b.relationships.map((r) => ({ pair: String(r?.pair ?? ""), status: String(r?.status ?? "") }))
      : [],
    last_cliffhanger: typeof b?.last_cliffhanger === "string" ? b.last_cliffhanger : "",
    notes: typeof b?.notes === "string" ? b.notes : "",
  };
}

// สีตัวอักษรบน gradient placeholder ของปก — สุ่มคงที่จากชื่อ
const COVER_GRADIENTS = [
  "from-amber-500/40 via-orange-900/50 to-zinc-900",
  "from-rose-500/40 via-fuchsia-900/50 to-zinc-900",
  "from-sky-500/40 via-indigo-900/50 to-zinc-900",
  "from-emerald-500/40 via-teal-900/50 to-zinc-900",
  "from-violet-500/40 via-purple-900/50 to-zinc-900",
];

export function coverGradient(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return COVER_GRADIENTS[h % COVER_GRADIENTS.length];
}

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}
