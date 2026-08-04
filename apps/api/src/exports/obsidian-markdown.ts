import {
  Campaign,
  Character,
  Episode,
  Location,
  Product,
  Series,
  Shot,
} from '@prisma/client';
import { renderJsonSection } from './character-markdown';

// ─── Markdown generators สำหรับ Obsidian Vault Export (PRD v0.1 §26) ───
// pure functions — ไม่มี Nest/Prisma dependency นอกจาก type

const NO_DATA = '_ยังไม่มีข้อมูล_';

// ชื่อไฟล์/wikilink ต้องไม่มีอักขระต้องห้ามของ filesystem และ Obsidian link syntax
export function sanitizeFileBase(name: string): string {
  return name
    .replace(/[\\/:*?"<>|#^[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
    .trim();
}

export function wikilink(fileBase: string): string {
  return `[[${fileBase}]]`;
}

function yamlValue(value: unknown): string {
  if (value === null || value === undefined) return '""';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `[${value.map((v) => yamlValue(v)).join(', ')}]`;
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ')}"`;
}

function frontmatter(data: Record<string, unknown>): string {
  const lines = ['---'];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    lines.push(`${key}: ${yamlValue(value)}`);
  }
  lines.push('---');
  return lines.join('\n');
}

function escapeCell(value: string | null | undefined): string {
  if (!value) return '-';
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function linkList(links: string[]): string {
  if (links.length === 0) return NO_DATA;
  return links.map((l) => `- ${wikilink(l)}`).join('\n');
}

// ─── 01_Characters ───────────────────────────────────────────

// Character Sheet extras (optional — export เก่า/ตัวละครไม่มีข้อมูลใหม่ ก็ยัง render ได้)
export interface CharacterVaultSheet {
  wardrobes: { name: string; occasion?: string | null; description: string | null }[];
  expressions: { name: string; description: string | null }[];
  poses: { name: string; description: string | null }[];
}

function sheetItemList(
  items: { name: string; occasion?: string | null; description: string | null }[],
): string {
  if (items.length === 0) return NO_DATA;
  return items
    .map((i) => {
      const extra = [i.occasion, i.description].filter(Boolean).join(' · ');
      return `- **${i.name}**${extra ? ` — ${extra}` : ''}`;
    })
    .join('\n');
}

function dosDontsList(items: string[], icon: string): string {
  const clean = items.map((x) => x.trim()).filter(Boolean);
  return clean.length === 0 ? NO_DATA : clean.map((x) => `- ${icon} ${x}`).join('\n');
}

export function renderCharacterVaultNote(
  character: Character,
  links: { episodes: string[]; campaigns: string[] },
  sheet?: CharacterVaultSheet,
): string {
  const tags = ['character', ...(character.universe ? [sanitizeFileBase(character.universe).replace(/\s+/g, '_')] : [])];
  return [
    frontmatter({
      type: 'character',
      code: character.displayCode,
      name_th: character.nameTh,
      name_en: character.nameEn ?? undefined,
      universe: character.universe ?? undefined,
      series: character.series ?? undefined,
      role: character.roleLabel ?? undefined,
      status: character.status,
      version: character.version,
      tags,
    }),
    '',
    `# ${character.displayCode} — ${character.nameTh}${character.nameEn ? ` (${character.nameEn})` : ''}`,
    '',
    '## Basic Profile',
    `- **อายุ:** ${character.age ?? '-'}`,
    `- **เพศ:** ${character.gender ?? '-'}`,
    `- **ภูมิภาค:** ${character.region ?? '-'}`,
    `- **บทบาท:** ${character.roleLabel ?? '-'}`,
    '',
    '## Persona',
    renderJsonSection(character.persona),
    '',
    '## Visual DNA',
    renderJsonSection(character.visualDna),
    '',
    '## Commerce Profile',
    renderJsonSection(character.commerceProfile),
    '',
    '## Voice Profile',
    renderJsonSection(character.voiceProfile),
    '',
    // Character Sheet (dos/donts อยู่บน Character เอง — sheet extras มาจาก service)
    "## Do's & Don'ts",
    "**Do's:**",
    dosDontsList(character.dos ?? [], '✅'),
    '',
    "**Don'ts:**",
    dosDontsList(character.donts ?? [], '⛔'),
    '',
    '## Wardrobe',
    sheetItemList(sheet?.wardrobes ?? []),
    '',
    '## Expressions',
    sheetItemList(sheet?.expressions ?? []),
    '',
    '## Poses',
    sheetItemList(sheet?.poses ?? []),
    '',
    '## Episodes',
    linkList(links.episodes),
    '',
    '## Campaigns',
    linkList(links.campaigns),
    '',
  ].join('\n');
}

// ─── 02_Series ───────────────────────────────────────────────

export function renderSeriesVaultNote(series: Series, episodeLinks: string[]): string {
  return [
    frontmatter({
      type: 'series',
      name: series.name,
      universe: series.universe ?? undefined,
      status: series.status,
      tags: ['series'],
    }),
    '',
    `# ${series.name}`,
    '',
    series.description ?? NO_DATA,
    '',
    '## Episodes',
    linkList(episodeLinks),
    '',
  ].join('\n');
}

// ─── 03_Episodes ─────────────────────────────────────────────

export type ShotWithCharacterNames = Shot & { characterNames: string[] };

export function renderEpisodeVaultNote(
  episode: Episode & { series: Series | null; location: Location | null },
  opts: {
    shots: ShotWithCharacterNames[];
    characterLinks: string[];
    productLinks: string[];
    campaignLink?: string;
    seriesLink?: string;
  },
): string {
  const shotTable =
    opts.shots.length === 0
      ? NO_DATA
      : [
          '| # | วินาที | Camera | Action | Dialogue | Emotion | ตัวละคร | Status |',
          '|---|---|---|---|---|---|---|---|',
          ...opts.shots.map(
            (s) =>
              `| ${s.shotNumber} | ${s.durationSec ?? '-'} | ${escapeCell(s.camera)} | ${escapeCell(s.action)} | ${escapeCell(s.dialogue)} | ${escapeCell(s.emotion)} | ${escapeCell(s.characterNames.join(', ') || '-')} | ${s.status} |`,
          ),
        ].join('\n');

  return [
    frontmatter({
      type: 'episode',
      code: episode.displayCode,
      title: episode.title,
      season: episode.season ?? undefined,
      episode_number: episode.episodeNumber ?? undefined,
      status: episode.status,
      tags: ['episode'],
    }),
    '',
    `# ${episode.displayCode} — ${episode.title}`,
    '',
    ...(episode.logline ? [`> ${episode.logline}`, ''] : []),
    ...(opts.seriesLink ? [`**Series:** ${wikilink(opts.seriesLink)}`] : []),
    ...(opts.campaignLink ? [`**Campaign:** ${wikilink(opts.campaignLink)}`] : []),
    ...(episode.location ? [`**Location:** ${episode.location.name}`] : []),
    '',
    '## Script Structure',
    `- **Hook (0-3s):** ${episode.hook ?? '-'}`,
    `- **Conflict:** ${episode.conflict ?? '-'}`,
    `- **Twist:** ${episode.twist ?? '-'}`,
    `- **CTA:** ${episode.cta ?? '-'}`,
    '',
    '## Script',
    episode.script?.trim() ? episode.script : NO_DATA,
    '',
    '## Shot List',
    shotTable,
    '',
    '## Characters',
    linkList(opts.characterLinks),
    '',
    '## Products',
    linkList(opts.productLinks),
    '',
  ].join('\n');
}

// ─── 14_Campaigns ────────────────────────────────────────────

export function renderCampaignVaultNote(
  campaign: Campaign,
  links: { characters: string[]; products: string[]; episodes: string[] },
): string {
  return [
    frontmatter({
      type: 'campaign',
      code: campaign.displayCode,
      name: campaign.name,
      client_brand: campaign.clientBrand ?? undefined,
      objective: campaign.objective ?? undefined,
      status: campaign.status,
      start_date: campaign.startDate?.toISOString().slice(0, 10),
      end_date: campaign.endDate?.toISOString().slice(0, 10),
      tags: ['campaign'],
    }),
    '',
    `# ${campaign.displayCode} — ${campaign.name}`,
    '',
    `- **Objective:** ${campaign.objective ?? '-'}`,
    `- **ประเภท:** ${campaign.campaignType ?? '-'}`,
    `- **ช่วงเวลา:** ${campaign.startDate?.toISOString().slice(0, 10) ?? '-'} → ${campaign.endDate?.toISOString().slice(0, 10) ?? '-'}`,
    '',
    '## Target KPI',
    renderJsonSection(campaign.targetKpi),
    '',
    '## Characters',
    linkList(links.characters),
    '',
    '## Products',
    linkList(links.products),
    '',
    '## Episodes',
    linkList(links.episodes),
    '',
  ].join('\n');
}

// ─── 07_Products ─────────────────────────────────────────────

export function renderProductVaultNote(product: Product & { brand: { name: string } | null }): string {
  return [
    frontmatter({
      type: 'product',
      code: product.displayCode,
      name: product.name,
      brand: product.brand?.name ?? undefined,
      category: product.category ?? undefined,
      claim_risk_level: product.claimRiskLevel,
      status: product.status,
      tags: ['product'],
    }),
    '',
    `# ${product.displayCode} — ${product.name}`,
    '',
    product.description ?? NO_DATA,
    '',
    `- **แบรนด์:** ${product.brand?.name ?? '-'}`,
    `- **หมวด:** ${product.category ?? '-'}`,
    `- **ราคา:** ${product.price ?? '-'}${product.salePrice ? ` (ลดเหลือ ${product.salePrice})` : ''}`,
    `- **Claim risk:** ${product.claimRiskLevel}`,
    '',
    '## Restricted Claims (ห้ามใช้ในคอนเทนต์)',
    product.restrictedClaims.length ? product.restrictedClaims.map((c) => `- ⛔ ${c}`).join('\n') : NO_DATA,
    '',
    '## Platform Links',
    renderJsonSection(product.platformLinks),
    '',
  ].join('\n');
}

// ─── 10_Performance ──────────────────────────────────────────

export interface PlatformAggregate {
  platform: string;
  records: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  orders: number;
  gmv: number;
}

export function renderPerformanceSummary(rows: PlatformAggregate[], generatedAt: Date): string {
  const table =
    rows.length === 0
      ? NO_DATA
      : [
          '| Platform | Records | Views | Likes | Comments | Shares | Orders | GMV |',
          '|---|---|---|---|---|---|---|---|',
          ...rows.map(
            (r) =>
              `| ${r.platform} | ${r.records} | ${r.views.toLocaleString()} | ${r.likes.toLocaleString()} | ${r.comments.toLocaleString()} | ${r.shares.toLocaleString()} | ${r.orders.toLocaleString()} | ${r.gmv.toLocaleString()} |`,
          ),
        ].join('\n');

  return [
    frontmatter({
      type: 'performance_summary',
      period: 'last_30_days',
      generated_at: generatedAt.toISOString(),
      tags: ['performance'],
    }),
    '',
    '# Performance Summary — 30 วันล่าสุด',
    '',
    table,
    '',
  ].join('\n');
}
