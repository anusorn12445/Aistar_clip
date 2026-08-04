import { Injectable, NotFoundException } from '@nestjs/common';
import { CharacterBlueprint, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/current-user.decorator';
import {
  CreateCharacterBlueprintDto,
  ReorderCharacterBlueprintsDto,
  UpdateCharacterBlueprintDto,
} from './dto/character-blueprint.dto';
import { BlueprintForInject } from './blueprint-inject';

// Character Blueprint (พิมพ์เขียว) — CRUD, mirror CharacterCategoriesService
// จัดการที่ Settings (setting perm) — active list อ่านได้ด้วย character V (คุมที่ controller)
@Injectable()
export class CharacterBlueprintsService {
  constructor(private prisma: PrismaService) {}

  async list(params: { status?: string; q?: string }) {
    const where: Prisma.CharacterBlueprintWhereInput = {
      ...(params.status ? { status: params.status } : {}),
      ...(params.q
        ? {
            OR: [
              { name: { contains: params.q, mode: 'insensitive' } },
              { description: { contains: params.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    return this.prisma.characterBlueprint.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async get(id: string): Promise<CharacterBlueprint> {
    const bp = await this.prisma.characterBlueprint.findUnique({ where: { id } });
    if (!bp) throw new NotFoundException('ไม่พบพิมพ์เขียว (blueprint)');
    return bp;
  }

  async create(dto: CreateCharacterBlueprintDto, user: AuthUser, via = 'ui') {
    // ถ้าตั้ง isDefault = true → ปลด default ตัวเดิมออกก่อน (มี default ตัวเดียว)
    if (dto.isDefault) await this.clearOtherDefaults(null);
    const blueprint = await this.prisma.characterBlueprint.create({
      data: {
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        icon: dto.icon?.trim() || null,
        houseRules: dto.houseRules?.trim() || null,
        requiredFields: dto.requiredFields ?? [],
        defaults: (dto.defaults ?? undefined) as Prisma.InputJsonValue | undefined,
        isDefault: dto.isDefault ?? false,
        sortOrder: dto.sortOrder ?? 0,
        createdBy: user.id,
      },
    });
    await this.audit(user, via, 'create', blueprint.id, { name: blueprint.name });
    return blueprint;
  }

  async update(id: string, dto: UpdateCharacterBlueprintDto, user: AuthUser, via = 'ui') {
    await this.get(id);
    if (dto.isDefault) await this.clearOtherDefaults(id);

    const data: Prisma.CharacterBlueprintUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.description !== undefined) data.description = dto.description.trim() || null;
    if (dto.icon !== undefined) data.icon = dto.icon.trim() || null;
    if (dto.houseRules !== undefined) data.houseRules = dto.houseRules.trim() || null;
    if (dto.requiredFields !== undefined) data.requiredFields = dto.requiredFields;
    if (dto.defaults !== undefined) data.defaults = dto.defaults as Prisma.InputJsonValue;
    if (dto.isDefault !== undefined) data.isDefault = dto.isDefault;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.status !== undefined) {
      data.status = dto.status;
      data.archivedAt = dto.status === 'archived' ? new Date() : null;
    }

    const blueprint = await this.prisma.characterBlueprint.update({ where: { id }, data });
    await this.audit(user, via, 'update', id, { fields: Object.keys(data) });
    return blueprint;
  }

  // soft archive (mirror category "เก็บเข้ากรุ")
  async archive(id: string, user: AuthUser, via = 'ui') {
    await this.get(id);
    const blueprint = await this.prisma.characterBlueprint.update({
      where: { id },
      data: { status: 'archived', archivedAt: new Date(), isDefault: false },
    });
    await this.audit(user, via, 'archive', id, {});
    return blueprint;
  }

  async reorder(dto: ReorderCharacterBlueprintsDto, user: AuthUser, via = 'ui') {
    await this.prisma.$transaction(
      dto.ids.map((id, index) =>
        this.prisma.characterBlueprint.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );
    await this.audit(user, via, 'reorder', 'character_blueprint', { ids: dto.ids });
    return this.list({});
  }

  /**
   * blueprint ที่ใช้ inject/persist — ถ้าระบุ id และ active ให้ใช้อันนั้น
   * มิฉะนั้น fallback เป็น default (active + isDefault ตัวแรกตาม sortOrder)
   * คืน null ถ้าไม่มีเลย — caller ต้อง degrade อย่างสวยงาม (ไม่ block การสร้าง)
   */
  async resolveForInjection(blueprintId?: string | null): Promise<CharacterBlueprint | null> {
    if (blueprintId) {
      const bp = await this.prisma.characterBlueprint.findFirst({
        where: { id: blueprintId, status: 'active' },
      });
      if (bp) return bp;
    }
    return this.getDefault();
  }

  // default = active isDefault ตัวแรก (ไม่ hard-fail ถ้ามีหลายอัน — เอาตัวแรกตาม sortOrder)
  getDefault(): Promise<CharacterBlueprint | null> {
    return this.prisma.characterBlueprint.findFirst({
      where: { status: 'active', isDefault: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  // แปลง record → subset สำหรับ prompt injection helper
  static toInject(bp: CharacterBlueprint): BlueprintForInject {
    return {
      name: bp.name,
      houseRules: bp.houseRules,
      requiredFields: bp.requiredFields,
      defaults: bp.defaults,
    };
  }

  // ปลด isDefault ของตัวอื่น (ยกเว้น exceptId) — รักษา invariant "default เดียว"
  private clearOtherDefaults(exceptId: string | null) {
    return this.prisma.characterBlueprint.updateMany({
      where: { isDefault: true, ...(exceptId ? { id: { not: exceptId } } : {}) },
      data: { isDefault: false },
    });
  }

  private audit(
    user: AuthUser,
    via: string,
    action: string,
    entityId: string,
    meta: object,
  ) {
    return this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        via,
        action,
        entityType: 'character_blueprint',
        entityId,
        meta: meta as Prisma.InputJsonValue,
      },
    });
  }
}
