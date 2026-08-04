import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/current-user.decorator';
import { AiToolsService } from './ai-tools.service';
import {
  AiUsageLinkDto,
  CreateAiUsageLogDto,
  UpdateAiUsageLogDto,
} from './dto/ai-usage-log.dto';

interface ListFilters {
  userId?: string;
  aiToolId?: string;
  from?: string;
  to?: string;
}

@Injectable()
export class AiUsageService {
  // CEO เห็นทุกคน (เหมือน dashboard FINANCE_ROLES)
  private static readonly FINANCE_ROLES = ['admin', 'founder'];

  constructor(
    private prisma: PrismaService,
    private tools: AiToolsService,
  ) {}

  private ceoAllowed(user: AuthUser): boolean {
    return Boolean(
      user?.roles?.some((r) => AiUsageService.FINANCE_ROLES.includes(r)),
    );
  }

  private isAdmin(user: AuthUser): boolean {
    return Boolean(user?.roles?.includes('admin'));
  }

  // ─── ตรวจว่างานที่ผูกมีอยู่จริงในตารางเป้าหมาย ──────────────
  private async resolveLink(
    link: AiUsageLinkDto,
  ): Promise<{ ok: boolean; label: string | null }> {
    if (link.entityType === 'episode') {
      const ep = await this.prisma.episode.findUnique({
        where: { id: link.entityId },
        select: { title: true, displayCode: true },
      });
      return ep
        ? { ok: true, label: `${ep.displayCode} · ${ep.title}` }
        : { ok: false, label: null };
    }
    if (link.entityType === 'shot') {
      const shot = await this.prisma.shot.findUnique({
        where: { id: link.entityId },
        select: { shotNumber: true, episode: { select: { displayCode: true } } },
      });
      return shot
        ? { ok: true, label: `${shot.episode.displayCode} · Shot ${shot.shotNumber}` }
        : { ok: false, label: null };
    }
    if (link.entityType === 'content') {
      const c = await this.prisma.contentItem.findUnique({
        where: { id: link.entityId },
        select: { title: true },
      });
      return c ? { ok: true, label: c.title } : { ok: false, label: null };
    }
    if (link.entityType === 'image_request') {
      const r = await this.prisma.imageRequest.findUnique({
        where: { id: link.entityId },
        select: { displayCode: true, title: true },
      });
      return r
        ? { ok: true, label: `${r.displayCode} · ${r.title}` }
        : { ok: false, label: null };
    }
    return { ok: false, label: null };
  }

  private async buildLinkData(links: AiUsageLinkDto[]) {
    const out: { entityType: string; entityId: string; label: string | null }[] = [];
    for (const link of links) {
      const resolved = await this.resolveLink(link);
      if (!resolved.ok) {
        throw new BadRequestException(
          `ไม่พบงานที่ผูก: ${link.entityType} ${link.entityId}`,
        );
      }
      out.push({
        entityType: link.entityType,
        entityId: link.entityId,
        label: link.label ?? resolved.label,
      });
    }
    return out;
  }

  // ─── CREATE ────────────────────────────────────────────────
  async create(user: AuthUser, dto: CreateAiUsageLogDto) {
    // links ≥1 การันตีจาก DTO (ArrayMinSize) — เผื่อไว้อีกชั้น
    if (!dto.links?.length) {
      throw new BadRequestException('ต้องผูกงานอย่างน้อย 1 ชิ้น');
    }
    const tool = await this.prisma.aiTool.findUnique({ where: { id: dto.aiToolId } });
    if (!tool) throw new BadRequestException('ไม่พบ AI tool ที่เลือก');

    const linkData = await this.buildLinkData(dto.links);

    // auto costBaht ถ้าไม่กรอก
    let costBaht = dto.costBaht;
    let rateWarning: string | null = null;
    if (costBaht == null) {
      const blended = await this.tools.blendedRate(dto.aiToolId);
      if (blended.rate == null || blended.rate === 0) {
        costBaht = 0;
        rateWarning =
          'ยังไม่มีเรตของ tool นี้ (ยังไม่ได้บันทึก top-up หรือ default rate) — ต้นทุนถูกตั้งเป็น 0 บาท กรุณากรอกเอง';
      } else {
        costBaht = dto.quantity * blended.rate;
      }
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const log = await tx.aiUsageLog.create({
        data: {
          userId: user.id,
          aiToolId: dto.aiToolId,
          usedAt: new Date(dto.usedAt),
          quantity: dto.quantity,
          costBaht: costBaht as number,
          outputsCount: dto.outputsCount,
          outputType: dto.outputType,
          note: dto.note ?? null,
          links: { create: linkData },
        },
        include: { aiTool: true, links: true },
      });
      return log;
    });

    return { ...this.serialize(created), rateWarning };
  }

  // ─── LIST ──────────────────────────────────────────────────
  async list(user: AuthUser, filters: ListFilters) {
    const ceo = this.ceoAllowed(user);
    const where: {
      userId?: string;
      aiToolId?: string;
      usedAt?: { gte?: Date; lte?: Date };
    } = {};

    // non-CEO → บังคับเห็นเฉพาะของตัวเอง ไม่ว่าจะส่ง query อะไรมา
    if (!ceo) {
      where.userId = user.id;
    } else if (filters.userId) {
      where.userId = filters.userId;
    }
    if (filters.aiToolId) where.aiToolId = filters.aiToolId;
    const range = this.dateRange(filters.from, filters.to);
    if (range) where.usedAt = range;

    const logs = await this.prisma.aiUsageLog.findMany({
      where,
      orderBy: { usedAt: 'desc' },
      include: { aiTool: true, links: true },
      take: 500,
    });
    const names = await this.userNames(logs.map((l) => l.userId));
    return logs.map((l) => ({
      ...this.serialize(l),
      userName: names.get(l.userId) ?? null,
    }));
  }

  // ─── UPDATE (owner or admin) ───────────────────────────────
  async update(user: AuthUser, id: string, dto: UpdateAiUsageLogDto) {
    const existing = await this.prisma.aiUsageLog.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('ไม่พบ usage log');
    if (existing.userId !== user.id && !this.isAdmin(user)) {
      throw new ForbiddenException('แก้ไขได้เฉพาะเจ้าของหรือ admin');
    }

    // เปลี่ยน tool → ตรวจว่ามีจริง (กัน 500 จาก FK) เหมือน create()
    if (dto.aiToolId && dto.aiToolId !== existing.aiToolId) {
      const tool = await this.prisma.aiTool.findUnique({ where: { id: dto.aiToolId } });
      if (!tool) throw new BadRequestException('ไม่พบ AI tool ที่เลือก');
    }

    const linkData = dto.links ? await this.buildLinkData(dto.links) : undefined;

    // ถ้าแก้ quantity/aiToolId แต่ไม่ส่ง costBaht → คำนวณต้นทุนใหม่จากเรต (กันค่าเก่าค้าง)
    let costBaht = dto.costBaht;
    if (costBaht == null && (dto.quantity != null || dto.aiToolId != null)) {
      const toolId = dto.aiToolId ?? existing.aiToolId;
      const quantity = dto.quantity ?? existing.quantity;
      const blended = await this.tools.blendedRate(toolId);
      if (blended.rate != null && blended.rate !== 0) {
        costBaht = quantity * blended.rate;
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (linkData) {
        await tx.aiUsageLink.deleteMany({ where: { usageLogId: id } });
      }
      return tx.aiUsageLog.update({
        where: { id },
        data: {
          aiToolId: dto.aiToolId,
          usedAt: dto.usedAt ? new Date(dto.usedAt) : undefined,
          quantity: dto.quantity,
          costBaht: costBaht,
          outputsCount: dto.outputsCount,
          outputType: dto.outputType,
          note: dto.note,
          ...(linkData ? { links: { create: linkData } } : {}),
        },
        include: { aiTool: true, links: true },
      });
    });
    return this.serialize(updated);
  }

  // ─── DELETE (owner or admin) ───────────────────────────────
  async remove(user: AuthUser, id: string) {
    const existing = await this.prisma.aiUsageLog.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('ไม่พบ usage log');
    if (existing.userId !== user.id && !this.isAdmin(user)) {
      throw new ForbiddenException('ลบได้เฉพาะเจ้าของหรือ admin');
    }
    // AiUsageLink onDelete Cascade → ลบ log ก็ลบ links ตาม
    await this.prisma.aiUsageLog.delete({ where: { id } });
    return { ok: true };
  }

  // ─── SUMMARY ───────────────────────────────────────────────
  async summary(user: AuthUser, from?: string, to?: string) {
    const ceo = this.ceoAllowed(user);
    const range = this.dateRange(from, to);
    const where: { userId?: string; usedAt?: { gte?: Date; lte?: Date } } = {};
    if (!ceo) where.userId = user.id; // พนักงานเห็นเฉพาะของตัวเอง
    if (range) where.usedAt = range;

    const logs = await this.prisma.aiUsageLog.findMany({
      where,
      include: { aiTool: true, links: true },
    });

    // totals
    const totalCost = logs.reduce((s, l) => s + Number(l.costBaht), 0);
    const totalOutputs = logs.reduce((s, l) => s + l.outputsCount, 0);
    const totals = {
      costBaht: round2(totalCost),
      outputs: totalOutputs,
      avgCostPerOutput: totalOutputs > 0 ? round2(totalCost / totalOutputs) : null,
      logs: logs.length,
    };

    // perTool
    const toolMap = new Map<
      string,
      { tool: string; quantity: number; costBaht: number; outputs: number }
    >();
    for (const l of logs) {
      const key = l.aiToolId;
      const cur =
        toolMap.get(key) ??
        { tool: l.aiTool.name, quantity: 0, costBaht: 0, outputs: 0 };
      cur.quantity += l.quantity;
      cur.costBaht += Number(l.costBaht);
      cur.outputs += l.outputsCount;
      toolMap.set(key, cur);
    }
    const perTool = [...toolMap.values()]
      .map((t) => ({
        tool: t.tool,
        quantity: round2(t.quantity),
        costBaht: round2(t.costBaht),
        outputs: t.outputs,
        costPerOutput: t.outputs > 0 ? round2(t.costBaht / t.outputs) : null,
      }))
      .sort((a, b) => b.costBaht - a.costBaht);

    // perPerson
    const personMap = new Map<
      string,
      { userId: string; quantity: number; costBaht: number; outputs: number; linked: number }
    >();
    for (const l of logs) {
      const cur =
        personMap.get(l.userId) ??
        { userId: l.userId, quantity: 0, costBaht: 0, outputs: 0, linked: 0 };
      cur.quantity += l.quantity;
      cur.costBaht += Number(l.costBaht);
      cur.outputs += l.outputsCount;
      if (l.links.length > 0) cur.linked += 1;
      personMap.set(l.userId, cur);
    }
    // จำนวน log ต่อคน (ใช้คำนวณ % ผูกงาน)
    const logCountByUser = new Map<string, number>();
    for (const l of logs) {
      logCountByUser.set(l.userId, (logCountByUser.get(l.userId) ?? 0) + 1);
    }

    const names = await this.userNames([...personMap.keys()]);

    // team median ของ costPerOutput → ใช้ตัดสิน outlier flag
    const cpoValues = [...personMap.values()]
      .filter((p) => p.outputs > 0)
      .map((p) => p.costBaht / p.outputs)
      .sort((a, b) => a - b);
    const median = cpoValues.length ? cpoValues[Math.floor(cpoValues.length / 2)] : 0;

    let perPerson = [...personMap.values()].map((p) => {
      const costPerOutput = p.outputs > 0 ? p.costBaht / p.outputs : null;
      const logs2 = logCountByUser.get(p.userId) ?? 0;
      const linkedPct = logs2 > 0 ? Math.round((p.linked / logs2) * 100) : 0;
      let flag: 'ok' | 'review' = 'ok';
      // outlier: บาท/ชิ้นสูงผิดปกติ (>1.75× median ทีม) และมีผลงาน
      if (
        costPerOutput != null &&
        median > 0 &&
        p.outputs >= 1 &&
        costPerOutput > median * 1.75
      ) {
        flag = 'review';
      }
      // ใช้ token/เงินไปแต่ไม่มีผลงานเลย
      if (p.outputs === 0 && p.costBaht > 0) flag = 'review';
      return {
        userId: p.userId,
        name: names.get(p.userId) ?? null,
        quantity: round2(p.quantity),
        costBaht: round2(p.costBaht),
        outputs: p.outputs,
        costPerOutput: costPerOutput != null ? round2(costPerOutput) : null,
        linkedPct,
        flag,
      };
    });
    perPerson.sort((a, b) => b.costBaht - a.costBaht);

    // non-CEO → perPerson เห็นแค่ตัวเอง
    if (!ceo) {
      perPerson = perPerson.filter((p) => p.userId === user.id);
    }

    return { ceo, totals, perTool, perPerson, teamMedianCostPerOutput: round2(median) };
  }

  // ─── LINK SEARCH (autocomplete work picker) ────────────────
  async linkSearch(q: string) {
    const query = q?.trim();
    if (!query) return [];
    const c = { contains: query, mode: 'insensitive' as const };

    const [episodes, shots, contents, imageRequests] = await Promise.all([
      this.prisma.episode.findMany({
        where: { archivedAt: null, OR: [{ title: c }, { displayCode: c }] },
        select: { id: true, title: true, displayCode: true },
        take: 6,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.shot.findMany({
        where: { episode: { displayCode: c } },
        select: {
          id: true,
          shotNumber: true,
          episode: { select: { displayCode: true } },
        },
        take: 6,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.contentItem.findMany({
        where: { archivedAt: null, OR: [{ title: c }, { caption: c }] },
        select: { id: true, title: true, platform: true },
        take: 6,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.imageRequest.findMany({
        where: { status: { not: 'cancelled' }, OR: [{ title: c }, { displayCode: c }] },
        select: { id: true, title: true, displayCode: true },
        take: 6,
        orderBy: { updatedAt: 'desc' },
      }),
    ]);

    return [
      ...episodes.map((e) => ({
        entityType: 'episode',
        entityId: e.id,
        label: `${e.displayCode} · ${e.title}`,
      })),
      ...shots.map((s) => ({
        entityType: 'shot',
        entityId: s.id,
        label: `${s.episode.displayCode} · Shot ${s.shotNumber}`,
      })),
      ...contents.map((ci) => ({
        entityType: 'content',
        entityId: ci.id,
        label: `${ci.title} · ${ci.platform}`,
      })),
      ...imageRequests.map((r) => ({
        entityType: 'image_request',
        entityId: r.id,
        label: `${r.displayCode} · ${r.title}`,
      })),
    ];
  }

  // ─── helpers ───────────────────────────────────────────────
  private dateRange(from?: string, to?: string) {
    if (!from && !to) return undefined;
    // 'to' แบบ YYYY-MM-DD ต้องครอบทั้งวัน (end-of-day) ไม่งั้น usage ของวันสุดท้ายหลุด
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
    const range: { gte?: Date; lte?: Date } = {};
    if (from) range.gte = new Date(from);
    if (to) range.lte = dateOnly.test(to) ? new Date(`${to}T23:59:59.999Z`) : new Date(to);
    return range;
  }

  private async userNames(ids: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids)];
    if (!unique.length) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, name: true },
    });
    return new Map(users.map((u) => [u.id, u.name]));
  }

  private serialize(log: {
    id: string;
    userId: string;
    aiToolId: string;
    usedAt: Date;
    quantity: number;
    costBaht: unknown;
    outputsCount: number;
    outputType: string;
    note: string | null;
    createdAt: Date;
    aiTool: { name: string; unit: string };
    links: { id: string; entityType: string; entityId: string; label: string | null }[];
  }) {
    return {
      id: log.id,
      userId: log.userId,
      aiToolId: log.aiToolId,
      toolName: log.aiTool.name,
      toolUnit: log.aiTool.unit,
      usedAt: log.usedAt,
      quantity: log.quantity,
      costBaht: Number(log.costBaht),
      outputsCount: log.outputsCount,
      outputType: log.outputType,
      note: log.note,
      createdAt: log.createdAt,
      links: log.links.map((lk) => ({
        id: lk.id,
        entityType: lk.entityType,
        entityId: lk.entityId,
        label: lk.label,
      })),
    };
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
