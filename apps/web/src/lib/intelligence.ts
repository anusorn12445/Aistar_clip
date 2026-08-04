// Types + constants สำหรับ Intelligence wave: Ideas / Post-it Board / Competitors

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ── Ideas (§19) ──────────────────────────────────────────────

export interface Idea {
  id: string;
  title: string;
  ideaType: string | null;
  url: string | null;
  note: string | null;
  aiSummary: string | null;
  aiAdaptation: string | null;
  status: string;
  createdBy: string;
  createdByName?: string | null;
  createdAt: string;
  updatedAt: string;
}

export const IDEA_TYPES: Record<string, { label: string; cls: string }> = {
  hook: { label: "Hook", cls: "bg-amber-400/15 text-amber-300 border-amber-400/30" },
  story: { label: "Story", cls: "bg-sky-400/15 text-sky-300 border-sky-400/30" },
  visual: { label: "Visual", cls: "bg-fuchsia-400/15 text-fuchsia-300 border-fuchsia-400/30" },
  character: { label: "Character", cls: "bg-violet-400/15 text-violet-300 border-violet-400/30" },
  comedy: { label: "Comedy", cls: "bg-lime-400/15 text-lime-300 border-lime-400/30" },
  tie_in: { label: "Product Tie-in", cls: "bg-orange-400/15 text-orange-300 border-orange-400/30" },
  live_selling: { label: "Live Selling", cls: "bg-rose-400/15 text-rose-300 border-rose-400/30" },
  caption: { label: "Caption/Copy", cls: "bg-teal-400/15 text-teal-300 border-teal-400/30" },
  trend: { label: "Trend/Meme", cls: "bg-pink-400/15 text-pink-300 border-pink-400/30" },
  music: { label: "Music/Sound", cls: "bg-indigo-400/15 text-indigo-300 border-indigo-400/30" },
  editing: { label: "Editing", cls: "bg-cyan-400/15 text-cyan-300 border-cyan-400/30" },
};

export const IDEA_STATUS: Record<string, { label: string; cls: string }> = {
  captured: { label: "เก็บมาแล้ว", cls: "bg-zinc-700/60 text-zinc-300" },
  reviewed: { label: "รีวิวแล้ว", cls: "bg-sky-400/15 text-sky-300" },
  shortlisted: { label: "เข้ารอบ", cls: "bg-amber-400/15 text-amber-300" },
  adapted: { label: "ดัดแปลงแล้ว", cls: "bg-violet-400/15 text-violet-300" },
  converted: { label: "Convert แล้ว", cls: "bg-emerald-400/15 text-emerald-300" },
  used: { label: "ใช้แล้ว", cls: "bg-emerald-400/25 text-emerald-200" },
  archived: { label: "Archive", cls: "bg-zinc-800 text-zinc-500" },
};

// ก้าวถัดไปของ status (เดินหน้าอย่างเดียว — converted ผ่าน convert endpoint เท่านั้น)
export const IDEA_NEXT: Record<string, string | null> = {
  captured: "reviewed",
  reviewed: "shortlisted",
  shortlisted: "adapted",
  adapted: "used",
  converted: "used",
  used: null,
  archived: null,
};

// ── Post-its (§20) ───────────────────────────────────────────

export interface Postit {
  id: string;
  type: string;
  content: string;
  entityType: string | null;
  entityId: string | null;
  assigneeId: string | null;
  assigneeName?: string | null;
  priority: string;
  status: string;
  createdBy: string;
  createdByName?: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { comments: number };
}

export interface PostitComment {
  id: string;
  content: string;
  createdBy: string;
  createdByName?: string | null;
  createdAt: string;
}

export interface PostitDetail extends Postit {
  comments: PostitComment[];
}

export const POSTIT_TYPES: Record<string, { label: string; cls: string }> = {
  note: { label: "Note", cls: "bg-zinc-700/60 text-zinc-300 border-zinc-600" },
  idea: { label: "Idea", cls: "bg-amber-400/15 text-amber-300 border-amber-400/30" },
  todo: { label: "Todo", cls: "bg-sky-400/15 text-sky-300 border-sky-400/30" },
  issue: { label: "Issue", cls: "bg-red-400/15 text-red-300 border-red-400/30" },
  feedback: { label: "Feedback", cls: "bg-teal-400/15 text-teal-300 border-teal-400/30" },
  qc_note: { label: "QC Note", cls: "bg-orange-400/15 text-orange-300 border-orange-400/30" },
  risk: { label: "Risk", cls: "bg-rose-400/15 text-rose-300 border-rose-400/30" },
  reference: { label: "Reference", cls: "bg-indigo-400/15 text-indigo-300 border-indigo-400/30" },
  decision: { label: "Decision", cls: "bg-emerald-400/15 text-emerald-300 border-emerald-400/30" },
  question: { label: "Question", cls: "bg-fuchsia-400/15 text-fuchsia-300 border-fuchsia-400/30" },
};

export const POSTIT_COLUMNS: { key: string; label: string; cls: string }[] = [
  { key: "open", label: "Open", cls: "text-zinc-300" },
  { key: "in_progress", label: "กำลังทำ", cls: "text-sky-300" },
  { key: "resolved", label: "จบแล้ว", cls: "text-emerald-300" },
  { key: "archived", label: "Archive", cls: "text-zinc-500" },
];

export const PRIORITY_DOT: Record<string, { label: string; cls: string }> = {
  low: { label: "ชิลล์ ๆ", cls: "bg-zinc-500" },
  normal: { label: "ปกติ", cls: "bg-sky-400" },
  urgent: { label: "ด่วน", cls: "bg-red-500" },
};

// ── Competitors (§18) ────────────────────────────────────────

export interface Competitor {
  id: string;
  name: string;
  type: string | null;
  category: string[];
  positioning: string | null;
  audience: string[];
  strength: string | null;
  weakness: string | null;
  threatLevel: string;
  watchStatus: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { channels: number; insights: number; contents: number };
}

export interface CompetitorChannel {
  id: string;
  platform: string;
  handle: string;
  url: string | null;
  followers: number | null;
  notes: string | null;
}

export interface CompetitorContent {
  id: string;
  url: string;
  platform: string | null;
  contentType: string | null;
  hook: string | null;
  metricsNote: string | null;
  notes: string | null;
  capturedAt: string;
}

export interface CompetitorInsight {
  id: string;
  competitorId: string | null;
  fact: string;
  assumption: string | null;
  recommendation: string | null;
  convertedToCampaignId: string | null;
  createdBy: string;
  createdByName?: string | null;
  createdAt: string;
  competitor?: { id: string; name: string } | null;
}

export interface CompetitorDetail extends Competitor {
  channels: CompetitorChannel[];
  contents: CompetitorContent[];
  insights: CompetitorInsight[];
}

export const COMPETITOR_TYPES: Record<string, string> = {
  brand: "Brand",
  creator: "Creator",
  studio: "Studio",
  shop: "Shop",
};

export const THREAT_LEVELS: Record<string, { label: string; cls: string }> = {
  low: { label: "Low", cls: "bg-emerald-400/15 text-emerald-300" },
  medium: { label: "Medium", cls: "bg-amber-400/15 text-amber-300" },
  high: { label: "High", cls: "bg-red-400/15 text-red-300" },
};

export const WATCH_STATUS: Record<string, { label: string; cls: string }> = {
  active: { label: "จับตาอยู่", cls: "bg-sky-400/15 text-sky-300" },
  paused: { label: "พักไว้", cls: "bg-zinc-700/60 text-zinc-400" },
};

// ── Shared ───────────────────────────────────────────────────

export interface Assignee {
  id: string;
  name: string;
  email: string;
}

export function fmtDateTime(v: string | null | undefined): string {
  if (!v) return "—";
  return new Date(v).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name.trim().slice(0, 2);
}
