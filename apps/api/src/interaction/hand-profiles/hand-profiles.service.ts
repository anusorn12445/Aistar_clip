import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { HandProfile, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../auth/current-user.decorator';
import { CreateHandProfileDto, UpdateHandProfileDto } from './dto/hand-profile.dto';

export interface ListHandProfilesParams {
  q?: string;
  category?: string;
  status?: string;
  productCategorySuitability?: string;
  isChild?: string;
  page?: number;
}

// asset link roles ที่ถือเป็น "รูปอ้างอิง" ของ hand — priority เลือกปกการ์ด
const HAND_THUMB_PRIORITY: Record<string, number> = {
  primary_reference: 0,
  cover: 1,
  thumbnail: 2,
  reference: 3,
};

@Injectable()
export class HandProfilesService {
  constructor(private prisma: PrismaService) {}

  async list(params: ListHandProfilesParams) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const take = 20;

    const where: Prisma.HandProfileWhereInput = {
      // ไม่ระบุ status → ซ่อน archived (pattern เดียวกับ locations/characters)
      ...(params.status ? { status: params.status } : { status: { not: 'archived' } }),
      ...(params.category ? { category: params.category } : {}),
      ...(params.productCategorySuitability
        ? { productCategorySuitability: { has: params.productCategorySuitability } }
        : {}),
      ...(params.isChild != null && params.isChild !== ''
        ? { isChild: params.isChild === 'true' }
        : {}),
      ...(params.q
        ? {
            OR: [
              { name: { contains: params.q, mode: 'insensitive' } },
              { displayCode: { contains: params.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.handProfile.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * take,
        take,
      }),
      this.prisma.handProfile.count({ where }),
    ]);

    const thumbs = await this.thumbnailMap(items.map((i) => i.id));
    const withThumbs = items.map((i) => ({ ...i, thumbAssetId: thumbs.get(i.id) ?? null }));
    return { items: withThumbs, total, page, pageSize: take };
  }

  async get(id: string) {
    const hand = await this.prisma.handProfile.findUnique({ where: { id } });
    if (!hand) throw new NotFoundException('ไม่พบ hand profile');
    const thumbs = await this.thumbnailMap([id]);
    return { ...hand, thumbAssetId: thumbs.get(id) ?? null };
  }

  async create(dto: CreateHandProfileDto, user: AuthUser, via = 'ui') {
    this.assertGesturesNoOverlap(dto.allowedGestures, dto.restrictedGestures);
    const isChild = dto.isChild ?? false;
    this.assertChildCompliance(isChild, dto.policyFlag, dto.status ?? 'draft', dto.complianceReviewed ?? false);

    // displayCode @unique (HAND-0001) — retry เมื่อชน P2002 (mirror image-requests QA fix)
    let hand: HandProfile | undefined;
    for (let attempt = 0; attempt < 5; attempt++) {
      const displayCode = await this.generateDisplayCode();
      try {
        hand = await this.prisma.handProfile.create({
          data: {
            displayCode,
            name: dto.name,
            category: dto.category,
            gender: dto.gender,
            ageGroup: dto.ageGroup,
            skinTone: dto.skinTone,
            handSize: dto.handSize,
            fingerLength: dto.fingerLength,
            nailLength: dto.nailLength,
            nailShape: dto.nailShape,
            nailColor: dto.nailColor,
            nailStyle: dto.nailStyle,
            accessories: dto.accessories ?? [],
            sleeveStyle: dto.sleeveStyle,
            skinTexture: dto.skinTexture,
            dominantHand: dto.dominantHand,
            allowedGestures: dto.allowedGestures ?? [],
            restrictedGestures: dto.restrictedGestures ?? [],
            productCategorySuitability: dto.productCategorySuitability ?? [],
            isChild,
            policyFlag: dto.policyFlag,
            complianceReviewed: dto.complianceReviewed ?? false,
            status: dto.status ?? 'draft',
            createdBy: user.id,
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
    if (!hand) throw new BadRequestException('สร้าง hand profile ไม่สำเร็จ (รหัสซ้ำ) — ลองอีกครั้ง');

    await this.audit(user, via, 'create', hand.id, { displayCode: hand.displayCode });
    return { ...hand, thumbAssetId: null };
  }

  async update(id: string, dto: UpdateHandProfileDto, user: AuthUser, via = 'ui') {
    const existing = await this.prisma.handProfile.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('ไม่พบ hand profile');

    // merge ค่าเดิม+ใหม่ เพื่อตรวจกฎบน "สถานะสุดท้าย" ของ record
    const allowed = dto.allowedGestures ?? existing.allowedGestures;
    const restricted = dto.restrictedGestures ?? existing.restrictedGestures;
    this.assertGesturesNoOverlap(allowed, restricted);

    const isChild = dto.isChild ?? existing.isChild;
    const policyFlag = dto.policyFlag !== undefined ? dto.policyFlag : existing.policyFlag;
    const status = dto.status ?? existing.status;
    const complianceReviewed =
      dto.complianceReviewed !== undefined ? dto.complianceReviewed : existing.complianceReviewed;
    this.assertChildCompliance(isChild, policyFlag, status, complianceReviewed);

    const data: Prisma.HandProfileUpdateInput = {};
    const scalar: (keyof UpdateHandProfileDto)[] = [
      'name', 'category', 'gender', 'ageGroup', 'skinTone', 'handSize', 'fingerLength',
      'nailLength', 'nailShape', 'nailColor', 'nailStyle', 'accessories', 'sleeveStyle',
      'skinTexture', 'dominantHand', 'allowedGestures', 'restrictedGestures',
      'productCategorySuitability', 'isChild', 'policyFlag', 'complianceReviewed', 'status',
    ];
    for (const key of scalar) {
      if (dto[key] !== undefined) (data as Record<string, unknown>)[key] = dto[key];
    }
    if (status === 'archived' && existing.status !== 'archived') {
      (data as Record<string, unknown>).archivedAt = new Date();
    }

    const hand = await this.prisma.handProfile.update({ where: { id }, data });
    await this.audit(user, via, 'update', id, { fields: Object.keys(data) });
    const thumbs = await this.thumbnailMap([id]);
    return { ...hand, thumbAssetId: thumbs.get(id) ?? null };
  }

  async archive(id: string, user: AuthUser, via = 'ui') {
    const existing = await this.prisma.handProfile.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundException('ไม่พบ hand profile');
    const hand = await this.prisma.handProfile.update({
      where: { id },
      data: { status: 'archived', archivedAt: new Date() },
    });
    await this.audit(user, via, 'archive', id, {});
    return hand;
  }

  // ── กฎ: allowed/restricted gestures ต้องไม่ทับกัน ──
  private assertGesturesNoOverlap(allowed?: string[], restricted?: string[]) {
    if (!allowed?.length || !restricted?.length) return;
    const set = new Set(allowed);
    const overlap = restricted.filter((g) => set.has(g));
    if (overlap.length > 0) {
      throw new BadRequestException(
        `ท่าทางซ้ำในทั้ง allowed และ restricted: ${overlap.join(', ')} — เลือกอย่างใดอย่างหนึ่ง`,
      );
    }
  }

  // ── Child hand compliance gate (SRS §3.2.2) ──
  private assertChildCompliance(
    isChild: boolean,
    policyFlag: string | null | undefined,
    status: string,
    complianceReviewed: boolean,
  ) {
    if (!isChild) return;
    if (!policyFlag || !policyFlag.trim()) {
      throw new BadRequestException(
        'มือเด็ก (isChild) ต้องระบุ policyFlag เพื่อบันทึกเหตุผล/นโยบายการใช้งานก่อน',
      );
    }
    if (status === 'active' && !complianceReviewed) {
      throw new BadRequestException(
        'มือเด็กต้องผ่านการตรวจสอบ compliance (complianceReviewed) ก่อนจึงเปิดใช้งาน (active) ได้',
      );
    }
  }

  private async generateDisplayCode(): Promise<string> {
    const count = await this.prisma.handProfile.count();
    return `HAND-${String(count + 1).padStart(4, '0')}`;
  }

  /** map hand.id → assetId รูปอ้างอิงที่ดีที่สุด (primary_reference > cover > thumbnail > reference) */
  private async thumbnailMap(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const links = await this.prisma.assetLink.findMany({
      where: {
        entityType: 'hand',
        entityId: { in: ids },
        asset: { archivedAt: null, mimeType: { startsWith: 'image/' } },
      },
      select: {
        entityId: true,
        assetId: true,
        linkRole: true,
        asset: { select: { createdAt: true } },
      },
    });
    const best = new Map<string, { assetId: string; prio: number; createdAt: Date }>();
    for (const l of links) {
      const prio = HAND_THUMB_PRIORITY[l.linkRole] ?? 4;
      const cur = best.get(l.entityId);
      if (!cur || prio < cur.prio || (prio === cur.prio && l.asset.createdAt < cur.createdAt)) {
        best.set(l.entityId, { assetId: l.assetId, prio, createdAt: l.asset.createdAt });
      }
    }
    return new Map([...best].map(([k, v]) => [k, v.assetId]));
  }

  private audit(user: AuthUser, via: string, action: string, entityId: string, meta: object) {
    return this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        via,
        action,
        entityType: 'hand_profile',
        entityId,
        meta: meta as Prisma.InputJsonValue,
      },
    });
  }
}
