// UGC Studio v2 — Clip Jobs (types + fetchers, additive)
// flow: เลือกตัวถูกรีวิว (สินค้า/สถานที่/อาหาร) → ① AI เสนอคอนเซปต์ 3 แบบ
// → ② เลือกคอนเซปต์ → แตก Storyboard (sceneType/บทพูด/ข้อความขึ้นจอ + prompt คู่)
// → วางผลกลับ (ภาพนิ่ง = upload, วิดีโอ = ลิงก์ Google Drive) → ③ 📦 ชุดพร้อมโพสต์

import { api } from "./api";
import { Paged } from "./interaction";

// ── UGC Studio v2: subject / cta / sceneType ──
export const CLIP_SUBJECT_LABEL: Record<string, { label: string; icon: string }> = {
  product: { label: "สินค้า", icon: "🛍️" },
  place: { label: "ร้าน/สถานที่", icon: "☕" },
  food: { label: "อาหาร/เมนู", icon: "🍜" },
  software: { label: "ซอฟต์แวร์/ฟีเจอร์", icon: "💻" }, // v2.1 — ฉาก screen = capture จริง ห้าม AI gen UI
};

export const PLACE_CATEGORY_LABEL: Record<string, string> = {
  cafe: "คาเฟ่",
  bakery: "เบเกอรี่",
  "restaurant-noodle": "ร้านก๋วยเตี๋ยว/อาหาร",
  hotel: "ที่พัก/โรงแรม",
};

export const CTA_TYPE_LABEL: Record<string, { label: string; closing: string }> = {
  basket: { label: "จิ้มตะกร้า (affiliate)", closing: "จิ้มตะกร้าเลย" },
  map: { label: "พิกัด/แผนที่", closing: "พิกัดในคอมเมนต์" },
  line: { label: "ทัก LINE", closing: "ทัก LINE สั่งได้เลย" },
  phone: { label: "โทรสั่ง/จอง", closing: "โทรสั่ง/โทรจองได้เลย" },
  booking: { label: "จองที่พัก (OTA)", closing: "จองเลย ลิงก์ในคอมเมนต์" },
  signup: { label: "สมัครใช้/ทดลองฟรี (SaaS)", closing: "สมัครฟรี/ทดลองใช้เลย ลิงก์ในคอมเมนต์/ไบโอ" },
};

export const SCENE_TYPE_META: Record<
  string,
  { icon: string; label: string; rule: string; voice: string }
> = {
  presenter: {
    icon: "🎭",
    label: "มีตัวละคร",
    rule: "กฎ: ห้ามหันหลัง — หันหน้าหรือ ¾ เข้ากล้อง · ใช้ Master Prompt + reference ของตัวละคร",
    voice: "พูดหน้ากล้อง",
  },
  hands: {
    icon: "🖐️",
    label: "เห็นแค่มือ",
    rule: "กฎ: ห้ามเห็นหน้า ห้ามเห็นตัว · ใช้มือจาก Hand Library",
    voice: "เสียงบรรยายหญิง",
  },
  product_only: {
    icon: "📦",
    label: "ไม่มีคน",
    rule: "กฎ: ห้ามมีคน ห้ามมีมือ ห้ามเงาคน · ตัวถูกรีวิวเด่นเต็มเฟรม",
    voice: "เสียงบรรยายหญิงเท่านั้น",
  },
  // v2.1 — เฉพาะ job ซอฟต์แวร์ (subjectType=software): ไม่ gen ภาพ — ทีมอัด screen record จริงตามใบสั่ง Capture
  screen: {
    icon: "🖥️",
    label: "หน้าจอ",
    rule: "กฎ: ใช้ภาพ capture จากระบบจริงเท่านั้น · ซ่อนข้อมูลลูกค้า (PDPA)",
    voice: "เสียงบรรยายหญิง",
  },
};

export interface SubjectBrief {
  name?: string; // place/food = ชื่อร้าน/เมนู | software = ชื่อฟีเจอร์
  category?: string;
  highlights?: string[];
  vibe?: string;
  address?: string;
  mapUrl?: string;
  openHours?: string;
  priceRange?: string;
  note?: string;
  // v2.1 — เฉพาะ software
  product?: string; // ระบบ เช่น "GoSell"
  painPoint?: string;
  steps?: string[]; // ขั้นตอนใช้งาน 3-5 ขั้น → ฉาก screen map ตามนี้
  resultMetric?: string;
  pricing?: string;
  signupUrl?: string;
  // job สินค้า (subjectType=product) — "โจทย์ของคลิปนี้" ระดับ job (ข้อมูลถาวรอยู่ที่
  // Product.reviewBrief): angle = มุมที่อยากตี, promo = โปร/ดีลช่วงนี้, note = โน้ตถึง AI
  angle?: string;
  promo?: string;
  // เสียงรีวิวจริงลูกค้า 4-5 ดาวที่ติ๊กเลือก (สูงสุด 5) → AI paraphrase ทำ hook/บทพูด
  reviews?: string[];
}

export interface ClipConcept {
  name: string;
  fit: string;
  flow: string;
  highlight: string;
}

export interface ClipConceptsJson {
  sets: ClipConcept[][];
  current: number;
}

export const CLIP_JOB_STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  draft: { label: "ร่าง", cls: "bg-zinc-700 text-zinc-200" },
  planning: { label: "กำลังวางแผน", cls: "bg-blue-900/70 text-blue-200" },
  review: { label: "วางแผนแล้ว", cls: "bg-purple-900/70 text-purple-200" },
  generating: { label: "กำลัง gen", cls: "bg-cyan-900/70 text-cyan-200" },
  ready: { label: "พร้อมโพสต์", cls: "bg-emerald-900 text-emerald-200" },
  published: { label: "โพสต์แล้ว", cls: "bg-amber-900 text-amber-200" },
  archived: { label: "เก็บถาวร", cls: "bg-zinc-800 text-zinc-500" },
};

export const CLIP_MODE_LABEL: Record<string, { label: string; icon: string }> = {
  hand: { label: "โหมดมือ (UGC ไม่เห็นหน้า)", icon: "🖐️" },
  presenter: { label: "พรีเซนเตอร์ (ตัวละคร AI)", icon: "🎭" },
};

export const CLIP_SHOT_STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  pending: { label: "รอ gen", cls: "bg-zinc-700 text-zinc-200" },
  generated: { label: "gen แล้ว", cls: "bg-cyan-900/70 text-cyan-200" },
  approved: { label: "ผ่าน", cls: "bg-emerald-900 text-emerald-200" },
};

export const CLIP_PLATFORMS = ["tiktok", "facebook_reels", "instagram_reels", "youtube_shorts", "shopee_video"] as const;

// ── ความยาวคลิป: step ละ 8 วิ (บล็อก gen ของ Veo/Kling) — ต่ำสุด 8, default 16 ──
export const CLIP_DURATION_OPTIONS = [8, 16, 24, 32, 40, 48, 56, 64, 72, 80, 88, 96] as const;
export const CLIP_DURATION_DEFAULT = 16;

/** จำนวนฉากต่อความยาว — ฉากละ 4 วิตายตัว → duration/4 เป๊ะๆ (mirror sceneCountGuidance ฝั่ง API) */
export function clipSceneHint(sec: number | null | undefined): string {
  const d = sec ?? 16;
  const n = Math.max(1, Math.round(d / 4));
  return String(n);
}

export interface ClipShotRef {
  id: string;
  name: string;
  displayCode?: string;
  key?: string | null;
  category?: string | null;
  skinTone?: string | null;
  shotSize?: string | null;
  angle?: string | null;
  cameraMovement?: string | null;
  mood?: string | null;
  colorTemperature?: string | null;
  naturalDurationSec?: number | null;
}

export interface ClipShot {
  id: string;
  jobId: string;
  shotOrder: number;
  section: string;
  title: string | null;
  sceneType: string; // presenter | hands | product_only
  showProduct?: boolean; // false = ซ่อนสินค้าในช็อตนี้
  voiceType: string | null; // on_camera | female_vo
  onScreenText: string | null; // ข้อความขึ้นจอ (ใส่ตอนตัดต่อ)
  gestureId: string | null;
  handId: string | null;
  cameraId: string | null;
  lightingId: string | null;
  durationSec: number | null;
  dialogue: string | null;
  stillPrompt: string | null;
  motionPrompt: string | null;
  negativePrompt: string | null;
  stillAssetId: string | null;
  videoUrl: string | null;
  genSource: string;
  status: string;
  note: string | null;
  gesture?: ClipShotRef | null;
  hand?: ClipShotRef | null;
  camera?: ClipShotRef | null;
  lighting?: ClipShotRef | null;
}

export interface ClipJobProduct {
  id: string;
  name: string;
  displayCode: string;
  category?: string | null;
  affiliateUrl?: string | null;
  platformLinks?: Record<string, string> | null;
}

export interface ClipJob {
  id: string;
  displayCode: string;
  name: string;
  subjectType: string; // product | place | food
  productId: string | null;
  subjectBrief: SubjectBrief | null;
  ctaType: string;
  clientId: string | null;
  outputType: string;
  mode: string;
  handId: string | null;
  characterId: string | null;
  wardrobeId: string | null;
  locationId: string | null;
  voiceProfileId: string | null;
  voiceSpec: string | null;
  headline: string | null;
  conceptsJson: ClipConceptsJson | null;
  selectedConceptIndex: number | null;
  templateId: string | null;
  directorRunId: string | null;
  platform: string | null;
  aspectRatio: string | null;
  targetDurationSec: number | null;
  script: string | null;
  caption: string | null;
  hashtags: string[];
  affiliateLink: string | null;
  finalVideoUrl: string | null;
  finalNote: string | null;
  planJson: ClipPlanJson | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  // list enrich
  product?: ClipJobProduct | null;
  subject?: { type: string; name: string | null; category: string | null };
  shotCount?: number;
  doneCount?: number;
  thumbnailAssetId?: string | null;
}

export interface ClipPlanJson {
  summary?: string;
  storyboardType?: string | null;
  durationSec?: number | null;
  reasons?: { topic: string; text: string }[];
  validation?: { errors: string[]; warnings: string[] };
  factory?: { warning?: string };
}

// ── Banned Words Compliance — ผล scan ระดับ job (แนบมากับ GET detail) ──
export interface ClipComplianceMatch {
  source: string; // script | caption | hashtags | finalNote | dialogue
  label: string; // ป้ายชี้ตำแหน่งภาษาไทย เช่น "Shot 2 บทพูด"
  shotId?: string;
  term: string;
  severity: string; // ban | risky
  replacement: string | null;
}

export interface ClipCompliance {
  hasBan: boolean;
  hasRisky: boolean;
  matches: ClipComplianceMatch[];
}

export interface ClipJobDetail extends ClipJob {
  shots: ClipShot[];
  character?: { id: string; displayCode: string; nameTh: string; nameEn: string | null } | null;
  hand?: ClipShotRef | null;
  wardrobe?: { id: string; name: string; description: string | null; characterId: string } | null;
  location?: {
    id: string;
    name: string;
    prompt: string | null;
    continuityNotes: string | null;
    timeOfDay: string | null;
  } | null;
  voiceProfile?: {
    id: string;
    characterId: string;
    voiceType: string | null;
    tone: string | null;
    accent: string | null;
    speakingSpeed: string | null;
  } | null;
  client?: { id: string; name: string } | null;
  compliance?: ClipCompliance;
}

export interface ClipShotInput {
  section: string;
  title?: string;
  sceneType?: string;
  showProduct?: boolean;
  voiceType?: string;
  onScreenText?: string;
  gestureId?: string;
  handId?: string;
  cameraId?: string;
  lightingId?: string;
  durationSec?: number;
  dialogue?: string;
  stillPrompt?: string;
  motionPrompt?: string;
  negativePrompt?: string;
  stillAssetId?: string;
  videoUrl?: string;
  status?: string;
  note?: string;
}

export interface ClipPackage {
  job: {
    id: string;
    displayCode: string;
    name: string;
    subjectType: string;
    mode: string;
    outputType: string;
    platform: string | null;
    aspectRatio: string | null;
    status: string;
    product: { id: string; name: string; displayCode: string } | null;
    subject: { type: string; name: string | null; category: string | null };
  };
  headline: string | null;
  voiceSpec: string | null;
  ctaType: string;
  ctaLine: string;
  onScreenTexts: { order: number | null; label: string; text: string }[];
  script: string | null;
  caption: string | null;
  hashtags: string[];
  affiliateLink: string | null;
  // v2.1 software — ลิงก์สมัคร (brief.signupUrl ก่อน, affiliateLink fallback) + รายการต้อง capture จริง
  signupUrl?: string | null;
  captureShots?: {
    id: string;
    order: number;
    title: string | null;
    dialogue: string | null;
    onScreenText: string | null;
    captureBrief: string | null;
    videoUrl: string | null;
    status: string;
  }[];
  finalVideoUrl: string | null;
  finalNote: string | null;
  shots: {
    id: string;
    order: number;
    section: string;
    title: string | null;
    sceneType: string;
    voiceType: string | null;
    onScreenText: string | null;
    dialogue: string | null;
    stillAssetId: string | null;
    videoUrl: string | null;
    status: string;
  }[];
}

// ─── Google Drive helper — ลิงก์ไฟล์ Drive → URL embed ผ่าน iframe preview ──
export function driveEmbedUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/drive\.google\.com\/file\/d\/([^/?#]+)/);
  return m ? `https://drive.google.com/file/d/${m[1]}/preview` : null;
}

// ─── fetchers ────────────────────────────────────────────────
export const fetchClipStatus = () => api<{ configured: boolean; model: string }>("/clip-jobs/status");

export function fetchClipJobs(query: Record<string, string> = {}) {
  const qs = new URLSearchParams();
  Object.entries(query).forEach(([k, v]) => v && qs.set(k, v));
  const s = qs.toString();
  return api<Paged<ClipJob>>(`/clip-jobs${s ? `?${s}` : ""}`);
}

export const fetchClipJob = (id: string) => api<ClipJobDetail>(`/clip-jobs/${id}`);

export const createClipJob = (body: {
  subjectType?: string;
  productId?: string;
  subjectBrief?: SubjectBrief;
  ctaType?: string;
  clientId?: string;
  name?: string;
  mode?: string;
  outputType?: string;
  useVoice?: boolean;
  handId?: string;
  characterId?: string;
  wardrobeId?: string;
  locationId?: string;
  voiceProfileId?: string;
  platform?: string;
  aspectRatio?: string;
  targetDurationSec?: number;
  sceneLenSec?: number; // ⏱ ความยาวต่อฉาก 4/6/8 วิ
  affiliateLink?: string;
}) => api<ClipJob>("/clip-jobs", { method: "POST", body: JSON.stringify(body) });

export const updateClipJob = (id: string, body: Partial<ClipJob> & Record<string, unknown>) =>
  api<ClipJob>(`/clip-jobs/${id}`, { method: "PATCH", body: JSON.stringify(body) });

// ① AI เสนอคอนเซปต์ 3 แบบ — เรียกซ้ำ = ขอแนวใหม่ (append set, cap 5)
export const proposeClipConcepts = (id: string) =>
  api<{ concepts: ClipConcept[]; setIndex: number; setCount: number; capReached: boolean }>(
    `/clip-jobs/${id}/concepts`,
    { method: "POST" },
  );

// ② แตก storyboard จากคอนเซปต์ที่เลือก (v2 ต้องส่ง conceptIndex)
export const planClipJob = (id: string, conceptIndex: number) =>
  api<ClipJobDetail>(`/clip-jobs/${id}/plan`, {
    method: "POST",
    body: JSON.stringify({ conceptIndex }),
  });

export const archiveClipJob = (id: string) =>
  api<ClipJob>(`/clip-jobs/${id}/archive`, { method: "POST" });

export const replaceClipShots = (id: string, shots: ClipShotInput[]) =>
  api<ClipJobDetail>(`/clip-jobs/${id}/shots`, { method: "PUT", body: JSON.stringify({ shots }) });

export const patchClipShot = (
  jobId: string,
  shotId: string,
  body: Partial<ClipShotInput> & { status?: string },
) =>
  api<ClipShot & { jobStatus: string; complianceBlock?: { terms: string[] } }>(`/clip-jobs/${jobId}/shots/${shotId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

export interface PolicyFinding { id: string; severity: "high" | "medium" | "low"; label: string; hint: string; }
export interface PolicyCheck { risk: "high" | "medium" | "low" | "none"; still: { risk: string; findings: PolicyFinding[] }; motion: { risk: string; findings: PolicyFinding[] }; }
export const checkShotPolicy = (jobId: string, shotId: string) =>
  api<PolicyCheck>(`/clip-jobs/${jobId}/shots/${shotId}/policy`);
export const autoFixShotPolicy = (jobId: string, shotId: string) =>
  api<{ shot: ClipShot; after: { still: { risk: string }; motion: { risk: string } } }>(
    `/clip-jobs/${jobId}/shots/${shotId}/policy-autofix`,
    { method: "POST" },
  );

export const recomposeClipShot = (jobId: string, shotId: string) =>
  api<ClipShot>(`/clip-jobs/${jobId}/shots/${shotId}/recompose`, { method: "POST" });

export const fetchClipPackage = (id: string) => api<ClipPackage>(`/clip-jobs/${id}/package`);
