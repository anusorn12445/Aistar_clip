import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CampaignStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/current-user.decorator';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';

// State machine ตาม PRD §11: brief→planning→production→review→published→completed
// ทุก status (ยกเว้น archived) ถอยไป archived ได้
const TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  brief: ['planning', 'archived'],
  planning: ['production', 'archived'],
  production: ['review', 'archived'],
  review: ['published', 'archived'],
  published: ['completed', 'archived'],
  completed: ['archived'],
  archived: [],
};

const SORT_FIELDS = ['name', 'startDate', 'status', 'updatedAt'] as const;
type CampaignSortField = (typeof SORT_FIELDS)[number];

export interface ListCampaignsParams {
  q?: string;
  status?: CampaignStatus;
  objective?: string;
  characterId?: string;
  productId?: string;
  ownerId?: string;
  startFrom?: string;
  startTo?: string;
  sortBy?: string;
  sortDir?: string;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class CampaignsService {
  constructor(private prisma: PrismaService) {}

  async list(params: ListCampaignsParams) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const take = Math.min(Math.max(params.pageSize ?? 20, 1), 50); // pageSize ≤ 50

    const startFilter: Prisma.DateTimeNullableFilter | undefined =
      params.startFrom || params.startTo
        ? {
            ...(params.startFrom ? { gte: new Date(params.startFrom) } : {}),
            ...(params.startTo ? { lte: new Date(params.startTo) } : {}),
          }
        : undefined;

    const where: Prisma.CampaignWhereInput = {
      archivedAt: null,
      ...(params.status ? { status: params.status } : {}),
      ...(params.objective ? { objective: params.objective } : {}),
      ...(params.ownerId ? { ownerId: params.ownerId } : {}),
      ...(params.characterId ? { characters: { some: { characterId: params.characterId } } } : {}),
      ...(params.productId ? { products: { some: { productId: params.productId } } } : {}),
      ...(startFilter ? { startDate: startFilter } : {}),
      ...(params.q
        ? {
            OR: [
              { name: { contains: params.q, mode: 'insensitive' } },
              { displayCode: { contains: params.q, mode: 'insensitive' } },
              { clientBrand: { contains: params.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const sortBy: CampaignSortField = SORT_FIELDS.includes(params.sortBy as CampaignSortField)
      ? (params.sortBy as CampaignSortField)
      : 'updatedAt';
    const sortDir: Prisma.SortOrder = params.sortDir === 'asc' ? 'asc' : 'desc';

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.campaign.findMany({
        where,
        orderBy: { [sortBy]: sortDir },
        include: {
          characters: true,
          products: { include: { product: { select: { id: true, name: true } } } },
          _count: { select: { episodes: true, contents: true } },
        },
        skip: (page - 1) * take,
        take,
      }),
      this.prisma.campaign.count({ where }),
    ]);

    // CampaignCharacter ไม่มี relation ไป Character — fetch เป็น batch เดียวแล้ว map กลับ
    const characterIds = [...new Set(rows.flatMap((c) => c.characters.map((cc) => cc.characterId)))];
    const characterRows = characterIds.length
      ? await this.prisma.character.findMany({
          where: { id: { in: characterIds } },
          select: { id: true, nameTh: true, displayCode: true },
        })
      : [];
    const charMap = new Map(characterRows.map((c) => [c.id, c]));

    const items = rows.map(({ characters, products, _count, ...rest }) => ({
      ...rest,
      characters: characters
        .map((cc) => charMap.get(cc.characterId))
        .filter((c): c is NonNullable<typeof c> => !!c),
      products: products.map((cp) => cp.product),
      counts: { episodes: _count.episodes, contents: _count.contents },
    }));
    return { items, total, page, pageSize: take };
  }

  async get(id: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
      include: {
        characters: true,
        products: {
          include: {
            product: {
              select: { id: true, name: true, displayCode: true, status: true, claimRiskLevel: true },
            },
          },
        },
        episodes: {
          select: { id: true, displayCode: true, title: true, status: true },
          orderBy: { updatedAt: 'desc' },
        },
        contents: {
          select: { id: true, title: true, status: true, platform: true },
          orderBy: { updatedAt: 'desc' },
        },
      },
    });
    if (!campaign) throw new NotFoundException('ไม่พบแคมเปญ');

    const characterIds = campaign.characters.map((cc) => cc.characterId);
    const characterRows = characterIds.length
      ? await this.prisma.character.findMany({
          where: { id: { in: characterIds } },
          select: { id: true, nameTh: true, nameEn: true, displayCode: true, status: true },
        })
      : [];

    const { characters: _cc, products, ...rest } = campaign;
    return {
      ...rest,
      characters: characterRows,
      products: products.map((cp) => cp.product),
    };
  }

  async create(dto: CreateCampaignDto, user: AuthUser, via = 'ui') {
    const displayCode = await this.generateDisplayCode();
    const { startDate, endDate, targetKpi, ...fields } = dto;
    const campaign = await this.prisma.campaign.create({
      data: {
        ...fields,
        displayCode,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        targetKpi: targetKpi as Prisma.InputJsonValue | undefined,
        ownerId: dto.ownerId ?? user.id,
      },
    });
    await this.audit(user, via, 'create', campaign.id, { displayCode });
    return campaign;
  }

  async update(id: string, dto: UpdateCampaignDto, user: AuthUser, via = 'ui') {
    const existing = await this.findRaw(id);

    // optimistic locking (§F.1 ข้อ 6)
    if (dto.expectedUpdatedAt && new Date(dto.expectedUpdatedAt).getTime() !== existing.updatedAt.getTime()) {
      throw new ConflictException('ข้อมูลถูกแก้ไขโดยคนอื่นแล้ว กรุณา reload');
    }

    const { expectedUpdatedAt: _e, startDate, endDate, targetKpi, ...fields } = dto;
    const campaign = await this.prisma.campaign.update({
      where: { id },
      data: {
        ...fields,
        ...(startDate !== undefined ? { startDate: startDate ? new Date(startDate) : null } : {}),
        ...(endDate !== undefined ? { endDate: endDate ? new Date(endDate) : null } : {}),
        ...(targetKpi !== undefined ? { targetKpi: targetKpi as Prisma.InputJsonValue } : {}),
      },
    });
    await this.audit(user, via, 'update', id, { fields: Object.keys(fields) });
    return campaign;
  }

  async changeStatus(id: string, next: CampaignStatus, user: AuthUser, via = 'ui') {
    const existing = await this.findRaw(id);

    if (!TRANSITIONS[existing.status].includes(next)) {
      throw new BadRequestException(`เปลี่ยน status ${existing.status} → ${next} ไม่ได้`);
    }

    // review → published ต้องมีสิทธิ์ Approve และทำผ่าน UI โดยมนุษย์เท่านั้น (guardrail §28.2)
    if (next === 'published') {
      if (via !== 'ui') {
        throw new ForbiddenException('การ publish แคมเปญทำได้ผ่าน UI โดยมนุษย์เท่านั้น');
      }
      const canApprove = await this.prisma.rolePermission.count({
        where: { module: 'campaign', actions: { has: 'A' }, role: { key: { in: user.roles } } },
      });
      if (!canApprove) throw new ForbiddenException('ต้องมีสิทธิ์ Approve ใน module campaign');
    }

    const campaign = await this.prisma.campaign.update({
      where: { id },
      data: { status: next, ...(next === 'archived' ? { archivedAt: new Date() } : {}) },
    });
    await this.audit(user, via, 'status_change', id, { from: existing.status, to: next });
    return campaign;
  }

  // ── Linked characters ──────────────────────────────────────

  async addCharacter(id: string, characterId: string, user: AuthUser, via = 'ui') {
    await this.findRaw(id);
    const character = await this.prisma.character.findUnique({ where: { id: characterId } });
    if (!character) throw new BadRequestException('ไม่พบ character ที่เลือก');

    // idempotent add
    const existing = await this.prisma.campaignCharacter.findUnique({
      where: { campaignId_characterId: { campaignId: id, characterId } },
    });
    if (!existing) {
      await this.prisma.campaignCharacter.create({ data: { campaignId: id, characterId } });
      await this.audit(user, via, 'link_character', id, { characterId, displayCode: character.displayCode });
    }
    return { ok: true, characterId };
  }

  async removeCharacter(id: string, characterId: string, user: AuthUser, via = 'ui') {
    await this.findRaw(id);
    await this.prisma.campaignCharacter.deleteMany({ where: { campaignId: id, characterId } });
    await this.audit(user, via, 'unlink_character', id, { characterId });
    return { ok: true };
  }

  // ── Linked products ────────────────────────────────────────

  async addProduct(id: string, productId: string, user: AuthUser, via = 'ui') {
    await this.findRaw(id);
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new BadRequestException('ไม่พบสินค้าที่เลือก');

    const existing = await this.prisma.campaignProduct.findUnique({
      where: { campaignId_productId: { campaignId: id, productId } },
    });
    if (!existing) {
      await this.prisma.campaignProduct.create({ data: { campaignId: id, productId } });
      await this.audit(user, via, 'link_product', id, { productId, displayCode: product.displayCode });
    }
    return { ok: true, productId };
  }

  async removeProduct(id: string, productId: string, user: AuthUser, via = 'ui') {
    await this.findRaw(id);
    await this.prisma.campaignProduct.deleteMany({ where: { campaignId: id, productId } });
    await this.audit(user, via, 'unlink_product', id, { productId });
    return { ok: true };
  }

  private async findRaw(id: string) {
    const campaign = await this.prisma.campaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException('ไม่พบแคมเปญ');
    return campaign;
  }

  // CMP-0001 — count+1 pattern เดียวกับ characters.service
  private async generateDisplayCode(): Promise<string> {
    const count = await this.prisma.campaign.count();
    return `CMP-${String(count + 1).padStart(4, '0')}`;
  }

  private audit(user: AuthUser, via: string, action: string, entityId: string, meta: object) {
    return this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        via,
        action,
        entityType: 'campaign',
        entityId,
        meta: meta as Prisma.InputJsonValue,
      },
    });
  }
}
