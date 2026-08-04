import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CameraPreset, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../auth/current-user.decorator';
import { CreateCameraPresetDto, UpdateCameraPresetDto } from './dto/camera-preset.dto';

export interface ListCameraPresetsParams {
  q?: string;
  shotSize?: string;
  angle?: string;
  cameraMovement?: string;
  status?: string;
  page?: number;
}

@Injectable()
export class CameraPresetsService {
  constructor(private prisma: PrismaService) {}

  async list(params: ListCameraPresetsParams) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const take = 20;

    const where: Prisma.CameraPresetWhereInput = {
      ...(params.status ? { status: params.status } : { status: { not: 'archived' } }),
      ...(params.shotSize ? { shotSize: params.shotSize } : {}),
      ...(params.angle ? { angle: params.angle } : {}),
      ...(params.cameraMovement ? { cameraMovement: params.cameraMovement } : {}),
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
      this.prisma.cameraPreset.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * take,
        take,
      }),
      this.prisma.cameraPreset.count({ where }),
    ]);
    return { items, total, page, pageSize: take };
  }

  async get(id: string) {
    const preset = await this.prisma.cameraPreset.findUnique({ where: { id } });
    if (!preset) throw new NotFoundException('ไม่พบ camera preset');
    return preset;
  }

  async create(dto: CreateCameraPresetDto, user: AuthUser, via = 'ui') {
    // displayCode @unique (CAM-0001) — retry เมื่อชน P2002 (pattern เดียวกับ hand-profiles)
    let preset: CameraPreset | undefined;
    for (let attempt = 0; attempt < 5; attempt++) {
      const displayCode = await this.generateDisplayCode();
      try {
        preset = await this.prisma.cameraPreset.create({
          data: {
            displayCode,
            key: dto.key?.trim() || null,
            name: dto.name,
            description: dto.description,
            shotSize: dto.shotSize,
            angle: dto.angle,
            lens: dto.lens,
            focalLength: dto.focalLength,
            cameraMovement: dto.cameraMovement,
            movementSpeed: dto.movementSpeed,
            distance: dto.distance,
            focusTarget: dto.focusTarget,
            depthOfField: dto.depthOfField,
            stabilization: dto.stabilization,
            aspectRatio: dto.aspectRatio,
            safeArea: dto.safeArea,
            productVisibility: dto.productVisibility,
            handVisibility: dto.handVisibility,
            compatiblePackaging: dto.compatiblePackaging ?? [],
            promptTemplate: dto.promptTemplate,
            negativePrompt: dto.negativePrompt,
            status: dto.status ?? 'active',
            createdBy: user.id,
          },
        });
        break;
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          // key ซ้ำ → แจ้งผู้ใช้ (ไม่ retry); displayCode ซ้ำ → retry
          if (this.isKeyConflict(err)) {
            throw new BadRequestException(`camera key "${dto.key}" ซ้ำกับที่มีอยู่แล้ว`);
          }
          if (attempt < 4) continue;
        }
        throw err;
      }
    }
    if (!preset) throw new BadRequestException('สร้าง camera preset ไม่สำเร็จ (รหัสซ้ำ) — ลองอีกครั้ง');

    await this.audit(user, via, 'create', preset.id, { displayCode: preset.displayCode });
    return preset;
  }

  async update(id: string, dto: UpdateCameraPresetDto, user: AuthUser, via = 'ui') {
    const existing = await this.prisma.cameraPreset.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('ไม่พบ camera preset');

    const data: Prisma.CameraPresetUpdateInput = {};
    const scalar: (keyof UpdateCameraPresetDto)[] = [
      'name', 'description', 'shotSize', 'angle', 'lens', 'focalLength', 'cameraMovement',
      'movementSpeed', 'distance', 'focusTarget', 'depthOfField', 'stabilization', 'aspectRatio',
      'safeArea', 'productVisibility', 'handVisibility', 'compatiblePackaging', 'promptTemplate',
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
      const preset = await this.prisma.cameraPreset.update({ where: { id }, data });
      await this.audit(user, via, 'update', id, { fields: Object.keys(data) });
      return preset;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException(`camera key "${dto.key}" ซ้ำกับที่มีอยู่แล้ว`);
      }
      throw err;
    }
  }

  async archive(id: string, user: AuthUser, via = 'ui') {
    const existing = await this.prisma.cameraPreset.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundException('ไม่พบ camera preset');
    const preset = await this.prisma.cameraPreset.update({
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
    const count = await this.prisma.cameraPreset.count();
    return `CAM-${String(count + 1).padStart(4, '0')}`;
  }

  private audit(user: AuthUser, via: string, action: string, entityId: string, meta: object) {
    return this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        via,
        action,
        entityType: 'camera_preset',
        entityId,
        meta: meta as Prisma.InputJsonValue,
      },
    });
  }
}
