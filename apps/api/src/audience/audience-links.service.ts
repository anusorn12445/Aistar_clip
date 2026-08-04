import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/current-user.decorator';
import { AudienceLinkItemDto } from './dto/audience-segment.dto';

// สรุป segment แบบย่อ ที่แนบไปกับ link (ให้ UI แสดง chip ได้เลย)
const SEGMENT_SUMMARY = {
  id: true,
  name: true,
  description: true,
  ageMin: true,
  ageMax: true,
  gender: true,
  interests: true,
  platforms: true,
  spendingPower: true,
  region: true,
  painPoint: true,
  status: true,
} satisfies Prisma.AudienceSegmentSelect;

@Injectable()
export class AudienceLinksService {
  constructor(private prisma: PrismaService) {}

  // ─── Character ───────────────────────────────────────────────

  async getCharacterAudiences(characterId: string) {
    await this.mustExistCharacter(characterId);
    const links = await this.prisma.characterAudience.findMany({
      where: { characterId },
      include: { segment: { select: SEGMENT_SUMMARY } },
    });
    return this.shapeLinks(links.map((l) => ({ isPrimary: l.isPrimary, segment: l.segment })));
  }

  async setCharacterAudiences(
    characterId: string,
    items: AudienceLinkItemDto[],
    user: AuthUser,
    via = 'ui',
  ) {
    await this.mustExistCharacter(characterId);
    const clean = await this.validateItems(items);
    await this.prisma.$transaction([
      this.prisma.characterAudience.deleteMany({ where: { characterId } }),
      ...(clean.length
        ? [
            this.prisma.characterAudience.createMany({
              data: clean.map((c) => ({
                characterId,
                segmentId: c.segmentId,
                isPrimary: c.isPrimary,
              })),
            }),
          ]
        : []),
    ]);
    await this.audit(user, via, 'set_audiences', 'character', characterId, {
      count: clean.length,
      primary: clean.find((c) => c.isPrimary)?.segmentId ?? null,
    });
    return this.getCharacterAudiences(characterId);
  }

  // ─── Series ──────────────────────────────────────────────────

  async getSeriesAudiences(seriesId: string) {
    await this.mustExistSeries(seriesId);
    const links = await this.prisma.seriesAudience.findMany({
      where: { seriesId },
      include: { segment: { select: SEGMENT_SUMMARY } },
    });
    return this.shapeLinks(links.map((l) => ({ isPrimary: l.isPrimary, segment: l.segment })));
  }

  async setSeriesAudiences(
    seriesId: string,
    items: AudienceLinkItemDto[],
    user: AuthUser,
    via = 'ui',
  ) {
    await this.mustExistSeries(seriesId);
    const clean = await this.validateItems(items);
    await this.prisma.$transaction([
      this.prisma.seriesAudience.deleteMany({ where: { seriesId } }),
      ...(clean.length
        ? [
            this.prisma.seriesAudience.createMany({
              data: clean.map((c) => ({
                seriesId,
                segmentId: c.segmentId,
                isPrimary: c.isPrimary,
              })),
            }),
          ]
        : []),
    ]);
    await this.audit(user, via, 'set_audiences', 'series', seriesId, {
      count: clean.length,
      primary: clean.find((c) => c.isPrimary)?.segmentId ?? null,
    });
    return this.getSeriesAudiences(seriesId);
  }

  // ─── helpers ─────────────────────────────────────────────────

  private shapeLinks(
    links: { isPrimary: boolean; segment: Prisma.AudienceSegmentGetPayload<{ select: typeof SEGMENT_SUMMARY }> }[],
  ) {
    return links
      .map((l) => ({ segmentId: l.segment.id, isPrimary: l.isPrimary, segment: l.segment }))
      .sort((a, b) => {
        if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
        return a.segment.name.localeCompare(b.segment.name, 'th');
      });
  }

  // dedupe ตาม segmentId, ตรวจ ≤1 primary, ตรวจว่ามี segment จริง
  private async validateItems(items: AudienceLinkItemDto[]) {
    const byId = new Map<string, boolean>();
    for (const it of items) {
      byId.set(it.segmentId, byId.get(it.segmentId) || !!it.isPrimary);
    }
    const clean = [...byId.entries()].map(([segmentId, isPrimary]) => ({ segmentId, isPrimary }));

    const primaries = clean.filter((c) => c.isPrimary).length;
    if (primaries > 1) {
      throw new BadRequestException('ตั้งกลุ่มหลัก (primary) ได้เพียงกลุ่มเดียว');
    }

    if (clean.length) {
      const found = await this.prisma.audienceSegment.count({
        where: { id: { in: clean.map((c) => c.segmentId) } },
      });
      if (found !== clean.length) {
        throw new NotFoundException('มี segment บางรายการที่ไม่มีอยู่ในระบบ');
      }
    }
    return clean;
  }

  private async mustExistCharacter(id: string) {
    const count = await this.prisma.character.count({ where: { id } });
    if (!count) throw new NotFoundException('ไม่พบ character');
  }

  private async mustExistSeries(id: string) {
    const count = await this.prisma.series.count({ where: { id } });
    if (!count) throw new NotFoundException('ไม่พบ series');
  }

  private audit(
    user: AuthUser,
    via: string,
    action: string,
    entityType: string,
    entityId: string,
    meta: object,
  ) {
    return this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        via,
        action,
        entityType,
        entityId,
        meta: meta as Prisma.InputJsonValue,
      },
    });
  }
}
