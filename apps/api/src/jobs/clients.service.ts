import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/current-user.decorator';
import { CreateClientDto, UpdateClientDto } from './dto/client.dto';

export interface ListClientsParams {
  q?: string;
  status?: string;
}

@Injectable()
export class ClientsService {
  constructor(private prisma: PrismaService) {}

  async list(params: ListClientsParams) {
    const where: Prisma.ClientWhereInput = {
      ...(params.status ? { status: params.status } : {}),
      ...(params.q
        ? {
            OR: [
              { name: { contains: params.q, mode: 'insensitive' } },
              { contactName: { contains: params.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const rows = await this.prisma.client.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { jobs: true } } },
    });

    return rows.map(({ _count, ...c }) => ({ ...c, jobCount: _count.jobs }));
  }

  async get(id: string) {
    const client = await this.prisma.client.findUnique({
      where: { id },
      include: { brand: { select: { id: true, name: true } } },
    });
    if (!client) throw new NotFoundException('ไม่พบลูกค้า');

    const jobs = await this.prisma.job.findMany({
      where: { clientId: id, archivedAt: null },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        displayCode: true,
        title: true,
        type: true,
        status: true,
        priority: true,
        dueDate: true,
        quotePrice: true,
        updatedAt: true,
      },
    });

    return { ...client, jobs };
  }

  async create(dto: CreateClientDto, user: AuthUser, via = 'ui') {
    if (dto.brandId) {
      const brand = await this.prisma.brand.findUnique({ where: { id: dto.brandId } });
      if (!brand) throw new BadRequestException('ไม่พบแบรนด์ที่เลือก');
    }
    const client = await this.prisma.client.create({ data: { ...dto } });
    await this.audit(user, via, 'create', client.id, { name: client.name });
    return client;
  }

  async update(id: string, dto: UpdateClientDto, user: AuthUser, via = 'ui') {
    await this.findRaw(id);
    if (dto.brandId) {
      const brand = await this.prisma.brand.findUnique({ where: { id: dto.brandId } });
      if (!brand) throw new BadRequestException('ไม่พบแบรนด์ที่เลือก');
    }
    const client = await this.prisma.client.update({ where: { id }, data: { ...dto } });
    await this.audit(user, via, 'update', id, { fields: Object.keys(dto) });
    return client;
  }

  private async findRaw(id: string) {
    const client = await this.prisma.client.findUnique({ where: { id } });
    if (!client) throw new NotFoundException('ไม่พบลูกค้า');
    return client;
  }

  private audit(user: AuthUser, via: string, action: string, entityId: string, meta: object) {
    return this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        via,
        action,
        entityType: 'client',
        entityId,
        meta: meta as Prisma.InputJsonValue,
      },
    });
  }
}
