import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/current-user.decorator';
import { CreateMediaLinkDto, UpdateMediaLinkDto } from './dto/media-link.dto';

// Media Center — ลิงก์ Google Drive / คลังงานของทีม
// ดู = ทุกคนที่ล็อกอิน (hub) · จัดการ = admin (`setting`)
@Injectable()
export class MediaLinksService {
  constructor(private prisma: PrismaService) {}

  // รายการสำหรับหน้า hub — default เฉพาะ active, จัดกลุ่มด้วย category แล้วเรียงตาม sortOrder
  async list(params: { status?: string; category?: string } = {}) {
    const where: Prisma.MediaLinkWhereInput = {
      ...(params.status ? { status: params.status } : { status: 'active' }),
      ...(params.category ? { category: params.category } : {}),
    };
    return this.prisma.mediaLink.findMany({
      where,
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  // รายการทั้งหมดสำหรับหน้าจัดการใน Settings (รวม archived)
  async listAll() {
    return this.prisma.mediaLink.findMany({
      orderBy: [{ status: 'asc' }, { category: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async get(id: string) {
    const link = await this.prisma.mediaLink.findUnique({ where: { id } });
    if (!link) throw new NotFoundException('ไม่พบลิงก์นี้');
    return link;
  }

  async create(dto: CreateMediaLinkDto, user: AuthUser) {
    return this.prisma.mediaLink.create({
      data: {
        label: dto.label.trim(),
        url: dto.url.trim(),
        category: dto.category?.trim() || null,
        icon: dto.icon?.trim() || null,
        note: dto.note?.trim() || null,
        sortOrder: dto.sortOrder ?? 0,
        status: dto.status ?? 'active',
        createdBy: user.id,
      },
    });
  }

  async update(id: string, dto: UpdateMediaLinkDto, _user: AuthUser) {
    await this.get(id);
    return this.prisma.mediaLink.update({
      where: { id },
      data: {
        ...(dto.label !== undefined ? { label: dto.label.trim() } : {}),
        ...(dto.url !== undefined ? { url: dto.url.trim() } : {}),
        ...(dto.category !== undefined ? { category: dto.category.trim() || null } : {}),
        ...(dto.icon !== undefined ? { icon: dto.icon.trim() || null } : {}),
        ...(dto.note !== undefined ? { note: dto.note.trim() || null } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });
  }

  async remove(id: string, _user: AuthUser) {
    await this.get(id);
    await this.prisma.mediaLink.delete({ where: { id } });
    return { ok: true };
  }
}
