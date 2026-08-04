import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/current-user.decorator';

@Injectable()
export class TagsService {
  constructor(private prisma: PrismaService) {}

  /** GET /tags — รายชื่อ tag + จำนวนที่ถูกใช้ (กรอง entityType ได้) */
  async list(q?: string, entityType?: string) {
    const tags = await this.prisma.tag.findMany({
      where: q ? { name: { contains: q, mode: 'insensitive' } } : {},
      orderBy: { name: 'asc' },
    });
    if (tags.length === 0) return [];
    const counts = await this.prisma.entityTag.groupBy({
      by: ['tagId'],
      where: {
        tagId: { in: tags.map((t) => t.id) },
        ...(entityType ? { entityType } : {}),
      },
      _count: { _all: true },
    });
    const countByTag = new Map(counts.map((c) => [c.tagId, c._count._all]));
    return tags
      .map((t) => ({ id: t.id, name: t.name, useCount: countByTag.get(t.id) ?? 0 }))
      .sort((a, b) => b.useCount - a.useCount || a.name.localeCompare(b.name, 'th'));
  }

  /** POST /characters/:id/tags — get-or-create tag (case-insensitive) แล้ว link (idempotent) */
  async addToCharacter(characterId: string, rawName: string, user: AuthUser) {
    const name = rawName.trim();
    if (!name) throw new BadRequestException('ชื่อ tag ห้ามว่าง');
    await this.ensureCharacter(characterId);

    let tag = await this.prisma.tag.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
    });
    if (!tag) {
      try {
        tag = await this.prisma.tag.create({ data: { name } });
      } catch (err) {
        // unique race — มีคนสร้างชื่อเดียวกันพอดี ให้หยิบของเดิมมาใช้
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          tag = await this.prisma.tag.findFirstOrThrow({
            where: { name: { equals: name, mode: 'insensitive' } },
          });
        } else {
          throw err;
        }
      }
    }

    await this.prisma.entityTag.upsert({
      where: {
        tagId_entityType_entityId: { tagId: tag.id, entityType: 'character', entityId: characterId },
      },
      update: {},
      create: { tagId: tag.id, entityType: 'character', entityId: characterId },
    });
    await this.audit(user, 'tag_add', characterId, { tagId: tag.id, name: tag.name });
    return this.characterTags(characterId);
  }

  /** DELETE /characters/:id/tags/:tagId */
  async removeFromCharacter(characterId: string, tagId: string, user: AuthUser) {
    await this.ensureCharacter(characterId);
    const { count } = await this.prisma.entityTag.deleteMany({
      where: { tagId, entityType: 'character', entityId: characterId },
    });
    if (count > 0) {
      await this.audit(user, 'tag_remove', characterId, { tagId });
    }
    return this.characterTags(characterId);
  }

  private async characterTags(characterId: string) {
    const links = await this.prisma.entityTag.findMany({
      where: { entityType: 'character', entityId: characterId },
      include: { tag: true },
    });
    return {
      tags: links
        .map((l) => ({ id: l.tag.id, name: l.tag.name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'th')),
    };
  }

  private async ensureCharacter(id: string) {
    const found = await this.prisma.character.count({ where: { id } });
    if (!found) throw new NotFoundException('ไม่พบ character');
  }

  private audit(user: AuthUser, action: string, entityId: string, meta: object) {
    return this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        via: 'ui',
        action,
        entityType: 'character',
        entityId,
        meta: meta as Prisma.InputJsonValue,
      },
    });
  }
}
