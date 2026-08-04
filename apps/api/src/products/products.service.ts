import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/current-user.decorator';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { sanitizeReviewBrief } from './review-brief.util';

// State machine: active ↔ paused → discontinued (ทางเดียว)
const STATUS_TRANSITIONS: Record<string, string[]> = {
  active: ['paused', 'discontinued'],
  paused: ['active', 'discontinued'],
  discontinued: [],
};

const SORT_FIELDS = [
  'name',
  'price',
  'salePrice',
  'soldMonth',
  'soldTotal',
  'rating',
  'stockQty',
  'createdAt',
  'updatedAt',
] as const;
type ProductSortField = (typeof SORT_FIELDS)[number];

export interface ListProductsParams {
  q?: string;
  brandId?: string;
  category?: string;
  claimRiskLevel?: string;
  status?: string;
  isAffiliate?: boolean;
  priceMin?: number;
  priceMax?: number;
  sortBy?: string;
  sortDir?: string;
  page?: number;
  pageSize?: number;
  // archived=1 → โชว์เฉพาะที่เก็บถาวร (default = ซ่อนที่เก็บถาวรเหมือนเดิม)
  archived?: boolean;
}

// ── Hard-delete guard: ทุก relation ที่ถือ productId = "งาน" ที่ผูกกับสินค้า ──
// ลบถาวรได้เฉพาะสินค้าสะอาด (ไม่มีงานอ้างอิงเลย) — มีงาน → 409 แนะนำเก็บถาวรแทน
const PRODUCT_REF_CHECKS: { label: string; count: (p: PrismaService, id: string) => Promise<number> }[] = [
  { label: 'แคมเปญ', count: (p, id) => p.campaignProduct.count({ where: { productId: id } }) },
  { label: 'ซีซัน Tie-in', count: (p, id) => p.seasonProduct.count({ where: { productId: id } }) },
  { label: 'ตอน (Episode)', count: (p, id) => p.episodeProduct.count({ where: { productId: id } }) },
  { label: 'ตัวละคร Tie-in', count: (p, id) => p.characterProduct.count({ where: { productId: id } }) },
  { label: 'ซีรีส์ Tie-in', count: (p, id) => p.seriesProduct.count({ where: { productId: id } }) },
  { label: 'โลเคชัน Tie-in', count: (p, id) => p.locationProduct.count({ where: { productId: id } }) },
  { label: 'คอนเทนต์', count: (p, id) => p.contentItemProduct.count({ where: { productId: id } }) },
  { label: 'คอนเทนต์ Affiliate', count: (p, id) => p.contentItem.count({ where: { productId: id } }) },
  { label: 'ไลฟ์', count: (p, id) => p.liveProduct.count({ where: { productId: id } }) },
  { label: 'งาน (Job)', count: (p, id) => p.jobProduct.count({ where: { productId: id } }) },
  { label: 'Clip Job', count: (p, id) => p.affiliateClipJob.count({ where: { productId: id } }) },
  { label: 'Director Run', count: (p, id) => p.directorRun.count({ where: { productId: id } }) },
  { label: 'Customer Feedback', count: (p, id) => p.customerFeedback.count({ where: { productId: id } }) },
  { label: 'Prompt Link', count: (p, id) => p.promptLink.count({ where: { entityType: 'product', entityId: id } }) },
];

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  async list(params: ListProductsParams) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const take = Math.min(Math.max(params.pageSize ?? 20, 1), 50); // pageSize ≤ 50

    const priceFilter: { gte?: number; lte?: number } | undefined =
      params.priceMin != null || params.priceMax != null
        ? {
            ...(params.priceMin != null ? { gte: params.priceMin } : {}),
            ...(params.priceMax != null ? { lte: params.priceMax } : {}),
          }
        : undefined;

    const where: Prisma.ProductWhereInput = {
      // default = ตัวที่ยังใช้งาน; archived=1 = เฉพาะที่เก็บถาวร (มุมมองกู้คืน)
      archivedAt: params.archived ? { not: null } : null,
      ...(params.brandId ? { brandId: params.brandId } : {}),
      ...(params.category ? { category: params.category } : {}),
      ...(params.claimRiskLevel ? { claimRiskLevel: params.claimRiskLevel } : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.isAffiliate != null ? { isAffiliate: params.isAffiliate } : {}),
      ...(priceFilter ? { price: priceFilter } : {}),
      ...(params.q
        ? {
            OR: [
              { name: { contains: params.q, mode: 'insensitive' } },
              { displayCode: { contains: params.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    // sort whitelist — กัน inject field แปลกๆ
    const sortBy: ProductSortField = SORT_FIELDS.includes(params.sortBy as ProductSortField)
      ? (params.sortBy as ProductSortField)
      : 'updatedAt';
    const sortDir: Prisma.SortOrder = params.sortDir === 'asc' ? 'asc' : 'desc';

    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        orderBy: { [sortBy]: sortDir },
        include: { brand: { select: { id: true, name: true } } },
        skip: (page - 1) * take,
        take,
      }),
      this.prisma.product.count({ where }),
    ]);

    // imageAssetId — รูป cover ต่อสินค้า (batch query เดียว, ไม่มี N+1)
    let imageByProduct = new Map<string, string>();
    if (items.length > 0) {
      const links = await this.prisma.assetLink.findMany({
        where: {
          entityType: 'product',
          entityId: { in: items.map((p) => p.id) },
          linkRole: 'cover',
          asset: { archivedAt: null, mimeType: { startsWith: 'image/' } },
        },
        select: { entityId: true, assetId: true },
      });
      imageByProduct = new Map(links.map((l) => [l.entityId, l.assetId]));
    }

    // hasAffiliateContent — สินค้าไหนมี ContentItem (sourceType 'affiliate') แล้ว
    // ใช้บอก UI ว่า "พร้อมโพสต์" vs "รอสร้าง" (batch query เดียว ไม่มี N+1)
    let withContent = new Set<string>();
    if (items.length > 0) {
      const generated = await this.prisma.contentItem.findMany({
        where: {
          sourceType: 'affiliate',
          productId: { in: items.map((p) => p.id) },
          archivedAt: null,
        },
        select: { productId: true },
        distinct: ['productId'],
      });
      withContent = new Set(generated.map((c) => c.productId).filter((id): id is string => Boolean(id)));
    }

    return {
      items: items.map((p) => ({
        ...p,
        imageAssetId: imageByProduct.get(p.id) ?? null,
        hasAffiliateContent: withContent.has(p.id),
      })),
      total,
      page,
      pageSize: take,
    };
  }

  async get(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        brand: true,
        _count: {
          select: {
            campaignProducts: true,
            episodeProducts: true,
            contentProducts: true,
            liveProducts: true,
          },
        },
      },
    });
    if (!product) throw new NotFoundException('ไม่พบสินค้า');
    const { _count, ...rest } = product;
    return {
      ...rest,
      usage: {
        campaigns: _count.campaignProducts,
        episodes: _count.episodeProducts,
        contents: _count.contentProducts,
        lives: _count.liveProducts,
      },
    };
  }

  async create(dto: CreateProductDto, user: AuthUser, via = 'ui') {
    if (dto.brandId) await this.ensureBrand(dto.brandId);
    if (dto.category) await this.ensureCategory(dto.category);
    const displayCode = await this.generateDisplayCode();
    const { platformLinks, reviewBrief, ...fields } = dto;
    const product = await this.prisma.product.create({
      data: {
        ...fields,
        platformLinks: platformLinks as Prisma.InputJsonValue | undefined,
        // Review Brief — sanitize เสมอ (trim/cap 20 รายการ) ก่อนเก็บ
        ...(reviewBrief != null
          ? { reviewBrief: sanitizeReviewBrief(reviewBrief) as unknown as Prisma.InputJsonValue }
          : {}),
        displayCode,
      },
    });
    await this.audit(user, via, 'create', product.id, { displayCode });
    return product;
  }

  async update(id: string, dto: UpdateProductDto, user: AuthUser, via = 'ui') {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('ไม่พบสินค้า');

    // optimistic locking (§F.1 ข้อ 6)
    if (dto.expectedUpdatedAt && new Date(dto.expectedUpdatedAt).getTime() !== existing.updatedAt.getTime()) {
      throw new ConflictException('ข้อมูลถูกแก้ไขโดยคนอื่นแล้ว กรุณา reload');
    }
    if (dto.brandId) await this.ensureBrand(dto.brandId);
    if (dto.category) await this.ensureCategory(dto.category);

    const { expectedUpdatedAt: _e, platformLinks, reviewBrief, ...fields } = dto;
    const product = await this.prisma.product.update({
      where: { id },
      data: {
        ...fields,
        ...(platformLinks !== undefined
          ? { platformLinks: platformLinks as Prisma.InputJsonValue }
          : {}),
        // Review Brief — sanitize ก่อนเก็บ; ส่ง null = ล้าง brief ทิ้ง
        ...(reviewBrief !== undefined
          ? {
              reviewBrief:
                reviewBrief === null
                  ? Prisma.DbNull
                  : (sanitizeReviewBrief(reviewBrief) as unknown as Prisma.InputJsonValue),
            }
          : {}),
      },
    });
    await this.audit(user, via, 'update', id, {
      fields: [
        ...Object.keys(fields),
        ...(platformLinks !== undefined ? ['platformLinks'] : []),
        ...(reviewBrief !== undefined ? ['reviewBrief'] : []),
      ],
    });
    return product;
  }

  async changeStatus(id: string, next: string, user: AuthUser, via = 'ui') {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('ไม่พบสินค้า');

    const allowed = STATUS_TRANSITIONS[existing.status] ?? [];
    if (!allowed.includes(next)) {
      throw new BadRequestException(`เปลี่ยน status ${existing.status} → ${next} ไม่ได้`);
    }
    const product = await this.prisma.product.update({ where: { id }, data: { status: next } });
    await this.audit(user, via, 'status_change', id, { from: existing.status, to: next });
    return product;
  }

  async archive(id: string, user: AuthUser, via = 'ui') {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('ไม่พบสินค้า');
    if (existing.archivedAt) throw new BadRequestException('สินค้านี้ถูก archive ไปแล้ว');
    const product = await this.prisma.product.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
    await this.audit(user, via, 'archive', id, {});
    return product;
  }

  // ── Products Management: restore / bulk ops / hard delete ──────────────

  async restore(id: string, user: AuthUser, via = 'ui') {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    // 404 ทั้ง "ไม่มีสินค้า" และ "ไม่ได้ถูกเก็บถาวร" — restore ใช้ได้กับของในกรุเท่านั้น
    if (!existing || !existing.archivedAt) {
      throw new NotFoundException('ไม่พบสินค้าที่ถูกเก็บถาวร');
    }
    const product = await this.prisma.product.update({
      where: { id },
      data: { archivedAt: null },
    });
    await this.audit(user, via, 'restore', id, {});
    return product;
  }

  async bulkArchive(ids: string[], user: AuthUser, via = 'ui') {
    await this.ensureAllExist(ids);
    const res = await this.prisma.product.updateMany({
      where: { id: { in: ids }, archivedAt: null },
      data: { archivedAt: new Date() },
    });
    await this.auditBulk(user, via, 'bulk_archive', { ids: ids.length, archived: res.count });
    return { archived: res.count };
  }

  async bulkRestore(ids: string[], user: AuthUser, via = 'ui') {
    await this.ensureAllExist(ids);
    const res = await this.prisma.product.updateMany({
      where: { id: { in: ids }, archivedAt: { not: null } },
      data: { archivedAt: null },
    });
    await this.auditBulk(user, via, 'bulk_restore', { ids: ids.length, restored: res.count });
    return { restored: res.count };
  }

  async bulkSetCategory(ids: string[], category: string, user: AuthUser, via = 'ui') {
    // bulk รับเฉพาะหมวด active — ไม่ยัดสินค้าเข้าหมวดที่เก็บถาวรแล้ว
    const found = await this.prisma.productCategory.count({
      where: { key: category, status: 'active' },
    });
    if (!found) throw new BadRequestException('ไม่พบหมวดหมู่นี้ (หรือถูกเก็บถาวรแล้ว)');
    await this.ensureAllExist(ids);
    const res = await this.prisma.product.updateMany({
      where: { id: { in: ids } },
      data: { category },
    });
    await this.auditBulk(user, via, 'bulk_set_category', {
      ids: ids.length,
      updated: res.count,
      category,
    });
    return { updated: res.count };
  }

  async bulkSetBrand(ids: string[], brandId: string | null, user: AuthUser, via = 'ui') {
    if (brandId) {
      const found = await this.prisma.brand.count({ where: { id: brandId, status: 'active' } });
      if (!found) throw new BadRequestException('ไม่พบแบรนด์ที่เลือก (หรือถูกเก็บถาวรแล้ว)');
    }
    await this.ensureAllExist(ids);
    const res = await this.prisma.product.updateMany({
      where: { id: { in: ids } },
      data: { brandId: brandId ?? null },
    });
    await this.auditBulk(user, via, 'bulk_set_brand', {
      ids: ids.length,
      updated: res.count,
      brandId: brandId ?? null,
    });
    return { updated: res.count };
  }

  /** ลบถาวร (admin X เท่านั้น) — บล็อคตายถ้ามีงานอ้างอิง; สินค้าสะอาด → ลบ + เก็บ snapshot ลง audit */
  async hardDelete(id: string, user: AuthUser, via = 'ui') {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('ไม่พบสินค้า');

    const counts = await Promise.all(PRODUCT_REF_CHECKS.map((c) => c.count(this.prisma, id)));
    const used = PRODUCT_REF_CHECKS.map((c, i) => ({ label: c.label, count: counts[i] })).filter(
      (r) => r.count > 0,
    );
    if (used.length > 0) {
      throw new ConflictException(
        `ลบถาวรไม่ได้ — สินค้านี้ผูกกับงานอยู่: ${used
          .map((r) => `${r.label} ${r.count}`)
          .join(', ')} → แนะนำเก็บถาวรแทน`,
      );
    }

    // ลิงก์รูป (AssetLink) ไม่ใช่ "งาน" — ลบแถวลิงก์ทิ้งไปด้วย แต่ไฟล์ Asset จริงยังอยู่
    await this.prisma.$transaction([
      this.prisma.assetLink.deleteMany({ where: { entityType: 'product', entityId: id } }),
      this.prisma.product.delete({ where: { id } }),
    ]);
    await this.audit(user, via, 'hard_delete', id, {
      name: existing.name,
      displayCode: existing.displayCode,
    });
    return { ok: true };
  }

  /** bulk ทุกตัว validate ก่อนว่า id ที่ส่งมามีจริงครบ — เจอ id มั่ว = 400 ทั้งก้อน ไม่ทำครึ่งๆ */
  private async ensureAllExist(ids: string[]) {
    const unique = [...new Set(ids)];
    const found = await this.prisma.product.findMany({
      where: { id: { in: unique } },
      select: { id: true },
    });
    if (found.length !== unique.length) {
      const foundSet = new Set(found.map((p) => p.id));
      const missing = unique.filter((i) => !foundSet.has(i));
      throw new BadRequestException(`ไม่พบสินค้า ${missing.length} รายการในระบบ`);
    }
  }

  private async ensureBrand(brandId: string) {
    const brand = await this.prisma.brand.count({ where: { id: brandId } });
    if (!brand) throw new BadRequestException('ไม่พบแบรนด์ที่เลือก');
  }

  // category = key ของ ProductCategory (รับได้ทั้ง active/archived — เก่าไม่พัง)
  private async ensureCategory(key: string) {
    const found = await this.prisma.productCategory.count({ where: { key } });
    if (!found) throw new BadRequestException('ไม่พบหมวดหมู่นี้');
  }

  // PRD-0001 — count+1 pattern เดียวกับ characters.service
  private async generateDisplayCode(): Promise<string> {
    const count = await this.prisma.product.count();
    return `PRD-${String(count + 1).padStart(4, '0')}`;
  }

  // bulk op ไม่มี entityId เดี่ยว (คอลัมน์เป็น uuid) — เก็บจำนวน ids ไว้ใน meta แทน
  private auditBulk(user: AuthUser, via: string, action: string, meta: object) {
    return this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        via,
        action,
        entityType: 'product',
        meta: meta as Prisma.InputJsonValue,
      },
    });
  }

  private audit(user: AuthUser, via: string, action: string, entityId: string, meta: object) {
    return this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        via,
        action,
        entityType: 'product',
        entityId,
        meta: meta as Prisma.InputJsonValue,
      },
    });
  }
}
