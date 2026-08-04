import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../auth/current-user.decorator';
import { CreateQcReviewDto } from './dto/create-qc-review.dto';

export interface ListQcReviewsParams {
  entityType?: string;
  entityId?: string;
  category?: string;
  scoreMin?: number;
  scoreMax?: number;
  reviewerId?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  page?: number;
}

const SORT_FIELDS = ['createdAt', 'score'] as const;

@Injectable()
export class QcService {
  constructor(private prisma: PrismaService) {}

  async list(params: ListQcReviewsParams) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const take = 20;

    const where: Prisma.QcReviewWhereInput = {
      ...(params.entityType ? { entityType: params.entityType } : {}),
      ...(params.entityId ? { entityId: params.entityId } : {}),
      ...(params.category ? { category: params.category } : {}),
      ...(params.reviewerId ? { reviewerId: params.reviewerId } : {}),
      ...(params.scoreMin !== undefined || params.scoreMax !== undefined
        ? {
            score: {
              ...(params.scoreMin !== undefined ? { gte: params.scoreMin } : {}),
              ...(params.scoreMax !== undefined ? { lte: params.scoreMax } : {}),
            },
          }
        : {}),
      ...(params.dateFrom || params.dateTo
        ? {
            createdAt: {
              ...(params.dateFrom ? { gte: new Date(params.dateFrom) } : {}),
              ...(params.dateTo ? { lte: new Date(`${params.dateTo}T23:59:59.999Z`) } : {}),
            },
          }
        : {}),
    };

    const sortBy = SORT_FIELDS.includes(params.sortBy as (typeof SORT_FIELDS)[number])
      ? (params.sortBy as (typeof SORT_FIELDS)[number])
      : 'createdAt';
    const orderBy: Prisma.QcReviewOrderByWithRelationInput =
      sortBy === 'score' ? { score: 'desc' } : { createdAt: 'desc' };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.qcReview.findMany({ where, orderBy, skip: (page - 1) * take, take }),
      this.prisma.qcReview.count({ where }),
    ]);

    // schema ไม่มี relation reviewer → join ชื่อผู้ตรวจเอง
    const reviewerIds = [...new Set(items.map((r) => r.reviewerId))];
    const reviewers = reviewerIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: reviewerIds } },
          select: { id: true, name: true },
        })
      : [];
    const reviewerMap = new Map(reviewers.map((u) => [u.id, u.name]));

    return {
      items: items.map((r) => ({ ...r, reviewerName: reviewerMap.get(r.reviewerId) ?? null })),
      total,
      page,
      pageSize: take,
    };
  }

  async summary(entityType: string, entityId: string) {
    if (!entityType || !entityId) {
      throw new BadRequestException('ต้องระบุ entityType และ entityId');
    }
    const reviews = await this.prisma.qcReview.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: 'desc' },
    });

    const count = reviews.length;
    const avgScore = count
      ? Math.round((reviews.reduce((sum, r) => sum + r.score, 0) / count) * 100) / 100
      : null;

    const byCategory: Record<string, number> = {};
    const grouped = new Map<string, number[]>();
    for (const r of reviews) {
      const list = grouped.get(r.category) ?? [];
      list.push(r.score);
      grouped.set(r.category, list);
    }
    for (const [category, scores] of grouped) {
      byCategory[category] =
        Math.round((scores.reduce((s, v) => s + v, 0) / scores.length) * 100) / 100;
    }

    return { avgScore, byCategory, count, latest: reviews[0] ?? null };
  }

  async create(dto: CreateQcReviewDto, user: AuthUser, via = 'ui') {
    const review = await this.prisma.qcReview.create({
      data: { ...dto, reviewerId: user.id },
    });
    await this.audit(user, via, 'create', review.id, {
      entityType: dto.entityType,
      entityId: dto.entityId,
      category: dto.category,
      score: dto.score,
    });
    return review;
  }

  private audit(user: AuthUser, via: string, action: string, entityId: string, meta: object) {
    return this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        via,
        action,
        entityType: 'qc_review',
        entityId,
        meta: meta as Prisma.InputJsonValue,
      },
    });
  }
}
