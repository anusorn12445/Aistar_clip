import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/current-user.decorator';
import {
  CreateAudienceSegmentDto,
  UpdateAudienceSegmentDto,
} from './dto/audience-segment.dto';

// taxonomy กลางของกลุ่มผู้ชม — จัดการใน Settings (pattern เดียวกับ brands/categories)
@Injectable()
export class AudienceSegmentsService {
  constructor(private prisma: PrismaService) {}

  async list(params: { status?: string; q?: string }) {
    const where: Prisma.AudienceSegmentWhereInput = {
      ...(params.status ? { status: params.status } : {}),
      ...(params.q
        ? {
            OR: [
              { name: { contains: params.q, mode: 'insensitive' } },
              { description: { contains: params.q, mode: 'insensitive' } },
              { region: { contains: params.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const segments = await this.prisma.audienceSegment.findMany({
      where,
      orderBy: { name: 'asc' },
      include: { _count: { select: { characters: true, series: true } } },
    });
    return segments.map((s) => {
      const { _count, ...rest } = s;
      return {
        ...rest,
        usageCount: _count.characters + _count.series,
        characterCount: _count.characters,
        seriesCount: _count.series,
      };
    });
  }

  async get(id: string) {
    const segment = await this.prisma.audienceSegment.findUnique({
      where: { id },
      include: { _count: { select: { characters: true, series: true } } },
    });
    if (!segment) throw new NotFoundException('ไม่พบกลุ่มผู้ชม');
    const { _count, ...rest } = segment;
    return {
      ...rest,
      usageCount: _count.characters + _count.series,
      characterCount: _count.characters,
      seriesCount: _count.series,
    };
  }

  async create(dto: CreateAudienceSegmentDto, user: AuthUser, via = 'ui') {
    this.assertAgeRange(dto.ageMin, dto.ageMax);
    const segment = await this.prisma.audienceSegment.create({
      data: {
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        ageMin: dto.ageMin ?? null,
        ageMax: dto.ageMax ?? null,
        gender: dto.gender ?? null,
        interests: dto.interests ?? [],
        platforms: dto.platforms ?? [],
        spendingPower: dto.spendingPower ?? null,
        region: dto.region?.trim() || null,
        painPoint: dto.painPoint?.trim() || null,
        createdBy: user.id,
      },
    });
    await this.audit(user, via, 'create', segment.id, { name: segment.name });
    return { ...segment, usageCount: 0, characterCount: 0, seriesCount: 0 };
  }

  async update(id: string, dto: UpdateAudienceSegmentDto, user: AuthUser, via = 'ui') {
    const existing = await this.prisma.audienceSegment.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('ไม่พบกลุ่มผู้ชม');

    const nextMin = dto.ageMin !== undefined ? dto.ageMin : existing.ageMin;
    const nextMax = dto.ageMax !== undefined ? dto.ageMax : existing.ageMax;
    this.assertAgeRange(nextMin ?? undefined, nextMax ?? undefined);

    const data: Prisma.AudienceSegmentUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.description !== undefined) data.description = dto.description?.trim() || null;
    if (dto.ageMin !== undefined) data.ageMin = dto.ageMin;
    if (dto.ageMax !== undefined) data.ageMax = dto.ageMax;
    if (dto.gender !== undefined) data.gender = dto.gender || null;
    if (dto.interests !== undefined) data.interests = dto.interests;
    if (dto.platforms !== undefined) data.platforms = dto.platforms;
    if (dto.spendingPower !== undefined) data.spendingPower = dto.spendingPower || null;
    if (dto.region !== undefined) data.region = dto.region?.trim() || null;
    if (dto.painPoint !== undefined) data.painPoint = dto.painPoint?.trim() || null;
    if (dto.status !== undefined) data.status = dto.status;

    await this.prisma.audienceSegment.update({ where: { id }, data });
    await this.audit(user, via, 'update', id, { fields: Object.keys(data) });
    return this.get(id);
  }

  async remove(id: string, user: AuthUser, via = 'ui') {
    const existing = await this.prisma.audienceSegment.findUnique({
      where: { id },
      include: { _count: { select: { characters: true, series: true } } },
    });
    if (!existing) throw new NotFoundException('ไม่พบกลุ่มผู้ชม');
    const usageCount = existing._count.characters + existing._count.series;
    if (usageCount > 0) {
      throw new ConflictException(
        `มี Character/Series อ้างอิงกลุ่มนี้อยู่ (${usageCount} รายการ) — เก็บเข้ากรุ (archived) แทนได้`,
      );
    }
    await this.prisma.audienceSegment.delete({ where: { id } });
    await this.audit(user, via, 'delete', id, { name: existing.name });
    return { ok: true };
  }

  private assertAgeRange(min?: number, max?: number) {
    if (min != null && max != null && min > max) {
      throw new BadRequestException('ช่วงอายุไม่ถูกต้อง — ageMin ต้องไม่มากกว่า ageMax');
    }
  }

  private audit(
    user: AuthUser,
    via: string,
    action: string,
    entityId: string,
    meta: object,
  ) {
    return this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        via,
        action,
        entityType: 'audience_segment',
        entityId,
        meta: meta as Prisma.InputJsonValue,
      },
    });
  }
}
