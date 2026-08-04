import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/current-user.decorator';
import { AiClaudeService } from '../ai/ai-claude.service';
import { INSIGHT_SYNTHESIS_SCHEMA } from './analytics.schemas';
import { GenerateInsightDto, InsightScope, ListInsightsQuery } from './dto/analytics.dto';

const DEFAULT_PAGE_SIZE = 20;
const TOP_PERFORMERS = 8; // จำนวนคอนเทนต์เด่นที่ส่งกลับ + สรุปเข้า AI
const TOP_BUCKETS = 6; // จำนวนอันดับต่อมิติที่เก็บ

// วัน (0=อาทิตย์..6=เสาร์) เป็นภาษาไทย
const THAI_DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

// ─── deterministic aggregate types (ตัวเลขทั้งหมดมาจากตรงนี้ ไม่ใช่จาก AI) ──
interface Bucket {
  key: string;
  label: string;
  views: number;
  gmv: number;
  orders: number;
  likes: number;
  ctrSum: number;
  ctrN: number;
  completionSum: number;
  completionN: number;
  roasSum: number;
  roasN: number;
  count: number; // จำนวนคอนเทนต์ที่ตกในกลุ่มนี้
}

interface RankedBucket {
  key: string;
  label: string;
  views: number;
  gmv: number;
  orders: number;
  avgCtr: number | null;
  avgCompletion: number | null;
  avgRoas: number | null;
  count: number;
}

interface TopPerformer {
  contentItemId: string;
  title: string;
  platform: string;
  format: string | null;
  contentType: string | null;
  hook: string | null;
  views: number;
  gmv: number;
  orders: number;
  ctr: number | null;
  completionRate: number | null;
  roas: number | null;
}

interface Aggregates {
  sampleSize: number; // จำนวน ContentItem ที่วิเคราะห์
  snapshotCount: number; // จำนวน performance rows
  totals: { views: number; gmv: number; orders: number; likes: number };
  topPerformers: TopPerformer[];
  byPlatform: RankedBucket[];
  byFormat: RankedBucket[];
  byContentType: RankedBucket[];
  byCharacter: RankedBucket[];
  byHook: RankedBucket[];
  byDayOfWeek: RankedBucket[];
  byHour: RankedBucket[];
  best: {
    bestPlatform: string | null;
    bestFormat: string | null;
    bestContentType: string | null;
    bestCharacter: string | null;
    bestHook: string | null;
    bestDayOfWeek: string | null;
    bestHour: string | null;
    bestTime: string | null;
  };
}

interface Synthesis {
  summary: string;
  patterns: { signal: string; evidence: string; metric: string }[];
  recommendations: { action: string; rationale: string; targetPlatform: string }[];
  bestHook: string;
  bestFormat: string;
  bestCharacter: string;
  bestTime: string;
}

// การรวมเลขต่อ ContentItem (perf ซ้ำ item ได้หลาย snapshot)
interface ItemAgg {
  id: string;
  title: string;
  platform: string;
  format: string | null;
  contentType: string | null;
  hook: string | null;
  scheduledAt: Date | null;
  characterIds: string[];
  views: number;
  gmv: number;
  orders: number;
  likes: number;
  ctrSum: number;
  ctrN: number;
  completionSum: number;
  completionN: number;
  roasSum: number;
  roasN: number;
  firstRecordedAt: Date;
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    private prisma: PrismaService,
    private claude: AiClaudeService,
  ) {}

  async status() {
    return { configured: await this.claude.isConfigured(), model: await this.claude.resolveModel() };
  }

  // ─── POST /content-insights/generate ────────────────────────────
  async generate(dto: GenerateInsightDto, user: AuthUser) {
    const { periodFrom, periodTo } = this.parsePeriod(dto.from, dto.to);

    // 1) ดึง performance + content (+ characters) ในช่วง/ขอบเขต
    const perfs = await this.fetchPerformances(dto, periodFrom, periodTo);

    // 2) คำนวณ aggregates แบบ deterministic ก่อนเสมอ (ไม่ให้ AI คิดเลข)
    const { aggregates, charNameById } = await this.computeAggregates(perfs);

    // 3) AI สังเคราะห์ (ตีความตัวเลข) — graceful ถ้ายังไม่ตั้งค่า
    const aiConfigured = await this.claude.isConfigured();
    let synthesis: Synthesis | null = null;
    let model: string | null = null;
    let usage: { inputTokens: number; outputTokens: number } | null = null;

    if (aiConfigured && aggregates.sampleSize > 0) {
      const system = this.buildSystemPrompt();
      const content = this.buildUserPrompt(dto, aggregates, periodFrom, periodTo);
      const call = await this.claude.callClaude<Synthesis>({
        action: 'ai_content_insight',
        system,
        content,
        schema: INSIGHT_SYNTHESIS_SCHEMA,
        maxTokens: 4000,
      });
      synthesis = this.sanitizeSynthesis(call.parsed);
      model = call.model;
      usage = call.usage;
    }

    // summary: ใช้ของ AI ถ้ามี ไม่งั้น fallback สรุป deterministic
    const summary = synthesis?.summary?.trim() || this.deterministicSummary(aggregates);

    // insightJson = aggregates (ตัวเลขจริง) + synthesis (การตีความ) + flag
    const insightJson = {
      aggregates,
      synthesis,
      aiAvailable: Boolean(synthesis),
      charNames: charNameById,
    } as unknown as Prisma.InputJsonValue;

    const insight = await this.prisma.contentInsight.create({
      data: {
        scope: dto.scope,
        scopeRef: dto.scopeRef ?? null,
        periodFrom,
        periodTo,
        summary,
        insightJson,
        sampleSize: aggregates.sampleSize,
        createdBy: user.id,
      },
    });

    await this.claude.audit(user, 'ai_content_insight', 'content_insight', insight.id, {
      scope: dto.scope,
      scopeRef: dto.scopeRef ?? null,
      sampleSize: aggregates.sampleSize,
      snapshotCount: aggregates.snapshotCount,
      aiAvailable: Boolean(synthesis),
      ...(model ? { model } : {}),
      ...(usage ? { usage } : {}),
    });

    return {
      insight,
      provenance: synthesis ? ('ai' as const) : ('deterministic' as const),
      ...(synthesis ? {} : { aiUnavailable: true }),
      ...(model ? { model } : {}),
      ...(usage ? { usage } : {}),
    };
  }

  // ─── GET /content-insights ──────────────────────────────────────
  async list(query: ListInsightsQuery) {
    const { periodFrom, periodTo } = this.parsePeriod(query.from, query.to);
    const where: Prisma.ContentInsightWhereInput = {
      ...(query.scope ? { scope: query.scope } : {}),
      ...(periodFrom || periodTo
        ? { createdAt: { ...(periodFrom ? { gte: periodFrom } : {}), ...(periodTo ? { lte: periodTo } : {}) } }
        : {}),
    };
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;

    const [total, items] = await this.prisma.$transaction([
      this.prisma.contentInsight.count({ where }),
      this.prisma.contentInsight.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { total, page, pageSize, items };
  }

  async getOne(id: string) {
    const insight = await this.prisma.contentInsight.findUnique({ where: { id } });
    if (!insight) throw new NotFoundException('ไม่พบ insight ที่ระบุ');
    return insight;
  }

  // ─── data fetch (read-only reuse ของ ContentPerformance + ContentItem) ──

  private async fetchPerformances(dto: GenerateInsightDto, from?: Date, to?: Date) {
    const contentWhere: Prisma.ContentItemWhereInput = { archivedAt: null };

    // scope narrowing (scopeRef optional)
    if (dto.scopeRef?.trim()) {
      const ref = dto.scopeRef.trim();
      if (dto.scope === 'platform') contentWhere.platform = ref;
      else if (dto.scope === 'format') contentWhere.contentFormat = ref;
      else if (dto.scope === 'character') {
        contentWhere.characters = { some: { characterId: ref } };
      }
    }

    const recordedWhere =
      from || to ? { recordedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {};

    return this.prisma.contentPerformance.findMany({
      where: {
        contentItemId: { not: null },
        contentItem: contentWhere,
        ...recordedWhere,
      },
      include: {
        contentItem: {
          select: {
            id: true,
            title: true,
            platform: true,
            contentFormat: true,
            contentType: true,
            hook: true,
            scheduledAt: true,
            characters: { select: { characterId: true } },
          },
        },
      },
    });
  }

  // ─── deterministic aggregation (หัวใจ: AI ไม่ยุ่งกับตัวเลขตรงนี้) ──

  private async computeAggregates(
    perfs: Prisma.ContentPerformanceGetPayload<{
      include: {
        contentItem: {
          select: {
            id: true;
            title: true;
            platform: true;
            contentFormat: true;
            contentType: true;
            hook: true;
            scheduledAt: true;
            characters: { select: { characterId: true } };
          };
        };
      };
    }>[],
  ): Promise<{ aggregates: Aggregates; charNameById: Record<string, string> }> {
    // 1) รวม snapshot → ต่อ ContentItem
    const items = new Map<string, ItemAgg>();
    for (const p of perfs) {
      const ci = p.contentItem;
      if (!ci) continue;
      let it = items.get(ci.id);
      if (!it) {
        it = {
          id: ci.id,
          title: ci.title,
          platform: ci.platform,
          format: ci.contentFormat,
          contentType: ci.contentType,
          hook: ci.hook,
          scheduledAt: ci.scheduledAt,
          characterIds: ci.characters.map((c) => c.characterId),
          views: 0,
          gmv: 0,
          orders: 0,
          likes: 0,
          ctrSum: 0,
          ctrN: 0,
          completionSum: 0,
          completionN: 0,
          roasSum: 0,
          roasN: 0,
          firstRecordedAt: p.recordedAt,
        };
        items.set(ci.id, it);
      }
      it.views += p.views ?? 0;
      it.gmv += p.gmv ? Number(p.gmv) : 0;
      it.orders += p.orders ?? 0;
      it.likes += p.likes ?? 0;
      if (p.ctr != null) {
        it.ctrSum += p.ctr;
        it.ctrN++;
      }
      if (p.completionRate != null) {
        it.completionSum += p.completionRate;
        it.completionN++;
      }
      if (p.roas != null) {
        it.roasSum += p.roas;
        it.roasN++;
      }
      if (p.recordedAt < it.firstRecordedAt) it.firstRecordedAt = p.recordedAt;
    }

    const itemList = [...items.values()];

    // 2) resolve ชื่อตัวละคร (batch)
    const charIds = [...new Set(itemList.flatMap((i) => i.characterIds))];
    const charNameById: Record<string, string> = {};
    if (charIds.length > 0) {
      const chars = await this.prisma.character.findMany({
        where: { id: { in: charIds } },
        select: { id: true, nameTh: true },
      });
      for (const c of chars) charNameById[c.id] = c.nameTh;
    }

    // 3) totals
    const totals = { views: 0, gmv: 0, orders: 0, likes: 0 };
    for (const it of itemList) {
      totals.views += it.views;
      totals.gmv += it.gmv;
      totals.orders += it.orders;
      totals.likes += it.likes;
    }

    // 4) top performers (เรียงตาม views, gmv เป็น tiebreak)
    const topPerformers: TopPerformer[] = [...itemList]
      .sort((a, b) => b.views - a.views || b.gmv - a.gmv)
      .slice(0, TOP_PERFORMERS)
      .map((it) => ({
        contentItemId: it.id,
        title: it.title,
        platform: it.platform,
        format: it.format,
        contentType: it.contentType,
        hook: it.hook,
        views: it.views,
        gmv: round2(it.gmv),
        orders: it.orders,
        ctr: it.ctrN ? round4(it.ctrSum / it.ctrN) : null,
        completionRate: it.completionN ? round3(it.completionSum / it.completionN) : null,
        roas: it.roasN ? round2(it.roasSum / it.roasN) : null,
      }));

    // 5) มิติต่าง ๆ — group โดยฟังก์ชัน keyOf (คืน [key,label] หรือ null ถ้าไม่มีค่า)
    const byPlatform = this.groupItems(itemList, (it) => [{ key: it.platform, label: it.platform }]);
    const byFormat = this.groupItems(itemList, (it) =>
      it.format ? [{ key: it.format, label: it.format }] : [],
    );
    const byContentType = this.groupItems(itemList, (it) =>
      it.contentType ? [{ key: it.contentType, label: it.contentType }] : [],
    );
    const byCharacter = this.groupItems(itemList, (it) =>
      it.characterIds.map((id) => ({ key: id, label: charNameById[id] ?? id })),
    );
    const byHook = this.groupItems(itemList, (it) =>
      it.hook?.trim() ? [{ key: it.hook.trim(), label: it.hook.trim() }] : [],
    );
    // แปลงเป็นเวลาไทย (UTC+7) ก่อนแตกวัน/ชั่วโมง — DB เก็บ UTC แต่ label สื่อเวลาไทย
    const toBangkok = (d: Date) => new Date(d.getTime() + 7 * 60 * 60 * 1000);
    const byDayOfWeek = this.groupItems(itemList, (it) => {
      const d = toBangkok(it.scheduledAt ?? it.firstRecordedAt);
      const dow = d.getUTCDay();
      return [{ key: String(dow), label: `วัน${THAI_DAYS[dow]}` }];
    });
    const byHour = this.groupItems(itemList, (it) => {
      const d = toBangkok(it.scheduledAt ?? it.firstRecordedAt);
      const h = d.getUTCHours();
      return [{ key: String(h), label: `${String(h).padStart(2, '0')}:00 น.` }];
    });

    const best = {
      bestPlatform: byPlatform[0]?.label ?? null,
      bestFormat: byFormat[0]?.label ?? null,
      bestContentType: byContentType[0]?.label ?? null,
      bestCharacter: byCharacter[0]?.label ?? null,
      bestHook: byHook[0]?.label ?? null,
      bestDayOfWeek: byDayOfWeek[0]?.label ?? null,
      bestHour: byHour[0]?.label ?? null,
      bestTime:
        byDayOfWeek[0] && byHour[0]
          ? `${byDayOfWeek[0].label} ช่วง ${byHour[0].label}`
          : (byDayOfWeek[0]?.label ?? byHour[0]?.label ?? null),
    };

    const aggregates: Aggregates = {
      sampleSize: itemList.length,
      snapshotCount: perfs.length,
      totals: {
        views: totals.views,
        gmv: round2(totals.gmv),
        orders: totals.orders,
        likes: totals.likes,
      },
      topPerformers,
      byPlatform,
      byFormat,
      byContentType,
      byCharacter,
      byHook,
      byDayOfWeek,
      byHour,
      best,
    };

    return { aggregates, charNameById };
  }

  // group + rank ตาม views (gmv tiebreak) — คืน top TOP_BUCKETS
  private groupItems(
    items: ItemAgg[],
    keysOf: (it: ItemAgg) => { key: string; label: string }[],
  ): RankedBucket[] {
    const map = new Map<string, Bucket>();
    for (const it of items) {
      for (const { key, label } of keysOf(it)) {
        let b = map.get(key);
        if (!b) {
          b = {
            key,
            label,
            views: 0,
            gmv: 0,
            orders: 0,
            likes: 0,
            ctrSum: 0,
            ctrN: 0,
            completionSum: 0,
            completionN: 0,
            roasSum: 0,
            roasN: 0,
            count: 0,
          };
          map.set(key, b);
        }
        b.views += it.views;
        b.gmv += it.gmv;
        b.orders += it.orders;
        b.likes += it.likes;
        if (it.ctrN) {
          b.ctrSum += it.ctrSum / it.ctrN;
          b.ctrN++;
        }
        if (it.completionN) {
          b.completionSum += it.completionSum / it.completionN;
          b.completionN++;
        }
        if (it.roasN) {
          b.roasSum += it.roasSum / it.roasN;
          b.roasN++;
        }
        b.count++;
      }
    }

    return [...map.values()]
      .sort((a, b) => b.views - a.views || b.gmv - a.gmv)
      .slice(0, TOP_BUCKETS)
      .map((b) => ({
        key: b.key,
        label: b.label,
        views: b.views,
        gmv: round2(b.gmv),
        orders: b.orders,
        avgCtr: b.ctrN ? round4(b.ctrSum / b.ctrN) : null,
        avgCompletion: b.completionN ? round3(b.completionSum / b.completionN) : null,
        avgRoas: b.roasN ? round2(b.roasSum / b.roasN) : null,
        count: b.count,
      }));
  }

  // ─── สรุป deterministic (fallback เมื่อ AI ไม่พร้อม) ──
  private deterministicSummary(agg: Aggregates): string {
    if (agg.sampleSize === 0) {
      return 'ยังไม่มีข้อมูลผลงาน (performance) ในช่วง/ขอบเขตที่เลือก — ยังสรุป insight ไม่ได้';
    }
    const bits: string[] = [
      `วิเคราะห์ ${agg.sampleSize} คอนเทนต์ (${agg.snapshotCount} snapshot) รวม ${agg.totals.views.toLocaleString('th-TH')} วิว`,
    ];
    if (agg.best.bestPlatform) bits.push(`แพลตฟอร์มเด่น: ${agg.best.bestPlatform}`);
    if (agg.best.bestFormat) bits.push(`ฟอร์แมตเด่น: ${agg.best.bestFormat}`);
    if (agg.best.bestCharacter) bits.push(`ตัวละครเด่น: ${agg.best.bestCharacter}`);
    if (agg.best.bestTime) bits.push(`เวลาเด่น: ${agg.best.bestTime}`);
    return bits.join(' · ');
  }

  // ─── prompt builders ──
  private buildSystemPrompt(): string {
    return `คุณคือ Content Performance Analyst ประจำ AISTAR Studio — ตีความตัวเลขผลงานคอนเทนต์ที่ผ่านมาให้เป็น insight ที่นำไปใช้คิดคอนเทนต์ต่อได้
สำคัญมาก: ตัวเลข อันดับ และค่าที่ดีที่สุดทั้งหมด ถูกคำนวณมาให้แล้ว (deterministic aggregates) — หน้าที่ของคุณคือ "ตีความ" ไม่ใช่ "คำนวณ"
กติกา:
- ห้ามแต่งตัวเลขเอง — อ้างอิงเฉพาะตัวเลขที่ให้มาใน aggregates เท่านั้น
- ค่าที่ดีที่สุด (bestHook/bestFormat/bestCharacter/bestTime) ให้ยึดตาม best.* ที่คำนวณมา — ห้ามสลับอันดับเอง
- เนื้อหาทั้งหมดเป็นภาษาไทย (ยกเว้นค่า platform/format ที่เป็น key อังกฤษ)
- patterns: สรุปรูปแบบที่เห็นจริงจากตัวเลข พร้อม evidence เชิงเลข + metric ที่ใช้ยืนยัน
- recommendations: คำแนะนำที่ป้อนกลับเข้าระบบคิดคอนเทนต์ได้จริง อ้างอิง pattern ที่พบ`;
  }

  private buildUserPrompt(dto: GenerateInsightDto, agg: Aggregates, from?: Date, to?: Date): string {
    const blocks: string[] = [];
    const period = [
      from ? `ตั้งแต่ ${from.toISOString().slice(0, 10)}` : '',
      to ? `ถึง ${to.toISOString().slice(0, 10)}` : '',
    ]
      .filter(Boolean)
      .join(' ');
    blocks.push(
      `[ขอบเขตการวิเคราะห์] scope=${dto.scope}${dto.scopeRef ? ` scopeRef=${dto.scopeRef}` : ''}${
        period ? ` · ${period}` : ''
      } · sampleSize=${agg.sampleSize} คอนเทนต์ · ${agg.snapshotCount} snapshot`,
    );

    blocks.push(
      `[ค่าที่ดีที่สุด (คำนวณมาแล้ว — ยึดตามนี้)]\n${JSON.stringify(agg.best, null, 0)}`,
    );
    blocks.push(`[ยอดรวม]\n${JSON.stringify(agg.totals, null, 0)}`);

    const dim = (name: string, arr: RankedBucket[]) =>
      arr.length
        ? `[${name}]\n${arr
            .map(
              (b) =>
                `- ${b.label}: views ${b.views}, gmv ${b.gmv}, orders ${b.orders}${
                  b.avgCtr != null ? `, ctr ${b.avgCtr}` : ''
                }${b.avgCompletion != null ? `, completion ${b.avgCompletion}` : ''}${
                  b.avgRoas != null ? `, roas ${b.avgRoas}` : ''
                } (n=${b.count})`,
            )
            .join('\n')}`
        : '';
    for (const [name, arr] of [
      ['อันดับตามแพลตฟอร์ม', agg.byPlatform],
      ['อันดับตามฟอร์แมต', agg.byFormat],
      ['อันดับตามประเภทคอนเทนต์', agg.byContentType],
      ['อันดับตามตัวละคร', agg.byCharacter],
      ['อันดับตาม hook', agg.byHook],
      ['อันดับตามวันในสัปดาห์', agg.byDayOfWeek],
      ['อันดับตามช่วงเวลา', agg.byHour],
    ] as [string, RankedBucket[]][]) {
      const t = dim(name, arr);
      if (t) blocks.push(t);
    }

    if (agg.topPerformers.length) {
      blocks.push(
        `[คอนเทนต์ที่เวิร์คสุด]\n${agg.topPerformers
          .map(
            (t) =>
              `- "${t.title}" [${[t.platform, t.format, t.contentType].filter(Boolean).join('/')}]${
                t.hook ? ` hook: ${t.hook}` : ''
              } — views ${t.views}, gmv ${t.gmv}`,
          )
          .join('\n')}`,
      );
    }

    blocks.push(
      'สังเคราะห์ insight ตามสคีมา (summary, patterns[], recommendations[], bestHook, bestFormat, bestCharacter, bestTime) — ยึดตัวเลขข้างต้น ห้ามคำนวณ/แต่งเลขใหม่',
    );
    return blocks.join('\n\n');
  }

  private sanitizeSynthesis(s: Partial<Synthesis>): Synthesis {
    return {
      summary: (s.summary ?? '').trim(),
      patterns: (s.patterns ?? []).map((p) => ({
        signal: (p.signal ?? '').trim(),
        evidence: (p.evidence ?? '').trim(),
        metric: (p.metric ?? '').trim(),
      })),
      recommendations: (s.recommendations ?? []).map((r) => ({
        action: (r.action ?? '').trim(),
        rationale: (r.rationale ?? '').trim(),
        targetPlatform: (r.targetPlatform ?? '').trim(),
      })),
      bestHook: (s.bestHook ?? '').trim(),
      bestFormat: (s.bestFormat ?? '').trim(),
      bestCharacter: (s.bestCharacter ?? '').trim(),
      bestTime: (s.bestTime ?? '').trim(),
    };
  }

  private parsePeriod(from?: string, to?: string): { periodFrom?: Date; periodTo?: Date } {
    return { periodFrom: this.parseDay(from, false), periodTo: this.parseDay(to, true) };
  }

  private parseDay(raw: string | undefined, endOfDay: boolean): Date | undefined {
    if (!raw) return undefined;
    const s = raw.trim();
    if (!s) return undefined;
    // YYYY-MM-DD → เที่ยงคืน/สิ้นวัน Asia/Bangkok (+07:00) — ตรงกับ KPI
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
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
