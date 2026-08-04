// Per-tool image-prompt builders (Character Visual DNA v2)
// แก้ 3 ปัญหาจริงที่ CEO เจอ:
//  1) ChatGPT/DALL-E ปฏิเสธ prompt — เพราะเดิมเป็น meta-command ภาษาไทย + มี "Negative prompt:"
//     + มีข้อความ "ห้ามอ้างอิงหน้าบุคคลจริง/ดารา/IP" ซึ่งเป็นตัวจุดชนวน content policy
//     → ChatGPT/Gemini: บรรยายภาพเป็นภาษาอังกฤษล้วน ไม่มี meta-command ไม่มี negative block
//       และห้ามมีข้อความ "avoid real people/celebrity/IP" เด็ดขาด
//  2) Grok ออกมาเป็นฝรั่ง — เพราะ prompt ไม่เคยระบุเชื้อชาติ (มีแค่ region เช่น "อีสาน")
//     → ทุก builder นำหน้าด้วย ethnicity (default "Thai, Southeast Asian features")
//  3) ดู prompt เต็มไม่ได้ — เดิม copy อย่างเดียว → viewer แยกต่างหาก (ในหน้า page.tsx)
//
// builder ทั้งหมดเป็น pure function จาก visualDna (ไม่เรียก AI, ได้ผลทันที)

export type ImageTool = "chatgpt" | "gemini" | "grok";

type Json = Record<string, unknown>;

export interface PromptCharacter {
  nameTh?: string | null;
  nameEn?: string | null;
  age?: number | null;
  gender?: string | null;
  region?: string | null;
  visualDna?: Json | null;
  // Do's & Don'ts (Character Sheet) — ฝังเข้า DIRECTIVE ของ Master Prompt เป็น
  // ALWAYS/NEVER bullets (prose ปลอดภัย ไม่ใช่ negative block); Grok merge donts
  // เข้า Negative prompt line เพิ่มอีกชั้น
  dos?: string[] | null;
  donts?: string[] | null;
}

export const DEFAULT_ETHNICITY = "Thai, Southeast Asian features";
const DEFAULT_SHOT = "portrait";
const DEFAULT_ART_STYLE = "photorealistic";
const DEFAULT_ASPECT = "3:4";

// อ่านค่าจาก visualDna แบบทนทาน: string ตรง ๆ, array → join, อย่างอื่น → String()
function str(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean).join(", ");
  return String(v).trim();
}

function arr(v: unknown): string[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  const s = String(v).trim();
  return s ? [s] : [];
}

export function hasEthnicity(v: Json | null | undefined): boolean {
  return !!v && str(v.ethnicity).length > 0;
}

// ── ค่าที่ builder ทุกตัวใช้ร่วมกัน (พร้อม default) ──
interface Resolved {
  ethnicity: string;
  ethnicityIsDefault: boolean;
  subject: string; // "a 24-year-old Thai woman" ฯลฯ
  shotType: string;
  artStyle: string;
  aspect: string;
  face: string[];
  distinctive: string[];
  hair: string;
  skin: string;
  body: string[];
  style: string[];
  camera: string[];
  scene: string[];
  quality: string[];
  negativePrompt: string;
  antiClone: string[];
}

function resolve(c: PromptCharacter): Resolved {
  const v = (c.visualDna ?? {}) as Json;
  const ethnicityRaw = str(v.ethnicity);
  const ethnicity = ethnicityRaw || DEFAULT_ETHNICITY;
  const ethnicityIsDefault = ethnicityRaw.length === 0;

  const genderMap: Record<string, string> = { หญิง: "woman", ชาย: "man" };
  const gender = c.gender ? (genderMap[c.gender] ?? c.gender) : "person";
  const agePart = c.age != null ? `${c.age}-year-old ` : "";
  // subject นำด้วยเชื้อชาติเสมอ (แก้ปัญหา Grok ออกมาเป็นฝรั่ง)
  const subject = `a ${agePart}${ethnicity} ${gender}`.replace(/\s+/g, " ").trim();

  const face = [
    str(v.face_shape) && `face shape: ${str(v.face_shape)}`,
    str(v.eyes) && `eyes: ${str(v.eyes)}`,
    str(v.eyebrows) && `eyebrows: ${str(v.eyebrows)}`,
    str(v.nose) && `nose: ${str(v.nose)}`,
    str(v.lips) && `lips: ${str(v.lips)}`,
  ].filter(Boolean) as string[];

  const camera = [
    str(v.camera_angle) && `camera angle: ${str(v.camera_angle)}`,
    str(v.lens) && `lens: ${str(v.lens)}`,
    str(v.depth_of_field) && str(v.depth_of_field),
    str(v.lighting) && `lighting: ${str(v.lighting)}`,
    str(v.color_grade) && `color grade: ${str(v.color_grade)}`,
  ].filter(Boolean) as string[];

  const scene = [
    str(v.background_setting) && `background: ${str(v.background_setting)}`,
    str(v.mood) && `mood: ${str(v.mood)}`,
  ].filter(Boolean) as string[];

  const style = [
    str(v.hair_style) && `hair: ${str(v.hair_style)}`,
    str(v.makeup_style) && `makeup: ${str(v.makeup_style)}`,
    str(v.fashion_style) && `wearing ${str(v.fashion_style)}`,
    str(v.color_palette) && `signature colors: ${str(v.color_palette)}`,
  ].filter(Boolean) as string[];

  const body = [
    str(v.body_type) && `body type: ${str(v.body_type)}`,
    str(v.height_impression) && str(v.height_impression),
    str(v.posture) && `posture: ${str(v.posture)}`,
  ].filter(Boolean) as string[];

  return {
    ethnicity,
    ethnicityIsDefault,
    subject,
    shotType: str(v.shot_type) || DEFAULT_SHOT,
    artStyle: str(v.art_style) || DEFAULT_ART_STYLE,
    aspect: str(v.aspect_ratio) || DEFAULT_ASPECT,
    face,
    distinctive: arr(v.distinctive_features),
    hair: str(v.hair_style),
    skin: str(v.skin_tone),
    body,
    style,
    camera,
    scene,
    quality: arr(v.quality_tags),
    negativePrompt: str(v.negative_prompt),
    antiClone: arr(v.anti_clone_rules),
  };
}

// แปลง aspect "3:4" → คำบรรยาย prose (ChatGPT/Gemini ไม่ชอบ ratio-as-flag)
function aspectProse(aspect: string): string {
  if (/^\s*\d+\s*:\s*\d+\s*$/.test(aspect)) {
    const [w, h] = aspect.split(":").map((x) => Number(x.trim()));
    const orient = h > w ? "vertical" : w > h ? "horizontal" : "square";
    return `${orient} ${aspect} portrait framing`;
  }
  return aspect;
}

// ── ChatGPT / DALL-E — ประโยคบรรยายเดียวไหลลื่น ภาษาอังกฤษล้วน ปลอดภัยต่อ policy ──
// ห้ามมี: meta-command, "Negative prompt:", ข้อความ avoid real people/celebrity/IP
function buildChatGpt(c: PromptCharacter): string {
  const r = resolve(c);
  const parts: string[] = [];
  parts.push(`A ${r.artStyle} ${r.shotType} of ${r.subject}`);
  if (r.skin) parts.push(`with ${r.skin} skin`);
  if (r.face.length) parts.push(r.face.join(", "));
  if (r.distinctive.length) parts.push(`distinctive features: ${r.distinctive.join(", ")}`);
  if (r.body.length) parts.push(r.body.join(", "));
  if (r.style.length) parts.push(r.style.join(", ")); // style already includes hair/makeup/fashion/colors
  if (r.camera.length) parts.push(r.camera.join(", "));
  if (r.scene.length) parts.push(r.scene.join(", "));
  parts.push(aspectProse(r.aspect));
  if (r.quality.length) parts.push(r.quality.join(", "));
  // ประโยคเดียว คั่นด้วย comma — copy วางแล้ว gen ได้เลย
  return parts.filter(Boolean).join(", ").replace(/,\s*,/g, ",").trim() + ".";
}

// ── Gemini / Imagen — ภาษาอังกฤษ โครงสร้างชัดขึ้นเล็กน้อยได้ ไม่มี negative block ──
function buildGemini(c: PromptCharacter): string {
  const r = resolve(c);
  const lines: string[] = [];
  lines.push(`${cap(r.artStyle)} ${r.shotType} of ${r.subject}.`);
  const appearance = [
    r.skin && `${r.skin} skin`,
    ...r.face,
    r.distinctive.length ? `distinctive features: ${r.distinctive.join(", ")}` : "",
  ].filter(Boolean);
  if (appearance.length) lines.push(`Appearance: ${appearance.join(", ")}.`);
  const styling = [...r.style, ...r.body].filter(Boolean);
  if (styling.length) lines.push(`Styling: ${styling.join(", ")}.`);
  const photo = [...r.camera, ...r.scene].filter(Boolean);
  if (photo.length) lines.push(`Photography: ${photo.join(", ")}.`);
  const framing = [aspectProse(r.aspect), ...r.quality].filter(Boolean);
  lines.push(`Framing & quality: ${framing.join(", ")}.`);
  return lines.join("\n");
}

// ── Grok — บรรยาย + Negative prompt line + params (--ar) + quality tags ──
// Grok รองรับ format แบบ SD/MJ ได้
function buildGrok(c: PromptCharacter): string {
  const r = resolve(c);
  const desc: string[] = [];
  desc.push(`${cap(r.artStyle)} ${r.shotType} of ${r.subject}`);
  if (r.skin) desc.push(`${r.skin} skin`);
  desc.push(...r.face);
  if (r.distinctive.length) desc.push(`distinctive: ${r.distinctive.join(", ")}`);
  desc.push(...r.style, ...r.body, ...r.camera, ...r.scene);
  if (r.quality.length) desc.push(...r.quality);

  const lines: string[] = [desc.filter(Boolean).join(", ") + "."];

  // negative prompt: ค่าจาก visualDna + defaults ที่ปลอดภัย (Grok รับ format นี้)
  const negDefaults = [
    "deformed",
    "extra fingers",
    "bad anatomy",
    "blurry",
    "low quality",
    "watermark",
    "text",
  ];
  const negParts = [r.negativePrompt, ...negDefaults].filter(Boolean);
  lines.push("");
  lines.push(`Negative prompt: ${dedupeCsv(negParts.join(", "))}`);

  const aspectFlag = /^\s*\d+\s*:\s*\d+\s*$/.test(r.aspect) ? r.aspect.replace(/\s+/g, "") : DEFAULT_ASPECT;
  lines.push(`Params: --ar ${aspectFlag}`);
  return lines.join("\n");
}

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function dedupeCsv(s: string): string {
  const seen = new Set<string>();
  return s
    .split(",")
    .map((x) => x.trim())
    .filter((x) => {
      if (!x) return false;
      const k = x.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .join(", ");
}

export function buildPromptFor(tool: ImageTool, c: PromptCharacter): string {
  switch (tool) {
    case "gemini":
      return buildGemini(c);
    case "grok":
      return buildGrok(c);
    case "chatgpt":
    default:
      return buildChatGpt(c);
  }
}

export const IMAGE_TOOLS: { id: ImageTool; label: string; hint: string }[] = [
  { id: "chatgpt", label: "ChatGPT", hint: "วางแล้ว gen ได้เลย ไม่ต้องมี negative" },
  { id: "gemini", label: "Gemini", hint: "วางแล้ว gen ได้เลย ไม่ต้องมี negative" },
  { id: "grok", label: "Grok", hint: "รองรับ negative prompt + params" },
];

// ═══ Master Prompt (Verified Prompt downstream) ═══════════════════════════
// ห่อ spec เดิมด้วย "กรอบกำกับ" 3 ชั้นใน copy เดียว: DIRECTIVE (กฎเหล็ก + house rules
// จาก blueprint) → CHARACTER SPEC (body เดิมต่อ tool — policy ต่อ tool คงเดิมทุกอย่าง:
// ChatGPT/Gemini ยังไม่มี negative/real-people text, Grok ยังพก negative + params)
// → MUST-KEEP (สิ่งที่ห้ามหลุด — derive อัตโนมัติ + requiredFields จาก blueprint)
// ทั้งหมดเป็น pure function เหมือน builder เดิม

// subset ของ CharacterBlueprint ที่ Master Prompt ใช้ (viewer fetch มาจาก API)
export interface MasterPromptBlueprint {
  name?: string | null;
  houseRules?: string | null;
  requiredFields?: string[] | null;
}

// MUST-KEEP อัตโนมัติ: ethnicity + distinctive_features + signature (hair/skin)
// + ค่าของ blueprint.requiredFields ที่มีอยู่จริงใน visualDna (ไม่ซ้ำกับด้านบน)
export function buildMustKeep(
  c: PromptCharacter,
  blueprint?: MasterPromptBlueprint | null,
): string[] {
  const r = resolve(c);
  const v = (c.visualDna ?? {}) as Json;
  const items: string[] = [`ethnicity: ${r.ethnicity}`];
  if (r.distinctive.length) items.push(`distinctive features: ${r.distinctive.join(", ")}`);
  if (r.hair) items.push(`hair: ${r.hair}`);
  if (r.skin) items.push(`skin tone: ${r.skin}`);
  const covered = new Set(["ethnicity", "distinctive_features", "hair_style", "skin_tone"]);
  for (const key of blueprint?.requiredFields ?? []) {
    if (covered.has(key)) continue;
    covered.add(key);
    const val = str(v[key]);
    if (val) items.push(`${key.replace(/_/g, " ")}: ${val}`);
  }
  return items;
}

/**
 * Master Prompt เต็ม (copy-ready) — 3 ชั้นในข้อความเดียว
 * @param opts.hasReference true = มีรูป Reference (prompt_reference) ล็อกไว้ —
 *   เพิ่มกฎ "รูปแนบคือ ground truth ของหน้า" + บรรทัดปิดท้ายบอกว่ามีรูปแนบมาด้วย
 */
export function buildMasterPromptFor(
  tool: ImageTool,
  c: PromptCharacter,
  blueprint?: MasterPromptBlueprint | null,
  opts: { hasReference?: boolean } = {},
): string {
  const r = resolve(c);
  const mustKeep = buildMustKeep(c, blueprint);

  const rules: string[] = [
    "1. Identity lock — ethnicity, face structure, and distinctive features never change across images.",
    `2. Ethnicity is exactly as specified: ${r.ethnicity}. Do not drift toward East-Asian or European features.`,
    "3. Completeness — every item in the MUST-KEEP list below must appear in the image.",
  ];
  if (opts.hasReference) {
    rules.push(
      "4. A reference image of this exact person is attached — it is ground truth for the face. Change only clothing, pose, and scene.",
    );
  }

  const lines: string[] = [
    "=== DIRECTIVE ===",
    "You are generating a recurring AI talent character for a Thai content studio. Reproduce this exact person consistently.",
    "",
    "HARD RULES:",
    ...rules,
  ];

  // house rules จาก blueprint — คงข้อความเดิมไว้ตรง ๆ (ภาษาไทยได้ ค่ายนอกอ่านรู้เรื่อง)
  const houseRules = blueprint?.houseRules?.trim();
  if (houseRules) {
    lines.push("", "Studio rules:", houseRules);
  }

  // Do's & Don'ts ประจำตัวละคร — prose bullets ใน DIRECTIVE ทุก tool
  // (ห้ามจัดรูปแบบเป็น negative block บน ChatGPT/Gemini — policy-sensitive;
  //  Grok merge donts เข้า Negative prompt line ของ spec เพิ่มด้านล่าง)
  const dos = (c.dos ?? []).map((d) => d.trim()).filter(Boolean);
  const donts = (c.donts ?? []).map((d) => d.trim()).filter(Boolean);
  if (dos.length) {
    lines.push("", "ALWAYS:", ...dos.map((d) => `- ${d}`));
  }
  if (donts.length) {
    lines.push("", "NEVER:", ...donts.map((d) => `- ${d}`));
  }

  // Grok: donts เป็น content rules — ซ้ำเข้า Negative prompt line ให้ด้วย (dedupe)
  const spec =
    tool === "grok" && donts.length
      ? mergeGrokNegatives(buildPromptFor(tool, c), donts)
      : buildPromptFor(tool, c);

  lines.push(
    "",
    "Before generating, restate the MUST-KEEP list in one line.",
    "",
    "=== CHARACTER SPEC ===",
    spec,
    "",
    "=== MUST-KEEP ===",
    ...mustKeep.map((m) => `- ${m}`),
  );

  if (opts.hasReference) {
    lines.push(
      "",
      "A reference image of this exact person is attached — keep the same face and identity; change only what this prompt asks.",
    );
  }

  return lines.join("\n");
}

// เติม donts ต่อท้ายบรรทัด "Negative prompt:" ของ Grok spec (dedupe ทั้งบรรทัด)
function mergeGrokNegatives(spec: string, donts: string[]): string {
  return spec
    .split("\n")
    .map((line) =>
      line.startsWith("Negative prompt:")
        ? `Negative prompt: ${dedupeCsv(
            [line.slice("Negative prompt:".length).trim(), ...donts].filter(Boolean).join(", "),
          )}`
        : line,
    )
    .join("\n");
}

// ═══ Character Sheet builders (Turnaround / Expression / Wardrobe / Pose) ═══
// ทุกตัว = Master Prompt เต็ม (DIRECTIVE + SPEC + MUST-KEEP + กฎรูปแนบ) + บล็อก
// VARIATION ของรายการนั้นต่อท้าย — copy เดียววางค่ายนอกได้เลย (pure function ทั้งหมด)

export type TurnaroundAngle = "front" | "side" | "three_quarter" | "back" | "full_body";

export const TURNAROUND_ANGLES: {
  id: TurnaroundAngle;
  role: string; // linkRole ของรูปที่ gen เสร็จแล้ว (ผูกกับ entityType 'character')
  labelTh: string;
  labelEn: string;
}[] = [
  { id: "front", role: "turnaround_front", labelTh: "หน้าตรง", labelEn: "Front" },
  { id: "side", role: "turnaround_side", labelTh: "ด้านข้าง", labelEn: "Side" },
  { id: "three_quarter", role: "turnaround_three_quarter", labelTh: "มุม ¾", labelEn: "¾ view" },
  { id: "back", role: "turnaround_back", labelTh: "ด้านหลัง", labelEn: "Back" },
  { id: "full_body", role: "turnaround_full_body", labelTh: "เต็มตัว", labelEn: "Full body" },
];

// wording กล้องต่อมุม — "the exact same person" + ฉาก studio กลาง ๆ ให้ชุดภาพนิ่ง
function turnaroundAngleText(angle: TurnaroundAngle, hasReference: boolean): string {
  const same = hasReference
    ? "the exact same person as the attached reference image"
    : "the exact same person as specified above";
  switch (angle) {
    case "front":
      return `Turnaround reference — FRONT view: ${same}, facing the camera straight on, neutral expression, same outfit, plain light-grey studio background, full head-and-shoulders framing.`;
    case "side":
      return `Turnaround reference — SIDE view: ${same}, head and body turned exactly 90 degrees to the left in true profile, neutral expression, same outfit and hairstyle, plain light-grey studio background, head-and-shoulders framing.`;
    case "three_quarter":
      return `Turnaround reference — THREE-QUARTER view: ${same}, face and body turned 45 degrees from the camera (classic 3/4 angle, both eyes visible), neutral expression, same outfit, plain light-grey studio background, head-and-shoulders framing.`;
    case "back":
      return `Turnaround reference — BACK view: ${same}, seen from directly behind, hairstyle fully visible from the back, same outfit, plain light-grey studio background, head-and-shoulders framing from behind.`;
    case "full_body":
      return `Turnaround reference — FULL BODY view: ${same}, standing full-body, head to feet fully visible in frame, neutral standing pose with arms relaxed at the sides, same outfit, plain light-grey studio background.`;
  }
}

/** Prompt ต่อมุมของ Turnaround Sheet — Master Prompt + บล็อก ANGLE */
export function buildTurnaroundPrompt(
  tool: ImageTool,
  c: PromptCharacter,
  blueprint: MasterPromptBlueprint | null | undefined,
  angle: TurnaroundAngle,
  opts: { hasReference?: boolean } = {},
): string {
  return [
    buildMasterPromptFor(tool, c, blueprint, opts),
    "",
    "=== ANGLE ===",
    turnaroundAngleText(angle, !!opts.hasReference),
  ].join("\n");
}

// รูปเดียวรวมทุกมุม (แนวนอน) — gen ครั้งเดียวได้ครบ เร็วกว่าแยก 5 รูป (CEO directive)
export const TURNAROUND_SHEET_ROLE = "turnaround_sheet";

/** Prompt แผ่น Turnaround รวมทุกมุมในภาพแนวนอนภาพเดียว — Master Prompt + บล็อก SHEET */
export function buildTurnaroundSheetPrompt(
  tool: ImageTool,
  c: PromptCharacter,
  blueprint: MasterPromptBlueprint | null | undefined,
  opts: { hasReference?: boolean } = {},
): string {
  const same = opts.hasReference
    ? "the exact same person as the attached reference image"
    : "the exact same person as specified above";
  const sheet = [
    "=== TURNAROUND SHEET (ONE image, all views) ===",
    `Character turnaround reference sheet — ONE single WIDE LANDSCAPE image (16:9) showing ${same} FIVE times, standing side by side in a single row on the same baseline:`,
    "1) FRONT view — facing the camera straight on",
    "2) THREE-QUARTER view — turned 45 degrees, both eyes visible",
    "3) SIDE view — true 90-degree profile",
    "4) BACK view — seen from directly behind, hairstyle fully visible",
    "5) FRONT full-body — neutral standing pose, arms relaxed at the sides",
    "All five figures: identical face and identity, same outfit, same hairstyle, same lighting, full body head-to-feet visible, evenly spaced against a plain light-grey studio background. Consistent identity across every view.",
    "IMPORTANT: this sheet overrides any aspect ratio or framing in the spec above — output ONE wide landscape 16:9 image containing all five views." +
      (tool === "grok" ? " Use --ar 16:9." : ""),
  ].join("\n");
  return [buildMasterPromptFor(tool, c, blueprint, opts), "", sheet].join("\n");
}

export interface SheetItem {
  name: string;
  description?: string | null;
}

function itemPhrase(item: SheetItem): string {
  const desc = item.description?.trim();
  return desc ? `${item.name.trim()} — ${desc}` : item.name.trim();
}

/** Prompt รูปมาตรฐานต่อสีหน้า (Expression) — เปลี่ยนเฉพาะสีหน้า อย่างอื่นล็อกหมด */
export function buildExpressionPrompt(
  tool: ImageTool,
  c: PromptCharacter,
  blueprint: MasterPromptBlueprint | null | undefined,
  item: SheetItem,
  opts: { hasReference?: boolean } = {},
): string {
  return [
    buildMasterPromptFor(tool, c, blueprint, opts),
    "",
    "=== VARIATION — EXPRESSION ===",
    `Same person as the reference. Expression: ${itemPhrase(item)}. Keep identity, outfit and lighting unchanged; only the facial expression changes.`,
  ].join("\n");
}

/** Prompt รูปมาตรฐานต่อชุด (Wardrobe) — เปลี่ยนเฉพาะชุด หน้าเดิม เต็มตัว */
export function buildWardrobePrompt(
  tool: ImageTool,
  c: PromptCharacter,
  blueprint: MasterPromptBlueprint | null | undefined,
  item: SheetItem,
  opts: { hasReference?: boolean } = {},
): string {
  return [
    buildMasterPromptFor(tool, c, blueprint, opts),
    "",
    "=== VARIATION — OUTFIT ===",
    `Same person as the reference, wearing ${itemPhrase(item)}. Full-body framing, same face and identity.`,
  ].join("\n");
}

/** Prompt รูปมาตรฐานต่อท่าโพส (Pose) — เปลี่ยนเฉพาะท่า หน้า/ชุดเดิม เต็มตัว */
export function buildPosePrompt(
  tool: ImageTool,
  c: PromptCharacter,
  blueprint: MasterPromptBlueprint | null | undefined,
  item: SheetItem,
  opts: { hasReference?: boolean } = {},
): string {
  return [
    buildMasterPromptFor(tool, c, blueprint, opts),
    "",
    "=== VARIATION — POSE ===",
    `Same person as the reference. Pose: ${itemPhrase(item)}. Keep identity and outfit; full-body framing.`,
  ].join("\n");
}
