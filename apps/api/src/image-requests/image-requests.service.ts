import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ImageRequest, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/current-user.decorator';
import { ScopeService } from '../auth/scope.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  ChangeImageRequestStatusDto,
  CreateImageRequestDto,
  UpdateImageRequestDto,
} from './dto/image-request.dto';

// State machine — งานภาพ: brief → assign → produce → review → (revision ↔) → approved
// cancelled ได้จากทุกสถานะที่ยังไม่จบ (approved/cancelled = terminal)
const TRANSITIONS: Record<string, string[]> = {
  open: ['in_progress', 'cancelled'],
  in_progress: ['review', 'cancelled'],
  review: ['revision', 'approved', 'cancelled'],
  revision: ['in_progress', 'review', 'cancelled'],
  approved: [],
  cancelled: [],
};

// ป้ายสถานะภาษาไทย — mirror web IMAGE_REQUEST_STATUS (lib/api.ts) สำหรับข้อความแจ้งเตือน
const STATUS_LABEL_TH: Record<string, string> = {
  open: 'เปิด',
  in_progress: 'กำลังทำ',
  review: 'รอรีวิว',
  revision: 'แก้ไข',
  approved: 'อนุมัติแล้ว',
  cancelled: 'ยกเลิก',
};

export interface ListImageRequestsParams {
  q?: string;
  status?: string;
  assigneeId?: string; // uuid หรือ 'me'
  requesterId?: string; // uuid หรือ 'me'
  imageType?: string;
  priority?: string;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class ImageRequestsService {
  constructor(
    private prisma: PrismaService,
    private scope: ScopeService,
    private notifications: NotificationsService,
  ) {}

  // ── LIST — apply Visibility Scope (module 'image_request': own = ผู้ขอ/ผู้รับผิดชอบ) ──
  async list(params: ListImageRequestsParams, user: AuthUser) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const take = Math.min(Math.max(params.pageSize ?? 50, 1), 100);
    const resolveMe = (v?: string) => (v === 'me' ? user.id : v);

    const visibleIds = await this.scope.resolveVisibleUserIds(user, 'image_request');

    const where: Prisma.ImageRequestWhereInput = {
      ...(params.status ? { status: params.status } : {}),
      ...(params.assigneeId ? { assigneeId: resolveMe(params.assigneeId) } : {}),
      ...(params.requesterId ? { requesterId: resolveMe(params.requesterId) } : {}),
      ...(params.imageType ? { imageType: params.imageType } : {}),
      ...(params.priority ? { priority: params.priority } : {}),
      ...(params.q
        ? {
            OR: [
              { title: { contains: params.q, mode: 'insensitive' } },
              { displayCode: { contains: params.q, mode: 'insensitive' } },
            ],
          }
        : {}),
      // row-level scope: 'own'/'team' → เห็นเฉพาะที่คนในชุดที่มองเห็นขอหรือได้รับมอบหมาย
      ...(visibleIds
        ? { AND: [{ OR: [{ requesterId: { in: visibleIds } }, { assigneeId: { in: visibleIds } }] }] }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.imageRequest.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * take,
        take,
      }),
      this.prisma.imageRequest.count({ where }),
    ]);

    const ids = rows.map((r) => r.id);
    const [thumbMap, countMap, nameById] = await Promise.all([
      this.latestVersionMap(ids),
      this.versionCounts(ids),
      this.userNames(rows.flatMap((r) => [r.requesterId, ...(r.assigneeId ? [r.assigneeId] : [])])),
    ]);

    const items = rows.map((r) => ({
      ...r,
      requesterName: nameById.get(r.requesterId) ?? null,
      assigneeName: r.assigneeId ? (nameById.get(r.assigneeId) ?? null) : null,
      latestVersionAssetId: thumbMap.get(r.id) ?? null,
      versionCount: countMap.get(r.id) ?? 0,
    }));

    return { items, total, page, pageSize: take };
  }

  // ── GET — scope-checked (own + ไม่ใช่ผู้ขอ/ผู้รับผิดชอบ → 404 เหมือนไม่มีแถว) ──
  async get(id: string, user: AuthUser) {
    const req = await this.findVisible(id, user);

    // เวอร์ชันภาพ = AssetLink entityType 'image_request' — ใหม่สุดก่อน
    const links = await this.prisma.assetLink.findMany({
      where: { entityType: 'image_request', entityId: id, asset: { archivedAt: null } },
      include: { asset: true },
    });
    const versions = links
      .map((l) => l.asset)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((a) => ({
        id: a.id,
        originalFilename: a.originalFilename,
        mimeType: a.mimeType,
        fileSize: a.fileSize,
        width: a.width,
        height: a.height,
        uploadedBy: a.uploadedBy,
        createdAt: a.createdAt,
      }));

    // คอมเมนต์ = Postit polymorphic (entityType 'image_request')
    const postits = await this.prisma.postit.findMany({
      where: { entityType: 'image_request', entityId: id },
      orderBy: { createdAt: 'asc' },
    });

    const [brand, targetLabel, nameById] = await Promise.all([
      req.brandId
        ? this.prisma.brand.findUnique({ where: { id: req.brandId }, select: { id: true, name: true } })
        : null,
      this.targetLabel(req.entityType, req.entityId),
      this.userNames([
        req.requesterId,
        ...(req.assigneeId ? [req.assigneeId] : []),
        ...(req.approvedBy ? [req.approvedBy] : []),
        ...versions.map((v) => v.uploadedBy),
        ...postits.map((p) => p.createdBy),
      ]),
    ]);

    return {
      ...req,
      requesterName: nameById.get(req.requesterId) ?? null,
      assigneeName: req.assigneeId ? (nameById.get(req.assigneeId) ?? null) : null,
      approvedByName: req.approvedBy ? (nameById.get(req.approvedBy) ?? null) : null,
      brand,
      targetLabel,
      versions: versions.map((v) => ({
        ...v,
        uploadedByName: nameById.get(v.uploadedBy) ?? null,
      })),
      comments: postits.map((p) => ({
        id: p.id,
        content: p.content,
        createdBy: p.createdBy,
        createdByName: nameById.get(p.createdBy) ?? null,
        createdAt: p.createdAt,
      })),
    };
  }

  // ── CREATE — requester = current user, auto IMG-xxxx ─────────
  async create(dto: CreateImageRequestDto, user: AuthUser, via = 'ui') {
    await this.assertBrand(dto.brandId);
    this.assertTargetPair(dto.entityType, dto.entityId);
    await this.assertTarget(dto.entityType, dto.entityId);
    await this.assertUser(dto.assigneeId, 'ไม่พบผู้รับผิดชอบที่เลือก');

    // displayCode @unique — count()+1 อาจชนกันเมื่อสร้างพร้อมกัน (P2002)
    // → retry สร้างโค้ดใหม่สูงสุด 5 ครั้ง (mirror กติกา unique-conflict ที่ users.service ใช้)
    let req: ImageRequest | undefined;
    for (let attempt = 0; attempt < 5; attempt++) {
      const displayCode = await this.generateDisplayCode();
      try {
        req = await this.prisma.imageRequest.create({
          data: {
            displayCode,
            title: dto.title,
            imageType: dto.imageType,
            platform: dto.platform,
            sizeNote: dto.sizeNote,
            copyText: dto.copyText,
            brief: dto.brief,
            brandId: dto.brandId,
            entityType: dto.entityType,
            entityId: dto.entityId,
            assigneeId: dto.assigneeId,
            dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
            priority: dto.priority ?? 'normal',
            requesterId: user.id,
          },
        });
        break;
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002' &&
          attempt < 4
        ) {
          continue; // displayCode ชน — สร้างใหม่แล้วลองอีกครั้ง
        }
        throw err;
      }
    }
    if (!req) {
      throw new BadRequestException('สร้างงานภาพไม่สำเร็จ (รหัสซ้ำ) — ลองอีกครั้ง');
    }

    await this.audit(user, via, 'create', req.id, { displayCode: req.displayCode });
    if (req.assigneeId && req.assigneeId !== user.id) {
      await this.notifyAssigned(req, req.assigneeId);
    }
    return req;
  }

  // ── UPDATE — requester / assignee / admin เท่านั้น (mirror กติกา jobs/tasks) ──
  async update(id: string, dto: UpdateImageRequestDto, user: AuthUser, via = 'ui') {
    const existing = await this.findVisible(id, user);
    if (!this.isParticipant(existing, user) && !this.isAdmin(user)) {
      throw new ForbiddenException('แก้ไขได้เฉพาะผู้ขอ ผู้รับผิดชอบ หรือ admin');
    }

    if (dto.brandId != null) await this.assertBrand(dto.brandId);
    // target: ต้องส่งเป็นคู่เมื่อจะเปลี่ยน (ส่ง null คู่กัน = ถอดปลายทาง)
    const nextEntityType = dto.entityType !== undefined ? dto.entityType : existing.entityType;
    const nextEntityId = dto.entityId !== undefined ? dto.entityId : existing.entityId;
    this.assertTargetPair(nextEntityType, nextEntityId);
    if (
      (dto.entityType !== undefined || dto.entityId !== undefined) &&
      nextEntityType &&
      nextEntityId
    ) {
      await this.assertTarget(nextEntityType, nextEntityId);
    }
    if (dto.assigneeId != null) await this.assertUser(dto.assigneeId, 'ไม่พบผู้รับผิดชอบที่เลือก');

    const req = await this.prisma.imageRequest.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.imageType !== undefined ? { imageType: dto.imageType } : {}),
        ...(dto.platform !== undefined ? { platform: dto.platform } : {}),
        ...(dto.sizeNote !== undefined ? { sizeNote: dto.sizeNote } : {}),
        ...(dto.copyText !== undefined ? { copyText: dto.copyText } : {}),
        ...(dto.brief !== undefined ? { brief: dto.brief } : {}),
        ...(dto.brandId !== undefined ? { brandId: dto.brandId } : {}),
        ...(dto.entityType !== undefined ? { entityType: dto.entityType } : {}),
        ...(dto.entityId !== undefined ? { entityId: dto.entityId } : {}),
        ...(dto.draftPrompt !== undefined ? { draftPrompt: dto.draftPrompt } : {}),
        ...(dto.assigneeId !== undefined ? { assigneeId: dto.assigneeId } : {}),
        ...(dto.dueAt !== undefined ? { dueAt: dto.dueAt ? new Date(dto.dueAt) : null } : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
      },
    });

    await this.audit(user, via, 'update', id, { fields: Object.keys(dto) });
    // มอบหมายใหม่ → แจ้งผู้รับผิดชอบคนใหม่
    if (dto.assigneeId && dto.assigneeId !== existing.assigneeId && dto.assigneeId !== user.id) {
      await this.notifyAssigned(req, dto.assigneeId);
    }
    return req;
  }

  // ── STATUS — enforce legal moves + กติกาผู้อนุมัติ (มนุษย์เท่านั้น ตามกฎ D8) ──
  async changeStatus(id: string, dto: ChangeImageRequestStatusDto, user: AuthUser, via = 'ui') {
    const existing = await this.findVisible(id, user);
    const next = dto.status;

    if (!TRANSITIONS[existing.status]?.includes(next)) {
      throw new BadRequestException(
        `เปลี่ยนสถานะ ${existing.status} → ${next} ไม่ได้ (ลำดับ: open → in_progress → review → revision/approved)`,
      );
    }

    const data: Prisma.ImageRequestUpdateInput = { status: next };

    if (next === 'cancelled') {
      // ยกเลิกได้เฉพาะผู้ขอหรือ admin
      if (existing.requesterId !== user.id && !this.isAdmin(user)) {
        throw new ForbiddenException('ยกเลิกได้เฉพาะผู้ขอหรือ admin');
      }
    } else if (next === 'approved') {
      // อนุมัติได้เฉพาะ: ผู้ขอ หรือ role ที่มีสิทธิ์ A ใน module image_request (ทั้งสองทางใช้ได้)
      const canApprove =
        existing.requesterId === user.id || (await this.hasApprovePermission(user));
      if (!canApprove) {
        throw new ForbiddenException(
          'อนุมัติได้เฉพาะผู้ขอ หรือผู้ที่มีสิทธิ์ Approve (A) ใน module image_request',
        );
      }
      if (dto.approvedAssetId) {
        const linked = await this.prisma.assetLink.findFirst({
          where: { entityType: 'image_request', entityId: id, assetId: dto.approvedAssetId },
        });
        if (!linked) {
          throw new BadRequestException('approvedAssetId ต้องเป็นเวอร์ชันภาพที่อัปโหลดไว้กับงานนี้');
        }
        data.approvedAssetId = dto.approvedAssetId;
      }
      data.approvedBy = user.id;
      data.approvedAt = new Date();
    } else {
      // เดินงานปกติ (in_progress/review/revision) — ผู้ขอ/ผู้รับผิดชอบ/admin
      if (!this.isParticipant(existing, user) && !this.isAdmin(user)) {
        throw new ForbiddenException('เปลี่ยนสถานะได้เฉพาะผู้ขอ ผู้รับผิดชอบ หรือ admin');
      }
      if (next === 'in_progress' && !existing.assigneeId) {
        throw new BadRequestException('ต้องมอบหมายผู้รับผิดชอบก่อนเริ่มทำ');
      }
      if (next === 'review') {
        const versions = await this.prisma.assetLink.count({
          where: { entityType: 'image_request', entityId: id },
        });
        if (versions === 0) {
          throw new BadRequestException('ต้องอัปโหลดภาพอย่างน้อย 1 เวอร์ชันก่อนส่งรีวิว');
        }
      }
    }

    const req = await this.prisma.imageRequest.update({ where: { id }, data });
    await this.audit(user, via, 'status_change', id, {
      from: existing.status,
      to: next,
      ...(dto.approvedAssetId ? { approvedAssetId: dto.approvedAssetId } : {}),
    });

    // คอมเมนต์ประกอบ (เช่นเหตุผลขอแก้) → Postit ผูกกับ request
    if (dto.comment?.trim()) {
      await this.prisma.postit.create({
        data: {
          type: 'feedback', // type ตาม POSTIT_TYPES (§20.2) — คอมเมนต์รีวิว = feedback
          content: dto.comment.trim(),
          entityType: 'image_request',
          entityId: id,
          createdBy: user.id,
        },
      });
    }

    // แจ้งผู้ขอ + ผู้รับผิดชอบ (ยกเว้นคนกดเอง)
    const targets = [req.requesterId, req.assigneeId].filter(
      (uid): uid is string => !!uid && uid !== user.id,
    );
    if (targets.length) {
      await this.notifications.notify(targets, {
        type: 'image_request_status',
        entityType: 'image_request',
        entityId: id,
        message: `งานภาพ "${req.title}" (${req.displayCode}) เปลี่ยนสถานะเป็น ${STATUS_LABEL_TH[next] ?? next}`,
      });
    }
    return req;
  }

  // ── DELETE = ยกเลิก (soft — ไม่มี hard delete) ───────────────
  async cancel(id: string, user: AuthUser, via = 'ui') {
    const existing = await this.findVisible(id, user);
    if (!TRANSITIONS[existing.status]?.includes('cancelled')) {
      throw new BadRequestException(`งานสถานะ ${existing.status} ยกเลิกไม่ได้แล้ว`);
    }
    if (existing.requesterId !== user.id && !this.isAdmin(user)) {
      throw new ForbiddenException('ยกเลิกได้เฉพาะผู้ขอหรือ admin');
    }
    const req = await this.prisma.imageRequest.update({
      where: { id },
      data: { status: 'cancelled' },
    });
    await this.audit(user, via, 'cancel', id, { from: existing.status });
    return req;
  }

  // ── helpers ────────────────────────────────────────────────

  /** โหลด + บังคับ viewScope: own/team และผู้ขอ/ผู้รับผิดชอบไม่อยู่ในชุดที่มองเห็น → 404 เหมือนไม่มีแถว */
  async findVisible(id: string, user: AuthUser): Promise<ImageRequest> {
    const req = await this.prisma.imageRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('ไม่พบงานภาพ');
    if (req.requesterId !== user.id && req.assigneeId !== user.id) {
      const visibleIds = await this.scope.resolveVisibleUserIds(user, 'image_request');
      if (
        visibleIds &&
        !visibleIds.includes(req.requesterId) &&
        !(req.assigneeId && visibleIds.includes(req.assigneeId))
      ) {
        throw new NotFoundException('ไม่พบงานภาพ');
      }
    }
    return req;
  }

  private isParticipant(req: ImageRequest, user: AuthUser): boolean {
    return req.requesterId === user.id || req.assigneeId === user.id;
  }

  private isAdmin(user: AuthUser): boolean {
    return Boolean(user?.roles?.includes('admin'));
  }

  /** สิทธิ์ Approve = role ใดสักตัวมี action 'A' ใน module image_request (query สดแบบ PermissionsGuard) */
  private async hasApprovePermission(user: AuthUser): Promise<boolean> {
    if (!user?.roles?.length) return false;
    const count = await this.prisma.rolePermission.count({
      where: {
        module: 'image_request',
        actions: { has: 'A' },
        role: { key: { in: user.roles } },
      },
    });
    return count > 0;
  }

  private async assertBrand(brandId?: string | null) {
    if (!brandId) return;
    const brand = await this.prisma.brand.findUnique({ where: { id: brandId } });
    if (!brand) throw new NotFoundException('ไม่พบแบรนด์ที่เลือก');
  }

  private assertTargetPair(entityType?: string | null, entityId?: string | null) {
    if ((entityType && !entityId) || (!entityType && entityId)) {
      throw new BadRequestException('ต้องส่ง entityType กับ entityId คู่กัน');
    }
  }

  private async assertTarget(entityType?: string | null, entityId?: string | null) {
    if (!entityType || !entityId) return;
    const label = await this.targetLabel(entityType, entityId);
    if (!label) throw new NotFoundException(`ไม่พบปลายทางที่เลือก (${entityType})`);
  }

  /** label ของ entity ปลายทาง — null เมื่อไม่พบ */
  private async targetLabel(
    entityType?: string | null,
    entityId?: string | null,
  ): Promise<string | null> {
    if (!entityType || !entityId) return null;
    if (entityType === 'content') {
      const c = await this.prisma.contentItem.findUnique({
        where: { id: entityId },
        select: { title: true },
      });
      return c ? c.title : null;
    }
    if (entityType === 'campaign') {
      const c = await this.prisma.campaign.findUnique({
        where: { id: entityId },
        select: { name: true },
      });
      return c ? c.name : null;
    }
    if (entityType === 'episode') {
      const e = await this.prisma.episode.findUnique({
        where: { id: entityId },
        select: { displayCode: true, title: true },
      });
      return e ? `${e.displayCode} · ${e.title}` : null;
    }
    return null;
  }

  private async assertUser(userId: string | undefined | null, message: string) {
    if (!userId) return;
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u) throw new NotFoundException(message);
  }

  // IMG-0001 — count+1 pattern เดียวกับ JOB/EP/PRD
  private async generateDisplayCode(): Promise<string> {
    const count = await this.prisma.imageRequest.count();
    return `IMG-${String(count + 1).padStart(4, '0')}`;
  }

  /** asset ภาพเวอร์ชันล่าสุดต่อ request (ใหม่สุด) — คืน map requestId → assetId */
  private async latestVersionMap(ids: string[]): Promise<Map<string, string>> {
    if (!ids.length) return new Map();
    const links = await this.prisma.assetLink.findMany({
      where: {
        entityType: 'image_request',
        entityId: { in: ids },
        asset: { archivedAt: null, mimeType: { startsWith: 'image/' } },
      },
      select: { entityId: true, assetId: true, asset: { select: { createdAt: true } } },
    });
    const best = new Map<string, { assetId: string; createdAt: Date }>();
    for (const l of links) {
      const cur = best.get(l.entityId);
      if (!cur || l.asset.createdAt > cur.createdAt) {
        best.set(l.entityId, { assetId: l.assetId, createdAt: l.asset.createdAt });
      }
    }
    return new Map([...best].map(([k, v]) => [k, v.assetId]));
  }

  private async versionCounts(ids: string[]): Promise<Map<string, number>> {
    if (!ids.length) return new Map();
    const groups = await this.prisma.assetLink.groupBy({
      by: ['entityId'],
      where: { entityType: 'image_request', entityId: { in: ids } },
      _count: { _all: true },
    });
    return new Map(groups.map((g) => [g.entityId, g._count._all]));
  }

  private async userNames(ids: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids)];
    if (!unique.length) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, name: true },
    });
    return new Map(users.map((u) => [u.id, u.name]));
  }

  private notifyAssigned(req: ImageRequest, assigneeId: string) {
    return this.notifications.notify([assigneeId], {
      type: 'image_request_assigned',
      entityType: 'image_request',
      entityId: req.id,
      message: `คุณได้รับมอบหมายงานภาพ "${req.title}" (${req.displayCode})`,
    });
  }

  private audit(user: AuthUser, via: string, action: string, entityId: string, meta: object) {
    return this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        via,
        action,
        entityType: 'image_request',
        entityId,
        meta: meta as Prisma.InputJsonValue,
      },
    });
  }
}
