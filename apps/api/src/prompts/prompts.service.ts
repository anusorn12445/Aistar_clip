import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApprovalStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/current-user.decorator';
import { CreatePlatformDto } from './dto/create-platform.dto';
import { CreatePromptDto } from './dto/create-prompt.dto';
import { CreatePromptVersionDto } from './dto/create-prompt-version.dto';
import { UpdatePromptDto } from './dto/update-prompt.dto';
import { CreatePromptLinkDto } from './dto/create-prompt-link.dto';
import { PromptRelationDto, RelationEntityType } from './dto/prompt-relation.dto';
import { CreateGenerationRunDto } from './dto/create-generation-run.dto';

// State machine ตาม addendum §D.2 — pattern เดียวกับ characters.service
const TRANSITIONS: Record<ApprovalStatus, ApprovalStatus[]> = {
  draft: ['internal_review', 'archived'],
  internal_review: ['approved', 'revision_needed', 'archived'],
  revision_needed: ['draft', 'archived'],
  approved: ['production_ready', 'archived'],
  production_ready: ['archived'],
  rejected: ['archived'],
  archived: [],
};

// transition ที่ต้องมีสิทธิ์ Approve (มนุษย์เท่านั้นตาม D8)
const NEEDS_APPROVE: ApprovalStatus[] = ['approved', 'production_ready', 'rejected'];

// entity types ที่ผูกเป็น "ความสัมพันธ์" ระดับ prompt ได้ (CEO อนุมัติ 4 ค่าย)
const RELATION_TYPES: readonly RelationEntityType[] = ['character', 'product', 'client', 'brand'];

interface RawRelationLink {
  id: string;
  entityType: string;
  entityId: string;
}

export interface PromptRelationItem {
  id: string; // linkId (ตัวแรกที่เจอ ถ้าซ้ำหลาย version)
  entityType: string;
  entityId: string;
  name: string;
  code: string | null; // displayCode ของ character/product — client/brand ไม่มี
}

export interface ListPromptsParams {
  q?: string;
  promptType?: string;
  targetPlatform?: string;
  status?: ApprovalStatus;
  bestFlag?: boolean;
  entityType?: string;
  entityId?: string;
  page?: number;
}

@Injectable()
export class PromptsService {
  constructor(private prisma: PrismaService) {}

  // ─── Platforms (D4 — registry เปิด admin เพิ่มเองได้) ────────

  listPlatforms() {
    return this.prisma.platform.findMany({
      where: { status: 'active' },
      orderBy: { key: 'asc' },
    });
  }

  async createPlatform(dto: CreatePlatformDto, user: AuthUser, via = 'ui') {
    const key = dto.key.toLowerCase();
    try {
      const platform = await this.prisma.platform.create({
        data: { key, name: dto.name },
      });
      await this.audit(user, via, 'create', platform.id, { key }, 'platform');
      return platform;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`มี platform key "${key}" อยู่แล้ว`);
      }
      throw err;
    }
  }

  // ─── Prompts ─────────────────────────────────────────────────

  async list(params: ListPromptsParams) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const take = 20;

    const where: Prisma.PromptWhereInput = {
      archivedAt: null,
      ...(params.status ? { status: params.status } : {}),
      ...(params.promptType ? { promptType: params.promptType } : {}),
      ...(params.bestFlag !== undefined ? { bestFlag: params.bestFlag } : {}),
      ...(params.q ? { name: { contains: params.q, mode: 'insensitive' } } : {}),
      ...(params.entityType && params.entityId
        ? {
            versions: {
              some: {
                links: { some: { entityType: params.entityType, entityId: params.entityId } },
              },
            },
          }
        : {}),
    };

    // filter targetPlatform ต้อง match กับ version ล่าสุด (ไม่ใช่ version ไหนก็ได้)
    if (params.targetPlatform) {
      const latestPerPrompt = await this.prisma.promptVersion.findMany({
        orderBy: [{ promptId: 'asc' }, { createdAt: 'desc' }],
        distinct: ['promptId'],
        select: { promptId: true, targetPlatform: true },
      });
      const ids = latestPerPrompt
        .filter((v) => v.targetPlatform === params.targetPlatform)
        .map((v) => v.promptId);
      where.id = { in: ids };
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.prompt.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * take,
        take,
        include: { versions: { orderBy: { createdAt: 'desc' }, take: 1 } },
      }),
      this.prisma.prompt.count({ where }),
    ]);

    // รูปตัวอย่าง (polymorphic assets, entityType 'prompt') — batch query เดียว ไม่มี N+1
    // prefer cover เป็น thumbnail ของการ์ด, นับจำนวนรูปทั้งหมด (cover + reference)
    const pageIds = rows.map((p) => p.id);
    const exampleThumbByPrompt = new Map<string, string>();
    const exampleCountByPrompt = new Map<string, number>();
    if (pageIds.length > 0) {
      const links = await this.prisma.assetLink.findMany({
        where: {
          entityType: 'prompt',
          entityId: { in: pageIds },
          linkRole: { in: ['cover', 'reference'] },
          // นับทั้งรูปและวิดีโอ (แกลเลอรีแสดงทั้งคู่) — thumbnail เลือกเฉพาะรูปด้านล่าง
          asset: {
            archivedAt: null,
            OR: [{ mimeType: { startsWith: 'image/' } }, { mimeType: { startsWith: 'video/' } }],
          },
        },
        select: {
          entityId: true,
          assetId: true,
          linkRole: true,
          asset: { select: { createdAt: true, mimeType: true } },
        },
      });
      const ROLE_PRIORITY: Record<string, number> = { cover: 0, reference: 1 };
      const best = new Map<string, { assetId: string; prio: number; createdAt: Date }>();
      // นับ "จำนวนรูป" = จำนวน asset ที่ไม่ซ้ำ (asset เดียวอาจมีทั้ง cover + reference link
      // — ตอนตั้งเป็นปก — ต้องไม่นับซ้ำ)
      const assetsByPrompt = new Map<string, Set<string>>();
      for (const link of links) {
        let set = assetsByPrompt.get(link.entityId);
        if (!set) {
          set = new Set<string>();
          assetsByPrompt.set(link.entityId, set);
        }
        set.add(link.assetId);
        // thumbnail ต้องเป็นรูปเท่านั้น (วิดีโอเป็น thumbnail ไม่ได้) — นับ count ทั้งคู่แต่ข้าม best ถ้าเป็นวิดีโอ
        if (!link.asset.mimeType.startsWith('image/')) continue;
        const prio = ROLE_PRIORITY[link.linkRole] ?? 2;
        const cur = best.get(link.entityId);
        if (
          !cur ||
          prio < cur.prio ||
          (prio === cur.prio && link.asset.createdAt < cur.createdAt)
        ) {
          best.set(link.entityId, { assetId: link.assetId, prio, createdAt: link.asset.createdAt });
        }
      }
      for (const [entityId, v] of best) exampleThumbByPrompt.set(entityId, v.assetId);
      for (const [entityId, set] of assetsByPrompt) exampleCountByPrompt.set(entityId, set.size);
    }

    // relations (เชื่อม ตัวละคร/สินค้า/ลูกค้า/แบรนด์) — รวมทุก version, dedupe, enrich ชื่อ
    // batch query เดียวต่อ entity type ไม่มี N+1 (pattern เดียวกับ exampleThumb ด้านบน)
    const relationsByPrompt = new Map<string, PromptRelationItem[]>();
    if (pageIds.length > 0) {
      const rawLinks = await this.prisma.promptLink.findMany({
        where: {
          entityType: { in: [...RELATION_TYPES] },
          promptVersion: { promptId: { in: pageIds } },
        },
        select: {
          id: true,
          entityType: true,
          entityId: true,
          promptVersion: { select: { promptId: true } },
        },
      });
      const deduped: (RawRelationLink & { promptId: string })[] = [];
      const seen = new Set<string>();
      for (const link of rawLinks) {
        const promptId = link.promptVersion.promptId;
        const key = `${promptId}|${link.entityType}|${link.entityId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push({ id: link.id, entityType: link.entityType, entityId: link.entityId, promptId });
      }
      const enriched = await this.enrichRelations(deduped);
      for (let i = 0; i < deduped.length; i++) {
        const list = relationsByPrompt.get(deduped[i].promptId) ?? [];
        list.push(enriched[i]);
        relationsByPrompt.set(deduped[i].promptId, list);
      }
    }

    const items = rows.map(({ versions, ...prompt }) => ({
      ...prompt,
      latestVersion: versions[0] ?? null,
      exampleThumbAssetId: exampleThumbByPrompt.get(prompt.id) ?? null,
      exampleCount: exampleCountByPrompt.get(prompt.id) ?? 0,
      relations: relationsByPrompt.get(prompt.id) ?? [],
    }));
    return { items, total, page, pageSize: take };
  }

  async get(id: string) {
    const prompt = await this.prisma.prompt.findUnique({
      where: { id },
      include: { versions: { orderBy: { createdAt: 'desc' } } },
    });
    if (!prompt) throw new NotFoundException('ไม่พบ prompt');
    return prompt;
  }

  async create(dto: CreatePromptDto, user: AuthUser, via = 'ui') {
    const prompt = await this.prisma.prompt.create({
      data: {
        name: dto.name,
        promptType: dto.promptType,
        createdBy: user.id,
        versions: {
          create: {
            versionLabel: 'v1',
            body: dto.body,
            negativeBody: dto.negativeBody,
            targetPlatform: dto.targetPlatform,
            modelName: dto.modelName,
            modelVersion: dto.modelVersion,
            generationParams: dto.generationParams as Prisma.InputJsonValue | undefined,
            seed: dto.seed,
            createdBy: user.id,
          },
        },
      },
      include: { versions: true },
    });
    await this.audit(user, via, 'create', prompt.id, {
      name: prompt.name,
      promptType: prompt.promptType,
      targetPlatform: dto.targetPlatform,
    });
    return prompt;
  }

  async createVersion(promptId: string, dto: CreatePromptVersionDto, user: AuthUser, via = 'ui') {
    await this.ensureExists(promptId);
    const count = await this.prisma.promptVersion.count({ where: { promptId } });
    const versionLabel = `v${count + 1}`;

    const version = await this.prisma.promptVersion.create({
      data: {
        promptId,
        versionLabel,
        body: dto.body,
        negativeBody: dto.negativeBody,
        targetPlatform: dto.targetPlatform,
        modelName: dto.modelName,
        modelVersion: dto.modelVersion,
        generationParams: dto.generationParams as Prisma.InputJsonValue | undefined,
        seed: dto.seed,
        performanceNote: dto.performanceNote,
        createdBy: user.id,
      },
    });
    // touch updatedAt ให้ prompt ขึ้นบนสุดของ list
    await this.prisma.prompt.update({ where: { id: promptId }, data: { updatedAt: new Date() } });
    await this.audit(user, via, 'version_create', promptId, {
      versionLabel,
      targetPlatform: dto.targetPlatform,
    });
    return version;
  }

  async update(id: string, dto: UpdatePromptDto, user: AuthUser, via = 'ui') {
    const existing = await this.ensureExists(id);

    // toggle best_flag = การรับรองคุณภาพ ต้องมีสิทธิ์ Approve (pattern เดียวกับ approve ใน characters)
    if (dto.bestFlag !== undefined && dto.bestFlag !== existing.bestFlag) {
      const canApprove = await this.prisma.rolePermission.count({
        where: { module: 'prompt', actions: { has: 'A' }, role: { key: { in: user.roles } } },
      });
      if (!canApprove) throw new ForbiddenException('ต้องมีสิทธิ์ Approve ถึงจะ toggle best flag ได้');
    }

    const prompt = await this.prisma.prompt.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.bestFlag !== undefined ? { bestFlag: dto.bestFlag } : {}),
      },
    });

    if (dto.bestFlag !== undefined && dto.bestFlag !== existing.bestFlag) {
      await this.audit(user, via, 'best_flag', id, { bestFlag: dto.bestFlag });
    }
    if (dto.name !== undefined && dto.name !== existing.name) {
      await this.audit(user, via, 'update', id, { fields: ['name'] });
    }
    return prompt;
  }

  async changeStatus(id: string, next: ApprovalStatus, user: AuthUser, via = 'ui') {
    const existing = await this.ensureExists(id);

    if (!TRANSITIONS[existing.status].includes(next)) {
      throw new BadRequestException(`เปลี่ยน status ${existing.status} → ${next} ไม่ได้`);
    }

    if (NEEDS_APPROVE.includes(next)) {
      if (via !== 'ui') {
        // guardrail §28.2: ห้าม approve แทนมนุษย์ — เฉพาะ UI path เท่านั้น
        throw new ForbiddenException('การ approve ทำได้ผ่าน UI โดยมนุษย์เท่านั้น');
      }
      const canApprove = await this.prisma.rolePermission.count({
        where: { module: 'prompt', actions: { has: 'A' }, role: { key: { in: user.roles } } },
      });
      if (!canApprove) throw new ForbiddenException('ต้องมีสิทธิ์ Approve');
    }

    const prompt = await this.prisma.prompt.update({
      where: { id },
      data: { status: next, ...(next === 'archived' ? { archivedAt: new Date() } : {}) },
    });
    await this.audit(user, via, 'status_change', id, { from: existing.status, to: next });
    return prompt;
  }

  // ─── Links (polymorphic §F.2) ────────────────────────────────

  async addLink(promptId: string, dto: CreatePromptLinkDto, user: AuthUser, via = 'ui') {
    await this.ensureExists(promptId);

    let versionId = dto.versionId;
    if (versionId) {
      const version = await this.prisma.promptVersion.findFirst({
        where: { id: versionId, promptId },
      });
      if (!version) throw new NotFoundException('ไม่พบ version นี้ใน prompt นี้');
    } else {
      const latest = await this.prisma.promptVersion.findFirst({
        where: { promptId },
        orderBy: { createdAt: 'desc' },
      });
      if (!latest) throw new BadRequestException('prompt นี้ยังไม่มี version');
      versionId = latest.id;
    }

    const existing = await this.prisma.promptLink.findFirst({
      where: { promptVersionId: versionId, entityType: dto.entityType, entityId: dto.entityId },
    });
    if (existing) return existing; // idempotent — ลิงก์ซ้ำไม่สร้างเพิ่ม

    const link = await this.prisma.promptLink.create({
      data: { promptVersionId: versionId, entityType: dto.entityType, entityId: dto.entityId },
    });
    await this.audit(user, via, 'link_create', promptId, {
      versionId,
      entityType: dto.entityType,
      entityId: dto.entityId,
    });
    return link;
  }

  // ─── Relations (เชื่อม ตัวละคร/สินค้า/ลูกค้า/แบรนด์ — prompt-level UX) ──
  // เก็บจริงเป็น PromptLink ระดับ version (schema เดิม ไม่แตะ) — UX มองเป็นของ prompt:
  // GET รวมทุก version + dedupe, POST ลงบน version ล่าสุด, DELETE กวาดทุก version

  async listRelations(promptId: string) {
    await this.ensureExists(promptId);
    const links = await this.prisma.promptLink.findMany({
      where: {
        entityType: { in: [...RELATION_TYPES] },
        promptVersion: { promptId },
      },
      orderBy: { id: 'asc' },
      select: { id: true, entityType: true, entityId: true },
    });
    const deduped: RawRelationLink[] = [];
    const seen = new Set<string>();
    for (const link of links) {
      const key = `${link.entityType}|${link.entityId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(link);
    }
    return this.enrichRelations(deduped);
  }

  async addRelation(promptId: string, dto: PromptRelationDto, user: AuthUser, via = 'ui') {
    await this.ensureExists(promptId);
    await this.assertEntityExists(dto.entityType, dto.entityId);

    // ซ้ำ (type+id เดียวกันบน version ไหนก็ตามของ prompt นี้) → idempotent คืนตัวเดิม
    const existing = await this.prisma.promptLink.findFirst({
      where: {
        entityType: dto.entityType,
        entityId: dto.entityId,
        promptVersion: { promptId },
      },
    });
    if (existing) return existing;

    const latest = await this.prisma.promptVersion.findFirst({
      where: { promptId },
      orderBy: { createdAt: 'desc' },
    });
    if (!latest) throw new BadRequestException('prompt นี้ยังไม่มี version');

    const link = await this.prisma.promptLink.create({
      data: { promptVersionId: latest.id, entityType: dto.entityType, entityId: dto.entityId },
    });
    await this.audit(user, via, 'relation_create', promptId, {
      entityType: dto.entityType,
      entityId: dto.entityId,
      versionId: latest.id,
    });
    return link;
  }

  async removeRelation(promptId: string, dto: PromptRelationDto, user: AuthUser, via = 'ui') {
    await this.ensureExists(promptId);
    const { count } = await this.prisma.promptLink.deleteMany({
      where: {
        entityType: dto.entityType,
        entityId: dto.entityId,
        promptVersion: { promptId },
      },
    });
    if (count > 0) {
      await this.audit(user, via, 'relation_delete', promptId, {
        entityType: dto.entityType,
        entityId: dto.entityId,
        removed: count,
      });
    }
    return { removed: count };
  }

  /** เติมชื่อ (+displayCode) ให้ลิงก์ดิบ — batch ต่อ type, ลำดับผลลัพธ์ตรงกับ input */
  private async enrichRelations(links: RawRelationLink[]): Promise<PromptRelationItem[]> {
    const idsByType = new Map<string, string[]>();
    for (const link of links) {
      const ids = idsByType.get(link.entityType) ?? [];
      ids.push(link.entityId);
      idsByType.set(link.entityType, ids);
    }

    const nameById = new Map<string, { name: string; code: string | null }>();
    const put = (type: string, id: string, name: string, code: string | null = null) =>
      nameById.set(`${type}|${id}`, { name, code });

    const charIds = idsByType.get('character');
    if (charIds?.length) {
      const rows = await this.prisma.character.findMany({
        where: { id: { in: charIds } },
        select: { id: true, nameTh: true, displayCode: true },
      });
      for (const r of rows) put('character', r.id, r.nameTh, r.displayCode);
    }
    const productIds = idsByType.get('product');
    if (productIds?.length) {
      const rows = await this.prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, name: true, displayCode: true },
      });
      for (const r of rows) put('product', r.id, r.name, r.displayCode);
    }
    const clientIds = idsByType.get('client');
    if (clientIds?.length) {
      const rows = await this.prisma.client.findMany({
        where: { id: { in: clientIds } },
        select: { id: true, name: true },
      });
      for (const r of rows) put('client', r.id, r.name);
    }
    const brandIds = idsByType.get('brand');
    if (brandIds?.length) {
      const rows = await this.prisma.brand.findMany({
        where: { id: { in: brandIds } },
        select: { id: true, name: true },
      });
      for (const r of rows) put('brand', r.id, r.name);
    }

    return links.map((link) => {
      const meta = nameById.get(`${link.entityType}|${link.entityId}`);
      return {
        id: link.id,
        entityType: link.entityType,
        entityId: link.entityId,
        // entity โดนลบ/หาไม่เจอ → fallback id สั้น (ลิงก์ยังลบออกได้จาก UI)
        name: meta?.name ?? `${link.entityId.slice(0, 8)}…`,
        code: meta?.code ?? null,
      };
    });
  }

  /** validate ว่า entity ปลายทางมีจริง — 404 ต่อ type (DTO กัน type แปลกให้แล้ว) */
  private async assertEntityExists(entityType: RelationEntityType, entityId: string) {
    let found = 0;
    switch (entityType) {
      case 'character':
        found = await this.prisma.character.count({ where: { id: entityId } });
        break;
      case 'product':
        found = await this.prisma.product.count({ where: { id: entityId } });
        break;
      case 'client':
        found = await this.prisma.client.count({ where: { id: entityId } });
        break;
      case 'brand':
        found = await this.prisma.brand.count({ where: { id: entityId } });
        break;
    }
    if (!found) {
      const label: Record<RelationEntityType, string> = {
        character: 'ตัวละคร',
        product: 'สินค้า',
        client: 'ลูกค้า',
        brand: 'แบรนด์',
      };
      throw new NotFoundException(`ไม่พบ${label[entityType]}ที่เลือก`);
    }
  }

  // ─── Generation runs (chain §F.2) ────────────────────────────

  async createRun(versionId: string, dto: CreateGenerationRunDto, user: AuthUser, via = 'ui') {
    const version = await this.prisma.promptVersion.findUnique({ where: { id: versionId } });
    if (!version) throw new NotFoundException('ไม่พบ prompt version');

    const run = await this.prisma.promptGenerationRun.create({
      data: {
        promptVersionId: versionId,
        platform: dto.platform,
        modelVersion: dto.modelVersion,
        paramsUsed: dto.paramsUsed as Prisma.InputJsonValue | undefined,
        assetId: dto.assetId,
        qcScore: dto.qcScore,
        notes: dto.notes,
      },
    });
    await this.audit(user, via, 'run_create', version.promptId, {
      versionId,
      platform: dto.platform,
      qcScore: dto.qcScore ?? null,
      assetId: dto.assetId ?? null,
    });
    return run;
  }

  // ─── helpers ─────────────────────────────────────────────────

  private async ensureExists(id: string) {
    const prompt = await this.prisma.prompt.findUnique({ where: { id } });
    if (!prompt) throw new NotFoundException('ไม่พบ prompt');
    return prompt;
  }

  private audit(
    user: AuthUser,
    via: string,
    action: string,
    entityId: string,
    meta: object,
    entityType = 'prompt',
  ) {
    return this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        via,
        action,
        entityType,
        entityId,
        meta: meta as Prisma.InputJsonValue,
      },
    });
  }
}
