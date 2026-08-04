import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LegalStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../auth/current-user.decorator';
import { CreateRightDto } from './dto/create-right.dto';
import { UpdateRightDto } from './dto/update-right.dto';

export interface ListRightsParams {
  entityType?: string;
  entityId?: string;
  legalStatus?: LegalStatus;
  riskLevel?: string;
  commercialUsage?: boolean;
  q?: string;
  sortBy?: string;
  page?: number;
}

// state machine ตาม PRD §16: draft → internal_only → commercial_approved
// any → restricted/expired, any → archived
const TRANSITIONS: Record<LegalStatus, LegalStatus[]> = {
  draft: ['internal_only', 'restricted', 'expired', 'archived'],
  internal_only: ['commercial_approved', 'restricted', 'expired', 'archived'],
  commercial_approved: ['restricted', 'expired', 'archived'],
  restricted: ['expired', 'archived'],
  expired: ['archived'],
  archived: [],
};

const SORT_FIELDS = ['updatedAt', 'owner'] as const;

@Injectable()
export class RightsService {
  constructor(private prisma: PrismaService) {}

  async list(params: ListRightsParams) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const take = 20;

    const where: Prisma.RightWhereInput = {
      ...(params.entityType ? { entityType: params.entityType } : {}),
      ...(params.entityId ? { entityId: params.entityId } : {}),
      ...(params.legalStatus
        ? { legalStatus: params.legalStatus }
        : { legalStatus: { not: 'archived' } }),
      ...(params.riskLevel ? { riskLevel: params.riskLevel } : {}),
      ...(params.commercialUsage !== undefined ? { commercialUsage: params.commercialUsage } : {}),
      ...(params.q ? { owner: { contains: params.q, mode: 'insensitive' } } : {}),
    };

    const sortBy = SORT_FIELDS.includes(params.sortBy as (typeof SORT_FIELDS)[number])
      ? (params.sortBy as (typeof SORT_FIELDS)[number])
      : 'updatedAt';
    const orderBy: Prisma.RightOrderByWithRelationInput =
      sortBy === 'owner' ? { owner: 'asc' } : { updatedAt: 'desc' };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.right.findMany({ where, orderBy, skip: (page - 1) * take, take }),
      this.prisma.right.count({ where }),
    ]);
    return { items, total, page, pageSize: take };
  }

  async get(id: string) {
    const right = await this.prisma.right.findUnique({ where: { id } });
    if (!right) throw new NotFoundException('ไม่พบ rights record');
    return right;
  }

  async create(dto: CreateRightDto, user: AuthUser, via = 'ui') {
    const right = await this.prisma.right.create({ data: { ...dto } });
    await this.audit(user, via, 'create', right.id, {
      entityType: dto.entityType,
      entityId: dto.entityId,
    });
    return right;
  }

  async update(id: string, dto: UpdateRightDto, user: AuthUser, via = 'ui') {
    await this.get(id);
    const right = await this.prisma.right.update({ where: { id }, data: { ...dto } });
    await this.audit(user, via, 'update', id, { fields: Object.keys(dto) });
    return right;
  }

  async changeStatus(id: string, next: LegalStatus, user: AuthUser, via = 'ui') {
    const existing = await this.get(id);

    if (!TRANSITIONS[existing.legalStatus].includes(next)) {
      throw new BadRequestException(
        `เปลี่ยน legal status ${existing.legalStatus} → ${next} ไม่ได้`,
      );
    }

    // commercial_approved = การอนุมัติเชิงพาณิชย์ — ต้องเป็นมนุษย์ที่มีสิทธิ์ Approve ผ่าน UI เท่านั้น
    if (next === 'commercial_approved') {
      if (via !== 'ui') {
        throw new ForbiddenException('การ approve ทำได้ผ่าน UI โดยมนุษย์เท่านั้น');
      }
      const canApprove = await this.prisma.rolePermission.count({
        where: { module: 'rights', actions: { has: 'A' }, role: { key: { in: user.roles } } },
      });
      if (!canApprove) throw new ForbiddenException('ต้องมีสิทธิ์ Approve');
    } else {
      // transition อื่น (internal_only / restricted / expired / archived) ต้องมีสิทธิ์ C
      const canEdit = await this.prisma.rolePermission.count({
        where: { module: 'rights', actions: { has: 'C' }, role: { key: { in: user.roles } } },
      });
      if (!canEdit) throw new ForbiddenException('ต้องมีสิทธิ์ C ใน module rights');
    }

    const right = await this.prisma.right.update({
      where: { id },
      data: { legalStatus: next },
    });
    await this.audit(user, via, 'status_change', id, { from: existing.legalStatus, to: next });
    return right;
  }

  private audit(user: AuthUser, via: string, action: string, entityId: string, meta: object) {
    return this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        via,
        action,
        entityType: 'right',
        entityId,
        meta: meta as Prisma.InputJsonValue,
      },
    });
  }
}
