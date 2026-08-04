import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EpisodeStatus, Prisma, ShotStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/current-user.decorator';
import { ScopeService } from '../auth/scope.service';
import { CreateEpisodeDto, HandoffDto, UpdateEpisodeDto } from './dto/episode.dto';

// State machine — linear ตาม PRD v0.1 §12 (archive ได้จากทุกสถานะ)
const EPISODE_TRANSITIONS: Record<EpisodeStatus, EpisodeStatus[]> = {
  idea: ['script_draft', 'archived'],
  script_draft: ['script_review', 'archived'],
  script_review: ['script_approved', 'script_draft', 'archived'],
  script_approved: ['shot_breakdown', 'archived'],
  shot_breakdown: ['production', 'archived'],
  production: ['edited', 'archived'],
  edited: ['published', 'archived'],
  published: ['archived'],
  archived: [],
};

const EPISODE_SORT_FIELDS = ['episodeNumber', 'title', 'status', 'updatedAt'] as const;
export type EpisodeSortField = (typeof EPISODE_SORT_FIELDS)[number];

const SCRIPT_FIELDS = ['script', 'hook', 'conflict', 'twist', 'cta'] as const;

@Injectable()
export class EpisodesService {
  constructor(
    private prisma: PrismaService,
    private scope: ScopeService,
  ) {}

  async list(
    params: {
      q?: string;
      status?: EpisodeStatus;
      seriesId?: string;
      campaignId?: string;
      characterId?: string;
      season?: string;
      sortBy?: string;
      sortDir?: string;
      page?: number;
    },
    user: AuthUser,
  ) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const take = 20;
    const sortBy: EpisodeSortField = EPISODE_SORT_FIELDS.includes(
      params.sortBy as EpisodeSortField,
    )
      ? (params.sortBy as EpisodeSortField)
      : 'updatedAt';
    const sortDir: Prisma.SortOrder = params.sortDir === 'asc' ? 'asc' : 'desc';

    // row-level viewScope: 'own'/'team' = อีพีของตัวเอง (+ทีมเดียวกัน) + อีพีที่ยังไม่มีเจ้าของ (legacy/shared)
    const visibleIds = await this.scope.resolveVisibleUserIds(user, 'episode');
    // + อีพีนอก scope ที่ผู้ใช้ถูก assign Task ไว้ (entityType 'episode') — กันคลิกจาก task แล้ว 404
    const assignedIds = visibleIds ? await this.assignedEpisodeIds(user.id) : [];

    const where: Prisma.EpisodeWhereInput = {
      archivedAt: null,
      ...(visibleIds
        ? {
            AND: [
              {
                OR: [
                  { ownerId: { in: visibleIds } },
                  { ownerId: null },
                  ...(assignedIds.length ? [{ id: { in: assignedIds } }] : []),
                ],
              },
            ],
          }
        : {}),
      ...(params.status ? { status: params.status } : {}),
      // seriesId=none → ตอนที่ยังไม่ผูกซีรีส์ (ใช้ใน picker "ดึงตอนเข้าซีรีส์" ของ Series Hub)
      ...(params.seriesId ? { seriesId: params.seriesId === 'none' ? null : params.seriesId } : {}),
      ...(params.campaignId ? { campaignId: params.campaignId } : {}),
      ...(params.season ? { season: { contains: params.season, mode: 'insensitive' } } : {}),
      ...(params.characterId ? { characters: { some: { characterId: params.characterId } } } : {}),
      ...(params.q
        ? {
            OR: [
              { title: { contains: params.q, mode: 'insensitive' } },
              { displayCode: { contains: params.q, mode: 'insensitive' } },
              { logline: { contains: params.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.episode.findMany({
        where,
        orderBy: { [sortBy]: sortDir },
        skip: (page - 1) * take,
        take,
        include: {
          series: { select: { id: true, name: true } },
          campaign: { select: { id: true, name: true } },
          _count: { select: { characters: true, shots: true } },
        },
      }),
      this.prisma.episode.count({ where }),
    ]);

    // shot counts ต่อ status ของ episode ในหน้านี้
    const ids = rows.map((e) => e.id);
    const shotGroups = ids.length
      ? await this.prisma.shot.groupBy({
          by: ['episodeId', 'status'],
          where: { episodeId: { in: ids } },
          _count: { _all: true },
        })
      : [];
    const shotCountMap = new Map<string, Partial<Record<ShotStatus, number>>>();
    for (const g of shotGroups) {
      const entry = shotCountMap.get(g.episodeId) ?? {};
      entry[g.status] = g._count._all;
      shotCountMap.set(g.episodeId, entry);
    }

    // ownerId ไม่มี relation ไป User — batch fetch ชื่อผู้รับผิดชอบ
    const ownerMap = await this.fetchUserMap(rows.map((e) => e.ownerId));

    const items = rows.map((e) => {
      const byStatus = shotCountMap.get(e.id) ?? {};
      return {
        ...e,
        owner: e.ownerId ? (ownerMap.get(e.ownerId) ?? null) : null,
        characterCount: e._count.characters,
        shotCounts: {
          total: e._count.shots,
          approved: byStatus.approved ?? 0,
          byStatus,
        },
      };
    });
    return { items, total, page, pageSize: take };
  }

  // ส่ง user มาเมื่อเรียกจาก endpoint detail — เช็ค viewScope 'own' (internal call ไม่ต้องส่ง)
  async get(id: string, user?: AuthUser) {
    const episode = await this.prisma.episode.findUnique({
      where: { id },
      include: {
        series: true,
        campaign: true,
        location: true,
        characters: true,
        products: { include: { product: true } },
        shots: { orderBy: { shotNumber: 'asc' }, include: { characters: true } },
      },
    });
    if (!episode) throw new NotFoundException('ไม่พบ episode');

    // viewScope 'own'/'team': อีพีนอกชุดที่มองเห็น → 404 เหมือนไม่มีแถว (อีพีที่ยังไม่มีเจ้าของเห็นได้ทุกคน)
    // ยกเว้น: ผู้ใช้ถูก assign Task ของอีพีนี้ (entityType 'episode') → เปิดดูได้ กันคลิกจาก task แล้ว 404
    if (user) {
      const visibleIds = await this.scope.resolveVisibleUserIds(user, 'episode');
      if (visibleIds && episode.ownerId && !visibleIds.includes(episode.ownerId)) {
        const assigned = await this.prisma.task.count({
          where: { assigneeId: user.id, entityType: 'episode', entityId: id },
        });
        if (!assigned) throw new NotFoundException('ไม่พบ episode');
      }
    }

    // ดึง Character rows (join table ไม่มี relation ตรงถึง Character)
    const characterIds = new Set<string>();
    for (const c of episode.characters) characterIds.add(c.characterId);
    for (const s of episode.shots) for (const c of s.characters) characterIds.add(c.characterId);
    const characterRows = characterIds.size
      ? await this.prisma.character.findMany({
          where: { id: { in: [...characterIds] } },
          select: { id: true, displayCode: true, nameTh: true, nameEn: true, status: true },
        })
      : [];
    const charMap = new Map(characterRows.map((c) => [c.id, c]));

    const versionCount = await this.prisma.entityVersion.count({
      where: { entityType: 'episode_script', entityId: id },
    });

    const owner = episode.ownerId
      ? await this.prisma.user.findUnique({
          where: { id: episode.ownerId },
          select: { id: true, name: true },
        })
      : null;

    return {
      ...episode,
      owner,
      characters: episode.characters.map((link) => ({
        characterId: link.characterId,
        character: charMap.get(link.characterId) ?? null,
      })),
      shots: episode.shots.map((s) => ({
        ...s,
        characterIds: s.characters.map((c) => c.characterId),
      })),
      characterDetails: characterRows,
      scriptVersionCount: versionCount,
    };
  }

  async create(dto: CreateEpisodeDto, user: AuthUser, via = 'ui') {
    await this.validateRefs(dto);
    const displayCode = await this.generateDisplayCode();
    // default ownerId = ผู้สร้าง (เหมือน content) — กันอีพีไร้เจ้าของโผล่ให้ทุกคนใน scope own/team
    const episode = await this.prisma.episode.create({
      data: { ...dto, ownerId: user.id, displayCode },
    });
    await this.audit(user, via, 'create', episode.id, { displayCode });
    return episode;
  }

  async update(id: string, dto: UpdateEpisodeDto, user: AuthUser, via = 'ui') {
    const existing = await this.prisma.episode.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('ไม่พบ episode');

    // optimistic locking (§F.1 ข้อ 6)
    if (dto.expectedUpdatedAt && new Date(dto.expectedUpdatedAt).getTime() !== existing.updatedAt.getTime()) {
      throw new ConflictException('ข้อมูลถูกแก้ไขโดยคนอื่นแล้ว กรุณา reload');
    }

    await this.validateRefs(dto);
    const { expectedUpdatedAt: _e, ...fields } = dto;

    // script เปลี่ยน → auto-snapshot เป็น EntityVersion (§F.1 ข้อ 4)
    const scriptChanged = SCRIPT_FIELDS.some(
      (f) => fields[f] !== undefined && fields[f] !== existing[f],
    );

    const episode = await this.prisma.episode.update({
      where: { id },
      data: fields as Prisma.EpisodeUpdateInput,
    });

    let scriptVersion: string | undefined;
    if (scriptChanged) {
      const count = await this.prisma.entityVersion.count({
        where: { entityType: 'episode_script', entityId: id },
      });
      scriptVersion = `v${count + 1}`;
      await this.prisma.entityVersion.create({
        data: {
          entityType: 'episode_script',
          entityId: id,
          versionLabel: scriptVersion,
          snapshot: {
            script: episode.script,
            hook: episode.hook,
            conflict: episode.conflict,
            twist: episode.twist,
            cta: episode.cta,
          } as Prisma.InputJsonValue,
          createdBy: user.id,
        },
      });
    }

    await this.audit(user, via, 'update', id, {
      fields: Object.keys(fields),
      ...(scriptVersion ? { scriptVersion } : {}),
    });
    return { ...episode, scriptVersion };
  }

  listScriptVersions(id: string) {
    return this.prisma.entityVersion.findMany({
      where: { entityType: 'episode_script', entityId: id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async changeStatus(id: string, next: EpisodeStatus, user: AuthUser, via = 'ui') {
    const existing = await this.prisma.episode.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('ไม่พบ episode');

    if (!EPISODE_TRANSITIONS[existing.status].includes(next)) {
      throw new BadRequestException(`เปลี่ยน status ${existing.status} → ${next} ไม่ได้`);
    }

    // script_review → script_approved: ต้องมีสิทธิ์ Approve + ผ่าน UI เท่านั้น (§28.2)
    if (next === 'script_approved') {
      if (via !== 'ui') {
        throw new ForbiddenException('การ approve ทำได้ผ่าน UI โดยมนุษย์เท่านั้น');
      }
      const canApprove = await this.prisma.rolePermission.count({
        where: { module: 'episode', actions: { has: 'A' }, role: { key: { in: user.roles } } },
      });
      if (!canApprove) throw new ForbiddenException('ต้องมีสิทธิ์ Approve ใน module episode');
    }

    // script_approved → shot_breakdown: ต้องมีสิทธิ์ Create
    if (next === 'shot_breakdown') {
      const canCreate = await this.prisma.rolePermission.count({
        where: { module: 'episode', actions: { has: 'C' }, role: { key: { in: user.roles } } },
      });
      if (!canCreate) throw new ForbiddenException('ต้องมีสิทธิ์ Create ใน module episode');
    }

    const episode = await this.prisma.episode.update({
      where: { id },
      data: { status: next, ...(next === 'archived' ? { archivedAt: new Date() } : {}) },
    });

    // → script_review: แจ้งเตือน approver (creative_lead / qc_reviewer / admin)
    if (next === 'script_review') {
      await this.notifyRoles(
        ['creative_lead', 'qc_reviewer', 'admin'],
        'episode_review_request',
        id,
        `สคริปต์ ${episode.displayCode} "${episode.title}" ส่งเข้าตรวจแล้ว รอการอนุมัติ`,
      );
    }

    await this.audit(user, via, 'status_change', id, { from: existing.status, to: next });
    return episode;
  }

  // ─── Episode ↔ Character / Product links ─────────────────────

  async linkCharacter(id: string, characterId: string, user: AuthUser, via = 'ui') {
    await this.mustExist(id);
    const character = await this.prisma.character.findUnique({ where: { id: characterId } });
    if (!character) throw new NotFoundException('ไม่พบ character');
    await this.prisma.episodeCharacter.upsert({
      where: { episodeId_characterId: { episodeId: id, characterId } },
      create: { episodeId: id, characterId },
      update: {},
    });
    await this.audit(user, via, 'link_character', id, { characterId });
    return { ok: true };
  }

  async unlinkCharacter(id: string, characterId: string, user: AuthUser, via = 'ui') {
    await this.mustExist(id);
    await this.prisma.episodeCharacter.deleteMany({ where: { episodeId: id, characterId } });
    await this.audit(user, via, 'unlink_character', id, { characterId });
    return { ok: true };
  }

  async linkProduct(id: string, productId: string, user: AuthUser, via = 'ui') {
    await this.mustExist(id);
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('ไม่พบ product');
    await this.prisma.episodeProduct.upsert({
      where: { episodeId_productId: { episodeId: id, productId } },
      create: { episodeId: id, productId },
      update: {},
    });
    await this.audit(user, via, 'link_product', id, { productId });
    return { ok: true };
  }

  async unlinkProduct(id: string, productId: string, user: AuthUser, via = 'ui') {
    await this.mustExist(id);
    await this.prisma.episodeProduct.deleteMany({ where: { episodeId: id, productId } });
    await this.audit(user, via, 'unlink_product', id, { productId });
    return { ok: true };
  }

  // ─── Production Handoff (§E.2) ───────────────────────────────

  async handoff(id: string, dto: HandoffDto, user: AuthUser, via = 'ui') {
    const episode = await this.prisma.episode.findUnique({
      where: { id },
      include: { shots: { orderBy: { shotNumber: 'asc' } } },
    });
    if (!episode) throw new NotFoundException('ไม่พบ episode');
    if (episode.status !== 'shot_breakdown') {
      throw new BadRequestException(
        `Handoff ได้เฉพาะ episode ที่ status = shot_breakdown (ตอนนี้ ${episode.status})`,
      );
    }
    if (episode.shots.length === 0) {
      throw new BadRequestException('ยังไม่มี shot ใน episode นี้ — แตก shot list ก่อน handoff');
    }

    // validate assignees
    for (const [label, userId] of [
      ['operator', dto.operatorId],
      ['editor', dto.editorId],
    ] as const) {
      if (userId) {
        const found = await this.prisma.user.count({ where: { id: userId } });
        if (!found) throw new NotFoundException(`ไม่พบ user สำหรับ ${label}`);
      }
    }

    const pendingShots = episode.shots.filter(
      (s) => s.status === 'planned' || s.status === 'prompt_ready',
    );

    const taskRows: Prisma.TaskCreateManyInput[] = pendingShots.map((shot) => ({
      title: `Gen shot #${shot.shotNumber} — ${episode.title}`,
      entityType: 'shot',
      entityId: shot.id,
      assigneeId: dto.operatorId ?? null,
      priority: 'normal',
      createdFrom: 'handoff',
      createdBy: user.id,
    }));
    if (dto.editorId) {
      taskRows.push({
        title: `ตัดต่อ ${episode.displayCode} — ${episode.title}`,
        entityType: 'episode',
        entityId: episode.id,
        assigneeId: dto.editorId,
        priority: 'normal',
        createdFrom: 'handoff',
        createdBy: user.id,
      });
    }

    const notificationRows: Prisma.NotificationCreateManyInput[] = [];
    if (dto.operatorId && pendingShots.length) {
      notificationRows.push({
        userId: dto.operatorId,
        type: 'task_assigned',
        entityType: 'episode',
        entityId: episode.id,
        message: `คุณได้รับมอบหมายงาน generate ${pendingShots.length} shots ของ ${episode.displayCode} "${episode.title}"`,
      });
    }
    if (dto.editorId) {
      notificationRows.push({
        userId: dto.editorId,
        type: 'task_assigned',
        entityType: 'episode',
        entityId: episode.id,
        message: `คุณได้รับมอบหมายงานตัดต่อ ${episode.displayCode} "${episode.title}"`,
      });
    }

    const [taskResult] = await this.prisma.$transaction([
      this.prisma.task.createMany({ data: taskRows }),
      ...(notificationRows.length
        ? [this.prisma.notification.createMany({ data: notificationRows })]
        : []),
      this.prisma.episode.update({ where: { id }, data: { status: 'production' } }),
    ]);

    await this.audit(user, via, 'handoff', id, {
      taskCount: taskResult.count,
      shotCount: pendingShots.length,
      operatorId: dto.operatorId ?? null,
      editorId: dto.editorId ?? null,
    });

    return { taskCount: taskResult.count, shotCount: pendingShots.length, status: 'production' };
  }

  // ─── helpers ─────────────────────────────────────────────────

  private async mustExist(id: string) {
    const count = await this.prisma.episode.count({ where: { id } });
    if (!count) throw new NotFoundException('ไม่พบ episode');
  }

  // อีพีที่ผู้ใช้ถูก assign Task ไว้ (entityType 'episode') — ใช้ต่อยอด viewScope ให้เปิดจาก task ได้
  private async assignedEpisodeIds(userId: string): Promise<string[]> {
    const tasks = await this.prisma.task.findMany({
      where: { assigneeId: userId, entityType: 'episode' },
      select: { entityId: true },
    });
    return [...new Set(tasks.map((t) => t.entityId).filter((x): x is string => !!x))];
  }

  private async fetchUserMap(ids: (string | null)[]) {
    const unique = [...new Set(ids.filter((x): x is string => !!x))];
    const rows = unique.length
      ? await this.prisma.user.findMany({
          where: { id: { in: unique } },
          select: { id: true, name: true },
        })
      : [];
    return new Map(rows.map((u) => [u.id, u]));
  }

  private async validateRefs(dto: Partial<CreateEpisodeDto> & { ownerId?: string | null }) {
    if (dto.ownerId) {
      const found = await this.prisma.user.count({ where: { id: dto.ownerId } });
      if (!found) throw new NotFoundException('ไม่พบ user ที่เลือกเป็นผู้รับผิดชอบ');
    }
    if (dto.seriesId) {
      const found = await this.prisma.series.count({ where: { id: dto.seriesId } });
      if (!found) throw new NotFoundException('ไม่พบ series');
    }
    if (dto.campaignId) {
      const found = await this.prisma.campaign.count({ where: { id: dto.campaignId } });
      if (!found) throw new NotFoundException('ไม่พบ campaign');
    }
    if (dto.locationId) {
      const found = await this.prisma.location.count({ where: { id: dto.locationId } });
      if (!found) throw new NotFoundException('ไม่พบ location');
    }
  }

  private async generateDisplayCode(): Promise<string> {
    const count = await this.prisma.episode.count();
    return `EP-${String(count + 1).padStart(4, '0')}`;
  }

  private async notifyRoles(roleKeys: string[], type: string, episodeId: string, message: string) {
    const users = await this.prisma.user.findMany({
      where: {
        status: 'active',
        roleAssignments: { some: { role: { key: { in: roleKeys } } } },
      },
      select: { id: true },
    });
    if (!users.length) return;
    await this.prisma.notification.createMany({
      data: users.map((u) => ({
        userId: u.id,
        type,
        entityType: 'episode',
        entityId: episodeId,
        message,
      })),
    });
  }

  private audit(user: AuthUser, via: string, action: string, entityId: string, meta: object) {
    return this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        via,
        action,
        entityType: 'episode',
        entityId,
        meta: meta as Prisma.InputJsonValue,
      },
    });
  }
}
