import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../auth/current-user.decorator';
import {
  CreateProductStateDto,
  ReorderProductStatesDto,
  SetTransitionsDto,
  UpdateProductStateDto,
  ValidateSequenceDto,
} from './dto/product-state.dto';

export interface SequenceError {
  index: number;
  from: string;
  to: string;
  reason: string;
}

export interface SequenceResult {
  ok: boolean;
  errors: SequenceError[];
  warnings: string[];
}

// ProductState taxonomy + state-machine (SRS "กันลำดับ state ไม่สมเหตุผล")
@Injectable()
export class ProductStatesService {
  constructor(private prisma: PrismaService) {}

  // ── Taxonomy CRUD (mirror CharacterCategoriesService) ──
  async list(params: { status?: string }) {
    const where: Prisma.ProductStateWhereInput = {
      ...(params.status ? { status: params.status } : {}),
    };
    return this.prisma.productState.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
  }

  async create(dto: CreateProductStateDto, user: AuthUser, via = 'ui') {
    const key = await this.generateKey(dto.label);
    const state = await this.prisma.productState.create({
      data: {
        key,
        label: dto.label.trim(),
        sortOrder: dto.sortOrder ?? 0,
        isInitial: dto.isInitial ?? false,
        isTerminal: dto.isTerminal ?? false,
      },
    });
    await this.audit(user, via, 'create', state.id, { key: state.key, label: state.label });
    return state;
  }

  async update(id: string, dto: UpdateProductStateDto, user: AuthUser, via = 'ui') {
    const existing = await this.prisma.productState.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('ไม่พบสถานะสินค้า');

    // key immutable — รับเฉพาะ label/sortOrder/isInitial/isTerminal/status
    const data: Prisma.ProductStateUpdateInput = {};
    if (dto.label !== undefined) data.label = dto.label.trim();
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.isInitial !== undefined) data.isInitial = dto.isInitial;
    if (dto.isTerminal !== undefined) data.isTerminal = dto.isTerminal;
    if (dto.status !== undefined) data.status = dto.status;

    const state = await this.prisma.productState.update({ where: { id }, data });
    await this.audit(user, via, 'update', id, { fields: Object.keys(data) });
    return state;
  }

  async reorder(dto: ReorderProductStatesDto, user: AuthUser, via = 'ui') {
    await this.prisma.$transaction(
      dto.ids.map((id, index) =>
        this.prisma.productState.update({ where: { id }, data: { sortOrder: index } }),
      ),
    );
    await this.audit(user, via, 'reorder', null, { ids: dto.ids });
    return this.list({});
  }

  async remove(id: string, user: AuthUser, via = 'ui') {
    const existing = await this.prisma.productState.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('ไม่พบสถานะสินค้า');
    if (existing.builtin) {
      throw new BadRequestException('สถานะพื้นฐานลบไม่ได้ (เก็บเข้ากรุแทนได้)');
    }

    // in-use guard: transition ใด ๆ อ้างถึง หรือ gesture ใช้เป็น required/resulting state
    const transitionCount = await this.prisma.productStateTransition.count({
      where: { OR: [{ fromStateId: id }, { toStateId: id }] },
    });
    if (transitionCount > 0) {
      throw new ConflictException(
        `สถานะนี้ถูกใช้ในกฎการเปลี่ยนสถานะ (${transitionCount} เส้น) — ลบเส้นเชื่อมก่อน`,
      );
    }
    const gestureCount = await this.prisma.gesture.count({
      where: {
        OR: [{ requiredProductState: existing.key }, { resultingProductState: existing.key }],
      },
    });
    if (gestureCount > 0) {
      throw new ConflictException(
        `มี gesture ใช้สถานะนี้อยู่ (${gestureCount} ท่า) — เก็บเข้ากรุแทนได้`,
      );
    }

    await this.prisma.productState.delete({ where: { id } });
    await this.audit(user, via, 'delete', id, { key: existing.key });
    return { ok: true };
  }

  // ── Transitions: อ่าน/แทนที่ทั้งชุด ──
  async getTransitions() {
    const [states, transitions] = await this.prisma.$transaction([
      this.prisma.productState.findMany({ orderBy: [{ sortOrder: 'asc' }] }),
      this.prisma.productStateTransition.findMany(),
    ]);
    const labelById = new Map(states.map((s) => [s.id, s]));
    return {
      states,
      transitions: transitions.map((t) => ({
        from: labelById.get(t.fromStateId)?.key ?? null,
        to: labelById.get(t.toStateId)?.key ?? null,
        note: t.note,
      })),
    };
  }

  async setTransitions(dto: SetTransitionsDto, user: AuthUser, via = 'ui') {
    const states = await this.prisma.productState.findMany({ select: { id: true, key: true } });
    const idByKey = new Map(states.map((s) => [s.key, s.id]));

    // validate: ทุก state ต้องมีจริง + ห้าม self-loop (เว้นตั้งใจ) + กันคู่ซ้ำ
    const seen = new Set<string>();
    const rows: { fromStateId: string; toStateId: string; note?: string }[] = [];
    for (const t of dto.transitions) {
      const fromId = idByKey.get(t.from);
      const toId = idByKey.get(t.to);
      if (!fromId || !toId) {
        throw new BadRequestException(
          `ไม่พบสถานะ: ${!fromId ? t.from : ''} ${!toId ? t.to : ''}`.trim(),
        );
      }
      if (t.from === t.to && !t.allowSelfLoop) {
        throw new BadRequestException(`ห้ามเปลี่ยนสถานะวนที่ตัวเอง (${t.from} → ${t.to})`);
      }
      const pairKey = `${fromId}|${toId}`;
      if (seen.has(pairKey)) continue; // คู่ซ้ำ — ข้าม
      seen.add(pairKey);
      rows.push({ fromStateId: fromId, toStateId: toId, note: t.note });
    }

    // replace-set: ลบทั้งหมดแล้วสร้างใหม่ใน transaction เดียว
    await this.prisma.$transaction([
      this.prisma.productStateTransition.deleteMany({}),
      ...rows.map((r) =>
        this.prisma.productStateTransition.create({ data: r }),
      ),
    ]);
    await this.audit(user, via, 'set_transitions', null, { count: rows.length });
    return this.getTransitions();
  }

  // ── validate-sequence: กันลำดับ state ที่ไม่สมเหตุผล ──
  async validateSequence(dto: ValidateSequenceDto): Promise<SequenceResult> {
    const errors: SequenceError[] = [];
    const warnings: string[] = [];
    const keys = dto.stateKeys ?? [];

    const [states, transitions] = await this.prisma.$transaction([
      this.prisma.productState.findMany(),
      this.prisma.productStateTransition.findMany(),
    ]);
    const stateByKey = new Map(states.map((s) => [s.key, s]));
    const idByKey = new Map(states.map((s) => [s.key, s.id]));
    const allowed = new Set(transitions.map((t) => `${t.fromStateId}|${t.toStateId}`));

    if (keys.length === 0) {
      warnings.push('ลำดับว่าง — ไม่มีสถานะให้ตรวจสอบ');
      return { ok: true, errors, warnings };
    }

    // first state ควรเป็น isInitial (warn ถ้าไม่ใช่)
    const firstKey = keys[0];
    const first = stateByKey.get(firstKey);
    if (!first) {
      errors.push({ index: 0, from: firstKey, to: firstKey, reason: `ไม่พบสถานะ "${firstKey}"` });
    } else if (!first.isInitial) {
      warnings.push(
        `สถานะเริ่มต้น "${first.label}" ไม่ใช่สถานะเริ่มต้นที่กำหนดไว้ (isInitial) — ตรวจสอบว่าลำดับเริ่มถูกจุด`,
      );
    }

    for (let i = 0; i < keys.length - 1; i++) {
      const fromKey = keys[i];
      const toKey = keys[i + 1];
      const from = stateByKey.get(fromKey);
      const to = stateByKey.get(toKey);
      if (!from) {
        errors.push({ index: i, from: fromKey, to: toKey, reason: `ไม่พบสถานะ "${fromKey}"` });
        continue;
      }
      if (!to) {
        errors.push({ index: i, from: fromKey, to: toKey, reason: `ไม่พบสถานะ "${toKey}"` });
        continue;
      }
      const pairKey = `${idByKey.get(fromKey)}|${idByKey.get(toKey)}`;
      if (!allowed.has(pairKey)) {
        errors.push({
          index: i,
          from: fromKey,
          to: toKey,
          reason: `${from.label} → ${to.label} ไม่ถูกต้อง: ไม่มีเส้นทางการเปลี่ยนสถานะที่กำหนดไว้`,
        });
      }
    }

    return { ok: errors.length === 0, errors, warnings };
  }

  /** key immutable — ascii slug ของ label; ว่าง → state_<uuid8>; กัน key ชนด้วย -2/-3… */
  private async generateKey(label: string): Promise<string> {
    const base =
      label
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || `state_${randomUuidSlug()}`;
    let candidate = base;
    let n = 2;
    while (await this.prisma.productState.findUnique({ where: { key: candidate } })) {
      candidate = `${base}-${n}`;
      n++;
    }
    return candidate;
  }

  private audit(
    user: AuthUser,
    via: string,
    action: string,
    entityId: string | null,
    meta: object,
  ) {
    return this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        via,
        action,
        entityType: 'product_state',
        entityId,
        meta: meta as Prisma.InputJsonValue,
      },
    });
  }
}

function randomUuidSlug(): string {
  const uuid =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : require('node:crypto').randomUUID();
  return uuid.replace(/-/g, '').slice(0, 8);
}
