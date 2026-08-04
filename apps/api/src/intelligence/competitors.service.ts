import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/current-user.decorator';
import {
  ConvertInsightDto,
  CreateChannelDto,
  CreateCompetitorDto,
  CreateContentDto,
  CreateInsightDto,
  UpdateChannelDto,
  UpdateCompetitorDto,
} from './dto/competitor.dto';

const SORT_FIELDS = ['name', 'threatLevel', 'updatedAt'] as const;
type SortField = (typeof SORT_FIELDS)[number];

export interface ListCompetitorsParams {
  q?: string;
  type?: string;
  threatLevel?: string;
  watchStatus?: string;
  category?: string;
  sortBy?: string;
  sortDir?: string;
  page?: number;
}

export interface ListInsightsParams {
  competitorId?: string;
  q?: string;
  hasRecommendation?: string;
  page?: number;
}

@Injectable()
export class CompetitorsService {
  constructor(private prisma: PrismaService) {}

  async list(params: ListCompetitorsParams) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const take = 20;

    const where: Prisma.CompetitorWhereInput = {
      ...(params.type ? { type: params.type } : {}),
      ...(params.threatLevel ? { threatLevel: params.threatLevel } : {}),
      ...(params.watchStatus ? { watchStatus: params.watchStatus } : {}),
      ...(params.category ? { category: { has: params.category } } : {}),
      ...(params.q
        ? {
            OR: [
              { name: { contains: params.q, mode: 'insensitive' } },
              { positioning: { contains: params.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const sortBy: SortField = SORT_FIELDS.includes(params.sortBy as SortField)
      ? (params.sortBy as SortField)
      : 'updatedAt';
    const sortDir: Prisma.SortOrder =
      params.sortDir === 'asc' || params.sortDir === 'desc'
        ? params.sortDir
        : sortBy === 'name'
          ? 'asc'
          : 'desc';

    const [items, total] = await this.prisma.$transaction([
      this.prisma.competitor.findMany({
        where,
        include: { _count: { select: { channels: true, insights: true, contents: true } } },
        orderBy: { [sortBy]: sortDir },
        skip: (page - 1) * take,
        take,
      }),
      this.prisma.competitor.count({ where }),
    ]);
    return { items, total, page, pageSize: take };
  }

  async get(id: string) {
    const competitor = await this.prisma.competitor.findUnique({
      where: { id },
      include: {
        channels: { orderBy: { platform: 'asc' } },
        contents: { orderBy: { capturedAt: 'desc' }, take: 20 },
        insights: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!competitor) throw new NotFoundException('ไม่พบคู่แข่ง');

    const nameById = await this.userNames(competitor.insights.map((i) => i.createdBy));
    return {
      ...competitor,
      insights: competitor.insights.map((i) => ({
        ...i,
        createdByName: nameById.get(i.createdBy) ?? null,
      })),
    };
  }

  async create(dto: CreateCompetitorDto, user: AuthUser, via = 'ui') {
    const competitor = await this.prisma.competitor.create({
      data: {
        name: dto.name,
        type: dto.type,
        category: dto.category ?? [],
        positioning: dto.positioning,
        audience: dto.audience ?? [],
        strength: dto.strength,
        weakness: dto.weakness,
        threatLevel: dto.threatLevel ?? 'medium',
        watchStatus: dto.watchStatus ?? 'active',
        notes: dto.notes,
      },
    });
    await this.audit(user, via, 'create', competitor.id, { name: competitor.name });
    return competitor;
  }

  async update(id: string, dto: UpdateCompetitorDto, user: AuthUser, via = 'ui') {
    await this.findRaw(id);
    const competitor = await this.prisma.competitor.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.type !== undefined ? { type: dto.type || null } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.positioning !== undefined ? { positioning: dto.positioning || null } : {}),
        ...(dto.audience !== undefined ? { audience: dto.audience } : {}),
        ...(dto.strength !== undefined ? { strength: dto.strength || null } : {}),
        ...(dto.weakness !== undefined ? { weakness: dto.weakness || null } : {}),
        ...(dto.threatLevel !== undefined ? { threatLevel: dto.threatLevel } : {}),
        ...(dto.watchStatus !== undefined ? { watchStatus: dto.watchStatus } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes || null } : {}),
      },
    });
    await this.audit(user, via, 'update', id, { fields: Object.keys(dto) });
    return competitor;
  }

  // ── Channels ────────────────────────────────────────────────

  async addChannel(competitorId: string, dto: CreateChannelDto, user: AuthUser, via = 'ui') {
    await this.findRaw(competitorId);
    const channel = await this.prisma.competitorChannel.create({
      data: { competitorId, ...dto },
    });
    await this.touch(competitorId);
    await this.audit(user, via, 'add_channel', competitorId, {
      channelId: channel.id,
      platform: dto.platform,
      handle: dto.handle,
    });
    return channel;
  }

  async updateChannel(
    competitorId: string,
    channelId: string,
    dto: UpdateChannelDto,
    user: AuthUser,
    via = 'ui',
  ) {
    await this.findChannel(competitorId, channelId);
    const channel = await this.prisma.competitorChannel.update({
      where: { id: channelId },
      data: dto,
    });
    await this.touch(competitorId);
    await this.audit(user, via, 'update_channel', competitorId, {
      channelId,
      fields: Object.keys(dto),
    });
    return channel;
  }

  async removeChannel(competitorId: string, channelId: string, user: AuthUser, via = 'ui') {
    await this.findChannel(competitorId, channelId);
    await this.prisma.competitorChannel.delete({ where: { id: channelId } });
    await this.touch(competitorId);
    await this.audit(user, via, 'remove_channel', competitorId, { channelId });
    return { ok: true };
  }

  // ── Contents — เก็บ link + observation เท่านั้น (guardrail §18.5 — no scraping) ──

  async addContent(competitorId: string, dto: CreateContentDto, user: AuthUser, via = 'ui') {
    await this.findRaw(competitorId);
    const content = await this.prisma.competitorContent.create({
      data: { competitorId, ...dto, createdBy: user.id },
    });
    await this.touch(competitorId);
    await this.audit(user, via, 'add_content', competitorId, { contentId: content.id, url: dto.url });
    return content;
  }

  // ── Insights — §18.4 บังคับแยก Fact / Assumption / Recommendation ──

  async addInsight(competitorId: string, dto: CreateInsightDto, user: AuthUser, via = 'ui') {
    await this.findRaw(competitorId);
    const insight = await this.prisma.competitorInsight.create({
      data: {
        competitorId,
        fact: dto.fact,
        assumption: dto.assumption,
        recommendation: dto.recommendation,
        createdBy: user.id,
      },
    });
    await this.touch(competitorId);
    await this.audit(user, via, 'add_insight', competitorId, { insightId: insight.id });
    return insight;
  }

  async listInsights(params: ListInsightsParams) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const take = 20;

    const where: Prisma.CompetitorInsightWhereInput = {
      ...(params.competitorId ? { competitorId: params.competitorId } : {}),
      ...(params.hasRecommendation === 'true'
        ? { recommendation: { not: null } }
        : params.hasRecommendation === 'false'
          ? { recommendation: null }
          : {}),
      ...(params.q
        ? {
            OR: [
              { fact: { contains: params.q, mode: 'insensitive' } },
              { assumption: { contains: params.q, mode: 'insensitive' } },
              { recommendation: { contains: params.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.competitorInsight.findMany({
        where,
        include: { competitor: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * take,
        take,
      }),
      this.prisma.competitorInsight.count({ where }),
    ]);

    const nameById = await this.userNames(items.map((i) => i.createdBy));
    return {
      items: items.map((i) => ({ ...i, createdByName: nameById.get(i.createdBy) ?? null })),
      total,
      page,
      pageSize: take,
    };
  }

  // POST /insights/:id/convert-to-campaign — Recommendation → Campaign brief
  async convertInsightToCampaign(
    insightId: string,
    dto: ConvertInsightDto,
    user: AuthUser,
    via = 'ui',
  ) {
    const insight = await this.prisma.competitorInsight.findUnique({
      where: { id: insightId },
      include: { competitor: { select: { name: true } } },
    });
    if (!insight) throw new NotFoundException('ไม่พบ insight');
    if (insight.convertedToCampaignId) {
      throw new BadRequestException('insight นี้ถูกแปลงเป็น campaign ไปแล้ว');
    }

    // เช็คสิทธิ์ campaign C เอง (guard ที่ route เช็คแค่ competitor C)
    const canCreate = await this.prisma.rolePermission.count({
      where: { module: 'campaign', actions: { has: 'C' }, role: { key: { in: user.roles } } },
    });
    if (!canCreate) {
      throw new ForbiddenException('ต้องมีสิทธิ์ C ใน module campaign จึงจะแปลงเป็นแคมเปญได้');
    }

    const base = dto.name?.trim() || insight.recommendation || insight.fact;
    const name = base.length > 120 ? `${base.slice(0, 117)}...` : base;

    const count = await this.prisma.campaign.count();
    const displayCode = `CMP-${String(count + 1).padStart(4, '0')}`;
    const campaign = await this.prisma.campaign.create({
      data: { displayCode, name, status: 'brief' },
    });

    const updated = await this.prisma.competitorInsight.update({
      where: { id: insightId },
      data: { convertedToCampaignId: campaign.id },
    });
    await this.audit(user, via, 'convert_insight', insight.competitorId ?? insightId, {
      insightId,
      campaignId: campaign.id,
      displayCode,
    });
    return { campaign, insight: updated };
  }

  private async findRaw(id: string) {
    const competitor = await this.prisma.competitor.findUnique({ where: { id } });
    if (!competitor) throw new NotFoundException('ไม่พบคู่แข่ง');
    return competitor;
  }

  private async findChannel(competitorId: string, channelId: string) {
    const channel = await this.prisma.competitorChannel.findUnique({ where: { id: channelId } });
    if (!channel || channel.competitorId !== competitorId) {
      throw new NotFoundException('ไม่พบช่องทางของคู่แข่งนี้');
    }
    return channel;
  }

  // แตะ updatedAt ให้ตาราง list สะท้อนความเคลื่อนไหวล่าสุด
  private touch(competitorId: string) {
    return this.prisma.competitor.update({
      where: { id: competitorId },
      data: { updatedAt: new Date() },
    });
  }

  private async userNames(ids: string[]) {
    const unique = [...new Set(ids)];
    const users = await this.prisma.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, name: true },
    });
    return new Map(users.map((u) => [u.id, u.name]));
  }

  private audit(user: AuthUser, via: string, action: string, entityId: string, meta: object) {
    return this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        via,
        action,
        entityType: 'competitor',
        entityId,
        meta: meta as Prisma.InputJsonValue,
      },
    });
  }
}
