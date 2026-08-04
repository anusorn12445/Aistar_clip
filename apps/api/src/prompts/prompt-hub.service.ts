import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type CharacterBlueprint } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/current-user.decorator';
import {
  buildMasterPromptFor,
  buildPromptFor,
  type ImageTool,
  type MasterPromptBlueprint,
  type PromptCharacter,
} from '../exports/image-prompt';
import {
  composeCamera,
  composeGesture,
  composeHand,
  composeLighting,
  composeLocation,
  type ComposedPrompt,
} from './prompt-hub.compose';
import { HUB_SOURCE_TYPES, type HubSourceType } from './dto/hub-snapshot.dto';

// ─── Prompt Hub (🌐 ทุกแหล่ง) — live reference รวม prompt จาก 6 คลัง ───────
// อ่านสดจากตารางต้นทางทุกครั้ง (ไม่ก๊อปอัตโนมัติ) — แก้ไขทำที่ต้นทางเท่านั้น
// "⭐ เก็บเข้าคลังหลัก" = snapshot ชัดเจนโดยผู้ใช้ → Prompt + version (frozen)

// module ที่ต้องมีสิทธิ์ V ถึงจะเห็นแหล่งนั้น (mirror PermissionsGuard ต่อ controller ต้นทาง)
const SOURCE_MODULE: Record<HubSourceType, string> = {
  location: 'location',
  gesture: 'library',
  camera_preset: 'library',
  lighting_preset: 'library',
  hand: 'library',
  character: 'character',
};

// promptType ตอน snapshot เข้าคลังหลัก (CEO ล็อก mapping)
const SNAPSHOT_PROMPT_TYPE: Record<HubSourceType, string> = {
  location: 'scene',
  gesture: 'shot',
  camera_preset: 'shot',
  lighting_preset: 'scene',
  hand: 'shot',
  character: 'identity',
};

// entityType ของ AssetLink ที่แต่ละแหล่งใช้เก็บรูป (ตาม convention หน้า web ของคลังนั้น)
const SOURCE_ASSET_ENTITY: Record<HubSourceType, string> = {
  location: 'location',
  gesture: 'gesture',
  camera_preset: 'camera_preset',
  lighting_preset: 'lighting_preset',
  hand: 'hand',
  character: 'character',
};

const IMAGE_TOOLS: { tool: ImageTool; label: string }[] = [
  { tool: 'chatgpt', label: 'ChatGPT' },
  { tool: 'gemini', label: 'Gemini' },
  { tool: 'grok', label: 'Grok' },
];

const PREVIEW_LEN = 200;

export interface HubListParams {
  q?: string;
  sourceType?: HubSourceType;
  page?: number;
  pageSize?: number;
}

export interface HubCharacterVariant {
  tool: ImageTool;
  label: string;
  text: string;
}

export interface HubRow {
  sourceType: HubSourceType;
  sourceId: string;
  name: string;
  code: string | null;
  updatedAt: Date;
  thumbnailAssetId: string | null;
  preview: string;
  source?: Record<string, unknown>;
  characterVariants?: HubCharacterVariant[];
}

interface HubHead {
  sourceType: HubSourceType;
  id: string;
  updatedAt: Date;
}

@Injectable()
export class PromptHubService {
  constructor(private prisma: PrismaService) {}

  // ─── GET /prompts/hub ────────────────────────────────────────

  async list(params: HubListParams, user: AuthUser) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const pageSize = Math.min(Math.max(params.pageSize ?? 20, 1), 50);

    const allowed = await this.allowedModules(user);
    const types = (params.sourceType ? [params.sourceType] : [...HUB_SOURCE_TYPES]).filter((t) =>
      allowed.has(SOURCE_MODULE[t]),
    );

    // phase 1: id + updatedAt ต่อแหล่ง (เบา) → merge + sort + slice หน้า
    const headLists = await Promise.all(types.map((t) => this.heads(t, params.q)));
    const heads = headLists.flat().sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    const total = heads.length;
    const pageHeads = heads.slice((page - 1) * pageSize, page * pageSize);

    // phase 2: โหลด record เต็มเฉพาะแถวในหน้า (query เดียวต่อแหล่ง — ไม่มี N+1)
    const idsByType = new Map<HubSourceType, string[]>();
    for (const h of pageHeads) {
      const ids = idsByType.get(h.sourceType) ?? [];
      ids.push(h.id);
      idsByType.set(h.sourceType, ids);
    }

    const rowsByKey = new Map<string, HubRow>();
    await Promise.all(
      [...idsByType].map(async ([type, ids]) => {
        const [rows, thumbs] = await Promise.all([
          this.buildRows(type, ids),
          this.thumbnailMap(SOURCE_ASSET_ENTITY[type], ids),
        ]);
        for (const row of rows) {
          row.thumbnailAssetId = thumbs.get(row.sourceId) ?? null;
          rowsByKey.set(`${type}|${row.sourceId}`, row);
        }
      }),
    );

    // คงลำดับ updatedAt desc จาก phase 1
    const items = pageHeads
      .map((h) => rowsByKey.get(`${h.sourceType}|${h.id}`))
      .filter((r): r is HubRow => Boolean(r));

    return { items, total, page, pageSize };
  }

  /** phase 1 — id + updatedAt ของแหล่งเดียว (กรอง archived + q) */
  private async heads(type: HubSourceType, q?: string): Promise<HubHead[]> {
    const contains = (field: string) =>
      ({ [field]: { contains: q, mode: 'insensitive' } }) as Record<string, unknown>;
    const select = { id: true, updatedAt: true } as const;
    let rows: { id: string; updatedAt: Date }[] = [];

    switch (type) {
      case 'location':
        rows = await this.prisma.location.findMany({
          where: {
            status: { not: 'archived' },
            ...(q ? { OR: [contains('name'), contains('type')] } : {}),
          },
          select,
        });
        break;
      case 'gesture':
        rows = await this.prisma.gesture.findMany({
          where: {
            archivedAt: null,
            ...(q ? { OR: [contains('name'), contains('key')] } : {}),
          },
          select,
        });
        break;
      case 'camera_preset':
        rows = await this.prisma.cameraPreset.findMany({
          where: {
            archivedAt: null,
            ...(q ? { OR: [contains('name'), contains('displayCode'), contains('key')] } : {}),
          },
          select,
        });
        break;
      case 'lighting_preset':
        rows = await this.prisma.lightingPreset.findMany({
          where: {
            archivedAt: null,
            ...(q ? { OR: [contains('name'), contains('displayCode'), contains('key')] } : {}),
          },
          select,
        });
        break;
      case 'hand':
        rows = await this.prisma.handProfile.findMany({
          where: {
            archivedAt: null,
            status: { not: 'archived' },
            ...(q ? { OR: [contains('name'), contains('displayCode')] } : {}),
          },
          select,
        });
        break;
      case 'character':
        // เฉพาะตัวละครที่มี visualDna แล้ว (ยังไม่มี = ยัง compose Master Prompt ไม่ได้)
        rows = await this.prisma.character.findMany({
          where: {
            archivedAt: null,
            visualDna: { not: Prisma.AnyNull },
            ...(q ? { OR: [contains('nameTh'), contains('nameEn'), contains('displayCode')] } : {}),
          },
          select,
        });
        break;
    }
    return rows.map((r) => ({ sourceType: type, id: r.id, updatedAt: r.updatedAt }));
  }

  /** phase 2 — record เต็ม + preview + source/characterVariants ของแหล่งเดียว */
  private async buildRows(type: HubSourceType, ids: string[]): Promise<HubRow[]> {
    const where = { id: { in: ids } };

    if (type === 'character') {
      const chars = await this.prisma.character.findMany({ where });

      // blueprint ต่อคน (batch) + default blueprint fallback — pattern เดียวกับ exports
      const blueprintIds = [...new Set(chars.map((c) => c.blueprintId).filter((x): x is string => !!x))];
      const [blueprints, defaultBlueprint, refLinks] = await Promise.all([
        blueprintIds.length
          ? this.prisma.characterBlueprint.findMany({ where: { id: { in: blueprintIds } } })
          : Promise.resolve([] as CharacterBlueprint[]),
        this.prisma.characterBlueprint.findFirst({ where: { isDefault: true, status: 'active' } }),
        // Reference image lock (prompt_reference) → Master Prompt แนบกฎ reference
        this.prisma.assetLink.findMany({
          where: {
            entityType: 'character',
            entityId: { in: ids },
            linkRole: 'prompt_reference',
            asset: { archivedAt: null, mimeType: { startsWith: 'image/' } },
          },
          select: { entityId: true },
        }),
      ]);
      const blueprintById = new Map(blueprints.map((b) => [b.id, b]));
      const hasRef = new Set(refLinks.map((l) => l.entityId));

      return chars.map((c) => {
        const bp = (c.blueprintId ? blueprintById.get(c.blueprintId) : null) ?? defaultBlueprint;
        const blueprint: MasterPromptBlueprint | null = bp
          ? { name: bp.name, houseRules: bp.houseRules, requiredFields: bp.requiredFields }
          : null;
        const pc: PromptCharacter = {
          nameTh: c.nameTh,
          nameEn: c.nameEn,
          age: c.age,
          gender: c.gender,
          region: c.region,
          visualDna: c.visualDna as Record<string, unknown> | null,
          dos: c.dos,
          donts: c.donts,
        };
        const opts = { hasReference: hasRef.has(c.id) };
        const variants: HubCharacterVariant[] = IMAGE_TOOLS.map(({ tool, label }) => ({
          tool,
          label,
          text: buildMasterPromptFor(tool, pc, blueprint, opts),
        }));
        return {
          sourceType: 'character' as const,
          sourceId: c.id,
          name: c.nameTh,
          code: c.displayCode,
          updatedAt: c.updatedAt,
          thumbnailAssetId: null,
          // preview จาก character spec (prose) — อ่านรู้เรื่องกว่าหัว DIRECTIVE ที่ซ้ำทุกตัว
          preview: this.preview(buildPromptFor('chatgpt', pc)),
          characterVariants: variants,
        };
      });
    }

    // 5 คลัง library — ส่ง raw record กลับไปให้ web compose variants ด้วย client builders เดิม
    switch (type) {
      case 'location': {
        const rows = await this.prisma.location.findMany({ where });
        return rows.map((r) =>
          this.libraryRow(type, r.id, r.name, null, r.updatedAt, composeLocation(r), r),
        );
      }
      case 'gesture': {
        const rows = await this.prisma.gesture.findMany({ where });
        return rows.map((r) =>
          this.libraryRow(type, r.id, r.name, r.key, r.updatedAt, composeGesture(r), r),
        );
      }
      case 'camera_preset': {
        const rows = await this.prisma.cameraPreset.findMany({ where });
        return rows.map((r) =>
          this.libraryRow(type, r.id, r.name, r.displayCode, r.updatedAt, composeCamera(r), r),
        );
      }
      case 'lighting_preset': {
        const rows = await this.prisma.lightingPreset.findMany({ where });
        return rows.map((r) =>
          this.libraryRow(type, r.id, r.name, r.displayCode, r.updatedAt, composeLighting(r), r),
        );
      }
      case 'hand': {
        const rows = await this.prisma.handProfile.findMany({ where });
        return rows.map((r) =>
          this.libraryRow(type, r.id, r.name, r.displayCode, r.updatedAt, composeHand(r), r),
        );
      }
      default:
        return [];
    }
  }

  private libraryRow(
    sourceType: HubSourceType,
    sourceId: string,
    name: string,
    code: string | null,
    updatedAt: Date,
    composed: ComposedPrompt,
    source: object,
  ): HubRow {
    return {
      sourceType,
      sourceId,
      name,
      code,
      updatedAt,
      thumbnailAssetId: null,
      preview: this.preview(composed.body),
      source: source as Record<string, unknown>,
    };
  }

  private preview(body: string): string {
    const t = body.trim();
    return t.length > PREVIEW_LEN ? `${t.slice(0, PREVIEW_LEN)}…` : t;
  }

  // ─── POST /prompts/hub/snapshot ──────────────────────────────

  async snapshot(sourceType: HubSourceType, sourceId: string, user: AuthUser, via = 'ui') {
    // ต้องมีสิทธิ์เห็นแหล่งต้นทางด้วย (กัน snapshot ข้ามสิทธิ์ — mirror กติกา omission ของ list)
    const allowed = await this.allowedModules(user);
    if (!allowed.has(SOURCE_MODULE[sourceType])) {
      throw new ForbiddenException(`ต้องมีสิทธิ์ V ใน module ${SOURCE_MODULE[sourceType]}`);
    }

    const { name, composed } = await this.composeCanonical(sourceType, sourceId);
    const sourceUrl = `aistar://${sourceType}/${sourceId}`;

    // idempotent-by-origin: มี version ที่ชี้ origin เดียวกันอยู่แล้ว → เพิ่ม version ใหม่
    // บน Prompt เดิม (v2, v3, …) แทนการสร้าง Prompt ซ้ำ
    const existing = await this.prisma.promptVersion.findFirst({
      where: { sourceUrl, prompt: { archivedAt: null } },
      select: { promptId: true },
    });

    let promptId: string;
    let versionLabel: string;
    if (existing) {
      promptId = existing.promptId;
      const count = await this.prisma.promptVersion.count({ where: { promptId } });
      versionLabel = `v${count + 1}`;
      await this.prisma.promptVersion.create({
        data: {
          promptId,
          versionLabel,
          body: composed.body,
          negativeBody: composed.negative,
          targetPlatform: 'chatgpt',
          sourceUrl,
          createdBy: user.id,
        },
      });
      // touch updatedAt ให้ prompt ขึ้นบนสุดของคลังหลัก
      await this.prisma.prompt.update({ where: { id: promptId }, data: { updatedAt: new Date() } });
    } else {
      versionLabel = 'v1';
      const created = await this.prisma.prompt.create({
        data: {
          name,
          promptType: SNAPSHOT_PROMPT_TYPE[sourceType],
          status: 'approved',
          createdBy: user.id,
          versions: {
            create: {
              versionLabel,
              body: composed.body,
              negativeBody: composed.negative,
              targetPlatform: 'chatgpt',
              sourceUrl,
              createdBy: user.id,
            },
          },
        },
      });
      promptId = created.id;
    }

    // รูปตัวอย่าง: reuse asset เดิมของต้นทาง (ลิงก์เพิ่ม ไม่อัปโหลดซ้ำ) — ถ้ามี
    const thumbs = await this.thumbnailMap(SOURCE_ASSET_ENTITY[sourceType], [sourceId]);
    const thumbAssetId = thumbs.get(sourceId);
    if (thumbAssetId) {
      const already = await this.prisma.assetLink.findFirst({
        where: { assetId: thumbAssetId, entityType: 'prompt', entityId: promptId },
      });
      if (!already) {
        // มี cover อยู่แล้ว (จาก snapshot ก่อน ๆ) → ลิงก์ใหม่เป็น reference (cover มีได้ตัวเดียว)
        const hasCover = await this.prisma.assetLink.findFirst({
          where: { entityType: 'prompt', entityId: promptId, linkRole: 'cover' },
        });
        await this.prisma.assetLink.create({
          data: {
            assetId: thumbAssetId,
            entityType: 'prompt',
            entityId: promptId,
            linkRole: hasCover ? 'reference' : 'cover',
          },
        });
      }
    }

    await this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        via,
        action: 'hub_snapshot',
        entityType: 'prompt',
        entityId: promptId,
        meta: { sourceType, sourceId, versionLabel } as Prisma.InputJsonValue,
      },
    });

    const prompt = await this.prisma.prompt.findUniqueOrThrow({
      where: { id: promptId },
      include: { versions: { orderBy: { createdAt: 'desc' } } },
    });
    return { prompt, versionLabel };
  }

  /** compose canonical text ของ snapshot — 404 เมื่อไม่พบต้นทาง */
  private async composeCanonical(
    type: HubSourceType,
    id: string,
  ): Promise<{ name: string; composed: ComposedPrompt }> {
    switch (type) {
      case 'location': {
        const r = await this.prisma.location.findFirst({
          where: { id, status: { not: 'archived' } },
        });
        if (!r) throw new NotFoundException('ไม่พบ location ต้นทาง');
        return { name: r.name, composed: composeLocation(r) };
      }
      case 'gesture': {
        const r = await this.prisma.gesture.findFirst({ where: { id, archivedAt: null } });
        if (!r) throw new NotFoundException('ไม่พบ gesture ต้นทาง');
        return { name: r.name, composed: composeGesture(r) };
      }
      case 'camera_preset': {
        const r = await this.prisma.cameraPreset.findFirst({ where: { id, archivedAt: null } });
        if (!r) throw new NotFoundException('ไม่พบ camera preset ต้นทาง');
        return { name: r.name, composed: composeCamera(r) };
      }
      case 'lighting_preset': {
        const r = await this.prisma.lightingPreset.findFirst({ where: { id, archivedAt: null } });
        if (!r) throw new NotFoundException('ไม่พบ lighting preset ต้นทาง');
        return { name: r.name, composed: composeLighting(r) };
      }
      case 'hand': {
        const r = await this.prisma.handProfile.findFirst({ where: { id, archivedAt: null } });
        if (!r) throw new NotFoundException('ไม่พบ hand profile ต้นทาง');
        return { name: r.name, composed: composeHand(r) };
      }
      case 'character': {
        const c = await this.prisma.character.findFirst({ where: { id, archivedAt: null } });
        if (!c) throw new NotFoundException('ไม่พบตัวละครต้นทาง');
        if (!c.visualDna) {
          throw new BadRequestException('ตัวละครนี้ยังไม่มี Visual DNA — สร้างให้ครบก่อน snapshot');
        }
        const [bp, refLink] = await Promise.all([
          c.blueprintId
            ? this.prisma.characterBlueprint.findUnique({ where: { id: c.blueprintId } })
            : this.prisma.characterBlueprint.findFirst({
                where: { isDefault: true, status: 'active' },
              }),
          this.prisma.assetLink.findFirst({
            where: {
              entityType: 'character',
              entityId: id,
              linkRole: 'prompt_reference',
              asset: { archivedAt: null, mimeType: { startsWith: 'image/' } },
            },
          }),
        ]);
        const pc: PromptCharacter = {
          nameTh: c.nameTh,
          nameEn: c.nameEn,
          age: c.age,
          gender: c.gender,
          region: c.region,
          visualDna: c.visualDna as Record<string, unknown>,
          dos: c.dos,
          donts: c.donts,
        };
        const blueprint: MasterPromptBlueprint | null = bp
          ? { name: bp.name, houseRules: bp.houseRules, requiredFields: bp.requiredFields }
          : null;
        const body = buildMasterPromptFor('chatgpt', pc, blueprint, { hasReference: !!refLink });
        const v = c.visualDna as Record<string, unknown>;
        const negative =
          typeof v.negative_prompt === 'string' && v.negative_prompt.trim()
            ? v.negative_prompt.trim()
            : null;
        return { name: c.nameTh, composed: { body, negative } };
      }
    }
  }

  // ─── helpers ─────────────────────────────────────────────────

  /** module ที่ user มีสิทธิ์ V — ใช้ตัดแหล่งที่มองไม่เห็นออกเงียบ ๆ (query เดียว) */
  private async allowedModules(user: AuthUser): Promise<Set<string>> {
    const modules = [...new Set(Object.values(SOURCE_MODULE))];
    const rows = await this.prisma.rolePermission.findMany({
      where: {
        module: { in: modules },
        actions: { has: 'V' },
        role: { key: { in: user.roles } },
      },
      select: { module: true },
    });
    return new Set(rows.map((r) => r.module));
  }

  /** thumbnail ที่ "ดีสุด" ต่อ entity — primary_reference > cover > thumbnail > รูปเก่าสุด
   *  (pattern เดียวกับ assets.service.thumbnails — query เดียวต่อ entityType) */
  private async thumbnailMap(entityType: string, ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const links = await this.prisma.assetLink.findMany({
      where: {
        entityType,
        entityId: { in: ids },
        asset: { archivedAt: null, mimeType: { startsWith: 'image/' } },
      },
      select: {
        entityId: true,
        assetId: true,
        linkRole: true,
        asset: { select: { createdAt: true } },
      },
    });
    const ROLE_PRIORITY: Record<string, number> = { primary_reference: 0, cover: 1, thumbnail: 2 };
    const best = new Map<string, { assetId: string; prio: number; createdAt: Date }>();
    for (const link of links) {
      const prio = ROLE_PRIORITY[link.linkRole] ?? 3;
      const cur = best.get(link.entityId);
      if (!cur || prio < cur.prio || (prio === cur.prio && link.asset.createdAt < cur.createdAt)) {
        best.set(link.entityId, { assetId: link.assetId, prio, createdAt: link.asset.createdAt });
      }
    }
    return new Map([...best].map(([k, v]) => [k, v.assetId]));
  }
}
