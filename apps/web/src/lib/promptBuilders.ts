// Per-library prompt builders — "👁️ ดู/ก๊อป Prompt ภาพ" ทุกคลัง (pure functions, ไม่เรียก AI)
//
// policy ต่อ tool เหมือน Character (imagePrompt.ts):
//  - ChatGPT/Gemini: prose ล้วน — ไม่มี "Negative prompt:" block (ตัวจุดชนวน content policy)
//  - Grok: แนบ "Negative prompt:" ต่อท้ายได้ (รองรับ format แบบ SD/MJ)
//  - "text" = variant เดียว ไม่แยก tool (Prompt Library version / Voice direction)
//
// ทุก builder ต้องทน sparse data: ฟิลด์ว่าง = ข้าม ไม่ทิ้ง ", ," หรือ label เปล่าไว้ในผลลัพธ์

import type { LocationItem, VoiceProfile } from "./library";
import type { CameraPreset, Gesture, HandProfile, LightingPreset } from "./interaction";
import type { PromptVersion } from "./prompts";

export type PromptViewerTool = "chatgpt" | "gemini" | "grok" | "text";

export interface PromptInternalEntry {
  label: string;
  text: string;
}

export interface PromptVariant {
  tool: PromptViewerTool;
  label: string;
  text: string;
  hint?: string;
  internal?: PromptInternalEntry[];
}

const HINT_PROSE = "วางแล้ว gen ได้เลย ไม่ต้องมี negative";
const HINT_GROK = "รองรับ negative prompt + params";

function s(v: string | null | undefined): string {
  return (v ?? "").trim();
}

/** join ส่วนที่ไม่ว่างด้วย comma แล้วปิดประโยค */
function sentence(parts: (string | false | null | undefined)[]): string {
  const joined = parts
    .map((p) => (p ? String(p).trim() : ""))
    .filter(Boolean)
    .join(", ");
  if (!joined) return "";
  return /[.!?]$/.test(joined) ? joined : `${joined}.`;
}

/** ต่อบรรทัด — false/null ตัดทิ้ง, "" = บรรทัดว่างที่ตั้งใจคั่น (ยุบซ้อน + ตัดหัว/ท้าย) */
function lines(items: (string | false | null | undefined)[]): string {
  const out: string[] = [];
  for (const item of items) {
    if (typeof item !== "string") continue; // false/null/undefined = ฟิลด์ว่าง ข้ามไป
    const t = item.trimEnd();
    if (t === "" && (out.length === 0 || out[out.length - 1] === "")) continue; // กัน blank ซ้อน/นำหน้า
    out.push(t);
  }
  while (out.length > 0 && out[out.length - 1] === "") out.pop();
  return out.join("\n");
}

/** สามแบบ ChatGPT/Gemini/Grok จาก prose เดียวกัน — Grok พก negative ต่อท้าย */
function proseTrio(
  prose: string,
  grokNegative: string,
  internal: PromptInternalEntry[],
): PromptVariant[] {
  const grokText = grokNegative ? `${prose}\n\nNegative prompt: ${grokNegative}` : prose;
  const shared = internal.length > 0 ? internal : undefined;
  return [
    { tool: "chatgpt", label: "ChatGPT", text: prose, hint: HINT_PROSE, internal: shared },
    { tool: "gemini", label: "Gemini", text: prose, hint: HINT_PROSE, internal: shared },
    { tool: "grok", label: "Grok", text: grokText, hint: HINT_GROK, internal: shared },
  ];
}

// ─── Location ────────────────────────────────────────────────
// prompt เดิมนำ verbatim แล้วเติมเฉพาะ atmosphere ที่ยังไม่ถูกพูดถึงใน prompt
export function buildLocationPromptVariants(loc: LocationItem): PromptVariant[] {
  const basePrompt = s(loc.prompt);
  const already = basePrompt.toLowerCase();
  const atmosphere = [
    s(loc.mood) && `${s(loc.mood)} mood`,
    s(loc.lighting) && `${s(loc.lighting)} lighting`,
    s(loc.timeOfDay) && `time of day: ${s(loc.timeOfDay)}`,
    s(loc.regionStyle) && `${s(loc.regionStyle)} regional style`,
  ].filter((p): p is string => Boolean(p))
    // ข้ามฟิลด์ที่ค่าโผล่อยู่ใน prompt เดิมแล้ว (กันซ้ำ)
    .filter((p) => {
      const raw = p.replace(/^time of day: /, "").replace(/ (mood|lighting|regional style)$/, "");
      return !(already && already.includes(raw.toLowerCase()));
    });

  let prose: string;
  if (basePrompt) {
    prose = atmosphere.length ? `${basePrompt}\n\n${sentence(["Atmosphere: " + atmosphere.join(", ")])}` : basePrompt;
  } else {
    prose = sentence([
      `A photorealistic scene of ${loc.name}`,
      s(loc.type) && `${s(loc.type)} setting`,
      ...atmosphere,
    ]);
  }

  const internal: PromptInternalEntry[] = [];
  if (s(loc.negativePrompt)) {
    internal.push({
      label: "Negative prompt (ใช้อัตโนมัติเฉพาะ Grok)",
      text: s(loc.negativePrompt),
    });
  }
  if (s(loc.continuityNotes)) {
    internal.push({
      label: "โน้ต continuity — แนบให้ทีมทุกครั้ง",
      text: s(loc.continuityNotes),
    });
  }

  return proseTrio(prose, s(loc.negativePrompt), internal);
}

// ─── Voice — Thai voice-direction brief (variant เดียว วางใน ElevenLabs/voice tool ได้เลย) ──
export function buildVoicePromptVariants(v: VoiceProfile): PromptVariant[] {
  const charName = v.character?.nameTh ? `${v.character.nameTh} (${v.character.displayCode})` : "";
  const dialogues = (v.sampleDialogues ?? []).map((d) => d.trim()).filter(Boolean);
  const emotions = (v.emotionalRange ?? []).map((e) => e.trim()).filter(Boolean);

  const text = lines([
    `🎙 Voice Direction${charName ? ` — ${charName}` : ""}`,
    "",
    s(v.voiceType) && `ประเภทเสียง: ${s(v.voiceType)}`,
    s(v.tone) && `โทน: ${s(v.tone)}`,
    s(v.accent) && `สำเนียง: ${s(v.accent)}`,
    s(v.speakingSpeed) && `ความเร็วการพูด: ${s(v.speakingSpeed)}`,
    s(v.laughStyle) && `สไตล์หัวเราะ: ${s(v.laughStyle)}`,
    emotions.length > 0 && `ช่วงอารมณ์: ${emotions.join(", ")}`,
    dialogues.length > 0 && "",
    dialogues.length > 0 && "ประโยคตัวอย่าง:",
    ...dialogues.map((d) => `- "${d}"`),
    (s(v.aiVoiceModel) || s(v.humanVoiceActor)) && "",
    s(v.aiVoiceModel) && `ตั้งค่า AI voice model: ${s(v.aiVoiceModel)}`,
    s(v.humanVoiceActor) && `นักพากย์ (มนุษย์): ${s(v.humanVoiceActor)}`,
  ]);

  const internal: PromptInternalEntry[] = [];
  if (s(v.usageRights)) {
    internal.push({ label: "สิทธิ์การใช้เสียง (ข้อมูลภายใน)", text: s(v.usageRights) });
  }

  return [
    {
      tool: "text",
      label: "Voice Direction",
      text,
      hint: "วางเป็น brief ให้ ElevenLabs / voice tool / นักพากย์ได้เลย",
      internal: internal.length ? internal : undefined,
    },
  ];
}

// ─── Hand — EN descriptor (แบบเดียวกับ hand line ใน Interaction prompt-package) ──
const HAND_GROK_NEGATIVE = "no extra fingers, no deformed hands, no fused fingers, blurry, low quality";

export function buildHandPromptVariants(h: HandProfile): PromptVariant[] {
  const nail = [s(h.nailLength), s(h.nailShape), s(h.nailColor), s(h.nailStyle)]
    .filter(Boolean)
    .join(" ");
  const accessories = (h.accessories ?? []).map((a) => a.trim()).filter(Boolean);

  const prose = sentence([
    `A photorealistic close-up of ${s(h.skinTone) ? `a ${s(h.skinTone)} hand` : "a hand"}`,
    s(h.gender) && `${s(h.gender)}`,
    s(h.ageGroup) && `${s(h.ageGroup)} age`,
    s(h.handSize) && `${s(h.handSize)} hand size`,
    s(h.fingerLength) && `${s(h.fingerLength)} fingers`,
    nail && `${nail} nails`,
    accessories.length > 0 && `wearing ${accessories.join(", ")}`,
    s(h.sleeveStyle) && `${s(h.sleeveStyle)} sleeve`,
    s(h.skinTexture) && `${s(h.skinTexture)} skin texture`,
    s(h.dominantHand) && `${s(h.dominantHand)}-handed`,
    "natural pose, sharp focus, well-formed fingers",
  ]);

  const internal: PromptInternalEntry[] = [];
  if ((h.restrictedGestures ?? []).length > 0) {
    internal.push({
      label: "ท่าที่ห้ามใช้กับมือนี้ (restricted gestures)",
      text: h.restrictedGestures.join(", "),
    });
  }
  if (s(h.policyFlag)) {
    internal.push({ label: "Policy flag", text: s(h.policyFlag) });
  }

  return proseTrio(prose, HAND_GROK_NEGATIVE, internal);
}

// ─── Gesture — promptTemplate นำ + state transition + duration hint ──
export function buildGesturePromptVariants(g: Gesture): PromptVariant[] {
  const stateLine =
    s(g.requiredProductState) || s(g.resultingProductState)
      ? `Product state: ${s(g.requiredProductState) || "?"} → ${s(g.resultingProductState) || "?"}`
      : "";
  const durParts = [
    g.naturalDurationSec != null && `~${g.naturalDurationSec}s natural`,
    g.minDurationSec != null && g.maxDurationSec != null && `range ${g.minDurationSec}–${g.maxDurationSec}s`,
  ].filter(Boolean);
  const durLine = durParts.length ? `Duration: ${durParts.join(" (") + (durParts.length > 1 ? ")" : "")}` : "";

  const prose = lines([
    s(g.promptTemplate) || sentence([`Hand gesture: ${g.name}`, s(g.description)]),
    stateLine,
    durLine,
  ]);

  const internal: PromptInternalEntry[] = [];
  if (s(g.negativePrompt)) {
    internal.push({ label: "Negative prompt (ใช้อัตโนมัติเฉพาะ Grok)", text: s(g.negativePrompt) });
  }
  if ((g.compatiblePackaging ?? []).length > 0) {
    internal.push({ label: "แพ็กเกจที่รองรับ", text: g.compatiblePackaging.join(", ") });
  }

  return proseTrio(prose, s(g.negativePrompt), internal);
}

// ─── Camera Preset — metadata line + promptTemplate ──
export function buildCameraPromptVariants(c: CameraPreset): PromptVariant[] {
  const meta = sentence([
    "Camera:",
    s(c.shotSize) && `${s(c.shotSize)} shot`,
    s(c.angle) && `${s(c.angle)} angle`,
    s(c.cameraMovement) && `${s(c.cameraMovement)} movement${s(c.movementSpeed) ? ` (${s(c.movementSpeed)})` : ""}`,
    s(c.lens) && `${s(c.lens)} lens`,
    s(c.focalLength) && `${s(c.focalLength)} focal length`,
    s(c.depthOfField) && `${s(c.depthOfField)} depth of field`,
    s(c.aspectRatio) && `aspect ratio ${s(c.aspectRatio)}`,
  ]).replace(/^Camera:,\s*/, "Camera: ").replace(/^Camera:\.?$/, "");

  const prose = lines([meta, s(c.promptTemplate)]) || `Camera preset: ${c.name}`;

  const internal: PromptInternalEntry[] = [];
  if (s(c.negativePrompt)) {
    internal.push({ label: "Negative prompt (ใช้อัตโนมัติเฉพาะ Grok)", text: s(c.negativePrompt) });
  }

  return proseTrio(prose, s(c.negativePrompt), internal);
}

// ─── Lighting Preset — light rig metadata + promptTemplate ──
export function buildLightingPromptVariants(l: LightingPreset): PromptVariant[] {
  const meta = sentence([
    "Lighting:",
    s(l.mood) && `${s(l.mood)} mood`,
    s(l.keyLight) && `key light ${s(l.keyLight)}`,
    s(l.fillLight) && `fill light ${s(l.fillLight)}`,
    s(l.backLight) && `back light ${s(l.backLight)}`,
    s(l.colorTemperature) && `color temperature ${s(l.colorTemperature)}`,
    s(l.contrast) && `${s(l.contrast)} contrast`,
    s(l.shadowLevel) && `${s(l.shadowLevel)} shadows`,
  ]).replace(/^Lighting:,\s*/, "Lighting: ").replace(/^Lighting:\.?$/, "");

  const prose = lines([meta, s(l.promptTemplate)]) || `Lighting preset: ${l.name}`;

  const internal: PromptInternalEntry[] = [];
  if (s(l.negativePrompt)) {
    internal.push({ label: "Negative prompt (ใช้อัตโนมัติเฉพาะ Grok)", text: s(l.negativePrompt) });
  }
  if (s(l.reflectiveProductRule)) {
    internal.push({ label: "กฎสินค้าสะท้อนแสง (reflective)", text: s(l.reflectiveProductRule) });
  }
  if (s(l.transparentProductRule)) {
    internal.push({ label: "กฎสินค้าโปร่งใส (transparent)", text: s(l.transparentProductRule) });
  }

  return proseTrio(prose, s(l.negativePrompt), internal);
}

// ─── Prompt Library version — body as-is + Model/Params (variant เดียว) ──
export function buildPromptVersionVariants(v: PromptVersion): PromptVariant[] {
  const params = v.generationParams
    ? Object.entries(v.generationParams)
        .map(([k, val]) => `${k}=${typeof val === "object" ? JSON.stringify(val) : String(val)}`)
        .join(", ")
    : "";

  const text = lines([
    v.body,
    (s(v.modelName) || params || s(v.seed)) && "",
    s(v.modelName) && `Model: ${s(v.modelName)}${s(v.modelVersion) ? ` ${s(v.modelVersion)}` : ""}`,
    params && `Params: ${params}`,
    s(v.seed) && `Seed: ${s(v.seed)}`,
  ]);

  const internal: PromptInternalEntry[] = [];
  if (s(v.negativeBody)) {
    internal.push({
      label: "Negative prompt (วางแยกเฉพาะ tool ที่รองรับ)",
      text: s(v.negativeBody),
    });
  }
  if (s(v.sourceUrl)) {
    internal.push({ label: "ที่มา (source)", text: s(v.sourceUrl) });
  }

  return [
    {
      tool: "text",
      label: `${v.targetPlatform || "Prompt"}`,
      text,
      hint: `เวอร์ชัน ${v.versionLabel} — target: ${v.targetPlatform || "ไม่ระบุ"}`,
      internal: internal.length ? internal : undefined,
    },
  ];
}
