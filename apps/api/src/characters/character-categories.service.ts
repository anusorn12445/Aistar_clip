import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/current-user.decorator';
import {
  CreateCharacterCategoryDto,
  ReorderCharacterCategoriesDto,
  UpdateCharacterCategoryDto,
} from './dto/character-category.dto';

// Taxonomy "ประเภทตัวละคร" — mirror ProductCategory (CategoriesService)
// ต่างกันตรง usage นับจาก CharacterCategoryLink (many-to-many) ไม่ใช่ scalar field
@Injectable()
export class CharacterCategoriesService {
  constructor(private prisma: PrismaService) {}

  async list(params: { status?: string }) {
    const where: Prisma.CharacterCategoryWhereInput = {
      ...(params.status ? { status: params.status } : {}),
    };
    const categories = await this.prisma.characterCategory.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });

    // characterCount = จำนวนตัวละครที่ผูก category นี้ (batch group-by เดียว ไม่มี N+1)
    const grouped = await this.prisma.characterCategoryLink.groupBy({
      by: ['categoryId'],
      _count: { _all: true },
    });
    const countById = new Map(grouped.map((g) => [g.categoryId, g._count._all]));

    return categories.map((c) => ({
      ...c,
      characterCount: countById.get(c.id) ?? 0,
    }));
  }

  async create(dto: CreateCharacterCategoryDto, user: AuthUser, via = 'ui') {
    const key = await this.generateKey(dto.label);
    const category = await this.prisma.characterCategory.create({
      data: {
        key,
        label: dto.label.trim(),
        sortOrder: dto.sortOrder ?? 0,
      },
    });
    await this.audit(user, via, 'create', category.id, {
      key: category.key,
      label: category.label,
    });
    return { ...category, characterCount: 0 };
  }

  async update(
    id: string,
    dto: UpdateCharacterCategoryDto,
    user: AuthUser,
    via = 'ui',
  ) {
    const existing = await this.prisma.characterCategory.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('ไม่พบประเภทตัวละคร');

    // key เปลี่ยนไม่ได้ (immutable) — รับเฉพาะ label/sortOrder/status
    const data: Prisma.CharacterCategoryUpdateInput = {};
    if (dto.label !== undefined) data.label = dto.label.trim();
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.status !== undefined) data.status = dto.status;

    const category = await this.prisma.characterCategory.update({ where: { id }, data });
    const characterCount = await this.prisma.characterCategoryLink.count({
      where: { categoryId: id },
    });
    await this.audit(user, via, 'update', id, { fields: Object.keys(data) });
    return { ...category, characterCount };
  }

  async reorder(dto: ReorderCharacterCategoriesDto, user: AuthUser, via = 'ui') {
    await this.prisma.$transaction(
      dto.ids.map((id, index) =>
        this.prisma.characterCategory.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );
    await this.audit(user, via, 'reorder', 'character_category', { ids: dto.ids });
    return this.list({});
  }

  async remove(id: string, user: AuthUser, via = 'ui') {
    const existing = await this.prisma.characterCategory.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('ไม่พบประเภทตัวละคร');
    if (existing.builtin) {
      throw new BadRequestException('ประเภทพื้นฐานลบไม่ได้ (เก็บเข้ากรุแทนได้)');
    }
    const characterCount = await this.prisma.characterCategoryLink.count({
      where: { categoryId: id },
    });
    if (characterCount > 0) {
      throw new ConflictException(
        `มีตัวละครใช้ประเภทนี้อยู่ (${characterCount} ตัว) เก็บเข้ากรุแทนได้`,
      );
    }
    await this.prisma.characterCategory.delete({ where: { id } });
    await this.audit(user, via, 'delete', id, { key: existing.key });
    return { ok: true };
  }

  /** key immutable — ascii slug ของ label; ถ้าว่าง (ไทยล้วน) fallback เป็น cat_<uuid8>; กัน key ชนด้วย -2/-3… */
  private async generateKey(label: string): Promise<string> {
    const base =
      label
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || `cat_${randomUuidSlug()}`;

    let candidate = base;
    let n = 2;
    // loop จนกว่าจะไม่ชน (unique constraint บน key)
    while (
      await this.prisma.characterCategory.findUnique({ where: { key: candidate } })
    ) {
      candidate = `${base}-${n}`;
      n++;
    }
    return candidate;
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
        entityType: 'character_category',
        entityId,
        meta: meta as Prisma.InputJsonValue,
      },
    });
  }
}

// first 8 chars ของ uuid v4 (ไม่พึ่ง crypto import — ใช้ randomUUID ผ่าน globalThis)
function randomUuidSlug(): string {
  const uuid =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : require('node:crypto').randomUUID();
  return uuid.replace(/-/g, '').slice(0, 8);
}
