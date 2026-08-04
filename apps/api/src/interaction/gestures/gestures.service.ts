import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../auth/current-user.decorator';
import { CreateGestureDto, UpdateGestureDto } from './dto/gesture.dto';

export interface ListGesturesParams {
  q?: string;
  category?: string;
  riskLevel?: string;
  compatiblePackaging?: string;
  status?: string;
  page?: number;
}

@Injectable()
export class GesturesService {
  constructor(private prisma: PrismaService) {}

  async list(params: ListGesturesParams) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const take = 20;

    const where: Prisma.GestureWhereInput = {
      ...(params.status ? { status: params.status } : { status: { not: 'archived' } }),
      ...(params.category ? { category: params.category } : {}),
      ...(params.riskLevel ? { riskLevel: params.riskLevel } : {}),
      ...(params.compatiblePackaging
        ? { compatiblePackaging: { has: params.compatiblePackaging } }
        : {}),
      ...(params.q
        ? {
            OR: [
              { name: { contains: params.q, mode: 'insensitive' } },
              { key: { contains: params.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.gesture.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * take,
        take,
      }),
      this.prisma.gesture.count({ where }),
    ]);
    return { items, total, page, pageSize: take };
  }

  async get(id: string) {
    const gesture = await this.prisma.gesture.findUnique({ where: { id } });
    if (!gesture) throw new NotFoundException('ไม่พบ gesture');
    return gesture;
  }

  async create(dto: CreateGestureDto, user: AuthUser, via = 'ui') {
    this.assertDurations(dto.minDurationSec, dto.naturalDurationSec, dto.maxDurationSec);
    this.assertSpeeds(dto.minSpeedMultiplier, dto.maxSpeedMultiplier);
    await this.assertProductStates(dto.requiredProductState, dto.resultingProductState);

    try {
      const gesture = await this.prisma.gesture.create({
        data: {
          key: dto.key?.trim() || null,
          name: dto.name,
          category: dto.category,
          description: dto.description,
          naturalDurationSec: dto.naturalDurationSec,
          minDurationSec: dto.minDurationSec,
          maxDurationSec: dto.maxDurationSec,
          minSpeedMultiplier: dto.minSpeedMultiplier,
          maxSpeedMultiplier: dto.maxSpeedMultiplier,
          requiredHandCount: dto.requiredHandCount,
          requiredProductState: dto.requiredProductState,
          resultingProductState: dto.resultingProductState,
          compatiblePackaging: dto.compatiblePackaging ?? [],
          compatibleMaterial: dto.compatibleMaterial ?? [],
          riskLevel: dto.riskLevel ?? 'low',
          promptTemplate: dto.promptTemplate,
          negativePrompt: dto.negativePrompt,
          status: dto.status ?? 'active',
          createdBy: user.id,
        },
      });
      await this.audit(user, via, 'create', gesture.id, { name: gesture.name, key: gesture.key });
      return gesture;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException(`gesture key "${dto.key}" ซ้ำกับที่มีอยู่แล้ว`);
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateGestureDto, user: AuthUser, via = 'ui') {
    const existing = await this.prisma.gesture.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('ไม่พบ gesture');

    // ตรวจ duration/speed บนค่าสุดท้าย (merge เดิม+ใหม่)
    const min = dto.minDurationSec ?? existing.minDurationSec ?? undefined;
    const nat = dto.naturalDurationSec ?? existing.naturalDurationSec ?? undefined;
    const max = dto.maxDurationSec ?? existing.maxDurationSec ?? undefined;
    this.assertDurations(min, nat, max);
    const minS = dto.minSpeedMultiplier ?? existing.minSpeedMultiplier ?? undefined;
    const maxS = dto.maxSpeedMultiplier ?? existing.maxSpeedMultiplier ?? undefined;
    this.assertSpeeds(minS, maxS);
    await this.assertProductStates(
      dto.requiredProductState !== undefined ? dto.requiredProductState : existing.requiredProductState ?? undefined,
      dto.resultingProductState !== undefined ? dto.resultingProductState : existing.resultingProductState ?? undefined,
    );

    const data: Prisma.GestureUpdateInput = {};
    const scalar: (keyof UpdateGestureDto)[] = [
      'name', 'category', 'description', 'naturalDurationSec', 'minDurationSec', 'maxDurationSec',
      'minSpeedMultiplier', 'maxSpeedMultiplier', 'requiredHandCount', 'requiredProductState',
      'resultingProductState', 'compatiblePackaging', 'compatibleMaterial', 'riskLevel',
      'promptTemplate', 'negativePrompt', 'status',
    ];
    for (const k of scalar) {
      if (dto[k] !== undefined) (data as Record<string, unknown>)[k] = dto[k];
    }
    if (dto.key !== undefined) (data as Record<string, unknown>).key = dto.key?.trim() || null;
    if (dto.status === 'archived' && existing.status !== 'archived') {
      (data as Record<string, unknown>).archivedAt = new Date();
    }

    try {
      const gesture = await this.prisma.gesture.update({ where: { id }, data });
      await this.audit(user, via, 'update', id, { fields: Object.keys(data) });
      return gesture;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException(`gesture key "${dto.key}" ซ้ำกับที่มีอยู่แล้ว`);
      }
      throw err;
    }
  }

  async archive(id: string, user: AuthUser, via = 'ui') {
    const existing = await this.prisma.gesture.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundException('ไม่พบ gesture');
    const gesture = await this.prisma.gesture.update({
      where: { id },
      data: { status: 'archived', archivedAt: new Date() },
    });
    await this.audit(user, via, 'archive', id, {});
    return gesture;
  }

  // ── min ≤ natural ≤ max (เฉพาะที่ระบุ) ──
  private assertDurations(min?: number, natural?: number, max?: number) {
    if (min != null && max != null && min > max) {
      throw new BadRequestException('ระยะเวลาต่ำสุด (min) ต้องไม่มากกว่าสูงสุด (max)');
    }
    if (min != null && natural != null && min > natural) {
      throw new BadRequestException('ระยะเวลาปกติ (natural) ต้องไม่น้อยกว่าต่ำสุด (min)');
    }
    if (natural != null && max != null && natural > max) {
      throw new BadRequestException('ระยะเวลาปกติ (natural) ต้องไม่มากกว่าสูงสุด (max)');
    }
  }

  private assertSpeeds(min?: number, max?: number) {
    if (min != null && max != null && min > max) {
      throw new BadRequestException('ความเร็วต่ำสุดต้องไม่มากกว่าความเร็วสูงสุด');
    }
  }

  // ── requiredProductState/resultingProductState (ถ้าระบุ) ต้องเป็น ProductState.key ที่มีจริง ──
  private async assertProductStates(required?: string | null, resulting?: string | null) {
    const keys = [required, resulting].filter((k): k is string => !!k);
    if (keys.length === 0) return;
    const found = await this.prisma.productState.findMany({
      where: { key: { in: keys } },
      select: { key: true },
    });
    const foundSet = new Set(found.map((f) => f.key));
    const missing = keys.filter((k) => !foundSet.has(k));
    if (missing.length > 0) {
      throw new BadRequestException(
        `ไม่พบ ProductState key: ${missing.join(', ')} — สร้างสถานะสินค้าที่ Settings ก่อน`,
      );
    }
  }

  private audit(user: AuthUser, via: string, action: string, entityId: string, meta: object) {
    return this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        via,
        action,
        entityType: 'gesture',
        entityId,
        meta: meta as Prisma.InputJsonValue,
      },
    });
  }
}
