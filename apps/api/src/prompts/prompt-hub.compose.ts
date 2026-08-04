// Prompt Hub — server-side compact composition ต่อคลัง (pure functions, ไม่เรียก AI)
// ใช้เป็น preview ใน GET /prompts/hub และ canonical body ของ POST /prompts/hub/snapshot
//
// หมายเหตุ: ไม่จำเป็นต้อง word-identical กับ web promptBuilders — ฝั่ง web ยัง compose
// variants ต่อ tool จาก raw source record เองด้วย client builders (promptBuilders.ts)
// ตัวนี้คือ rendering แบบกระชับฝั่ง server สำหรับ snapshot ที่ frozen เข้าคลังหลัก

import type { CameraPreset, Gesture, HandProfile, LightingPreset, Location } from '@prisma/client';

export interface ComposedPrompt {
  body: string;
  negative: string | null;
}

// negative มาตรฐานของ Hand (ตรงกับ HAND_GROK_NEGATIVE ฝั่ง web)
export const HAND_NEGATIVE =
  'no extra fingers, no deformed hands, no fused fingers, blurry, low quality';

function s(v: string | null | undefined): string {
  return (v ?? '').trim();
}

/** join ส่วนที่ไม่ว่างด้วย comma แล้วปิดประโยค */
function sentence(parts: (string | false | null | undefined)[]): string {
  const joined = parts
    .map((p) => (p ? String(p).trim() : ''))
    .filter(Boolean)
    .join(', ');
  if (!joined) return '';
  return /[.!?]$/.test(joined) ? joined : `${joined}.`;
}

/** ต่อบรรทัด — ตัดค่า false/ว่างทิ้ง */
function lines(items: (string | false | null | undefined)[]): string {
  return items
    .map((i) => (typeof i === 'string' ? i.trim() : ''))
    .filter(Boolean)
    .join('\n');
}

// ─── Location → scene prompt ─────────────────────────────────
export function composeLocation(loc: Location): ComposedPrompt {
  const base =
    s(loc.prompt) ||
    sentence([`A photorealistic scene of ${loc.name}`, s(loc.type) && `${s(loc.type)} setting`]);
  const already = base.toLowerCase();
  const atmosphere = [
    s(loc.mood) && `${s(loc.mood)} mood`,
    s(loc.lighting) && `${s(loc.lighting)} lighting`,
    s(loc.timeOfDay) && `time of day: ${s(loc.timeOfDay)}`,
    s(loc.regionStyle) && `${s(loc.regionStyle)} regional style`,
  ]
    .filter((p): p is string => Boolean(p))
    // ข้ามฟิลด์ที่ค่าโผล่อยู่ใน prompt เดิมแล้ว (กันซ้ำ — logic เดียวกับ web builder)
    .filter((p) => {
      const raw = p.replace(/^time of day: /, '').replace(/ (mood|lighting|regional style)$/, '');
      return !already.includes(raw.toLowerCase());
    });
  const body = atmosphere.length ? `${base}\n\n${sentence([`Atmosphere: ${atmosphere.join(', ')}`])}` : base;
  return { body, negative: s(loc.negativePrompt) || null };
}

// ─── Gesture → shot prompt ───────────────────────────────────
export function composeGesture(g: Gesture): ComposedPrompt {
  const stateLine =
    s(g.requiredProductState) || s(g.resultingProductState)
      ? `Product state: ${s(g.requiredProductState) || '?'} → ${s(g.resultingProductState) || '?'}`
      : '';
  const durParts = [
    g.naturalDurationSec != null && `~${g.naturalDurationSec}s natural`,
    g.minDurationSec != null && g.maxDurationSec != null && `range ${g.minDurationSec}–${g.maxDurationSec}s`,
  ].filter(Boolean);
  const body = lines([
    s(g.promptTemplate) || sentence([`Hand gesture: ${g.name}`, s(g.description)]),
    stateLine,
    durParts.length > 0 && `Duration: ${durParts.join(' ')}`,
  ]);
  return { body, negative: s(g.negativePrompt) || null };
}

// ─── Camera Preset → shot prompt ─────────────────────────────
export function composeCamera(c: CameraPreset): ComposedPrompt {
  const meta = sentence([
    s(c.shotSize) && `${s(c.shotSize)} shot`,
    s(c.angle) && `${s(c.angle)} angle`,
    s(c.cameraMovement) &&
      `${s(c.cameraMovement)} movement${s(c.movementSpeed) ? ` (${s(c.movementSpeed)})` : ''}`,
    s(c.lens) && `${s(c.lens)} lens`,
    s(c.focalLength) && `${s(c.focalLength)} focal length`,
    s(c.depthOfField) && `${s(c.depthOfField)} depth of field`,
    s(c.aspectRatio) && `aspect ratio ${s(c.aspectRatio)}`,
  ]);
  const body = lines([meta && `Camera: ${meta}`, s(c.promptTemplate)]) || `Camera preset: ${c.name}`;
  return { body, negative: s(c.negativePrompt) || null };
}

// ─── Lighting Preset → scene prompt ──────────────────────────
export function composeLighting(l: LightingPreset): ComposedPrompt {
  const meta = sentence([
    s(l.mood) && `${s(l.mood)} mood`,
    s(l.keyLight) && `key light ${s(l.keyLight)}`,
    s(l.fillLight) && `fill light ${s(l.fillLight)}`,
    s(l.backLight) && `back light ${s(l.backLight)}`,
    s(l.colorTemperature) && `color temperature ${s(l.colorTemperature)}`,
    s(l.contrast) && `${s(l.contrast)} contrast`,
    s(l.shadowLevel) && `${s(l.shadowLevel)} shadows`,
  ]);
  const body = lines([meta && `Lighting: ${meta}`, s(l.promptTemplate)]) || `Lighting preset: ${l.name}`;
  return { body, negative: s(l.negativePrompt) || null };
}

// ─── Hand Profile → shot prompt (EN descriptor เหมือน hand line ฝั่ง web) ──
export function composeHand(h: HandProfile): ComposedPrompt {
  const nail = [s(h.nailLength), s(h.nailShape), s(h.nailColor), s(h.nailStyle)]
    .filter(Boolean)
    .join(' ');
  const accessories = (h.accessories ?? []).map((a) => a.trim()).filter(Boolean);
  const body = sentence([
    `A photorealistic close-up of ${s(h.skinTone) ? `a ${s(h.skinTone)} hand` : 'a hand'}`,
    s(h.gender),
    s(h.ageGroup) && `${s(h.ageGroup)} age`,
    s(h.handSize) && `${s(h.handSize)} hand size`,
    s(h.fingerLength) && `${s(h.fingerLength)} fingers`,
    nail && `${nail} nails`,
    accessories.length > 0 && `wearing ${accessories.join(', ')}`,
    s(h.sleeveStyle) && `${s(h.sleeveStyle)} sleeve`,
    s(h.skinTexture) && `${s(h.skinTexture)} skin texture`,
    s(h.dominantHand) && `${s(h.dominantHand)}-handed`,
    'natural pose, sharp focus, well-formed fingers',
  ]);
  return { body, negative: HAND_NEGATIVE };
}
