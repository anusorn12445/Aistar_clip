import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/current-user.decorator';
import {
  CreateAiToolDto,
  CreateTopupDto,
  UpdateAiToolDto,
  UpdateTopupDto,
} from './dto/ai-tool.dto';

// เรตเฉลี่ยจริง (blended) ต่อ tool — หัวใจของราคาแม่น
export interface BlendedRateInfo {
  rate: number | null; // บาท/หน่วย (null = ยังไม่รู้ราคา)
  source: 'ledger' | 'default' | 'none';
  totalAmountBaht: number;
  totalQuantity: number;
}

@Injectable()
export class AiToolsService {
  constructor(private prisma: PrismaService) {}

  /**
   * blendedRate(aiToolId) = Σ AiCreditTopup.amountBaht ÷ Σ quantity ของ tool นั้น.
   * ไม่มี top-up (หรือ Σ quantity = 0) → fall back เป็น AiTool.defaultRateBaht → null.
   */
  async blendedRate(aiToolId: string): Promise<BlendedRateInfo> {
    const agg = await this.prisma.aiCreditTopup.aggregate({
      where: { aiToolId },
      _sum: { amountBaht: true, quantity: true },
    });
    const totalAmountBaht = agg._sum.amountBaht ? Number(agg._sum.amountBaht) : 0;
    const totalQuantity = agg._sum.quantity ?? 0;

    if (totalQuantity > 0) {
      return {
        rate: totalAmountBaht / totalQuantity,
        source: 'ledger',
        totalAmountBaht,
        totalQuantity,
      };
    }

    const tool = await this.prisma.aiTool.findUnique({ where: { id: aiToolId } });
    if (tool?.defaultRateBaht != null) {
      return {
        rate: tool.defaultRateBaht,
        source: 'default',
        totalAmountBaht,
        totalQuantity,
      };
    }
    return { rate: null, source: 'none', totalAmountBaht, totalQuantity };
  }

  // ─── AiTool CRUD ───────────────────────────────────────────
  async listTools() {
    const tools = await this.prisma.aiTool.findMany({
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    });
    return Promise.all(
      tools.map(async (t) => {
        const blended = await this.blendedRate(t.id);
        return {
          id: t.id,
          name: t.name,
          unit: t.unit,
          defaultRateBaht: t.defaultRateBaht,
          status: t.status,
          note: t.note,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
          blendedRate: blended.rate,
          rateSource: blended.source,
          totalTopupBaht: blended.totalAmountBaht,
          totalTopupQuantity: blended.totalQuantity,
        };
      }),
    );
  }

  async createTool(dto: CreateAiToolDto) {
    return this.prisma.aiTool.create({
      data: {
        name: dto.name,
        unit: dto.unit,
        defaultRateBaht: dto.defaultRateBaht ?? null,
        status: dto.status ?? 'active',
        note: dto.note ?? null,
      },
    });
  }

  async updateTool(id: string, dto: UpdateAiToolDto) {
    await this.getToolOrThrow(id);
    return this.prisma.aiTool.update({
      where: { id },
      data: {
        name: dto.name,
        unit: dto.unit,
        defaultRateBaht: dto.defaultRateBaht,
        status: dto.status,
        note: dto.note,
      },
    });
  }

  async deleteTool(id: string) {
    await this.getToolOrThrow(id);
    const logCount = await this.prisma.aiUsageLog.count({ where: { aiToolId: id } });
    if (logCount > 0) {
      throw new ConflictException(
        `ลบไม่ได้ — มี usage log ผูกกับ tool นี้อยู่ ${logCount} รายการ (archive แทนได้)`,
      );
    }
    // top-up ledger ผูกกับ tool → ลบด้วยเพื่อไม่ให้ค้าง
    await this.prisma.$transaction([
      this.prisma.aiCreditTopup.deleteMany({ where: { aiToolId: id } }),
      this.prisma.aiTool.delete({ where: { id } }),
    ]);
    return { ok: true };
  }

  // ─── AiCreditTopup CRUD ────────────────────────────────────
  async listTopups(aiToolId: string) {
    await this.getToolOrThrow(aiToolId);
    const rows = await this.prisma.aiCreditTopup.findMany({
      where: { aiToolId },
      orderBy: { purchasedAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      aiToolId: r.aiToolId,
      purchasedAt: r.purchasedAt,
      amountBaht: Number(r.amountBaht),
      quantity: r.quantity,
      note: r.note,
      createdAt: r.createdAt,
    }));
  }

  async createTopup(aiToolId: string, dto: CreateTopupDto, user: AuthUser) {
    await this.getToolOrThrow(aiToolId);
    const row = await this.prisma.aiCreditTopup.create({
      data: {
        aiToolId,
        purchasedAt: new Date(dto.purchasedAt),
        amountBaht: dto.amountBaht,
        quantity: dto.quantity,
        note: dto.note ?? null,
        createdById: user.id,
      },
    });
    // เติมเครดิตแล้ว → blended rate เปลี่ยน: log เก่าที่บันทึกตอน tool ยังไม่มีเรต (costBaht=0)
    // คำนวณต้นทุนใหม่ให้ (quantity × เรตเฉลี่ยใหม่) เฉพาะ tool นี้
    const recomputedLogs = await this.recomputeZeroCostLogs(aiToolId);
    return { ...row, amountBaht: Number(row.amountBaht), recomputedLogs };
  }

  /**
   * คำนวณ costBaht ใหม่ให้ usage log ของ tool นี้ที่ยังเป็น 0 บาท (ตอนบันทึกยังไม่มีเรต)
   * ด้วยเรตเฉลี่ยล่าสุด — คืนจำนวน log ที่อัปเดต (0 ถ้าไม่มีเรต/ไม่มี log ค้าง)
   */
  private async recomputeZeroCostLogs(aiToolId: string): Promise<number> {
    const blended = await this.blendedRate(aiToolId);
    if (blended.rate == null || blended.rate === 0) return 0;
    const zeroLogs = await this.prisma.aiUsageLog.findMany({
      where: { aiToolId, costBaht: 0, quantity: { gt: 0 } },
      select: { id: true, quantity: true },
    });
    if (!zeroLogs.length) return 0;
    const rate = blended.rate;
    await this.prisma.$transaction(
      zeroLogs.map((l) =>
        this.prisma.aiUsageLog.update({
          where: { id: l.id },
          data: { costBaht: l.quantity * rate },
        }),
      ),
    );
    return zeroLogs.length;
  }

  async updateTopup(id: string, dto: UpdateTopupDto) {
    const existing = await this.prisma.aiCreditTopup.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('ไม่พบรายการเติมเครดิต');
    const row = await this.prisma.aiCreditTopup.update({
      where: { id },
      data: {
        purchasedAt: dto.purchasedAt ? new Date(dto.purchasedAt) : undefined,
        amountBaht: dto.amountBaht,
        quantity: dto.quantity,
        note: dto.note,
      },
    });
    return { ...row, amountBaht: Number(row.amountBaht) };
  }

  async deleteTopup(id: string) {
    const existing = await this.prisma.aiCreditTopup.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('ไม่พบรายการเติมเครดิต');
    await this.prisma.aiCreditTopup.delete({ where: { id } });
    return { ok: true };
  }

  private async getToolOrThrow(id: string) {
    const tool = await this.prisma.aiTool.findUnique({ where: { id } });
    if (!tool) throw new NotFoundException('ไม่พบ AI tool');
    return tool;
  }
}
