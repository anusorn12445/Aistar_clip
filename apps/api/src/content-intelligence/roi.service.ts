import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/current-user.decorator';
import { ScopeService } from '../auth/scope.service';
import { RoiQueryDto } from './dto/roi.dto';

// ─── ROI ต่อคลิป — ปิดวง "ต้นทุน AI (AiUsageLog) ↔ ผลงานคอนเทนต์ (ContentPerformance)" ──
//
// Deterministic ล้วน (ไม่มี AI):
//
// การคิดต้นทุน (attribution):
// - cost        = Σ costBaht ของ AiUsageLog ที่ผูก "ตรงตัว" กับคลิป (AiUsageLink.entityType='content')
// - episodeCost = Σ costBaht ของ log ที่ผูกกับอีพีของคลิป (entityType='episode') + ช็อตของอีพีนั้น
//                 (entityType='shot') — แสดงแยก ไม่รวมเข้า cost ต่อคลิป เพราะเป็นต้นทุนที่
//                 "แชร์กัน" ระหว่างทุกคอนเทนต์ของอีพีเดียวกัน (หารเฉลี่ยไม่ได้อย่างยุติธรรม)
//
// การรวมผลงาน (roll-up) — สอดคล้องกับ analytics.service.ts (computeAggregates):
// - views / gmv / revenue = "ผลรวม (sum)" ของทุก snapshot ของคลิปในช่วงเวลา
//   (analytics ก็ sum gmv ข้าม snapshot แบบเดียวกัน — เลือก sum เพื่อให้เลขสองหน้าตรงกัน)
//
// การกรองช่วงเวลา (from/to) กรอง "ทั้งสองฝั่ง": usedAt ของ log และ recordedAt ของ performance
//
// CEO gating (เหมือน dashboard/ai-usage FINANCE_ROLES):
// - gmv / revenue / profit / roi (+ totalGmv / totalProfit) เห็นเฉพาะ admin/founder
//   non-CEO ได้ค่า null และ ceo:false — ฝั่งต้นทุน/วิวเห็นได้ทุกคนที่มี content V
//
// เงื่อนไขรวมแถว: ต้องมี cost > 0 หรือมี performance snapshot ในช่วง (ตัดคลิป idle ทิ้ง)
// เรียง: CEO → profit มาก→น้อย, non-CEO → views มาก→น้อย · cap 200 แถว (totals คิดจากทุกแถวก่อน cap)

const MAX_ROWS = 200;
const FINANCE_ROLES = ['admin', 'founder'];

interface ItemRoi {
  contentItemId: string;
  title: string;
  platform: string;
  sourceType: string | null;
  cost: number;
  episodeCost: number;
  views: number;
  costPerView: number | null;
  gmv: number;
  revenue: number;
  profit: number;
  roi: number | null;
}

@Injectable()
export class RoiService {
  constructor(
    private prisma: PrismaService,
    private scope: ScopeService,
  ) {}

  private ceoAllowed(user: AuthUser): boolean {
    return Boolean(user?.roles?.some((r) => FINANCE_ROLES.includes(r)));
  }

  // ─── GET /content-insights/roi ─────────────────────────────────
  async getRoi(query: RoiQueryDto, user: AuthUser) {
    const from = this.parseDay(query.from, false);
    const to = this.parseDay(query.to, true);
    const ceo = this.ceoAllowed(user);

    const usedAtRange =
      from || to
        ? { usedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
        : {};
    const recordedRange =
      from || to
        ? { recordedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
        : {};

    const itemFilter: Prisma.ContentItemWhereInput = {
      archivedAt: null,
      ...(query.platform?.trim() ? { platform: query.platform.trim() } : {}),
      ...(query.category?.trim() ? { contentType: query.category.trim() } : {}),
      ...(query.sourceType?.trim() ? { sourceType: query.sourceType.trim() } : {}),
    };

    // row-level viewScope เดียวกับ content list (content-items.service): own/team เห็นเฉพาะ
    // งานที่ตัวเองเป็นเจ้าของ/ผู้ตรวจ — กัน ROI รั่วชื่อคลิป/วิว/ต้นทุนของคนอื่น (null = CEO/all-scope)
    const visibleIds = await this.scope.resolveVisibleUserIds(user, 'content');
    if (visibleIds) {
      itemFilter.OR = [{ ownerId: { in: visibleIds } }, { reviewerId: { in: visibleIds } }];
    }

    // 1) ผลงาน: sum ทุก snapshot ต่อคลิปในช่วง (roll-up แบบเดียวกับ analytics.service)
    const perfs = await this.prisma.contentPerformance.findMany({
      where: { contentItemId: { not: null }, contentItem: itemFilter, ...recordedRange },
      select: { contentItemId: true, views: true, gmv: true, revenue: true },
    });
    const perfByItem = new Map<string, { views: number; gmv: number; revenue: number }>();
    for (const p of perfs) {
      if (!p.contentItemId) continue;
      let agg = perfByItem.get(p.contentItemId);
      if (!agg) {
        agg = { views: 0, gmv: 0, revenue: 0 };
        perfByItem.set(p.contentItemId, agg);
      }
      agg.views += p.views ?? 0;
      agg.gmv += p.gmv ? Number(p.gmv) : 0;
      agg.revenue += p.revenue ? Number(p.revenue) : 0;
    }

    // 2) ต้นทุนตรงตัว: log ที่ผูก entityType='content' (กรอง usedAt ในช่วง)
    const contentLinks = await this.prisma.aiUsageLink.findMany({
      where: { entityType: 'content', usageLog: usedAtRange },
      select: { entityId: true, usageLog: { select: { costBaht: true } } },
    });
    const costByItem = new Map<string, number>();
    for (const l of contentLinks) {
      costByItem.set(l.entityId, (costByItem.get(l.entityId) ?? 0) + Number(l.usageLog.costBaht));
    }

    // 3) เอาเฉพาะคลิปที่ผ่าน filter และ "มีต้นทุนหรือมีผลงาน" (union ทั้งสองฝั่ง)
    const candidateIds = [...new Set([...perfByItem.keys(), ...costByItem.keys()])];
    if (candidateIds.length === 0) {
      return this.emptyResponse(ceo);
    }
    const items = await this.prisma.contentItem.findMany({
      where: { id: { in: candidateIds }, ...itemFilter },
      select: { id: true, title: true, platform: true, sourceType: true, episodeId: true },
    });

    // 4) ต้นทุนระดับอีพี (แชร์กันทั้งอีพี — ไม่รวมเข้า cost ต่อคลิป): episode + shot ของอีพีนั้น
    const episodeIds = [...new Set(items.map((i) => i.episodeId).filter((v): v is string => !!v))];
    const episodeCostByEp = new Map<string, number>();
    if (episodeIds.length > 0) {
      const epLinks = await this.prisma.aiUsageLink.findMany({
        where: { entityType: 'episode', entityId: { in: episodeIds }, usageLog: usedAtRange },
        select: { entityId: true, usageLog: { select: { costBaht: true } } },
      });
      for (const l of epLinks) {
        episodeCostByEp.set(
          l.entityId,
          (episodeCostByEp.get(l.entityId) ?? 0) + Number(l.usageLog.costBaht),
        );
      }
      const shots = await this.prisma.shot.findMany({
        where: { episodeId: { in: episodeIds } },
        select: { id: true, episodeId: true },
      });
      if (shots.length > 0) {
        const epByShot = new Map(shots.map((s) => [s.id, s.episodeId]));
        const shotLinks = await this.prisma.aiUsageLink.findMany({
          where: { entityType: 'shot', entityId: { in: shots.map((s) => s.id) }, usageLog: usedAtRange },
          select: { entityId: true, usageLog: { select: { costBaht: true } } },
        });
        for (const l of shotLinks) {
          const epId = epByShot.get(l.entityId);
          if (!epId) continue;
          episodeCostByEp.set(epId, (episodeCostByEp.get(epId) ?? 0) + Number(l.usageLog.costBaht));
        }
      }
    }

    // 5) ประกอบแถว (คิดเลขเต็มก่อน แล้วค่อย gate ตอนตอบ)
    const rows: ItemRoi[] = [];
    for (const item of items) {
      const cost = round2(costByItem.get(item.id) ?? 0);
      const hasPerf = perfByItem.has(item.id);
      if (cost <= 0 && !hasPerf) continue; // คลิป idle — ไม่มีทั้งต้นทุนและผลงาน

      const perf = perfByItem.get(item.id);
      const views = perf?.views ?? 0;
      const gmv = round2(perf?.gmv ?? 0);
      const revenue = round2(perf?.revenue ?? 0);
      const profit = round2(gmv - cost);
      rows.push({
        contentItemId: item.id,
        title: item.title,
        platform: item.platform,
        sourceType: item.sourceType,
        cost,
        episodeCost: item.episodeId ? round2(episodeCostByEp.get(item.episodeId) ?? 0) : 0,
        views,
        costPerView: views > 0 ? round4(cost / views) : null,
        gmv,
        revenue,
        profit,
        roi: cost > 0 ? round4((gmv - cost) / cost) : null,
      });
    }

    // 6) เรียง — CEO ตามกำไร, non-CEO ตามวิว
    rows.sort((a, b) =>
      ceo ? b.profit - a.profit || b.views - a.views : b.views - a.views || b.cost - a.cost,
    );

    // 7) totals จาก "ทุกแถวที่เข้าเงื่อนไข" (ก่อน cap 200)
    let totalCost = 0;
    let totalViews = 0;
    let totalGmv = 0;
    for (const r of rows) {
      totalCost += r.cost;
      totalViews += r.views;
      totalGmv += r.gmv;
    }
    totalCost = round2(totalCost);
    totalGmv = round2(totalGmv);

    return {
      ceo,
      count: rows.length,
      rows: rows.slice(0, MAX_ROWS).map((r) => ({
        ...r,
        // CEO gating: ฝั่งเงิน (gmv/revenue/profit/roi) เห็นเฉพาะผู้บริหาร
        gmv: ceo ? r.gmv : null,
        revenue: ceo ? r.revenue : null,
        profit: ceo ? r.profit : null,
        roi: ceo ? r.roi : null,
      })),
      totals: {
        totalCost,
        totalViews,
        totalGmv: ceo ? totalGmv : null,
        totalProfit: ceo ? round2(totalGmv - totalCost) : null,
      },
    };
  }

  private emptyResponse(ceo: boolean) {
    return {
      ceo,
      count: 0,
      rows: [] as ItemRoi[],
      totals: {
        totalCost: 0,
        totalViews: 0,
        totalGmv: ceo ? 0 : null,
        totalProfit: ceo ? 0 : null,
      },
    };
  }

  // วันแบบ YYYY-MM-DD → เที่ยงคืน/สิ้นวัน Asia/Bangkok (+07:00) — ตรงกับ KPI/analytics
  private parseDay(raw: string | undefined, endOfDay: boolean): Date | undefined {
    if (!raw) return undefined;
    const s = raw.trim();
    if (!s) return undefined;
    const d = /^\d{4}-\d{2}-\d{2}$/.test(s)
      ? new Date(`${s}T${endOfDay ? '23:59:59.999+07:00' : '00:00:00.000+07:00'}`)
      : new Date(s);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException(`รูปแบบวันที่ "${raw}" ไม่ถูกต้อง (ใช้ ISO หรือ YYYY-MM-DD)`);
    }
    return d;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
