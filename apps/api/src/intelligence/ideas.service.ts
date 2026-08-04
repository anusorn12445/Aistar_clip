import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { IdeaStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/current-user.decorator';
import { AiAssistService } from './ai-assist.service';
import { ConvertIdeaDto, CreateIdeaDto, UpdateIdeaDto } from './dto/idea.dto';

// State machine ตาม §19.3 — เดินหน้าอย่างเดียว + archive ได้จากทุกสถานะ
// converted ตั้งได้ผ่าน convert endpoint เท่านั้น (ไม่ผ่าน /status)
const STATUS_ORDER: IdeaStatus[] = [
  'captured',
  'reviewed',
  'shortlisted',
  'adapted',
  'converted',
  'used',
];

const SORT_FIELDS = ['createdAt', 'title', 'status'] as const;
type SortField = (typeof SORT_FIELDS)[number];

export interface ListIdeasParams {
  q?: string;
  ideaType?: string;
  status?: IdeaStatus;
  createdBy?: string; // uuid หรือ 'me'
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortDir?: string;
  page?: number;
}

@Injectable()
export class IdeasService {
  constructor(
    private prisma: PrismaService,
    private aiAssist: AiAssistService,
  ) {}

  async list(params: ListIdeasParams, user: AuthUser) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const take = 20;
    const resolveMe = (v?: string) => (v === 'me' ? user.id : v);

    const createdAt: Prisma.DateTimeFilter = {};
    if (params.dateFrom) createdAt.gte = new Date(params.dateFrom);
    if (params.dateTo) {
      // dateTo = วันสุดท้ายที่รวมด้วย — บวก 1 วันแล้วใช้ lt
      const to = new Date(params.dateTo);
      to.setDate(to.getDate() + 1);
      createdAt.lt = to;
    }

    const where: Prisma.IdeaWhereInput = {
      ...(params.status ? { status: params.status } : { status: { not: 'archived' } }),
      ...(params.ideaType ? { ideaType: params.ideaType } : {}),
      ...(params.createdBy ? { createdBy: resolveMe(params.createdBy) } : {}),
      ...(Object.keys(createdAt).length ? { createdAt } : {}),
      ...(params.q
        ? {
            OR: [
              { title: { contains: params.q, mode: 'insensitive' } },
              { note: { contains: params.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const sortBy: SortField = SORT_FIELDS.includes(params.sortBy as SortField)
      ? (params.sortBy as SortField)
      : 'createdAt';
    const sortDir: Prisma.SortOrder = params.sortDir === 'asc' ? 'asc' : 'desc';

    const [items, total] = await this.prisma.$transaction([
      this.prisma.idea.findMany({
        where,
        orderBy: { [sortBy]: sortDir },
        skip: (page - 1) * take,
        take,
      }),
      this.prisma.idea.count({ where }),
    ]);

    // เติมชื่อคนสร้าง (Idea ไม่มี relation ใน schema)
    const creatorIds = [...new Set(items.map((i) => i.createdBy))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: creatorIds } },
      select: { id: true, name: true },
    });
    const nameById = new Map(users.map((u) => [u.id, u.name]));
    return {
      items: items.map((i) => ({ ...i, createdByName: nameById.get(i.createdBy) ?? null })),
      total,
      page,
      pageSize: take,
    };
  }

  async get(id: string) {
    const idea = await this.prisma.idea.findUnique({ where: { id } });
    if (!idea) throw new NotFoundException('ไม่พบไอเดีย');
    return idea;
  }

  async create(dto: CreateIdeaDto, user: AuthUser, via = 'ui') {
    const idea = await this.prisma.idea.create({
      data: {
        title: dto.title,
        ideaType: dto.ideaType,
        url: dto.url,
        note: dto.note,
        createdBy: user.id,
      },
    });
    await this.audit(user, via, 'create', idea.id, { title: idea.title, ideaType: idea.ideaType });
    return idea;
  }

  async update(id: string, dto: UpdateIdeaDto, user: AuthUser, via = 'ui') {
    await this.get(id);
    const idea = await this.prisma.idea.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.ideaType !== undefined ? { ideaType: dto.ideaType || null } : {}),
        ...(dto.url !== undefined ? { url: dto.url || null } : {}),
        ...(dto.note !== undefined ? { note: dto.note || null } : {}),
      },
    });
    await this.audit(user, via, 'update', id, { fields: Object.keys(dto) });
    return idea;
  }

  async changeStatus(id: string, next: IdeaStatus, user: AuthUser, via = 'ui') {
    const existing = await this.get(id);

    if (next === 'converted') {
      throw new BadRequestException(
        "status 'converted' ตั้งผ่านการ convert เท่านั้น — ใช้ POST /ideas/:id/convert",
      );
    }
    if (existing.status === next) return existing;

    const allowed =
      next === 'archived'
        ? existing.status !== 'archived'
        : STATUS_ORDER.indexOf(next) > STATUS_ORDER.indexOf(existing.status) &&
          STATUS_ORDER.includes(existing.status);
    if (!allowed) {
      throw new BadRequestException(`เปลี่ยน status ${existing.status} → ${next} ไม่ได้ (เดินหน้าอย่างเดียว)`);
    }

    const idea = await this.prisma.idea.update({ where: { id }, data: { status: next } });
    await this.audit(user, via, 'status_change', id, { from: existing.status, to: next });
    return idea;
  }

  // POST /ideas/:id/ai-assist — สกัด pattern + สร้าง adaptation แล้วบันทึกลง idea
  async aiAssistIdea(id: string, user: AuthUser, via = 'ui') {
    const idea = await this.get(id);

    const result = await this.aiAssist.extractIdeaPattern({
      title: idea.title,
      url: idea.url,
      note: idea.note,
      ideaType: idea.ideaType,
    });

    const updated = await this.prisma.idea.update({
      where: { id },
      data: { aiSummary: result.aiSummary, aiAdaptation: result.aiAdaptation },
    });

    await this.audit(user, via, 'ai_assist', id, {
      model: result.model,
      usage: result.usage,
      latencyMs: result.latencyMs,
    });

    return {
      idea: updated,
      aiSummary: result.aiSummary,
      aiAdaptation: result.aiAdaptation,
      model: result.model,
      usage: result.usage,
    };
  }

  // POST /ideas/:id/convert — สร้าง Campaign (brief) หรือ Episode (idea) จากไอเดีย
  async convert(id: string, dto: ConvertIdeaDto, user: AuthUser, via = 'ui') {
    const idea = await this.get(id);
    if (idea.status === 'converted') {
      throw new BadRequestException('ไอเดียนี้ถูก convert ไปแล้ว');
    }
    if (idea.status === 'archived') {
      throw new BadRequestException('ไอเดียที่ archive แล้ว convert ไม่ได้');
    }

    // เช็คสิทธิ์ C ใน module ปลายทางเอง (guard ที่ route เช็คแค่ idea C)
    await this.requirePermission(user, dto.to, 'C');

    const title = dto.title?.trim() || idea.title;

    if (dto.to === 'campaign') {
      const displayCode = await this.nextCampaignCode();
      const campaign = await this.prisma.campaign.create({
        data: { displayCode, name: title, status: 'brief' },
      });
      await this.markConverted(idea.id, user, via, 'campaign', campaign.id, displayCode);
      return { to: 'campaign', entity: campaign, idea: await this.get(id) };
    }

    const displayCode = await this.nextEpisodeCode();
    const episode = await this.prisma.episode.create({
      data: { displayCode, title, status: 'idea' },
    });
    await this.markConverted(idea.id, user, via, 'episode', episode.id, displayCode);
    return { to: 'episode', entity: episode, idea: await this.get(id) };
  }

  private async markConverted(
    ideaId: string,
    user: AuthUser,
    via: string,
    to: string,
    entityId: string,
    displayCode: string,
  ) {
    await this.prisma.idea.update({ where: { id: ideaId }, data: { status: 'converted' } });
    await this.audit(user, via, 'convert', ideaId, { to, entityId, displayCode });
  }

  private async requirePermission(user: AuthUser, module: string, action: string) {
    const count = await this.prisma.rolePermission.count({
      where: { module, actions: { has: action }, role: { key: { in: user.roles } } },
    });
    if (!count) {
      throw new ForbiddenException(`ต้องมีสิทธิ์ ${action} ใน module ${module} จึงจะ convert ได้`);
    }
  }

  // CMP-0001 / EP-0001 — count+1 pattern เดียวกับ campaigns/episodes service
  private async nextCampaignCode(): Promise<string> {
    const count = await this.prisma.campaign.count();
    return `CMP-${String(count + 1).padStart(4, '0')}`;
  }

  private async nextEpisodeCode(): Promise<string> {
    const count = await this.prisma.episode.count();
    return `EP-${String(count + 1).padStart(4, '0')}`;
  }

  private audit(user: AuthUser, via: string, action: string, entityId: string, meta: object) {
    return this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        via,
        action,
        entityType: 'idea',
        entityId,
        meta: meta as Prisma.InputJsonValue,
      },
    });
  }
}
