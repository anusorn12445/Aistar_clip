import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LiveStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/current-user.decorator';
import { CreateLiveSessionDto, LiveProductItemDto } from './dto/create-live-session.dto';
import { UpdateLiveSessionDto } from './dto/update-live-session.dto';

// State machine: scheduled → live → done, scheduled → cancelled
// P = ควบคุมการออกอากาศ (Publisher/Commerce Lead), C = จัดตาราง
const TRANSITIONS: Record<LiveStatus, Partial<Record<LiveStatus, 'C' | 'P'>>> = {
  scheduled: { live: 'P', cancelled: 'C' },
  live: { done: 'P' },
  done: {},
  cancelled: {},
};

const SORT_FIELDS = ['scheduledAt', 'title'] as const;
type LiveSortField = (typeof SORT_FIELDS)[number];

export interface ListLiveSessionsParams {
  q?: string;
  platform?: string;
  status?: LiveStatus;
  characterId?: string;
  scheduledFrom?: string;
  scheduledTo?: string;
  sortBy?: string;
  sortDir?: string;
  page?: number;
  pageSize?: number;
}

const characterSelect = { id: true, nameTh: true, nameEn: true, displayCode: true } as const;

@Injectable()
export class LiveSessionsService {
  constructor(private prisma: PrismaService) {}

  async list(params: ListLiveSessionsParams) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const take = Math.min(Math.max(params.pageSize ?? 20, 1), 50);

    const scheduledFilter: Prisma.DateTimeFilter | undefined =
      params.scheduledFrom || params.scheduledTo
        ? {
            ...(params.scheduledFrom ? { gte: new Date(params.scheduledFrom) } : {}),
            ...(params.scheduledTo ? { lte: new Date(params.scheduledTo) } : {}),
          }
        : undefined;

    const where: Prisma.LiveSessionWhereInput = {
      ...(params.status ? { status: params.status } : {}),
      ...(params.platform ? { platform: params.platform } : {}),
      ...(params.characterId
        ? { hostCharacters: { some: { characterId: params.characterId } } }
        : {}),
      ...(scheduledFilter ? { scheduledAt: scheduledFilter } : {}),
      ...(params.q ? { title: { contains: params.q, mode: 'insensitive' } } : {}),
    };

    const sortBy: LiveSortField = SORT_FIELDS.includes(params.sortBy as LiveSortField)
      ? (params.sortBy as LiveSortField)
      : 'scheduledAt';
    const sortDir: Prisma.SortOrder = params.sortDir === 'desc' ? 'desc' : 'asc';

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.liveSession.findMany({
        where,
        orderBy: { [sortBy]: sortDir },
        include: {
          hostCharacters: true,
          _count: { select: { products: true } },
        },
        skip: (page - 1) * take,
        take,
      }),
      this.prisma.liveSession.count({ where }),
    ]);

    // LiveCharacter ไม่มี relation ไป Character — batch fetch แล้ว map กลับ
    const charMap = await this.fetchCharacterMap(
      rows.flatMap((r) => r.hostCharacters.map((c) => c.characterId)),
    );

    const items = rows.map(({ hostCharacters, _count, ...rest }) => ({
      ...rest,
      hostCharacters: hostCharacters
        .map((hc) => charMap.get(hc.characterId))
        .filter((c): c is NonNullable<typeof c> => !!c),
      productCount: _count.products,
    }));
    return { items, total, page, pageSize: take };
  }

  async get(id: string) {
    const live = await this.prisma.liveSession.findUnique({
      where: { id },
      include: {
        hostCharacters: true,
        products: {
          include: {
            product: { select: { id: true, name: true, displayCode: true, claimRiskLevel: true } },
          },
          orderBy: { pinOrder: 'asc' },
        },
      },
    });
    if (!live) throw new NotFoundException('ไม่พบ live session');

    const charMap = await this.fetchCharacterMap(live.hostCharacters.map((c) => c.characterId));
    const { hostCharacters, products, ...rest } = live;
    return {
      ...rest,
      hostCharacters: hostCharacters
        .map((hc) => charMap.get(hc.characterId))
        .filter((c): c is NonNullable<typeof c> => !!c),
      products: products.map((lp) => ({ ...lp.product, pinOrder: lp.pinOrder })),
    };
  }

  async create(dto: CreateLiveSessionDto, user: AuthUser, via = 'ui') {
    const { hostCharacterIds, products, scheduledAt, targetGmv, ...fields } = dto;

    const validCharacterIds = await this.validateCharacters(hostCharacterIds ?? []);
    await this.validateProducts((products ?? []).map((p) => p.productId));

    const live = await this.prisma.liveSession.create({
      data: {
        ...fields,
        scheduledAt: new Date(scheduledAt),
        targetGmv: targetGmv ?? undefined,
        hostCharacters: { create: validCharacterIds.map((characterId) => ({ characterId })) },
        products: {
          create: (products ?? []).map((p) => ({ productId: p.productId, pinOrder: p.pinOrder })),
        },
      },
    });
    await this.audit(user, via, 'create', live.id, { title: live.title, platform: live.platform });
    return this.get(live.id);
  }

  async update(id: string, dto: UpdateLiveSessionDto, user: AuthUser, via = 'ui') {
    const existing = await this.findRaw(id);

    if (dto.expectedUpdatedAt && new Date(dto.expectedUpdatedAt).getTime() !== existing.updatedAt.getTime()) {
      throw new ConflictException('ข้อมูลถูกแก้ไขโดยคนอื่นแล้ว กรุณา reload');
    }

    const { expectedUpdatedAt: _e, scheduledAt, targetGmv, ...fields } = dto;
    await this.prisma.liveSession.update({
      where: { id },
      data: {
        ...fields,
        ...(scheduledAt !== undefined ? { scheduledAt: new Date(scheduledAt) } : {}),
        ...(targetGmv !== undefined ? { targetGmv } : {}),
      },
    });
    await this.audit(user, via, 'update', id, { fields: Object.keys(fields) });
    return this.get(id);
  }

  async changeStatus(id: string, next: LiveStatus, user: AuthUser, via = 'ui') {
    const existing = await this.findRaw(id);

    const requiredAction = TRANSITIONS[existing.status]?.[next];
    if (!requiredAction) {
      throw new BadRequestException(`เปลี่ยน status ${existing.status} → ${next} ไม่ได้`);
    }
    if (!(await this.hasPermission(user, 'live', requiredAction))) {
      throw new ForbiddenException(`ต้องมีสิทธิ์ ${requiredAction} ใน module live`);
    }

    const live = await this.prisma.liveSession.update({
      where: { id },
      data: { status: next },
    });
    await this.audit(user, via, 'status_change', id, { from: existing.status, to: next });
    return live;
  }

  // PUT /live-sessions/:id/products — replace ชุดสินค้า + pinOrder ทั้งหมด
  async replaceProducts(id: string, items: LiveProductItemDto[], user: AuthUser, via = 'ui') {
    await this.findRaw(id);

    const ids = items.map((p) => p.productId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('มีสินค้าซ้ำกันในรายการ');
    }
    await this.validateProducts(ids);

    await this.prisma.$transaction([
      this.prisma.liveProduct.deleteMany({ where: { liveId: id } }),
      this.prisma.liveProduct.createMany({
        data: items.map((p) => ({ liveId: id, productId: p.productId, pinOrder: p.pinOrder })),
      }),
    ]);
    await this.audit(user, via, 'replace_products', id, { count: items.length });
    return this.get(id);
  }

  // ── helpers ────────────────────────────────────────────────

  private async findRaw(id: string) {
    const live = await this.prisma.liveSession.findUnique({ where: { id } });
    if (!live) throw new NotFoundException('ไม่พบ live session');
    return live;
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

  private async validateCharacters(ids: string[]) {
    if (!ids.length) return [];
    const unique = [...new Set(ids)];
    const rows = await this.prisma.character.findMany({
      where: { id: { in: unique } },
      select: { id: true },
    });
    if (rows.length !== unique.length) {
      throw new BadRequestException('มี character บางตัวที่เลือกไม่พบในระบบ');
    }
    return rows.map((r) => r.id);
  }

  private async validateProducts(ids: string[]) {
    if (!ids.length) return;
    const unique = [...new Set(ids)];
    const rows = await this.prisma.product.findMany({
      where: { id: { in: unique } },
      select: { id: true },
    });
    if (rows.length !== unique.length) {
      throw new BadRequestException('มีสินค้าบางรายการที่เลือกไม่พบในระบบ');
    }
  }

  private async hasPermission(user: AuthUser, module: string, action: string) {
    const count = await this.prisma.rolePermission.count({
      where: { module, actions: { has: action }, role: { key: { in: user.roles } } },
    });
    return count > 0;
  }

  private audit(user: AuthUser, via: string, action: string, entityId: string, meta: object) {
    return this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        via,
        action,
        entityType: 'live_session',
        entityId,
        meta: meta as Prisma.InputJsonValue,
      },
    });
  }
}
