// Types + labels — Product Interaction Library (Slice 1): Hand / Gesture / Product State
//                  + (Slice 2): Interaction Templates (clip recipes)

import { api } from "./api";

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ─── Hand Profiles ───────────────────────────────────────────
export interface HandProfile {
  id: string;
  displayCode: string;
  name: string;
  category: string;
  gender: string | null;
  ageGroup: string | null;
  skinTone: string | null;
  handSize: string | null;
  fingerLength: string | null;
  nailLength: string | null;
  nailShape: string | null;
  nailColor: string | null;
  nailStyle: string | null;
  accessories: string[];
  sleeveStyle: string | null;
  skinTexture: string | null;
  dominantHand: string | null;
  allowedGestures: string[];
  restrictedGestures: string[];
  productCategorySuitability: string[];
  isChild: boolean;
  policyFlag: string | null;
  complianceReviewed: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
  thumbAssetId?: string | null;
}

export const HAND_STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-zinc-700 text-zinc-200" },
  active: { label: "Active", cls: "bg-emerald-900 text-emerald-200" },
  archived: { label: "Archived", cls: "bg-zinc-800 text-zinc-500" },
};

export const HAND_CATEGORIES = [
  "adult_female",
  "adult_male",
  "child",
  "elderly",
  "teen",
  "professional",
  "working",
  "farmer",
  "mechanic",
  "mother",
  "business",
  "custom",
] as const;

// ─── Gestures ────────────────────────────────────────────────
export interface Gesture {
  id: string;
  key: string | null;
  name: string;
  category: string | null;
  description: string | null;
  naturalDurationSec: number | null;
  minDurationSec: number | null;
  maxDurationSec: number | null;
  minSpeedMultiplier: number | null;
  maxSpeedMultiplier: number | null;
  requiredHandCount: number | null;
  requiredProductState: string | null;
  resultingProductState: string | null;
  compatiblePackaging: string[];
  compatibleMaterial: string[];
  riskLevel: string;
  promptTemplate: string | null;
  negativePrompt: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export const RISK_LABEL: Record<string, { label: string; cls: string }> = {
  low: { label: "เสี่ยงต่ำ", cls: "bg-emerald-900 text-emerald-200" },
  medium: { label: "เสี่ยงกลาง", cls: "bg-amber-900 text-amber-200" },
  high: { label: "เสี่ยงสูง", cls: "bg-red-900 text-red-200" },
};

export const GESTURE_STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  active: { label: "Active", cls: "bg-emerald-900 text-emerald-200" },
  archived: { label: "Archived", cls: "bg-zinc-800 text-zinc-500" },
};

// ─── Camera Presets (Slice 3, §3.6) ──────────────────────────
export interface CameraPreset {
  id: string;
  displayCode: string;
  key: string | null;
  name: string;
  description: string | null;
  shotSize: string | null;
  angle: string | null;
  lens: string | null;
  focalLength: string | null;
  cameraMovement: string | null;
  movementSpeed: string | null;
  distance: string | null;
  focusTarget: string | null;
  depthOfField: string | null;
  stabilization: string | null;
  aspectRatio: string | null;
  safeArea: string | null;
  productVisibility: string | null;
  handVisibility: string | null;
  compatiblePackaging: string[];
  promptTemplate: string | null;
  negativePrompt: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Lighting Presets (Slice 3, §3.7) ────────────────────────
export interface LightingPreset {
  id: string;
  displayCode: string;
  key: string | null;
  name: string;
  description: string | null;
  keyLight: string | null;
  fillLight: string | null;
  backLight: string | null;
  colorTemperature: string | null;
  contrast: string | null;
  shadowLevel: string | null;
  highlightControl: string | null;
  reflectiveProductRule: string | null;
  transparentProductRule: string | null;
  skinToneCompatibility: string[];
  backgroundCompatibility: string[];
  mood: string | null;
  promptTemplate: string | null;
  negativePrompt: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export const PRESET_STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  active: { label: "Active", cls: "bg-emerald-900 text-emerald-200" },
  archived: { label: "Archived", cls: "bg-zinc-800 text-zinc-500" },
};

// ─── Product States + transitions + validate-sequence ────────
export interface ProductState {
  id: string;
  key: string;
  label: string;
  sortOrder: number;
  isInitial: boolean;
  isTerminal: boolean;
  status: string;
  builtin: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TransitionPair {
  from: string | null;
  to: string | null;
  note?: string | null;
}

export interface TransitionsResponse {
  states: ProductState[];
  transitions: TransitionPair[];
}

export interface SequenceError {
  index: number;
  from: string;
  to: string;
  reason: string;
}

export interface SequenceResult {
  ok: boolean;
  errors: SequenceError[];
  warnings: string[];
}

// ─── Interaction Templates (Slice 2) ─────────────────────────
export const TEMPLATE_SECTIONS = [
  "hook",
  "reveal",
  "interaction",
  "demonstration",
  "result",
  "cta",
] as const;
export type TemplateSection = (typeof TEMPLATE_SECTIONS)[number];

export const SECTION_LABEL: Record<string, { label: string; cls: string }> = {
  hook: { label: "Hook", cls: "bg-pink-900/60 text-pink-200" },
  reveal: { label: "Reveal", cls: "bg-purple-900/60 text-purple-200" },
  interaction: { label: "Interaction", cls: "bg-blue-900/60 text-blue-200" },
  demonstration: { label: "Demo", cls: "bg-cyan-900/60 text-cyan-200" },
  result: { label: "Result", cls: "bg-emerald-900/60 text-emerald-200" },
  cta: { label: "CTA", cls: "bg-amber-900/60 text-amber-200" },
};

export const TEMPLATE_STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-zinc-700 text-zinc-200" },
  active: { label: "Active", cls: "bg-emerald-900 text-emerald-200" },
  archived: { label: "Archived", cls: "bg-zinc-800 text-zinc-500" },
};

// summary ที่ API enrich ลงบน step (subset ของ Gesture/HandProfile)
export interface StepGestureSummary {
  id: string;
  key: string | null;
  name: string;
  category: string | null;
  requiredProductState: string | null;
  resultingProductState: string | null;
  naturalDurationSec: number | null;
  minDurationSec: number | null;
  maxDurationSec: number | null;
  compatiblePackaging: string[];
  promptTemplate: string | null;
  negativePrompt: string | null;
  riskLevel: string;
  status: string;
}

export interface StepHandSummary {
  id: string;
  displayCode: string;
  name: string;
  category: string;
  skinTone: string | null;
  status: string;
}

// camera/lighting summary ที่ API enrich ลงบน step (subset ของ CameraPreset/LightingPreset)
export interface StepCameraSummary {
  id: string;
  displayCode: string;
  key: string | null;
  name: string;
  shotSize: string | null;
  angle: string | null;
  cameraMovement: string | null;
  compatiblePackaging: string[];
  status: string;
}

export interface StepLightingSummary {
  id: string;
  displayCode: string;
  key: string | null;
  name: string;
  mood: string | null;
  colorTemperature: string | null;
  status: string;
}

export interface InteractionTemplateStep {
  id: string;
  templateId: string;
  stepOrder: number;
  section: string;
  gestureId: string | null;
  handId: string | null;
  cameraId: string | null;
  lightingId: string | null;
  cameraNote: string | null;
  lightingNote: string | null;
  durationSec: number | null;
  required: boolean;
  note: string | null;
  gesture?: StepGestureSummary | null;
  hand?: StepHandSummary | null;
  camera?: StepCameraSummary | null;
  lighting?: StepLightingSummary | null;
}

export interface InteractionTemplate {
  id: string;
  displayCode: string;
  name: string;
  description: string | null;
  productCategory: string | null;
  packagingType: string | null;
  materialType: string | null;
  platform: string | null;
  aspectRatio: string | null;
  storyboardType: string | null;
  targetDurationSec: number | null;
  defaultHandId: string | null;
  defaultCameraId: string | null;
  defaultLightingId: string | null;
  status: string;
  version: string;
  createdAt: string;
  updatedAt: string;
  stepCount?: number;
  totalDurationSec?: number;
  steps?: InteractionTemplateStep[];
  defaultHand?: StepHandSummary | null;
  defaultCamera?: StepCameraSummary | null;
  defaultLighting?: StepLightingSummary | null;
}

export interface TemplateValidateResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export interface PromptPackageStep {
  order: number;
  section: string;
  title: string;
  prompt: string;
  negativePrompt: string | null;
}

export interface PromptPackage {
  steps: PromptPackageStep[];
  combined: string;
}

// step ที่ส่งขึ้น PUT :id/steps (replace-set — stepOrder = index)
export interface TemplateStepInput {
  section: string;
  gestureId?: string;
  handId?: string;
  cameraId?: string;
  lightingId?: string;
  cameraNote?: string;
  lightingNote?: string;
  durationSec?: number;
  required?: boolean;
  note?: string;
}

// ─── fetchers ────────────────────────────────────────────────
export function fetchTemplates(params: Record<string, string>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v && search.set(k, v));
  return api<Paged<InteractionTemplate>>(`/interaction-templates?${search.toString()}`);
}

export function fetchTemplate(id: string) {
  return api<InteractionTemplate>(`/interaction-templates/${id}`);
}

export function saveTemplateSteps(id: string, steps: TemplateStepInput[]) {
  return api<InteractionTemplate & { warnings: string[] }>(`/interaction-templates/${id}/steps`, {
    method: "PUT",
    body: JSON.stringify({ steps }),
  });
}

export function validateTemplate(id: string) {
  return api<TemplateValidateResult>(`/interaction-templates/${id}/validate`);
}

export function fetchPromptPackage(id: string) {
  return api<PromptPackage>(`/interaction-templates/${id}/prompt-package`);
}

export function cloneTemplate(id: string) {
  return api<InteractionTemplate>(`/interaction-templates/${id}/clone`, { method: "POST" });
}

export function archiveTemplate(id: string) {
  return api<InteractionTemplate>(`/interaction-templates/${id}/archive`, { method: "PATCH" });
}

/** โหลด gesture/hand ทั้งหมดสำหรับ select ใน editor (endpoint แบ่งหน้า 20/หน้า → วนไม่เกิน 10 หน้า) */
export async function fetchAllGestures(): Promise<Gesture[]> {
  const all: Gesture[] = [];
  for (let page = 1; page <= 10; page++) {
    const res = await api<Paged<Gesture>>(`/gestures?status=active&page=${page}`);
    all.push(...res.items);
    if (all.length >= res.total || res.items.length === 0) break;
  }
  return all;
}

export async function fetchAllHands(): Promise<HandProfile[]> {
  const all: HandProfile[] = [];
  for (let page = 1; page <= 10; page++) {
    const res = await api<Paged<HandProfile>>(`/hands?page=${page}`);
    all.push(...res.items);
    if (all.length >= res.total || res.items.length === 0) break;
  }
  return all;
}

// ─── Camera Presets fetchers (Slice 3) ───────────────────────
export function fetchCameraPresets(params: Record<string, string>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v && search.set(k, v));
  return api<Paged<CameraPreset>>(`/camera-presets?${search.toString()}`);
}

export function createCameraPreset(body: Partial<CameraPreset>) {
  return api<CameraPreset>(`/camera-presets`, { method: "POST", body: JSON.stringify(body) });
}

export function updateCameraPreset(id: string, body: Partial<CameraPreset>) {
  return api<CameraPreset>(`/camera-presets/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

export function archiveCameraPreset(id: string) {
  return api<CameraPreset>(`/camera-presets/${id}/archive`, { method: "PATCH" });
}

export async function fetchAllCameras(): Promise<CameraPreset[]> {
  const all: CameraPreset[] = [];
  for (let page = 1; page <= 10; page++) {
    const res = await api<Paged<CameraPreset>>(`/camera-presets?status=active&page=${page}`);
    all.push(...res.items);
    if (all.length >= res.total || res.items.length === 0) break;
  }
  return all;
}

// ─── Lighting Presets fetchers (Slice 3) ─────────────────────
export function fetchLightingPresets(params: Record<string, string>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v && search.set(k, v));
  return api<Paged<LightingPreset>>(`/lighting-presets?${search.toString()}`);
}

export function createLightingPreset(body: Partial<LightingPreset>) {
  return api<LightingPreset>(`/lighting-presets`, { method: "POST", body: JSON.stringify(body) });
}

export function updateLightingPreset(id: string, body: Partial<LightingPreset>) {
  return api<LightingPreset>(`/lighting-presets/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

export function archiveLightingPreset(id: string) {
  return api<LightingPreset>(`/lighting-presets/${id}/archive`, { method: "PATCH" });
}

export async function fetchAllLightings(): Promise<LightingPreset[]> {
  const all: LightingPreset[] = [];
  for (let page = 1; page <= 10; page++) {
    const res = await api<Paged<LightingPreset>>(`/lighting-presets?status=active&page=${page}`);
    all.push(...res.items);
    if (all.length >= res.total || res.items.length === 0) break;
  }
  return all;
}
