import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../auth/current-user.decorator';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { TIE_IN_PRODUCT_SUMMARY, shapeTieIns } from '../../tie-ins/tie-in-products.service';

export interface ListLocationsParams {
  q?: string;
  type?: string;
  regionStyle?: string;
  timeOfDay?: string;
  status?: string;
  sortBy?: string;
  page?: number;
}

// sort whitelist — กัน inject field แปลก ๆ
const SORT_FIELDS = ['name', 'updatedAt'] as const;

@Injectable()
export class LocationsService {
  constructor(private prisma: PrismaService) {}

  async list(params: ListLocationsParams) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const take = 20;

    const where: Prisma.LocationWhereInput = {
      // ไม่ระบุ status → ซ่อน archived (pattern เดียวกับ characters)
      ...(params.status ? { status: params.status } : { status: { not: 'archived' } }),
      ...(params.type ? { type: params.type } : {}),
      ...(params.regionStyle ? { regionStyle: params.regionStyle } : {}),
      ...(params.timeOfDay ? { timeOfDay: params.timeOfDay } : {}),
      ...(params.q
        ? {
            OR: [
              { name: { contains: params.q, mode: 'insensitive' } },
              { mood: { contains: params.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const sortBy = SORT_FIELDS.includes(params.sortBy as (typeof SORT_FIELDS)[number])
      ? (params.sortBy as (typeof SORT_FIELDS)[number])
      : 'updatedAt';
    const orderBy: Prisma.LocationOrderByWithRelationInput =
      sortBy === 'name' ? { name: 'asc' } : { updatedAt: 'desc' };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.location.findMany({ where, orderBy, skip: (page - 1) * take, take }),
      this.prisma.location.count({ where }),
    ]);
    return { items, total, page, pageSize: take };
  }

  async get(id: string) {
    const location = await this.prisma.location.findUnique({
      where: { id },
      include: {
        _count: { select: { episodes: true } },
        // สินค้าที่ tie-in (ไม่บังคับ)
        tieInProducts: { include: { product: { select: TIE_IN_PRODUCT_SUMMARY } } },
      },
    });
    if (!location) throw new NotFoundException('ไม่พบ location');
    const { _count, tieInProducts, ...fields } = location;
    return { ...fields, episodesCount: _count.episodes, tieInProducts: shapeTieIns(tieInProducts) };
  }

  async create(dto: CreateLocationDto, user: AuthUser, via = 'ui') {
    const location = await this.prisma.location.create({ data: { ...dto } });
    await this.audit(user, via, 'create', location.id, { name: location.name });
    return location;
  }

  async update(id: string, dto: UpdateLocationDto, user: AuthUser, via = 'ui') {
    await this.ensureExists(id);
    const location = await this.prisma.location.update({ where: { id }, data: { ...dto } });
    await this.audit(user, via, 'update', id, { fields: Object.keys(dto) });
    return location;
  }

  async archive(id: string, user: AuthUser, via = 'ui') {
    await this.ensureExists(id);
    const location = await this.prisma.location.update({
      where: { id },
      data: { status: 'archived' },
    });
    await this.audit(user, via, 'archive', id, {});
    return location;
  }

  private async ensureExists(id: string) {
    const found = await this.prisma.location.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw new NotFoundException('ไม่พบ location');
  }

  private audit(user: AuthUser, via: string, action: string, entityId: string, meta: object) {
    return this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        via,
        action,
        entityType: 'location',
        entityId,
        meta: meta as Prisma.InputJsonValue,
      },
    });
  }
}
