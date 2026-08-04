import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/current-user.decorator';
import { CreatePerformanceDto } from './dto/create-performance.dto';
import {
  CSV_COLUMNS,
  CSV_TEMPLATE,
  parseLenientInt,
  parseLenientNumber,
  parseRecordedAt,
  splitCsvLine,
  stripBom,
} from './csv.util';

const PAGE_SIZE = 20;

// sort ที่อนุญาต (กัน inject field แปลก ๆ เข้า orderBy)
const SORT_FIELDS = ['recordedAt', 'views', 'gmv'] as const;
type SortField = (typeof SORT_FIELDS)[number];

export interface ListParams {
  contentItemId?: string;
  liveSessionId?: string;
  platform?: string;
  source?: string;
  recordedFrom?: string;
  recordedTo?: string;
  sortBy?: string;
  sortDir?: string;
  page?: number;
}

interface SummaryBucket {
  key: string;
  label: string;
  views: number;
  likes: number;
  orders: number;
  revenue: number;
  gmv: number;
  productClicks: number;
  roasSum: number;
  roasN: number;
  completionSum: number;
  completionN: number;
  ctrSum: number;
  ctrN: number;
  count: number;
}

type SummaryRowData = Prisma.ContentPerformanceGetPayload<{
  select: {
    platform: true;
    contentItemId: true;
    liveSessionId: true;
    views: true;
    likes: true;
    orders: true;
    revenue: true;
    gmv: true;
    productClicks: true;
    roas: true;
    completionRate: true;
    ctr: true;
    contentItem: { select: { id: true; title: true; campaignId: true } };
    liveSession: { select: { id: true; title: true } };
  };
}>;

@Injectable()
export class PerformanceService {
  constructor(private prisma: PrismaService) {}

  // ── manual entry (D6) ──────────────────────────────────────

  async create(dto: CreatePerformanceDto, user: AuthUser) {
    // XOR: ต้องผูกกับ content หรือ live อย่างใดอย่างหนึ่งเท่านั้น
    if (!!dto.contentItemId === !!dto.liveSessionId) {
      throw new BadRequestException('ต้องระบุ contentItemId หรือ liveSessionId อย่างใดอย่างหนึ่ง');
    }

    if (dto.contentItemId) {
      const target = await this.prisma.contentItem.findUnique({ where: { id: dto.contentItemId } });
      if (!target) throw new NotFoundException('ไม่พบ content item ที่ระบุ');
    } else {
      const target = await this.prisma.liveSession.findUnique({ where: { id: dto.liveSessionId! } });
      if (!target) throw new NotFoundException('ไม่พบ live session ที่ระบุ');
    }

    const { recordedAt, ...fields } = dto;
    const entry = await this.prisma.contentPerformance.create({
      data: {
        ...fields,
        recordedAt: new Date(recordedAt),
        source: 'manual',
        createdBy: user.id,
      },
      include: {
        contentItem: { select: { id: true, title: true } },
        liveSession: { select: { id: true, title: true } },
      },
    });

    await this.audit(user, 'create', entry.id, {
      platform: dto.platform,
      contentItemId: dto.contentItemId ?? null,
      liveSessionId: dto.liveSessionId ?? null,
    });
    return entry;
  }

  // ── list + filters (พี่ทัศน์เน้น: filter ครบทุกมิติ) ─────

  async list(params: ListParams) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const where: Prisma.ContentPerformanceWhereInput = {
      ...(params.contentItemId ? { contentItemId: params.contentItemId } : {}),
      ...(params.liveSessionId ? { liveSessionId: params.liveSessionId } : {}),
      ...(params.platform ? { platform: params.platform } : {}),
      ...(params.source ? { source: params.source } : {}),
      ...this.dateWhere(params.recordedFrom, params.recordedTo),
    };

    const sortBy: SortField = SORT_FIELDS.includes(params.sortBy as SortField)
      ? (params.sortBy as SortField)
      : 'recordedAt';
    const sortDir: Prisma.SortOrder = params.sortDir === 'asc' ? 'asc' : 'desc';

    const [items, total] = await this.prisma.$transaction([
      this.prisma.contentPerformance.findMany({
        where,
        orderBy: [{ [sortBy]: sortDir }, { createdAt: 'desc' }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: {
          contentItem: { select: { id: true, title: true } },
          liveSession: { select: { id: true, title: true } },
        },
      }),
      this.prisma.contentPerformance.count({ where }),
    ]);
    return { items, total, page, pageSize: PAGE_SIZE };
  }

  // ── delete (แก้ผิดลบได้ — บันทึกใหม่แทน) ─────────────────

  async remove(id: string, user: AuthUser) {
    const existing = await this.prisma.contentPerformance.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('ไม่พบข้อมูล performance ที่ระบุ');

    await this.prisma.contentPerformance.delete({ where: { id } });
    await this.audit(user, 'delete', id, {
      platform: existing.platform,
      recordedAt: existing.recordedAt,
      source: existing.source,
    });
    return { deleted: true };
  }

  // ── CSV import (D6) ────────────────────────────────────────

  csvTemplate(): string {
    return CSV_TEMPLATE;
  }

  async importCsv(file: Express.Multer.File | undefined, user: AuthUser) {
    if (!file || !file.buffer) throw new BadRequestException('กรุณาแนบไฟล์ CSV (field ชื่อ file)');

    const text = stripBom(file.buffer.toString('utf8'));
    const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
    if (lines.length < 2) {
      throw new BadRequestException('ไฟล์ CSV ว่าง — ต้องมี header และข้อมูลอย่างน้อย 1 แถว');
    }

    // map header → index (ยึดตามชื่อคอลัมน์ ไม่ยึดลำดับ เผื่อ user สลับคอลัมน์)
    const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
    const col: Record<string, number> = {};
    for (const name of CSV_COLUMNS) col[name] = header.indexOf(name);
    if (col.content_title < 0 || col.platform < 0 || col.recorded_at < 0) {
      throw new BadRequestException(
        'header CSV ไม่ถูกต้อง — ต้องมีคอลัมน์ content_title, platform, recorded_at (ดาวน์โหลด template ได้ที่ปุ่ม template)',
      );
    }

    // batch หา content ตาม title ทีเดียว (exact match)
    const parsed = lines.slice(1).map((line, i) => ({ line: i + 2, cells: splitCsvLine(line) }));
    const titles = [...new Set(parsed.map((r) => r.cells[col.content_title] ?? '').filter(Boolean))];
    const contents = await this.prisma.contentItem.findMany({
      where: { title: { in: titles } },
      select: { id: true, title: true },
    });
    const byTitle = new Map(contents.map((c) => [c.title, c.id]));

    const errors: { line: number; error: string }[] = [];
    const rows: Prisma.ContentPerformanceCreateManyInput[] = [];

    for (const { line, cells } of parsed) {
      const get = (name: (typeof CSV_COLUMNS)[number]) =>
        col[name] >= 0 ? cells[col[name]] : undefined;

      const title = get('content_title') ?? '';
      if (!title) {
        errors.push({ line, error: 'content_title ว่าง' });
        continue;
      }
      const contentItemId = byTitle.get(title);
      if (!contentItemId) {
        errors.push({ line, error: `ไม่พบ content ชื่อ "${title}"` });
        continue;
      }
      const platform = get('platform') ?? '';
      if (!platform) {
        errors.push({ line, error: 'platform ว่าง' });
        continue;
      }
      const recordedAt = parseRecordedAt(get('recorded_at'));
      if (!recordedAt) {
        errors.push({ line, error: `recorded_at "${get('recorded_at') ?? ''}" ไม่ถูกต้อง (ใช้ ISO หรือ YYYY-MM-DD)` });
        continue;
      }

      rows.push({
        contentItemId,
        platform,
        recordedAt,
        views: parseLenientInt(get('views')),
        likes: parseLenientInt(get('likes')),
        comments: parseLenientInt(get('comments')),
        shares: parseLenientInt(get('shares')),
        saves: parseLenientInt(get('saves')),
        watchTimeSec: parseLenientInt(get('watch_time_sec')),
        retention3Sec: parseLenientNumber(get('retention_3sec')),
        completionRate: parseLenientNumber(get('completion_rate')),
        ctr: parseLenientNumber(get('ctr')),
        productClicks: parseLenientInt(get('product_clicks')),
        addToCart: parseLenientInt(get('add_to_cart')),
        orders: parseLenientInt(get('orders')),
        revenue: parseLenientNumber(get('revenue')),
        gmv: parseLenientNumber(get('gmv')),
        source: 'csv',
        createdBy: user.id,
      });
    }

    if (rows.length > 0) {
      await this.prisma.contentPerformance.createMany({ data: rows });
    }

    const job = await this.prisma.importJob.create({
      data: {
        filename: file.originalname ?? 'performance.csv',
        kind: 'performance_csv',
        rowCount: rows.length,
        errorRows: errors.length ? (errors as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        status: rows.length > 0 ? 'done' : 'failed',
        createdBy: user.id,
      },
    });

    await this.audit(user, 'csv_import', job.id, {
      filename: job.filename,
      imported: rows.length,
      errorCount: errors.length,
    });

    return { imported: rows.length, errors, jobId: job.id };
  }

  // ── insight engine (v0.1 §17.4) ────────────────────────────

  async summary(params: { dateFrom?: string; dateTo?: string; groupBy?: string }) {
    const groupBy = params.groupBy ?? 'platform';
    if (!['platform', 'character', 'campaign', 'content'].includes(groupBy)) {
      throw new BadRequestException('groupBy ต้องเป็น platform | character | campaign | content');
    }

    const rows = await this.fetchSummaryRows(params.dateFrom, params.dateTo);

    let buckets: SummaryBucket[];
    switch (groupBy) {
      case 'character':
        buckets = await this.groupByCharacter(rows);
        break;
      case 'campaign':
        buckets = await this.groupByCampaign(rows);
        break;
      case 'content':
        buckets = this.group(rows, (r) => {
          if (r.contentItem) return [{ key: r.contentItem.id, label: r.contentItem.title }];
          if (r.liveSession) return [{ key: r.liveSession.id, label: `LIVE: ${r.liveSession.title}` }];
          return [];
        });
        break;
      default:
        buckets = this.group(rows, (r) => [{ key: r.platform, label: r.platform }]);
    }

    return buckets
      .map((b) => this.finalizeBucket(b))
      .sort((a, b) => b.gmv - a.gmv || b.views - a.views);
  }

  async overview(params: { dateFrom?: string; dateTo?: string }) {
    const rows = await this.fetchSummaryRows(params.dateFrom, params.dateTo);

    const totals = { views: 0, likes: 0, orders: 0, gmv: 0, revenue: 0, entryCount: rows.length };
    for (const r of rows) {
      totals.views += r.views ?? 0;
      totals.likes += r.likes ?? 0;
      totals.orders += r.orders ?? 0;
      totals.gmv += r.gmv ? Number(r.gmv) : 0;
      totals.revenue += r.revenue ? Number(r.revenue) : 0;
    }

    const platforms = this.group(rows, (r) => [{ key: r.platform, label: r.platform }])
      .map((b) => this.finalizeBucket(b))
      .sort((a, b) => b.gmv - a.gmv || b.views - a.views);
    const characters = (await this.groupByCharacter(rows))
      .map((b) => this.finalizeBucket(b))
      .sort((a, b) => b.gmv - a.gmv || b.views - a.views);

    return {
      ...totals,
      topPlatform: platforms[0]?.label ?? null,
      topCharacter: characters[0]?.label ?? null,
    };
  }

  // ── internal helpers ───────────────────────────────────────

  private fetchSummaryRows(dateFrom?: string, dateTo?: string): Promise<SummaryRowData[]> {
    return this.prisma.contentPerformance.findMany({
      where: this.dateWhere(dateFrom, dateTo),
      select: {
        platform: true,
        contentItemId: true,
        liveSessionId: true,
        views: true,
        likes: true,
        orders: true,
        revenue: true,
        gmv: true,
        productClicks: true,
        roas: true,
        completionRate: true,
        ctr: true,
        contentItem: { select: { id: true, title: true, campaignId: true } },
        liveSession: { select: { id: true, title: true } },
      },
    });
  }

  /** รวมเลขเข้า bucket — keysOf คืนหลาย key ได้ (เช่น content ที่มีหลาย character นับให้ทุกตัว) */
  private group(
    rows: SummaryRowData[],
    keysOf: (row: SummaryRowData) => { key: string; label: string }[],
  ): SummaryBucket[] {
    const map = new Map<string, SummaryBucket>();
    for (const r of rows) {
      for (const { key, label } of keysOf(r)) {
        let b = map.get(key);
        if (!b) {
          b = {
            key,
            label,
            views: 0,
            likes: 0,
            orders: 0,
            revenue: 0,
            gmv: 0,
            productClicks: 0,
            roasSum: 0,
            roasN: 0,
            completionSum: 0,
            completionN: 0,
            ctrSum: 0,
            ctrN: 0,
            count: 0,
          };
          map.set(key, b);
        }
        b.views += r.views ?? 0;
        b.likes += r.likes ?? 0;
        b.orders += r.orders ?? 0;
        b.revenue += r.revenue ? Number(r.revenue) : 0;
        b.gmv += r.gmv ? Number(r.gmv) : 0;
        b.productClicks += r.productClicks ?? 0;
        if (r.roas !== null) {
          b.roasSum += r.roas;
          b.roasN++;
        }
        if (r.completionRate !== null) {
          b.completionSum += r.completionRate;
          b.completionN++;
        }
        if (r.ctr !== null) {
          b.ctrSum += r.ctr;
          b.ctrN++;
        }
        b.count++;
      }
    }
    return [...map.values()];
  }

  private finalizeBucket(b: SummaryBucket) {
    return {
      key: b.key,
      label: b.label,
      views: b.views,
      likes: b.likes,
      orders: b.orders,
      revenue: Math.round(b.revenue * 100) / 100,
      gmv: Math.round(b.gmv * 100) / 100,
      productClicks: b.productClicks,
      roas: b.roasN ? Math.round((b.roasSum / b.roasN) * 100) / 100 : null,
      completionRate: b.completionN ? Math.round((b.completionSum / b.completionN) * 1000) / 1000 : null,
      ctr: b.ctrN ? Math.round((b.ctrSum / b.ctrN) * 10000) / 10000 : null,
      count: b.count,
    };
  }

  private async groupByCharacter(rows: SummaryRowData[]): Promise<SummaryBucket[]> {
    const contentIds = [...new Set(rows.map((r) => r.contentItemId).filter((id): id is string => !!id))];
    if (contentIds.length === 0) return [];

    // batch: content → characters → ชื่อ (เลี่ยง N+1)
    const links = await this.prisma.contentItemCharacter.findMany({
      where: { contentItemId: { in: contentIds } },
    });
    const charIds = [...new Set(links.map((l) => l.characterId))];
    const characters = await this.prisma.character.findMany({
      where: { id: { in: charIds } },
      select: { id: true, nameTh: true },
    });
    const nameById = new Map(characters.map((c) => [c.id, c.nameTh]));
    const charsByContent = new Map<string, string[]>();
    for (const l of links) {
      const arr = charsByContent.get(l.contentItemId) ?? [];
      arr.push(l.characterId);
      charsByContent.set(l.contentItemId, arr);
    }

    return this.group(rows, (r) => {
      if (!r.contentItemId) return [];
      return (charsByContent.get(r.contentItemId) ?? []).map((id) => ({
        key: id,
        label: nameById.get(id) ?? id,
      }));
    });
  }

  private async groupByCampaign(rows: SummaryRowData[]): Promise<SummaryBucket[]> {
    const campaignIds = [
      ...new Set(rows.map((r) => r.contentItem?.campaignId).filter((id): id is string => !!id)),
    ];
    if (campaignIds.length === 0) return [];

    const campaigns = await this.prisma.campaign.findMany({
      where: { id: { in: campaignIds } },
      select: { id: true, name: true },
    });
    const nameById = new Map(campaigns.map((c) => [c.id, c.name]));

    return this.group(rows, (r) => {
      const cid = r.contentItem?.campaignId;
      if (!cid) return [];
      return [{ key: cid, label: nameById.get(cid) ?? cid }];
    });
  }

  /** ช่วงวันที่: รับ ISO หรือ YYYY-MM-DD (to = สิ้นวัน) */
  private dateWhere(from?: string, to?: string): Prisma.ContentPerformanceWhereInput {
    const gte = this.parseDay(from, false);
    const lte = this.parseDay(to, true);
    if (!gte && !lte) return {};
    return { recordedAt: { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) } };
  }

  private parseDay(raw: string | undefined, endOfDay: boolean): Date | undefined {
    if (!raw) return undefined;
    const s = raw.trim();
    if (!s) return undefined;
    const d = /^\d{4}-\d{2}-\d{2}$/.test(s)
      ? new Date(`${s}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`)
      : new Date(s);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException(`รูปแบบวันที่ "${raw}" ไม่ถูกต้อง (ใช้ ISO หรือ YYYY-MM-DD)`);
    }
    return d;
  }

  private audit(user: AuthUser, action: string, entityId: string, meta: object) {
    return this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        via: 'ui',
        action,
        entityType: 'performance',
        entityId,
        meta: meta as Prisma.InputJsonValue,
      },
    });
  }
}
