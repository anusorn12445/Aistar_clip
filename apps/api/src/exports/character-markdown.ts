import { Asset, AssetLink, Character, Prompt, PromptVersion } from '@prisma/client';
import {
  MasterPromptBlueprint,
  PromptCharacter,
  buildExpressionPrompt,
  buildMasterPromptFor,
  buildPosePrompt,
  buildTurnaroundSheetPrompt,
  buildWardrobePrompt,
} from './image-prompt';

// แปลง Character (Prisma) → PromptCharacter ของ builder (visualDna เป็น JsonValue → object)
function toPromptCharacter(character: Character): PromptCharacter {
  return {
    nameTh: character.nameTh,
    nameEn: character.nameEn,
    age: character.age,
    gender: character.gender,
    region: character.region,
    visualDna: character.visualDna as Record<string, unknown> | null,
    dos: character.dos,
    donts: character.donts,
  };
}

// ─── Markdown generator สำหรับ Export Package (PRD §8.3) ────
// pure functions — ไม่มี Nest/Prisma dependency นอกจาก type

const NO_DATA = '_ยังไม่มีข้อมูล_';

export type PromptLinkWithVersion = {
  promptVersion: PromptVersion & { prompt: Prompt };
};

export type AssetLinkWithAsset = AssetLink & { asset: Asset };

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  if (Array.isArray(value)) {
    if (value.length === 0) return '-';
    return value
      .map((v) => (v !== null && typeof v === 'object' ? JSON.stringify(v) : String(v)))
      .join(', ');
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// render Json section เป็น bullet list "**key:** value" — nested object ลึก 1 ชั้น
export function renderJsonSection(data: unknown): string {
  if (data === null || data === undefined) return NO_DATA;
  if (Array.isArray(data)) {
    if (data.length === 0) return NO_DATA;
    return data.map((item) => `- ${formatValue(item)}`).join('\n');
  }
  if (typeof data !== 'object') return String(data);

  const entries = Object.entries(data as Record<string, unknown>);
  if (entries.length === 0) return NO_DATA;

  const lines: string[] = [];
  for (const [key, value] of entries) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const nested = Object.entries(value as Record<string, unknown>);
      if (nested.length === 0) {
        lines.push(`- **${key}:** -`);
        continue;
      }
      lines.push(`- **${key}:**`);
      for (const [k, v] of nested) {
        lines.push(`  - **${k}:** ${formatValue(v)}`);
      }
    } else {
      lines.push(`- **${key}:** ${formatValue(value)}`);
    }
  }
  return lines.join('\n');
}

// 01_character_bible/<slug>_character_bible.md
export function renderCharacterBible(character: Character): string {
  const title = character.nameEn
    ? `${character.nameEn}${character.nameTh ? ` — ${character.nameTh}` : ''}`
    : character.nameTh;

  const lines: string[] = [
    `# ${title} (${character.displayCode})`,
    '',
    '| | |',
    '|---|---|',
    `| Status | ${character.status} |`,
    `| Version | ${character.version} |`,
    `| สร้างเมื่อ | ${character.createdAt.toISOString()} |`,
    `| อัปเดตล่าสุด | ${character.updatedAt.toISOString()} |`,
    '',
    '## ข้อมูลพื้นฐาน',
    '',
    `- **ชื่อ (TH):** ${formatValue(character.nameTh)}`,
    `- **ชื่อ (EN):** ${formatValue(character.nameEn)}`,
    `- **Universe:** ${formatValue(character.universe)}`,
    `- **Series:** ${formatValue(character.series)}`,
    `- **Role:** ${formatValue(character.roleLabel)}`,
    `- **อายุ:** ${formatValue(character.age)}`,
    `- **เพศ:** ${formatValue(character.gender)}`,
    `- **ภูมิภาค:** ${formatValue(character.region)}`,
    '',
    '## บุคลิก (Persona)',
    '',
    renderJsonSection(character.persona),
    '',
    '## Visual DNA',
    '',
    renderJsonSection(character.visualDna),
    '',
    '## Commerce Profile',
    '',
    renderJsonSection(character.commerceProfile),
    '',
    '## Voice Profile',
    '',
    renderJsonSection(character.voiceProfile),
    '',
  ];
  return lines.join('\n');
}

// ─── 04_character_sheet/<slug>_character_sheet.md ────────────
// Character Sheet ฉบับเต็ม: Wardrobe/Expression/Pose + Do's & Don'ts + Turnaround status
// + Prompt Appendix (Master Prompt chatgpt variant + prompt ต่อรายการ) — freelance ทำงาน
// จากไฟล์เดียวได้เลย / ตัวละครที่ไม่มีข้อมูลใหม่ export ได้ปกติ (โชว์ "ยังไม่มีข้อมูล")

export interface SheetSectionItem {
  name: string;
  occasion?: string | null;
  description: string | null;
}

export interface CharacterSheetData {
  wardrobes: SheetSectionItem[];
  expressions: SheetSectionItem[];
  poses: SheetSectionItem[];
  /** filename แผ่น turnaround รวมทุกมุม (รูปเดียวแนวนอน) — null = ยังไม่มี */
  turnaroundSheet: string | null;
  /** filename ต่อมุมชุดเก่า (แยก 5 มุม) — โชว์เฉพาะมุมที่มีรูป */
  turnaround: { role: string; labelTh: string; labelEn: string; filename: string | null }[];
  /** มีรูป Reference (prompt_reference) ล็อกหน้าอยู่ไหม — มีผลกับ wording ของ prompt */
  hasReference: boolean;
  blueprint: MasterPromptBlueprint | null;
}

function sheetTable(items: SheetSectionItem[], withOccasion: boolean): string {
  if (items.length === 0) return NO_DATA;
  const head = withOccasion
    ? ['| ชื่อ | โอกาสใช้ | รายละเอียด |', '|---|---|---|']
    : ['| ชื่อ | รายละเอียด |', '|---|---|'];
  const rows = items.map((i) =>
    withOccasion
      ? `| ${escapeCell(i.name)} | ${escapeCell(i.occasion ?? '-')} | ${escapeCell(i.description ?? '-')} |`
      : `| ${escapeCell(i.name)} | ${escapeCell(i.description ?? '-')} |`,
  );
  return [...head, ...rows].join('\n');
}

function bulletList(items: string[]): string {
  const clean = items.map((x) => x.trim()).filter(Boolean);
  return clean.length === 0 ? NO_DATA : clean.map((x) => `- ${x}`).join('\n');
}

function promptBlock(title: string, prompt: string): string[] {
  return [`### ${title}`, '', '```', prompt, '```', ''];
}

export function renderCharacterSheet(character: Character, sheet: CharacterSheetData): string {
  const opts = { hasReference: sheet.hasReference };
  const bp = sheet.blueprint;
  const pc = toPromptCharacter(character);

  const lines: string[] = [
    `# Character Sheet — ${character.nameTh} (${character.displayCode})`,
    '',
    sheet.hasReference
      ? '> มีรูป Reference (prompt_reference) ล็อกหน้าแล้ว — ทุก prompt ในภาคผนวกอ้างรูปแนบ ให้แนบรูปนั้นคู่กับ prompt ทุกครั้งที่ gen'
      : '> ยังไม่ได้ล็อกรูป Reference — prompt ในภาคผนวกใช้สเปกอย่างเดียว (แนะนำให้ล็อกรูปก่อนเพื่อหน้านิ่ง)',
    '',
    "## Do's (ต้องมีเสมอ)",
    '',
    bulletList(character.dos ?? []),
    '',
    "## Don'ts (ข้อห้าม)",
    '',
    bulletList(character.donts ?? []),
    '',
    '## ตู้เสื้อผ้า (Wardrobe)',
    '',
    sheetTable(sheet.wardrobes, true),
    '',
    '## คลังสีหน้า (Expression)',
    '',
    sheetTable(sheet.expressions, false),
    '',
    '## คลังท่าโพส (Pose)',
    '',
    sheetTable(sheet.poses, false),
    '',
    '## Turnaround Sheet (รูปเดียวรวมทุกมุม)',
    '',
    '| รายการ | สถานะ | ไฟล์ |',
    '|---|---|---|',
    `| แผ่นรวมทุกมุม (แนวนอน) | ${sheet.turnaroundSheet ? '✅ มีรูปแล้ว' : '⬜ ยังไม่มีรูป'} | ${escapeCell(sheet.turnaroundSheet ?? '-')} |`,
    ...sheet.turnaround
      .filter((t) => t.filename)
      .map(
        (t) =>
          `| มุมแยกชุดเก่า — ${t.labelTh} (${t.labelEn}) | ✅ มีรูปแล้ว | ${escapeCell(t.filename ?? '-')} |`,
      ),
    '',
    '## Prompt Appendix (ChatGPT variant)',
    '',
    '> ก๊อป prompt ทั้งบล็อก + แนบรูป Reference แล้ววางใน ChatGPT/Grok ได้เลย (ฉบับต่อ tool อยู่ในระบบ)',
    '',
    ...promptBlock('Master Prompt', buildMasterPromptFor('chatgpt', pc, bp, opts)),
  ];

  lines.push(
    ...promptBlock(
      'Turnaround Sheet — แผ่นรวมทุกมุม (แนวนอน)',
      buildTurnaroundSheetPrompt('chatgpt', pc, bp, opts),
    ),
  );
  for (const e of sheet.expressions) {
    lines.push(
      ...promptBlock(`Expression — ${e.name}`, buildExpressionPrompt('chatgpt', pc, bp, e, opts)),
    );
  }
  for (const w of sheet.wardrobes) {
    lines.push(
      ...promptBlock(`Wardrobe — ${w.name}`, buildWardrobePrompt('chatgpt', pc, bp, w, opts)),
    );
  }
  for (const p of sheet.poses) {
    lines.push(...promptBlock(`Pose — ${p.name}`, buildPosePrompt('chatgpt', pc, bp, p, opts)));
  }

  return lines.join('\n');
}

// 02_prompts/<slug>_prompts.md
export function renderPrompts(character: Character, links: PromptLinkWithVersion[]): string {
  const lines: string[] = [`# Prompts — ${character.displayCode}`, ''];

  if (links.length === 0) {
    lines.push('_ยังไม่มี prompt ที่ผูกกับ character นี้_', '');
    return lines.join('\n');
  }

  for (const link of links) {
    const v = link.promptVersion;
    const model = [v.modelName, v.modelVersion].filter(Boolean).join(' ');
    lines.push(
      `## ${v.prompt.name} (${v.versionLabel})`,
      '',
      `- **Type:** ${v.prompt.promptType}`,
      `- **Target platform:** ${v.targetPlatform}`,
      `- **Model:** ${model || '-'}`,
      `- **Status:** ${v.prompt.status}`,
      '',
      '```',
      v.body,
      '```',
      '',
    );
    if (v.negativeBody) {
      lines.push('**Negative prompt:**', '', '```', v.negativeBody, '```', '');
    }
  }
  return lines.join('\n');
}

// 03_reference_assets/assets_manifest.md
export function renderAssetsManifest(character: Character, links: AssetLinkWithAsset[]): string {
  const lines: string[] = [
    `# Reference Assets Manifest — ${character.displayCode}`,
    '',
    '> หมายเหตุ: แพ็กเกจเวอร์ชันนี้รวมเฉพาะรายการ asset (manifest) — ไฟล์ binary ยังไม่ถูกคัดลอกเข้า ZIP',
    '',
  ];

  if (links.length === 0) {
    lines.push('_ยังไม่มี asset ที่ผูกกับ character นี้_', '');
    return lines.join('\n');
  }

  lines.push('| Filename | Type | Link Role | Status |', '|---|---|---|---|');
  for (const link of links) {
    lines.push(
      `| ${escapeCell(link.asset.originalFilename)} | ${escapeCell(link.asset.assetType)} | ${escapeCell(link.linkRole)} | ${escapeCell(link.asset.status)} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}
