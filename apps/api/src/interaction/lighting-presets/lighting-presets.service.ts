import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { LightingPreset, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../auth/current-user.decorator';
import { CreateLightingPresetDto, UpdateLightingPresetDto } from './dto/lighting-preset.dto';

export interface ListLightingPresetsParams {
  q?: string;
  mood?: string;
  status?: string;
  page?: number;
}

@Injectable()
export class LightingPresetsService {
  constructor(private prisma: PrismaService) {}

  async list(params: ListLightingPresetsParams) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const take = 20;

    const where: Prisma.LightingPresetWhereInput = {
      ...(params.status ? { status: params.status } : { status: { not: 'archived' } }),
      ...(params.mood ? { mood: params.mood } : {}),
      ...(params.q
        ? {
            OR: [
              { name: { contains: params.q, mode: 'insensitive' } },
              { key: { contains: params.q, mode: 'insensitive' } },
              { displayCode: { contains: params.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.lightingPreset.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * take,
        take,
      }),
      this.prisma.lightingPreset.count({ where }),
    ]);
    return { items, total, page, pageSize: take };
  }

  async get(id: string) {
    const preset = await this.prisma.lightingPreset.findUnique({ where: { id } });
    if (!preset) throw new NotFoundException('ไม่พบ lighting preset');
    return preset;
  }

  async create(dto: CreateLightingPresetDto, user: AuthUser, via = 'ui') {
    // displayCode @unique (LIGHT-0001) — retry เมื่อชน P2002 (pattern เดียวกับ hand-profiles)
    let preset: LightingPreset | undefined;
    for (let attempt = 0; attempt < 5; attempt++) {
      const displayCode = await this.generateDisplayCode();
      try {
        preset = await this.prisma.lightingPreset.create({
          data: {
            displayCode,
            key: dto.key?.trim() || null,
            name: dto.name,
            description: dto.description,
            keyLight: dto.keyLight,
            fillLight: dto.fillLight,
            backLight: dto.backLight,
            colorTemperature: dto.colorTemperature,
            contrast: dto.contrast,
            shadowLevel: dto.shadowLevel,
            highlightControl: dto.highlightControl,
            reflectiveProductRule: dto.reflectiveProductRule,
            transparentProductRule: dto.transparentProductRule,
            skinToneCompatibility: dto.skinToneCompatibility ?? [],
            backgroundCompatibility: dto.backgroundCompatibility ?? [],
            mood: dto.mood,
            promptTemplate: dto.promptTemplate,
            negativePrompt: dto.negativePrompt,
            status: dto.status ?? 'active',
            createdBy: user.id,
          },
        });
        break;
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          if (this.isKeyConflict(err)) {
            throw new BadRequestException(`lighting key "${dto.key}" ซ้ำกับที่มีอยู่แล้ว`);
          }
          if (attempt < 4) continue;
        }
        throw err;
      }
    }
    if (!preset) throw new BadRequestException('สร้าง lighting preset ไม่สำเร็จ (รหัสซ้ำ) — ลองอีกครั้ง');

    await this.audit(user, via, 'create', preset.id, { displayCode: preset.displayCode });
    return preset;
  }

  async update(id: string, dto: UpdateLightingPresetDto, user: AuthUser, via = 'ui') {
    const existing = await this.prisma.lightingPreset.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('ไม่พบ lighting preset');

    const data: Prisma.LightingPresetUpdateInput = {};
    const scalar: (keyof UpdateLightingPresetDto)[] = [
      'name', 'description', 'keyLight', 'fillLight', 'backLight', 'colorTemperature', 'contrast',
      'shadowLevel', 'highlightControl', 'reflectiveProductRule', 'transparentProductRule',
      'skinToneCompatibility', 'backgroundCompatibility', 'mood', 'promptTemplate',
      'negativePrompt', 'status',
    ];
    for (const k of scalar) {
      if (dto[k] !== undefined) (data as Record<string, unknown>)[k] = dto[k];
    }
    if (dto.key !== undefined) (data as Record<string, unknown>).key = dto.key?.trim() || null;
    if (dto.status === 'archived' && existing.status !== 'archived') {
      (data as Record<string, unknown>).archivedAt = new Date();
    }

    try {
      const preset = await this.prisma.lightingPreset.update({ where: { id }, data });
      await this.audit(user, via, 'update', id, { fields: Object.keys(data) });
      return preset;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException(`lighting key "${dto.key}" ซ้ำกับที่มีอยู่แล้ว`);
      }
      throw err;
    }
  }

  async archive(id: string, user: AuthUser, via = 'ui') {
    const existing = await this.prisma.lightingPreset.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundException('ไม่พบ lighting preset');
    const preset = await this.prisma.lightingPreset.update({
      where: { id },
      data: { status: 'archived', archivedAt: new Date() },
    });
    await this.audit(user, via, 'archive', id, {});
    return preset;
  }

  private isKeyConflict(err: Prisma.PrismaClientKnownRequestError): boolean {
    const target = err.meta?.target;
    const fields = Array.isArray(target) ? target.join(',') : String(target ?? '');
    return fields.includes('key');
  }

  private async generateDisplayCode(): Promise<string> {
    const count = await this.prisma.lightingPreset.count();
    return `LIGHT-${String(count + 1).padStart(4, '0')}`;
  }

  private audit(user: AuthUser, via: string, action: string, entityId: string, meta: object) {
    return this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        via,
        action,
        entityType: 'lighting_preset',
        entityId,
        meta: meta as Prisma.InputJsonValue,
      },
    });
  }
}
