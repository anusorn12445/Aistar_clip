import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InteractionTemplate, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../auth/current-user.decorator';
import { ProductStatesService } from '../product-states/product-states.service';
import {
  CreateInteractionTemplateDto,
  ReplaceTemplateStepsDto,
  UpdateInteractionTemplateDto,
} from './dto/interaction-template.dto';

export interface ListTemplatesParams {
  q?: string;
  packagingType?: string;
  productCategory?: string;
  storyboardType?: string;
  platform?: string;
  status?: string;
  page?: number;
}

export interface TemplateValidateResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export interface PromptPackageStep {
  order: number;
  section: string;
  title: string;
  prompt: string;
  negativePrompt: string | null;
}

export interface PromptPackage {
  steps: PromptPackageStep[];
  combined: string;
}

// ── reusable shapes (slice 4 — AI Director) ────────────────────
// ชุด step แบบเบา (persisted หรือ ephemeral) ที่ป้อนเข้า compose/validate ได้เหมือนกัน
export interface RecipeStepLike {
  section: string;
  gestureId: string | null;
  handId: string | null;
  cameraId: string | null;
  lightingId: string | null;
  cameraNote?: string | null;
  lightingNote?: string | null;
  durationSec: number | null;
  note?: string | null;
}
// config ระดับ "เทมเพลต" ที่ prompt-package ต้องใช้ (InteractionTemplate เป็น superset)
export interface RecipePromptConfig {
  packagingType: string | null;
  materialType: string | null;
  aspectRatio: string | null;
  defaultHandId: string | null;
  defaultCameraId: string | null;
  defaultLightingId: string | null;
}
export interface RecipeValidateConfig {
  packagingType: string | null;
  targetDurationSec: number | null;
  defaultCameraId: string | null;
}

// เฉพาะ id refs ที่ lookups() อ่านจริง — ให้รับได้ทั้ง record จริงและ RecipeStepLike
type StepIdRefs = {
  gestureId: string | null;
  handId: string | null;
  cameraId: string | null;
  lightingId: string | null;
};

// ── summary shapes ที่ enrich ลงบน step (ไม่มี Prisma relation → join เอง) ──
const GESTURE_SELECT = {
  id: true,
  key: true,
  name: true,
  category: true,
  requiredProductState: true,
  resultingProductState: true,
  naturalDurationSec: true,
  minDurationSec: true,
  maxDurationSec: true,
  compatiblePackaging: true,
  promptTemplate: true,
  negativePrompt: true,
  riskLevel: true,
  status: true,
} satisfies Prisma.GestureSelect;
type GestureSummary = Prisma.GestureGetPayload<{ select: typeof GESTURE_SELECT }>;

const HAND_SELECT = {
  id: true,
  displayCode: true,
  name: true,
  category: true,
  skinTone: true,
  skinTexture: true,
  nailLength: true,
  nailShape: true,
  nailColor: true,
  nailStyle: true,
  accessories: true,
  sleeveStyle: true,
  restrictedGestures: true,
  status: true,
} satisfies Prisma.HandProfileSelect;
type HandSummary = Prisma.HandProfileGetPayload<{ select: typeof HAND_SELECT }>;

// Camera/Lighting summaries (slice 3) — enrich ลง step + ใช้ประกอบ prompt/validate
const CAMERA_SELECT = {
  id: true,
  displayCode: true,
  key: true,
  name: true,
  shotSize: true,
  angle: true,
  lens: true,
  focalLength: true,
  cameraMovement: true,
  movementSpeed: true,
  focusTarget: true,
  depthOfField: true,
  aspectRatio: true,
  productVisibility: true,
  handVisibility: true,
  compatiblePackaging: true,
  promptTemplate: true,
  negativePrompt: true,
  status: true,
} satisfies Prisma.CameraPresetSelect;
type CameraSummary = Prisma.CameraPresetGetPayload<{ select: typeof CAMERA_SELECT }>;

const LIGHTING_SELECT = {
  id: true,
  displayCode: true,
  key: true,
  name: true,
  keyLight: true,
  fillLight: true,
  backLight: true,
  colorTemperature: true,
  contrast: true,
  shadowLevel: true,
  mood: true,
  reflectiveProductRule: true,
  transparentProductRule: true,
  promptTemplate: true,
  negativePrompt: true,
  status: true,
} satisfies Prisma.LightingPresetSelect;
type LightingSummary = Prisma.LightingPresetGetPayload<{ select: typeof LIGHTING_SELECT }>;

// Interaction Template (SRS slice 2) — "clip recipe" ต่อ packaging type
// human-curated ล้วน: ไม่มี AI call / ไม่ gen วิดีโอ — แค่ประกอบข้อมูลจาก library slice 1
@Injectable()
export class InteractionTemplatesService {
  constructor(
    private prisma: PrismaService,
    private productStates: ProductStatesService,
  ) {}

  // ── list: filter + stepCount + ความยาวรวม (durationSec ?? gesture natural) ──
  async list(params: ListTemplatesParams) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const take = 20;

    const where: Prisma.InteractionTemplateWhereInput = {
      ...(params.status ? { status: params.status } : { status: { not: 'archived' } }),
      ...(params.packagingType ? { packagingType: params.packagingType } : {}),
      ...(params.productCategory ? { productCategory: params.productCategory } : {}),
      ...(params.storyboardType ? { storyboardType: params.storyboardType } : {}),
      ...(params.platform ? { platform: params.platform } : {}),
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
      this.prisma.interactionTemplate.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * take,
        take,
        include: { steps: { select: { durationSec: true, gestureId: true } } },
      }),
      this.prisma.interactionTemplate.count({ where }),
    ]);

    const gestureIds = [
      ...new Set(items.flatMap((t) => t.steps.map((s) => s.gestureId)).filter((g): g is string => !!g)),
    ];
    const naturals = new Map(
      (
        await this.prisma.gesture.findMany({
          where: { id: { in: gestureIds } },
          select: { id: true, naturalDurationSec: true },
        })
      ).map((g) => [g.id, g.naturalDurationSec]),
    );

    const withMeta = items.map(({ steps, ...t }) => ({
      ...t,
      stepCount: steps.length,
      totalDurationSec: round1(
        steps.reduce(
          (sum, s) => sum + (s.durationSec ?? (s.gestureId ? naturals.get(s.gestureId) ?? 0 : 0) ?? 0),
          0,
        ),
      ),
    }));
    return { items: withMeta, total, page, pageSize: take };
  }

  // ── get: template + steps (เรียง stepOrder) enrich ด้วย gesture/hand summary ──
  async get(id: string) {
    const template = await this.prisma.interactionTemplate.findUnique({
      where: { id },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });
    if (!template) throw new NotFoundException('ไม่พบ interaction template');

    const { gestures, hands, cameras, lightings } = await this.lookups(
      template.steps,
      template.defaultHandId,
      template.defaultCameraId,
      template.defaultLightingId,
    );
    const steps = template.steps.map((s) => ({
      ...s,
      gesture: s.gestureId ? gestures.get(s.gestureId) ?? null : null,
      hand: s.handId ? hands.get(s.handId) ?? null : null,
      camera: s.cameraId ? cameras.get(s.cameraId) ?? null : null,
      lighting: s.lightingId ? lightings.get(s.lightingId) ?? null : null,
    }));
    const defaultHand = template.defaultHandId ? hands.get(template.defaultHandId) ?? null : null;
    const defaultCamera = template.defaultCameraId ? cameras.get(template.defaultCameraId) ?? null : null;
    const defaultLighting = template.defaultLightingId
      ? lightings.get(template.defaultLightingId) ?? null
      : null;
    return {
      ...template,
      steps,
      defaultHand,
      defaultCamera,
      defaultLighting,
      stepCount: steps.length,
      totalDurationSec: round1(
        steps.reduce((sum, s) => sum + this.stepDuration(s, s.gesture), 0),
      ),
    };
  }

  async create(dto: CreateInteractionTemplateDto, user: AuthUser, via = 'ui') {
    if (dto.defaultHandId) await this.assertHandUsable(dto.defaultHandId);
    if (dto.defaultCameraId) await this.assertCameraUsable(dto.defaultCameraId);
    if (dto.defaultLightingId) await this.assertLightingUsable(dto.defaultLightingId);

    // displayCode @unique (ITPL-0001) — retry เมื่อชน P2002 (pattern เดียวกับ hand-profiles/image-requests)
    let template: InteractionTemplate | undefined;
    for (let attempt = 0; attempt < 5; attempt++) {
      const displayCode = await this.generateDisplayCode();
      try {
        template = await this.prisma.interactionTemplate.create({
          data: {
            displayCode,
            name: dto.name,
            description: dto.description,
            productCategory: dto.productCategory,
            packagingType: dto.packagingType,
            materialType: dto.materialType,
            platform: dto.platform,
            aspectRatio: dto.aspectRatio,
            storyboardType: dto.storyboardType,
            targetDurationSec: dto.targetDurationSec,
            defaultHandId: dto.defaultHandId,
            defaultCameraId: dto.defaultCameraId,
            defaultLightingId: dto.defaultLightingId,
            status: dto.status ?? 'draft',
            version: dto.version ?? 'v1',
            createdBy: user.id,
          },
        });
        break;
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002' && attempt < 4) {
          continue; // displayCode ชน — gen ใหม่แล้วลองอีกครั้ง
        }
        throw err;
      }
    }
    if (!template) throw new BadRequestException('สร้างเทมเพลตไม่สำเร็จ (รหัสซ้ำ) — ลองอีกครั้ง');

    await this.audit(user, via, 'create', template.id, { displayCode: template.displayCode });
    return template;
  }

  async update(id: string, dto: UpdateInteractionTemplateDto, user: AuthUser, via = 'ui') {
    const existing = await this.prisma.interactionTemplate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('ไม่พบ interaction template');
    if (dto.defaultHandId) await this.assertHandUsable(dto.defaultHandId);
    if (dto.defaultCameraId) await this.assertCameraUsable(dto.defaultCameraId);
    if (dto.defaultLightingId) await this.assertLightingUsable(dto.defaultLightingId);

    const data: Prisma.InteractionTemplateUpdateInput = {};
    const scalar: (keyof UpdateInteractionTemplateDto)[] = [
      'name', 'description', 'productCategory', 'packagingType', 'materialType',
      'platform', 'aspectRatio', 'storyboardType', 'targetDurationSec', 'defaultHandId',
      'defaultCameraId', 'defaultLightingId', 'status', 'version',
    ];
    for (const k of scalar) {
      if (dto[k] !== undefined) (data as Record<string, unknown>)[k] = dto[k];
    }
    if (dto.status && dto.status !== 'archived' && existing.status === 'archived') {
      (data as Record<string, unknown>).archivedAt = null; // restore จากกรุ
    }

    const template = await this.prisma.interactionTemplate.update({ where: { id }, data });
    await this.audit(user, via, 'update', id, { fields: Object.keys(data) });
    return template;
  }

  async archive(id: string, user: AuthUser, via = 'ui') {
    const existing = await this.prisma.interactionTemplate.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundException('ไม่พบ interaction template');
    const template = await this.prisma.interactionTemplate.update({
      where: { id },
      data: { status: 'archived', archivedAt: new Date() },
    });
    await this.audit(user, via, 'archive', id, {});
    return template;
  }

  // ── clone: copy template + steps → รหัสใหม่ / ชื่อ (copy) / v1 / draft ──
  async clone(id: string, user: AuthUser, via = 'ui') {
    const source = await this.prisma.interactionTemplate.findUnique({
      where: { id },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });
    if (!source) throw new NotFoundException('ไม่พบ interaction template');

    let copy: InteractionTemplate | undefined;
    for (let attempt = 0; attempt < 5; attempt++) {
      const displayCode = await this.generateDisplayCode();
      try {
        copy = await this.prisma.interactionTemplate.create({
          data: {
            displayCode,
            name: `${source.name} (copy)`,
            description: source.description,
            productCategory: source.productCategory,
            packagingType: source.packagingType,
            materialType: source.materialType,
            platform: source.platform,
            aspectRatio: source.aspectRatio,
            storyboardType: source.storyboardType,
            targetDurationSec: source.targetDurationSec,
            defaultHandId: source.defaultHandId,
            defaultCameraId: source.defaultCameraId,
            defaultLightingId: source.defaultLightingId,
            status: 'draft',
            version: 'v1',
            createdBy: user.id,
          },
        });
        break;
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002' && attempt < 4) {
          continue;
        }
        throw err;
      }
    }
    if (!copy) throw new BadRequestException('clone เทมเพลตไม่สำเร็จ (รหัสซ้ำ) — ลองอีกครั้ง');

    if (source.steps.length > 0) {
      await this.prisma.interactionTemplateStep.createMany({
        data: source.steps.map((s, index) => ({
          templateId: copy!.id,
          stepOrder: index,
          section: s.section,
          gestureId: s.gestureId,
          handId: s.handId,
          cameraId: s.cameraId,
          lightingId: s.lightingId,
          cameraNote: s.cameraNote,
          lightingNote: s.lightingNote,
          durationSec: s.durationSec,
          required: s.required,
          note: s.note,
        })),
      });
    }
    await this.audit(user, via, 'clone', copy.id, { sourceId: id, displayCode: copy.displayCode });
    return this.get(copy.id);
  }

  // ── step editor: replace-set ทั้งชุด (stepOrder = array index) ──
  async replaceSteps(id: string, dto: ReplaceTemplateStepsDto, user: AuthUser, via = 'ui') {
    const template = await this.prisma.interactionTemplate.findUnique({ where: { id } });
    if (!template) throw new NotFoundException('ไม่พบ interaction template');

    const gestureIds = [...new Set(dto.steps.map((s) => s.gestureId).filter((g): g is string => !!g))];
    const handIds = [
      ...new Set(
        [...dto.steps.map((s) => s.handId), template.defaultHandId].filter((h): h is string => !!h),
      ),
    ];
    const cameraIds = [
      ...new Set(
        [...dto.steps.map((s) => s.cameraId), template.defaultCameraId].filter((c): c is string => !!c),
      ),
    ];
    const lightingIds = [
      ...new Set(
        [...dto.steps.map((s) => s.lightingId), template.defaultLightingId].filter(
          (l): l is string => !!l,
        ),
      ),
    ];
    const [gestures, hands, cameras, lightings] = await this.prisma.$transaction([
      this.prisma.gesture.findMany({ where: { id: { in: gestureIds } }, select: GESTURE_SELECT }),
      this.prisma.handProfile.findMany({ where: { id: { in: handIds } }, select: HAND_SELECT }),
      this.prisma.cameraPreset.findMany({ where: { id: { in: cameraIds } }, select: CAMERA_SELECT }),
      this.prisma.lightingPreset.findMany({ where: { id: { in: lightingIds } }, select: LIGHTING_SELECT }),
    ]);
    const gestureById = new Map(gestures.map((g) => [g.id, g]));
    const handById = new Map(hands.map((h) => [h.id, h]));
    const cameraById = new Map(cameras.map((c) => [c.id, c]));
    const lightingById = new Map(lightings.map((l) => [l.id, l]));

    const warnings: string[] = [];
    dto.steps.forEach((step, index) => {
      const pos = index + 1;
      const gesture = step.gestureId ? gestureById.get(step.gestureId) : undefined;
      if (step.gestureId && !gesture) {
        throw new BadRequestException(`step ${pos}: ไม่พบ gesture (${step.gestureId})`);
      }
      if (gesture && gesture.status === 'archived') {
        throw new BadRequestException(
          `step ${pos}: ท่า "${gesture.name}" ถูกเก็บเข้ากรุแล้ว — เลือกท่าอื่น`,
        );
      }
      const hand = step.handId ? handById.get(step.handId) : undefined;
      if (step.handId && !hand) {
        throw new BadRequestException(`step ${pos}: ไม่พบ hand profile (${step.handId})`);
      }
      if (hand && hand.status === 'archived') {
        throw new BadRequestException(
          `step ${pos}: มือ "${hand.name}" ถูกเก็บเข้ากรุแล้ว — เลือกมืออื่น`,
        );
      }

      const camera = step.cameraId ? cameraById.get(step.cameraId) : undefined;
      if (step.cameraId && !camera) {
        throw new BadRequestException(`step ${pos}: ไม่พบมุมกล้อง (${step.cameraId})`);
      }
      if (camera && camera.status === 'archived') {
        throw new BadRequestException(
          `step ${pos}: มุมกล้อง "${camera.name}" ถูกเก็บเข้ากรุแล้ว — เลือกมุมอื่น`,
        );
      }
      const lighting = step.lightingId ? lightingById.get(step.lightingId) : undefined;
      if (step.lightingId && !lighting) {
        throw new BadRequestException(`step ${pos}: ไม่พบแสง (${step.lightingId})`);
      }
      if (lighting && lighting.status === 'archived') {
        throw new BadRequestException(
          `step ${pos}: แสง "${lighting.name}" ถูกเก็บเข้ากรุแล้ว — เลือกแสงอื่น`,
        );
      }

      // hand-vs-gesture conflict: มือของ step (หรือมือ default) ห้ามท่านี้ → 400
      const effectiveHand = hand ?? (template.defaultHandId ? handById.get(template.defaultHandId) : undefined);
      if (gesture?.key && effectiveHand?.restrictedGestures.includes(gesture.key)) {
        throw new BadRequestException(
          `step ${pos}: ท่า "${gesture.name}" (${gesture.key}) อยู่ใน restrictedGestures ของมือ "${effectiveHand.name}" — เปลี่ยนมือหรือท่า`,
        );
      }

      // packaging mismatch → warn (ไม่ fail): ท่ารองรับ packaging ที่ไม่ครอบคลุมของเทมเพลต
      if (
        gesture &&
        template.packagingType &&
        gesture.compatiblePackaging.length > 0 &&
        !gesture.compatiblePackaging.includes(template.packagingType)
      ) {
        warnings.push(
          `step ${pos}: ท่า "${gesture.name}" รองรับแพ็กเกจ ${gesture.compatiblePackaging.join(', ')} — ไม่รวม "${template.packagingType}" ของเทมเพลต`,
        );
      }

      // camera-vs-packaging → warn: มุมกล้อง (step หรือ default) ระบุ compatiblePackaging ที่ไม่ครอบคลุมของเทมเพลต
      const effectiveCamera =
        camera ?? (template.defaultCameraId ? cameraById.get(template.defaultCameraId) : undefined);
      if (
        effectiveCamera &&
        template.packagingType &&
        effectiveCamera.compatiblePackaging.length > 0 &&
        !effectiveCamera.compatiblePackaging.includes(template.packagingType)
      ) {
        warnings.push(
          `step ${pos}: มุมกล้อง "${effectiveCamera.name}" ไม่ได้ระบุรองรับ packaging ${template.packagingType}`,
        );
      }
    });

    await this.prisma.$transaction([
      this.prisma.interactionTemplateStep.deleteMany({ where: { templateId: id } }),
      ...(dto.steps.length > 0
        ? [
            this.prisma.interactionTemplateStep.createMany({
              data: dto.steps.map((s, index) => ({
                templateId: id,
                stepOrder: index,
                section: s.section,
                gestureId: s.gestureId,
                handId: s.handId,
                cameraId: s.cameraId,
                lightingId: s.lightingId,
                cameraNote: s.cameraNote,
                lightingNote: s.lightingNote,
                durationSec: s.durationSec,
                required: s.required ?? true,
                note: s.note,
              })),
            }),
          ]
        : []),
    ]);
    await this.audit(user, via, 'replace_steps', id, { count: dto.steps.length });

    const detail = await this.get(id);
    return { ...detail, warnings };
  }

  // ── ตรวจสูตร: state continuity (เดินผ่าน state machine slice 1) + duration + sanity ──
  async validate(id: string): Promise<TemplateValidateResult> {
    const template = await this.prisma.interactionTemplate.findUnique({
      where: { id },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });
    if (!template) throw new NotFoundException('ไม่พบ interaction template');
    return this.validateStepsFor(template, template.steps);
  }

  // ── additive (slice 4 — AI Director): ตรวจสูตรจาก config + ชุด step ตรง ๆ (ไม่ต้อง persist) ──
  // logic เดียวกับ validate(id) เป๊ะ — reuse โดย recommend() ให้ตรวจ recommendation ก่อนบันทึกเป็นเทมเพลต
  async validateStepsFor(
    config: RecipeValidateConfig,
    steps: RecipeStepLike[],
  ): Promise<TemplateValidateResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const { gestures, cameras } = await this.lookups(steps, null, config.defaultCameraId, null);

    if (steps.length === 0) {
      warnings.push('เทมเพลตยังไม่มี step — เพิ่มลำดับท่าก่อนใช้งาน');
      return { ok: true, errors, warnings };
    }

    // ── 1) State continuity — step ที่ไม่มี gesture ไม่เปลี่ยน state ──
    // เดินสถานะทีละ step: required ต้องตรงกับสถานะปัจจุบัน (gap → error) แล้วอัปเดตเป็น resulting
    // segment = ช่วง state ต่อเนื่อง ส่งให้ ProductStatesService.validateSequence (reuse slice 1) ตรวจตามกฎ machine
    let current: string | null = null;
    const segments: string[][] = [];
    let segment: string[] = [];
    const pushState = (key: string) => {
      if (segment[segment.length - 1] !== key) segment.push(key);
    };

    steps.forEach((step, index) => {
      const gesture = step.gestureId ? gestures.get(step.gestureId) : undefined;
      if (!gesture) return; // step ไม่มี gesture — ไม่แตะ state
      const pos = index + 1;
      const label = gesture.name;

      if (gesture.requiredProductState) {
        if (current === null) {
          // จุดเริ่ม chain — ยึดตาม required แรก (machine จะ warn ถ้าไม่ใช่ isInitial)
          pushState(gesture.requiredProductState);
        } else if (current !== gesture.requiredProductState) {
          errors.push(
            `step ${pos} (${label}) ต้องการสถานะ ${gesture.requiredProductState} แต่สินค้ายังเป็น ${current}`,
          );
          // ตัด segment แล้วเริ่มใหม่ที่ required — กัน machine ฟ้องซ้ำคู่ที่รายงานไปแล้ว
          if (segment.length > 1) segments.push(segment);
          segment = [gesture.requiredProductState];
        } else {
          pushState(gesture.requiredProductState);
        }
        current = gesture.requiredProductState;
      }
      if (gesture.resultingProductState) {
        if (current === null) {
          segment = [gesture.resultingProductState];
        } else {
          pushState(gesture.resultingProductState);
        }
        current = gesture.resultingProductState;
      }
    });
    if (segment.length > 1) segments.push(segment);

    for (const [i, keys] of segments.entries()) {
      const result = await this.productStates.validateSequence({ stateKeys: keys });
      errors.push(...result.errors.map((e) => `ลำดับสถานะไม่ถูกต้อง: ${e.reason}`));
      if (i === 0) warnings.push(...result.warnings); // เตือนจุดเริ่ม (isInitial) เฉพาะ chain แรก
    }

    // ── 2) Duration — per-step นอกช่วง min/max ของท่า → error; รวมเทียบเป้าหมาย ±10% → warn ──
    let total = 0;
    steps.forEach((step, index) => {
      const gesture = step.gestureId ? gestures.get(step.gestureId) : undefined;
      const dur = step.durationSec ?? gesture?.naturalDurationSec ?? null;
      if (dur != null) total += dur;
      if (step.durationSec != null && gesture) {
        const { minDurationSec: min, maxDurationSec: max } = gesture;
        if ((min != null && step.durationSec < min) || (max != null && step.durationSec > max)) {
          errors.push(
            `step ${index + 1} (${gesture.name}) ระยะเวลา ${step.durationSec} วิ อยู่นอกช่วงของท่า (${min ?? '—'}–${max ?? '—'} วิ)`,
          );
        }
      }
    });
    total = round1(total);
    if (config.targetDurationSec != null && config.targetDurationSec > 0) {
      const ratio = total / config.targetDurationSec;
      if (ratio > 1.1) {
        warnings.push(
          `ความยาวรวม ~${total} วิ เกินเป้าหมาย ${config.targetDurationSec} วิ มากกว่า 10%`,
        );
      } else if (ratio < 0.9) {
        warnings.push(
          `ความยาวรวม ~${total} วิ สั้นกว่าเป้าหมาย ${config.targetDurationSec} วิ มากกว่า 10%`,
        );
      }
    }

    // ── 3) Sanity — ควรมี hook เปิดคลิป และ cta ปิดคลิป ──
    const sections = new Set(steps.map((s) => s.section));
    if (!sections.has('hook')) warnings.push('ไม่มี step ช่วง hook — คลิปควรมีตัวเปิดดึงสายตา');
    if (!sections.has('cta')) warnings.push('ไม่มี step ช่วง cta — คลิปควรปิดด้วย call-to-action');

    // ── 4) Camera vs packaging — มุมกล้อง (step ?? default) ระบุ compatiblePackaging ที่ไม่รวมของเทมเพลต → warn ──
    if (config.packagingType) {
      steps.forEach((step, index) => {
        const cameraId = step.cameraId ?? config.defaultCameraId;
        const camera = cameraId ? cameras.get(cameraId) : undefined;
        if (
          camera &&
          camera.compatiblePackaging.length > 0 &&
          !camera.compatiblePackaging.includes(config.packagingType!)
        ) {
          warnings.push(
            `step ${index + 1}: มุมกล้อง ${camera.name} ไม่ได้ระบุรองรับ packaging ${config.packagingType}`,
          );
        }
      });
    }

    return { ok: errors.length === 0, errors, warnings };
  }

  // ── prompt package: ประกอบ prompt ต่อ step แบบ deterministic (คัดลอกไปใช้กับ AI ภายนอก) ──
  async promptPackage(id: string): Promise<PromptPackage> {
    const template = await this.prisma.interactionTemplate.findUnique({
      where: { id },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });
    if (!template) throw new NotFoundException('ไม่พบ interaction template');
    return this.composePromptPackageFor(template, template.steps);
  }

  // ── additive (slice 4 — AI Director): ประกอบ prompt package จาก config + ชุด step ตรง ๆ ──
  // logic เดียวกับ promptPackage(id) เป๊ะ — reuse โดย recommend() ให้ได้ prompt copy-ready โดยไม่ต้องบันทึกเทมเพลต
  async composePromptPackageFor(
    config: RecipePromptConfig,
    rawSteps: RecipeStepLike[],
  ): Promise<PromptPackage> {
    const { gestures, hands, cameras, lightings } = await this.lookups(
      rawSteps,
      config.defaultHandId,
      config.defaultCameraId,
      config.defaultLightingId,
    );
    const stateLabels = new Map(
      (await this.prisma.productState.findMany({ select: { key: true, label: true } })).map((s) => [
        s.key,
        s.label,
      ]),
    );

    const steps: PromptPackageStep[] = rawSteps.map((step, index) => {
      const order = index + 1;
      const gesture = step.gestureId ? gestures.get(step.gestureId) : undefined;
      const hand =
        (step.handId ? hands.get(step.handId) : undefined) ??
        (config.defaultHandId ? hands.get(config.defaultHandId) : undefined);
      const camera =
        (step.cameraId ? cameras.get(step.cameraId) : undefined) ??
        (config.defaultCameraId ? cameras.get(config.defaultCameraId) : undefined);
      const lighting =
        (step.lightingId ? lightings.get(step.lightingId) : undefined) ??
        (config.defaultLightingId ? lightings.get(config.defaultLightingId) : undefined);

      const lines: string[] = [];
      // ท่า: promptTemplate ก่อน ถ้าไม่มีใช้ชื่อท่า / note ของ step
      const action = gesture?.promptTemplate?.trim() || gesture?.name || step.note?.trim() || '';
      if (action) lines.push(action);
      if (hand) lines.push(this.handDescriptor(hand));
      if (gesture?.requiredProductState || gesture?.resultingProductState) {
        const from = gesture.requiredProductState
          ? stateLabels.get(gesture.requiredProductState) ?? gesture.requiredProductState
          : '—';
        const to = gesture.resultingProductState
          ? stateLabels.get(gesture.resultingProductState) ?? gesture.resultingProductState
          : from;
        lines.push(`Product state: ${from} → ${to}`);
      }
      if (config.packagingType || config.materialType) {
        lines.push(
          `Product: ${[config.packagingType, config.materialType].filter(Boolean).join(' / ')}`,
        );
      }
      // Camera จากคลัง (slice 3): descriptor + promptTemplate — วางก่อน free-text note
      if (camera) {
        const camMeta = [camera.shotSize, camera.angle, camera.cameraMovement, this.cameraLens(camera)]
          .filter(Boolean)
          .join(', ');
        lines.push(`Camera: ${camera.name}${camMeta ? ` — ${camMeta}` : ''}`);
        if (camera.promptTemplate?.trim()) lines.push(camera.promptTemplate.trim());
      }
      // Lighting จากคลัง (slice 3)
      if (lighting) {
        const litMeta = [
          lighting.mood,
          this.lightingRig(lighting),
          lighting.colorTemperature,
        ]
          .filter(Boolean)
          .join(', ');
        lines.push(`Lighting: ${lighting.name}${litMeta ? ` — ${litMeta}` : ''}`);
        if (lighting.promptTemplate?.trim()) lines.push(lighting.promptTemplate.trim());
      }
      // free-text override notes (append หลังคลัง)
      if (step.cameraNote?.trim()) lines.push(`Camera note: ${step.cameraNote.trim()}`);
      if (step.lightingNote?.trim()) lines.push(`Lighting note: ${step.lightingNote.trim()}`);
      if (config.aspectRatio) lines.push(`Aspect ratio: ${config.aspectRatio}`);

      // merge negatives: gesture + camera + lighting (unique, join ", ")
      const negatives = [
        gesture?.negativePrompt?.trim(),
        camera?.negativePrompt?.trim(),
        lighting?.negativePrompt?.trim(),
      ].filter((n): n is string => !!n);
      const negativePrompt = negatives.length > 0 ? [...new Set(negatives)].join(', ') : null;

      const title = `Step ${order} · ${step.section}${gesture ? ` — ${gesture.name}` : ''}`;
      return {
        order,
        section: step.section,
        title,
        prompt: lines.join('\n'),
        negativePrompt,
      };
    });

    const combined = steps
      .map(
        (s) =>
          `【${s.title}】\n${s.prompt}${s.negativePrompt ? `\nNegative: ${s.negativePrompt}` : ''}`,
      )
      .join('\n\n');
    return { steps, combined };
  }

  // ── helpers ──────────────────────────────────────────────────

  /** โหลด gesture/hand/camera/lighting summaries ของชุด steps (+ default hand/camera/lighting) ครั้งเดียว */
  private async lookups(
    steps: StepIdRefs[],
    defaultHandId: string | null,
    defaultCameraId: string | null = null,
    defaultLightingId: string | null = null,
  ) {
    const gestureIds = [...new Set(steps.map((s) => s.gestureId).filter((g): g is string => !!g))];
    const handIds = [
      ...new Set([...steps.map((s) => s.handId), defaultHandId].filter((h): h is string => !!h)),
    ];
    const cameraIds = [
      ...new Set([...steps.map((s) => s.cameraId), defaultCameraId].filter((c): c is string => !!c)),
    ];
    const lightingIds = [
      ...new Set([...steps.map((s) => s.lightingId), defaultLightingId].filter((l): l is string => !!l)),
    ];
    const [gestureRows, handRows, cameraRows, lightingRows] = await this.prisma.$transaction([
      this.prisma.gesture.findMany({ where: { id: { in: gestureIds } }, select: GESTURE_SELECT }),
      this.prisma.handProfile.findMany({ where: { id: { in: handIds } }, select: HAND_SELECT }),
      this.prisma.cameraPreset.findMany({ where: { id: { in: cameraIds } }, select: CAMERA_SELECT }),
      this.prisma.lightingPreset.findMany({ where: { id: { in: lightingIds } }, select: LIGHTING_SELECT }),
    ]);
    return {
      gestures: new Map<string, GestureSummary>(gestureRows.map((g) => [g.id, g])),
      hands: new Map<string, HandSummary>(handRows.map((h) => [h.id, h])),
      cameras: new Map<string, CameraSummary>(cameraRows.map((c) => [c.id, c])),
      lightings: new Map<string, LightingSummary>(lightingRows.map((l) => [l.id, l])),
    };
  }

  private stepDuration(
    step: { durationSec: number | null },
    gesture: { naturalDurationSec: number | null } | null,
  ): number {
    return step.durationSec ?? gesture?.naturalDurationSec ?? 0;
  }

  /** descriptor มือสำหรับ prompt — skin / nails / accessories / sleeve */
  private handDescriptor(hand: HandSummary): string {
    const nails = [hand.nailLength, hand.nailShape, hand.nailColor, hand.nailStyle]
      .filter(Boolean)
      .join(' ');
    const traits = [
      hand.skinTone ? `${hand.skinTone} skin tone` : null,
      hand.skinTexture ? `${hand.skinTexture} skin texture` : null,
      nails ? `${nails} nails` : null,
      hand.accessories.length > 0 ? `wearing ${hand.accessories.join(', ')}` : null,
      hand.sleeveStyle ? `${hand.sleeveStyle} sleeve` : null,
    ].filter(Boolean);
    return `Hand: ${hand.name} (${hand.displayCode})${traits.length ? ` — ${traits.join(', ')}` : ''}`;
  }

  private async assertHandUsable(handId: string) {
    const hand = await this.prisma.handProfile.findUnique({
      where: { id: handId },
      select: { id: true, name: true, status: true },
    });
    if (!hand) throw new BadRequestException('ไม่พบ hand profile ที่เลือกเป็นมือ default');
    if (hand.status === 'archived') {
      throw new BadRequestException(`มือ "${hand.name}" ถูกเก็บเข้ากรุแล้ว — เลือกมืออื่น`);
    }
  }

  private async assertCameraUsable(cameraId: string) {
    const camera = await this.prisma.cameraPreset.findUnique({
      where: { id: cameraId },
      select: { id: true, name: true, status: true },
    });
    if (!camera) throw new BadRequestException('ไม่พบมุมกล้องที่เลือกเป็น default');
    if (camera.status === 'archived') {
      throw new BadRequestException(`มุมกล้อง "${camera.name}" ถูกเก็บเข้ากรุแล้ว — เลือกมุมอื่น`);
    }
  }

  private async assertLightingUsable(lightingId: string) {
    const lighting = await this.prisma.lightingPreset.findUnique({
      where: { id: lightingId },
      select: { id: true, name: true, status: true },
    });
    if (!lighting) throw new BadRequestException('ไม่พบแสงที่เลือกเป็น default');
    if (lighting.status === 'archived') {
      throw new BadRequestException(`แสง "${lighting.name}" ถูกเก็บเข้ากรุแล้ว — เลือกแสงอื่น`);
    }
  }

  /** camera lens descriptor สำหรับ prompt — lens/focalLength */
  private cameraLens(camera: CameraSummary): string {
    return [camera.lens, camera.focalLength].filter(Boolean).join(' ');
  }

  /** lighting rig descriptor สำหรับ prompt — key/fill/back */
  private lightingRig(lighting: LightingSummary): string {
    const parts = [
      lighting.keyLight ? `key ${lighting.keyLight}` : null,
      lighting.fillLight ? `fill ${lighting.fillLight}` : null,
      lighting.backLight ? `back ${lighting.backLight}` : null,
    ].filter(Boolean);
    return parts.join('/');
  }

  private async generateDisplayCode(): Promise<string> {
    const count = await this.prisma.interactionTemplate.count();
    return `ITPL-${String(count + 1).padStart(4, '0')}`;
  }

  private audit(user: AuthUser, via: string, action: string, entityId: string, meta: object) {
    return this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        via,
        action,
        entityType: 'interaction_template',
        entityId,
        meta: meta as Prisma.InputJsonValue,
      },
    });
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
