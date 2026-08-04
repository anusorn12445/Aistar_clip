import { Injectable } from '@nestjs/common';
import { ContentStatus, EpisodeStatus, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { KpiService } from './kpi.service';
import { currentPeriod, METRIC_AUDIT, METRIC_KEYS, Period } from './kpi.constants';

// ─── Assignment Hub — สรุปมอบหมายงาน + KPI รายคน (มุมมองหัวหน้า/CEO) ─────
// เป้า effective ต่อคน: user-scope goal (ถ้ามี+active) > role-scope goal ของ role
// ที่ถือ (หลาย role กำหนดซ้ำ → เอา target สูงสุด แบบเดียวกับ myGoals)

export type TargetStatus = 'on_track' | 'behind' | 'done';

export interface MemberTarget {
  metric: string;
  label: string;
  icon: string;
  target: number;
  source: 'user' | 'role';
  actual: number;
  progressPct: number; // ปัดเป็นจำนวนเต็ม (ไม่ cap — UI cap ความกว้าง bar เอง)
  status: TargetStatus;
}

export interface MemberWorkload {
  tasks: number; // Task ที่ assign ให้ (status != done)
  imageRequests: number; // งานภาพค้าง (open/in_progress/review/revision)
  episodes: number; // อีพีที่ own (ยังไม่ published/archived)
  contentItems: number; // คอนเทนต์ที่ own (idea → internal_review)
}

export interface AssignmentMember {
  userId: string;
  name: string;
  email: string;
  roles: { key: string; name: string }[];
  teams: { id: string; name: string }[];
  targets: MemberTarget[];
  workload: MemberWorkload;
  totals: { targets: number; done: number; onTrack: number; behind: number };
}

export interface AssignmentSummary {
  period: Period;
  from: Date;
  to: Date;
  elapsedFraction: number; // สัดส่วนเวลาที่ผ่านไปของ period (0..1)
  members: AssignmentMember[];
}

// สถานะ "งานค้าง" ต่อชนิดงาน — นิยาม workload กลางที่เดียว
const OPEN_TASK_STATUSES: TaskStatus[] = ['todo', 'in_progress', 'blocked']; // ทุกอย่างที่ไม่ done
const OPEN_IMAGE_REQUEST_STATUSES = ['open', 'in_progress', 'review', 'revision']; // ไม่รวม approved/cancelled
const CLOSED_EPISODE_STATUSES: EpisodeStatus[] = ['published', 'archived'];
const OPEN_CONTENT_STATUSES: ContentStatus[] = ['idea', 'brief', 'in_production', 'internal_review'];

@Injectable()
export class AssignmentService {
  constructor(
    private prisma: PrismaService,
    private kpi: KpiService,
  ) {}

  async summary(period: Period, teamId?: string, roleKey?: string): Promise<AssignmentSummary> {
    const { start, end } = currentPeriod(period);
    const now = Date.now();
    const elapsedFraction = Math.min(
      1,
      Math.max(0, (now - start.getTime()) / (end.getTime() - start.getTime())),
    );

    // ── 1) users ในขอบเขต: สมาชิกทีม (เมื่อระบุ teamId) / active users ทั้งหมด · กรอง roleKey ได้ ──
    let teamUserIds: string[] | null = null;
    if (teamId) {
      const members = await this.prisma.teamMember.findMany({
        where: { teamId },
        select: { userId: true },
      });
      teamUserIds = members.map((m) => m.userId);
    }

    const users = await this.prisma.user.findMany({
      where: {
        status: 'active',
        ...(teamUserIds ? { id: { in: teamUserIds } } : {}),
        ...(roleKey ? { roleAssignments: { some: { role: { key: roleKey } } } } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        roleAssignments: { select: { role: { select: { key: true, name: true } } } },
      },
      orderBy: { name: 'asc' },
    });
    const userIds = users.map((u) => u.id);

    if (userIds.length === 0) {
      return { period, from: start, to: end, elapsedFraction, members: [] };
    }

    const roleKeys = [...new Set(users.flatMap((u) => u.roleAssignments.map((r) => r.role.key)))];

    // ── 2) goals + actuals + memberships + workload — query เป็น batch ทั้งหมด ไม่มี N+1 ──
    const [userGoals, roleGoals, memberships, actuals, taskGroups, imgGroups, epGroups, contentGroups] =
      await Promise.all([
        this.prisma.kpiGoal.findMany({
          where: { scope: 'user', userId: { in: userIds }, period, active: true },
        }),
        roleKeys.length
          ? this.prisma.kpiGoal.findMany({
              where: { scope: 'role', userId: null, roleKey: { in: roleKeys }, period, active: true },
            })
          : Promise.resolve([]),
        this.prisma.teamMember.findMany({
          where: { userId: { in: userIds }, team: { status: 'active' } },
          select: { userId: true, team: { select: { id: true, name: true } } },
        }),
        this.kpi.actualsFor(userIds, period),
        this.prisma.task.groupBy({
          by: ['assigneeId'],
          where: { assigneeId: { in: userIds }, status: { in: OPEN_TASK_STATUSES } },
          _count: { _all: true },
        }),
        this.prisma.imageRequest.groupBy({
          by: ['assigneeId'],
          where: { assigneeId: { in: userIds }, status: { in: OPEN_IMAGE_REQUEST_STATUSES } },
          _count: { _all: true },
        }),
        this.prisma.episode.groupBy({
          by: ['ownerId'],
          where: {
            ownerId: { in: userIds },
            status: { notIn: CLOSED_EPISODE_STATUSES },
            archivedAt: null,
          },
          _count: { _all: true },
        }),
        this.prisma.contentItem.groupBy({
          by: ['ownerId'],
          where: {
            ownerId: { in: userIds },
            status: { in: OPEN_CONTENT_STATUSES },
            archivedAt: null,
          },
          _count: { _all: true },
        }),
      ]);

    // lookup maps
    const userGoalByKey = new Map<string, { target: number }>(); // `${userId}::${metric}`
    for (const g of userGoals) {
      if (g.userId) userGoalByKey.set(`${g.userId}::${g.metric}`, { target: g.target });
    }
    // role goal ต่อ (roleKey, metric) — ถ้า user ถือหลาย role เอา target สูงสุด (mirror myGoals)
    const roleGoalByKey = new Map<string, number>(); // `${roleKey}::${metric}`
    for (const g of roleGoals) {
      if (!g.roleKey) continue;
      const key = `${g.roleKey}::${g.metric}`;
      const prev = roleGoalByKey.get(key);
      if (prev === undefined || g.target > prev) roleGoalByKey.set(key, g.target);
    }

    const teamsByUser = new Map<string, { id: string; name: string }[]>();
    for (const m of memberships) {
      const list = teamsByUser.get(m.userId) ?? [];
      list.push(m.team);
      teamsByUser.set(m.userId, list);
    }

    const countMap = (
      groups: { id: string | null; count: number }[],
    ): Map<string, number> => {
      const map = new Map<string, number>();
      for (const g of groups) if (g.id) map.set(g.id, g.count);
      return map;
    };
    const taskCount = countMap(taskGroups.map((g) => ({ id: g.assigneeId, count: g._count._all })));
    const imgCount = countMap(imgGroups.map((g) => ({ id: g.assigneeId, count: g._count._all })));
    const epCount = countMap(epGroups.map((g) => ({ id: g.ownerId, count: g._count._all })));
    const contentCount = countMap(
      contentGroups.map((g) => ({ id: g.ownerId, count: g._count._all })),
    );

    // ── 3) ประกอบรายคน — effective target + progress + status + workload ──
    const members: AssignmentMember[] = users.map((u) => {
      const myRoleKeys = u.roleAssignments.map((r) => r.role.key);

      const targets: MemberTarget[] = [];
      for (const metric of METRIC_KEYS) {
        // user-scope ก่อน (active เท่านั้น — filter แล้วใน query) → role-scope สูงสุดของ role ที่ถือ
        const userGoal = userGoalByKey.get(`${u.id}::${metric}`);
        let target: number | undefined;
        let source: 'user' | 'role' = 'role';
        if (userGoal) {
          target = userGoal.target;
          source = 'user';
        } else {
          for (const rk of myRoleKeys) {
            const t = roleGoalByKey.get(`${rk}::${metric}`);
            if (t !== undefined && (target === undefined || t > target)) target = t;
          }
        }
        if (target === undefined) continue; // metric นี้ไม่มีเป้าสำหรับคนนี้

        const actual = actuals.get(metric)?.get(u.id) ?? 0;
        // target 0 (ตั้งไว้แต่ปิดเป้า) → ถือว่า done เสมอ กัน div-by-zero
        const pct = target > 0 ? (actual / target) * 100 : 100;
        const status: TargetStatus =
          pct >= 100 ? 'done' : pct >= elapsedFraction * 100 ? 'on_track' : 'behind';
        const def = METRIC_AUDIT[metric];
        targets.push({
          metric,
          label: def?.label ?? metric,
          icon: def?.icon ?? '🎯',
          target,
          source,
          actual,
          progressPct: Math.round(pct),
          status,
        });
      }

      const totals = {
        targets: targets.length,
        done: targets.filter((t) => t.status === 'done').length,
        onTrack: targets.filter((t) => t.status === 'on_track').length,
        behind: targets.filter((t) => t.status === 'behind').length,
      };

      return {
        userId: u.id,
        name: u.name,
        email: u.email,
        roles: u.roleAssignments.map((r) => r.role),
        teams: teamsByUser.get(u.id) ?? [],
        targets,
        workload: {
          tasks: taskCount.get(u.id) ?? 0,
          imageRequests: imgCount.get(u.id) ?? 0,
          episodes: epCount.get(u.id) ?? 0,
          contentItems: contentCount.get(u.id) ?? 0,
        },
        totals,
      };
    });

    return { period, from: start, to: end, elapsedFraction, members };
  }
}
