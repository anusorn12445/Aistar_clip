import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApprovalStatus, CampaignStatus, Character, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/current-user.decorator';
import { CreateCharacterDto } from './dto/create-character.dto';
import { CharacterBlueprintsService } from './character-blueprints.service';
import { UpdateCharacterDto } from './dto/update-character.dto';
import { TIE_IN_PRODUCT_SUMMARY, shapeTieIns } from '../tie-ins/tie-in-products.service';

// campaign ที่นับว่า "กำลังใช้งาน character" สำหรับ filter availability
const ACTIVE_CAMPAIGN_STATUSES: CampaignStatus[] = ['planning', 'production', 'review'];

export type CharacterSortBy = 'updatedAt' | 'createdAt' | 'nameTh' | 'gmv' | 'views' | 'usage';

export interface ListCharactersParams {
  q?: string;
  status?: ApprovalStatus;
  page?: number;
  universe?: string;
  seriesName?: string;
  gender?: string;
  region?: string;
  roleLabel?: string;
  ageMin?: number;
  ageMax?: number;
  hasImage?: '0' | '1';
  bibleComplete?: '0' | '1';
  hasVoice?: '0' | '1';
  productCategory?: string;
  claimRisk?: 'low' | 'medium' | 'high';
  brandSafety?: 'low' | 'medium' | 'high';
  availability?: 'free' | 'busy' | 'unused';
  tagIds?: string[];
  // ── Relationship-based filters (additive, combine กับตัวอื่นแบบ AND) ──
  categoryIds?: string[]; // มีประเภทตัวละคร "อย่างน้อยหนึ่ง" ในชุดนี้ (ANY)
  reviewedProductId?: string; // เคยรีวิว/อยู่ในคอนเทนต์ที่ผูกสินค้านี้
  seriesId?: string; // อยู่ใน series นี้ (ผ่าน SeriesCharacter หรือ Episode)
  brandId?: string; // เคยทำงานกับแบรนด์นี้ (ผ่าน Job→Client หรือ content→product)
  clientId?: string; // เคยทำงานให้ลูกค้ารายนี้ (ผ่าน Job)
  campaignId?: string; // อยู่ในแคมเปญนี้ (CampaignCharacter หรือ content.campaignId)
  tieInProductId?: string; // มีสินค้า tie-in นี้
  audienceSegmentId?: string; // ผูกกลุ่มผู้ชมนี้
  hasLived?: '0' | '1'; // เคยไลฟ์ (LiveCharacter)
  sortByGmv?: '0' | '1'; // เรียงตามยอดขายรวม (top presenters ก่อน)
  sortBy?: CharacterSortBy;
  archived?: '0' | '1'; // '1' = ดูเฉพาะตัวที่เก็บแล้ว (default = ไม่รวม)
}

// State machine ตาม addendum §D.2
const TRANSITIONS: Record<ApprovalStatus, ApprovalStatus[]> = {
  draft: ['internal_review', 'archived'],
  internal_review: ['approved', 'revision_needed', 'archived'],
  revision_needed: ['draft', 'archived'],
  approved: ['production_ready', 'archived'],
  production_ready: ['archived'],
  rejected: ['archived'],
  archived: ['draft'], // กู้คืน (unarchive) กลับมาเป็น draft ได้
};

// transition ที่ต้องมีสิทธิ์ Approve (มนุษย์เท่านั้น — MCP ไม่มีทางมาถึงจุดนี้ตาม D8)
const NEEDS_APPROVE: ApprovalStatus[] = ['approved', 'production_ready', 'rejected'];

@Injectable()
export class CharactersService {
  constructor(
    private prisma: PrismaService,
    private blueprints: CharacterBlueprintsService,
  ) {}

  async list(params: ListCharactersParams) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const take = 20;
    const and: Prisma.CharacterWhereInput[] = [];
    const where: Prisma.CharacterWhereInput = {
      // archived=1 → ดูเฉพาะตัวที่เก็บแล้ว (ค่า default เดิม: ไม่รวม archived)
      archivedAt: params.archived === '1' ? { not: null } : null,
      AND: and,
      ...(params.status ? { status: params.status } : {}),
      ...(params.universe ? { universe: params.universe } : {}),
      ...(params.seriesName ? { series: params.seriesName } : {}),
      ...(params.gender ? { gender: params.gender } : {}),
      ...(params.region ? { region: params.region } : {}),
      ...(params.roleLabel
        ? { roleLabel: { contains: params.roleLabel, mode: 'insensitive' } }
        : {}),
      ...(params.ageMin != null || params.ageMax != null
        ? {
            age: {
              ...(params.ageMin != null ? { gte: params.ageMin } : {}),
              ...(params.ageMax != null ? { lte: params.ageMax } : {}),
            },
          }
        : {}),
      ...(params.q
        ? {
            OR: [
              { nameTh: { contains: params.q, mode: 'insensitive' } },
              { nameEn: { contains: params.q, mode: 'insensitive' } },
              { nickname: { contains: params.q, mode: 'insensitive' } },
              { displayCode: { contains: params.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    // ── Commerce (JSON) filters ──
    if (params.claimRisk) {
      and.push({ commerceProfile: { path: ['claim_risk_level'], equals: params.claimRisk } });
    }
    if (params.brandSafety) {
      and.push({ commerceProfile: { path: ['brand_safety_level'], equals: params.brandSafety } });
    }
    if (params.productCategory) {
      // ILIKE ตรง ๆ กับ text ของ array suitable_product_categories — parameterized เสมอ
      const rows = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT id::text AS id FROM characters
        WHERE "commerceProfile"->>'suitable_product_categories' ILIKE ${'%' + params.productCategory + '%'}`;
      and.push({ id: { in: rows.map((r) => r.id) } });
    }

    // ── ความพร้อม (EXISTS-style ผ่าน id sets — สเกลหลักร้อยตัว เพียงพอ) ──
    if (params.hasImage === '1' || params.hasImage === '0') {
      const ids = await this.characterIdsWithImage();
      and.push(params.hasImage === '1' ? { id: { in: ids } } : { id: { notIn: ids } });
    }
    if (params.hasVoice === '1' || params.hasVoice === '0') {
      const profiles = await this.prisma.characterVoiceProfile.findMany({
        select: { characterId: true },
        distinct: ['characterId'],
      });
      const ids = profiles.map((p) => p.characterId);
      and.push(params.hasVoice === '1' ? { id: { in: ids } } : { id: { notIn: ids } });
    }
    if (params.bibleComplete === '1' || params.bibleComplete === '0') {
      // "Bible ครบ" = persona + visualDna non-null และไม่ trivial
      // (visualDna มี key >0, persona มี key >1 หรือมี short_bio) — เช็คด้วย jsonb ใน DB
      const rows = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT id::text AS id FROM characters
        WHERE persona IS NOT NULL AND "visualDna" IS NOT NULL
          AND jsonb_typeof("visualDna") = 'object' AND "visualDna" <> '{}'::jsonb
          AND jsonb_typeof(persona) = 'object'
          AND ((SELECT count(*) FROM jsonb_object_keys(persona)) > 1 OR persona ? 'short_bio')`;
      const ids = rows.map((r) => r.id);
      and.push(params.bibleComplete === '1' ? { id: { in: ids } } : { id: { notIn: ids } });
    }

    // ── สถานะงาน (availability) ──
    if (params.availability) {
      if (params.availability === 'unused') {
        const used = await this.prisma.campaignCharacter.findMany({
          select: { characterId: true },
          distinct: ['characterId'],
        });
        and.push({ id: { notIn: used.map((u) => u.characterId) } });
      } else {
        const busy = await this.prisma.campaignCharacter.findMany({
          where: { campaign: { status: { in: ACTIVE_CAMPAIGN_STATUSES }, archivedAt: null } },
          select: { characterId: true },
          distinct: ['characterId'],
        });
        const busyIds = busy.map((b) => b.characterId);
        and.push(
          params.availability === 'busy' ? { id: { in: busyIds } } : { id: { notIn: busyIds } },
        );
      }
    }

    // ── Tags: ต้องมีครบทุก tag ที่ระบุ (AND) ──
    if (params.tagIds && params.tagIds.length > 0) {
      const wanted = [...new Set(params.tagIds)];
      const links = await this.prisma.entityTag.findMany({
        where: { entityType: 'character', tagId: { in: wanted } },
        select: { entityId: true, tagId: true },
      });
      const countByEntity = new Map<string, number>();
      for (const l of links) countByEntity.set(l.entityId, (countByEntity.get(l.entityId) ?? 0) + 1);
      const ids = [...countByEntity.entries()].filter(([, n]) => n === wanted.length).map(([id]) => id);
      and.push({ id: { in: ids } });
    }

    // ── Relationship-based filters ──
    // แต่ละอันแปลงเป็น "ชุด character id ที่ match" ด้วย query แบบ batch (findMany select / groupBy)
    // แล้ว push { id: { in: ids } } เข้า AND — intersect กับ filter อื่น ๆ เอง (ไม่มี N+1)

    // ประเภทตัวละคร: มีอย่างน้อยหนึ่งในชุดนี้ (ANY — multi-category เป็นเรื่องปกติ)
    if (params.categoryIds && params.categoryIds.length > 0) {
      const links = await this.prisma.characterCategoryLink.findMany({
        where: { categoryId: { in: [...new Set(params.categoryIds)] } },
        select: { characterId: true },
        distinct: ['characterId'],
      });
      and.push({ id: { in: links.map((l) => l.characterId) } });
    }

    // รีวิวสินค้า X: ตัวละครอยู่ในคอนเทนต์ที่ผูกสินค้า X (productId ตรง หรือ ContentItemProduct)
    if (params.reviewedProductId) {
      const ids = await this.charactersInContents(
        await this.contentItemIdsForProduct(params.reviewedProductId),
      );
      and.push({ id: { in: ids } });
    }

    // Series X: ผ่าน SeriesCharacter หรือ EpisodeCharacter → Episode.seriesId (dedupe)
    if (params.seriesId) {
      const [seriesLinks, episodes] = await Promise.all([
        this.prisma.seriesCharacter.findMany({
          where: { seriesId: params.seriesId },
          select: { characterId: true },
        }),
        this.prisma.episode.findMany({
          where: { seriesId: params.seriesId },
          select: { id: true },
        }),
      ]);
      const epChars = episodes.length
        ? await this.prisma.episodeCharacter.findMany({
            where: { episodeId: { in: episodes.map((e) => e.id) } },
            select: { characterId: true },
          })
        : [];
      const ids = [
        ...new Set([
          ...seriesLinks.map((l) => l.characterId),
          ...epChars.map((l) => l.characterId),
        ]),
      ];
      and.push({ id: { in: ids } });
    }

    // แบรนด์ X: Job→Client.brandId=X (union) content→product(brandId=X)
    if (params.brandId) {
      const [jobs, brandProducts] = await Promise.all([
        this.prisma.job.findMany({
          where: { client: { brandId: params.brandId } },
          select: { id: true },
        }),
        this.prisma.product.findMany({
          where: { brandId: params.brandId },
          select: { id: true },
        }),
      ]);
      const jobChars = jobs.length
        ? await this.prisma.jobPresenter.findMany({
            where: { jobId: { in: jobs.map((j) => j.id) } },
            select: { characterId: true },
          })
        : [];
      const contentChars = await this.charactersInContents(
        await this.contentItemIdsForProducts(brandProducts.map((p) => p.id)),
      );
      const ids = [
        ...new Set([...jobChars.map((l) => l.characterId), ...contentChars]),
      ];
      and.push({ id: { in: ids } });
    }

    // ลูกค้า X: Job.clientId=X → JobPresenter
    if (params.clientId) {
      const jobs = await this.prisma.job.findMany({
        where: { clientId: params.clientId },
        select: { id: true },
      });
      const jobChars = jobs.length
        ? await this.prisma.jobPresenter.findMany({
            where: { jobId: { in: jobs.map((j) => j.id) } },
            select: { characterId: true },
            distinct: ['characterId'],
          })
        : [];
      and.push({ id: { in: jobChars.map((l) => l.characterId) } });
    }

    // แคมเปญ X: CampaignCharacter (union) content.campaignId=X
    if (params.campaignId) {
      const [campaignChars, contents] = await Promise.all([
        this.prisma.campaignCharacter.findMany({
          where: { campaignId: params.campaignId },
          select: { characterId: true },
        }),
        this.prisma.contentItem.findMany({
          where: { campaignId: params.campaignId },
          select: { id: true },
        }),
      ]);
      const contentChars = await this.charactersInContents(contents.map((c) => c.id));
      const ids = [
        ...new Set([...campaignChars.map((l) => l.characterId), ...contentChars]),
      ];
      and.push({ id: { in: ids } });
    }

    // สินค้า tie-in X: CharacterProduct
    if (params.tieInProductId) {
      const links = await this.prisma.characterProduct.findMany({
        where: { productId: params.tieInProductId },
        select: { characterId: true },
      });
      and.push({ id: { in: links.map((l) => l.characterId) } });
    }

    // กลุ่มผู้ชม X: CharacterAudience
    if (params.audienceSegmentId) {
      const links = await this.prisma.characterAudience.findMany({
        where: { segmentId: params.audienceSegmentId },
        select: { characterId: true },
      });
      and.push({ id: { in: links.map((l) => l.characterId) } });
    }

    // เคยไลฟ์: LiveCharacter
    if (params.hasLived === '1' || params.hasLived === '0') {
      const lived = await this.prisma.liveCharacter.findMany({
        select: { characterId: true },
        distinct: ['characterId'],
      });
      const ids = lived.map((l) => l.characterId);
      and.push(params.hasLived === '1' ? { id: { in: ids } } : { id: { notIn: ids } });
    }

    // ── Sorting ──
    // sortByGmv=1 → บังคับเรียงตามยอดขายรวม (top presenters ก่อน) แม้ไม่ได้ส่ง sortBy
    const sortBy: CharacterSortBy =
      params.sortByGmv === '1' ? 'gmv' : (params.sortBy ?? 'updatedAt');
    const isAggregateSort = sortBy === 'gmv' || sortBy === 'views' || sortBy === 'usage';

    let items: Character[];
    let total: number;
    let metricById: Map<string, number> | null = null;

    if (isAggregateSort) {
      // ดึงเฉพาะ id ทั้งชุด → aggregate เป็น batch → sort ใน memory → ค่อย fetch หน้าเดียว
      const matched = await this.prisma.character.findMany({
        where,
        select: { id: true, updatedAt: true },
      });
      metricById = await this.aggregateMetric(matched.map((m) => m.id), sortBy);
      const m = metricById;
      const sorted = [...matched].sort(
        (a, b) =>
          (m.get(b.id) ?? 0) - (m.get(a.id) ?? 0) || b.updatedAt.getTime() - a.updatedAt.getTime(),
      );
      total = sorted.length;
      const pageIds = sorted.slice((page - 1) * take, page * take).map((s) => s.id);
      const rows = await this.prisma.character.findMany({ where: { id: { in: pageIds } } });
      const byId = new Map(rows.map((r) => [r.id, r]));
      items = pageIds.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => !!r);
    } else {
      const orderBy: Prisma.CharacterOrderByWithRelationInput =
        sortBy === 'createdAt'
          ? { createdAt: 'desc' }
          : sortBy === 'nameTh'
            ? { nameTh: 'asc' }
            : { updatedAt: 'desc' };
      [items, total] = await this.prisma.$transaction([
        this.prisma.character.findMany({ where, orderBy, skip: (page - 1) * take, take }),
        this.prisma.character.count({ where }),
      ]);
    }

    const pageIds = items.map((c) => c.id);

    // thumbAssetId — รูป primary_reference ต่อตัว (batch query เดียว, ไม่มี N+1)
    let thumbByCharacter = new Map<string, string>();
    // tags + จำนวน campaign ที่กำลังใช้งานอยู่ + ประเภทตัวละคร (batch เช่นกัน)
    const tagsByCharacter = new Map<string, { id: string; name: string }[]>();
    const activeCampaigns = new Map<string, number>();
    const categoriesByCharacter = new Map<string, { id: string; label: string }[]>();
    if (pageIds.length > 0) {
      const [links, tagLinks, campaignLinks, categoryLinks] = await Promise.all([
        this.prisma.assetLink.findMany({
          where: {
            entityType: 'character',
            entityId: { in: pageIds },
            linkRole: 'primary_reference',
            asset: { archivedAt: null, mimeType: { startsWith: 'image/' } },
          },
          select: { entityId: true, assetId: true },
        }),
        this.prisma.entityTag.findMany({
          where: { entityType: 'character', entityId: { in: pageIds } },
          include: { tag: true },
        }),
        this.prisma.campaignCharacter.findMany({
          where: {
            characterId: { in: pageIds },
            campaign: { status: { in: ACTIVE_CAMPAIGN_STATUSES }, archivedAt: null },
          },
          select: { characterId: true },
        }),
        this.prisma.characterCategoryLink.findMany({
          where: { characterId: { in: pageIds } },
          include: { category: { select: { id: true, label: true, sortOrder: true } } },
        }),
      ]);
      thumbByCharacter = new Map(links.map((l) => [l.entityId, l.assetId]));
      for (const t of tagLinks) {
        const list = tagsByCharacter.get(t.entityId) ?? [];
        list.push({ id: t.tag.id, name: t.tag.name });
        tagsByCharacter.set(t.entityId, list);
      }
      for (const c of campaignLinks) {
        activeCampaigns.set(c.characterId, (activeCampaigns.get(c.characterId) ?? 0) + 1);
      }
      for (const cl of categoryLinks) {
        const list = categoriesByCharacter.get(cl.characterId) ?? [];
        list.push({ id: cl.category.id, label: cl.category.label });
        categoriesByCharacter.set(cl.characterId, list);
      }
    }

    return {
      items: items.map((c) => ({
        ...c,
        thumbAssetId: thumbByCharacter.get(c.id) ?? null,
        tags: (tagsByCharacter.get(c.id) ?? []).sort((a, b) => a.name.localeCompare(b.name, 'th')),
        campaignActiveCount: activeCampaigns.get(c.id) ?? 0,
        categories: (categoriesByCharacter.get(c.id) ?? []).sort((a, b) =>
          a.label.localeCompare(b.label, 'th'),
        ),
        // แนบค่า metric เมื่อ sort ด้วย aggregate เพื่อให้ UI โชว์ badge ได้
        ...(metricById ? { metric: metricById.get(c.id) ?? 0 } : {}),
      })),
      total,
      page,
      pageSize: take,
    };
  }

  /** สรุปภาพรวม + ตัวเลือก facet สำหรับ summary bar และ dropdown filter */
  async stats() {
    const [chars, imageIds, archived] = await Promise.all([
      this.prisma.character.findMany({
        where: { archivedAt: null },
        select: { id: true, status: true, universe: true, region: true, gender: true, series: true },
      }),
      this.characterIdsWithImage(),
      this.prisma.character.count({ where: { archivedAt: { not: null } } }),
    ]);
    const imageSet = new Set(imageIds);

    const byStatus: Record<string, number> = {};
    let ready = 0;
    let missingImage = 0;
    const universes = new Set<string>();
    const regions = new Set<string>();
    const genders = new Set<string>();
    const seriesNames = new Set<string>();
    for (const c of chars) {
      byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
      const hasImage = imageSet.has(c.id);
      if (hasImage && (c.status === 'approved' || c.status === 'production_ready')) ready++;
      if (!hasImage) missingImage++;
      if (c.universe) universes.add(c.universe);
      if (c.region) regions.add(c.region);
      if (c.gender) genders.add(c.gender);
      if (c.series) seriesNames.add(c.series);
    }
    const sortTh = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b, 'th'));

    return {
      total: chars.length,
      byStatus,
      ready,
      missingImage,
      archived,
      facets: {
        universes: sortTh(universes),
        regions: sortTh(regions),
        genders: sortTh(genders),
        seriesNames: sortTh(seriesNames),
      },
    };
  }

  /** contentItem id ที่ผูกสินค้าหนึ่งชิ้น: productId ตรง (direct) หรือผ่าน ContentItemProduct */
  private async contentItemIdsForProduct(productId: string): Promise<string[]> {
    return this.contentItemIdsForProducts([productId]);
  }

  /** contentItem id ที่ผูกสินค้าชุดนี้ (union direct productId + ContentItemProduct) — batch, ไม่มี N+1 */
  private async contentItemIdsForProducts(productIds: string[]): Promise<string[]> {
    if (productIds.length === 0) return [];
    const [direct, viaJoin] = await Promise.all([
      this.prisma.contentItem.findMany({
        where: { productId: { in: productIds } },
        select: { id: true },
      }),
      this.prisma.contentItemProduct.findMany({
        where: { productId: { in: productIds } },
        select: { contentItemId: true },
      }),
    ]);
    return [
      ...new Set([...direct.map((c) => c.id), ...viaJoin.map((c) => c.contentItemId)]),
    ];
  }

  /** character id ที่ปรากฏในชุดคอนเทนต์ที่ให้มา (ผ่าน ContentItemCharacter) */
  private async charactersInContents(contentItemIds: string[]): Promise<string[]> {
    if (contentItemIds.length === 0) return [];
    const links = await this.prisma.contentItemCharacter.findMany({
      where: { contentItemId: { in: contentItemIds } },
      select: { characterId: true },
      distinct: ['characterId'],
    });
    return links.map((l) => l.characterId);
  }

  /** id ของ character ที่มีรูป primary_reference (asset image, ไม่ archived) */
  private async characterIdsWithImage(): Promise<string[]> {
    const links = await this.prisma.assetLink.findMany({
      where: {
        entityType: 'character',
        linkRole: 'primary_reference',
        asset: { archivedAt: null, mimeType: { startsWith: 'image/' } },
      },
      select: { entityId: true },
      distinct: ['entityId'],
    });
    return links.map((l) => l.entityId);
  }

  /** aggregate metric ต่อ character: gmv/views จาก ContentPerformance, usage = จำนวน campaign */
  private async aggregateMetric(
    ids: string[],
    sortBy: 'gmv' | 'views' | 'usage',
  ): Promise<Map<string, number>> {
    const metric = new Map<string, number>();
    if (ids.length === 0) return metric;

    if (sortBy === 'usage') {
      const grouped = await this.prisma.campaignCharacter.groupBy({
        by: ['characterId'],
        where: { characterId: { in: ids } },
        _count: { _all: true },
      });
      for (const g of grouped) metric.set(g.characterId, g._count._all);
      return metric;
    }

    const links = await this.prisma.contentItemCharacter.findMany({
      where: { characterId: { in: ids } },
      select: { characterId: true, contentItemId: true },
    });
    if (links.length === 0) return metric;
    const perf = await this.prisma.contentPerformance.groupBy({
      by: ['contentItemId'],
      where: { contentItemId: { in: [...new Set(links.map((l) => l.contentItemId))] } },
      _sum: { gmv: true, views: true },
    });
    const perfByItem = new Map(
      perf.map((p) => [
        p.contentItemId as string,
        sortBy === 'gmv' ? Number(p._sum.gmv ?? 0) : (p._sum.views ?? 0),
      ]),
    );
    for (const l of links) {
      const v = perfByItem.get(l.contentItemId) ?? 0;
      if (v) metric.set(l.characterId, (metric.get(l.characterId) ?? 0) + v);
    }
    return metric;
  }

  /** GET /characters/:id — แนบ tags + creator ให้หน้า detail (get() ภายในคง shape เดิมไว้ให้ snapshot) */
  async getWithTags(id: string) {
    const character = await this.get(id);
    const [tagLinks, creator, audienceLinks, tieInLinks, categoryLinks] = await Promise.all([
      this.prisma.entityTag.findMany({
        where: { entityType: 'character', entityId: id },
        include: { tag: true },
      }),
      // ผู้สร้าง (freelance/ทีมใน) พร้อม contact เต็ม — null ถ้ายังไม่ระบุ
      character.creatorId
        ? this.prisma.creator.findUnique({ where: { id: character.creatorId } })
        : Promise.resolve(null),
      // กลุ่มผู้ติดตาม — อ้างอิง taxonomy กลาง (Audience Segment)
      this.prisma.characterAudience.findMany({
        where: { characterId: id },
        include: {
          segment: {
            select: { id: true, name: true, gender: true, ageMin: true, ageMax: true, status: true },
          },
        },
      }),
      // สินค้าที่ tie-in (ไม่บังคับ)
      this.prisma.characterProduct.findMany({
        where: { characterId: id },
        include: { product: { select: TIE_IN_PRODUCT_SUMMARY } },
      }),
      // ประเภทตัวละคร (หลายอันต่อตัว) — taxonomy กลาง
      this.prisma.characterCategoryLink.findMany({
        where: { characterId: id },
        include: {
          category: { select: { id: true, key: true, label: true, sortOrder: true } },
        },
      }),
    ]);
    return {
      ...character,
      creator,
      tags: tagLinks
        .map((t) => ({ id: t.tag.id, name: t.tag.name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'th')),
      categories: categoryLinks
        .map((cl) => ({
          id: cl.category.id,
          key: cl.category.key,
          label: cl.category.label,
        }))
        .sort((a, b) => a.label.localeCompare(b.label, 'th')),
      audiences: audienceLinks
        .map((a) => ({ segmentId: a.segmentId, isPrimary: a.isPrimary, segment: a.segment }))
        .sort((a, b) => {
          if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
          return a.segment.name.localeCompare(b.segment.name, 'th');
        }),
      tieInProducts: shapeTieIns(tieInLinks),
    };
  }

  async get(id: string) {
    const character = await this.prisma.character.findUnique({ where: { id } });
    if (!character) throw new NotFoundException('ไม่พบ character');
    return character;
  }

  async create(dto: CreateCharacterDto, user: AuthUser, via = 'ui') {
    if (dto.creatorId) await this.ensureCreator(dto.creatorId);
    const displayCode = await this.generateDisplayCode(dto.nameEn ?? dto.nameTh);
    const {
      oneLineConcept,
      persona: personaDto,
      visualDna,
      commerceProfile,
      voiceProfile,
      blueprintId: blueprintIdDto,
      ...fields
    } = dto;
    const persona = {
      ...(personaDto ?? {}),
      ...(oneLineConcept ? { one_line_concept: oneLineConcept } : {}),
    };

    // บันทึกว่า blueprint ไหนสร้างตัวละครนี้ — ไม่ส่งมา = ใช้ default blueprint (ถ้ามี)
    const blueprintId = await this.resolveBlueprintId(blueprintIdDto);

    const character = await this.prisma.character.create({
      data: {
        ...fields,
        persona: persona as Prisma.InputJsonValue,
        visualDna: visualDna as Prisma.InputJsonValue | undefined,
        commerceProfile: commerceProfile as Prisma.InputJsonValue | undefined,
        voiceProfile: voiceProfile as Prisma.InputJsonValue | undefined,
        blueprintId,
        displayCode,
        createdBy: user.id,
      },
    });

    await this.audit(user, via, 'create', character.id, { displayCode, blueprintId });
    return character;
  }

  // resolve blueprintId ที่จะบันทึกบน Character — ระบุมาและ active ก็ใช้อันนั้น มิฉะนั้น fallback default
  private async resolveBlueprintId(blueprintId?: string): Promise<string | null> {
    const bp = await this.blueprints.resolveForInjection(blueprintId ?? null);
    return bp?.id ?? null;
  }

  async update(id: string, dto: UpdateCharacterDto, user: AuthUser, via = 'ui') {
    const existing = await this.get(id);

    // MCP/AI แก้ได้เฉพาะ draft (D8) — enforce ฝั่ง server ไม่ใช่ prompt
    if (via === 'mcp' && existing.status !== 'draft') {
      throw new ForbiddenException('MCP client แก้ไขได้เฉพาะ character ที่ status = draft');
    }

    // optimistic locking (§F.1 ข้อ 6)
    if (dto.expectedUpdatedAt && new Date(dto.expectedUpdatedAt).getTime() !== existing.updatedAt.getTime()) {
      throw new ConflictException('ข้อมูลถูกแก้ไขโดยคนอื่นแล้ว กรุณา reload');
    }

    // creatorId: string = เปลี่ยนผู้สร้าง (ต้องมีจริง), null = เอาออก (unlink)
    if (dto.creatorId) await this.ensureCreator(dto.creatorId);

    // categoryIds เป็น relation (CharacterCategoryLink) ไม่ใช่ scalar — แยกออกก่อน update
    const { expectedUpdatedAt: _e, oneLineConcept: _o, categoryIds, ...fields } = dto;

    // ถ้าส่ง categoryIds มา = replace-set ทั้งชุด (validate ว่ามีจริงก่อน)
    if (categoryIds !== undefined) {
      await this.setCategories(id, categoryIds);
    }

    const character = await this.prisma.character.update({
      where: { id },
      data: fields as Prisma.CharacterUpdateInput,
    });
    await this.audit(user, via, 'update', id, {
      fields: Object.keys(fields),
      ...(categoryIds !== undefined ? { categoryIds } : {}),
    });
    return character;
  }

  /** replace-set ประเภทตัวละคร (CharacterCategoryLink) — validate ว่า category มีจริง แล้วเซ็ตทั้งชุดใหม่ */
  private async setCategories(characterId: string, categoryIds: string[]) {
    const wanted = [...new Set(categoryIds)];
    if (wanted.length > 0) {
      const found = await this.prisma.characterCategory.count({
        where: { id: { in: wanted } },
      });
      if (found !== wanted.length) {
        throw new BadRequestException('มีประเภทตัวละครที่ไม่พบในระบบ');
      }
    }
    await this.prisma.$transaction([
      this.prisma.characterCategoryLink.deleteMany({ where: { characterId } }),
      ...(wanted.length > 0
        ? [
            this.prisma.characterCategoryLink.createMany({
              data: wanted.map((categoryId) => ({ characterId, categoryId })),
              skipDuplicates: true,
            }),
          ]
        : []),
    ]);
  }

  async changeStatus(id: string, next: ApprovalStatus, user: AuthUser, via = 'ui') {
    const existing = await this.get(id);

    if (!TRANSITIONS[existing.status].includes(next)) {
      throw new BadRequestException(`เปลี่ยน status ${existing.status} → ${next} ไม่ได้`);
    }

    // กู้คืนจาก archived → draft: ต้องมีสิทธิ์เขียน (C) — ไม่ต้องถึงขั้น Approve
    const isUnarchive = existing.status === 'archived' && next === 'draft';
    if (isUnarchive) {
      const canWrite = await this.prisma.rolePermission.count({
        where: { module: 'character', actions: { has: 'C' }, role: { key: { in: user.roles } } },
      });
      if (!canWrite) throw new ForbiddenException('ต้องมีสิทธิ์ Create ถึงจะกู้คืน character ได้');
    }

    if (NEEDS_APPROVE.includes(next)) {
      if (via !== 'ui') {
        // guardrail §28.2: ห้าม approve แทนมนุษย์ — เฉพาะ UI path เท่านั้น
        throw new ForbiddenException('การ approve ทำได้ผ่าน UI โดยมนุษย์เท่านั้น');
      }
      const canApprove = await this.prisma.rolePermission.count({
        where: { module: 'character', actions: { has: 'A' }, role: { key: { in: user.roles } } },
      });
      if (!canApprove) throw new ForbiddenException('ต้องมีสิทธิ์ Approve');

      // readiness check (AC-2): จะ approve ต้องมี primary reference asset
      if (next === 'approved') {
        const primaryRef = await this.prisma.assetLink.count({
          where: { entityType: 'character', entityId: id, linkRole: 'primary_reference' },
        });
        if (!primaryRef) {
          throw new BadRequestException('ยังไม่มี primary reference asset — approve ไม่ได้');
        }
      }
    }

    const character = await this.prisma.character.update({
      where: { id },
      data: {
        status: next,
        ...(next === 'archived' ? { archivedAt: new Date() } : {}),
        ...(isUnarchive ? { archivedAt: null } : {}),
      },
    });
    await this.audit(user, via, isUnarchive ? 'unarchive' : 'status_change', id, {
      from: existing.status,
      to: next,
    });
    return character;
  }

  // snapshot version (§F.1 ข้อ 4 — full JSONB, rollback = สร้าง version ใหม่)
  async createVersion(id: string, label: string, notes: string | undefined, user: AuthUser) {
    const character = await this.get(id);
    const version = await this.prisma.entityVersion.create({
      data: {
        entityType: 'character',
        entityId: id,
        versionLabel: label,
        snapshot: character as unknown as Prisma.InputJsonValue,
        notes,
        createdBy: user.id,
      },
    });
    await this.prisma.character.update({ where: { id }, data: { version: label } });
    await this.audit(user, 'ui', 'version_snapshot', id, { label });
    return version;
  }

  listVersions(id: string) {
    return this.prisma.entityVersion.findMany({
      where: { entityType: 'character', entityId: id },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** creatorId ที่ส่งมาต้องมีอยู่จริงใน creators — ไม่งั้น 404 */
  private async ensureCreator(creatorId: string) {
    const found = await this.prisma.creator.count({ where: { id: creatorId } });
    if (!found) throw new NotFoundException('ไม่พบผู้สร้างนี้');
  }

  private async generateDisplayCode(name: string): Promise<string> {
    const slug =
      name
        .normalize('NFKD')
        .replace(/[^a-zA-Z0-9]/g, '')
        .toUpperCase()
        .slice(0, 8) || 'CHAR';
    const count = await this.prisma.character.count({
      where: { displayCode: { startsWith: `CHR-${slug}-` } },
    });
    return `CHR-${slug}-${String(count + 1).padStart(3, '0')}`;
  }

  private audit(user: AuthUser, via: string, action: string, entityId: string, meta: object) {
    return this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        via,
        action,
        entityType: 'character',
        entityId,
        meta: meta as Prisma.InputJsonValue,
      },
    });
  }
}
