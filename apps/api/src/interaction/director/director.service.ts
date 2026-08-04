import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DirectorRun, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../auth/current-user.decorator';
import { AiClaudeService } from '../../ai/ai-claude.service';
import { BrandKnowledgeService } from '../../products/brand-knowledge.service';
import {
  InteractionTemplatesService,
  RecipeStepLike,
} from '../interaction-templates/interaction-templates.service';
import {
  DIRECTOR_SCHEMA,
  DIRECTOR_SECTIONS,
  DirectorAiResult,
} from './director.schemas';
import { ListDirectorRunsQuery, RecommendDirectorDto } from './dto/director.dto';

const DEFAULT_PAGE_SIZE = 20;
const CANDIDATE_TAKE = 60; // เพดานจำนวน library item ที่ป้อนเข้า context ต่อชนิด

// post-processed recommendation step (id coerce แล้ว)
interface RecipeStep {
  stepOrder: number;
  section: string;
  gestureId: string | null;
  handId: string | null;
  cameraId: string | null;
  lightingId: string | null;
  durationSec: number | null;
  reason: string;
}

@Injectable()
export class DirectorService {
  private readonly logger = new Logger(DirectorService.name);

  constructor(
    private prisma: PrismaService,
    private claude: AiClaudeService,
    private brandKnowledge: BrandKnowledgeService,
    private templates: InteractionTemplatesService,
  ) {}

  async status() {
    return { configured: await this.claude.isConfigured(), model: await this.claude.resolveModel() };
  }

  // ─── POST /director/recommend — วิซาร์ดหลัก: assemble context → Claude → coerce → prompt-package + validate ──
  async recommend(dto: RecommendDirectorDto, user: AuthUser) {
    // 1) สร้าง run (generating) ก่อน — เพื่อให้ทุกกรณี (แม้ AI ล้ม) ยัง persist
    const run = await this.createRun(dto, user);

    try {
      // 2) โหลด product (ถ้ามี) → เติม category/packaging/claims ที่ยังไม่ระบุ
      const product = dto.productId
        ? await this.prisma.product.findUnique({
            where: { id: dto.productId },
            include: { brand: { select: { id: true, name: true } } },
          })
        : null;
      const productCategory = dto.productCategory ?? product?.category ?? null;
      const packagingType = dto.packagingType ?? null;
      const brandId = dto.brandId ?? product?.brandId ?? null;

      // 3) โหลดคลัง library ที่ "ใช้ได้จริง" (active; มือ = ไม่ใช่เด็ก)
      const cand = await this.loadCandidates(packagingType, productCategory);

      // 4) brand guideline (ถ้ามี) — reuse BrandKnowledgeService
      let brandContextText = '';
      if (brandId) {
        try {
          brandContextText = await this.brandKnowledge.buildBrandContext(brandId);
        } catch {
          brandContextText = '';
        }
      }

      // 5) เรียก Claude
      const system = this.buildSystemPrompt();
      const content = this.buildUserPrompt(dto, product, productCategory, packagingType, brandContextText, cand);
      const call = await this.claude.callClaude<DirectorAiResult>({
        action: 'ai_director_recommend',
        system,
        content,
        schema: DIRECTOR_SCHEMA,
        maxTokens: 8000,
      });

      // 6) post-process: coerce id ที่ hallucinate → null (log ไว้)
      const idSets = {
        gesture: new Set(cand.gestures.map((g) => g.id)),
        hand: new Set(cand.hands.map((h) => h.id)),
        camera: new Set(cand.cameras.map((c) => c.id)),
        lighting: new Set(cand.lightings.map((l) => l.id)),
        template: new Set(cand.templates.map((t) => t.id)),
      };
      const dropped = { gestureIds: [] as string[], handIds: [] as string[], cameraIds: [] as string[], lightingIds: [] as string[] };
      const coerce = (raw: string | undefined, set: Set<string>, bucket: string[]): string | null => {
        const v = (raw ?? '').trim();
        if (!v) return null;
        if (set.has(v)) return v;
        bucket.push(v);
        return null;
      };

      const aiSteps = Array.isArray(call.parsed.steps) ? call.parsed.steps : [];
      const steps: RecipeStep[] = aiSteps.map((s, i) => ({
        stepOrder: i,
        section: DIRECTOR_SECTIONS.includes(s.section as (typeof DIRECTOR_SECTIONS)[number])
          ? s.section
          : 'interaction',
        gestureId: coerce(s.gestureId, idSets.gesture, dropped.gestureIds),
        handId: coerce(s.handId, idSets.hand, dropped.handIds),
        cameraId: coerce(s.cameraId, idSets.camera, dropped.cameraIds),
        lightingId: coerce(s.lightingId, idSets.lighting, dropped.lightingIds),
        durationSec: typeof s.durationSec === 'number' && s.durationSec > 0 ? round1(s.durationSec) : null,
        reason: (s.reason ?? '').trim(),
      }));
      const droppedCount =
        dropped.gestureIds.length + dropped.handIds.length + dropped.cameraIds.length + dropped.lightingIds.length;
      if (droppedCount > 0) {
        this.logger.warn(
          `AI Director ${run.displayCode}: dropped ${droppedCount} hallucinated id(s) — ${JSON.stringify(dropped)}`,
        );
      }

      // 7) defaults = ที่ใช้บ่อยสุดในสูตร (preferredHand ชนะถ้า valid) → ใช้ทั้ง prompt-package fallback + apply
      const preferred =
        dto.preferredHandId && idSets.hand.has(dto.preferredHandId) ? dto.preferredHandId : null;
      const defaults = {
        handId: preferred ?? mode(steps.map((s) => s.handId)),
        cameraId: mode(steps.map((s) => s.cameraId)),
        lightingId: mode(steps.map((s) => s.lightingId)),
      };

      // 8) prompt-package (reuse composePromptPackageFor) + validate (reuse validateStepsFor) — ไม่บันทึกเทมเพลต
      const recipeSteps: RecipeStepLike[] = steps.map((s) => ({
        section: s.section,
        gestureId: s.gestureId,
        handId: s.handId,
        cameraId: s.cameraId,
        lightingId: s.lightingId,
        durationSec: s.durationSec,
      }));
      const promptPackage = await this.templates.composePromptPackageFor(
        {
          packagingType,
          materialType: null,
          aspectRatio: null,
          defaultHandId: defaults.handId,
          defaultCameraId: defaults.cameraId,
          defaultLightingId: defaults.lightingId,
        },
        recipeSteps,
      );
      const validation = await this.templates.validateStepsFor(
        { packagingType, targetDurationSec: dto.targetDurationSec ?? null, defaultCameraId: defaults.cameraId },
        recipeSteps,
      );

      // 9) baseTemplate → recommendedTemplateId (ถ้า AI อิงเทมเพลตเดิม)
      const recommendedTemplateId = coerce(call.parsed.baseTemplateId, idSets.template, []);

      const reasons = Array.isArray(call.parsed.reasons)
        ? call.parsed.reasons
            .map((r) => ({ topic: (r.topic ?? '').trim(), text: (r.text ?? '').trim() }))
            .filter((r) => r.text.length > 0)
        : [];

      const resultJson = {
        storyboardType: (call.parsed.storyboardType ?? '').trim() || null,
        durationSec: typeof call.parsed.durationSec === 'number' ? round1(call.parsed.durationSec) : null,
        summary: (call.parsed.summary ?? '').trim(),
        steps,
        reasons,
        defaults,
        promptPackage,
        validation: { errors: validation.errors, warnings: validation.warnings },
        dropped,
        meta: {
          productId: dto.productId ?? null,
          productName: product?.name ?? null,
          brandId,
          candidateCounts: {
            gestures: cand.gestures.length,
            hands: cand.hands.length,
            cameras: cand.cameras.length,
            lightings: cand.lightings.length,
            templates: cand.templates.length,
          },
          model: call.model,
          usage: call.usage,
        },
      };
      const reasoning = [resultJson.summary, ...reasons.map((r) => `• ${r.topic}: ${r.text}`)]
        .filter(Boolean)
        .join('\n');

      const updated = await this.prisma.directorRun.update({
        where: { id: run.id },
        data: {
          productCategory,
          brandId,
          recommendedTemplateId,
          resultJson: resultJson as unknown as Prisma.InputJsonValue,
          reasoning,
          status: 'ready',
          errorMessage: null,
        },
      });
      await this.claude.audit(user, 'ai_director_recommend', 'director_run', run.id, {
        model: call.model,
        usage: call.usage,
        droppedCount,
        stepCount: steps.length,
      });
      return this.enrich(updated);
    } catch (err) {
      // AI ล้ม (เช่น ServiceUnavailableException คีย์ไม่ตั้งค่า) → persist failed + errorMessage แล้วคืน run
      const message = err instanceof Error ? err.message : 'เรียก AI ไม่สำเร็จ';
      this.logger.warn(`AI Director ${run.displayCode} failed: ${message}`);
      const failed = await this.prisma.directorRun.update({
        where: { id: run.id },
        data: { status: 'failed', errorMessage: message },
      });
      return this.enrich(failed);
    }
  }

  // ─── GET /director ────────────────────────────────────────────
  async list(query: ListDirectorRunsQuery) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const take = DEFAULT_PAGE_SIZE;
    const where: Prisma.DirectorRunWhereInput = {
      ...(query.status ? { status: query.status } : { status: { not: 'archived' } }),
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.q
        ? {
            OR: [
              { displayCode: { contains: query.q, mode: 'insensitive' } },
              { objective: { contains: query.q, mode: 'insensitive' } },
              { notes: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.directorRun.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * take,
        take,
      }),
      this.prisma.directorRun.count({ where }),
    ]);
    return { items, total, page, pageSize: take };
  }

  // ─── GET /director/:id — detail + enrich ชื่อ gesture/hand/camera/lighting ต่อ step ──
  async get(id: string) {
    const run = await this.prisma.directorRun.findUnique({ where: { id } });
    if (!run) throw new NotFoundException('ไม่พบ AI Director run');
    return this.enrich(run);
  }

  // ─── POST /director/:id/apply — recommendation → InteractionTemplate จริง + steps ──
  async apply(id: string, user: AuthUser, via = 'ui') {
    const run = await this.prisma.directorRun.findUnique({ where: { id } });
    if (!run) throw new NotFoundException('ไม่พบ AI Director run');

    // idempotent-ish: เคย apply แล้ว → คืนเทมเพลตเดิม (ไม่สร้างซ้ำ)
    if (run.appliedTemplateId) {
      return this.templates.get(run.appliedTemplateId);
    }
    if (run.status !== 'ready' || !run.resultJson) {
      throw new BadRequestException('ยังไม่มีผลลัพธ์พร้อมบันทึก — แนะนำสูตรให้สำเร็จก่อน');
    }

    const result = run.resultJson as unknown as {
      storyboardType?: string | null;
      steps?: RecipeStep[];
      defaults?: { handId: string | null; cameraId: string | null; lightingId: string | null };
    };
    const steps = Array.isArray(result.steps) ? result.steps : [];
    const defaults = result.defaults ?? { handId: null, cameraId: null, lightingId: null };

    // ชื่อเทมเพลต — จากสินค้า/objective + รหัส run
    let base = run.productCategory ?? 'สูตรคลิป';
    if (run.productId) {
      const product = await this.prisma.product.findUnique({
        where: { id: run.productId },
        select: { name: true },
      });
      if (product?.name) base = product.name;
    }
    const name = `[AI] ${base}${run.objective ? ` — ${run.objective}` : ''} (${run.displayCode})`;

    const template = await this.templates.create(
      {
        name,
        productCategory: run.productCategory ?? undefined,
        packagingType: run.packagingType ?? undefined,
        platform: run.platform ?? undefined,
        storyboardType: result.storyboardType ?? undefined,
        targetDurationSec: run.targetDurationSec ?? undefined,
        defaultHandId: defaults.handId ?? undefined,
        defaultCameraId: defaults.cameraId ?? undefined,
        defaultLightingId: defaults.lightingId ?? undefined,
        status: 'draft',
      },
      user,
      via,
    );

    await this.templates.replaceSteps(
      template.id,
      {
        steps: steps.map((s) => ({
          section: s.section,
          gestureId: s.gestureId ?? undefined,
          handId: s.handId ?? undefined,
          cameraId: s.cameraId ?? undefined,
          lightingId: s.lightingId ?? undefined,
          durationSec: s.durationSec ?? undefined,
        })),
      },
      user,
      via,
    );

    await this.prisma.directorRun.update({
      where: { id },
      data: { appliedTemplateId: template.id, status: 'applied' },
    });
    await this.claude.audit(user, 'ai_director_apply', 'director_run', id, {
      templateId: template.id,
      stepCount: steps.length,
    });
    return this.templates.get(template.id);
  }

  // ─── DELETE /director/:id — soft archive (สอดคล้อง hand-profiles) ──
  async remove(id: string, user: AuthUser, via = 'ui') {
    const run = await this.prisma.directorRun.findUnique({ where: { id }, select: { id: true } });
    if (!run) throw new NotFoundException('ไม่พบ AI Director run');
    const archived = await this.prisma.directorRun.update({
      where: { id },
      data: { status: 'archived' },
    });
    await this.claude.audit(user, 'ai_director_archive', 'director_run', id, {});
    return archived;
  }

  // ─── helpers ──────────────────────────────────────────────────

  private async createRun(dto: RecommendDirectorDto, user: AuthUser): Promise<DirectorRun> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const displayCode = await this.generateDisplayCode();
      try {
        return await this.prisma.directorRun.create({
          data: {
            displayCode,
            productId: dto.productId ?? null,
            brandId: dto.brandId ?? null,
            productCategory: dto.productCategory ?? null,
            packagingType: dto.packagingType ?? null,
            platform: dto.platform ?? null,
            targetDurationSec: dto.targetDurationSec ?? null,
            objective: dto.objective ?? null,
            creativeStyle: dto.creativeStyle ?? null,
            language: dto.language?.trim() || 'th',
            preferredHandId: dto.preferredHandId ?? null,
            notes: dto.notes ?? null,
            status: 'generating',
            createdBy: user.id,
          },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002' && attempt < 4) {
          continue; // displayCode ชน — gen ใหม่แล้วลองอีกครั้ง
        }
        throw err;
      }
    }
    throw new BadRequestException('สร้าง AI Director run ไม่สำเร็จ (รหัสซ้ำ) — ลองอีกครั้ง');
  }

  private async generateDisplayCode(): Promise<string> {
    const count = await this.prisma.directorRun.count();
    return `DIR-${String(count + 1).padStart(4, '0')}`;
  }

  // โหลดคลังที่เลือกได้ (active; hand ไม่ใช่เด็ก) + เทมเพลตอ้างอิงที่ match packaging/category
  private async loadCandidates(packagingType: string | null, productCategory: string | null) {
    const templateWhere: Prisma.InteractionTemplateWhereInput = {
      status: 'active',
      ...(packagingType || productCategory
        ? {
            OR: [
              ...(packagingType ? [{ packagingType }] : []),
              ...(productCategory ? [{ productCategory }] : []),
            ],
          }
        : {}),
    };
    const [gestures, hands, cameras, lightings, templates] = await this.prisma.$transaction([
      this.prisma.gesture.findMany({
        where: { status: 'active' },
        orderBy: { updatedAt: 'desc' },
        take: CANDIDATE_TAKE,
        select: {
          id: true,
          key: true,
          name: true,
          category: true,
          naturalDurationSec: true,
          requiredProductState: true,
          resultingProductState: true,
          compatiblePackaging: true,
          riskLevel: true,
        },
      }),
      this.prisma.handProfile.findMany({
        where: { status: 'active', isChild: false },
        orderBy: { updatedAt: 'desc' },
        take: CANDIDATE_TAKE,
        select: {
          id: true,
          name: true,
          category: true,
          skinTone: true,
          nailStyle: true,
          accessories: true,
          productCategorySuitability: true,
          restrictedGestures: true,
        },
      }),
      this.prisma.cameraPreset.findMany({
        where: { status: 'active' },
        orderBy: { updatedAt: 'desc' },
        take: CANDIDATE_TAKE,
        select: {
          id: true,
          name: true,
          shotSize: true,
          angle: true,
          cameraMovement: true,
          compatiblePackaging: true,
        },
      }),
      this.prisma.lightingPreset.findMany({
        where: { status: 'active' },
        orderBy: { updatedAt: 'desc' },
        take: CANDIDATE_TAKE,
        select: {
          id: true,
          name: true,
          mood: true,
          colorTemperature: true,
          reflectiveProductRule: true,
          transparentProductRule: true,
          skinToneCompatibility: true,
        },
      }),
      this.prisma.interactionTemplate.findMany({
        where: templateWhere,
        orderBy: { updatedAt: 'desc' },
        take: 10,
        select: {
          id: true,
          displayCode: true,
          name: true,
          packagingType: true,
          productCategory: true,
          storyboardType: true,
          targetDurationSec: true,
        },
      }),
    ]);
    return { gestures, hands, cameras, lightings, templates };
  }

  private buildSystemPrompt(): string {
    return `คุณคือ AI Director ของ AISTAR Studio — เลือก "สูตรถ่ายคลิปสินค้า" ให้ครบทั้งลำดับ (template/สตอรี่บอร์ด + ท่ามือ + มุมกล้อง + แสง ต่อ step) พร้อมเหตุผลภาษาไทย
กติกาสำคัญ:
- ต้องเลือกจากรายการคลัง (library) ที่ให้มาเท่านั้น — ใช้ค่า id ที่ระบุในแต่ละรายการ ห้ามแต่ง id ขึ้นเอง ห้ามใช้ id ที่ไม่มีในรายการ
- ถ้า step ไหนไม่มีท่า/มุมกล้อง/แสง ให้ปล่อย field นั้นเป็น string ว่าง
- ห้ามแนะนำมือเด็ก (รายการมือที่ให้คัดออกแล้ว)
- ลำดับ step ต้องสมเหตุผลตาม state ของสินค้า (เช่น ต้องเปิดฝาก่อนถึงจะใช้งานได้) และควรมีช่วง hook เปิด และ cta ปิด
- ความยาวรวมควรใกล้เคียงเป้าหมายที่ให้ (±10%)
- เนื้อหาเหตุผล/สรุปทั้งหมดเป็นภาษาไทย (ยกเว้นค่า key/id อังกฤษ)
- reasons ต้องอธิบายอย่างน้อย: ทำไมเลือกมือแบบนี้, ทำไมมุมกล้องแบบนี้, ทำไมความยาวเท่านี้, และตัดอะไรออกเพราะอะไร (§3.13.3)`;
  }

  private buildUserPrompt(
    dto: RecommendDirectorDto,
    product: { name: string; category: string | null; restrictedClaims: string[] } | null,
    productCategory: string | null,
    packagingType: string | null,
    brandContextText: string,
    cand: Awaited<ReturnType<DirectorService['loadCandidates']>>,
  ): string {
    const blocks: string[] = [];

    // โจทย์/พารามิเตอร์การถ่าย
    const params = [
      product ? `สินค้า: ${product.name}` : null,
      productCategory ? `หมวดสินค้า: ${productCategory}` : null,
      packagingType ? `บรรจุภัณฑ์: ${packagingType}` : null,
      dto.platform ? `แพลตฟอร์ม: ${dto.platform}` : null,
      dto.targetDurationSec ? `ความยาวเป้าหมาย: ${dto.targetDurationSec} วินาที` : null,
      dto.objective ? `วัตถุประสงค์: ${dto.objective}` : null,
      dto.creativeStyle ? `สไตล์: ${dto.creativeStyle}` : null,
      product && product.restrictedClaims.length > 0
        ? `เคลมที่ห้ามพูด: ${product.restrictedClaims.join(', ')}`
        : null,
      dto.notes ? `โจทย์เพิ่มเติม: ${dto.notes}` : null,
    ].filter(Boolean);
    blocks.push(`[พารามิเตอร์การถ่าย]\n${params.length ? params.join('\n') : '— ไม่ได้ระบุเจาะจง —'}`);

    if (brandContextText) {
      blocks.push(`[ความรู้แบรนด์ — เคารพโทน/Do-Don't/เคลมที่ห้าม]\n${brandContextText}`);
    }

    // คลัง — แต่ละบรรทัดขึ้นต้นด้วย id ให้ AI อ้างอิง
    blocks.push(
      `[ท่ามือที่เลือกได้ (Gesture) — รูปแบบ: id | ชื่อ (key) | ปกติ..วิ | state req→result | pkg]\n${
        cand.gestures
          .map(
            (g) =>
              `- ${g.id} | ${g.name}${g.key ? ` (${g.key})` : ''} | ${g.naturalDurationSec ?? '—'}วิ | ${
                g.requiredProductState ?? '—'
              }→${g.resultingProductState ?? '—'} | ${g.compatiblePackaging.join('/') || 'ทุกแบบ'}`,
          )
          .join('\n') || '— ไม่มีท่าในคลัง —'
      }`,
    );
    blocks.push(
      `[มือที่เลือกได้ (Hand, ไม่รวมมือเด็ก) — id | ชื่อ | หมวด | โทนผิว | เหมาะกับหมวด]\n${
        cand.hands
          .map(
            (h) =>
              `- ${h.id} | ${h.name} | ${h.category} | ${h.skinTone ?? '—'} | ${
                h.productCategorySuitability.join('/') || 'ทั่วไป'
              }`,
          )
          .join('\n') || '— ไม่มีมือในคลัง —'
      }`,
    );
    blocks.push(
      `[มุมกล้องที่เลือกได้ (Camera) — id | ชื่อ | shotSize | angle | movement | pkg]\n${
        cand.cameras
          .map(
            (c) =>
              `- ${c.id} | ${c.name} | ${c.shotSize ?? '—'} | ${c.angle ?? '—'} | ${
                c.cameraMovement ?? '—'
              } | ${c.compatiblePackaging.join('/') || 'ทุกแบบ'}`,
          )
          .join('\n') || '— ไม่มีมุมกล้องในคลัง —'
      }`,
    );
    blocks.push(
      `[แสงที่เลือกได้ (Lighting) — id | ชื่อ | mood | อุณหภูมิสี | กฎผิวมันวาว/โปร่งใส]\n${
        cand.lightings
          .map(
            (l) =>
              `- ${l.id} | ${l.name} | ${l.mood ?? '—'} | ${l.colorTemperature ?? '—'} | reflective:${
                l.reflectiveProductRule ?? '—'
              } transparent:${l.transparentProductRule ?? '—'}`,
          )
          .join('\n') || '— ไม่มีแสงในคลัง —'
      }`,
    );

    if (cand.templates.length > 0) {
      blocks.push(
        `[เทมเพลตอ้างอิงเดิมที่ match (ใช้เป็นฐานได้ ผ่าน baseTemplateId) — id | รหัส | ชื่อ | pkg/หมวด | storyboard | เป้าวิ]\n${cand.templates
          .map(
            (t) =>
              `- ${t.id} | ${t.displayCode} | ${t.name} | ${t.packagingType ?? '—'}/${
                t.productCategory ?? '—'
              } | ${t.storyboardType ?? '—'} | ${t.targetDurationSec ?? '—'}`,
          )
          .join('\n')}`,
      );
    }

    blocks.push(
      'จงออกแบบสูตรคลิปตามสคีมา: เลือก storyboardType, ความยาวรวม, สรุป, และ steps (แต่ละ step เลือก gesture/hand/camera/lighting จาก id ข้างต้นเท่านั้น + เหตุผลไทย) พร้อม reasons ภาพรวม',
    );
    return blocks.join('\n\n');
  }

  // enrich resultJson.steps ด้วยชื่อ gesture/hand/camera/lighting (mirror template detail)
  private async enrich(run: DirectorRun) {
    const result = run.resultJson as unknown as { steps?: RecipeStep[] } | null;
    const steps = result && Array.isArray(result.steps) ? result.steps : [];
    if (steps.length === 0) return { ...run, steps: [] as unknown[] };

    const gestureIds = uniq(steps.map((s) => s.gestureId));
    const handIds = uniq(steps.map((s) => s.handId));
    const cameraIds = uniq(steps.map((s) => s.cameraId));
    const lightingIds = uniq(steps.map((s) => s.lightingId));
    const [gestures, hands, cameras, lightings] = await this.prisma.$transaction([
      this.prisma.gesture.findMany({
        where: { id: { in: gestureIds } },
        select: { id: true, key: true, name: true, category: true, riskLevel: true, naturalDurationSec: true, requiredProductState: true, resultingProductState: true },
      }),
      this.prisma.handProfile.findMany({
        where: { id: { in: handIds } },
        select: { id: true, displayCode: true, name: true, category: true, skinTone: true },
      }),
      this.prisma.cameraPreset.findMany({
        where: { id: { in: cameraIds } },
        select: { id: true, displayCode: true, name: true, shotSize: true, angle: true, cameraMovement: true },
      }),
      this.prisma.lightingPreset.findMany({
        where: { id: { in: lightingIds } },
        select: { id: true, displayCode: true, name: true, mood: true, colorTemperature: true },
      }),
    ]);
    const gMap = new Map(gestures.map((g) => [g.id, g]));
    const hMap = new Map(hands.map((h) => [h.id, h]));
    const cMap = new Map(cameras.map((c) => [c.id, c]));
    const lMap = new Map(lightings.map((l) => [l.id, l]));
    const enrichedSteps = steps.map((s) => ({
      ...s,
      gesture: s.gestureId ? gMap.get(s.gestureId) ?? null : null,
      hand: s.handId ? hMap.get(s.handId) ?? null : null,
      camera: s.cameraId ? cMap.get(s.cameraId) ?? null : null,
      lighting: s.lightingId ? lMap.get(s.lightingId) ?? null : null,
    }));
    return { ...run, steps: enrichedSteps };
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function uniq(ids: (string | null)[]): string[] {
  return [...new Set(ids.filter((i): i is string => !!i))];
}

// ค่าที่พบบ่อยสุดในลิสต์ (ไม่นับ null) — ใช้เลือก default hand/camera/lighting
function mode(ids: (string | null)[]): string | null {
  const counts = new Map<string, number>();
  for (const id of ids) {
    if (!id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [id, c] of counts) {
    if (c > bestCount) {
      best = id;
      bestCount = c;
    }
  }
  return best;
}
