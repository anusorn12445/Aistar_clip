import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/current-user.decorator';
import { TieInItemDto } from './dto/tie-in.dto';

// สรุปสินค้าแบบย่อ ที่แนบไปกับ tie-in (ให้ UI แสดง card/chip ได้เลย)
export const TIE_IN_PRODUCT_SUMMARY = {
  id: true,
  name: true,
  displayCode: true,
  category: true,
  price: true,
  status: true,
} satisfies Prisma.ProductSelect;

type ProductSummary = Prisma.ProductGetPayload<{ select: typeof TIE_IN_PRODUCT_SUMMARY }>;

// รูปทรง link ที่ส่งกลับให้ UI — ใช้ทั้ง endpoint tie-in และ detail GET ของแต่ละ entity
export function shapeTieIns(
  links: { productId: string; note: string | null; product: ProductSummary }[],
) {
  return links
    .map((l) => ({ productId: l.productId, note: l.note, product: l.product }))
    .sort((a, b) => a.product.name.localeCompare(b.product.name, 'th'));
}

type Entity = 'character' | 'series' | 'location';

@Injectable()
export class TieInProductsService {
  constructor(private prisma: PrismaService) {}

  // ─── Character ───────────────────────────────────────────────

  async getCharacterTieIns(characterId: string) {
    await this.mustExist('character', characterId);
    const links = await this.prisma.characterProduct.findMany({
      where: { characterId },
      include: { product: { select: TIE_IN_PRODUCT_SUMMARY } },
    });
    return shapeTieIns(links);
  }

  async setCharacterTieIns(characterId: string, items: TieInItemDto[], user: AuthUser, via = 'ui') {
    await this.mustExist('character', characterId);
    const clean = await this.validateItems(items);
    await this.prisma.$transaction([
      this.prisma.characterProduct.deleteMany({ where: { characterId } }),
      ...(clean.length
        ? [
            this.prisma.characterProduct.createMany({
              data: clean.map((c) => ({ characterId, productId: c.productId, note: c.note })),
            }),
          ]
        : []),
    ]);
    await this.audit(user, via, 'character', characterId, clean.length);
    return this.getCharacterTieIns(characterId);
  }

  // ─── Series ──────────────────────────────────────────────────

  async getSeriesTieIns(seriesId: string) {
    await this.mustExist('series', seriesId);
    const links = await this.prisma.seriesProduct.findMany({
      where: { seriesId },
      include: { product: { select: TIE_IN_PRODUCT_SUMMARY } },
    });
    return shapeTieIns(links);
  }

  async setSeriesTieIns(seriesId: string, items: TieInItemDto[], user: AuthUser, via = 'ui') {
    await this.mustExist('series', seriesId);
    const clean = await this.validateItems(items);
    await this.prisma.$transaction([
      this.prisma.seriesProduct.deleteMany({ where: { seriesId } }),
      ...(clean.length
        ? [
            this.prisma.seriesProduct.createMany({
              data: clean.map((c) => ({ seriesId, productId: c.productId, note: c.note })),
            }),
          ]
        : []),
    ]);
    await this.audit(user, via, 'series', seriesId, clean.length);
    return this.getSeriesTieIns(seriesId);
  }

  // ─── Location ────────────────────────────────────────────────

  async getLocationTieIns(locationId: string) {
    await this.mustExist('location', locationId);
    const links = await this.prisma.locationProduct.findMany({
      where: { locationId },
      include: { product: { select: TIE_IN_PRODUCT_SUMMARY } },
    });
    return shapeTieIns(links);
  }

  async setLocationTieIns(locationId: string, items: TieInItemDto[], user: AuthUser, via = 'ui') {
    await this.mustExist('location', locationId);
    const clean = await this.validateItems(items);
    await this.prisma.$transaction([
      this.prisma.locationProduct.deleteMany({ where: { locationId } }),
      ...(clean.length
        ? [
            this.prisma.locationProduct.createMany({
              data: clean.map((c) => ({ locationId, productId: c.productId, note: c.note })),
            }),
          ]
        : []),
    ]);
    await this.audit(user, via, 'location', locationId, clean.length);
    return this.getLocationTieIns(locationId);
  }

  // ─── helpers ─────────────────────────────────────────────────

  // dedupe ตาม productId (รายการหลังทับหน้า), ตรวจว่ามีสินค้าจริง → Thai 404
  private async validateItems(items: TieInItemDto[]) {
    const byId = new Map<string, string | null>();
    for (const it of items) {
      byId.set(it.productId, it.note?.trim() ? it.note.trim() : null);
    }
    const clean = [...byId.entries()].map(([productId, note]) => ({ productId, note }));

    if (clean.length) {
      const found = await this.prisma.product.count({
        where: { id: { in: clean.map((c) => c.productId) } },
      });
      if (found !== clean.length) {
        throw new NotFoundException('มีสินค้าบางรายการที่ไม่มีอยู่ในระบบ');
      }
    }
    return clean;
  }

  private async mustExist(entity: Entity, id: string) {
    const count =
      entity === 'character'
        ? await this.prisma.character.count({ where: { id } })
        : entity === 'series'
          ? await this.prisma.series.count({ where: { id } })
          : await this.prisma.location.count({ where: { id } });
    if (!count) throw new NotFoundException(`ไม่พบ ${entity}`);
  }

  private audit(user: AuthUser, via: string, entityType: Entity, entityId: string, count: number) {
    return this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        via,
        action: 'set_tie_in',
        entityType,
        entityId,
        meta: { count } as Prisma.InputJsonValue,
      },
    });
  }
}
