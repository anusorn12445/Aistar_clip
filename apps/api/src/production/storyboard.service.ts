import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/current-user.decorator';
import { ScopeService } from '../auth/scope.service';

// ─── Storyboard (Content Intelligence ระบบ 3) ────────────────────────────────
// AI ร่าง "image prompt" ต่อช็อต จาก Visual DNA ตัวละคร + Location + action/มุมกล้อง
// → คนก๊อปไป gen เฟรมใน ChatGPT/Grok เอง แล้วอัปเฟรมกลับผ่าน asset (entityType 'shot')
//
// การประกอบ prompt เป็น **deterministic** ล้วน (ไม่เรียก Claude): ต่อยอด buildImagePrompt
// ฝั่งเว็บที่ประกอบ prompt จาก Visual DNA แบบ pure-string อยู่แล้ว — เพิ่ม Location + ช็อต
// จึงไม่ต้องพึ่ง API key และเทสต์ไม่ต้อง stub Claude

const CAMERA_LABEL: Record<string, string> = {
  close_up: 'Close-up (โคลสอัพ)',
  medium: 'Medium shot (มีเดียม)',
  wide: 'Wide shot (ไวด์)',
  over_shoulder: 'Over-the-shoulder',
  pov: 'POV (มุมมองบุคคล)',
  product_close_up: 'Product close-up (โคลสอัพสินค้า)',
  reaction: 'Reaction shot',
  establishing: 'Establishing shot (ปูสถานที่)',
};

// ลำดับ field ของ Visual DNA ที่หยิบมาบรรยายตัวละครในเฟรม (คงอัตลักษณ์ให้เฟรมต่อเนื่อง)
const DNA_ORDER = [
  'hair_style',
  'face_shape',
  'eyes',
  'eyebrows',
  'nose',
  'lips',
  'skin_tone',
  'body_type',
  'height_impression',
  'posture',
  'makeup_style',
  'fashion_style',
  'distinctive_features',
  'color_palette',
] as const;

type CharacterRow = {
  id: string;
  nameTh: string;
  nameEn: string | null;
  age: number | null;
  gender: string | null;
  region: string | null;
  visualDna: Prisma.JsonValue | null;
};

type LocationRow = {
  id: string;
  name: string;
  mood: string | null;
  lighting: string | null;
  timeOfDay: string | null;
  regionStyle: string | null;
  prompt: string | null;
  negativePrompt: string | null;
} | null;

type ShotForPrompt = {
  shotNumber: number;
  camera: string | null;
  action: string | null;
  dialogue: string | null;
  emotion: string | null;
  outfit: string | null;
};

function asRecord(v: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function dnaValue(val: unknown): string | null {
  if (val == null) return null;
  if (Array.isArray(val)) {
    const parts = val.map((x) => String(x)).filter(Boolean);
    return parts.length ? parts.join(', ') : null;
  }
  const s = String(val).trim();
  return s || null;
}

function characterDescriptor(c: CharacterRow): string {
  const v = asRecord(c.visualDna);
  const name = c.nameEn ? `${c.nameTh} (${c.nameEn})` : c.nameTh;
  const meta = [
    c.age != null ? `อายุ ${c.age} ปี` : null,
    c.gender ?? null,
    c.region ?? null,
  ].filter(Boolean);
  const traits: string[] = [];
  for (const key of DNA_ORDER) {
    const val = dnaValue(v[key]);
    if (val) traits.push(val);
  }
  const head = meta.length ? `${name} — ${meta.join(' · ')}` : name;
  return traits.length ? `${head}; ${traits.join(' · ')}` : head;
}

function locationDescriptor(loc: LocationRow): string | null {
  if (!loc) return null;
  if (loc.prompt && loc.prompt.trim()) return loc.prompt.trim();
  const parts = [loc.name, loc.regionStyle, loc.mood, loc.lighting, loc.timeOfDay].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

/**
 * ประกอบ image prompt ต่อช็อต — deterministic ล้วน
 * รวม: ช็อต (action/มุมกล้อง/อารมณ์/เครื่องแต่งกาย/บทพูด) + ตัวละคร (Visual DNA) + ฉาก (Location)
 * + anti-clone rules และ negative prompt ที่รวบจากตัวละคร/สถานที่
 */
export function buildShotImagePrompt(
  shot: ShotForPrompt,
  characters: CharacterRow[],
  location: LocationRow,
): string {
  const lines: string[] = [
    `สร้างภาพ storyboard frame (photorealistic cinematic, สัดส่วน 16:9) สำหรับช็อต #${shot.shotNumber} — ห้ามอ้างอิงหน้าบุคคลจริงหรือดารา:`,
  ];

  const cam = shot.camera ? (CAMERA_LABEL[shot.camera] ?? shot.camera) : null;
  if (cam) lines.push(`- มุมกล้อง: ${cam}`);
  if (shot.action?.trim()) lines.push(`- แอ็กชัน: ${shot.action.trim()}`);
  if (shot.emotion?.trim()) lines.push(`- อารมณ์: ${shot.emotion.trim()}`);
  if (shot.outfit?.trim()) lines.push(`- เครื่องแต่งกาย: ${shot.outfit.trim()}`);
  if (shot.dialogue?.trim()) lines.push(`- บทพูดในฉาก: "${shot.dialogue.trim()}"`);

  if (characters.length) {
    lines.push('', 'ตัวละครในเฟรม (คงอัตลักษณ์ตาม Visual DNA ให้เป๊ะเพื่อความต่อเนื่อง):');
    for (const c of characters) lines.push(`- ${characterDescriptor(c)}`);
  }

  const locDesc = locationDescriptor(location);
  if (locDesc) lines.push('', `ฉาก/สถานที่: ${locDesc}`);

  // anti-clone rules — รวบจากทุกตัวละคร (กันซ้ำ)
  const antiClone: string[] = [];
  for (const c of characters) {
    const rules = asRecord(c.visualDna).anti_clone_rules;
    if (Array.isArray(rules)) for (const r of rules) if (r) antiClone.push(String(r));
  }
  const uniqAnti = [...new Set(antiClone)];
  if (uniqAnti.length) {
    lines.push('', 'กฎห้ามพลาด (anti-clone):', ...uniqAnti.map((r) => `- ${r}`));
  }

  // negative prompt — รวบจากตัวละคร + สถานที่
  const negatives: string[] = [];
  for (const c of characters) {
    const neg = dnaValue(asRecord(c.visualDna).negative_prompt);
    if (neg) negatives.push(neg);
  }
  if (location?.negativePrompt?.trim()) negatives.push(location.negativePrompt.trim());
  const uniqNeg = [...new Set(negatives)];
  if (uniqNeg.length) {
    lines.push('', `Negative prompt: ${uniqNeg.join(', ')}`);
  }

  return lines.join('\n');
}

@Injectable()
export class StoryboardService {
  constructor(
    private prisma: PrismaService,
    private scope: ScopeService,
  ) {}

  /**
   * viewScope 'own'/'team' + อีพีนอกชุดที่มองเห็น → 404 เหมือนไม่มีแถว (อีพีไร้เจ้าของเห็นได้ทุกคน)
   * ยกเว้น: ผู้ใช้ถูก assign Task ของอีพีนี้ (entityType 'episode') → เปิดดูได้ กันคลิกจาก task แล้ว 404
   */
  private async assertEpisodeVisible(episodeId: string, ownerId: string | null, user: AuthUser) {
    if (!ownerId || ownerId === user.id) return;
    const visibleIds = await this.scope.resolveVisibleUserIds(user, 'episode');
    if (!visibleIds || visibleIds.includes(ownerId)) return;
    const assigned = await this.prisma.task.count({
      where: { assigneeId: user.id, entityType: 'episode', entityId: episodeId },
    });
    if (!assigned) throw new NotFoundException('ไม่พบ episode');
  }

  /** โหลดตัวละครที่อ้างในช็อต (join table ไม่มี relation ตรงถึง Character) + Location ที่เกี่ยว */
  private async loadRefs(characterIds: string[], locationIds: string[]) {
    const characters = characterIds.length
      ? await this.prisma.character.findMany({
          where: { id: { in: characterIds } },
          select: {
            id: true,
            nameTh: true,
            nameEn: true,
            age: true,
            gender: true,
            region: true,
            visualDna: true,
          },
        })
      : [];
    const locations = locationIds.length
      ? await this.prisma.location.findMany({
          where: { id: { in: locationIds } },
          select: {
            id: true,
            name: true,
            mood: true,
            lighting: true,
            timeOfDay: true,
            regionStyle: true,
            prompt: true,
            negativePrompt: true,
          },
        })
      : [];
    return {
      charMap: new Map(characters.map((c) => [c.id, c])),
      locMap: new Map(locations.map((l) => [l.id, l])),
    };
  }

  /** batch: ร่าง imagePrompt ให้ทุกช็อตในอีพี — per-shot fail ไม่ล้มทั้งชุด */
  async generatePrompts(
    episodeId: string,
    opts: { regenerate?: boolean },
    user: AuthUser,
    via = 'ui',
  ) {
    const episode = await this.prisma.episode.findUnique({
      where: { id: episodeId },
      include: {
        shots: { orderBy: { shotNumber: 'asc' }, include: { characters: true } },
      },
    });
    if (!episode || episode.archivedAt) throw new NotFoundException('ไม่พบ episode');
    await this.assertEpisodeVisible(episode.id, episode.ownerId, user);

    const characterIds = new Set<string>();
    const locationIds = new Set<string>();
    if (episode.locationId) locationIds.add(episode.locationId);
    for (const s of episode.shots) {
      if (s.locationId) locationIds.add(s.locationId);
      for (const c of s.characters) characterIds.add(c.characterId);
    }
    const { charMap, locMap } = await this.loadRefs([...characterIds], [...locationIds]);

    let generated = 0;
    let skipped = 0;
    let failed = 0;
    const results: { shotId: string; shotNumber: number; status: 'generated' | 'skipped' | 'failed' }[] =
      [];

    for (const shot of episode.shots) {
      try {
        if (shot.imagePrompt && !opts.regenerate) {
          skipped++;
          results.push({ shotId: shot.id, shotNumber: shot.shotNumber, status: 'skipped' });
          continue;
        }
        const characters = shot.characters
          .map((sc) => charMap.get(sc.characterId))
          .filter((c): c is CharacterRow => Boolean(c));
        const location = (shot.locationId ? locMap.get(shot.locationId) : null) ??
          (episode.locationId ? locMap.get(episode.locationId) : null) ??
          null;
        const imagePrompt = buildShotImagePrompt(shot, characters, location ?? null);
        await this.prisma.shot.update({ where: { id: shot.id }, data: { imagePrompt } });
        generated++;
        results.push({ shotId: shot.id, shotNumber: shot.shotNumber, status: 'generated' });
      } catch {
        failed++;
        results.push({ shotId: shot.id, shotNumber: shot.shotNumber, status: 'failed' });
      }
    }

    await this.audit(user, via, 'storyboard_prompts', episodeId, {
      total: episode.shots.length,
      generated,
      skipped,
      failed,
      regenerate: Boolean(opts.regenerate),
    });

    return {
      episodeId,
      total: episode.shots.length,
      generated,
      skipped,
      failed,
      provenance: 'deterministic' as const,
      results,
    };
  }

  /** ร่าง imagePrompt ใหม่ให้ช็อตเดียว (เขียนทับเสมอ) */
  async generateOne(shotId: string, user: AuthUser, via = 'ui') {
    const shot = await this.prisma.shot.findUnique({
      where: { id: shotId },
      include: { characters: true, episode: { select: { locationId: true, ownerId: true } } },
    });
    if (!shot) throw new NotFoundException('ไม่พบ shot');
    await this.assertEpisodeVisible(shot.episodeId, shot.episode.ownerId, user);

    const characterIds = shot.characters.map((c) => c.characterId);
    const locationIds = [shot.locationId, shot.episode.locationId].filter(
      (x): x is string => Boolean(x),
    );
    const { charMap, locMap } = await this.loadRefs(characterIds, locationIds);

    const characters = characterIds
      .map((id) => charMap.get(id))
      .filter((c): c is CharacterRow => Boolean(c));
    const location = (shot.locationId ? locMap.get(shot.locationId) : null) ??
      (shot.episode.locationId ? locMap.get(shot.episode.locationId) : null) ??
      null;

    const imagePrompt = buildShotImagePrompt(shot, characters, location ?? null);
    const updated = await this.prisma.shot.update({
      where: { id: shotId },
      data: { imagePrompt },
      include: { characters: true },
    });
    await this.audit(user, via, 'storyboard_prompt_one', shotId, { episodeId: shot.episodeId });
    return {
      ...updated,
      characterIds: updated.characters.map((c) => c.characterId),
    };
  }

  /** comic-panel view: ช็อตเรียงตาม shotNumber + ชื่อตัวละคร + imagePrompt + เฟรม (asset) */
  async getStoryboard(episodeId: string, user: AuthUser) {
    const episode = await this.prisma.episode.findUnique({
      where: { id: episodeId },
      include: {
        location: { select: { id: true, name: true } },
        shots: { orderBy: { shotNumber: 'asc' }, include: { characters: true } },
      },
    });
    if (!episode || episode.archivedAt) throw new NotFoundException('ไม่พบ episode');
    await this.assertEpisodeVisible(episode.id, episode.ownerId, user);

    // ชื่อตัวละคร
    const characterIds = new Set<string>();
    for (const s of episode.shots) for (const c of s.characters) characterIds.add(c.characterId);
    const characters = characterIds.size
      ? await this.prisma.character.findMany({
          where: { id: { in: [...characterIds] } },
          select: { id: true, displayCode: true, nameTh: true, nameEn: true },
        })
      : [];
    const charMap = new Map(characters.map((c) => [c.id, c]));

    // เฟรมที่แนบกับช็อต (polymorphic AssetLink entityType 'shot')
    const shotIds = episode.shots.map((s) => s.id);
    const links = shotIds.length
      ? await this.prisma.assetLink.findMany({
          where: {
            entityType: 'shot',
            entityId: { in: shotIds },
            asset: { archivedAt: null },
          },
          select: {
            id: true,
            entityId: true,
            linkRole: true,
            asset: {
              select: {
                id: true,
                assetType: true,
                mimeType: true,
                status: true,
                createdAt: true,
              },
            },
          },
          orderBy: { asset: { createdAt: 'asc' } },
        })
      : [];
    const framesByShot = new Map<
      string,
      { linkId: string; assetId: string; assetType: string; mimeType: string; linkRole: string; status: string; createdAt: Date }[]
    >();
    for (const l of links) {
      const arr = framesByShot.get(l.entityId) ?? [];
      arr.push({
        linkId: l.id,
        assetId: l.asset.id,
        assetType: l.asset.assetType,
        mimeType: l.asset.mimeType,
        linkRole: l.linkRole,
        status: l.asset.status,
        createdAt: l.asset.createdAt,
      });
      framesByShot.set(l.entityId, arr);
    }

    return {
      episode: {
        id: episode.id,
        displayCode: episode.displayCode,
        title: episode.title,
        status: episode.status,
        location: episode.location,
      },
      shots: episode.shots.map((s) => ({
        id: s.id,
        shotNumber: s.shotNumber,
        camera: s.camera,
        action: s.action,
        dialogue: s.dialogue,
        emotion: s.emotion,
        outfit: s.outfit,
        status: s.status,
        imagePrompt: s.imagePrompt,
        characters: s.characters.map((c) => {
          const row = charMap.get(c.characterId);
          return {
            characterId: c.characterId,
            nameTh: row?.nameTh ?? null,
            nameEn: row?.nameEn ?? null,
            displayCode: row?.displayCode ?? null,
          };
        }),
        frames: framesByShot.get(s.id) ?? [],
      })),
    };
  }

  private audit(user: AuthUser, via: string, action: string, entityId: string, meta: object) {
    return this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        via,
        action,
        entityType: action === 'storyboard_prompt_one' ? 'shot' : 'episode',
        entityId,
        meta: meta as Prisma.InputJsonValue,
      },
    });
  }
}
