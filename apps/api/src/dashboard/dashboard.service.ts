import { Injectable } from '@nestjs/common';
import { JobStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/current-user.decorator';
import { ScopeService } from '../auth/scope.service';

// ── helpers วันเวลา (bucket แบบ UTC พอสำหรับ dashboard ภายใน) ──────────
function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function startOfWeek(d: Date): Date {
  // สัปดาห์เริ่มวันจันทร์
  const x = startOfDay(d);
  const day = (x.getDay() + 6) % 7; // จันทร์=0 ... อาทิตย์=6
  x.setDate(x.getDate() - day);
  return x;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function dayKey(d: Date): string {
  // format จาก local components — เลี่ยง .toISOString() (UTC) ที่ทำ bucket เพี้ยนวันในโซนไทย
  const x = startOfDay(d);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

// สถานะ job ที่ยังนับเป็น pipeline ที่ทำเงินได้ (ยังไม่ปิด/ยกเลิก)
const ACTIVE_JOB_STATUSES: JobStatus[] = [
  'inquiry',
  'quoted',
  'confirmed',
  'in_production',
  'internal_qc',
  'revision',
  'approved',
];
// job ที่ถือว่า "ยังไม่เสร็จ" สำหรับเช็ค overdue / due สัปดาห์นี้
const OPEN_JOB_STATUSES: JobStatus[] = [
  'inquiry',
  'quoted',
  'confirmed',
  'in_production',
  'internal_qc',
  'revision',
];

// scope filter ต่อ request — where fragment ของ content/episode ตาม viewScope ของผู้เรียก
// (undefined = scope 'all' → no-op ไม่แตะ query เดิม)
interface ScopeFilters {
  content?: Prisma.ContentItemWhereInput;
  episode?: Prisma.EpisodeWhereInput;
}

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private scope: ScopeService,
  ) {}

  /**
   * row-level viewScope บน dashboard: ตัวเลข/รายการ content+episode กรองตาม scope
   * ('own'/'team') ด้วยนิยามเดียวกับหน้า list — content: owner/reviewer · episode: owner หรือไร้เจ้าของ
   * หมายเหตุ: KPI widgets (เป้าหมายทีม — module kpi) ยังเป็น global เพราะเป้าเป็นของทีมร่วมกัน
   * และตัวเลขเงิน (GMV/pipeline) ยังใช้ FINANCE_ROLES gate เดิม ไม่เกี่ยวกับ viewScope
   */
  private async buildScopeFilters(user: AuthUser): Promise<ScopeFilters> {
    const [contentIds, episodeIds] = await Promise.all([
      this.scope.resolveVisibleUserIds(user, 'content'),
      this.scope.resolveVisibleUserIds(user, 'episode'),
    ]);
    return {
      content: contentIds
        ? { OR: [{ ownerId: { in: contentIds } }, { reviewerId: { in: contentIds } }] }
        : undefined,
      episode: episodeIds
        ? { OR: [{ ownerId: { in: episodeIds } }, { ownerId: null }] }
        : undefined,
    };
  }

  // ยอดเงิน (GMV/รายได้/กำไร) บน dashboard เห็นเฉพาะระดับ CEO เท่านั้น (บอส: "GMV ให้เห็นเฉพาะ CEO")
  private static readonly FINANCE_ROLES = ['admin', 'founder'];
  private financeAllowed(user: AuthUser): boolean {
    return Boolean(user?.roles?.some((r) => DashboardService.FINANCE_ROLES.includes(r)));
  }

  async overview(user: AuthUser) {
    const financeVisible = this.financeAllowed(user);

    const now = new Date();
    const todayStart = startOfDay(now);
    const tomorrowStart = addDays(todayStart, 1);
    const weekStart = startOfWeek(now);
    const weekEnd = addDays(weekStart, 7);
    const in7days = addDays(now, 7);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const last7Start = addDays(todayStart, -6);

    // row-level viewScope (own/team) — กรองตัวเลข/รายการ content+episode เหมือนหน้า list
    const scopeFilters = await this.buildScopeFilters(user);

    const [kpis, actionNeeded, pipeline, week, activity] = await Promise.all([
      this.buildKpis({ now, todayStart, tomorrowStart, weekStart, weekEnd, monthStart, nextMonthStart, prevMonthStart, financeVisible }, scopeFilters),
      this.buildActionNeeded(now, scopeFilters),
      this.buildPipeline(scopeFilters),
      this.buildWeek(now, in7days, scopeFilters),
      this.buildActivity(user),
    ]);

    const performance = financeVisible
      ? await this.buildPerformance({ last7Start, monthStart, nextMonthStart })
      : undefined;

    return { financeVisible, kpis, actionNeeded, pipeline, performance, week, activity };
  }

  // ── กลุ่ม 1: KPI ─────────────────────────────────────────────
  private async buildKpis(ctx: {
    now: Date; todayStart: Date; tomorrowStart: Date; weekStart: Date; weekEnd: Date;
    monthStart: Date; nextMonthStart: Date; prevMonthStart: Date; financeVisible: boolean;
  }, scope: ScopeFilters) {
    const { todayStart, tomorrowStart, weekStart, weekEnd, monthStart, nextMonthStart, prevMonthStart, financeVisible } = ctx;

    const [charGroups, jobsInProduction, contentThisWeek, liveToday] = await Promise.all([
      this.prisma.character.groupBy({
        by: ['status'],
        where: { archivedAt: null },
        _count: { _all: true },
      }),
      this.prisma.job.count({ where: { archivedAt: null, status: 'in_production' } }),
      this.prisma.contentItem.count({
        where: {
          archivedAt: null,
          scheduledAt: { gte: weekStart, lt: weekEnd },
          ...(scope.content ? { AND: [scope.content] } : {}),
        },
      }),
      this.prisma.liveSession.count({
        where: { scheduledAt: { gte: todayStart, lt: tomorrowStart }, status: { in: ['scheduled', 'live'] } },
      }),
    ]);

    let charactersTotal = 0;
    let charactersReady = 0;
    for (const g of charGroups) {
      charactersTotal += g._count._all;
      if (g.status === 'approved' || g.status === 'production_ready') charactersReady += g._count._all;
    }

    const kpis: Record<string, unknown> = {
      charactersReady,
      charactersTotal,
      jobsInProduction,
      contentThisWeek,
      liveToday,
    };

    if (financeVisible) {
      const [pipelineAgg, gmvThis, gmvPrev] = await Promise.all([
        this.prisma.job.aggregate({
          _sum: { quotePrice: true },
          where: { archivedAt: null, status: { in: ACTIVE_JOB_STATUSES } },
        }),
        this.prisma.contentPerformance.aggregate({
          _sum: { gmv: true },
          where: { recordedAt: { gte: monthStart, lt: nextMonthStart } },
        }),
        this.prisma.contentPerformance.aggregate({
          _sum: { gmv: true },
          where: { recordedAt: { gte: prevMonthStart, lt: monthStart } },
        }),
      ]);
      const gmvThisMonth = Number(gmvThis._sum.gmv ?? 0);
      const gmvPrevMonth = Number(gmvPrev._sum.gmv ?? 0);
      kpis.pipelineValue = Number(pipelineAgg._sum.quotePrice ?? 0);
      kpis.gmvThisMonth = gmvThisMonth;
      kpis.gmvDeltaPct = gmvPrevMonth > 0
        ? Math.round(((gmvThisMonth - gmvPrevMonth) / gmvPrevMonth) * 1000) / 10
        : null;
    }

    return kpis;
  }

  // ── กลุ่ม 2: ต้องรีบจัดการ ───────────────────────────────────
  private async buildActionNeeded(now: Date, scope: ScopeFilters) {
    const contentScoped = scope.content ? { AND: [scope.content] } : {};
    const [
      overdueTasks,
      overdueJobs,
      charApprovals,
      promptApprovals,
      qcPending,
      deliverablesAwaitingClient,
      rightsExpiringSoon,
    ] = await Promise.all([
      this.prisma.task.count({ where: { dueDate: { lt: now }, status: { in: ['todo', 'in_progress', 'blocked'] } } }),
      this.prisma.job.count({
        where: { archivedAt: null, dueDate: { lt: now }, status: { in: OPEN_JOB_STATUSES } },
      }),
      this.prisma.character.count({ where: { archivedAt: null, status: 'internal_review' } }),
      this.prisma.prompt.count({ where: { archivedAt: null, status: 'internal_review' } }),
      // QC ค้างตรวจ = คอนเทนต์ที่ส่งเข้ารีวิว (คิว QC ของสายคอนเทนต์) — เป็นเจ้าของ content internal_review แต่ผู้เดียว
      this.prisma.contentItem.count({
        where: { archivedAt: null, status: 'internal_review', ...contentScoped },
      }),
      this.prisma.jobDeliverable.count({ where: { status: 'submitted' } }),
      // ไม่มี field วันหมดอายุใน rights → นับที่หมดอายุแล้ว หรือ risk สูง
      this.prisma.right.count({ where: { OR: [{ legalStatus: 'expired' }, { riskLevel: 'high' }] } }),
    ]);

    return {
      overdueTasks,
      overdueJobs,
      // อนุมัติ character/prompt (คิว approval สายครีเอทีฟ) — content internal_review นับใน qcPending แล้ว ไม่นับซ้ำ
      pendingApprovals: charApprovals + promptApprovals,
      qcPending,
      deliverablesAwaitingClient,
      rightsExpiringSoon,
    };
  }

  // ── กลุ่ม 3: production pipeline ─────────────────────────────
  private async buildPipeline(scope: ScopeFilters) {
    const [jobs, episodes, content] = await Promise.all([
      this.prisma.job.groupBy({ by: ['status'], where: { archivedAt: null }, _count: { _all: true } }),
      this.prisma.episode.groupBy({
        by: ['status'],
        where: { archivedAt: null, ...(scope.episode ? { AND: [scope.episode] } : {}) },
        _count: { _all: true },
      }),
      this.prisma.contentItem.groupBy({
        by: ['status'],
        where: { archivedAt: null, ...(scope.content ? { AND: [scope.content] } : {}) },
        _count: { _all: true },
      }),
    ]);
    const toMap = (rows: { status: string; _count: { _all: number } }[]) => {
      const m: Record<string, number> = {};
      for (const r of rows) m[r.status] = r._count._all;
      return m;
    };
    return { jobs: toMap(jobs), episodes: toMap(episodes), content: toMap(content) };
  }

  // ── กลุ่ม 4: performance (finance เท่านั้น) ──────────────────
  private async buildPerformance(ctx: { last7Start: Date; monthStart: Date; nextMonthStart: Date }) {
    const { last7Start, monthStart, nextMonthStart } = ctx;

    const dailyRows = await this.prisma.contentPerformance.findMany({
      where: { recordedAt: { gte: last7Start }, gmv: { not: null } },
      select: { recordedAt: true, gmv: true },
    });
    const buckets = new Map<string, number>();
    for (let i = 0; i < 7; i++) buckets.set(dayKey(addDays(last7Start, i)), 0);
    for (const r of dailyRows) {
      const k = dayKey(r.recordedAt);
      if (buckets.has(k)) buckets.set(k, (buckets.get(k) ?? 0) + Number(r.gmv ?? 0));
    }
    const gmvDailyLast7 = [...buckets.entries()].map(([date, gmv]) => ({ date, gmv }));

    // rows เดือนนี้ที่ผูก content — เอาไปกระจาย gmv ต่อ presenter/product
    const monthRows = await this.prisma.contentPerformance.findMany({
      where: { recordedAt: { gte: monthStart, lt: nextMonthStart }, contentItemId: { not: null }, gmv: { not: null } },
      select: { contentItemId: true, gmv: true },
    });
    const gmvByContent = new Map<string, number>();
    for (const r of monthRows) {
      if (!r.contentItemId) continue;
      gmvByContent.set(r.contentItemId, (gmvByContent.get(r.contentItemId) ?? 0) + Number(r.gmv ?? 0));
    }
    const contentIds = [...gmvByContent.keys()];

    const [topPresenters, topProducts] = await Promise.all([
      this.aggregateGmvBy('character', contentIds, gmvByContent),
      this.aggregateGmvBy('product', contentIds, gmvByContent),
    ]);

    return { gmvDailyLast7, topPresenters, topProducts };
  }

  private async aggregateGmvBy(
    kind: 'character' | 'product',
    contentIds: string[],
    gmvByContent: Map<string, number>,
  ): Promise<{ id: string; name: string; gmv: number }[]> {
    if (contentIds.length === 0) return [];

    const totals = new Map<string, number>();
    if (kind === 'character') {
      const links = await this.prisma.contentItemCharacter.findMany({
        where: { contentItemId: { in: contentIds } },
        select: { contentItemId: true, characterId: true },
      });
      for (const l of links) {
        totals.set(l.characterId, (totals.get(l.characterId) ?? 0) + (gmvByContent.get(l.contentItemId) ?? 0));
      }
      // ดึงชื่อ + archivedAt — presenter ตัวเดียวที่มีทั้งตัว active และตัว archive (ชื่อซ้ำ)
      // ต้องรวมเป็นแถวเดียว ไม่งั้น GMV ถูกหั่นเป็นสองแถว ทำให้ Top Presenter ของ CEO เพี้ยน
      const chars = await this.prisma.character.findMany({
        where: { id: { in: [...totals.keys()] } },
        select: { id: true, nameTh: true, archivedAt: true },
      });
      const infoById = new Map(chars.map((c) => [c.id, c]));
      return this.topFromTotals(totals, (id) => {
        const c = infoById.get(id);
        // ตัว active เป็นตัวแทน (archivedAt: null) เมื่อชื่อชนกัน
        return { name: c?.nameTh ?? id, active: c ? c.archivedAt == null : false };
      });
    } else {
      const links = await this.prisma.contentItemProduct.findMany({
        where: { contentItemId: { in: contentIds } },
        select: { contentItemId: true, productId: true },
      });
      for (const l of links) {
        totals.set(l.productId, (totals.get(l.productId) ?? 0) + (gmvByContent.get(l.contentItemId) ?? 0));
      }
      const products = await this.prisma.product.findMany({
        where: { id: { in: [...totals.keys()] } },
        select: { id: true, name: true },
      });
      const nameById = new Map(products.map((p) => [p.id, p.name]));
      return this.topFromTotals(totals, (id) => ({ name: nameById.get(id) ?? id, active: true }));
    }
  }

  // รวมยอดตาม "ชื่อที่แสดง" — presenter/product ชื่อซ้ำ (เช่น ตัว archive vs ตัว active) รวมเป็นแถวเดียว
  // แต่ละแถวพก id (ตัวแทน — ให้ตัว active ชนะเมื่อชื่อชน) ไว้ทำ React key กัน key ชนกัน
  private topFromTotals(
    totals: Map<string, number>,
    resolve: (id: string) => { name: string; active: boolean },
  ) {
    const byName = new Map<string, { id: string; name: string; gmv: number; active: boolean }>();
    for (const [id, gmv] of totals) {
      const { name, active } = resolve(id);
      const cur = byName.get(name);
      if (cur) {
        cur.gmv += gmv;
        // ให้ตัว active เป็น id ตัวแทนของชื่อนี้
        if (active && !cur.active) {
          cur.id = id;
          cur.active = true;
        }
      } else {
        byName.set(name, { id, name, gmv, active });
      }
    }
    return [...byName.values()]
      .map((r) => ({ id: r.id, name: r.name, gmv: Math.round(r.gmv) }))
      .sort((a, b) => b.gmv - a.gmv)
      .slice(0, 5);
  }

  // ── กลุ่ม 5a: สัปดาห์นี้ (7 วันข้างหน้า) ─────────────────────
  private async buildWeek(now: Date, in7days: Date, scope: ScopeFilters) {
    const [contents, lives, jobs] = await Promise.all([
      this.prisma.contentItem.findMany({
        where: {
          archivedAt: null,
          scheduledAt: { gte: now, lte: in7days },
          ...(scope.content ? { AND: [scope.content] } : {}),
        },
        select: { id: true, title: true, scheduledAt: true, status: true },
        orderBy: { scheduledAt: 'asc' },
        take: 20,
      }),
      this.prisma.liveSession.findMany({
        where: { scheduledAt: { gte: now, lte: in7days }, status: { in: ['scheduled', 'live'] } },
        select: { id: true, title: true, scheduledAt: true },
        orderBy: { scheduledAt: 'asc' },
        take: 20,
      }),
      this.prisma.job.findMany({
        where: { archivedAt: null, dueDate: { gte: now, lte: in7days }, status: { in: OPEN_JOB_STATUSES } },
        select: { id: true, title: true, displayCode: true, dueDate: true },
        orderBy: { dueDate: 'asc' },
        take: 20,
      }),
    ]);

    const items = [
      ...contents.map((c) => ({ type: 'content' as const, id: c.id, title: c.title, at: c.scheduledAt!, status: c.status })),
      ...lives.map((l) => ({ type: 'live' as const, id: l.id, title: l.title, at: l.scheduledAt, status: null })),
      ...jobs.map((j) => ({ type: 'job' as const, id: j.id, title: `${j.displayCode} · ${j.title}`, at: j.dueDate!, status: null })),
    ];
    items.sort((a, b) => a.at.getTime() - b.at.getTime());
    return items.slice(0, 15);
  }

  // ── กลุ่ม 5b: กิจกรรมล่าสุด (audit log) — กรองตาม viewScope ของผู้เรียก ──────
  // own/team เห็นเฉพาะ action ของ userId ในชุดที่มองเห็น (scope 'all' → ไม่กรอง)
  private async buildActivity(user: AuthUser) {
    const visibleIds = await this.scope.resolveVisibleUserIds(user, 'content');
    const rows = await this.prisma.auditLog.findMany({
      where: visibleIds ? { actorId: { in: visibleIds } } : {},
      orderBy: { createdAt: 'desc' },
      take: 12,
      select: {
        id: true, action: true, entityType: true, entityId: true, via: true, createdAt: true,
        actor: { select: { name: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      via: r.via,
      actorName: r.actor?.name ?? null,
      createdAt: r.createdAt,
    }));
  }
}
