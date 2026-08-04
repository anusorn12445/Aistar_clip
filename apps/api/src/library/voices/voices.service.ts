import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../auth/current-user.decorator';
import { CreateVoiceDto } from './dto/create-voice.dto';
import { UpdateVoiceDto } from './dto/update-voice.dto';

export interface ListVoicesParams {
  characterId?: string;
  q?: string;
  status?: string;
  sortBy?: string;
  page?: number;
}

// state machine ของ voice profile — approve ต้องเป็นมนุษย์ผ่าน UI (pattern จาก characters.service)
const TRANSITIONS: Record<string, string[]> = {
  draft: ['approved', 'archived'],
  approved: ['archived'],
  archived: [],
};

const SORT_FIELDS = ['updatedAt', 'voiceType'] as const;

@Injectable()
export class VoicesService {
  constructor(private prisma: PrismaService) {}

  async list(params: ListVoicesParams) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const take = 20;

    const where: Prisma.CharacterVoiceProfileWhereInput = {
      ...(params.characterId ? { characterId: params.characterId } : {}),
      ...(params.status ? { status: params.status } : { status: { not: 'archived' } }),
      ...(params.q
        ? {
            OR: [
              { voiceType: { contains: params.q, mode: 'insensitive' } },
              { tone: { contains: params.q, mode: 'insensitive' } },
              { accent: { contains: params.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const sortBy = SORT_FIELDS.includes(params.sortBy as (typeof SORT_FIELDS)[number])
      ? (params.sortBy as (typeof SORT_FIELDS)[number])
      : 'updatedAt';
    const orderBy: Prisma.CharacterVoiceProfileOrderByWithRelationInput =
      sortBy === 'voiceType' ? { voiceType: 'asc' } : { updatedAt: 'desc' };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.characterVoiceProfile.findMany({ where, orderBy, skip: (page - 1) * take, take }),
      this.prisma.characterVoiceProfile.count({ where }),
    ]);

    // schema ไม่มี relation → join character เอง (nameTh/displayCode)
    const characterIds = [...new Set(items.map((v) => v.characterId))];
    const characters = characterIds.length
      ? await this.prisma.character.findMany({
          where: { id: { in: characterIds } },
          select: { id: true, nameTh: true, displayCode: true },
        })
      : [];
    const charMap = new Map(characters.map((c) => [c.id, c]));

    return {
      items: items.map((v) => ({ ...v, character: charMap.get(v.characterId) ?? null })),
      total,
      page,
      pageSize: take,
    };
  }

  async get(id: string) {
    const voice = await this.prisma.characterVoiceProfile.findUnique({ where: { id } });
    if (!voice) throw new NotFoundException('ไม่พบ voice profile');
    return voice;
  }

  async create(dto: CreateVoiceDto, user: AuthUser, via = 'ui') {
    const character = await this.prisma.character.findUnique({
      where: { id: dto.characterId },
      select: { id: true },
    });
    if (!character) throw new BadRequestException('ไม่พบ character ที่ระบุ');

    const voice = await this.prisma.characterVoiceProfile.create({ data: { ...dto } });
    await this.audit(user, via, 'create', voice.id, { characterId: dto.characterId });
    return voice;
  }

  async update(id: string, dto: UpdateVoiceDto, user: AuthUser, via = 'ui') {
    await this.get(id);
    const voice = await this.prisma.characterVoiceProfile.update({
      where: { id },
      data: { ...dto },
    });
    await this.audit(user, via, 'update', id, { fields: Object.keys(dto) });
    return voice;
  }

  async changeStatus(id: string, next: string, user: AuthUser, via = 'ui') {
    const existing = await this.get(id);

    const allowed = TRANSITIONS[existing.status] ?? [];
    if (!allowed.includes(next)) {
      throw new BadRequestException(`เปลี่ยน status ${existing.status} → ${next} ไม่ได้`);
    }

    if (next === 'approved') {
      if (via !== 'ui') {
        // guardrail §28.2: ห้าม approve แทนมนุษย์
        throw new ForbiddenException('การ approve ทำได้ผ่าน UI โดยมนุษย์เท่านั้น');
      }
      const canApprove = await this.prisma.rolePermission.count({
        where: { module: 'voice', actions: { has: 'A' }, role: { key: { in: user.roles } } },
      });
      if (!canApprove) throw new ForbiddenException('ต้องมีสิทธิ์ Approve');
    }

    const voice = await this.prisma.characterVoiceProfile.update({
      where: { id },
      data: { status: next },
    });
    await this.audit(user, via, 'status_change', id, { from: existing.status, to: next });
    return voice;
  }

  private audit(user: AuthUser, via: string, action: string, entityId: string, meta: object) {
    return this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        via,
        action,
        entityType: 'voice',
        entityId,
        meta: meta as Prisma.InputJsonValue,
      },
    });
  }
}
