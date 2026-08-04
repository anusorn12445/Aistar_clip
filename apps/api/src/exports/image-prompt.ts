// Image-prompt builders (API-side port ของ apps/web/src/app/characters/[id]/imagePrompt.ts)
// ใช้โดย Export Package (Prompt Appendix ใน character sheet markdown) — ต้อง sync มือกับฝั่ง web
// ทั้งหมดเป็น pure function: ไม่มี Nest/Prisma dependency, ไม่เรียก AI
//
// policy ต่อ tool (เหมือน web เป๊ะ):
//  - ChatGPT/Gemini: prose ล้วน ไม่มี "Negative prompt:" block, ไม่มีข้อความ avoid real people/celebrity
//  - Grok: มี Negative prompt line + Params (--ar) — donts ของตัวละคร merge เข้า negative ด้วย
//  - Do's & Don'ts: ALWAYS/NEVER bullets ใน DIRECTIVE ทุก tool (prose ปลอดภัย)

export type ImageTool = 'chatgpt' | 'gemini' | 'grok';

type Json = Record<string, unknown>;

export interface PromptCharacter {
  nameTh?: string | null;
  nameEn?: string | null;
  age?: number | null;
  gender?: string | null;
  region?: string | null;
  visualDna?: Json | null;
  dos?: string[] | null;
  donts?: string[] | null;
}

export const DEFAULT_ETHNICITY = 'Thai, Southeast Asian features';
const DEFAULT_SHOT = 'portrait';
const DEFAULT_ART_STYLE = 'photorealistic';
const DEFAULT_ASPECT = '3:4';

function str(v: unknown): string {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean).join(', ');
  return String(v).trim();
}

function arr(v: unknown): string[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  const s = String(v).trim();
  return s ? [s] : [];
}

interface Resolved {
  ethnicity: string;
  subject: string;
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
}

function resolve(c: PromptCharacter): Resolved {
  const v = (c.visualDna ?? {}) as Json;
  const ethnicity = str(v.ethnicity) || DEFAULT_ETHNICITY;

  const genderMap: Record<string, string> = { หญิง: 'woman', ชาย: 'man' };
  const gender = c.gender ? (genderMap[c.gender] ?? c.gender) : 'person';
  const agePart = c.age != null ? `${c.age}-year-old ` : '';
  const subject = `a ${agePart}${ethnicity} ${gender}`.replace(/\s+/g, ' ').trim();

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
  };
}

function aspectProse(aspect: string): string {
  if (/^\s*\d+\s*:\s*\d+\s*$/.test(aspect)) {
    const [w, h] = aspect.split(':').map((x) => Number(x.trim()));
    const orient = h > w ? 'vertical' : w > h ? 'horizontal' : 'square';
    return `${orient} ${aspect} portrait framing`;
  }
  return aspect;
}

function buildChatGpt(c: PromptCharacter): string {
  const r = resolve(c);
  const parts: string[] = [];
  parts.push(`A ${r.artStyle} ${r.shotType} of ${r.subject}`);
  if (r.skin) parts.push(`with ${r.skin} skin`);
  if (r.face.length) parts.push(r.face.join(', '));
  if (r.distinctive.length) parts.push(`distinctive features: ${r.distinctive.join(', ')}`);
  if (r.body.length) parts.push(r.body.join(', '));
  if (r.style.length) parts.push(r.style.join(', '));
  if (r.camera.length) parts.push(r.camera.join(', '));
  if (r.scene.length) parts.push(r.scene.join(', '));
  parts.push(aspectProse(r.aspect));
  if (r.quality.length) parts.push(r.quality.join(', '));
  return parts.filter(Boolean).join(', ').replace(/,\s*,/g, ',').trim() + '.';
}

function buildGemini(c: PromptCharacter): string {
  const r = resolve(c);
  const lines: string[] = [];
  lines.push(`${cap(r.artStyle)} ${r.shotType} of ${r.subject}.`);
  const appearance = [
    r.skin && `${r.skin} skin`,
    ...r.face,
    r.distinctive.length ? `distinctive features: ${r.distinctive.join(', ')}` : '',
  ].filter(Boolean);
  if (appearance.length) lines.push(`Appearance: ${appearance.join(', ')}.`);
  const styling = [...r.style, ...r.body].filter(Boolean);
  if (styling.length) lines.push(`Styling: ${styling.join(', ')}.`);
  const photo = [...r.camera, ...r.scene].filter(Boolean);
  if (photo.length) lines.push(`Photography: ${photo.join(', ')}.`);
  const framing = [aspectProse(r.aspect), ...r.quality].filter(Boolean);
  lines.push(`Framing & quality: ${framing.join(', ')}.`);
  return lines.join('\n');
}

function buildGrok(c: PromptCharacter): string {
  const r = resolve(c);
  const desc: string[] = [];
  desc.push(`${cap(r.artStyle)} ${r.shotType} of ${r.subject}`);
  if (r.skin) desc.push(`${r.skin} skin`);
  desc.push(...r.face);
  if (r.distinctive.length) desc.push(`distinctive: ${r.distinctive.join(', ')}`);
  desc.push(...r.style, ...r.body, ...r.camera, ...r.scene);
  if (r.quality.length) desc.push(...r.quality);

  const lines: string[] = [desc.filter(Boolean).join(', ') + '.'];

  const negDefaults = [
    'deformed',
    'extra fingers',
    'bad anatomy',
    'blurry',
    'low quality',
    'watermark',
    'text',
  ];
  const negParts = [r.negativePrompt, ...negDefaults].filter(Boolean);
  lines.push('');
  lines.push(`Negative prompt: ${dedupeCsv(negParts.join(', '))}`);

  const aspectFlag = /^\s*\d+\s*:\s*\d+\s*$/.test(r.aspect)
    ? r.aspect.replace(/\s+/g, '')
    : DEFAULT_ASPECT;
  lines.push(`Params: --ar ${aspectFlag}`);
  return lines.join('\n');
}

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function dedupeCsv(s: string): string {
  const seen = new Set<string>();
  return s
    .split(',')
    .map((x) => x.trim())
    .filter((x) => {
      if (!x) return false;
      const k = x.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .join(', ');
}

export function buildPromptFor(tool: ImageTool, c: PromptCharacter): string {
  switch (tool) {
    case 'gemini':
      return buildGemini(c);
    case 'grok':
      return buildGrok(c);
    case 'chatgpt':
    default:
      return buildChatGpt(c);
  }
}

// ═══ Master Prompt ═══════════════════════════════════════════

export interface MasterPromptBlueprint {
  name?: string | null;
  houseRules?: string | null;
  requiredFields?: string[] | null;
}

export function buildMustKeep(
  c: PromptCharacter,
  blueprint?: MasterPromptBlueprint | null,
): string[] {
  const r = resolve(c);
  const v = (c.visualDna ?? {}) as Json;
  const items: string[] = [`ethnicity: ${r.ethnicity}`];
  if (r.distinctive.length) items.push(`distinctive features: ${r.distinctive.join(', ')}`);
  if (r.hair) items.push(`hair: ${r.hair}`);
  if (r.skin) items.push(`skin tone: ${r.skin}`);
  const covered = new Set(['ethnicity', 'distinctive_features', 'hair_style', 'skin_tone']);
  for (const key of blueprint?.requiredFields ?? []) {
    if (covered.has(key)) continue;
    covered.add(key);
    const val = str(v[key]);
    if (val) items.push(`${key.replace(/_/g, ' ')}: ${val}`);
  }
  return items;
}

export function buildMasterPromptFor(
  tool: ImageTool,
  c: PromptCharacter,
  blueprint?: MasterPromptBlueprint | null,
  opts: { hasReference?: boolean } = {},
): string {
  const r = resolve(c);
  const mustKeep = buildMustKeep(c, blueprint);

  const rules: string[] = [
    '1. Identity lock — ethnicity, face structure, and distinctive features never change across images.',
    `2. Ethnicity is exactly as specified: ${r.ethnicity}. Do not drift toward East-Asian or European features.`,
    '3. Completeness — every item in the MUST-KEEP list below must appear in the image.',
  ];
  if (opts.hasReference) {
    rules.push(
      '4. A reference image of this exact person is attached — it is ground truth for the face. Change only clothing, pose, and scene.',
    );
  }

  const lines: string[] = [
    '=== DIRECTIVE ===',
    'You are generating a recurring AI talent character for a Thai content studio. Reproduce this exact person consistently.',
    '',
    'HARD RULES:',
    ...rules,
  ];

  const houseRules = blueprint?.houseRules?.trim();
  if (houseRules) {
    lines.push('', 'Studio rules:', houseRules);
  }

  // Do's & Don'ts — ALWAYS/NEVER bullets (prose) ทุก tool; Grok merge donts เข้า negative ด้วย
  const dos = (c.dos ?? []).map((d) => d.trim()).filter(Boolean);
  const donts = (c.donts ?? []).map((d) => d.trim()).filter(Boolean);
  if (dos.length) {
    lines.push('', 'ALWAYS:', ...dos.map((d) => `- ${d}`));
  }
  if (donts.length) {
    lines.push('', 'NEVER:', ...donts.map((d) => `- ${d}`));
  }

  const spec =
    tool === 'grok' && donts.length
      ? mergeGrokNegatives(buildPromptFor(tool, c), donts)
      : buildPromptFor(tool, c);

  lines.push(
    '',
    'Before generating, restate the MUST-KEEP list in one line.',
    '',
    '=== CHARACTER SPEC ===',
    spec,
    '',
    '=== MUST-KEEP ===',
    ...mustKeep.map((m) => `- ${m}`),
  );

  if (opts.hasReference) {
    lines.push(
      '',
      'A reference image of this exact person is attached — keep the same face and identity; change only what this prompt asks.',
    );
  }

  return lines.join('\n');
}

/** Identity block สำหรับวางในพรอมป์ภาพโดยตรง (Flow/Veo/Imagen/Grok)
 *  — คำบรรยายล้วน ไม่มีหัวข้อ/กติกาแบบแชต (DIRECTIVE/HARD RULES/MUST-KEEP อ่านไม่ได้ในโมเดลภาพ
 *  และภาษา identity-lock แรง ๆ เสี่ยงโดน people-filter ของ Flow) */
export function buildImageIdentityBlock(
  c: PromptCharacter,
  blueprint?: MasterPromptBlueprint | null,
  opts: { hasReference?: boolean } = {},
): string {
  const spec = buildChatGpt(c); // ประโยคบรรยาย prose (aspect ในนี้จะถูก scrub ที่ชั้น compose)
  const mustKeep = buildMustKeep(c, blueprint);
  const dos = (c.dos ?? []).map((d) => d.trim()).filter(Boolean);
  const donts = (c.donts ?? []).map((d) => d.trim()).filter(Boolean);
  const lines = [
    spec,
    mustKeep.length ? `Keep these exact features consistent: ${mustKeep.join('; ')}.` : '',
    dos.length ? `Always: ${dos.join('; ')}.` : '',
    donts.length ? `Never: ${donts.join('; ')}.` : '',
    opts.hasReference
      ? 'The attached reference image shows this exact person — keep the same face and identity; change only clothing, pose and scene.'
      : '',
  ];
  return lines.filter(Boolean).join('\n');
}

function mergeGrokNegatives(spec: string, donts: string[]): string {
  return spec
    .split('\n')
    .map((line) =>
      line.startsWith('Negative prompt:')
        ? `Negative prompt: ${dedupeCsv(
            [line.slice('Negative prompt:'.length).trim(), ...donts].filter(Boolean).join(', '),
          )}`
        : line,
    )
    .join('\n');
}

// ═══ Character Sheet builders (Turnaround / Expression / Wardrobe / Pose) ═══

export type TurnaroundAngle = 'front' | 'side' | 'three_quarter' | 'back' | 'full_body';

export const TURNAROUND_ANGLES: {
  id: TurnaroundAngle;
  role: string;
  labelTh: string;
  labelEn: string;
}[] = [
  { id: 'front', role: 'turnaround_front', labelTh: 'หน้าตรง', labelEn: 'Front' },
  { id: 'side', role: 'turnaround_side', labelTh: 'ด้านข้าง', labelEn: 'Side' },
  { id: 'three_quarter', role: 'turnaround_three_quarter', labelTh: 'มุม ¾', labelEn: '¾ view' },
  { id: 'back', role: 'turnaround_back', labelTh: 'ด้านหลัง', labelEn: 'Back' },
  { id: 'full_body', role: 'turnaround_full_body', labelTh: 'เต็มตัว', labelEn: 'Full body' },
];

function turnaroundAngleText(angle: TurnaroundAngle, hasReference: boolean): string {
  const same = hasReference
    ? 'the exact same person as the attached reference image'
    : 'the exact same person as specified above';
  switch (angle) {
    case 'front':
      return `Turnaround reference — FRONT view: ${same}, facing the camera straight on, neutral expression, same outfit, plain light-grey studio background, full head-and-shoulders framing.`;
    case 'side':
      return `Turnaround reference — SIDE view: ${same}, head and body turned exactly 90 degrees to the left in true profile, neutral expression, same outfit and hairstyle, plain light-grey studio background, head-and-shoulders framing.`;
    case 'three_quarter':
      return `Turnaround reference — THREE-QUARTER view: ${same}, face and body turned 45 degrees from the camera (classic 3/4 angle, both eyes visible), neutral expression, same outfit, plain light-grey studio background, head-and-shoulders framing.`;
    case 'back':
      return `Turnaround reference — BACK view: ${same}, seen from directly behind, hairstyle fully visible from the back, same outfit, plain light-grey studio background, head-and-shoulders framing from behind.`;
    case 'full_body':
      return `Turnaround reference — FULL BODY view: ${same}, standing full-body, head to feet fully visible in frame, neutral standing pose with arms relaxed at the sides, same outfit, plain light-grey studio background.`;
  }
}

export function buildTurnaroundPrompt(
  tool: ImageTool,
  c: PromptCharacter,
  blueprint: MasterPromptBlueprint | null | undefined,
  angle: TurnaroundAngle,
  opts: { hasReference?: boolean } = {},
): string {
  return [
    buildMasterPromptFor(tool, c, blueprint, opts),
    '',
    '=== ANGLE ===',
    turnaroundAngleText(angle, !!opts.hasReference),
  ].join('\n');
}

// รูปเดียวรวมทุกมุม (แนวนอน) — sync กับ web imagePrompt.ts (CEO directive: gen ครั้งเดียวได้ครบ)
export const TURNAROUND_SHEET_ROLE = 'turnaround_sheet';

export function buildTurnaroundSheetPrompt(
  tool: ImageTool,
  c: PromptCharacter,
  blueprint: MasterPromptBlueprint | null | undefined,
  opts: { hasReference?: boolean } = {},
): string {
  const same = opts.hasReference
    ? 'the exact same person as the attached reference image'
    : 'the exact same person as specified above';
  const sheet = [
    '=== TURNAROUND SHEET (ONE image, all views) ===',
    `Character turnaround reference sheet — ONE single WIDE LANDSCAPE image (16:9) showing ${same} FIVE times, standing side by side in a single row on the same baseline:`,
    '1) FRONT view — facing the camera straight on',
    '2) THREE-QUARTER view — turned 45 degrees, both eyes visible',
    '3) SIDE view — true 90-degree profile',
    '4) BACK view — seen from directly behind, hairstyle fully visible',
    '5) FRONT full-body — neutral standing pose, arms relaxed at the sides',
    'All five figures: identical face and identity, same outfit, same hairstyle, same lighting, full body head-to-feet visible, evenly spaced against a plain light-grey studio background. Consistent identity across every view.',
    'IMPORTANT: this sheet overrides any aspect ratio or framing in the spec above — output ONE wide landscape 16:9 image containing all five views.' +
      (tool === 'grok' ? ' Use --ar 16:9.' : ''),
  ].join('\n');
  return [buildMasterPromptFor(tool, c, blueprint, opts), '', sheet].join('\n');
}

export interface SheetItem {
  name: string;
  description?: string | null;
}

function itemPhrase(item: SheetItem): string {
  const desc = item.description?.trim();
  return desc ? `${item.name.trim()} — ${desc}` : item.name.trim();
}

export function buildExpressionPrompt(
  tool: ImageTool,
  c: PromptCharacter,
  blueprint: MasterPromptBlueprint | null | undefined,
  item: SheetItem,
  opts: { hasReference?: boolean } = {},
): string {
  return [
    buildMasterPromptFor(tool, c, blueprint, opts),
    '',
    '=== VARIATION — EXPRESSION ===',
    `Same person as the reference. Expression: ${itemPhrase(item)}. Keep identity, outfit and lighting unchanged; only the facial expression changes.`,
  ].join('\n');
}

export function buildWardrobePrompt(
  tool: ImageTool,
  c: PromptCharacter,
  blueprint: MasterPromptBlueprint | null | undefined,
  item: SheetItem,
  opts: { hasReference?: boolean } = {},
): string {
  return [
    buildMasterPromptFor(tool, c, blueprint, opts),
    '',
    '=== VARIATION — OUTFIT ===',
    `Same person as the reference, wearing ${itemPhrase(item)}. Full-body framing, same face and identity.`,
  ].join('\n');
}

export function buildPosePrompt(
  tool: ImageTool,
  c: PromptCharacter,
  blueprint: MasterPromptBlueprint | null | undefined,
  item: SheetItem,
  opts: { hasReference?: boolean } = {},
): string {
  return [
    buildMasterPromptFor(tool, c, blueprint, opts),
    '',
    '=== VARIATION — POSE ===',
    `Same person as the reference. Pose: ${itemPhrase(item)}. Keep identity and outfit; full-body framing.`,
  ].join('\n');
}
