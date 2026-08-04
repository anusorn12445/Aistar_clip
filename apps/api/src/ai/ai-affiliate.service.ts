import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, Product } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/current-user.decorator';
import { AiClaudeService } from './ai-claude.service';
import { AFFILIATE_CAMERA_VALUES, AFFILIATE_REVIEW_SCHEMA } from './affiliate.schemas';
import {
  buildBannedWordsPromptBlock,
  normalizeCompliancePlatform,
  wordAppliesToPlatform,
} from '../compliance/banned-words.util';
import { AffiliateBatchDto, AffiliateReviewDto } from './dto/affiliate.dto';

const DEFAULT_PLATFORM = 'facebook';
const BATCH_CAP = 25; // จำกัดจำนวนสินค้าต่อ 1 batch call (รายงานถ้าถูกตัด)

interface ReviewShot {
  scene: string;
  camera: string;
  action: string;
  dialogue: string;
}

interface ReviewResult {
  hook: string;
  body: string;
  cta: string;
  shots: ReviewShot[];
  caption: string;
  hashtags: string[];
}

@Injectable()
export class AiAffiliateService {
  private readonly logger = new Logger(AiAffiliateService.name);

  constructor(
    private prisma: PrismaService,
    private claude: AiClaudeService,
  ) {}

  // ─── AI status (สำหรับหน้า affiliate — โชว์/ซ่อนปุ่ม generate) ──
  async status() {
    return { configured: await this.claude.isConfigured(), model: await this.claude.resolveActiveModel() };
  }

  // ─── 1. Review generator — สินค้า 1 ตัว → ชุดคอนเทนต์พร้อมโพสต์ ──
  async generateReview(dto: AffiliateReviewDto, user: AuthUser) {
    const product = await this.resolveAffiliateProduct(dto.productId);
    const platform = dto.platform?.trim() || DEFAULT_PLATFORM;
    const out = await this.runReviewForProduct(product, platform, Boolean(dto.regenerate), user);
    return {
      item: out.item,
      ...(out.warning ? { warning: out.warning } : {}),
      regenerated: out.updated,
      provenance: 'ai' as const,
      model: out.model,
      usage: out.usage,
    };
  }

  // ─── 2. Batch generator — ทั้งหมวด หรือ productIds[] ──────────
  async generateBatch(dto: AffiliateBatchDto, user: AuthUser) {
    if (!dto.categoryKey && !(dto.productIds && dto.productIds.length > 0)) {
      throw new BadRequestException('ต้องระบุ categoryKey หรือ productIds อย่างใดอย่างหนึ่ง');
    }
    const platform = dto.platform?.trim() || DEFAULT_PLATFORM;
    const onlyMissing = dto.onlyMissing ?? true;

    // เลือกสินค้า affiliate ในขอบเขต (เฉพาะที่ยังไม่ archive)
    const scopeWhere: Prisma.ProductWhereInput = {
      isAffiliate: true,
      archivedAt: null,
      ...(dto.productIds && dto.productIds.length > 0
        ? { id: { in: dto.productIds } }
        : { category: dto.categoryKey }),
    };
    const all = await this.prisma.product.findMany({
      where: scopeWhere,
      orderBy: { createdAt: 'asc' },
    });

    if (all.length === 0) {
      throw new BadRequestException('ไม่พบสินค้า affiliate ในขอบเขตที่ระบุ');
    }

    // ข้ามสินค้าที่มีคอนเทนต์ affiliate อยู่แล้ว (onlyMissing)
    let skipped = 0;
    let scope = all;
    if (onlyMissing) {
      const existing = await this.prisma.contentItem.findMany({
        where: {
          sourceType: 'affiliate',
          productId: { in: all.map((p) => p.id) },
          archivedAt: null,
        },
        select: { productId: true },
        distinct: ['productId'],
      });
      const done = new Set(existing.map((c) => c.productId));
      scope = all.filter((p) => !done.has(p.id));
      skipped = all.length - scope.length;
    }

    // cap ~25 ต่อ call — รายงานถ้าถูกตัด
    const truncated = scope.length > BATCH_CAP;
    const targets = scope.slice(0, BATCH_CAP);

    const items: unknown[] = [];
    const failedItems: { productId: string; name: string; error: string }[] = [];
    let generated = 0;

    // sequential — กัน rate limit + per-item failure ไม่ล้มทั้ง batch
    for (const product of targets) {
      try {
        const out = await this.runReviewForProduct(product, platform, false, user);
        items.push(out.item);
        generated++;
      } catch (err) {
        failedItems.push({
          productId: product.id,
          name: product.name,
          error: err instanceof Error ? err.message : 'unknown error',
        });
      }
    }

    await this.claude.audit(user, 'ai_affiliate_batch', 'content', null, {
      scope: dto.categoryKey ? { categoryKey: dto.categoryKey } : { productIds: dto.productIds },
      platform,
      onlyMissing,
      inScope: all.length,
      attempted: targets.length,
      generated,
      skipped,
      failed: failedItems.length,
      truncated,
    });

    return {
      generated,
      skipped,
      failed: failedItems.length,
      truncated,
      ...(truncated ? { truncatedNote: `สร้างได้สูงสุด ${BATCH_CAP} ชิ้นต่อครั้ง — เหลืออีก ${scope.length - BATCH_CAP} ชิ้น กดสร้างซ้ำได้` } : {}),
      failedItems,
      items,
    };
  }

  // ─── 3. อ่านคอนเทนต์ที่สร้างแล้ว (สำหรับหน้า affiliate) ────────
  async listContent(params: { category?: string; productId?: string }) {
    // ถ้ากรองด้วย category ต้องหา productId ในหมวดนั้นก่อน (ContentItem ไม่มี category)
    let productFilter: Prisma.ContentItemWhereInput = {};
    if (params.productId) {
      productFilter = { productId: params.productId };
    } else if (params.category) {
      const prods = await this.prisma.product.findMany({
        where: { isAffiliate: true, category: params.category, archivedAt: null },
        select: { id: true },
      });
      productFilter = { productId: { in: prods.map((p) => p.id) } };
    }

    const items = await this.prisma.contentItem.findMany({
      where: { sourceType: 'affiliate', archivedAt: null, ...productFilter },
      orderBy: { updatedAt: 'desc' },
      include: {
        product: { select: { id: true, name: true, displayCode: true, affiliateUrl: true, affiliatePlatform: true } },
      },
    });
    return { items };
  }

  // ─── helpers ─────────────────────────────────────────────────

  private async resolveAffiliateProduct(productId: string): Promise<Product> {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product || product.archivedAt) throw new NotFoundException('ไม่พบสินค้า');
    if (!product.isAffiliate) {
      throw new BadRequestException('สินค้านี้ไม่ใช่สินค้า affiliate — ตั้งค่า isAffiliate ก่อน');
    }
    return product;
  }

  // ── additive (Affiliate Clip Jobs): compose ชุดรีวิวโดย "ไม่ persist" ContentItem ──
  // logic การ gen + guardrail เดียวกับ runReviewForProduct เป๊ะ — แยกออกมาให้ clip-jobs plan
  // เรียกใช้ส่วนสคริปต์/แคปชัน/แฮชแท็กได้โดยไม่สร้าง ContentItem ซ้ำซ้อน
  async composeReview(
    product: Product,
    platform: string,
    // compliancePlatform: แพลตฟอร์มสำหรับกรองคำต้องห้าม (Clip Jobs ส่ง job.platform มา,
    // หน้า Affiliate ไม่ส่ง = ฉีดคำต้องห้ามทุกแพลตฟอร์ม) — additive, caller เดิมไม่กระทบ
    opts: { regenerate?: boolean; compliancePlatform?: string | null } = {},
  ): Promise<{
    hook: string;
    body: string;
    cta: string;
    shots: ReviewShot[];
    caption: string;
    hashtags: string[];
    warning?: string;
    strippedClaims: string[];
    model: string;
    usage: { inputTokens: number; outputTokens: number };
  }> {
    const categoryLabel = product.category
      ? (await this.prisma.productCategory.findUnique({ where: { key: product.category } }))?.label ??
        product.category
      : null;

    const restrictedClaims = (product.restrictedClaims ?? []).filter((c) => c.trim().length > 0);
    const priceStr = product.salePrice != null
      ? `${product.salePrice} บาท (ราคาปกติ ${product.price ?? '-'} บาท)`
      : product.price != null
        ? `${product.price} บาท`
        : 'ไม่ระบุ';

    // GUARDRAIL — feed restrictedClaims + claimRiskLevel เข้า prompt (วินัยเดียวกับ AI Caption tool §G.2)
    const guardrailLines = [
      'GUARDRAILS — บังคับใช้เสมอ ห้ามละเมิดเด็ดขาด (per AISTAR policy §G.2):',
      '1. ห้าม claim สรรพคุณเกินจริงตามกฎ อย. — ห้ามคำรับประกันผลลัพธ์ เช่น "หายขาด" "ขาว 100%" "ลดจริงใน 7 วัน" หรือคำอ้างทางการแพทย์',
      '2. โทนการขาย/รีวิวต้องจริงใจ ตรวจสอบได้ ไม่หลอกลวงผู้บริโภค — เน้นประโยชน์ที่จับต้องได้จริง',
      `3. ระดับความเสี่ยงการเคลมของสินค้านี้: ${product.claimRiskLevel} — ${
        product.claimRiskLevel === 'high'
          ? 'ระวังเป็นพิเศษ ใช้ภาษากลาง ๆ หลีกเลี่ยงการเคลมผลลัพธ์ทุกชนิด'
          : product.claimRiskLevel === 'medium'
            ? 'ระวังการเคลมผลลัพธ์ ใช้คำว่า "ช่วย" "อาจ" แทนการรับประกัน'
            : 'ความเสี่ยงต่ำ แต่ยังต้องไม่เคลมเกินจริง'
      }`,
      ...(restrictedClaims.length
        ? [
            `4. ห้ามใช้ข้อความ claim เหล่านี้เด็ดขาด (restricted claims ของสินค้า): ${restrictedClaims
              .map((c) => `"${c}"`)
              .join(', ')} — รวมถึงข้อความที่สื่อความหมายเดียวกัน`,
          ]
        : []),
    ];

    // Layer 1 — Banned Words Compliance: ฉีดคลังคำต้องห้าม (active) เข้า system prompt
    // มี platform → กรองเฉพาะคำที่บังคับใช้กับแพลตฟอร์มนั้น, ไม่มี → ฉีดทุกคำ (ปลอดภัยไว้ก่อน)
    const bannedPlatform = normalizeCompliancePlatform(opts.compliancePlatform);
    const activeBannedWords = await this.prisma.bannedWord.findMany({
      where: { status: 'active' },
      orderBy: { term: 'asc' },
    });
    const bannedBlock = buildBannedWordsPromptBlock(
      activeBannedWords.filter((w) => wordAppliesToPlatform(w, bannedPlatform)),
    );

    const system = `คุณคือ Affiliate Content Creator ประจำ AISTAR Studio — สร้างชุดคอนเทนต์รีวิวสินค้า affiliate ภาษาไทยสำหรับโพสต์ลงเพจ Facebook
หน้าที่: รับข้อมูลสินค้า 1 ตัว แล้วสร้างชุดพร้อมโพสต์ = สคริปต์รีวิว (hook/body/cta) + shot list สำหรับถ่ายคลิป + caption + hashtags
${guardrailLines.join('\n')}
กติกา:
- เนื้อหาทั้งหมดเป็นภาษาไทย (ยกเว้นค่า camera enum และบาง hashtag อังกฤษ)
- hook ต้องหยุดนิ้วคนเลื่อนใน 3 วิแรก (scroll-stopping) — ตั้งคำถาม/ปัญหา/ผลลัพธ์ที่คนอยากรู้
- body เล่าจุดเด่น/ประโยชน์ที่จับต้องได้ โทนรีวิวจริงใจเหมือนคนใช้จริง ไม่ใช่โฆษณาแข็ง ๆ
- cta ชวนกดลิงก์ในโพสต์/คอมเมนต์ ชัดเจนไม่กำกวม
- shots: 5-8 ช็อต เป็น breakdown ที่คนถ่ายเอาไปถ่าย/ตัดต่อเองได้ (camera ใช้เฉพาะค่า: ${AFFILIATE_CAMERA_VALUES.join(', ')})
- caption: พร้อมโพสต์ Facebook เลย โทนเป็นกันเอง มีอีโมจิพอดี
- hashtags: 8-15 อัน ผสมไทย/อังกฤษ + คำเฉพาะกลุ่ม (niche) ของสินค้า${bannedBlock}`;

    const userMessage = [
      'ข้อมูลสินค้า affiliate:',
      `- ชื่อสินค้า: ${product.name}`,
      ...(categoryLabel ? [`- หมวดหมู่: ${categoryLabel}`] : []),
      `- ราคา: ${priceStr}`,
      ...(product.description ? [`- รายละเอียด: ${product.description}`] : []),
      ...(product.affiliatePlatform ? [`- แพลตฟอร์มขาย: ${product.affiliatePlatform}`] : []),
      `- โพสต์ลงแพลตฟอร์ม: ${platform}`,
      '',
      'สร้างชุดคอนเทนต์รีวิวพร้อมโพสต์ตามสคีมา (hook, body, cta, shots 5-8 ช็อต, caption, hashtags 8-15 อัน)',
    ].join('\n');

    let call = await this.claude.callClaude<ReviewResult>({
      action: opts.regenerate ? 'ai_affiliate_review_regen' : 'ai_affiliate_review',
      system,
      content: userMessage,
      schema: AFFILIATE_REVIEW_SCHEMA,
      maxTokens: 8000,
    });
    let result = call.parsed;

    // Post-check guardrail: restrictedClaims ต้องไม่โผล่ใน caption/hook/body/cta (case-insensitive)
    // — retry หนึ่งครั้ง แล้ว strip ที่เหลือ + แนบ warning ให้คนตรวจ (วินัยเดียวกับ AI Caption tool)
    const findViolations = (r: ReviewResult) =>
      restrictedClaims.filter((claim) => {
        const needle = claim.toLowerCase();
        return [r.caption, r.hook, r.body, r.cta].some((f) => (f ?? '').toLowerCase().includes(needle));
      });

    let warning: string | undefined;
    let violations = findViolations(result);
    if (violations.length > 0) {
      call = await this.claude.callClaude<ReviewResult>({
        action: 'ai_affiliate_review_retry',
        system,
        content: `${userMessage}\n\nคำเตือน: ผลก่อนหน้ามีข้อความ claim ต้องห้าม (${violations
          .map((v) => `"${v}"`)
          .join(', ')}) — เขียนใหม่โดยห้ามมีข้อความเหล่านี้หรือความหมายเดียวกันเด็ดขาด`,
        schema: AFFILIATE_REVIEW_SCHEMA,
        maxTokens: 8000,
      });
      result = call.parsed;
      violations = findViolations(result);
      if (violations.length > 0) {
        for (const claim of violations) {
          const pattern = new RegExp(claim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
          const strip = (s: string | undefined) => (s ?? '').replace(pattern, '').replace(/\s{2,}/g, ' ').trim();
          result.caption = strip(result.caption);
          result.hook = strip(result.hook);
          result.body = strip(result.body);
          result.cta = strip(result.cta);
        }
        warning = `พบข้อความ claim ต้องห้ามในผลลัพธ์ AI และถูกตัดออกแล้ว: ${violations.join(
          ', ',
        )} — กรุณาตรวจก่อนโพสต์`;
      }
    }

    // sanitize shots — camera ต้องอยู่ในชุดที่กำหนด
    const shots = (result.shots ?? []).map((s) => ({
      scene: s.scene ?? '',
      camera: (AFFILIATE_CAMERA_VALUES as readonly string[]).includes(s.camera) ? s.camera : 'medium',
      action: s.action ?? '',
      dialogue: s.dialogue ?? '',
    }));
    const hashtags = (result.hashtags ?? []).filter((h) => h.trim().length > 0);

    return {
      hook: result.hook,
      body: result.body,
      cta: result.cta,
      shots,
      caption: result.caption,
      hashtags,
      warning,
      strippedClaims: warning ? violations : [],
      model: call.model,
      usage: call.usage,
    };
  }

  // สร้าง (หรือ regenerate) ชุดคอนเทนต์รีวิวต่อสินค้า 1 ตัว → persist เป็น ContentItem
  private async runReviewForProduct(
    product: Product,
    platform: string,
    regenerate: boolean,
    user: AuthUser,
  ) {
    const review = await this.composeReview(product, platform, { regenerate });
    const { warning, model, usage } = review;
    const restrictedClaims = (product.restrictedClaims ?? []).filter((c) => c.trim().length > 0);

    const scriptJson = {
      hook: review.hook,
      body: review.body,
      cta: review.cta,
      shots: review.shots,
    } as unknown as Prisma.InputJsonValue;
    const hashtags = review.hashtags;

    // persist — create ใหม่ หรือ update ตัวเดิม (regenerate + มีอยู่แล้ว)
    const existing = regenerate
      ? await this.prisma.contentItem.findFirst({
          where: { sourceType: 'affiliate', productId: product.id, archivedAt: null },
          orderBy: { createdAt: 'desc' },
        })
      : null;

    const data = {
      title: `รีวิว ${product.name}`,
      platform,
      contentFormat: 'short_video',
      contentType: 'review',
      sourceType: 'affiliate',
      productId: product.id,
      caption: review.caption,
      hook: review.hook,
      cta: review.cta,
      hashtags,
      scriptJson,
      affiliateUrlSnapshot: product.affiliateUrl ?? null,
      ownerId: user.id,
    };

    let item;
    let updated = false;
    if (existing) {
      item = await this.prisma.contentItem.update({ where: { id: existing.id }, data });
      updated = true;
    } else {
      item = await this.prisma.contentItem.create({ data: { ...data, status: 'idea' } });
    }

    await this.claude.audit(user, 'ai_affiliate_review', 'content', item.id, {
      model,
      usage,
      productId: product.id,
      platform,
      updated,
      restrictedClaimsFed: restrictedClaims.length,
      claimRiskLevel: product.claimRiskLevel,
      strippedClaims: review.strippedClaims,
    });

    return { item, warning, updated, model, usage };
  }
}
