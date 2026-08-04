import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TaskPriority, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/current-user.decorator';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { CreateCommentDto } from './dto/create-comment.dto';

// checklist เก็บเป็น Json — นับ done/total ฝั่ง server ให้การ์ดใช้ได้เลย
function checklistCounts(checklist: Prisma.JsonValue | null): { done: number; total: number } {
  if (!Array.isArray(checklist)) return { done: 0, total: 0 };
  const items = checklist as { done?: unknown }[];
  return {
    done: items.filter((i) => i && typeof i === 'object' && i.done === true).length,
    total: items.length,
  };
}

const SORT_FIELDS = ['dueDate', 'priority', 'createdAt'] as const;
type SortField = (typeof SORT_FIELDS)[number];

export interface ListTasksParams {
  assigneeId?: string; // uuid หรือ 'me'
  createdBy?: string; // uuid หรือ 'me' — สำหรับ toggle "งานที่ฉันสร้าง"
  status?: TaskStatus;
  priority?: TaskPriority;
  createdFrom?: string; // manual, handoff, postit, qc
  entityType?: string;
  entityId?: string;
  dueBefore?: string;
  dueAfter?: string;
  q?: string;
  sortBy?: string;
  sortDir?: string;
  page?: number;
  pageSize?: number;
}

const TASK_INCLUDE = {
  assignee: { select: { id: true, name: true, email: true } },
} satisfies Prisma.TaskInclude;

@Injectable()
export class TasksService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async list(params: ListTasksParams, user: AuthUser) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const pageSize = Math.min(params.pageSize && params.pageSize > 0 ? params.pageSize : 20, 50);

    const resolveMe = (v?: string) => (v === 'me' ? user.id : v);

    const dueDate: Prisma.DateTimeNullableFilter = {};
    if (params.dueAfter) dueDate.gte = new Date(params.dueAfter);
    if (params.dueBefore) dueDate.lte = new Date(params.dueBefore);

    const where: Prisma.TaskWhereInput = {
      ...(params.assigneeId ? { assigneeId: resolveMe(params.assigneeId) } : {}),
      ...(params.createdBy ? { createdBy: resolveMe(params.createdBy) } : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.priority ? { priority: params.priority } : {}),
      ...(params.createdFrom ? { createdFrom: params.createdFrom } : {}),
      ...(params.entityType ? { entityType: params.entityType } : {}),
      ...(params.entityId ? { entityId: params.entityId } : {}),
      ...(Object.keys(dueDate).length ? { dueDate } : {}),
      ...(params.q ? { title: { contains: params.q, mode: 'insensitive' } } : {}),
    };

    const sortBy: SortField = SORT_FIELDS.includes(params.sortBy as SortField)
      ? (params.sortBy as SortField)
      : 'createdAt';
    const sortDir: Prisma.SortOrder = params.sortDir === 'asc' ? 'asc' : 'desc';

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.task.findMany({
        where,
        include: { ...TASK_INCLUDE, _count: { select: { comments: true } } },
        orderBy: { [sortBy]: sortDir },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.task.count({ where }),
    ]);

    // นับไฟล์แนบเป็น batch เดียว — ไม่ยิง query ต่อการ์ด
    const ids = rows.map((r) => r.id);
    const attachGroups = ids.length
      ? await this.prisma.assetLink.groupBy({
          by: ['entityId'],
          where: { entityType: 'task', entityId: { in: ids } },
          _count: { _all: true },
        })
      : [];
    const attachMap = new Map(attachGroups.map((g) => [g.entityId, g._count._all]));

    // list ส่งเฉพาะ badge counts — รายละเอียดเต็มไปดึงจาก GET /tasks/:id
    const items = rows.map(({ _count, checklist, description, ...task }) => {
      const cl = checklistCounts(checklist);
      return {
        ...task,
        hasDescription: !!description?.trim(),
        checklistDone: cl.done,
        checklistTotal: cl.total,
        commentCount: _count.comments,
        attachmentCount: attachMap.get(task.id) ?? 0,
      };
    });

    return { items, total, page, pageSize };
  }

  // รายละเอียดเต็มสำหรับ modal — task + comments (พร้อมชื่อคนเขียน) + จำนวนไฟล์แนบ
  async detail(id: string) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        comments: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!task) throw new NotFoundException('ไม่พบงาน');

    const authorIds = [...new Set(task.comments.map((c) => c.createdBy))];
    const authors = authorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: authorIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameMap = new Map(authors.map((u) => [u.id, u.name]));

    const attachmentCount = await this.prisma.assetLink.count({
      where: { entityType: 'task', entityId: id },
    });

    return {
      ...task,
      comments: task.comments.map((c) => ({ ...c, authorName: nameMap.get(c.createdBy) ?? '—' })),
      attachmentCount,
    };
  }

  listAssignees() {
    return this.prisma.user.findMany({
      where: { status: 'active' },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: CreateTaskDto, user: AuthUser, via = 'ui') {
    const task = await this.prisma.task.create({
      data: {
        title: dto.title,
        assigneeId: dto.assigneeId,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        priority: dto.priority,
        entityType: dto.entityType,
        entityId: dto.entityId,
        createdBy: user.id,
      },
      include: TASK_INCLUDE,
    });

    await this.audit(user, via, 'create', task.id, { title: task.title, assigneeId: task.assigneeId });

    // แจ้งเตือนผู้รับผิดชอบ (ไม่ต้องแจ้งถ้ามอบหมายให้ตัวเอง)
    if (task.assigneeId && task.assigneeId !== user.id) {
      await this.notifications.notify([task.assigneeId], {
        type: 'task_assigned',
        entityType: 'task',
        entityId: task.id,
        message: `คุณได้รับมอบหมายงาน "${task.title}"`,
      });
    }
    return task;
  }

  async update(id: string, dto: UpdateTaskDto, user: AuthUser, via = 'ui') {
    const existing = await this.prisma.task.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('ไม่พบงาน');

    const task = await this.prisma.task.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.assigneeId !== undefined ? { assigneeId: dto.assigneeId } : {}),
        ...(dto.dueDate !== undefined ? { dueDate: dto.dueDate ? new Date(dto.dueDate) : null } : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
        // Trello-style fields — description ว่าง/null = ล้างค่า
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() ? dto.description : null }
          : {}),
        ...(dto.labels !== undefined ? { labels: dto.labels } : {}),
        ...(dto.checklist !== undefined
          ? {
              checklist: dto.checklist.map((i) => ({
                id: i.id,
                text: i.text,
                done: i.done,
              })) as Prisma.InputJsonValue,
            }
          : {}),
      },
      include: TASK_INCLUDE,
    });

    await this.audit(user, via, 'update', id, {
      fields: Object.keys(dto),
      ...(dto.status ? { from: existing.status, to: dto.status } : {}),
    });

    // reassign → แจ้งเตือนผู้รับผิดชอบคนใหม่
    const reassigned =
      dto.assigneeId !== undefined && dto.assigneeId !== existing.assigneeId && dto.assigneeId;
    if (reassigned && dto.assigneeId !== user.id) {
      await this.notifications.notify([dto.assigneeId as string], {
        type: 'task_assigned',
        entityType: 'task',
        entityId: task.id,
        message: `คุณได้รับมอบหมายงาน "${task.title}"`,
      });
    }
    return task;
  }

  // ── comments ───────────────────────────────────────────────

  async addComment(taskId: string, dto: CreateCommentDto, user: AuthUser, via = 'ui') {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('ไม่พบงาน');

    const comment = await this.prisma.taskComment.create({
      data: { taskId, content: dto.content, createdBy: user.id },
    });
    await this.audit(user, via, 'comment', taskId, { commentId: comment.id });

    // แจ้งเตือนผู้รับผิดชอบ + คนสร้างงาน (ไม่แจ้งตัวเอง — notify() dedupe ให้แล้ว)
    const actor = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { name: true },
    });
    const targets = [task.assigneeId, task.createdBy].filter(
      (uid): uid is string => !!uid && uid !== user.id,
    );
    if (targets.length) {
      await this.notifications.notify(targets, {
        type: 'task_comment',
        entityType: 'task',
        entityId: taskId,
        message: `${actor?.name ?? user.email} แสดงความคิดเห็นในงาน "${task.title}"`,
      });
    }

    return { ...comment, authorName: actor?.name ?? user.email };
  }

  async deleteComment(taskId: string, commentId: string, user: AuthUser, via = 'ui') {
    const comment = await this.prisma.taskComment.findUnique({ where: { id: commentId } });
    if (!comment || comment.taskId !== taskId) throw new NotFoundException('ไม่พบความคิดเห็น');

    if (comment.createdBy !== user.id && !user.roles.includes('admin')) {
      throw new ForbiddenException('ลบได้เฉพาะความคิดเห็นของตัวเองเท่านั้น');
    }

    await this.prisma.taskComment.delete({ where: { id: commentId } });
    await this.audit(user, via, 'comment_delete', taskId, { commentId });
    return { ok: true };
  }

  private audit(user: AuthUser, via: string, action: string, entityId: string, meta: object) {
    return this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        via,
        action,
        entityType: 'task',
        entityId,
        meta: meta as Prisma.InputJsonValue,
      },
    });
  }
}
