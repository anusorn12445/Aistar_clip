import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface NotifyPayload {
  type: string; // task_assigned, status_change, mention, ...
  entityType?: string;
  entityId?: string;
  message: string;
}

// Service กลางสำหรับส่ง notification — module อื่น import NotificationsModule แล้วเรียก notify()
@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  async notify(userIds: string[], payload: NotifyPayload) {
    const ids = [...new Set(userIds.filter(Boolean))];
    if (!ids.length) return { count: 0 };
    return this.prisma.notification.createMany({
      data: ids.map((userId) => ({
        userId,
        type: payload.type,
        entityType: payload.entityType,
        entityId: payload.entityId,
        message: payload.message,
      })),
    });
  }

  // เห็นเฉพาะของตัวเอง — ล่าสุด 30 รายการ
  list(userId: string, unreadOnly = false) {
    return this.prisma.notification.findMany({
      where: { userId, ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
  }

  async markRead(id: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({ where: { id } });
    if (!notification || notification.userId !== userId) {
      throw new NotFoundException('ไม่พบ notification');
    }
    if (notification.readAt) return notification;
    return this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  readAll(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
