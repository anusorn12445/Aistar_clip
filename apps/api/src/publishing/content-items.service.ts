import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ContentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/current-user.decorator';
import { ScopeService } from '../auth/scope.service';
import { CreateContentItemDto } from './dto/create-content-item.dto';
import { UpdateContentItemDto } from './dto/update-content-item.dto';

// State machine ตาม addendum §D.1 (9 states) — action ที่ต้องมีต่อ transition
// C = Create/Edit, A = Approve, P = Publish
const TRANSITIONS: Record<ContentStatus, Partial<Record<ContentStatus, 'C' | 'A' | 'P'>>> = {
  idea: { brief: 'C', archived: 'C' },
  brief: { in_production: 'C', archived: 'C' },
  in_production: { internal_review: 'C', archived: 'C' },
  internal_review: { approved: 'A', revision_needed: 'A', archived: 'C' },
  revision_needed: { in_production: 'C', archived: 'C' },
  approved: { scheduled: 'P', archived: 'C' },
  scheduled: { published: 'P', archived: 'C' },
  published: { archived: 'C' },
  archived: {},
};

// role ที่ต้องได้รับแจ้งเตือนเมื่องานเข้า internal_review (§D.1 + §E.3)
const REVIEW_NOTIFY_ROLES = ['creative_lead', 'qc_reviewer', 'admin'];

const SORT_FIELDS = ['scheduledAt', 'title', 'status', 'updatedAt'] as const;
type ContentSortField = (typeof SORT_FIELDS)[number];

export interface ListContentItemsParams {
  q?: string;
  platform?: string;
  status?: ContentStatus;
  characterId?: string;
  productId?: string;
  campaignId?: string;
  episodeId?: string;
  scheduledFrom?: string;
  scheduledTo?: string;
  ownerId?: string;
  sortBy?: string;
  sortDir?: string;
  page?: number;
  pageSize?: number;
}

export interface ChangeContentStatusParams {
  status: ContentStatus;
  comment?: string;
  reason?: string;
  postUrl?: string;
  scheduledAt?: string;
}

const characterSelect = { id: true, nameTh: true, nameEn: true, displayCode: true } as const;

@Injectable()
export class ContentItemsService {
  constructor(
    private prisma: PrismaService,
    private scope: ScopeService,
  ) {}

  // ── List / Calendar / Get ──────────────────────────────────

  async list(params: ListContentItemsParams, user: AuthUser) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const take = Math.min(Math.max(params.pageSize ?? 20, 1), 50);

    // row-level viewScope: 'own' = งานที่ตัวเองเป็นเจ้าของ/ผู้ตรวจ · 'team' = ของสมาชิกทีมเดียวกันด้วย
    const visibleIds = await this.scope.resolveVisibleUserIds(user, 'content');

    const scheduledFilter: Prisma.DateTimeNullableFilter | undefined =
      params.scheduledFrom || params.scheduledTo
        ? {
            ...(params.scheduledFrom ? { gte: new Date(params.scheduledFrom) } : {}),
            ...(params.scheduledTo ? { lte: new Date(params.scheduledTo) } : {}),
          }
        : undefined;

    const where: Prisma.ContentItemWhereInput = {
      // ถ้าไม่ filter status → ซ่อนงานที่ archive แล้ว
      ...(params.status ? { status: params.status } : { archivedAt: null }),
      ...(params.platform ? { platform: params.platform } : {}),
      ...(params.ownerId ? { ownerId: params.ownerId } : {}),
      ...(params.campaignId ? { campaignId: params.campaignId } : {}),
      ...(params.episodeId ? { episodeId: params.episodeId } : {}),
      ...(params.characterId ? { characters: { some: { characterId: params.characterId } } } : {}),
      ...(params.productId ? { products: { some: { productId: params.productId } } } : {}),
      ...(scheduledFilter ? { scheduledAt: scheduledFilter } : {}),
      ...(params.q
        ? {
            OR: [
              { title: { contains: params.q, mode: 'insensitive' } },
              { caption: { contains: params.q, mode: 'insensitive' } },
            ],
          }
        : {}),
      // ใส่ใน AND แยกก้อน — ไม่ชนกับ OR ของ q ด้านบน
      // ownerId: null = คอนเทนต์ legacy/ไร้เจ้าของ เห็นได้ทุกคน (นิยามเดียวกับ episode)
      ...(visibleIds
        ? {
            AND: [
              {
                OR: [
                  { ownerId: { in: visibleIds } },
                  { reviewerId: { in: visibleIds } },
                  { ownerId: null },
                ],
              },
            ],
          }
        : {}),
    };

    const sortBy: ContentSortField = SORT_FIELDS.includes(params.sortBy as ContentSortField)
      ? (params.sortBy as ContentSortField)
      : 'updatedAt';
    const sortDir: Prisma.SortOrder = params.sortDir === 'asc' ? 'asc' : 'desc';

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.contentItem.findMany({
        where,
        orderBy: { [sortBy]: sortDir },
        include: {
          characters: true,
          products: { include: { product: { select: { id: true, name: true } } } },
          episode: { select: { id: true, displayCode: true, title: true } },
          campaign: { select: { id: true, displayCode: true, name: true } },
        },
        skip: (page - 1) * take,
        take,
      }),
      this.prisma.contentItem.count({ where }),
    ]);

    // ContentItemCharacter ไม่มี relation ไป Character — batch fetch แล้ว map กลับ
    const charMap = await this.fetchCharacterMap(
      rows.flatMap((r) => r.characters.map((c) => c.characterId)),
    );
    // ownerId ไม่มี relation ไป User — batch fetch ชื่อเจ้าของงาน
    const ownerMap = await this.fetchUserMap(rows.map((r) => r.ownerId));

    const items = rows.map(({ characters, products, ...rest }) => ({
      ...rest,
      owner: rest.ownerId ? (ownerMap.get(rest.ownerId) ?? null) : null,
      characters: characters
        .map((cc) => charMap.get(cc.characterId))
        .filter((c): c is NonNullable<typeof c> => !!c),
      products: products.map((cp) => cp.product),
    }));
    return { items, total, page, pageSize: take };
  }

  // รายการแบนสำหรับ calendar grid — เฉพาะ item ที่มี scheduledAt ในช่วง
  // apply viewScope เหมือนหน้า list (own/team) — ปฏิทินต้องไม่เห็นงานนอก scope
  async calendar(
    params: {
      from?: string;
      to?: string;
      platform?: string;
      characterId?: string;
      status?: ContentStatus;
    },
    user: AuthUser,
  ) {
    if (!params.from || !params.to) {
      throw new BadRequestException('กรุณาระบุช่วงวันที่ from และ to');
    }
    // '+' ที่ไม่ถูก encode ใน query → Date invalid → กัน 500 ด้วย 400 ที่อ่านออก
    const fromDate = new Date(params.from);
    const toDate = new Date(params.to);
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      throw new BadRequestException('รูปแบบวันที่ไม่ถูกต้อง (ISO 8601)');
    }
    const visibleIds = await this.scope.resolveVisibleUserIds(user, 'content');
    const rows = await this.prisma.contentItem.findMany({
      where: {
        scheduledAt: { gte: fromDate, lte: toDate },
        ...(visibleIds
          ? {
              AND: [
                {
                  OR: [
                    { ownerId: { in: visibleIds } },
                    { reviewerId: { in: visibleIds } },
                    { ownerId: null },
                  ],
                },
              ],
            }
          : {}),
        ...(params.status ? { status: params.status } : { archivedAt: null }),
        ...(params.platform ? { platform: params.platform } : {}),
        ...(params.characterId
          ? { characters: { some: { characterId: params.characterId } } }
          : {}),
      },
      include: { characters: true },
      orderBy: { scheduledAt: 'asc' },
      take: 500,
    });

    const charMap = await this.fetchCharacterMap(
      rows.flatMap((r) => r.characters.map((c) => c.characterId)),
    );

    return {
      items: rows.map((r) => ({
        id: r.id,
        title: r.title,
        platform: r.platform,
        scheduledAt: r.scheduledAt,
        status: r.status,
        blockedReason: r.blockedReason,
        characters: r.characters
          .map((cc) => charMap.get(cc.characterId)?.nameTh)
          .filter((n): n is string => !!n),
      })),
    };
  }

  // ส่ง user มาเมื่อเรียกจาก endpoint detail — เช็ค viewScope 'own' (internal call ไม่ต้องส่ง)
  async get(id: string, user?: AuthUser) {
    const item = await this.prisma.contentItem.findUnique({
      where: { id },
      include: {
        characters: true,
        products: {
          include: { product: { select: { id: true, name: true, displayCode: true, claimRiskLevel: true } } },
        },
        episode: { select: { id: true, displayCode: true, title: true, status: true } },
        campaign: { select: { id: true, displayCode: true, name: true, status: true } },
      },
    });
    if (!item) throw new NotFoundException('ไม่พบ content item');

    // viewScope 'own'/'team': งานนอกชุดที่มองเห็น (ไม่ใช่ owner/reviewer ในชุด) → 404 เหมือนไม่มีแถว (ไม่ leak ว่ามีอยู่)
    // ownerId: null = คอนเทนต์ไร้เจ้าของ เห็นได้ทุกคน (นิยามเดียวกับ list/episode)
    if (user) {
      const visibleIds = await this.scope.resolveVisibleUserIds(user, 'content');
      if (
        visibleIds &&
        item.ownerId !== null &&
        !(item.ownerId && visibleIds.includes(item.ownerId)) &&
        !(item.reviewerId && visibleIds.includes(item.reviewerId))
      ) {
        throw new NotFoundException('ไม่พบ content item');
      }
    }

    const charMap = await this.fetchCharacterMap(item.characters.map((c) => c.characterId));
    const owner = item.ownerId
      ? await this.prisma.user.findUnique({
          where: { id: item.ownerId },
          select: { id: true, name: true },
        })
      : null;

    const { characters: _cc, products, ...rest } = item;
    return {
      ...rest,
      owner,
      characters: item.characters
        .map((cc) => charMap.get(cc.characterId))
        .filter((c): c is NonNullable<typeof c> => !!c),
      products: products.map((cp) => cp.product),
      readiness: this.readiness(item),
    };
  }

  // ── Create / Update ────────────────────────────────────────

  async create(dto: CreateContentItemDto, user: AuthUser, via = 'ui') {
    const { characterIds, productIds, scheduledAt, episodeId, campaignId, hashtags, ...fields } = dto;

    if (episodeId) {
      const ep = await this.prisma.episode.findUnique({ where: { id: episodeId } });
      if (!ep) throw new BadRequestException('ไม่พบ episode ที่เลือก');
    }
    if (campaignId) {
      const cm = await this.prisma.campaign.findUnique({ where: { id: campaignId } });
      if (!cm) throw new BadRequestException('ไม่พบแคมเปญที่เลือก');
    }
    const validCharacterIds = await this.filterExistingCharacters(characterIds ?? []);
    const validProductIds = await this.filterExistingProducts(productIds ?? []);

    const item = await this.prisma.contentItem.create({
      data: {
        ...fields,
        episodeId,
        campaignId,
        hashtags: hashtags ?? [],
        scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
        ownerId: user.id,
        characters: { create: validCharacterIds.map((characterId) => ({ characterId })) },
        products: { create: validProductIds.map((productId) => ({ productId })) },
      },
    });
    await this.audit(user, via, 'create', item.id, { title: item.title, platform: item.platform });
    return this.get(item.id);
  }

  async update(id: string, dto: UpdateContentItemDto, user: AuthUser, via = 'ui') {
    const existing = await this.findRaw(id);

    if (dto.expectedUpdatedAt && new Date(dto.expectedUpdatedAt).getTime() !== existing.updatedAt.getTime()) {
      throw new ConflictException('ข้อมูลถูกแก้ไขโดยคนอื่นแล้ว กรุณา reload');
    }

    const { expectedUpdatedAt: _e, scheduledAt, ...fields } = dto;
    await this.prisma.contentItem.update({
      where: { id },
      data: {
        ...fields,
        ...(scheduledAt !== undefined
          ? { scheduledAt: scheduledAt ? new Date(scheduledAt) : null }
          : {}),
      },
    });
    await this.audit(user, via, 'update', id, { fields: Object.keys(fields) });
    return this.get(id);
  }

  // ── State machine (§D.1) ───────────────────────────────────

  async changeStatus(id: string, params: ChangeContentStatusParams, user: AuthUser, via = 'ui') {
    const existing = await this.findRaw(id);
    const next = params.status;

    const requiredAction = TRANSITIONS[existing.status]?.[next];
    if (!requiredAction) {
      throw new BadRequestException(`เปลี่ยน status ${existing.status} → ${next} ไม่ได้`);
    }
    if (!(await this.hasPermission(user, 'content', requiredAction))) {
      throw new ForbiddenException(`ต้องมีสิทธิ์ ${requiredAction} ใน module content`);
    }

    const data: Prisma.ContentItemUpdateInput = { status: next };

    // in_production → internal_review: readiness check (caption ครบ)
    if (next === 'internal_review') {
      if (!existing.caption?.trim()) {
        throw new BadRequestException(
          'ยังส่ง review ไม่ได้ — readiness check ไม่ผ่าน: กรุณาใส่ caption ก่อนส่ง internal review',
        );
      }
    }

    // internal_review → approved: มนุษย์ผ่าน UI เท่านั้น (guardrail §28.2)
    if (next === 'approved') {
      if (via !== 'ui') {
        throw new ForbiddenException('การ approve content ทำได้ผ่าน UI โดยมนุษย์เท่านั้น');
      }
      data.reviewerId = user.id;
      data.blockedReason = null;
    }

    // internal_review → revision_needed: ต้องระบุ comment → เก็บใน blockedReason
    if (next === 'revision_needed') {
      if (!params.comment?.trim()) {
        throw new BadRequestException('กรุณาระบุ comment ว่าต้องแก้อะไรก่อนส่งกลับ');
      }
      data.blockedReason = params.comment.trim();
      data.reviewerId = user.id;
    }

    // revision_needed → in_production: ล้าง comment เดิม
    if (existing.status === 'revision_needed' && next === 'in_production') {
      data.blockedReason = null;
    }

    // approved → scheduled: ต้องมี scheduledAt (จาก body หรือที่ตั้งไว้แล้ว)
    if (next === 'scheduled') {
      if (params.scheduledAt) {
        data.scheduledAt = new Date(params.scheduledAt);
      } else if (!existing.scheduledAt) {
        throw new BadRequestException('ต้องระบุวัน-เวลาโพสต์ (scheduledAt) ก่อนเข้าคิวโพสต์');
      }
    }

    // scheduled → published: ต้องแนบ postUrl
    if (next === 'published') {
      if (!params.postUrl?.trim()) {
        throw new BadRequestException('กรุณาแนบลิงก์โพสต์จริง (postUrl) เพื่อยืนยันว่าโพสต์แล้ว');
      }
      data.postUrl = params.postUrl.trim();
    }

    // → archived: จาก state อื่นที่ไม่ใช่ published ต้องระบุเหตุผล (แทน cancelled/rejected เดิม)
    if (next === 'archived') {
      data.archivedAt = new Date();
      if (existing.status !== 'published') {
        if (!params.reason?.trim()) {
          throw new BadRequestException('กรุณาระบุเหตุผลที่ archive งานนี้');
        }
        data.blockedReason = params.reason.trim();
      }
    }

    const item = await this.prisma.contentItem.update({ where: { id }, data });

    // แจ้งเตือน (§E.3) — insert ตรงผ่าน prisma
    if (next === 'internal_review') {
      await this.notifyRoles(
        REVIEW_NOTIFY_ROLES,
        'content_review_request',
        item.id,
        `Content "${item.title}" (${item.platform}) รอตรวจ internal review`,
      );
    }
    if (next === 'revision_needed' && item.ownerId) {
      await this.prisma.notification.create({
        data: {
          userId: item.ownerId,
          type: 'content_revision_needed',
          entityType: 'content_item',
          entityId: item.id,
          message: `Content "${item.title}" ถูกส่งกลับให้แก้: ${params.comment?.trim()}`,
        },
      });
    }

    await this.audit(user, via, 'status_change', id, {
      from: existing.status,
      to: next,
      ...(params.comment ? { comment: params.comment } : {}),
      ...(params.reason ? { reason: params.reason } : {}),
      ...(params.postUrl ? { postUrl: params.postUrl } : {}),
    });
    return item;
  }

  // PATCH /content-items/:id/block — ตั้ง/ล้าง blockedReason ทับ state ปัจจุบัน (§D.1)
  async setBlockedReason(id: string, reason: string | null, user: AuthUser, via = 'ui') {
    await this.findRaw(id);
    const item = await this.prisma.contentItem.update({
      where: { id },
      data: { blockedReason: reason?.trim() || null },
    });
    await this.audit(user, via, reason ? 'block' : 'unblock', id, { reason: reason ?? null });
    return item;
  }

  // ── Linked characters / products ───────────────────────────

  async addCharacter(id: string, characterId: string, user: AuthUser, via = 'ui') {
    await this.findRaw(id);
    const character = await this.prisma.character.findUnique({ where: { id: characterId } });
    if (!character) throw new BadRequestException('ไม่พบ character ที่เลือก');

    const existing = await this.prisma.contentItemCharacter.findUnique({
      where: { contentItemId_characterId: { contentItemId: id, characterId } },
    });
    if (!existing) {
      await this.prisma.contentItemCharacter.create({ data: { contentItemId: id, characterId } });
      await this.audit(user, via, 'link_character', id, {
        characterId,
        displayCode: character.displayCode,
      });
    }
    return { ok: true, characterId };
  }

  async removeCharacter(id: string, characterId: string, user: AuthUser, via = 'ui') {
    await this.findRaw(id);
    await this.prisma.contentItemCharacter.deleteMany({
      where: { contentItemId: id, characterId },
    });
    await this.audit(user, via, 'unlink_character', id, { characterId });
    return { ok: true };
  }

  async addProduct(id: string, productId: string, user: AuthUser, via = 'ui') {
    await this.findRaw(id);
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new BadRequestException('ไม่พบสินค้าที่เลือก');

    const existing = await this.prisma.contentItemProduct.findUnique({
      where: { contentItemId_productId: { contentItemId: id, productId } },
    });
    if (!existing) {
      await this.prisma.contentItemProduct.create({ data: { contentItemId: id, productId } });
      await this.audit(user, via, 'link_product', id, {
        productId,
        displayCode: product.displayCode,
      });
    }
    return { ok: true, productId };
  }

  async removeProduct(id: string, productId: string, user: AuthUser, via = 'ui') {
    await this.findRaw(id);
    await this.prisma.contentItemProduct.deleteMany({ where: { contentItemId: id, productId } });
    await this.audit(user, via, 'unlink_product', id, { productId });
    return { ok: true };
  }

  // ── helpers ────────────────────────────────────────────────

  private readiness(item: { caption: string | null; scheduledAt: Date | null; characters: { characterId: string }[] }) {
    return {
      caption: !!item.caption?.trim(),
      scheduledAt: !!item.scheduledAt,
      characters: item.characters.length > 0,
    };
  }

  private async findRaw(id: string) {
    const item = await this.prisma.contentItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('ไม่พบ content item');
    return item;
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

  private async fetchCharacterMap(ids: string[]) {
    const unique = [...new Set(ids)];
    const rows = unique.length
      ? await this.prisma.character.findMany({
          where: { id: { in: unique } },
          select: characterSelect,
        })
      : [];
    return new Map(rows.map((c) => [c.id, c]));
  }

  private async filterExistingCharacters(ids: string[]) {
    if (!ids.length) return [];
    const rows = await this.prisma.character.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true },
    });
    if (rows.length !== new Set(ids).size) {
      throw new BadRequestException('มี character บางตัวที่เลือกไม่พบในระบบ');
    }
    return rows.map((r) => r.id);
  }

  private async filterExistingProducts(ids: string[]) {
    if (!ids.length) return [];
    const rows = await this.prisma.product.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true },
    });
    if (rows.length !== new Set(ids).size) {
      throw new BadRequestException('มีสินค้าบางรายการที่เลือกไม่พบในระบบ');
    }
    return rows.map((r) => r.id);
  }

  private async hasPermission(user: AuthUser, module: string, action: string) {
    const count = await this.prisma.rolePermission.count({
      where: { module, actions: { has: action }, role: { key: { in: user.roles } } },
    });
    return count > 0;
  }

  // แจ้งเตือน user ทุกคนที่ถือ role ใน keys (insert ตรงผ่าน prisma ตามข้อกำหนด)
  private async notifyRoles(roleKeys: string[], type: string, entityId: string, message: string) {
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
        entityType: 'content_item',
        entityId,
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
        entityType: 'content_item',
        entityId,
        meta: meta as Prisma.InputJsonValue,
      },
    });
  }
}
