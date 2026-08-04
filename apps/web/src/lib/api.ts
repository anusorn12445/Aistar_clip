const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

// Error ที่พก HTTP status ไว้ให้ caller เช็คได้ (เช่น 503 AI ใช้ไม่ได้) — ยังเป็น subclass ของ Error
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("aistar_token");
}

export function setToken(token: string) {
  localStorage.setItem("aistar_token", token);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("aistar_refresh");
}

export function setRefreshToken(token: string) {
  localStorage.setItem("aistar_refresh", token);
}

export function clearToken() {
  localStorage.removeItem("aistar_token");
  localStorage.removeItem("aistar_refresh");
}

function doFetch(path: string, options: RequestInit): Promise<Response> {
  const token = getToken();
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
}

// single-flight: หลาย request 401 พร้อมกัน → refresh แค่ครั้งเดียว
let refreshPromise: Promise<boolean> | null = null;

function tryRefresh(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const refreshToken = getRefreshToken();
      if (!refreshToken) return false;
      try {
        const res = await fetch(`${API_BASE}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) return false;
        const body = (await res.json()) as { accessToken: string; refreshToken: string };
        setToken(body.accessToken);
        setRefreshToken(body.refreshToken);
        return true;
      } catch {
        return false;
      }
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  let res = await doFetch(path, options);

  // 401 → ลอง refresh หนึ่งครั้งแล้ว retry request เดิม — ถ้าไม่รอด ค่อยเด้งไป login
  if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/auth/")) {
    const refreshed = await tryRefresh();
    if (refreshed) res = await doFetch(path, options);
    if (!refreshed || res.status === 401) {
      clearToken();
      window.location.href = "/login";
      throw new Error("session หมดอายุ");
    }
  }

  const body = await res.json();
  if (!res.ok) {
    const msg = Array.isArray(body.message) ? body.message.join(", ") : body.message;
    throw new ApiError(msg ?? `HTTP ${res.status}`, res.status);
  }
  return body as T;
}

// ─── Current user / Profile ──────────────────────────────────
// รูปย่อที่ login เก็บไว้ใน localStorage.aistar_user (shell อ่านตอนยังไม่ได้ยิง /auth/me)
export interface StoredUser {
  id: string;
  email: string;
  name: string;
  roles: string[];
}

// GET /auth/me — โปรไฟล์สดของผู้ใช้ที่ล็อกอินอยู่
export interface Profile {
  id: string;
  email: string;
  name: string;
  status: string; // active, suspended
  createdAt: string;
  roles: string[]; // role keys
  roleNames: string[]; // ชื่อแสดงผลของ role (index ตรงกับ roles)
  avatarAssetId: string | null;
  // สิทธิ์รวมทุก module (union ข้าม role) — { module: [actions] } เช่น { content: ['V','C'] }
  permissions: Record<string, string[]>;
  // viewScope ต่อ scoped module (content/episode) — ให้ UI แสดง badge ขอบเขต
  viewScope: Record<string, ViewScope>;
}

/** อ่าน user ที่ login ไว้จาก localStorage — null ถ้ายังไม่ล็อกอิน/parse ไม่ได้ */
export function getUser(): StoredUser | null {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem("aistar_user") ?? "null") as StoredUser | null;
  } catch {
    return null;
  }
}

/** เขียนทับ user ใน localStorage (เช่นหลังแก้ชื่อ) ให้ shell สะท้อนค่าใหม่ */
export function setUser(user: StoredUser) {
  if (typeof window === "undefined") return;
  localStorage.setItem("aistar_user", JSON.stringify(user));
}

// ผู้สร้างตัวละคร (freelance/ทีมใน) — เก็บ contact ไว้ตามตัวได้
export interface Creator {
  id: string;
  name: string;
  phone?: string | null;
  line?: string | null;
  email?: string | null;
  portfolio?: string | null;
  rateNote?: string | null;
  notes?: string | null;
  characterCount?: number; // แนบมากับ GET /creators (list)
}

export interface Character {
  id: string;
  displayCode: string;
  nameTh: string;
  nameEn: string | null;
  nickname?: string | null;
  universe: string | null;
  series: string | null;
  status: string;
  version: string;
  persona: { one_line_concept?: string } | null;
  updatedAt: string;
  archivedAt?: string | null;
  // fields เสริมจาก API build ใหม่ — optional ทั้งหมด เผื่อคุยกับ build เก่า
  roleLabel?: string | null;
  age?: number | null;
  gender?: string | null;
  region?: string | null;
  thumbAssetId?: string | null;
  tags?: { id: string; name: string }[];
  // ประเภทตัวละคร (taxonomy กลาง) — list แนบ {id,label}, detail แนบ {id,key,label}
  categories?: { id: string; label: string; key?: string }[];
  campaignActiveCount?: number;
  metric?: number; // แนบมาเมื่อ sortBy = gmv|views|usage
  creatorId?: string | null;
  creator?: Creator | null; // แนบมากับ GET /characters/:id (API build ใหม่)
}

// ประเภทตัวละคร (taxonomy) — จัดการที่ Settings, mirror ProductCategory
export interface CharacterCategory {
  id: string;
  key: string;
  label: string;
  sortOrder: number;
  status: string; // active, archived
  builtin: boolean;
  characterCount: number;
}

export interface CharacterList {
  items: Character[];
  total: number;
  page: number;
  pageSize: number;
}

// Reverse-capture ("สร้างจากภายนอก") — POST /ai/characters/capture คืน draft (ไม่ persist)
export interface CharacterCaptureDraft {
  nameTh: string;
  nameEn: string;
  persona: Record<string, unknown>;
  visualDna: Record<string, unknown>;
  suggested: { age?: number; gender?: string; region?: string; roleLabel?: string };
  confidence: "high" | "medium" | "low";
  provenance: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  // Blueprint (พิมพ์เขียว) ที่ใช้แตก + required fields ที่ยังว่าง (amber warning) — API build ใหม่
  blueprintId?: string | null;
  missingRequired?: string[];
}

export interface CharacterCaptureInput {
  text?: string;
  imageAssetIds?: string[];
  seed?: string;
  blueprintId?: string;
}

export const captureCharacterFromExternal = (body: CharacterCaptureInput) =>
  api<CharacterCaptureDraft>("/ai/characters/capture", {
    method: "POST",
    body: JSON.stringify(body),
  });

// ─── Character Blueprint (พิมพ์เขียว) — creation directive จัดการที่ Settings ───
export interface CharacterBlueprint {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  houseRules: string | null;
  requiredFields: string[];
  defaults: Record<string, unknown> | null;
  isDefault: boolean;
  sortOrder: number;
  status: string; // active | archived
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface CharacterBlueprintInput {
  name?: string;
  description?: string;
  icon?: string;
  houseRules?: string;
  requiredFields?: string[];
  defaults?: Record<string, unknown>;
  isDefault?: boolean;
  sortOrder?: number;
  status?: string;
}

// keys ที่ "รู้จัก" สำหรับ defaults editor (mirror BLUEPRINT_DEFAULT_FIELDS ฝั่ง API)
export const BLUEPRINT_DEFAULT_FIELDS = [
  "ethnicity",
  "art_style",
  "aspect_ratio",
  "lighting",
  "age_range",
  "region",
  "skin_tone",
  "shot_type",
  "camera_angle",
  "color_grade",
  "background_setting",
  "mood",
] as const;

// keys ของ persona/visualDna ที่เลือกเป็น requiredFields ได้ (multiselect)
export const BLUEPRINT_REQUIRED_FIELD_OPTIONS = [
  "ethnicity",
  "distinctive_features",
  "skin_tone",
  "hair_style",
  "face_shape",
  "fashion_style",
  "lighting",
  "art_style",
  "short_bio",
  "backstory",
  "personality",
  "language_style",
] as const;

export const fetchCharacterBlueprints = (params?: { status?: string; q?: string }) => {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.q) qs.set("q", params.q);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return api<CharacterBlueprint[]>(`/character-blueprints${suffix}`);
};

export const createCharacterBlueprint = (body: CharacterBlueprintInput) =>
  api<CharacterBlueprint>("/character-blueprints", {
    method: "POST",
    body: JSON.stringify(body),
  });

export const updateCharacterBlueprint = (id: string, body: CharacterBlueprintInput) =>
  api<CharacterBlueprint>(`/character-blueprints/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

export const archiveCharacterBlueprint = (id: string) =>
  api<CharacterBlueprint>(`/character-blueprints/${id}/archive`, { method: "POST" });

// อ่าน blueprint ตัวเดียว (Master Prompt viewer ใช้ดึง houseRules/requiredFields)
export const fetchCharacterBlueprint = (id: string) =>
  api<CharacterBlueprint>(`/character-blueprints/${id}`);

// ─── Verify: ตรวจรูปที่ gen มาเทียบสเปก (Visual DNA) — POST /ai/character-spec-verify ───
export interface SpecVerifyField {
  key: string;
  expected: string;
  observed: string;
  verdict: "match" | "mismatch" | "uncertain";
}

export interface SpecVerifyResult {
  score: number | null; // 0-100 เฉพาะ key ที่ตัดสินได้ — ไม่มีเลย = null
  fields: SpecVerifyField[];
  summary: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

export const verifyCharacterSpec = (body: {
  characterId: string;
  imageAssetIds?: string[];
}) =>
  api<SpecVerifyResult>("/ai/character-spec-verify", {
    method: "POST",
    body: JSON.stringify(body),
  });

// ─── Jobs / งานรับจ้างผลิต ────────────────────────────────────

export interface Client {
  id: string;
  name: string;
  contactName?: string | null;
  phone?: string | null;
  line?: string | null;
  email?: string | null;
  type?: string | null; // brand, agency, shop, individual
  brandId?: string | null;
  notes?: string | null;
  status: string; // active, archived
  createdAt: string;
  updatedAt: string;
  jobCount?: number; // แนบมากับ GET /clients (list)
  brand?: { id: string; name: string } | null; // GET /clients/:id
  jobs?: JobListItem[]; // GET /clients/:id
}

export type JobType = "image_pack" | "video_review" | "live" | "mixed";
export type JobStatus =
  | "inquiry"
  | "quoted"
  | "confirmed"
  | "in_production"
  | "internal_qc"
  | "delivered"
  | "revision"
  | "approved"
  | "closed"
  | "cancelled";

export interface JobListItem {
  id: string;
  displayCode: string;
  title: string;
  clientId: string;
  type: JobType;
  status: JobStatus;
  priority: string; // low, normal, urgent
  dueDate?: string | null;
  deliveredAt?: string | null;
  qtyImages?: number | null;
  qtyClips?: number | null;
  quotePrice?: string | null;
  depositAmount?: string | null;
  paymentStatus?: string;
  currency?: string;
  updatedAt: string;
  archivedAt?: string | null;
  client?: { id: string; name: string };
  presenterIds?: string[];
  counts?: { products: number; presenters: number; crew: number; deliverables: number };
  latestDeliverableStatus?: string | null;
  thumbAssetId?: string | null;
}

export interface JobDeliverable {
  id: string;
  jobId: string;
  round: number;
  title?: string | null;
  notes?: string | null;
  status: "pending" | "submitted" | "approved" | "rejected";
  clientFeedback?: string | null;
  createdAt: string;
  updatedAt: string;
  attachmentCount?: number;
}

export interface JobCrewMember {
  creatorId: string;
  name?: string;
  phone?: string | null;
  line?: string | null;
  email?: string | null;
  roleNote?: string | null;
}

export interface JobDetail extends JobListItem {
  brief?: string | null;
  revisionsIncluded?: number;
  ownerId?: string | null;
  createdBy?: string | null;
  client: { id: string; name: string; contactName?: string | null; phone?: string | null; line?: string | null; email?: string | null; type?: string | null };
  products: { id: string; name: string; displayCode: string; status: string }[];
  presenters: { id: string; nameTh: string; nameEn?: string | null; displayCode: string }[];
  crew: JobCrewMember[];
  deliverables: JobDeliverable[];
  stats?: { products: number; presenters: number; crew: number; deliverables: number };
}

export const JOB_TYPES: { value: JobType; label: string; emoji: string }[] = [
  { value: "image_pack", label: "ชุดภาพ", emoji: "🖼️" },
  { value: "video_review", label: "คลิปรีวิว", emoji: "🎬" },
  { value: "live", label: "ไลฟ์", emoji: "🔴" },
  { value: "mixed", label: "ผสม", emoji: "🎁" },
];

export const JOB_STATUS: Record<JobStatus, { label: string; cls: string }> = {
  inquiry: { label: "รับบรีฟ", cls: "bg-zinc-700 text-zinc-200" },
  quoted: { label: "เสนอราคา", cls: "bg-sky-900 text-sky-200" },
  confirmed: { label: "ยืนยันแล้ว", cls: "bg-indigo-900 text-indigo-200" },
  in_production: { label: "กำลังผลิต", cls: "bg-amber-900 text-amber-200" },
  internal_qc: { label: "QC ภายใน", cls: "bg-yellow-900 text-yellow-200" },
  delivered: { label: "ส่งมอบแล้ว", cls: "bg-teal-900 text-teal-200" },
  revision: { label: "แก้ไข", cls: "bg-orange-900 text-orange-200" },
  approved: { label: "อนุมัติแล้ว", cls: "bg-emerald-900 text-emerald-200" },
  closed: { label: "ปิดงาน", cls: "bg-green-950 text-green-300" },
  cancelled: { label: "ยกเลิก", cls: "bg-red-950 text-red-300" },
};

// legal next-status ต่อสถานะ (ตรงกับ state machine ฝั่ง API)
export const JOB_NEXT: Record<JobStatus, JobStatus[]> = {
  inquiry: ["quoted", "cancelled"],
  quoted: ["confirmed", "cancelled"],
  confirmed: ["in_production", "cancelled"],
  in_production: ["internal_qc"],
  internal_qc: ["delivered", "in_production"],
  delivered: ["revision", "approved"],
  revision: ["in_production", "internal_qc"],
  approved: ["closed"],
  closed: [],
  cancelled: [],
};

export const JOB_DELIVERABLE_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "รอส่ง", cls: "bg-zinc-700 text-zinc-200" },
  submitted: { label: "ส่งแล้ว", cls: "bg-sky-900 text-sky-200" },
  approved: { label: "ผ่าน", cls: "bg-emerald-900 text-emerald-200" },
  rejected: { label: "ไม่ผ่าน", cls: "bg-red-900 text-red-200" },
};

export const JOB_PRIORITY: Record<string, { label: string; dot: string }> = {
  low: { label: "ต่ำ", dot: "bg-zinc-500" },
  normal: { label: "ปกติ", dot: "bg-sky-400" },
  urgent: { label: "ด่วน", dot: "bg-red-500" },
};

// ─── Character sections (PRD §5.2) ───────────────────────────

export interface CharacterRelationship {
  id: string;
  relationType: string;
  notes: string | null;
  direction: "outgoing" | "incoming";
  createdAt: string;
  other: {
    id: string;
    displayCode: string;
    nameTh: string;
    nameEn: string | null;
    thumbAssetId: string | null;
  } | null;
}

export interface CharacterWardrobeItem {
  id: string;
  characterId: string;
  name: string;
  occasion: string | null;
  description: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  coverAssetId: string | null;
  imageCount: number;
}

export interface CharacterExpressionItem {
  id: string;
  characterId: string;
  name: string;
  description: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  coverAssetId: string | null;
  imageCount: number;
}

// ─── Rights / Legal (PRD §16 — consumed read/write by RightsSection) ──

export type LegalStatus =
  | "draft"
  | "internal_only"
  | "commercial_approved"
  | "restricted"
  | "expired"
  | "archived";

export interface Right {
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
  legalStatus: LegalStatus;
  riskLevel: string; // low, medium, high
  createdAt: string;
  updatedAt: string;
}

export interface RightList {
  items: Right[];
  total: number;
  page: number;
  pageSize: number;
}

export const LEGAL_STATUS_LABEL: Record<LegalStatus, { label: string; cls: string }> = {
  draft: { label: "ร่าง", cls: "bg-zinc-700 text-zinc-200" },
  internal_only: { label: "ใช้ภายใน", cls: "bg-sky-900 text-sky-200" },
  commercial_approved: { label: "อนุมัติเชิงพาณิชย์", cls: "bg-emerald-900 text-emerald-200" },
  restricted: { label: "จำกัดการใช้", cls: "bg-orange-900 text-orange-200" },
  expired: { label: "หมดอายุ", cls: "bg-red-950 text-red-300" },
  archived: { label: "เก็บถาวร", cls: "bg-zinc-800 text-zinc-500" },
};

export const RISK_LEVEL_LABEL: Record<string, { label: string; cls: string }> = {
  low: { label: "ความเสี่ยงต่ำ", cls: "bg-emerald-900 text-emerald-200" },
  medium: { label: "ความเสี่ยงกลาง", cls: "bg-yellow-900 text-yellow-200" },
  high: { label: "ความเสี่ยงสูง", cls: "bg-red-900 text-red-200" },
};

// ─── Dashboard (GET /dashboard) — payload รวมทุก widget, finance ถูก gate ────
export interface DashboardKpis {
  charactersReady: number;
  charactersTotal: number;
  jobsInProduction: number;
  contentThisWeek: number;
  liveToday: number;
  // finance เท่านั้น (มาเมื่อ financeVisible=true)
  pipelineValue?: number;
  gmvThisMonth?: number;
  gmvDeltaPct?: number | null;
}

export interface DashboardActionNeeded {
  overdueTasks: number;
  overdueJobs: number;
  pendingApprovals: number;
  qcPending: number;
  deliverablesAwaitingClient: number;
  rightsExpiringSoon: number;
}

export interface DashboardPipeline {
  jobs: Record<string, number>;
  episodes: Record<string, number>;
  content: Record<string, number>;
}

export interface DashboardPerformance {
  gmvDailyLast7: { date: string; gmv: number }[];
  topPresenters: { id: string; name: string; gmv: number }[];
  topProducts: { id: string; name: string; gmv: number }[];
}

export interface DashboardWeekItem {
  type: "content" | "live" | "job";
  id: string;
  title: string;
  at: string;
  status: string | null;
}

export interface DashboardActivity {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  via: string;
  actorName: string | null;
  createdAt: string;
}

export interface DashboardOverview {
  financeVisible: boolean;
  kpis: DashboardKpis;
  actionNeeded: DashboardActionNeeded;
  pipeline: DashboardPipeline;
  performance?: DashboardPerformance;
  week: DashboardWeekItem[];
  activity: DashboardActivity[];
}

// ─── Team KPI / Goal-setting (Phase 1) ───────────────────────
export interface RoleOption {
  key: string;
  name: string;
}

// ─── Role permissions + row-level viewScope (Users & Roles) ──
export type ViewScope = "all" | "team" | "own";

// modules ที่ตั้ง viewScope ได้ในเฟส 1 (งาน production เท่านั้น — catalog แชร์กันไม่ scope)
export const SCOPED_MODULES: { module: string; label: string }[] = [
  { module: "content", label: "Content" },
  { module: "episode", label: "Episodes" },
];

export interface RolePermissionRow {
  module: string;
  actions: string[];
  viewScope: ViewScope;
}

export interface RoleWithPermissions {
  id: string;
  key: string;
  name: string;
  permissions: RolePermissionRow[];
}

export function fetchRolePermissions(): Promise<RoleWithPermissions[]> {
  return api<RoleWithPermissions[]>("/roles/permissions");
}

export function updateRoleViewScope(
  roleKey: string,
  module: string,
  viewScope: ViewScope,
): Promise<RolePermissionRow & { roleKey: string }> {
  return api(`/roles/${roleKey}/permissions/${module}`, {
    method: "PATCH",
    body: JSON.stringify({ viewScope }),
  });
}

// ─── Teams (viewScope 'team' — สมาชิกทีมเดียวกันเห็นงานกัน) ──
export interface TeamMemberRef {
  id: string;
  name: string;
  email: string;
}

export interface Team {
  id: string;
  name: string;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
  memberCount: number;
  members: TeamMemberRef[];
}

export const fetchTeams = () => api<Team[]>("/teams");
export const createTeam = (name: string) =>
  api<Team>("/teams", { method: "POST", body: JSON.stringify({ name }) });
export const updateTeam = (id: string, body: { name?: string; status?: "active" | "archived" }) =>
  api<Team>(`/teams/${id}`, { method: "PATCH", body: JSON.stringify(body) });
export const deleteTeam = (id: string) => api<{ ok: boolean }>(`/teams/${id}`, { method: "DELETE" });
export const setTeamMembers = (id: string, userIds: string[]) =>
  api<{ teamId: string; memberCount: number; members: TeamMemberRef[] }>(`/teams/${id}/members`, {
    method: "PUT",
    body: JSON.stringify({ userIds }),
  });

export type KpiPeriod = "weekly" | "monthly";

export interface KpiMetricDef {
  metric: string;
  label: string;
  icon: string;
}

export interface KpiMetricsResponse {
  metrics: KpiMetricDef[];
  periods: KpiPeriod[];
}

export interface KpiPerUser {
  userId: string;
  name: string;
  actual: number;
}

export interface KpiGoal {
  id: string;
  roleKey: string | null;
  metric: string;
  label: string;
  icon: string;
  period: KpiPeriod;
  target: number;
  active: boolean;
  memberCount: number;
  teamTarget: number;
  teamActual: number;
  perUser: KpiPerUser[];
}

export interface KpiGoalsResponse {
  roleKey: string;
  goals: KpiGoal[];
}

// ─── Assignment Hub — มอบหมายงาน + KPI รายคน (Phase 2) ───────
export type KpiTargetStatus = "on_track" | "behind" | "done";

export interface AssignmentTarget {
  metric: string;
  label: string;
  icon: string;
  target: number;
  source: "user" | "role"; // เป้าเฉพาะคน override เป้าของ role
  actual: number;
  progressPct: number;
  status: KpiTargetStatus;
}

export interface AssignmentWorkload {
  tasks: number; // Task ค้าง (ไม่ done)
  imageRequests: number; // งานภาพค้าง
  episodes: number; // อีพีที่รับผิดชอบ (ยังไม่ published/archived)
  contentItems: number; // คอนเทนต์ช่วง idea → internal_review
}

export interface AssignmentMember {
  userId: string;
  name: string;
  email: string;
  roles: { key: string; name: string }[];
  teams: { id: string; name: string }[];
  targets: AssignmentTarget[];
  workload: AssignmentWorkload;
  totals: { targets: number; done: number; onTrack: number; behind: number };
}

export interface AssignmentSummaryResponse {
  period: KpiPeriod;
  from: string;
  to: string;
  elapsedFraction: number; // 0..1 — สัดส่วนเวลาที่ผ่านไปของช่วง
  members: AssignmentMember[];
}

export function fetchAssignmentSummary(params: {
  period: KpiPeriod;
  teamId?: string;
  roleKey?: string;
}): Promise<AssignmentSummaryResponse> {
  const sp = new URLSearchParams({ period: params.period });
  if (params.teamId) sp.set("teamId", params.teamId);
  if (params.roleKey) sp.set("roleKey", params.roleKey);
  return api<AssignmentSummaryResponse>(`/kpi/assignment-summary?${sp.toString()}`);
}

// เป้ารายคน (scope 'user')
export interface UserKpiGoal {
  id: string;
  metric: string;
  label: string;
  icon: string;
  period: KpiPeriod;
  target: number;
  active: boolean;
  actual: number;
}

export interface UserKpiGoalsResponse {
  scope: "user";
  userId: string;
  name: string | null;
  goals: UserKpiGoal[];
}

export const fetchUserKpiGoals = (userId: string) =>
  api<UserKpiGoalsResponse>(`/kpi/goals?scope=user&userId=${encodeURIComponent(userId)}`);

export const upsertUserKpiGoals = (
  userId: string,
  goals: { metric: string; period: KpiPeriod; target: number; active?: boolean }[],
) =>
  api<UserKpiGoalsResponse>("/kpi/goals", {
    method: "PUT",
    body: JSON.stringify({ scope: "user", userId, goals }),
  });

// ─── Audience Segment — taxonomy กลางของกลุ่มผู้ชม (Phase 1) ───
export type AudienceGender = "any" | "female" | "male" | "mixed";
export type AudienceSpending = "low" | "medium" | "high";

export interface AudienceSegment {
  id: string;
  name: string;
  description: string | null;
  ageMin: number | null;
  ageMax: number | null;
  gender: string | null; // any, female, male, mixed
  interests: string[];
  platforms: string[];
  spendingPower: string | null; // low, medium, high
  region: string | null;
  painPoint: string | null;
  status: string; // active, archived
  createdAt?: string;
  updatedAt?: string;
  usageCount: number;
  characterCount?: number;
  seriesCount?: number;
}

// สรุป segment แบบย่อ ที่แนบมากับ link (character/series)
export interface AudienceSegmentSummary {
  id: string;
  name: string;
  gender?: string | null;
  ageMin?: number | null;
  ageMax?: number | null;
  status?: string;
  description?: string | null;
  interests?: string[];
  platforms?: string[];
  spendingPower?: string | null;
  region?: string | null;
  painPoint?: string | null;
}

export interface AudienceLink {
  segmentId: string;
  isPrimary: boolean;
  segment: AudienceSegmentSummary;
}

// ─── Brand Knowledge Base (Content Intelligence ระบบ 1) — additive ──
export interface BrandBookAsset {
  linkId: string;
  linkRole: string;
  assetId: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
}

// ─── Brand Book เต็มรูป (spec: _docs/brand_book_requirement.md) — additive ──
export interface BrandColorToken {
  token: string;
  dark?: string | null;
  light?: string | null;
  usage?: string | null;
}

export type BrandFontRoleKey = "heading" | "body" | "display" | "other";

export interface BrandFontRow {
  role: BrandFontRoleKey | string;
  family: string;
  note?: string | null;
}

// field เนื้อหา Brand Book ที่แชร์กันระหว่าง detail (editor) กับ book (read view)
export interface BrandBookFields {
  // Foundation
  mission: string | null;
  vision: string | null;
  coreValues: string[];
  positioning: string | null;
  personality: string | null;
  tagline: string | null;
  taglineFont: string | null;
  // Verbal
  wordBankUse: string[];
  wordBankAvoid: string[];
  exampleOnBrand: string | null;
  exampleOffBrand: string | null;
  platformGuides: Record<string, string> | null;
  // Visual
  nameUsage: string | null;
  logoUsageNote: string | null;
  moodNote: string | null;
  brandColors: BrandColorToken[] | null;
  brandFonts: BrandFontRow[] | null;
  // Governance
  bookVersion: string | null;
  bookApproverName: string | null;
  bookApproverContact: string | null;
  bookUpdatedAt: string | null;
}

export interface BrandDetail extends BrandBookFields {
  id: string;
  name: string;
  contact: string | null;
  notes: string | null;
  status: string; // active, archived
  brandStory: string | null;
  toneOfVoice: string | null;
  doList: string[];
  dontList: string[];
  keyMessages: string[];
  usp: string | null;
  restrictedClaims: string[];
  visualIdentity: string | null;
  competitorsNote: string | null;
  createdAt: string;
  updatedAt: string;
  productCount: number;
  audiences: AudienceLink[];
  brandBook: { count: number; assets: BrandBookAsset[] };
}

export function fetchBrand(id: string): Promise<BrandDetail> {
  return api<BrandDetail>(`/brands/${id}`);
}

// GET /brands (list) — enriched สำหรับหน้า Brands index
export interface BrandListItem {
  id: string;
  name: string;
  contact: string | null;
  notes: string | null;
  status: string; // active, archived
  tagline: string | null;
  productCount: number;
  clientCount: number;
  bookCompleteness: number; // 0-100 (เช็กลิสต์ 12 field ฝั่ง API)
  logoAssetId: string | null; // asset linkRole 'logo_icon' ล่าสุด
}

export function fetchBrands(params?: { q?: string; status?: string }): Promise<BrandListItem[]> {
  const qs = new URLSearchParams();
  if (params?.q) qs.set("q", params.q);
  if (params?.status) qs.set("status", params.status);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return api<BrandListItem[]>(`/brands${suffix}`);
}

// GET /brands/:id/book — aggregate เดียวจบสำหรับมุมมองอ่าน
export interface BrandBookData extends Omit<BrandDetail, "brandBook"> {
  completeness: number;
  clients: { id: string; name: string }[];
  assets: {
    logos: {
      icon: BrandBookAsset | null;
      full: BrandBookAsset | null;
      mono: BrandBookAsset | null;
    };
    templates: BrandBookAsset[];
    moods: BrandBookAsset[];
    files: BrandBookAsset[];
  };
}

export function fetchBrandBook(id: string): Promise<BrandBookData> {
  return api<BrandBookData>(`/brands/${id}/book`);
}

export const AUDIENCE_GENDER_LABEL: Record<string, string> = {
  any: "ทุกเพศ",
  female: "หญิง",
  male: "ชาย",
  mixed: "ผสม",
};

export const AUDIENCE_SPENDING_LABEL: Record<string, { label: string; cls: string }> = {
  low: { label: "กำลังซื้อต่ำ", cls: "bg-zinc-800 text-zinc-300" },
  medium: { label: "กำลังซื้อกลาง", cls: "bg-amber-900 text-amber-200" },
  high: { label: "กำลังซื้อสูง", cls: "bg-emerald-900 text-emerald-200" },
};

// สรุปช่วงอายุ/เพศ เป็นข้อความสั้น ๆ สำหรับ chip
export function audienceAgeGender(s: {
  ageMin?: number | null;
  ageMax?: number | null;
  gender?: string | null;
}): string {
  const bits: string[] = [];
  if (s.ageMin != null || s.ageMax != null) {
    if (s.ageMin != null && s.ageMax != null) bits.push(`${s.ageMin}-${s.ageMax} ปี`);
    else if (s.ageMin != null) bits.push(`${s.ageMin}+ ปี`);
    else if (s.ageMax != null) bits.push(`ถึง ${s.ageMax} ปี`);
  }
  if (s.gender && s.gender !== "any") bits.push(AUDIENCE_GENDER_LABEL[s.gender] ?? s.gender);
  return bits.join(" · ");
}

// ─── Product Tie-Ins (ไม่บังคับ) — Character / Series / Location ──
// สรุปสินค้าแบบย่อ ที่แนบมากับ tie-in link (ให้ UI แสดง card/chip ได้เลย)
export interface TieInProductSummary {
  id: string;
  name: string;
  displayCode: string;
  category?: string | null;
  price?: string | number | null; // Prisma Decimal → serialize เป็น string
  status?: string;
}

export interface TieInProductLink {
  productId: string;
  note: string | null;
  product: TieInProductSummary;
}

// entity ที่ผูกสินค้า tie-in ได้ → path prefix ของ API
export type TieInEntity = "character" | "series" | "location";
export const TIE_IN_ENTITY_PATH: Record<TieInEntity, string> = {
  character: "characters",
  series: "series",
  location: "locations",
};

export interface KpiMeRow {
  metric: string;
  label: string;
  icon: string;
  period: KpiPeriod;
  target: number;
  actual: number;
}

// ─── Affiliate Content Factory (Phase 1) ─────────────────────
export const AFFILIATE_PLATFORMS: { value: string; label: string; cls: string }[] = [
  { value: "shopee", label: "Shopee", cls: "bg-orange-900 text-orange-200" },
  { value: "tiktok_shop", label: "TikTok Shop", cls: "bg-zinc-800 text-zinc-200" },
  { value: "lazada", label: "Lazada", cls: "bg-blue-900 text-blue-200" },
  { value: "other", label: "อื่นๆ", cls: "bg-zinc-800 text-zinc-300" },
];

// สินค้า affiliate (extends product row จาก GET /products)
export interface AffiliateProduct {
  id: string;
  displayCode: string;
  name: string;
  category: string | null;
  description: string | null;
  price: string | number | null;
  salePrice: string | number | null;
  claimRiskLevel: string;
  restrictedClaims: string[];
  status: string;
  isAffiliate: boolean;
  affiliateUrl: string | null;
  affiliatePlatform: string | null;
  commissionPct: number | null;
  imageAssetId?: string | null;
  hasAffiliateContent?: boolean;
}

export interface AffiliateShot {
  scene: string;
  camera: string;
  action: string;
  dialogue?: string;
}

export interface AffiliateScriptJson {
  hook: string;
  body: string;
  cta: string;
  shots: AffiliateShot[];
}

// ContentItem ที่ AI สร้าง (sourceType 'affiliate')
export interface AffiliateContentItem {
  id: string;
  title: string;
  platform: string;
  status: string;
  sourceType: string | null;
  productId: string | null;
  caption: string | null;
  hook: string | null;
  cta: string | null;
  hashtags: string[];
  scriptJson: AffiliateScriptJson | null;
  affiliateUrlSnapshot: string | null;
  updatedAt: string;
  product?: {
    id: string;
    name: string;
    displayCode: string;
    affiliateUrl: string | null;
    affiliatePlatform: string | null;
  } | null;
}

export interface AffiliateReviewResponse {
  item: AffiliateContentItem;
  warning?: string;
  regenerated: boolean;
}

export interface AffiliateBatchResponse {
  generated: number;
  skipped: number;
  failed: number;
  truncated: boolean;
  truncatedNote?: string;
  failedItems: { productId: string; name: string; error: string }[];
  items: AffiliateContentItem[];
}

export const AFFILIATE_CAMERA_LABEL: Record<string, string> = {
  close_up: "โคลสอัพ",
  medium: "มีเดียม",
  wide: "ไวด์",
  over_shoulder: "ข้ามไหล่",
  pov: "POV",
  product_close_up: "โคลสอัพสินค้า",
  reaction: "รีแอ็กชัน",
  establishing: "เปิดฉาก",
};

// ─── AI Usage & Cost Accountability ──────────────────────────
export type AiToolUnit = "token" | "credit" | "flat";
export type AiOutputType = "video" | "image" | "other";
export type AiLinkEntityType = "episode" | "shot" | "content" | "image_request";

export interface AiTool {
  id: string;
  name: string;
  unit: AiToolUnit;
  defaultRateBaht: number | null;
  status: string; // active | archived
  note: string | null;
  createdAt: string;
  updatedAt: string;
  blendedRate: number | null; // บาท/หน่วย (เรตเฉลี่ยจริง)
  rateSource: "ledger" | "default" | "none";
  totalTopupBaht: number;
  totalTopupQuantity: number;
}

export interface AiCreditTopup {
  id: string;
  aiToolId: string;
  purchasedAt: string;
  amountBaht: number;
  quantity: number;
  note: string | null;
  createdAt: string;
}

export interface AiUsageLink {
  id?: string;
  entityType: AiLinkEntityType;
  entityId: string;
  label: string | null;
}

export interface AiUsageLog {
  id: string;
  userId: string;
  userName?: string | null;
  aiToolId: string;
  toolName: string;
  toolUnit: string;
  usedAt: string;
  quantity: number;
  costBaht: number;
  outputsCount: number;
  outputType: AiOutputType;
  note: string | null;
  createdAt: string;
  links: AiUsageLink[];
  rateWarning?: string | null;
}

export interface AiUsageSummary {
  ceo: boolean;
  totals: {
    costBaht: number;
    outputs: number;
    avgCostPerOutput: number | null;
    logs: number;
  };
  perTool: {
    tool: string;
    quantity: number;
    costBaht: number;
    outputs: number;
    costPerOutput: number | null;
  }[];
  perPerson: {
    userId: string;
    name: string | null;
    quantity: number;
    costBaht: number;
    outputs: number;
    costPerOutput: number | null;
    linkedPct: number;
    flag: "ok" | "review";
  }[];
  teamMedianCostPerOutput: number;
}

export interface AiLinkSearchResult {
  entityType: AiLinkEntityType;
  entityId: string;
  label: string;
}

export interface CreateAiUsageLogInput {
  aiToolId: string;
  usedAt: string;
  quantity: number;
  outputsCount: number;
  outputType: AiOutputType;
  note?: string;
  costBaht?: number;
  links: { entityType: AiLinkEntityType; entityId: string; label?: string }[];
}

export const AI_OUTPUT_TYPE_LABEL: Record<AiOutputType, string> = {
  video: "วิดีโอ",
  image: "ภาพ",
  other: "อื่นๆ",
};

export const AI_TOOL_UNIT_LABEL: Record<AiToolUnit, string> = {
  token: "Token",
  credit: "Credit",
  flat: "เหมาจ่าย",
};

// AI tools (admin)
export const listAiTools = () => api<AiTool[]>("/ai-tools");
export const createAiTool = (body: {
  name: string;
  unit: AiToolUnit;
  defaultRateBaht?: number;
  status?: string;
  note?: string;
}) => api<AiTool>("/ai-tools", { method: "POST", body: JSON.stringify(body) });
export const updateAiTool = (
  id: string,
  body: Partial<{ name: string; unit: AiToolUnit; defaultRateBaht: number; status: string; note: string }>,
) => api<AiTool>(`/ai-tools/${id}`, { method: "PATCH", body: JSON.stringify(body) });
export const deleteAiTool = (id: string) =>
  api<{ ok: boolean }>(`/ai-tools/${id}`, { method: "DELETE" });

// credit top-up ledger (admin)
export const listAiTopups = (toolId: string) =>
  api<AiCreditTopup[]>(`/ai-tools/${toolId}/topups`);
export const createAiTopup = (
  toolId: string,
  body: { purchasedAt: string; amountBaht: number; quantity: number; note?: string },
) => api<AiCreditTopup>(`/ai-tools/${toolId}/topups`, { method: "POST", body: JSON.stringify(body) });
export const deleteAiTopup = (topupId: string) =>
  api<{ ok: boolean }>(`/ai-tools/topups/${topupId}`, { method: "DELETE" });

// usage logs
export const listAiUsage = (params: {
  userId?: string;
  aiToolId?: string;
  from?: string;
  to?: string;
} = {}) => {
  const qs = new URLSearchParams();
  if (params.userId) qs.set("userId", params.userId);
  if (params.aiToolId) qs.set("aiToolId", params.aiToolId);
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  const s = qs.toString();
  return api<AiUsageLog[]>(`/ai-usage${s ? `?${s}` : ""}`);
};
export const createAiUsage = (body: CreateAiUsageLogInput) =>
  api<AiUsageLog>("/ai-usage", { method: "POST", body: JSON.stringify(body) });
export const deleteAiUsage = (id: string) =>
  api<{ ok: boolean }>(`/ai-usage/${id}`, { method: "DELETE" });
export const aiUsageSummary = (params: { from?: string; to?: string } = {}) => {
  const qs = new URLSearchParams();
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  const s = qs.toString();
  return api<AiUsageSummary>(`/ai-usage/summary${s ? `?${s}` : ""}`);
};
export const aiLinkSearch = (q: string) =>
  api<AiLinkSearchResult[]>(`/ai-usage/link-search?q=${encodeURIComponent(q)}`);

// ─── Media Center — ลิงก์ Google Drive / คลังงานของทีม ────────
export interface MediaLink {
  id: string;
  label: string;
  url: string;
  category: string | null;
  icon: string | null;
  note: string | null;
  sortOrder: number;
  status: string; // active | archived
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MediaLinkInput {
  label: string;
  url: string;
  category?: string | null;
  icon?: string | null;
  note?: string | null;
  sortOrder?: number;
  status?: string;
}

// hub — ทุกคนที่ล็อกอิน (เฉพาะ active, filter category ได้)
export const fetchMediaLinks = (category?: string) =>
  api<MediaLink[]>(`/media-links${category ? `?category=${encodeURIComponent(category)}` : ""}`);
// จัดการใน Settings — รวม archived (admin `setting`)
export const fetchMediaLinksManage = () => api<MediaLink[]>("/media-links/manage");
export const createMediaLink = (body: MediaLinkInput) =>
  api<MediaLink>("/media-links", { method: "POST", body: JSON.stringify(body) });
export const updateMediaLink = (id: string, body: Partial<MediaLinkInput>) =>
  api<MediaLink>(`/media-links/${id}`, { method: "PATCH", body: JSON.stringify(body) });
export const deleteMediaLink = (id: string) =>
  api<{ ok: boolean }>(`/media-links/${id}`, { method: "DELETE" });

// ─── Content Intelligence — System 2 (Ideation) + 2.1 (Customer Voice) ──

export const FEEDBACK_SOURCE_LABEL: Record<string, { label: string; icon: string }> = {
  comment: { label: "คอมเมนต์", icon: "💬" },
  chat: { label: "แชทลูกค้า", icon: "📩" },
  sales_note: { label: "เซลส์สรุป", icon: "🧑‍💼" },
};

export const SENTIMENT_LABEL: Record<string, { label: string; cls: string }> = {
  positive: { label: "บวก", cls: "bg-emerald-900/60 text-emerald-200" },
  negative: { label: "ลบ", cls: "bg-red-900/60 text-red-200" },
  neutral: { label: "กลาง", cls: "bg-zinc-800 text-zinc-300" },
};

export interface CustomerFeedback {
  id: string;
  text: string;
  source: string;
  sourceRef: string | null;
  brandId: string | null;
  productId: string | null;
  characterId: string | null;
  contentItemId: string | null;
  sentiment: string | null;
  rating: number | null; // ดาวจากรีวิว marketplace (1-5) — null = ไม่รู้ดาว
  themes: string[];
  aiProcessedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface FeedbackCreateResponse {
  feedback: CustomerFeedback;
  aiProcessed: boolean;
  aiUnavailable?: boolean;
  aiError?: boolean;
}

export interface FeedbackBulkResponse {
  created: number;
  processed: number;
  failed: number;
  aiUnavailable: boolean;
  items: CustomerFeedback[];
}

export interface FeedbackList {
  total: number;
  page: number;
  pageSize: number;
  items: CustomerFeedback[];
}

export interface FeedbackInsights {
  total: number;
  sentimentBreakdown: { sentiment: string; count: number; pct: number }[];
  topThemes: { theme: string; count: number }[];
  recentNegatives: {
    id: string;
    text: string;
    themes: string[];
    source: string;
    createdAt: string;
  }[];
}

export interface CreateFeedbackInput {
  text: string;
  source: string;
  sourceRef?: string;
  brandId?: string;
  productId?: string;
  characterId?: string;
  contentItemId?: string;
}

export interface BulkFeedbackInput {
  text?: string;
  texts?: string[];
  source: string;
  sourceRef?: string;
  brandId?: string;
  productId?: string;
}

export function fetchFeedback(query: Record<string, string> = {}): Promise<FeedbackList> {
  const qs = new URLSearchParams(query).toString();
  return api<FeedbackList>(`/customer-feedback${qs ? `?${qs}` : ""}`);
}
export const createFeedback = (body: CreateFeedbackInput) =>
  api<FeedbackCreateResponse>("/customer-feedback", { method: "POST", body: JSON.stringify(body) });
export const createFeedbackBulk = (body: BulkFeedbackInput) =>
  api<FeedbackBulkResponse>("/customer-feedback/bulk", { method: "POST", body: JSON.stringify(body) });
export const reprocessFeedback = (id: string) =>
  api<FeedbackCreateResponse>(`/customer-feedback/${id}/reprocess`, { method: "POST" });
export const deleteFeedback = (id: string) =>
  api<{ deleted: boolean }>(`/customer-feedback/${id}`, { method: "DELETE" });
export function fetchFeedbackInsights(query: Record<string, string> = {}): Promise<FeedbackInsights> {
  const qs = new URLSearchParams(query).toString();
  return api<FeedbackInsights>(`/customer-feedback/insights${qs ? `?${qs}` : ""}`);
}

// ── Customer Review Capture — วางก้อนรีวิว Shopee → AI คัด 4-5 ดาวเก็บเข้าคลังของสินค้า ──
export interface ExtractReviewsResponse {
  saved: number;
  skipped: number;
  items: CustomerFeedback[];
}

export const extractProductReviews = (body: { productId: string; text: string }) =>
  api<ExtractReviewsResponse>("/customer-feedback/extract-reviews", {
    method: "POST",
    body: JSON.stringify(body),
  });

/** รีวิว 4-5 ดาวของสินค้า (ใช้ในแผงเลือกเสียงลูกค้าของ Clip Job + คลังใน ReviewBriefModal) */
export const fetchProductTopReviews = (productId: string) =>
  fetchFeedback({ productId, minRating: "4", pageSize: "100" });

// ── AI Ideation ──
export const IDEATION_MODE_LABEL: Record<string, { label: string; desc: string }> = {
  auto: { label: "Auto", desc: "AI คิดเองจาก context ทั้งหมด" },
  guided: { label: "Guided", desc: "โยน seed → AI ต่อยอด" },
  iterate: { label: "Iterate", desc: "คอมเมนต์ไอเดีย → AI ปรับ" },
};

export interface IdeaCandidate {
  title: string;
  hook: string;
  angle: string;
  platform: string;
  format: string;
  contentType: string;
  characterHint: string;
  productHint: string;
  captionDirection: string;
  rationale: string;
  sourceSignals: string[];
}

export interface IdeationRun {
  id: string;
  mode: string;
  seedText: string | null;
  seedIdeaId: string | null;
  brandId: string | null;
  contextJson: Record<string, unknown> | null;
  resultJson: IdeaCandidate[];
  ideaCount: number;
  createdBy: string;
  createdAt: string;
}

export interface IdeateResponse {
  run: IdeationRun;
  provenance: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

export interface IdeationRunList {
  total: number;
  page: number;
  pageSize: number;
  items: IdeationRun[];
}

export interface IdeateInput {
  mode: string;
  brandId?: string;
  seedText?: string;
  seedIdeaId?: string;
  audienceSegmentIds?: string[];
  platformHint?: string;
  count?: number;
  priorRunId?: string;
  comment?: string;
  // ดึงเทรนด์นอกผ่าน Claude web search ก่อนคิดไอเดีย (มีค่าใช้จ่ายเพิ่ม — default off)
  useWebTrends?: boolean;
}

export interface AiStatus {
  configured: boolean;
  model: string;
}

export const fetchIdeateStatus = () => api<AiStatus>("/ai/ideate/status");
export const runIdeate = (body: IdeateInput) =>
  api<IdeateResponse>("/ai/ideate", { method: "POST", body: JSON.stringify(body) });
export function fetchIdeationRuns(query: Record<string, string> = {}): Promise<IdeationRunList> {
  const qs = new URLSearchParams(query).toString();
  return api<IdeationRunList>(`/ideation-runs${qs ? `?${qs}` : ""}`);
}
export const fetchIdeationRun = (id: string) => api<IdeationRun>(`/ideation-runs/${id}`);
export const convertIdea = (runId: string, ideaIndex: number, target: "idea" | "content") =>
  api<{ target: string; record: { id: string; title: string } }>(
    `/ideation-runs/${runId}/convert`,
    { method: "POST", body: JSON.stringify({ ideaIndex, target }) },
  );

// brand picker (ideation) — ใช้ /brands list เดิม (product:V)
export interface BrandOption {
  id: string;
  name: string;
  status: string;
}
export const fetchBrandOptions = () => api<BrandOption[]>("/brands");

// seed picker — ไอเดียจาก Idea Library
export interface IdeaOption {
  id: string;
  title: string;
  ideaType: string | null;
  status: string;
}
export const fetchIdeaOptions = () =>
  api<{ items: IdeaOption[] }>("/ideas?pageSize=100").then((r) => r.items);

// ─── Content Intelligence — System 4 (Content Analytics) ──
// insight = aggregates (ตัวเลข deterministic) + synthesis (AI ตีความ)

export const INSIGHT_SCOPE_LABEL: Record<string, { label: string; desc: string }> = {
  overall: { label: "ภาพรวม", desc: "วิเคราะห์คอนเทนต์ทั้งหมด" },
  platform: { label: "แพลตฟอร์ม", desc: "เจาะจงแพลตฟอร์มเดียว" },
  character: { label: "ตัวละคร", desc: "เจาะจงพรีเซนเตอร์" },
  format: { label: "ฟอร์แมต", desc: "เจาะจงฟอร์แมต" },
  time: { label: "เวลา", desc: "เน้นแพตเทิร์นเวลา" },
};

export interface InsightRankedBucket {
  key: string;
  label: string;
  views: number;
  gmv: number;
  orders: number;
  avgCtr: number | null;
  avgCompletion: number | null;
  avgRoas: number | null;
  count: number;
}

export interface InsightTopPerformer {
  contentItemId: string;
  title: string;
  platform: string;
  format: string | null;
  contentType: string | null;
  hook: string | null;
  views: number;
  gmv: number;
  orders: number;
  ctr: number | null;
  completionRate: number | null;
  roas: number | null;
}

export interface InsightAggregates {
  sampleSize: number;
  snapshotCount: number;
  totals: { views: number; gmv: number; orders: number; likes: number };
  topPerformers: InsightTopPerformer[];
  byPlatform: InsightRankedBucket[];
  byFormat: InsightRankedBucket[];
  byContentType: InsightRankedBucket[];
  byCharacter: InsightRankedBucket[];
  byHook: InsightRankedBucket[];
  byDayOfWeek: InsightRankedBucket[];
  byHour: InsightRankedBucket[];
  best: {
    bestPlatform: string | null;
    bestFormat: string | null;
    bestContentType: string | null;
    bestCharacter: string | null;
    bestHook: string | null;
    bestDayOfWeek: string | null;
    bestHour: string | null;
    bestTime: string | null;
  };
}

export interface InsightSynthesis {
  summary: string;
  patterns: { signal: string; evidence: string; metric: string }[];
  recommendations: { action: string; rationale: string; targetPlatform: string }[];
  bestHook: string;
  bestFormat: string;
  bestCharacter: string;
  bestTime: string;
}

export interface ContentInsightJson {
  aggregates: InsightAggregates;
  synthesis: InsightSynthesis | null;
  aiAvailable: boolean;
  charNames?: Record<string, string>;
}

export interface ContentInsight {
  id: string;
  scope: string;
  scopeRef: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  summary: string | null;
  insightJson: ContentInsightJson;
  sampleSize: number;
  createdBy: string;
  createdAt: string;
}

export interface GenerateInsightResponse {
  insight: ContentInsight;
  provenance: "ai" | "deterministic";
  aiUnavailable?: boolean;
  model?: string;
  usage?: { inputTokens: number; outputTokens: number };
}

export interface ContentInsightList {
  total: number;
  page: number;
  pageSize: number;
  items: ContentInsight[];
}

export interface GenerateInsightInput {
  scope: string;
  scopeRef?: string;
  from?: string;
  to?: string;
}

export const fetchInsightStatus = () => api<AiStatus>("/content-insights/status");
export const generateInsight = (body: GenerateInsightInput) =>
  api<GenerateInsightResponse>("/content-insights/generate", {
    method: "POST",
    body: JSON.stringify(body),
  });
export function fetchContentInsights(query: Record<string, string> = {}): Promise<ContentInsightList> {
  const qs = new URLSearchParams(query).toString();
  return api<ContentInsightList>(`/content-insights${qs ? `?${qs}` : ""}`);
}
export const fetchContentInsight = (id: string) => api<ContentInsight>(`/content-insights/${id}`);

// ─── Prompt Quick-Capture — "เพิ่มเร็ว" วางโพสต์จาก Facebook เข้า Prompt Library ──

export interface PromptCaptureExtraction {
  name: string;
  promptType: string;
  body: string;
  negativeBody: string;
  targetPlatform: string; // midjourney|grok|chatgpt|kling|unknown|อื่น ๆ (free string)
  notes: string;
  confidence: "high" | "medium" | "low";
  model?: string;
  usage?: { inputTokens: number; outputTokens: number };
}

export interface PromptCaptureExtractInput {
  text?: string;
  imageAssetId?: string;
  imageBase64?: { mediaType: string; data: string };
  sourceUrl?: string;
}

export interface PromptCaptureFetchUrlResult {
  ok: boolean;
  title?: string;
  description?: string;
  imageAssetId?: string;
  reason?: string; // ภาษาไทย — โชว์ user ได้เลยตอน ok:false
}

export interface PromptCaptureCreateInput {
  name: string;
  promptType: string;
  body: string;
  negativeBody?: string;
  targetPlatform?: string;
  notes?: string;
  sourceUrl?: string;
  exampleAssetIds?: string[];
}

export interface PromptCaptureCreated {
  id: string;
  name: string;
  promptType: string;
  status: string;
  versions: { id: string; versionLabel: string; sourceUrl: string | null }[];
}

export const fetchPromptCaptureStatus = () => api<AiStatus>("/prompts/capture/status");
export const extractPromptCapture = (body: PromptCaptureExtractInput) =>
  api<PromptCaptureExtraction>("/prompts/capture/extract", {
    method: "POST",
    body: JSON.stringify(body),
  });
export const fetchPromptCaptureUrl = (url: string) =>
  api<PromptCaptureFetchUrlResult>("/prompts/capture/fetch-url", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
export const createPromptCapture = (body: PromptCaptureCreateInput) =>
  api<PromptCaptureCreated>("/prompts/capture", { method: "POST", body: JSON.stringify(body) });

// ─── งานภาพ (Image Requests) — mini-ticket ผลิต banner/cover/illustration ──

export type ImageRequestType = "banner" | "cover" | "illustration" | "other";
export type ImageRequestStatus =
  | "open"
  | "in_progress"
  | "review"
  | "revision"
  | "approved"
  | "cancelled";
export type ImageRequestPriority = "low" | "normal" | "urgent";
export type ImageRequestTarget = "content" | "campaign" | "episode";

export const IMAGE_REQUEST_STATUS: Record<ImageRequestStatus, { label: string; cls: string }> = {
  open: { label: "เปิด", cls: "bg-zinc-800 text-zinc-300" },
  in_progress: { label: "กำลังทำ", cls: "bg-blue-900/70 text-blue-200" },
  review: { label: "รอรีวิว", cls: "bg-violet-900/70 text-violet-200" },
  revision: { label: "แก้ไข", cls: "bg-orange-900/70 text-orange-200" },
  approved: { label: "อนุมัติแล้ว", cls: "bg-emerald-900/70 text-emerald-200" },
  cancelled: { label: "ยกเลิก", cls: "bg-red-950 text-red-300" },
};

export const IMAGE_REQUEST_TYPE_LABEL: Record<ImageRequestType, { label: string; emoji: string }> = {
  banner: { label: "แบนเนอร์", emoji: "🪧" },
  cover: { label: "ภาพปก", emoji: "🖼️" },
  illustration: { label: "ภาพประกอบ", emoji: "🎨" },
  other: { label: "อื่นๆ", emoji: "📐" },
};

export const IMAGE_REQUEST_PRIORITY: Record<ImageRequestPriority, { label: string; dot: string }> = {
  low: { label: "ชิลๆ", dot: "bg-zinc-500" },
  normal: { label: "ปกติ", dot: "bg-blue-400" },
  urgent: { label: "ด่วน", dot: "bg-red-500" },
};

// ปุ่มถัดไปที่ UI โชว์ได้ต่อสถานะ (server ตัดสินขั้นสุดท้ายเสมอ)
export const IMAGE_REQUEST_NEXT: Record<ImageRequestStatus, ImageRequestStatus[]> = {
  open: ["in_progress", "cancelled"],
  in_progress: ["review", "cancelled"],
  review: ["revision", "approved", "cancelled"],
  revision: ["in_progress", "review", "cancelled"],
  approved: [],
  cancelled: [],
};

export const IMAGE_REQUEST_TARGET_LABEL: Record<ImageRequestTarget, string> = {
  content: "คอนเทนต์",
  campaign: "แคมเปญ",
  episode: "อีพี",
};

export interface ImageRequestListItem {
  id: string;
  displayCode: string;
  title: string;
  imageType: ImageRequestType;
  platform?: string | null;
  sizeNote?: string | null;
  brandId?: string | null;
  entityType?: ImageRequestTarget | null;
  entityId?: string | null;
  requesterId: string;
  requesterName?: string | null;
  assigneeId?: string | null;
  assigneeName?: string | null;
  dueAt?: string | null;
  priority: ImageRequestPriority;
  status: ImageRequestStatus;
  updatedAt: string;
  latestVersionAssetId?: string | null;
  versionCount?: number;
}

export interface ImageRequestVersion {
  id: string; // assetId
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  width: number | null;
  height: number | null;
  uploadedBy: string;
  uploadedByName?: string | null;
  createdAt: string;
}

export interface ImageRequestComment {
  id: string;
  content: string;
  createdBy: string;
  createdByName?: string | null;
  createdAt: string;
}

export interface ImageRequestDetail extends ImageRequestListItem {
  copyText?: string | null;
  brief?: string | null;
  draftPrompt?: string | null;
  approvedBy?: string | null;
  approvedByName?: string | null;
  approvedAt?: string | null;
  approvedAssetId?: string | null;
  createdAt: string;
  brand?: { id: string; name: string } | null;
  targetLabel?: string | null;
  versions: ImageRequestVersion[];
  comments: ImageRequestComment[];
}

export interface ImageRequestListResponse {
  items: ImageRequestListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateImageRequestInput {
  title: string;
  imageType: ImageRequestType;
  platform?: string;
  sizeNote?: string;
  copyText?: string;
  brief?: string;
  brandId?: string;
  entityType?: ImageRequestTarget;
  entityId?: string;
  assigneeId?: string;
  dueAt?: string;
  priority?: ImageRequestPriority;
}

export interface DraftPromptResult {
  draftPrompt: string;
  negativePrompt: string | null;
  notes: string | null;
  provenance: "ai" | "deterministic";
}

export const listImageRequests = (params: {
  q?: string;
  status?: string;
  assigneeId?: string;
  requesterId?: string;
  imageType?: string;
  priority?: string;
} = {}) => {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
  const s = qs.toString();
  return api<ImageRequestListResponse>(`/image-requests${s ? `?${s}` : ""}`);
};
export const getImageRequest = (id: string) => api<ImageRequestDetail>(`/image-requests/${id}`);
export const createImageRequest = (body: CreateImageRequestInput) =>
  api<ImageRequestListItem>("/image-requests", { method: "POST", body: JSON.stringify(body) });
export const updateImageRequest = (
  id: string,
  body: Partial<CreateImageRequestInput> & { draftPrompt?: string | null; assigneeId?: string | null; dueAt?: string | null },
) => api<ImageRequestListItem>(`/image-requests/${id}`, { method: "PATCH", body: JSON.stringify(body) });
export const changeImageRequestStatus = (
  id: string,
  body: { status: ImageRequestStatus; approvedAssetId?: string; comment?: string },
) => api<ImageRequestListItem>(`/image-requests/${id}/status`, { method: "POST", body: JSON.stringify(body) });
export const draftImageRequestPrompt = (id: string) =>
  api<DraftPromptResult>(`/image-requests/${id}/draft-prompt`, { method: "POST" });
export const cancelImageRequest = (id: string) =>
  api<ImageRequestListItem>(`/image-requests/${id}`, { method: "DELETE" });

// ─── ROI ต่อคลิป — ต้นทุน AI (AI Usage) vs ผลงานคอนเทนต์ (deterministic, ไม่มี AI) ──
// ฝั่งเงิน (gmv/revenue/profit/roi + totalGmv/totalProfit) เห็นเฉพาะ CEO (admin/founder)
// — non-CEO ได้ null และ ceo:false (UI ใช้ flag นี้เลือกคอลัมน์)

export interface RoiRow {
  contentItemId: string;
  title: string;
  platform: string;
  sourceType: string | null;
  cost: number; // Σ costBaht ของ log ที่ผูกตรงตัวกับคลิป (entityType='content')
  episodeCost: number; // ต้นทุนระดับอีพี (episode+shot) — แชร์ทั้งอีพี ไม่รวมเข้า cost
  views: number; // sum ทุก snapshot ในช่วง
  costPerView: number | null; // cost/views — null เมื่อ views=0
  gmv: number | null; // CEO เท่านั้น
  revenue: number | null; // CEO เท่านั้น
  profit: number | null; // gmv - cost — CEO เท่านั้น
  roi: number | null; // (gmv-cost)/cost — null เมื่อ cost=0 — CEO เท่านั้น
}

export interface RoiTotals {
  totalCost: number;
  totalViews: number;
  totalGmv: number | null; // CEO เท่านั้น
  totalProfit: number | null; // CEO เท่านั้น
}

export interface RoiResponse {
  ceo: boolean;
  count: number; // จำนวนแถวทั้งหมดที่เข้าเงื่อนไข (rows ถูก cap 200)
  rows: RoiRow[];
  totals: RoiTotals;
}

// query: from/to (YYYY-MM-DD) · platform · category (contentType) · sourceType
export function fetchContentRoi(query: Record<string, string> = {}): Promise<RoiResponse> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v) qs.set(k, v);
  const s = qs.toString();
  return api<RoiResponse>(`/content-insights/roi${s ? `?${s}` : ""}`);
}
