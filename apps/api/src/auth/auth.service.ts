import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService, SCOPED_MODULES, ViewScope } from './scope.service';

// refresh token อายุ 7 วัน (F.1 — rotate ทุกครั้งที่ใช้)
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private scope: ScopeService,
  ) {}

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  // ออก access + refresh คู่กัน — เก็บเฉพาะ sha256 hash ของ refresh token ใน DB
  private async issueTokens(user: { id: string; email: string }, roles: string[]) {
    const accessToken = await this.jwt.signAsync({ sub: user.id, email: user.email, roles });
    const refreshToken = randomBytes(32).toString('hex'); // 64 hex chars
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    });
    return { accessToken, refreshToken };
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { roleAssignments: { include: { role: true } } },
    });
    if (!user || user.status !== 'active' || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    }

    const roles = user.roleAssignments.map((a) => a.role.key);
    const tokens = await this.issueTokens(user, roles);

    await this.prisma.auditLog.create({
      data: { actorId: user.id, action: 'login', via: 'ui' },
    });

    return {
      ...tokens,
      user: { id: user.id, email: user.email, name: user.name, roles },
    };
  }

  // rotate: revoke ตัวเก่า แล้วออกคู่ใหม่ — token ที่ถูก revoke/หมดอายุ ใช้ไม่ได้
  async refresh(refreshToken: string) {
    const row = await this.prisma.refreshToken.findFirst({
      where: { tokenHash: this.hashToken(refreshToken) },
      include: { user: { include: { roleAssignments: { include: { role: true } } } } },
    });
    if (!row || row.revokedAt || row.expiresAt < new Date() || row.user.status !== 'active') {
      throw new UnauthorizedException('refresh token ไม่ถูกต้องหรือหมดอายุ');
    }

    await this.prisma.refreshToken.update({
      where: { id: row.id },
      data: { revokedAt: new Date() },
    });

    const roles = row.user.roleAssignments.map((a) => a.role.key);
    const tokens = await this.issueTokens(row.user, roles);
    return {
      ...tokens,
      user: { id: row.user.id, email: row.user.email, name: row.user.name, roles },
    };
  }

  async logout(refreshToken: string) {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }

  // รูป avatar ล่าสุดของ user (asset image, ไม่ archived) — เลือก primary_reference > cover > อื่น, ใหม่สุดก่อน
  private async avatarAssetId(userId: string): Promise<string | null> {
    const links = await this.prisma.assetLink.findMany({
      where: {
        entityType: 'user',
        entityId: userId,
        asset: { archivedAt: null, mimeType: { startsWith: 'image/' } },
      },
      select: { assetId: true, linkRole: true, asset: { select: { createdAt: true } } },
    });
    if (links.length === 0) return null;
    const ROLE_PRIORITY: Record<string, number> = { primary_reference: 0, cover: 1, thumbnail: 2 };
    let best: { assetId: string; prio: number; createdAt: Date } | null = null;
    for (const link of links) {
      const prio = ROLE_PRIORITY[link.linkRole] ?? 3;
      if (
        !best ||
        prio < best.prio ||
        // เท่ากันเลือกใหม่สุด (upload ทับได้โดยไม่ต้อง demote ของเก่า)
        (prio === best.prio && link.asset.createdAt > best.createdAt)
      ) {
        best = { assetId: link.assetId, prio, createdAt: link.asset.createdAt };
      }
    }
    return best?.assetId ?? null;
  }

  // สิทธิ์รวมทุก module ของ user — { module: [actions] } union ข้ามทุก role
  private async effectivePermissions(roles: string[]): Promise<Record<string, string[]>> {
    if (!roles.length) return {};
    const rows = await this.prisma.rolePermission.findMany({
      where: { role: { key: { in: roles } } },
      select: { module: true, actions: true },
    });
    // union actions ต่อ module (Set ป้องกันซ้ำเมื่อผู้ใช้มีหลาย role)
    const merged: Record<string, Set<string>> = {};
    for (const row of rows) {
      const set = (merged[row.module] ??= new Set());
      for (const a of row.actions) set.add(a);
    }
    return Object.fromEntries(Object.entries(merged).map(([m, s]) => [m, [...s]]));
  }

  // GET /auth/me — โปรไฟล์สดของผู้ใช้ที่ล็อกอินอยู่ (roles + status + avatar + permissions + viewScope)
  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { roleAssignments: { include: { role: true } } },
    });
    if (!user) throw new NotFoundException('ไม่พบผู้ใช้');
    const roles = user.roleAssignments.map((a) => a.role.key);
    const authUser = { id: user.id, email: user.email, roles };
    const permissions = await this.effectivePermissions(roles);
    // viewScope ต่อ scoped module — ให้ UI แสดง badge อธิบายขอบเขต (own/team/all)
    const viewScope: Record<string, ViewScope> = {};
    for (const module of SCOPED_MODULES) {
      viewScope[module] = await this.scope.resolveViewScope(authUser, module);
    }
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      status: user.status,
      createdAt: user.createdAt,
      roles,
      roleNames: user.roleAssignments.map((a) => a.role.name),
      avatarAssetId: await this.avatarAssetId(user.id),
      permissions,
      viewScope,
    };
  }

  // PATCH /auth/me — แก้ชื่อ (บังคับถ้าส่งมา) + อีเมล (เช็คซ้ำ) ของตัวเอง
  async updateSelf(userId: string, dto: { name?: string; email?: string }) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('ไม่พบผู้ใช้');

    const data: { name?: string; email?: string } = {};
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (name.length < 1 || name.length > 120) {
        throw new BadRequestException('ชื่อต้องยาว 1–120 ตัวอักษร');
      }
      data.name = name;
    }
    if (dto.email !== undefined && dto.email !== user.email) {
      const email = dto.email.trim().toLowerCase();
      const taken = await this.prisma.user.findUnique({ where: { email } });
      if (taken && taken.id !== userId) {
        throw new ConflictException('อีเมลนี้ถูกใช้งานแล้ว');
      }
      data.email = email;
    }

    if (Object.keys(data).length > 0) {
      await this.prisma.user.update({ where: { id: userId }, data });
      await this.prisma.auditLog.create({
        data: {
          actorId: userId,
          action: 'update_self',
          entityType: 'user',
          entityId: userId,
          via: 'ui',
          meta: data,
        },
      });
    }

    return this.me(userId);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new BadRequestException('รหัสผ่านปัจจุบันไม่ถูกต้อง');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(newPassword, 10) },
    });
    // เปลี่ยนรหัสแล้ว revoke ทุก session เดิม — ต้อง login ใหม่จากอุปกรณ์อื่น
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.prisma.auditLog.create({
      data: { actorId: userId, action: 'change_password', via: 'ui' },
    });
    return { ok: true };
  }
}
