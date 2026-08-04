import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JobStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/current-user.decorator';
import { NotificationsService } from '../notifications/notifications.service';
import {
  ChangeJobStatusDto,
  CreateDeliverableDto,
  CreateJobDto,
  UpdateDeliverableDto,
  UpdateJobDto,
} from './dto/job.dto';

// State machine — งานรับจ้างผลิต: inquiry → quoted → confirmed → in_production ↔ internal_qc
// → delivered → (revision → in_production) หรือ approved → closed. cancelled ได้จาก 4 สถานะแรก
const TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  inquiry: ['quoted', 'cancelled'],
  quoted: ['confirmed', 'cancelled'],
  confirmed: ['in_production', 'cancelled'],
  in_production: ['internal_qc'],
  internal_qc: ['delivered', 'in_production'],
  delivered: ['revision', 'approved'],
  revision: ['in_production', 'internal_qc'],
  approved: ['closed'],
  closed: [],
  cancelled: [],
};

const SORT_FIELDS = ['dueDate', 'createdAt', 'updatedAt'] as const;
type JobSortField = (typeof SORT_FIELDS)[number];

export interface ListJobsParams {
  q?: string;
  status?: JobStatus;
  type?: string;
  clientId?: string;
  priority?: string;
  ownerId?: string; // uuid หรือ 'me'
  dueBefore?: string;
  dueAfter?: string;
  archived?: string; // '1' = เฉพาะที่ archive แล้ว
  sortBy?: string;
  sortDir?: string;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class JobsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async list(params: ListJobsParams, user: AuthUser) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const take = Math.min(Math.max(params.pageSize ?? 20, 1), 50);

    const dueDate: Prisma.DateTimeNullableFilter = {};
    if (params.dueAfter) dueDate.gte = new Date(params.dueAfter);
    if (params.dueBefore) dueDate.lte = new Date(params.dueBefore);

    const ownerId = params.ownerId === 'me' ? user.id : params.ownerId;

    const where: Prisma.JobWhereInput = {
      archivedAt: params.archived === '1' ? { not: null } : null,
      ...(params.status ? { status: params.status } : {}),
      ...(params.type ? { type: params.type as Prisma.JobWhereInput['type'] } : {}),
      ...(params.clientId ? { clientId: params.clientId } : {}),
      ...(params.priority ? { priority: params.priority } : {}),
      ...(ownerId ? { ownerId } : {}),
      ...(Object.keys(dueDate).length ? { dueDate } : {}),
      ...(params.q
        ? {
            OR: [
              { title: { contains: params.q, mode: 'insensitive' } },
              { displayCode: { contains: params.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const sortBy: JobSortField = SORT_FIELDS.includes(params.sortBy as JobSortField)
      ? (params.sortBy as JobSortField)
      : 'updatedAt';
    const sortDir: Prisma.SortOrder = params.sortDir === 'asc' ? 'asc' : 'desc';

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.job.findMany({
        where,
        orderBy: { [sortBy]: sortDir },
        include: {
          client: { select: { id: true, name: true } },
          presenters: true,
          _count: {
            select: { products: true, presenters: true, crew: true, deliverables: true },
          },
          deliverables: {
            orderBy: { round: 'desc' },
            take: 1,
            select: { status: true, round: true },
          },
        },
        skip: (page - 1) * take,
        take,
      }),
      this.prisma.job.count({ where }),
    ]);

    // thumbnail: asset รูปแรกที่ link entityType 'job' — batch เดียว
    const jobIds = rows.map((r) => r.id);
    const thumbMap = await this.thumbMap('job', jobIds);

    const items = rows.map(({ _count, deliverables, presenters, ...job }) => ({
      ...job,
      presenterIds: presenters.map((p) => p.characterId),
      counts: {
        products: _count.products,
        presenters: _count.presenters,
        crew: _count.crew,
        deliverables: _count.deliverables,
      },
      latestDeliverableStatus: deliverables[0]?.status ?? null,
      thumbAssetId: thumbMap.get(job.id) ?? null,
    }));

    return { items, total, page, pageSize: take };
  }

  async get(id: string) {
    const job = await this.prisma.job.findUnique({
      where: { id },
      include: {
        client: true,
        products: {
          include: {
            product: {
              select: { id: true, name: true, displayCode: true, status: true },
            },
          },
        },
        presenters: true,
        crew: true,
        deliverables: { orderBy: [{ round: 'asc' }, { createdAt: 'asc' }] },
      },
    });
    if (!job) throw new NotFoundException('ไม่พบงาน');

    // presenter portraits — batch fetch characters
    const characterIds = job.presenters.map((p) => p.characterId);
    const characters = characterIds.length
      ? await this.prisma.character.findMany({
          where: { id: { in: characterIds } },
          select: { id: true, nameTh: true, nameEn: true, displayCode: true },
        })
      : [];

    // crew contacts — batch fetch creators
    const creatorIds = job.crew.map((c) => c.creatorId);
    const creators = creatorIds.length
      ? await this.prisma.creator.findMany({
          where: { id: { in: creatorIds } },
          select: { id: true, name: true, phone: true, line: true, email: true },
        })
      : [];
    const creatorMap = new Map(creators.map((c) => [c.id, c]));

    // attachment count ต่อ deliverable (entityType 'job_deliverable')
    const deliverableIds = job.deliverables.map((d) => d.id);
    const attachMap = await this.attachCounts('job_deliverable', deliverableIds);

    const { products, presenters, crew, deliverables, ...rest } = job;
    return {
      ...rest,
      products: products.map((p) => p.product),
      presenters: characters,
      crew: crew.map((c) => ({
        ...creatorMap.get(c.creatorId),
        creatorId: c.creatorId,
        roleNote: c.roleNote,
      })),
      deliverables: deliverables.map((d) => ({
        ...d,
        attachmentCount: attachMap.get(d.id) ?? 0,
      })),
      stats: {
        products: products.length,
        presenters: presenters.length,
        crew: crew.length,
        deliverables: deliverables.length,
      },
    };
  }

  async create(dto: CreateJobDto, user: AuthUser, via = 'ui') {
    await this.assertClient(dto.clientId);
    await this.assertProducts(dto.productIds);
    await this.assertCharacters(dto.characterIds);
    await this.assertCreators(dto.crew?.map((c) => c.creatorId));

    const displayCode = await this.generateDisplayCode();
    const {
      dueDate,
      productIds,
      characterIds,
      crew,
      quotePrice,
      depositAmount,
      ...fields
    } = dto;

    const job = await this.prisma.job.create({
      data: {
        ...fields,
        displayCode,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        quotePrice: quotePrice !== undefined ? new Prisma.Decimal(quotePrice) : undefined,
        depositAmount:
          depositAmount !== undefined ? new Prisma.Decimal(depositAmount) : undefined,
        ownerId: dto.ownerId ?? user.id,
        createdBy: user.id,
        ...(productIds?.length
          ? { products: { create: productIds.map((productId) => ({ productId })) } }
          : {}),
        ...(characterIds?.length
          ? { presenters: { create: characterIds.map((characterId) => ({ characterId })) } }
          : {}),
        ...(crew?.length
          ? {
              crew: {
                create: crew.map((c) => ({ creatorId: c.creatorId, roleNote: c.roleNote })),
              },
            }
          : {}),
      },
    });

    await this.audit(user, via, 'create', job.id, { displayCode });
    return job;
  }

  async update(id: string, dto: UpdateJobDto, user: AuthUser, via = 'ui') {
    await this.findRaw(id);
    await this.assertProducts(dto.productIds);
    await this.assertCharacters(dto.characterIds);
    await this.assertCreators(dto.crew?.map((c) => c.creatorId));

    const {
      dueDate,
      productIds,
      characterIds,
      crew,
      quotePrice,
      depositAmount,
      ...fields
    } = dto;

    const job = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.job.update({
        where: { id },
        data: {
          ...fields,
          ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}),
          ...(quotePrice !== undefined
            ? { quotePrice: quotePrice === null ? null : new Prisma.Decimal(quotePrice) }
            : {}),
          ...(depositAmount !== undefined
            ? { depositAmount: depositAmount === null ? null : new Prisma.Decimal(depositAmount) }
            : {}),
        },
      });

      // replace-sets เมื่อส่งมา
      if (productIds !== undefined) {
        await tx.jobProduct.deleteMany({ where: { jobId: id } });
        if (productIds.length) {
          await tx.jobProduct.createMany({
            data: productIds.map((productId) => ({ jobId: id, productId })),
          });
        }
      }
      if (characterIds !== undefined) {
        await tx.jobPresenter.deleteMany({ where: { jobId: id } });
        if (characterIds.length) {
          await tx.jobPresenter.createMany({
            data: characterIds.map((characterId) => ({ jobId: id, characterId })),
          });
        }
      }
      if (crew !== undefined) {
        await tx.jobCrew.deleteMany({ where: { jobId: id } });
        if (crew.length) {
          await tx.jobCrew.createMany({
            data: crew.map((c) => ({ jobId: id, creatorId: c.creatorId, roleNote: c.roleNote })),
          });
        }
      }
      return updated;
    });

    await this.audit(user, via, 'update', id, { fields: Object.keys(dto) });
    return job;
  }

  async changeStatus(id: string, dto: ChangeJobStatusDto, user: AuthUser, via = 'ui') {
    const existing = await this.findRaw(id);
    const next = dto.status;

    if (!TRANSITIONS[existing.status].includes(next)) {
      throw new BadRequestException(`เปลี่ยนสถานะ ${existing.status} → ${next} ไม่ได้`);
    }

    const job = await this.prisma.job.update({
      where: { id },
      data: {
        status: next,
        ...(next === 'delivered' ? { deliveredAt: new Date() } : {}),
      },
    });
    await this.audit(user, via, 'status_change', id, { from: existing.status, to: next });

    // แจ้ง owner + ผู้สร้าง (ยกเว้นตัวเอง — notify dedupe ให้)
    const targets = [job.ownerId, job.createdBy].filter(
      (uid): uid is string => !!uid && uid !== user.id,
    );
    if (targets.length) {
      await this.notifications.notify(targets, {
        type: 'job_status_change',
        entityType: 'job',
        entityId: id,
        message: `งาน "${job.title}" (${job.displayCode}) เปลี่ยนสถานะเป็น ${next}`,
      });
    }
    return job;
  }

  async archive(id: string, user: AuthUser, via = 'ui') {
    await this.findRaw(id);
    const job = await this.prisma.job.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
    await this.audit(user, via, 'archive', id, {});
    return job;
  }

  async unarchive(id: string, user: AuthUser, via = 'ui') {
    await this.findRaw(id);
    const job = await this.prisma.job.update({
      where: { id },
      data: { archivedAt: null },
    });
    await this.audit(user, via, 'unarchive', id, {});
    return job;
  }

  // ── Deliverables ───────────────────────────────────────────

  async addDeliverable(jobId: string, dto: CreateDeliverableDto, user: AuthUser, via = 'ui') {
    await this.findRaw(jobId);
    // auto-increment round เมื่อไม่ได้ส่งมา
    let round = dto.round;
    if (round === undefined) {
      const last = await this.prisma.jobDeliverable.findFirst({
        where: { jobId },
        orderBy: { round: 'desc' },
        select: { round: true },
      });
      round = (last?.round ?? 0) + 1;
    }
    const deliverable = await this.prisma.jobDeliverable.create({
      data: {
        jobId,
        round,
        title: dto.title,
        notes: dto.notes,
        createdBy: user.id,
      },
    });
    await this.audit(user, via, 'deliverable_add', jobId, {
      deliverableId: deliverable.id,
      round,
    });
    return deliverable;
  }

  async updateDeliverable(
    jobId: string,
    did: string,
    dto: UpdateDeliverableDto,
    user: AuthUser,
    via = 'ui',
  ) {
    const existing = await this.prisma.jobDeliverable.findUnique({ where: { id: did } });
    if (!existing || existing.jobId !== jobId) throw new NotFoundException('ไม่พบรอบส่งมอบ');

    const deliverable = await this.prisma.jobDeliverable.update({
      where: { id: did },
      data: {
        ...(dto.status !== undefined
          ? { status: dto.status as Prisma.JobDeliverableUpdateInput['status'] }
          : {}),
        ...(dto.clientFeedback !== undefined ? { clientFeedback: dto.clientFeedback } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.title !== undefined ? { title: dto.title } : {}),
      },
    });
    await this.audit(user, via, 'deliverable_update', jobId, {
      deliverableId: did,
      fields: Object.keys(dto),
    });
    return deliverable;
  }

  async deleteDeliverable(jobId: string, did: string, user: AuthUser, via = 'ui') {
    const existing = await this.prisma.jobDeliverable.findUnique({ where: { id: did } });
    if (!existing || existing.jobId !== jobId) throw new NotFoundException('ไม่พบรอบส่งมอบ');
    await this.prisma.jobDeliverable.delete({ where: { id: did } });
    await this.audit(user, via, 'deliverable_delete', jobId, { deliverableId: did });
    return { ok: true };
  }

  // ── helpers ────────────────────────────────────────────────

  private async findRaw(id: string) {
    const job = await this.prisma.job.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('ไม่พบงาน');
    return job;
  }

  private async assertClient(clientId: string) {
    const client = await this.prisma.client.findUnique({ where: { id: clientId } });
    if (!client) throw new NotFoundException('ไม่พบลูกค้าที่เลือก');
  }

  private async assertProducts(ids?: string[]) {
    if (!ids?.length) return;
    const count = await this.prisma.product.count({ where: { id: { in: ids } } });
    if (count !== new Set(ids).size) throw new NotFoundException('มีสินค้าบางรายการที่ไม่พบ');
  }

  private async assertCharacters(ids?: string[]) {
    if (!ids?.length) return;
    const count = await this.prisma.character.count({ where: { id: { in: ids } } });
    if (count !== new Set(ids).size) throw new NotFoundException('มี presenter บางตัวที่ไม่พบ');
  }

  private async assertCreators(ids?: string[]) {
    if (!ids?.length) return;
    const uniq = [...new Set(ids)];
    const count = await this.prisma.creator.count({ where: { id: { in: uniq } } });
    if (count !== uniq.length) throw new NotFoundException('มีทีมผลิตบางคนที่ไม่พบ');
  }

  // JOB-0001 — count+1 pattern เดียวกับ module อื่น
  private async generateDisplayCode(): Promise<string> {
    const count = await this.prisma.job.count();
    return `JOB-${String(count + 1).padStart(4, '0')}`;
  }

  // thumbnail asset id แรกต่อ entity (รูปเท่านั้น) — คืน map entityId → assetId
  private async thumbMap(entityType: string, ids: string[]): Promise<Map<string, string>> {
    if (!ids.length) return new Map();
    const links = await this.prisma.assetLink.findMany({
      where: {
        entityType,
        entityId: { in: ids },
        asset: { archivedAt: null, mimeType: { startsWith: 'image/' } },
      },
      select: { entityId: true, assetId: true, asset: { select: { createdAt: true } } },
    });
    const best = new Map<string, { assetId: string; createdAt: Date }>();
    for (const l of links) {
      const cur = best.get(l.entityId);
      if (!cur || l.asset.createdAt < cur.createdAt) {
        best.set(l.entityId, { assetId: l.assetId, createdAt: l.asset.createdAt });
      }
    }
    return new Map([...best].map(([k, v]) => [k, v.assetId]));
  }

  private async attachCounts(entityType: string, ids: string[]): Promise<Map<string, number>> {
    if (!ids.length) return new Map();
    const groups = await this.prisma.assetLink.groupBy({
      by: ['entityId'],
      where: { entityType, entityId: { in: ids } },
      _count: { _all: true },
    });
    return new Map(groups.map((g) => [g.entityId, g._count._all]));
  }

  private audit(user: AuthUser, via: string, action: string, entityId: string, meta: object) {
    return this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        via,
        action,
        entityType: 'job',
        entityId,
        meta: meta as Prisma.InputJsonValue,
      },
    });
  }
}
