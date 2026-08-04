import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/current-user.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const SORT_FIELDS = ['name', 'email', 'createdAt'] as const;
type SortField = (typeof SORT_FIELDS)[number];

export interface ListUsersParams {
  q?: string;
  role?: string;
  status?: UserStatus;
  createdFrom?: string;
  createdTo?: string;
  sortBy?: string;
  sortDir?: string;
  page?: number;
  pageSize?: number;
}

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  roleAssignments: { select: { role: { select: { key: true, name: true } } } },
} satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;

function toDto(u: UserRow) {
  const { roleAssignments, ...rest } = u;
  return { ...rest, roles: roleAssignments.map((a) => a.role) };
}

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async list(params: ListUsersParams) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const pageSize = Math.min(params.pageSize && params.pageSize > 0 ? params.pageSize : 20, 50);

    const createdAt: Prisma.DateTimeFilter = {};
    if (params.createdFrom) createdAt.gte = new Date(params.createdFrom);
    if (params.createdTo) createdAt.lte = new Date(params.createdTo);

    const where: Prisma.UserWhereInput = {
      ...(params.q
        ? {
            OR: [
              { name: { contains: params.q, mode: 'insensitive' } },
              { email: { contains: params.q, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.role ? { roleAssignments: { some: { role: { key: params.role } } } } : {}),
      ...(Object.keys(createdAt).length ? { createdAt } : {}),
    };

    const sortBy: SortField = SORT_FIELDS.includes(params.sortBy as SortField)
      ? (params.sortBy as SortField)
      : 'createdAt';
    const sortDir: Prisma.SortOrder = params.sortDir === 'asc' ? 'asc' : 'desc';

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: USER_SELECT,
        orderBy: { [sortBy]: sortDir },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items: items.map(toDto), total, page, pageSize };
  }

  listRoles() {
    return this.prisma.role.findMany({
      select: { id: true, key: true, name: true },
      orderBy: { key: 'asc' },
    });
  }

  // ── Role permissions (matrix + viewScope) ──────────────────

  listRolePermissions() {
    return this.prisma.role.findMany({
      select: {
        id: true,
        key: true,
        name: true,
        permissions: {
          select: { module: true, actions: true, viewScope: true },
          orderBy: { module: 'asc' },
        },
      },
      orderBy: { key: 'asc' },
    });
  }

  /** ปรับ viewScope ของ role×module — module นั้นต้องมีแถว permission อยู่แล้ว (ไม่งั้น role เข้า module ไม่ได้อยู่ดี) */
  async updateRolePermission(
    roleKey: string,
    module: string,
    viewScope: string,
    actor: AuthUser,
    via = 'ui',
  ) {
    const role = await this.prisma.role.findUnique({ where: { key: roleKey } });
    if (!role) throw new NotFoundException(`ไม่พบบทบาท ${roleKey}`);

    const perm = await this.prisma.rolePermission.findUnique({
      where: { roleId_module: { roleId: role.id, module } },
    });
    if (!perm) {
      throw new NotFoundException(`บทบาท ${roleKey} ไม่มี permission ใน module ${module}`);
    }

    const updated = await this.prisma.rolePermission.update({
      where: { id: perm.id },
      data: { viewScope },
      select: { module: true, actions: true, viewScope: true },
    });
    await this.audit(actor, via, 'update_role_permission', role.id, {
      roleKey,
      module,
      viewScope,
    });
    return { roleKey, ...updated };
  }

  private async resolveRoles(roleKeys: string[]) {
    const roles = await this.prisma.role.findMany({ where: { key: { in: roleKeys } } });
    const missing = roleKeys.filter((k) => !roles.some((r) => r.key === k));
    if (missing.length) {
      throw new BadRequestException(`ไม่พบบทบาท: ${missing.join(', ')}`);
    }
    return roles;
  }

  async create(dto: CreateUserDto, actor: AuthUser, via = 'ui') {
    const roles = await this.resolveRoles(dto.roleKeys);
    try {
      const user = await this.prisma.user.create({
        data: {
          email: dto.email.toLowerCase(),
          name: dto.name,
          passwordHash: await bcrypt.hash(dto.password, 10),
          roleAssignments: { create: roles.map((r) => ({ roleId: r.id })) },
        },
        select: USER_SELECT,
      });
      await this.audit(actor, via, 'create', user.id, { email: user.email, roles: dto.roleKeys });
      return toDto(user);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`มีผู้ใช้อีเมล ${dto.email} อยู่แล้ว`);
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateUserDto, actor: AuthUser, via = 'ui') {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('ไม่พบผู้ใช้');

    // กัน admin ระงับบัญชีตัวเอง (จะล็อกตัวเองออกจากระบบ)
    if (dto.status === 'suspended' && id === actor.id) {
      throw new BadRequestException('ระงับบัญชีของตัวเองไม่ได้');
    }

    const roles = dto.roleKeys ? await this.resolveRoles(dto.roleKeys) : null;

    // แก้อีเมลได้ (CEO) — normalize เป็นตัวเล็ก + กันชนกับบัญชีอื่น
    let email: string | undefined;
    if (dto.email !== undefined) {
      email = dto.email.trim().toLowerCase();
      if (email !== existing.email) {
        const taken = await this.prisma.user.findUnique({ where: { email } });
        if (taken && taken.id !== id) throw new ConflictException('อีเมลนี้ถูกใช้งานแล้ว');
      } else {
        email = undefined;
      }
    }

    const user = await this.prisma.$transaction(async (tx) => {
      if (roles) {
        await tx.roleAssignment.deleteMany({ where: { userId: id } });
        await tx.roleAssignment.createMany({
          data: roles.map((r) => ({ userId: id, roleId: r.id })),
        });
      }
      const updated = await tx.user.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(email !== undefined ? { email } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.newPassword ? { passwordHash: await bcrypt.hash(dto.newPassword, 10) } : {}),
        },
        select: USER_SELECT,
      });
      // ระงับบัญชีหรือรีเซ็ตรหัส → ตัด session เดิมทั้งหมด
      if (dto.status === 'suspended' || dto.newPassword) {
        await tx.refreshToken.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      return updated;
    });

    await this.audit(actor, via, 'update', id, {
      fields: Object.keys(dto),
      ...(dto.status ? { status: dto.status } : {}),
      ...(dto.roleKeys ? { roles: dto.roleKeys } : {}),
    });
    return toDto(user);
  }

  // ── Teams (viewScope 'team' — สมาชิกทีมเดียวกันเห็นงานกัน) ──

  private static readonly TEAM_SELECT = {
    id: true,
    name: true,
    status: true,
    createdAt: true,
    updatedAt: true,
  } satisfies Prisma.TeamSelect;

  /** รายชื่อทีมทั้งหมด + จำนวน/รายชื่อสมาชิก (สำหรับหน้า Users & Roles) */
  async listTeams() {
    const teams = await this.prisma.team.findMany({
      select: { ...UsersService.TEAM_SELECT, members: { select: { userId: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const userIds = [...new Set(teams.flatMap((t) => t.members.map((m) => m.userId)))];
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
    const userById = new Map(users.map((u) => [u.id, u]));
    return teams.map(({ members, ...t }) => ({
      ...t,
      memberCount: members.length,
      members: members
        .map((m) => userById.get(m.userId))
        .filter((u): u is NonNullable<typeof u> => !!u),
    }));
  }

  async createTeam(name: string, actor: AuthUser, via = 'ui') {
    const team = await this.prisma.team.create({
      data: { name: name.trim() },
      select: UsersService.TEAM_SELECT,
    });
    await this.auditTeam(actor, via, 'create_team', team.id, { name: team.name });
    return { ...team, memberCount: 0, members: [] };
  }

  async updateTeam(
    id: string,
    dto: { name?: string; status?: string },
    actor: AuthUser,
    via = 'ui',
  ) {
    const existing = await this.prisma.team.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('ไม่พบทีม');
    const team = await this.prisma.team.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
      select: { ...UsersService.TEAM_SELECT, _count: { select: { members: true } } },
    });
    await this.auditTeam(actor, via, 'update_team', id, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
    });
    const { _count, ...rest } = team;
    return { ...rest, memberCount: _count.members };
  }

  /** hard delete — TeamMember ถูกลบตาม cascade */
  async deleteTeam(id: string, actor: AuthUser, via = 'ui') {
    const existing = await this.prisma.team.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('ไม่พบทีม');
    await this.prisma.team.delete({ where: { id } });
    await this.auditTeam(actor, via, 'delete_team', id, { name: existing.name });
    return { ok: true };
  }

  /** replace-set สมาชิกทั้งชุด — validate ว่า user ทุกคนมีอยู่จริง */
  async setTeamMembers(id: string, userIds: string[], actor: AuthUser, via = 'ui') {
    const team = await this.prisma.team.findUnique({ where: { id } });
    if (!team) throw new NotFoundException('ไม่พบทีม');

    const unique = [...new Set(userIds)];
    if (unique.length) {
      const found = await this.prisma.user.findMany({
        where: { id: { in: unique } },
        select: { id: true },
      });
      const missing = unique.filter((uid) => !found.some((u) => u.id === uid));
      if (missing.length) {
        throw new BadRequestException(`ไม่พบผู้ใช้: ${missing.join(', ')}`);
      }
    }

    await this.prisma.$transaction([
      this.prisma.teamMember.deleteMany({ where: { teamId: id } }),
      ...(unique.length
        ? [this.prisma.teamMember.createMany({ data: unique.map((uid) => ({ teamId: id, userId: uid })) })]
        : []),
    ]);
    await this.auditTeam(actor, via, 'set_team_members', id, {
      userIds: unique,
      count: unique.length,
    });

    const users = unique.length
      ? await this.prisma.user.findMany({
          where: { id: { in: unique } },
          select: { id: true, name: true, email: true },
        })
      : [];
    return { teamId: id, memberCount: users.length, members: users };
  }

  private auditTeam(actor: AuthUser, via: string, action: string, entityId: string, meta: object) {
    return this.prisma.auditLog.create({
      data: {
        actorId: actor.id,
        via,
        action,
        entityType: 'team',
        entityId,
        meta: meta as Prisma.InputJsonValue,
      },
    });
  }

  private audit(actor: AuthUser, via: string, action: string, entityId: string, meta: object) {
    return this.prisma.auditLog.create({
      data: {
        actorId: actor.id,
        via,
        action,
        entityType: 'user',
        entityId,
        meta: meta as Prisma.InputJsonValue,
      },
    });
  }
}
