import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/current-user.decorator';
import {
  CreateCategoryDto,
  ReorderCategoriesDto,
  UpdateCategoryDto,
} from './dto/create-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  async list(params: { status?: string }) {
    const where: Prisma.ProductCategoryWhereInput = {
      ...(params.status ? { status: params.status } : {}),
    };
    const categories = await this.prisma.productCategory.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });

    // productCount = จำนวนสินค้าที่ category == key (batch group-by เดียว ไม่มี N+1)
    const grouped = await this.prisma.product.groupBy({
      by: ['category'],
      where: { archivedAt: null, category: { not: null } },
      _count: { _all: true },
    });
    const countByKey = new Map(
      grouped.map((g) => [g.category as string, g._count._all]),
    );

    return categories.map((c) => ({
      ...c,
      productCount: countByKey.get(c.key) ?? 0,
    }));
  }

  async create(dto: CreateCategoryDto, user: AuthUser, via = 'ui') {
    const key = await this.generateKey(dto.label);
    const category = await this.prisma.productCategory.create({
      data: {
        key,
        label: dto.label.trim(),
        sortOrder: dto.sortOrder ?? 0,
      },
    });
    await this.audit(user, via, 'create', category.id, {
      key: category.key,
      label: category.label,
    });
    return { ...category, productCount: 0 };
  }

  async update(id: string, dto: UpdateCategoryDto, user: AuthUser, via = 'ui') {
    const existing = await this.prisma.productCategory.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('ไม่พบหมวดหมู่');

    // key เปลี่ยนไม่ได้ (immutable) — รับเฉพาะ label/sortOrder/status
    const data: Prisma.ProductCategoryUpdateInput = {};
    if (dto.label !== undefined) data.label = dto.label.trim();
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.status !== undefined) data.status = dto.status;

    const category = await this.prisma.productCategory.update({ where: { id }, data });
    const productCount = await this.prisma.product.count({
      where: { archivedAt: null, category: existing.key },
    });
    await this.audit(user, via, 'update', id, { fields: Object.keys(data) });
    return { ...category, productCount };
  }

  async reorder(dto: ReorderCategoriesDto, user: AuthUser, via = 'ui') {
    await this.prisma.$transaction(
      dto.ids.map((id, index) =>
        this.prisma.productCategory.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );
    await this.audit(user, via, 'reorder', 'product_category', { ids: dto.ids });
    return this.list({});
  }

  async remove(id: string, user: AuthUser, via = 'ui') {
    const existing = await this.prisma.productCategory.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('ไม่พบหมวดหมู่');
    if (existing.builtin) {
      throw new BadRequestException('หมวดหมู่พื้นฐานลบไม่ได้ (เก็บเข้ากรุแทนได้)');
    }
    const productCount = await this.prisma.product.count({
      where: { archivedAt: null, category: existing.key },
    });
    if (productCount > 0) {
      throw new ConflictException(
        `มีสินค้าใช้หมวดนี้อยู่ (${productCount} ชิ้น) เก็บเข้ากรุแทนได้`,
      );
    }
    await this.prisma.productCategory.delete({ where: { id } });
    await this.audit(user, via, 'delete', id, { key: existing.key });
    return { ok: true };
  }

  /** key immutable — ascii slug ของ label; ถ้าว่าง (ไทยล้วน) fallback เป็น cat_<uuid8>; กัน key ชนด้วย -2/-3… */
  private async generateKey(label: string): Promise<string> {
    const base =
      label
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') ||
      `cat_${randomUuidSlug()}`;

    let candidate = base;
    let n = 2;
    // loop จนกว่าจะไม่ชน (unique constraint บน key)
    while (await this.prisma.productCategory.findUnique({ where: { key: candidate } })) {
      candidate = `${base}-${n}`;
      n++;
    }
    return candidate;
  }

  private audit(
    user: AuthUser,
    via: string,
    action: string,
    entityId: string,
    meta: object,
  ) {
    return this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        via,
        action,
        entityType: 'product_category',
        entityId,
        meta: meta as Prisma.InputJsonValue,
      },
    });
  }
}

// first 8 chars ของ uuid v4 (ไม่พึ่ง crypto import — ใช้ randomUUID ผ่าน globalThis)
function randomUuidSlug(): string {
  const uuid =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : require('node:crypto').randomUUID();
  return uuid.replace(/-/g, '').slice(0, 8);
}
