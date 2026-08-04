import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ShotStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/current-user.decorator';
import { ScopeService } from '../auth/scope.service';
import { CreateShotDto, UpdateShotDto } from './dto/shot.dto';

// State machine ตาม PRD v0.1 §13
const SHOT_TRANSITIONS: Record<ShotStatus, ShotStatus[]> = {
  planned: ['prompt_ready'],
  prompt_ready: ['generating', 'planned'],
  generating: ['generated', 'prompt_ready'],
  generated: ['selected', 'rejected'],
  selected: ['edited', 'approved'],
  rejected: ['prompt_ready'], // regenerate ใหม่ได้
  edited: ['approved'],
  approved: [],
};

@Injectable()
export class ShotsService {
  constructor(
    private prisma: PrismaService,
    private scope: ScopeService,
  ) {}

  async list(
    params: {
      episodeId?: string;
      status?: ShotStatus;
      camera?: string;
      characterId?: string;
      q?: string;
      page?: number;
    },
    user: AuthUser,
  ) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const take = 50;
    // shot สืบทอด scope จาก episode: own/team = shot ของอีพีที่ตัวเอง (+ทีม) รับผิดชอบ + อีพีไร้เจ้าของ
    const visibleIds = await this.scope.resolveVisibleUserIds(user, 'episode');
    // + shot ของอีพีที่ผู้ใช้ถูก assign Task ไว้ (entityType 'episode') — กันคลิกจาก task แล้ว 404
    const assignedIds = visibleIds ? await this.assignedEpisodeIds(user.id) : [];
    const where: Prisma.ShotWhereInput = {
      ...(params.episodeId ? { episodeId: params.episodeId } : {}),
      ...(visibleIds
        ? {
            episode: {
              OR: [
                { ownerId: { in: visibleIds } },
                { ownerId: null },
                ...(assignedIds.length ? [{ id: { in: assignedIds } }] : []),
              ],
            },
          }
        : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.camera ? { camera: params.camera } : {}),
      ...(params.characterId ? { characters: { some: { characterId: params.characterId } } } : {}),
      ...(params.q
        ? {
            OR: [
              { action: { contains: params.q, mode: 'insensitive' } },
              { dialogue: { contains: params.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.shot.findMany({
        where,
        orderBy: params.episodeId ? { shotNumber: 'asc' } : [{ updatedAt: 'desc' }],
        skip: (page - 1) * take,
        take,
        include: {
          episode: { select: { id: true, displayCode: true, title: true } },
          characters: true,
        },
      }),
      this.prisma.shot.count({ where }),
    ]);
    const items = rows.map((s) => ({ ...s, characterIds: s.characters.map((c) => c.characterId) }));
    return { items, total, page, pageSize: take };
  }

  async create(episodeId: string, dto: CreateShotDto, user: AuthUser, via = 'ui') {
    const episode = await this.prisma.episode.findUnique({ where: { id: episodeId } });
    if (!episode) throw new NotFoundException('ไม่พบ episode');

    const { characterIds, ...fields } = dto;
    const max = await this.prisma.shot.aggregate({
      where: { episodeId },
      _max: { shotNumber: true },
    });
    const shotNumber = (max._max.shotNumber ?? 0) + 1;

    const shot = await this.prisma.shot.create({
      data: {
        ...fields,
        episodeId,
        shotNumber,
        ...(characterIds?.length
          ? { characters: { create: characterIds.map((characterId) => ({ characterId })) } }
          : {}),
      },
      include: { characters: true },
    });
    await this.audit(user, via, 'create', shot.id, { episodeId, shotNumber });
    return { ...shot, characterIds: shot.characters.map((c) => c.characterId) };
  }

  async update(id: string, dto: UpdateShotDto, user: AuthUser, via = 'ui') {
    const existing = await this.prisma.shot.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('ไม่พบ shot');

    const { characterIds, ...fields } = dto;
    const ops: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.shot.update({ where: { id }, data: fields as Prisma.ShotUpdateInput }),
    ];
    if (characterIds) {
      // sync ตัวละครใน shot ให้ตรงกับที่ส่งมา
      ops.push(this.prisma.shotCharacter.deleteMany({ where: { shotId: id } }));
      if (characterIds.length) {
        ops.push(
          this.prisma.shotCharacter.createMany({
            data: characterIds.map((characterId) => ({ shotId: id, characterId })),
            skipDuplicates: true,
          }),
        );
      }
    }
    await this.prisma.$transaction(ops);
    await this.audit(user, via, 'update', id, { fields: Object.keys(fields) });

    const shot = await this.prisma.shot.findUnique({ where: { id }, include: { characters: true } });
    return { ...shot!, characterIds: shot!.characters.map((c) => c.characterId) };
  }

  async changeStatus(id: string, next: ShotStatus, user: AuthUser, via = 'ui') {
    const existing = await this.prisma.shot.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('ไม่พบ shot');

    if (!SHOT_TRANSITIONS[existing.status].includes(next)) {
      throw new BadRequestException(`เปลี่ยน status ${existing.status} → ${next} ไม่ได้`);
    }

    // approve shot = การอนุมัติโดยมนุษย์เท่านั้น (§28.2)
    if (next === 'approved') {
      if (via !== 'ui') {
        throw new ForbiddenException('การ approve ทำได้ผ่าน UI โดยมนุษย์เท่านั้น');
      }
      const canApprove = await this.prisma.rolePermission.count({
        where: { module: 'episode', actions: { has: 'A' }, role: { key: { in: user.roles } } },
      });
      if (!canApprove) throw new ForbiddenException('ต้องมีสิทธิ์ Approve ใน module episode');
    }

    const shot = await this.prisma.shot.update({ where: { id }, data: { status: next } });
    await this.audit(user, via, 'status_change', id, { from: existing.status, to: next });
    return shot;
  }

  async remove(id: string, user: AuthUser, via = 'ui') {
    const existing = await this.prisma.shot.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('ไม่พบ shot');
    if (existing.status !== 'planned') {
      throw new BadRequestException('ลบได้เฉพาะ shot ที่ status = planned');
    }
    await this.prisma.$transaction([
      this.prisma.shotCharacter.deleteMany({ where: { shotId: id } }),
      this.prisma.shot.delete({ where: { id } }),
    ]);
    await this.audit(user, via, 'delete', id, {
      episodeId: existing.episodeId,
      shotNumber: existing.shotNumber,
    });
    return { ok: true };
  }

  async reorder(episodeId: string, shotIds: string[], user: AuthUser, via = 'ui') {
    const shots = await this.prisma.shot.findMany({
      where: { episodeId },
      select: { id: true },
    });
    if (!shots.length) throw new NotFoundException('ไม่พบ shot ใน episode นี้');

    const currentIds = new Set(shots.map((s) => s.id));
    const incoming = new Set(shotIds);
    if (currentIds.size !== incoming.size || [...currentIds].some((sid) => !incoming.has(sid))) {
      throw new BadRequestException('shotIds ต้องครบทุก shot ของ episode และไม่ซ้ำ');
    }

    await this.prisma.$transaction(
      shotIds.map((sid, idx) =>
        this.prisma.shot.update({ where: { id: sid }, data: { shotNumber: idx + 1 } }),
      ),
    );
    await this.audit(user, via, 'reorder', episodeId, { shotIds });
    return { ok: true };
  }

  // อีพีที่ผู้ใช้ถูก assign Task ไว้ (entityType 'episode') — ต่อยอด viewScope ให้เปิดจาก task ได้
  private async assignedEpisodeIds(userId: string): Promise<string[]> {
    const tasks = await this.prisma.task.findMany({
      where: { assigneeId: userId, entityType: 'episode' },
      select: { entityId: true },
    });
    return [...new Set(tasks.map((t) => t.entityId).filter((x): x is string => !!x))];
  }

  private audit(user: AuthUser, via: string, action: string, entityId: string, meta: object) {
    return this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        via,
        action,
        entityType: 'shot',
        entityId,
        meta: meta as Prisma.InputJsonValue,
      },
    });
  }
}
