import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/current-user.decorator';

// entityType ที่ใช้ผูก asset ของแต่ละ section (polymorphic assetLink)
export const WARDROBE_ENTITY_TYPE = 'character_wardrobe';
export const EXPRESSION_ENTITY_TYPE = 'character_expression';
export const POSE_ENTITY_TYPE = 'character_pose';

export interface CreateRelationshipInput {
  toCharacterId: string;
  relationType: string;
  notes?: string;
}
export interface UpdateRelationshipInput {
  relationType?: string;
  notes?: string | null;
}
export interface CreateSectionItemInput {
  name: string;
  occasion?: string;
  description?: string;
}
export interface UpdateSectionItemInput {
  name?: string;
  occasion?: string | null;
  description?: string | null;
  sortOrder?: number;
}

@Injectable()
export class CharacterSectionsService {
  constructor(private prisma: PrismaService) {}

  private async ensureCharacter(id: string) {
    const found = await this.prisma.character.count({ where: { id } });
    if (!found) throw new NotFoundException('ไม่พบ character');
  }

  /** map entityId → assetId ของรูป (image, ไม่ archived) ต่อ entity — batch เดียว
   *  cover: รูป standard_image (ถ้ามี) > รูปเก่าสุด / standard: เฉพาะรูป standard_image */
  private async coverAssetMap(
    entityType: string,
    entityIds: string[],
  ): Promise<{
    cover: Map<string, string>;
    count: Map<string, number>;
    standard: Map<string, string>;
  }> {
    const cover = new Map<string, string>();
    const count = new Map<string, number>();
    const standard = new Map<string, string>();
    if (entityIds.length === 0) return { cover, count, standard };
    const links = await this.prisma.assetLink.findMany({
      where: {
        entityType,
        entityId: { in: entityIds },
        asset: { archivedAt: null, mimeType: { startsWith: 'image/' } },
      },
      select: {
        entityId: true,
        assetId: true,
        linkRole: true,
        asset: { select: { createdAt: true } },
      },
      orderBy: { asset: { createdAt: 'asc' } },
    });
    for (const l of links) {
      count.set(l.entityId, (count.get(l.entityId) ?? 0) + 1);
      if (!cover.has(l.entityId)) cover.set(l.entityId, l.assetId); // ตัวแรก (เก่าสุด) = cover
      if (l.linkRole === 'standard_image' && !standard.has(l.entityId)) {
        standard.set(l.entityId, l.assetId);
      }
    }
    // มีรูปมาตรฐาน = ใช้เป็น cover ของการ์ด (รูปนิ่งประจำรายการชนะรูปเก่าสุด)
    for (const [entityId, assetId] of standard) cover.set(entityId, assetId);
    return { cover, count, standard };
  }

  private audit(
    user: AuthUser,
    action: string,
    entityType: string,
    entityId: string,
    meta: object,
  ) {
    return this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        via: 'ui',
        action,
        entityType,
        entityId,
        meta: meta as Prisma.InputJsonValue,
      },
    });
  }

  // ─── Relationships ─────────────────────────────────────────

  /** list ทั้งสองทิศ (from + to) พร้อมข้อมูลตัวละครอีกฝั่ง + รูป primary_reference */
  async listRelationships(characterId: string) {
    await this.ensureCharacter(characterId);
    const rows = await this.prisma.characterRelationship.findMany({
      where: { OR: [{ fromCharacterId: characterId }, { toCharacterId: characterId }] },
      orderBy: { createdAt: 'asc' },
    });

    const otherIds = [
      ...new Set(
        rows.map((r) => (r.fromCharacterId === characterId ? r.toCharacterId : r.fromCharacterId)),
      ),
    ];
    const [others, thumbs] = await Promise.all([
      this.prisma.character.findMany({
        where: { id: { in: otherIds } },
        select: { id: true, displayCode: true, nameTh: true, nameEn: true },
      }),
      otherIds.length
        ? this.prisma.assetLink.findMany({
            where: {
              entityType: 'character',
              entityId: { in: otherIds },
              linkRole: 'primary_reference',
              asset: { archivedAt: null, mimeType: { startsWith: 'image/' } },
            },
            select: { entityId: true, assetId: true },
          })
        : Promise.resolve([] as { entityId: string; assetId: string }[]),
    ]);
    const byId = new Map(others.map((o) => [o.id, o]));
    const thumbById = new Map(thumbs.map((t) => [t.entityId, t.assetId] as const));

    return rows.map((r) => {
      const direction = r.fromCharacterId === characterId ? 'outgoing' : 'incoming';
      const otherId = direction === 'outgoing' ? r.toCharacterId : r.fromCharacterId;
      const o = byId.get(otherId);
      return {
        id: r.id,
        relationType: r.relationType,
        notes: r.notes,
        direction,
        createdAt: r.createdAt,
        other: o
          ? {
              id: o.id,
              displayCode: o.displayCode,
              nameTh: o.nameTh,
              nameEn: o.nameEn,
              thumbAssetId: thumbById.get(o.id) ?? null,
            }
          : null,
      };
    });
  }

  async createRelationship(characterId: string, dto: CreateRelationshipInput, user: AuthUser) {
    await this.ensureCharacter(characterId);
    if (dto.toCharacterId === characterId) {
      throw new BadRequestException('เชื่อมความสัมพันธ์กับตัวเองไม่ได้');
    }
    const target = await this.prisma.character.count({ where: { id: dto.toCharacterId } });
    if (!target) throw new NotFoundException('ไม่พบตัวละครปลายทาง');

    const rel = await this.prisma.characterRelationship.create({
      data: {
        fromCharacterId: characterId,
        toCharacterId: dto.toCharacterId,
        relationType: dto.relationType.trim(),
        notes: dto.notes?.trim() || null,
      },
    });
    await this.audit(user, 'create', 'character_relationship', rel.id, {
      fromCharacterId: characterId,
      toCharacterId: dto.toCharacterId,
      relationType: rel.relationType,
    });
    return rel;
  }

  async updateRelationship(
    characterId: string,
    relId: string,
    dto: UpdateRelationshipInput,
    user: AuthUser,
  ) {
    const existing = await this.prisma.characterRelationship.findUnique({ where: { id: relId } });
    if (
      !existing ||
      (existing.fromCharacterId !== characterId && existing.toCharacterId !== characterId)
    ) {
      throw new NotFoundException('ไม่พบความสัมพันธ์นี้');
    }
    const rel = await this.prisma.characterRelationship.update({
      where: { id: relId },
      data: {
        ...(dto.relationType != null ? { relationType: dto.relationType.trim() } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
      },
    });
    await this.audit(user, 'update', 'character_relationship', relId, {});
    return rel;
  }

  async deleteRelationship(characterId: string, relId: string, user: AuthUser) {
    const existing = await this.prisma.characterRelationship.findUnique({ where: { id: relId } });
    if (
      !existing ||
      (existing.fromCharacterId !== characterId && existing.toCharacterId !== characterId)
    ) {
      throw new NotFoundException('ไม่พบความสัมพันธ์นี้');
    }
    await this.prisma.characterRelationship.delete({ where: { id: relId } });
    await this.audit(user, 'delete', 'character_relationship', relId, {});
    return { ok: true };
  }

  // ─── Wardrobe ──────────────────────────────────────────────

  async listWardrobe(characterId: string) {
    await this.ensureCharacter(characterId);
    const items = await this.prisma.characterWardrobe.findMany({
      where: { characterId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const { cover, count, standard } = await this.coverAssetMap(
      WARDROBE_ENTITY_TYPE,
      items.map((i) => i.id),
    );
    return items.map((i) => ({
      ...i,
      coverAssetId: cover.get(i.id) ?? null,
      imageCount: count.get(i.id) ?? 0,
      standardAssetId: standard.get(i.id) ?? null,
    }));
  }

  async createWardrobe(characterId: string, dto: CreateSectionItemInput, user: AuthUser) {
    await this.ensureCharacter(characterId);
    const max = await this.prisma.characterWardrobe.aggregate({
      where: { characterId },
      _max: { sortOrder: true },
    });
    const item = await this.prisma.characterWardrobe.create({
      data: {
        characterId,
        name: dto.name.trim(),
        occasion: dto.occasion?.trim() || null,
        description: dto.description?.trim() || null,
        sortOrder: (max._max.sortOrder ?? -1) + 1,
      },
    });
    await this.audit(user, 'create', 'character_wardrobe', item.id, { characterId });
    return item;
  }

  async updateWardrobe(
    characterId: string,
    wid: string,
    dto: UpdateSectionItemInput,
    user: AuthUser,
  ) {
    await this.ensureSectionItem('characterWardrobe', characterId, wid);
    const item = await this.prisma.characterWardrobe.update({
      where: { id: wid },
      data: {
        ...(dto.name != null ? { name: dto.name.trim() } : {}),
        ...(dto.occasion !== undefined ? { occasion: dto.occasion?.trim() || null } : {}),
        ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
        ...(dto.sortOrder != null ? { sortOrder: dto.sortOrder } : {}),
      },
    });
    await this.audit(user, 'update', 'character_wardrobe', wid, {});
    return item;
  }

  async deleteWardrobe(characterId: string, wid: string, user: AuthUser) {
    await this.ensureSectionItem('characterWardrobe', characterId, wid);
    await this.prisma.assetLink.deleteMany({
      where: { entityType: WARDROBE_ENTITY_TYPE, entityId: wid },
    });
    await this.prisma.characterWardrobe.delete({ where: { id: wid } });
    await this.audit(user, 'delete', 'character_wardrobe', wid, {});
    return { ok: true };
  }

  // ─── Expression ────────────────────────────────────────────

  async listExpressions(characterId: string) {
    await this.ensureCharacter(characterId);
    const items = await this.prisma.characterExpression.findMany({
      where: { characterId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const { cover, count, standard } = await this.coverAssetMap(
      EXPRESSION_ENTITY_TYPE,
      items.map((i) => i.id),
    );
    return items.map((i) => ({
      ...i,
      coverAssetId: cover.get(i.id) ?? null,
      imageCount: count.get(i.id) ?? 0,
      standardAssetId: standard.get(i.id) ?? null,
    }));
  }

  async createExpression(characterId: string, dto: CreateSectionItemInput, user: AuthUser) {
    await this.ensureCharacter(characterId);
    const max = await this.prisma.characterExpression.aggregate({
      where: { characterId },
      _max: { sortOrder: true },
    });
    const item = await this.prisma.characterExpression.create({
      data: {
        characterId,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        sortOrder: (max._max.sortOrder ?? -1) + 1,
      },
    });
    await this.audit(user, 'create', 'character_expression', item.id, { characterId });
    return item;
  }

  async updateExpression(
    characterId: string,
    eid: string,
    dto: UpdateSectionItemInput,
    user: AuthUser,
  ) {
    await this.ensureSectionItem('characterExpression', characterId, eid);
    const item = await this.prisma.characterExpression.update({
      where: { id: eid },
      data: {
        ...(dto.name != null ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
        ...(dto.sortOrder != null ? { sortOrder: dto.sortOrder } : {}),
      },
    });
    await this.audit(user, 'update', 'character_expression', eid, {});
    return item;
  }

  async deleteExpression(characterId: string, eid: string, user: AuthUser) {
    await this.ensureSectionItem('characterExpression', characterId, eid);
    await this.prisma.assetLink.deleteMany({
      where: { entityType: EXPRESSION_ENTITY_TYPE, entityId: eid },
    });
    await this.prisma.characterExpression.delete({ where: { id: eid } });
    await this.audit(user, 'delete', 'character_expression', eid, {});
    return { ok: true };
  }

  // ─── Pose (ท่าโพส — Character Sheet) ───────────────────────
  // mirror expression ทุกอย่าง: CRUD + sortOrder + cover/standard image ผ่าน AssetLink

  async listPoses(characterId: string) {
    await this.ensureCharacter(characterId);
    const items = await this.prisma.characterPose.findMany({
      where: { characterId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const { cover, count, standard } = await this.coverAssetMap(
      POSE_ENTITY_TYPE,
      items.map((i) => i.id),
    );
    return items.map((i) => ({
      ...i,
      coverAssetId: cover.get(i.id) ?? null,
      imageCount: count.get(i.id) ?? 0,
      standardAssetId: standard.get(i.id) ?? null,
    }));
  }

  async createPose(characterId: string, dto: CreateSectionItemInput, user: AuthUser) {
    await this.ensureCharacter(characterId);
    const max = await this.prisma.characterPose.aggregate({
      where: { characterId },
      _max: { sortOrder: true },
    });
    const item = await this.prisma.characterPose.create({
      data: {
        characterId,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        sortOrder: (max._max.sortOrder ?? -1) + 1,
      },
    });
    await this.audit(user, 'create', 'character_pose', item.id, { characterId });
    return item;
  }

  async updatePose(characterId: string, pid: string, dto: UpdateSectionItemInput, user: AuthUser) {
    await this.ensureSectionItem('characterPose', characterId, pid);
    const item = await this.prisma.characterPose.update({
      where: { id: pid },
      data: {
        ...(dto.name != null ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
        ...(dto.sortOrder != null ? { sortOrder: dto.sortOrder } : {}),
      },
    });
    await this.audit(user, 'update', 'character_pose', pid, {});
    return item;
  }

  async deletePose(characterId: string, pid: string, user: AuthUser) {
    await this.ensureSectionItem('characterPose', characterId, pid);
    await this.prisma.assetLink.deleteMany({
      where: { entityType: POSE_ENTITY_TYPE, entityId: pid },
    });
    await this.prisma.characterPose.delete({ where: { id: pid } });
    await this.audit(user, 'delete', 'character_pose', pid, {});
    return { ok: true };
  }

  private async ensureSectionItem(
    model: 'characterWardrobe' | 'characterExpression' | 'characterPose',
    characterId: string,
    id: string,
  ) {
    const row =
      model === 'characterWardrobe'
        ? await this.prisma.characterWardrobe.findUnique({ where: { id } })
        : model === 'characterExpression'
          ? await this.prisma.characterExpression.findUnique({ where: { id } })
          : await this.prisma.characterPose.findUnique({ where: { id } });
    if (!row || row.characterId !== characterId) {
      throw new NotFoundException('ไม่พบรายการนี้');
    }
  }
}
