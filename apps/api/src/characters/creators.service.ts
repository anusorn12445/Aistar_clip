import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/current-user.decorator';

// ข้อมูล contact ของผู้สร้าง — ทุก field แก้ได้ผ่าน PATCH
export interface CreatorFields {
  name?: string;
  phone?: string;
  line?: string;
  email?: string;
  portfolio?: string;
  rateNote?: string;
  notes?: string;
}

@Injectable()
export class CreatorsService {
  constructor(private prisma: PrismaService) {}

  /** GET /creators — รายชื่อผู้สร้าง + จำนวน character ที่ทำ (กรองชื่อด้วย q ได้) */
  async list(q?: string) {
    const creators = await this.prisma.creator.findMany({
      where: q ? { name: { contains: q, mode: 'insensitive' } } : {},
      orderBy: { name: 'asc' },
    });
    if (creators.length === 0) return [];
    const counts = await this.prisma.character.groupBy({
      by: ['creatorId'],
      where: { creatorId: { in: creators.map((c) => c.id) } },
      _count: { _all: true },
    });
    const countByCreator = new Map(counts.map((c) => [c.creatorId, c._count._all]));
    return creators.map((c) => ({ ...c, characterCount: countByCreator.get(c.id) ?? 0 }));
  }

  /** GET /creators/:id — ผู้สร้าง + รายชื่อ character ที่ทำ */
  async get(id: string) {
    const creator = await this.prisma.creator.findUnique({
      where: { id },
      include: {
        characters: {
          select: { id: true, displayCode: true, nameTh: true, status: true },
          orderBy: { updatedAt: 'desc' },
        },
      },
    });
    if (!creator) throw new NotFoundException('ไม่พบผู้สร้างนี้');
    return creator;
  }

  async create(dto: CreatorFields & { name: string }, user: AuthUser) {
    const creator = await this.prisma.creator.create({ data: dto });
    await this.audit(user, 'create', creator.id, { name: creator.name });
    return creator;
  }

  async update(id: string, dto: CreatorFields, user: AuthUser) {
    const found = await this.prisma.creator.count({ where: { id } });
    if (!found) throw new NotFoundException('ไม่พบผู้สร้างนี้');
    const creator = await this.prisma.creator.update({ where: { id }, data: dto });
    await this.audit(user, 'update', id, { fields: Object.keys(dto) });
    return creator;
  }

  private audit(user: AuthUser, action: string, entityId: string, meta: object) {
    return this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        via: 'ui',
        action,
        entityType: 'creator',
        entityId,
        meta: meta as Prisma.InputJsonValue,
      },
    });
  }
}
