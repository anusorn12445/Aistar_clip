import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/current-user.decorator';
import { UpsertGoalsDto } from './dto/upsert-goals.dto';
import {
  ALL_ENTITY_TYPES,
  currentPeriod,
  ENTITY_TO_METRIC,
  METRIC_AUDIT,
  METRIC_KEYS,
  Period,
} from './kpi.constants';

export interface PerUserActual {
  userId: string;
  name: string;
  actual: number;
}

export interface EnrichedGoal {
  id: string;
  roleKey: string | null;
  metric: string;
  label: string;
  icon: string;
  period: string;
  target: number;
  active: boolean;
  memberCount: number;
  teamTarget: number;
  teamActual: number;
  perUser: PerUserActual[];
}

@Injectable()
export class KpiService {
  constructor(private prisma: PrismaService) {}

  // ── รายชื่อ userId ที่ถือ roleKey นี้ (+ ชื่อ) ──
  private async roleMembers(roleKey: string): Promise<{ id: string; name: string }[]> {
    const assignments = await this.prisma.roleAssignment.findMany({
      where: { role: { key: roleKey } },
      select: { user: { select: { id: true, name: true } } },
    });
    // dedupe (user อาจถูก assign ซ้ำไม่ได้เพราะ PK แต่กันไว้)
    const byId = new Map<string, { id: string; name: string }>();
    for (const a of assignments) byId.set(a.user.id, a.user);
    return [...byId.values()];
  }

  /**
   * นับ create ต่อ (metric, userId) ในช่วง period เดียว ด้วย groupBy รอบเดียว
   * คืน Map<metricKey, Map<userId, count>>
   * (public — AssignmentService ใช้คำนวณ actuals รายคนใน assignment-summary)
   */
  async actualsFor(
    userIds: string[],
    period: Period,
  ): Promise<Map<string, Map<string, number>>> {
    const result = new Map<string, Map<string, number>>();
    for (const m of METRIC_KEYS) result.set(m, new Map());
    if (userIds.length === 0) return result;

    const { start, end } = currentPeriod(period);
    const grouped = await this.prisma.auditLog.groupBy({
      by: ['actorId', 'entityType'],
      where: {
        action: 'create',
        entityType: { in: ALL_ENTITY_TYPES },
        actorId: { in: userIds },
        createdAt: { gte: start, lt: end },
      },
      _count: { _all: true },
    });

    for (const g of grouped) {
      if (!g.actorId || !g.entityType) continue;
      const metric = ENTITY_TO_METRIC[g.entityType];
      if (!metric) continue;
      const perUser = result.get(metric)!;
      perUser.set(g.actorId, (perUser.get(g.actorId) ?? 0) + g._count._all);
    }
    return result;
  }

  /**
   * GET /kpi/goals?roleKey=creator
   * เป้าหมายของ role + actuals ช่วงปัจจุบัน (teamActual / perUser / teamTarget)
   */
  async goalsForRole(roleKey: string): Promise<{ roleKey: string; goals: EnrichedGoal[] }> {
    const role = await this.prisma.role.findUnique({ where: { key: roleKey } });
    if (!role) {
      // unknown role → คืน goals ว่าง (ไม่ throw เพื่อให้ UI degrade ได้)
      return { roleKey, goals: [] };
    }

    const [goals, members] = await Promise.all([
      this.prisma.kpiGoal.findMany({
        where: { scope: 'role', roleKey, userId: null },
        orderBy: { createdAt: 'asc' },
      }),
      this.roleMembers(roleKey),
    ]);
    const memberIds = members.map((m) => m.id);
    const nameById = new Map(members.map((m) => [m.id, m.name]));

    // คำนวณ actuals ครั้งเดียวต่อ period ที่ปรากฏใน goals
    const neededPeriods = [...new Set(goals.map((g) => g.period as Period))];
    const actualsByPeriod = new Map<Period, Map<string, Map<string, number>>>();
    await Promise.all(
      neededPeriods.map(async (p) => actualsByPeriod.set(p, await this.actualsFor(memberIds, p))),
    );

    const enriched: EnrichedGoal[] = goals.map((g) => {
      const perUserCounts =
        actualsByPeriod.get(g.period as Period)?.get(g.metric) ?? new Map<string, number>();
      const perUser: PerUserActual[] = members
        .map((m) => ({ userId: m.id, name: m.name, actual: perUserCounts.get(m.id) ?? 0 }))
        .sort((a, b) => b.actual - a.actual || a.name.localeCompare(b.name, 'th'));
      const teamActual = perUser.reduce((s, u) => s + u.actual, 0);
      const def = METRIC_AUDIT[g.metric];
      return {
        id: g.id,
        roleKey: g.roleKey,
        metric: g.metric,
        label: def?.label ?? g.metric,
        icon: def?.icon ?? '🎯',
        period: g.period,
        target: g.target,
        active: g.active,
        memberCount: members.length,
        teamTarget: g.target * members.length,
        teamActual,
        perUser,
      };
    });

    return { roleKey, goals: enriched };
  }

  /**
   * GET /kpi/goals?scope=user&userId= — เป้าหมาย scope 'user' ของคนคนเดียว + actual ปัจจุบัน
   * unknown user → goals ว่าง (degrade แบบเดียวกับ goalsForRole)
   */
  async goalsForUser(userId: string): Promise<{
    scope: 'user';
    userId: string;
    name: string | null;
    goals: {
      id: string;
      metric: string;
      label: string;
      icon: string;
      period: string;
      target: number;
      active: boolean;
      actual: number;
    }[];
  }> {
    const userRow = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true },
    });
    if (!userRow) return { scope: 'user', userId, name: null, goals: [] };

    const goals = await this.prisma.kpiGoal.findMany({
      where: { scope: 'user', userId },
      orderBy: { createdAt: 'asc' },
    });

    const neededPeriods = [...new Set(goals.map((g) => g.period as Period))];
    const actualsByPeriod = new Map<Period, Map<string, Map<string, number>>>();
    await Promise.all(
      neededPeriods.map(async (p) => actualsByPeriod.set(p, await this.actualsFor([userId], p))),
    );

    return {
      scope: 'user',
      userId,
      name: userRow.name,
      goals: goals.map((g) => {
        const def = METRIC_AUDIT[g.metric];
        return {
          id: g.id,
          metric: g.metric,
          label: def?.label ?? g.metric,
          icon: def?.icon ?? '🎯',
          period: g.period,
          target: g.target,
          active: g.active,
          actual:
            actualsByPeriod.get(g.period as Period)?.get(g.metric)?.get(userId) ?? 0,
        };
      }),
    };
  }

  /**
   * PUT /kpi/goals — upsert ชุดเป้าหมาย (replace-set ต่อ key metric+period, ไม่ลบ key ที่ไม่ได้ส่ง)
   * scope 'role' (default) หรือ 'user' (เป้ารายคน override เป้า role)
   */
  async upsertGoals(dto: UpsertGoalsDto, user: AuthUser) {
    // กันซ้ำ metric+period ภายใน payload เดียวกัน
    const seen = new Set<string>();
    for (const g of dto.goals) {
      const key = `${g.metric}::${g.period}`;
      if (seen.has(key)) {
        throw new BadRequestException(`มีเป้าหมายซ้ำ: ${g.metric} (${g.period})`);
      }
      seen.add(key);
    }

    if (dto.scope === 'user') return this.upsertUserGoals(dto, user);

    const roleKey = dto.roleKey!; // validator บังคับเมื่อ scope != 'user'
    const role = await this.prisma.role.findUnique({ where: { key: roleKey } });
    if (!role) throw new NotFoundException('ไม่พบบทบาทนี้');

    // upsert แบบ manual (findFirst → update/create) — เลี่ยงปัญหา Postgres มอง NULL
    // ใน unique index เป็นค่าไม่ซ้ำกัน (userId = null สำหรับ role-scope ทั้งหมด)
    const existing = await this.prisma.kpiGoal.findMany({
      where: { scope: 'role', roleKey, userId: null },
      select: { id: true, metric: true, period: true },
    });
    const idByKey = new Map(existing.map((e) => [`${e.metric}::${e.period}`, e.id]));

    await this.prisma.$transaction(
      dto.goals.map((g) => {
        const id = idByKey.get(`${g.metric}::${g.period}`);
        if (id) {
          return this.prisma.kpiGoal.update({
            where: { id },
            data: { target: g.target, active: g.active ?? true },
          });
        }
        return this.prisma.kpiGoal.create({
          data: {
            scope: 'role',
            roleKey,
            userId: null,
            metric: g.metric,
            period: g.period,
            target: g.target,
            active: g.active ?? true,
            createdBy: user.id,
          },
        });
      }),
    );

    await this.audit(user, 'upsert', {
      roleKey,
      goals: dto.goals.map((g) => ({
        metric: g.metric,
        period: g.period,
        target: g.target,
        active: g.active ?? true,
      })),
    });

    return this.goalsForRole(roleKey);
  }

  /**
   * PUT /kpi/goals scope='user' — เป้ารายคน (override เป้าของ role ใน assignment-summary)
   * semantics เดียวกับ role: upsert ต่อ key (metric, period), idempotent
   */
  private async upsertUserGoals(dto: UpsertGoalsDto, user: AuthUser) {
    const userId = dto.userId!; // validator บังคับเมื่อ scope='user'
    const target = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!target) throw new BadRequestException('ไม่พบผู้ใช้นี้');

    const existing = await this.prisma.kpiGoal.findMany({
      where: { scope: 'user', userId },
      select: { id: true, metric: true, period: true },
    });
    const idByKey = new Map(existing.map((e) => [`${e.metric}::${e.period}`, e.id]));

    await this.prisma.$transaction(
      dto.goals.map((g) => {
        const id = idByKey.get(`${g.metric}::${g.period}`);
        if (id) {
          return this.prisma.kpiGoal.update({
            where: { id },
            data: { target: g.target, active: g.active ?? true },
          });
        }
        return this.prisma.kpiGoal.create({
          data: {
            scope: 'user',
            roleKey: null,
            userId,
            metric: g.metric,
            period: g.period,
            target: g.target,
            active: g.active ?? true,
            createdBy: user.id,
          },
        });
      }),
    );

    await this.audit(user, 'upsert', {
      scope: 'user',
      userId,
      goals: dto.goals.map((g) => ({
        metric: g.metric,
        period: g.period,
        target: g.target,
        active: g.active ?? true,
      })),
    });

    return this.goalsForUser(userId);
  }

  /**
   * GET /kpi/me — เป้าหมายที่ใช้กับ user คนนี้ (union ทุก role ที่ถือ) + actual ของตัวเอง
   * คืน [] ถ้าไม่มี active goal ในบทบาทของ user
   */
  async myGoals(user: AuthUser): Promise<
    {
      metric: string;
      label: string;
      icon: string;
      period: string;
      target: number;
      actual: number;
    }[]
  > {
    if (!user.roles?.length) return [];

    const goals = await this.prisma.kpiGoal.findMany({
      where: { scope: 'role', userId: null, active: true, roleKey: { in: user.roles } },
    });
    if (goals.length === 0) return [];

    // dedupe ตาม (metric, period) — ถ้าหลาย role กำหนดซ้ำ เลือก target สูงสุด
    const byKey = new Map<string, { metric: string; period: Period; target: number }>();
    for (const g of goals) {
      const key = `${g.metric}::${g.period}`;
      const existing = byKey.get(key);
      if (!existing || g.target > existing.target) {
        byKey.set(key, { metric: g.metric, period: g.period as Period, target: g.target });
      }
    }

    // actual ของ user เอง ต่อ period ที่ต้องใช้
    const neededPeriods = [...new Set([...byKey.values()].map((v) => v.period))];
    const actualsByPeriod = new Map<Period, Map<string, Map<string, number>>>();
    await Promise.all(
      neededPeriods.map(async (p) =>
        actualsByPeriod.set(p, await this.actualsFor([user.id], p)),
      ),
    );

    const rows = [...byKey.values()].map((v) => {
      const def = METRIC_AUDIT[v.metric];
      const actual =
        actualsByPeriod.get(v.period)?.get(v.metric)?.get(user.id) ?? 0;
      return {
        metric: v.metric,
        label: def?.label ?? v.metric,
        icon: def?.icon ?? '🎯',
        period: v.period,
        target: v.target,
        actual,
      };
    });

    // เรียง: weekly ก่อน monthly แล้วตามลำดับ metric ที่กำหนดไว้
    const periodOrder: Record<string, number> = { weekly: 0, monthly: 1 };
    const metricOrder = new Map(METRIC_KEYS.map((k, i) => [k, i]));
    rows.sort(
      (a, b) =>
        (periodOrder[a.period] ?? 9) - (periodOrder[b.period] ?? 9) ||
        (metricOrder.get(a.metric) ?? 99) - (metricOrder.get(b.metric) ?? 99),
    );
    return rows;
  }

  private audit(user: AuthUser, action: string, meta: object) {
    return this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        via: 'ui',
        action,
        entityType: 'kpi_goal',
        // entityId เป็น uuid เท่านั้น — roleKey เก็บใน meta
        entityId: null,
        meta: meta as Prisma.InputJsonValue,
      },
    });
  }
}
