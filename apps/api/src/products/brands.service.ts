import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/current-user.decorator';
import { AssetsService } from '../assets/assets.service';
import { CreateBrandDto, UpdateBrandDto } from './dto/create-brand.dto';
import { BrandAudienceLinkItemDto } from './dto/brand-audiences.dto';

// ─── Brand Book helpers ──────────────────────────────────────

// ค่าสี #hex (3-8 หลัก ครอบคลุม #rgb/#rrggbb/#rrggbbaa)
const HEX_RE = /^#[0-9a-fA-F]{3,8}$/;
// บทบาทฟอนต์ที่รองรับ (ตามโครง SRS §2.4)
const FONT_ROLES = ['heading', 'body', 'display', 'other'] as const;

// field ที่ถือเป็น "เนื้อหา brand book" — แก้เมื่อไหร่ stamp bookUpdatedAt
// (name/contact/notes/status = ข้อมูลบริหารแบรนด์ ไม่ใช่เนื้อหา book → ไม่ stamp)
const BOOK_CONTENT_FIELDS = new Set([
  // System 1 knowledge (โผล่ในเล่ม book ด้วย)
  'brandStory',
  'toneOfVoice',
  'doList',
  'dontList',
  'keyMessages',
  'usp',
  'restrictedClaims',
  'visualIdentity',
  'competitorsNote',
  // Foundation
  'mission',
  'vision',
  'coreValues',
  'positioning',
  'personality',
  'tagline',
  'taglineFont',
  // Verbal
  'wordBankUse',
  'wordBankAvoid',
  'exampleOnBrand',
  'exampleOffBrand',
  'platformGuides',
  // Visual
  'nameUsage',
  'logoUsageNote',
  'moodNote',
  'brandColors',
  'brandFonts',
  // Governance (bookVersion user จัดการเอง แต่ก็คือเนื้อหา book)
  'bookVersion',
  'bookApproverName',
  'bookApproverContact',
]);

/**
 * เช็กลิสต์ความครบของ Brand Book (bookCompleteness) — 12 field หลัก น้ำหนักเท่ากัน:
 *  1. mission            2. vision           3. coreValues (≥1)
 *  4. positioning        5. personality      6. tagline
 *  7. toneOfVoice        8. wordBankUse (≥1) 9. exampleOnBrand
 * 10. brandColors (≥1)  11. brandFonts (≥1) 12. restrictedClaims (≥1)
 * คืนเป็นเปอร์เซ็นต์ (0-100 ปัดเป็นจำนวนเต็ม)
 */
function bookCompleteness(b: {
  mission: string | null;
  vision: string | null;
  coreValues: string[];
  positioning: string | null;
  personality: string | null;
  tagline: string | null;
  toneOfVoice: string | null;
  wordBankUse: string[];
  exampleOnBrand: string | null;
  brandColors: Prisma.JsonValue | null;
  brandFonts: Prisma.JsonValue | null;
  restrictedClaims: string[];
}): number {
  const filledText = (v: string | null) => !!v && v.trim().length > 0;
  const filledArr = (v: string[]) => v.some((x) => x.trim().length > 0);
  const filledJsonArr = (v: Prisma.JsonValue | null) => Array.isArray(v) && v.length > 0;
  const checks = [
    filledText(b.mission),
    filledText(b.vision),
    filledArr(b.coreValues),
    filledText(b.positioning),
    filledText(b.personality),
    filledText(b.tagline),
    filledText(b.toneOfVoice),
    filledArr(b.wordBankUse),
    filledText(b.exampleOnBrand),
    filledJsonArr(b.brandColors),
    filledJsonArr(b.brandFonts),
    filledArr(b.restrictedClaims),
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

// shape ที่ UI ใช้แสดงไฟล์/รูปของ brand book
function shapeBookAsset(l: {
  id: string;
  linkRole: string;
  assetId: string;
  asset: {
    originalFilename: string;
    mimeType: string;
    fileSize: number;
    createdAt: Date;
  };
}) {
  return {
    linkId: l.id,
    linkRole: l.linkRole,
    assetId: l.assetId,
    originalFilename: l.asset.originalFilename,
    mimeType: l.asset.mimeType,
    fileSize: l.asset.fileSize,
    createdAt: l.asset.createdAt,
  };
}

// สรุป segment แบบย่อ ที่แนบไปกับ link (ให้ UI แสดง chip ได้เลย) — mirror ของ audience module
const SEGMENT_SUMMARY = {
  id: true,
  name: true,
  description: true,
  ageMin: true,
  ageMax: true,
  gender: true,
  interests: true,
  platforms: true,
  spendingPower: true,
  region: true,
  painPoint: true,
  status: true,
} satisfies Prisma.AudienceSegmentSelect;

@Injectable()
export class BrandsService {
  constructor(
    private prisma: PrismaService,
    private assets: AssetsService,
  ) {}

  async list(params: { q?: string; status?: string }) {
    const where: Prisma.BrandWhereInput = {
      ...(params.status ? { status: params.status } : {}),
      ...(params.q ? { name: { contains: params.q, mode: 'insensitive' } } : {}),
    };
    const brands = await this.prisma.brand.findMany({
      where,
      orderBy: { name: 'asc' },
      include: { _count: { select: { products: true, clients: true } } },
    });

    // โลโก้ (linkRole 'logo_icon') สำหรับหน้า Brands index — เอาตัวล่าสุดต่อแบรนด์
    const logoLinks = brands.length
      ? await this.prisma.assetLink.findMany({
          where: {
            entityType: 'brand',
            entityId: { in: brands.map((b) => b.id) },
            linkRole: 'logo_icon',
            asset: { archivedAt: null },
          },
          select: { entityId: true, assetId: true, asset: { select: { createdAt: true } } },
          orderBy: { asset: { createdAt: 'desc' } },
        })
      : [];
    const logoByBrand = new Map<string, string>();
    for (const l of logoLinks) {
      if (!logoByBrand.has(l.entityId)) logoByBrand.set(l.entityId, l.assetId);
    }

    // เก็บ _count เดิมไว้ (backward compat) + productCount/clientCount +
    // bookCompleteness (เช็กลิสต์ 12 field — ดู comment ของ bookCompleteness ด้านบน)
    // ตัด bookShareToken ทิ้งจาก list — เป็น secret ของลิงก์แชร์ ไม่ควรหลุดให้ทุก role ที่มี product:V
    // (share UI อ่าน token จาก GET /brands/:id/book แทน)
    return brands.map((b) => {
      const { bookShareToken: _bookShareToken, ...rest } = b;
      return {
        ...rest,
        productCount: b._count.products,
        clientCount: b._count.clients,
        bookCompleteness: bookCompleteness(b),
        logoAssetId: logoByBrand.get(b.id) ?? null,
      };
    });
  }

  // GET /brands/:id — แนบ knowledge fields + กลุ่มเป้าหมาย (isPrimary) + ไฟล์ brand book
  async getOne(id: string) {
    const brand = await this.prisma.brand.findUnique({
      where: { id },
      include: { _count: { select: { products: true } } },
    });
    if (!brand) throw new NotFoundException('ไม่พบแบรนด์');

    const [audienceLinks, bookLinks] = await Promise.all([
      this.prisma.brandAudience.findMany({
        where: { brandId: id },
        include: { segment: { select: SEGMENT_SUMMARY } },
      }),
      // ไฟล์ brand book — polymorphic AssetLink (entityType 'brand'), ข้าม asset ที่ถูกเก็บเข้ากรุ
      this.prisma.assetLink.findMany({
        where: { entityType: 'brand', entityId: id, asset: { archivedAt: null } },
        include: { asset: true },
        orderBy: { asset: { createdAt: 'desc' } },
      }),
    ]);

    const { _count, ...rest } = brand;
    return {
      ...rest,
      productCount: _count.products,
      audiences: this.shapeAudiences(audienceLinks),
      brandBook: {
        count: bookLinks.length,
        assets: bookLinks.map((l) => ({
          linkId: l.id,
          linkRole: l.linkRole,
          assetId: l.assetId,
          originalFilename: l.asset.originalFilename,
          mimeType: l.asset.mimeType,
          fileSize: l.asset.fileSize,
          createdAt: l.asset.createdAt,
        })),
      },
    };
  }

  async create(dto: CreateBrandDto, user: AuthUser, via = 'ui') {
    const brand = await this.prisma.brand.create({ data: { ...dto } });
    await this.audit(user, via, 'create', brand.id, { name: brand.name });
    return brand;
  }

  async update(id: string, dto: UpdateBrandDto, user: AuthUser, via = 'ui') {
    const existing = await this.prisma.brand.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('ไม่พบแบรนด์');

    // ตรวจ + normalize JSON fields ของ brand book (shape ผิด → 400 ไทย)
    const normalized = this.validateBookJson(dto);

    // มี field เนื้อหา book ใน payload → stamp bookUpdatedAt (bookVersion user จัดการเอง)
    // เช็คค่า !== undefined ด้วย — @Transform ของ class-transformer ทำให้ key array
    // โผล่บน instance เสมอแม้ client ไม่ได้ส่งมา (ค่าเป็น undefined)
    const touchesBook = Object.entries(dto).some(
      ([k, v]) => v !== undefined && BOOK_CONTENT_FIELDS.has(k),
    );

    const data = {
      ...dto,
      ...normalized,
      ...(touchesBook ? { bookUpdatedAt: new Date() } : {}),
    } as Prisma.BrandUncheckedUpdateInput;

    const brand = await this.prisma.brand.update({ where: { id }, data });
    await this.audit(user, via, 'update', id, { fields: Object.keys(dto) });
    return brand;
  }

  /**
   * ตรวจ shape ลึกของ JSON fields (DTO ตรวจได้แค่ array/object ชั้นนอก):
   * - brandColors: [{token: string บังคับ, dark/light อย่างน้อยหนึ่งค่าเป็น #hex, usage?}]
   * - brandFonts:  [{role: heading|body|display|other, family: string, note?}]
   * - platformGuides: object ที่ value ทุกตัวเป็น string
   * คืน object เฉพาะ field ที่ normalize แล้ว (ตัด key แปลกปลอมทิ้ง)
   */
  private validateBookJson(dto: UpdateBrandDto): {
    brandColors?: Prisma.InputJsonValue;
    brandFonts?: Prisma.InputJsonValue;
    platformGuides?: Prisma.InputJsonValue;
  } {
    const out: {
      brandColors?: Prisma.InputJsonValue;
      brandFonts?: Prisma.InputJsonValue;
      platformGuides?: Prisma.InputJsonValue;
    } = {};

    if (dto.brandColors !== undefined) {
      out.brandColors = dto.brandColors.map((raw, i) => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
          throw new BadRequestException(`brandColors แถวที่ ${i + 1} ต้องเป็น object {token, dark, light, usage}`);
        }
        const c = raw as Record<string, unknown>;
        if (typeof c.token !== 'string' || !c.token.trim()) {
          throw new BadRequestException(`brandColors แถวที่ ${i + 1} ต้องมี token (ชื่อสี เช่น brand.primary)`);
        }
        const hexOf = (v: unknown, side: string): string | null => {
          if (v == null || v === '') return null;
          if (typeof v !== 'string' || !HEX_RE.test(v.trim())) {
            throw new BadRequestException(
              `brandColors "${String(c.token)}" ค่า ${side} ต้องเป็นรหัสสี #hex เช่น #34d399`,
            );
          }
          return v.trim();
        };
        const dark = hexOf(c.dark, 'dark');
        const light = hexOf(c.light, 'light');
        if (!dark && !light) {
          throw new BadRequestException(
            `brandColors "${String(c.token)}" ต้องมีค่าสีอย่างน้อยหนึ่งฝั่ง (dark หรือ light) เป็น #hex`,
          );
        }
        if (c.usage != null && typeof c.usage !== 'string') {
          throw new BadRequestException(`brandColors "${String(c.token)}" ค่า usage ต้องเป็นข้อความ`);
        }
        return { token: c.token.trim(), dark, light, usage: (c.usage as string | undefined)?.trim() || null };
      });
    }

    if (dto.brandFonts !== undefined) {
      out.brandFonts = dto.brandFonts.map((raw, i) => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
          throw new BadRequestException(`brandFonts แถวที่ ${i + 1} ต้องเป็น object {role, family, note}`);
        }
        const f = raw as Record<string, unknown>;
        if (typeof f.role !== 'string' || !(FONT_ROLES as readonly string[]).includes(f.role)) {
          throw new BadRequestException(
            `brandFonts แถวที่ ${i + 1} role ต้องเป็นหนึ่งใน: ${FONT_ROLES.join(', ')}`,
          );
        }
        if (typeof f.family !== 'string' || !f.family.trim()) {
          throw new BadRequestException(`brandFonts แถวที่ ${i + 1} ต้องระบุ family (ชื่อฟอนต์)`);
        }
        if (f.note != null && typeof f.note !== 'string') {
          throw new BadRequestException(`brandFonts แถวที่ ${i + 1} ค่า note ต้องเป็นข้อความ`);
        }
        return { role: f.role, family: f.family.trim(), note: (f.note as string | undefined)?.trim() || null };
      });
    }

    if (dto.platformGuides !== undefined) {
      const clean: Record<string, string> = {};
      for (const [key, val] of Object.entries(dto.platformGuides)) {
        if (typeof val !== 'string') {
          throw new BadRequestException(
            `platformGuides["${key}"] ต้องเป็นข้อความแนวการเขียนของแพลตฟอร์มนั้น`,
          );
        }
        if (key.trim() && val.trim()) clean[key.trim()] = val.trim();
      }
      out.platformGuides = clean;
    }

    return out;
  }

  /**
   * GET /brands/:id/book — aggregate เดียวจบสำหรับมุมมองอ่าน Brand Book:
   * knowledge + book fields ทั้งหมด + audiences + assets จัดกลุ่มตาม linkRole +
   * productCount + ลูกค้าที่ผูกแบรนด์นี้ (Client.brandId)
   */
  async getBook(id: string) {
    const brand = await this.prisma.brand.findUnique({
      where: { id },
      include: { _count: { select: { products: true } } },
    });
    if (!brand) throw new NotFoundException('ไม่พบแบรนด์');

    const [audienceLinks, assetLinks, clients] = await Promise.all([
      this.prisma.brandAudience.findMany({
        where: { brandId: id },
        include: { segment: { select: SEGMENT_SUMMARY } },
      }),
      this.prisma.assetLink.findMany({
        where: { entityType: 'brand', entityId: id, asset: { archivedAt: null } },
        include: { asset: true },
        orderBy: { asset: { createdAt: 'desc' } },
      }),
      this.prisma.client.findMany({
        where: { brandId: id },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    const { _count, ...brandFields } = brand;
    return {
      ...brandFields,
      productCount: _count.products,
      completeness: bookCompleteness(brand),
      audiences: this.shapeAudiences(audienceLinks),
      clients,
      assets: this.groupBookAssets(assetLinks),
    };
  }

  // จัดกลุ่ม asset ตาม linkRole — โลโก้เอาตัวล่าสุดต่อ role (list เรียง desc แล้ว)
  private groupBookAssets(assetLinks: Parameters<typeof shapeBookAsset>[0][]) {
    const shaped = assetLinks.map(shapeBookAsset);
    const firstOfRole = (role: string) => shaped.find((a) => a.linkRole === role) ?? null;
    const ofRole = (role: string) => shaped.filter((a) => a.linkRole === role);
    const GROUPED_ROLES = new Set(['logo_icon', 'logo_full', 'logo_mono', 'template', 'mood']);
    return {
      logos: {
        icon: firstOfRole('logo_icon'),
        full: firstOfRole('logo_full'),
        mono: firstOfRole('logo_mono'),
      },
      templates: ofRole('template'),
      moods: ofRole('mood'),
      files: shaped.filter((a) => !GROUPED_ROLES.has(a.linkRole)),
    };
  }

  // ─── Share link (Brand Book → ลูกค้า, read-only) ─────────────

  /**
   * POST /brands/:id/share — เปิดลิงก์แชร์ (สร้าง bookShareToken)
   * - มี token อยู่แล้ว + ไม่ rotate → คืน token เดิม (idempotent)
   * - rotate=true → สร้าง token ใหม่ (ลิงก์เก่าใช้ไม่ได้ทันที)
   */
  async enableShare(id: string, rotate: boolean, user: AuthUser, via = 'ui') {
    const existing = await this.prisma.brand.findUnique({
      where: { id },
      select: { id: true, bookShareToken: true },
    });
    if (!existing) throw new NotFoundException('ไม่พบแบรนด์');
    if (existing.bookShareToken && !rotate) return { token: existing.bookShareToken };

    // 48 hex chars (24 bytes) — เกินขั้นต่ำ 32 ตัวอักษร, เดาไม่ได้ (crypto-random)
    const token = randomBytes(24).toString('hex');
    await this.prisma.brand.update({ where: { id }, data: { bookShareToken: token } });
    await this.audit(user, via, existing.bookShareToken ? 'share_rotate' : 'share_enable', id, {});
    return { token };
  }

  /** DELETE /brands/:id/share — ปิดลิงก์แชร์ (token = null, ลิงก์เดิม 404 ทันที) */
  async revokeShare(id: string, user: AuthUser, via = 'ui') {
    const existing = await this.prisma.brand.findUnique({
      where: { id },
      select: { id: true, bookShareToken: true },
    });
    if (!existing) throw new NotFoundException('ไม่พบแบรนด์');
    await this.prisma.brand.update({ where: { id }, data: { bookShareToken: null } });
    await this.audit(user, via, 'share_revoke', id, { hadToken: !!existing.bookShareToken });
    return { ok: true };
  }

  /**
   * lookup แบรนด์จาก share token เท่านั้น (ไม่มี brand id ใน URL สาธารณะ)
   * — token ผิด/ถูกปิด ตอบ 404 ข้อความเดียวกันเสมอ ไม่บอกใบ้ว่าแบรนด์มีจริงไหม
   */
  private async brandByShareToken(token: string) {
    const brand = token
      ? await this.prisma.brand.findUnique({ where: { bookShareToken: token } })
      : null;
    // แบรนด์ที่ archive แล้ว ต้องปิดลิงก์แชร์ด้วย — 404 เหมือน token ผิด (ไม่ leak)
    if (!brand || brand.status !== 'active') throw new NotFoundException('ไม่พบลิงก์แชร์');
    return brand;
  }

  /**
   * GET /public/brand-book/:token — book aggregate เวอร์ชันสาธารณะ (ไม่ต้อง login)
   * เหมือน getBook ยกเว้น "ข้อมูลภายใน" ที่ตัดออก:
   * - clients (รายชื่อลูกค้าภายใน) + productCount (ตัวเลขภายใน)
   * - bookApproverContact (ช่องทางติดต่อผู้อนุมัติ) + contact/notes (ข้อมูลบริหารแบรนด์)
   * - competitorsNote (คู่แข่ง+จุดต่าง — ข้อมูลกลยุทธ์ภายใน)
   * - bookShareToken (ไม่ echo token กลับใน payload)
   */
  async getPublicBook(token: string) {
    const brand = await this.brandByShareToken(token);

    const [audienceLinks, assetLinks] = await Promise.all([
      this.prisma.brandAudience.findMany({
        where: { brandId: brand.id },
        include: { segment: { select: SEGMENT_SUMMARY } },
      }),
      this.prisma.assetLink.findMany({
        where: { entityType: 'brand', entityId: brand.id, asset: { archivedAt: null } },
        include: { asset: true },
        orderBy: { asset: { createdAt: 'desc' } },
      }),
    ]);

    const {
      bookShareToken: _token,
      bookApproverContact: _approverContact,
      contact: _contact,
      notes: _notes,
      competitorsNote: _competitorsNote,
      ...pub
    } = brand;
    return {
      ...pub,
      completeness: bookCompleteness(brand),
      audiences: this.shapeAudiences(audienceLinks),
      assets: this.groupBookAssets(assetLinks),
    };
  }

  /**
   * GET /public/brand-book/:token/asset/:assetId — stream ไฟล์โดยไม่ต้อง auth
   * เงื่อนไข: asset ต้องผูกกับแบรนด์ของ token นี้เท่านั้น (AssetLink entityType 'brand')
   * ไม่ผูก/ถูก archive/token ผิด → 404 เหมือนกันหมด (ไม่ leak ว่า asset มีจริงไหม)
   */
  async getPublicAssetStream(token: string, assetId: string) {
    const brand = await this.brandByShareToken(token);
    const link = await this.prisma.assetLink.findFirst({
      where: {
        entityType: 'brand',
        entityId: brand.id,
        assetId,
        asset: { archivedAt: null },
      },
      select: { id: true },
    });
    if (!link) throw new NotFoundException('ไม่พบลิงก์แชร์');
    return this.assets.getFileStream(assetId);
  }

  async remove(id: string, user: AuthUser, via = 'ui') {
    const existing = await this.prisma.brand.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('ไม่พบแบรนด์');
    const productCount = await this.prisma.product.count({ where: { brandId: id } });
    if (productCount > 0) {
      throw new ConflictException(
        `มีสินค้าใช้แบรนด์นี้อยู่ (${productCount} ชิ้น) เก็บเข้ากรุแทนได้`,
      );
    }
    await this.prisma.brand.delete({ where: { id } });
    await this.audit(user, via, 'delete', id, { name: existing.name });
    return { ok: true };
  }

  // ─── กลุ่มเป้าหมาย (BrandAudience) — mirror ของ CharacterAudience ──

  async getAudiences(brandId: string) {
    await this.mustExist(brandId);
    const links = await this.prisma.brandAudience.findMany({
      where: { brandId },
      include: { segment: { select: SEGMENT_SUMMARY } },
    });
    return this.shapeAudiences(links);
  }

  // PUT ชุด segment ทั้งหมดใหม่ (replace) — enforce ≤1 primary, segment ต้องมีจริง
  async setAudiences(
    brandId: string,
    items: BrandAudienceLinkItemDto[],
    user: AuthUser,
    via = 'ui',
  ) {
    await this.mustExist(brandId);
    const clean = await this.validateAudienceItems(items);
    await this.prisma.$transaction([
      this.prisma.brandAudience.deleteMany({ where: { brandId } }),
      ...(clean.length
        ? [
            this.prisma.brandAudience.createMany({
              data: clean.map((c) => ({
                brandId,
                segmentId: c.segmentId,
                isPrimary: c.isPrimary,
              })),
            }),
          ]
        : []),
    ]);
    await this.audit(user, via, 'set_audiences', brandId, {
      count: clean.length,
      primary: clean.find((c) => c.isPrimary)?.segmentId ?? null,
    });
    return this.getAudiences(brandId);
  }

  private shapeAudiences(
    links: {
      isPrimary: boolean;
      segment: Prisma.AudienceSegmentGetPayload<{ select: typeof SEGMENT_SUMMARY }>;
    }[],
  ) {
    return links
      .map((l) => ({ segmentId: l.segment.id, isPrimary: l.isPrimary, segment: l.segment }))
      .sort((a, b) => {
        if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
        return a.segment.name.localeCompare(b.segment.name, 'th');
      });
  }

  // dedupe ตาม segmentId, ตรวจ ≤1 primary, ตรวจว่ามี segment จริง
  private async validateAudienceItems(items: BrandAudienceLinkItemDto[]) {
    const byId = new Map<string, boolean>();
    for (const it of items) {
      byId.set(it.segmentId, byId.get(it.segmentId) || !!it.isPrimary);
    }
    const clean = [...byId.entries()].map(([segmentId, isPrimary]) => ({ segmentId, isPrimary }));

    const primaries = clean.filter((c) => c.isPrimary).length;
    if (primaries > 1) {
      throw new BadRequestException('ตั้งกลุ่มหลัก (primary) ได้เพียงกลุ่มเดียว');
    }

    if (clean.length) {
      const found = await this.prisma.audienceSegment.count({
        where: { id: { in: clean.map((c) => c.segmentId) } },
      });
      if (found !== clean.length) {
        throw new NotFoundException('มี segment บางรายการที่ไม่มีอยู่ในระบบ');
      }
    }
    return clean;
  }

  private async mustExist(id: string) {
    const count = await this.prisma.brand.count({ where: { id } });
    if (!count) throw new NotFoundException('ไม่พบแบรนด์');
  }

  private audit(user: AuthUser, via: string, action: string, entityId: string, meta: object) {
    return this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        via,
        action,
        entityType: 'brand',
        entityId,
        meta: meta as Prisma.InputJsonValue,
      },
    });
  }
}
