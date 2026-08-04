import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PostitStatus, Prisma, TaskPriority } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/current-user.decorator';
import { CreatePostitCommentDto, CreatePostitDto, UpdatePostitDto } from './dto/postit.dto';

// State machine ตาม §20.3 — เดินหน้าอย่างเดียว + archive ได้จากทุกสถานะ
const STATUS_ORDER: PostitStatus[] = ['open', 'in_progress', 'resolved'];

const SORT_FIELDS = ['createdAt', 'priority'] as const;
type SortField = (typeof SORT_FIELDS)[number];

export interface ListPostitsParams {
  q?: string;
  type?: string;
  status?: PostitStatus;
  assigneeId?: string; // uuid หรือ 'me'
  createdBy?: string; // uuid หรือ 'me'
  entityType?: string;
  entityId?: string;
  priority?: TaskPriority;
  sortBy?: string;
  sortDir?: string;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class PostitsService {
  constructor(private prisma: PrismaService) {}

  async list(params: ListPostitsParams, user: AuthUser) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const pageSize = Math.min(params.pageSize && params.pageSize > 0 ? params.pageSize : 100, 200);
    const resolveMe = (v?: string) => (v === 'me' ? user.id : v);

    const where: Prisma.PostitWhereInput = {
      ...(params.q ? { content: { contains: params.q, mode: 'insensitive' } } : {}),
      ...(params.type ? { type: params.type } : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.assigneeId ? { assigneeId: resolveMe(params.assigneeId) } : {}),
      ...(params.createdBy ? { createdBy: resolveMe(params.createdBy) } : {}),
      ...(params.entityType ? { entityType: params.entityType } : {}),
      ...(params.entityId ? { entityId: params.entityId } : {}),
      ...(params.priority ? { priority: params.priority } : {}),
    };

    const sortBy: SortField = SORT_FIELDS.includes(params.sortBy as SortField)
      ? (params.sortBy as SortField)
      : 'createdAt';
    const sortDir: Prisma.SortOrder = params.sortDir === 'asc' ? 'asc' : 'desc';

    const [items, total] = await this.prisma.$transaction([
      this.prisma.postit.findMany({
        where,
        include: { _count: { select: { comments: true } } },
        orderBy: { [sortBy]: sortDir },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.postit.count({ where }),
    ]);

    const withNames = await this.attachUserNames(items);
    return { items: withNames, total, page, pageSize };
  }

  async get(id: string) {
    const postit = await this.prisma.postit.findUnique({
      where: { id },
      include: { comments: { orderBy: { createdAt: 'asc' } } },
    });
    if (!postit) throw new NotFoundException('ไม่พบโพสต์อิท');

    const userIds = [
      postit.createdBy,
      ...(postit.assigneeId ? [postit.assigneeId] : []),
      ...postit.comments.map((c) => c.createdBy),
    ];
    const nameById = await this.userNames(userIds);
    return {
      ...postit,
      createdByName: nameById.get(postit.createdBy) ?? null,
      assigneeName: postit.assigneeId ? (nameById.get(postit.assigneeId) ?? null) : null,
      comments: postit.comments.map((c) => ({
        ...c,
        createdByName: nameById.get(c.createdBy) ?? null,
      })),
    };
  }

  async create(dto: CreatePostitDto, user: AuthUser, via = 'ui') {
    const postit = await this.prisma.postit.create({
      data: {
        type: dto.type,
        content: dto.content,
        entityType: dto.entityType,
        entityId: dto.entityId,
        assigneeId: dto.assigneeId,
        priority: dto.priority,
        createdBy: user.id,
      },
    });
    await this.audit(user, via, 'create', postit.id, { type: postit.type, assigneeId: postit.assigneeId });

    // แจ้งเตือนผู้รับผิดชอบ (ไม่ต้องแจ้งถ้าแปะให้ตัวเอง)
    if (postit.assigneeId && postit.assigneeId !== user.id) {
      await this.notify([postit.assigneeId], 'postit_assigned', postit.id, this.snippet(postit.content, 'มีโน้ตใหม่ถึงคุณ'));
    }
    return postit;
  }

  async update(id: string, dto: UpdatePostitDto, user: AuthUser, via = 'ui') {
    const existing = await this.prisma.postit.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('ไม่พบโพสต์อิท');

    if (dto.status !== undefined && dto.status !== existing.status) {
      const allowed =
        dto.status === 'archived'
          ? true
          : STATUS_ORDER.indexOf(dto.status) > STATUS_ORDER.indexOf(existing.status);
      if (!allowed) {
        throw new BadRequestException(
          `เปลี่ยน status ${existing.status} → ${dto.status} ไม่ได้ (open → in_progress → resolved → archived)`,
        );
      }
    }

    const postit = await this.prisma.postit.update({
      where: { id },
      data: {
        ...(dto.content !== undefined ? { content: dto.content } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.assigneeId !== undefined ? { assigneeId: dto.assigneeId } : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });
    await this.audit(user, via, 'update', id, {
      fields: Object.keys(dto),
      ...(dto.status ? { from: existing.status, to: dto.status } : {}),
    });

    // reassign → แจ้งเตือนผู้รับผิดชอบคนใหม่
    if (dto.assigneeId && dto.assigneeId !== existing.assigneeId && dto.assigneeId !== user.id) {
      await this.notify([dto.assigneeId], 'postit_assigned', id, this.snippet(postit.content, 'มีโน้ตมอบหมายถึงคุณ'));
    }
    return postit;
  }

  async addComment(id: string, dto: CreatePostitCommentDto, user: AuthUser, via = 'ui') {
    const postit = await this.prisma.postit.findUnique({ where: { id } });
    if (!postit) throw new NotFoundException('ไม่พบโพสต์อิท');

    const comment = await this.prisma.postitComment.create({
      data: { postitId: id, content: dto.content, createdBy: user.id },
    });
    await this.audit(user, via, 'comment', id, { commentId: comment.id });

    // แจ้งเตือนเจ้าของโน้ต + ผู้รับผิดชอบ (ยกเว้นคนคอมเมนต์เอง)
    const targets = [...new Set([postit.createdBy, postit.assigneeId].filter(Boolean))].filter(
      (uid) => uid !== user.id,
    ) as string[];
    if (targets.length) {
      await this.notify(targets, 'postit_comment', id, this.snippet(postit.content, 'มีคอมเมนต์ใหม่ในโน้ต'));
    }

    const nameById = await this.userNames([comment.createdBy]);
    return { ...comment, createdByName: nameById.get(comment.createdBy) ?? null };
  }

  // POST /postits/:id/convert-to-task — สร้าง Task จากโน้ต แล้วปิดโน้ตเป็น resolved
  async convertToTask(id: string, user: AuthUser, via = 'ui') {
    const postit = await this.prisma.postit.findUnique({ where: { id } });
    if (!postit) throw new NotFoundException('ไม่พบโพสต์อิท');
    if (postit.status === 'archived') {
      throw new BadRequestException('โน้ตที่ archive แล้วแปลงเป็น task ไม่ได้');
    }

    const title = postit.content.length > 120 ? `${postit.content.slice(0, 117)}...` : postit.content;
    const task = await this.prisma.task.create({
      data: {
        title,
        entityType: postit.entityType,
        entityId: postit.entityId,
        assigneeId: postit.assigneeId,
        priority: postit.priority,
        createdFrom: 'postit',
        createdBy: user.id,
      },
    });

    const updated = await this.prisma.postit.update({
      where: { id },
      data: { status: 'resolved' },
    });
    await this.audit(user, via, 'convert_to_task', id, { taskId: task.id });

    if (task.assigneeId && task.assigneeId !== user.id) {
      await this.prisma.notification.createMany({
        data: [
          {
            userId: task.assigneeId,
            type: 'task_assigned',
            entityType: 'task',
            entityId: task.id,
            message: `คุณได้รับมอบหมายงาน "${task.title}" (แปลงจากโพสต์อิท)`,
          },
        ],
      });
    }
    return { task, postit: updated };
  }

  private snippet(content: string, prefix: string) {
    const text = content.length > 60 ? `${content.slice(0, 57)}...` : content;
    return `${prefix}: "${text}"`;
  }

  private notify(userIds: string[], type: string, postitId: string, message: string) {
    return this.prisma.notification.createMany({
      data: userIds.map((userId) => ({
        userId,
        type,
        entityType: 'postit',
        entityId: postitId,
        message,
      })),
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

  private async attachUserNames<T extends { createdBy: string; assigneeId: string | null }>(
    items: T[],
  ) {
    const nameById = await this.userNames(
      items.flatMap((i) => [i.createdBy, ...(i.assigneeId ? [i.assigneeId] : [])]),
    );
    return items.map((i) => ({
      ...i,
      createdByName: nameById.get(i.createdBy) ?? null,
      assigneeName: i.assigneeId ? (nameById.get(i.assigneeId) ?? null) : null,
    }));
  }

  private audit(user: AuthUser, via: string, action: string, entityId: string, meta: object) {
    return this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        via,
        action,
        entityType: 'postit',
        entityId,
        meta: meta as Prisma.InputJsonValue,
      },
    });
  }
}
