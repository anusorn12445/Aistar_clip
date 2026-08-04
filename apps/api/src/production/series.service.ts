import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ShotStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/current-user.decorator';
import { TIE_IN_PRODUCT_SUMMARY, shapeTieIns } from '../tie-ins/tie-in-products.service';
import {
  BROADCAST_DAYS,
  CalendarSuggestDto,
  CreateSeasonDto,
  CreateSeriesDto,
  CreateSeriesEpisodeDto,
  SeriesCastDto,
  UpdateSeasonDto,
  UpdateSeriesDto,
} from './dto/series.dto';

const SERIES_SORT_FIELDS = ['name', 'updatedAt'] as const;
type SeriesSortField = (typeof SERIES_SORT_FIELDS)[number];

// วันภาษาไทยสำหรับ title ของ ContentItem ที่ calendar-suggest สร้าง
const DAY_LABEL_TH: Record<string, string> = {
  mon: 'จันทร์',
  tue: 'อังคาร',
  wed: 'พุธ',
  thu: 'พฤหัส',
  fri: 'ศุกร์',
  sat: 'เสาร์',
  sun: 'อาทิตย์',
};

// JS getUTCDay(): 0=sun..6=sat → key ของเรา
const JS_DAY_TO_KEY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000; // Asia/Bangkok = UTC+7 คงที่ ไม่มี DST

interface BroadcastSlot {
  day: string;
  time: string;
  platform: string;
}

@Injectable()
export class SeriesService {
  constructor(private prisma: PrismaService) {}

  // ─── List (การ์ดหน้า /series) ────────────────────────────────

  async list(params: {
    q?: string;
    status?: string;
    universe?: string;
    sortBy?: string;
    page?: number;
  }) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const take = 20;
    const sortBy: SeriesSortField = SERIES_SORT_FIELDS.includes(params.sortBy as SeriesSortField)
      ? (params.sortBy as SeriesSortField)
      : 'updatedAt';

    const where: Prisma.SeriesWhereInput = {
      ...(params.status ? { status: params.status } : {}),
      ...(params.universe ? { universe: { contains: params.universe, mode: 'insensitive' } } : {}),
      ...(params.q
        ? {
            OR: [
              { name: { contains: params.q, mode: 'insensitive' } },
              { premise: { contains: params.q, mode: 'insensitive' } },
              { universe: { contains: params.q, mode: 'insensitive' } },
              { description: { contains: params.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.series.findMany({
        where,
        orderBy: sortBy === 'name' ? { name: 'asc' } : { updatedAt: 'desc' },
        skip: (page - 1) * take,
        take,
        include: {
          _count: { select: { episodes: true, seasons: true } },
          characters: { take: 3 },
        },
      }),
      this.prisma.series.count({ where }),
    ]);

    const ids = rows.map((s) => s.id);

    // batch: character rows ของ cast preview + ตอนล่าสุดต่อ series
    const castCharacterIds = [...new Set(rows.flatMap((s) => s.characters.map((c) => c.characterId)))];
    const [castRows, latestEpisodes] = await Promise.all([
      castCharacterIds.length
        ? this.prisma.character.findMany({
            where: { id: { in: castCharacterIds } },
            select: { id: true, nameTh: true, displayCode: true },
          })
        : Promise.resolve([]),
      ids.length
        ? this.prisma.episode.findMany({
            where: { seriesId: { in: ids }, archivedAt: null },
            orderBy: { updatedAt: 'desc' },
            select: { seriesId: true, displayCode: true, status: true },
          })
        : Promise.resolve([]),
    ]);
    const castMap = new Map(castRows.map((c) => [c.id, c] as const));
    const latestMap = new Map<string, { displayCode: string; status: string }>();
    for (const ep of latestEpisodes) {
      if (ep.seriesId && !latestMap.has(ep.seriesId)) {
        latestMap.set(ep.seriesId, { displayCode: ep.displayCode, status: ep.status });
      }
    }

    const items = rows.map((s) => ({
      id: s.id,
      name: s.name,
      universe: s.universe,
      description: s.description,
      premise: s.premise,
      coverAssetId: s.coverAssetId,
      status: s.status,
      updatedAt: s.updatedAt,
      episodeCount: s._count.episodes,
      seasonCount: s._count.seasons,
      castPreview: s.characters
        .map((link) => castMap.get(link.characterId))
        .filter((c): c is { id: string; nameTh: string; displayCode: string } => Boolean(c)),
      latestEpisode: latestMap.get(s.id) ?? null,
      // backward compat กับหน้าเดิมที่อ่าน _count.episodes
      _count: { episodes: s._count.episodes },
    }));

    return { items, total, page, pageSize: take };
  }

  // ─── Detail (ศูนย์บัญชาการ /series/:id) ──────────────────────

  async get(id: string) {
    const series = await this.prisma.series.findUnique({
      where: { id },
      include: {
        seasons: {
          orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
          include: { products: true },
        },
        characters: true,
        locations: true,
      },
    });
    if (!series) throw new NotFoundException('ไม่พบ series');

    const productIds = [...new Set(series.seasons.flatMap((s) => s.products.map((p) => p.productId)))];
    const characterIds = series.characters.map((c) => c.characterId);
    const locationIds = series.locations.map((l) => l.locationId);

    const [productRows, characterRows, locationRows, episodes, audienceLinks, tieInLinks] =
      await Promise.all([
      productIds.length
        ? this.prisma.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, name: true, displayCode: true },
          })
        : Promise.resolve([]),
      characterIds.length
        ? this.prisma.character.findMany({
            where: { id: { in: characterIds } },
            select: { id: true, displayCode: true, nameTh: true, nameEn: true, status: true },
          })
        : Promise.resolve([]),
      locationIds.length
        ? this.prisma.location.findMany({
            where: { id: { in: locationIds } },
            select: { id: true, name: true, type: true, mood: true },
          })
        : Promise.resolve([]),
      this.prisma.episode.findMany({
        where: { seriesId: id, archivedAt: null },
        orderBy: [{ season: 'asc' }, { episodeNumber: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          displayCode: true,
          episodeNumber: true,
          season: true,
          title: true,
          logline: true,
          status: true,
          updatedAt: true,
        },
      }),
      // คนดูเป้าหมาย — อ้างอิง taxonomy กลาง (Audience Segment)
      this.prisma.seriesAudience.findMany({
        where: { seriesId: id },
        include: {
          segment: {
            select: { id: true, name: true, gender: true, ageMin: true, ageMax: true, status: true },
          },
        },
      }),
      // สินค้าที่ tie-in (ไม่บังคับ)
      this.prisma.seriesProduct.findMany({
        where: { seriesId: id },
        include: { product: { select: TIE_IN_PRODUCT_SUMMARY } },
      }),
    ]);

    // shot counts (approved/total) ต่อ episode
    const episodeIds = episodes.map((e) => e.id);
    const shotGroups = episodeIds.length
      ? await this.prisma.shot.groupBy({
          by: ['episodeId', 'status'],
          where: { episodeId: { in: episodeIds } },
          _count: { _all: true },
        })
      : [];
    const shotMap = new Map<string, { approved: number; total: number }>();
    for (const g of shotGroups) {
      const entry = shotMap.get(g.episodeId) ?? { approved: 0, total: 0 };
      entry.total += g._count._all;
      if ((g.status as ShotStatus) === 'approved') entry.approved += g._count._all;
      shotMap.set(g.episodeId, entry);
    }

    const productMap = new Map(productRows.map((p) => [p.id, p] as const));
    const characterMap = new Map(characterRows.map((c) => [c.id, c] as const));
    const locationMap = new Map(locationRows.map((l) => [l.id, l] as const));

    return {
      ...series,
      seasons: series.seasons.map((s) => ({
        id: s.id,
        label: s.label,
        arc: s.arc,
        status: s.status,
        sortOrder: s.sortOrder,
        products: s.products
          .map((p) => productMap.get(p.productId))
          .filter((p): p is { id: string; name: string; displayCode: string } => Boolean(p)),
      })),
      cast: series.characters.map((link) => ({
        characterId: link.characterId,
        role: link.role,
        character: characterMap.get(link.characterId) ?? null,
      })),
      locations: series.locations.map((link) => ({
        locationId: link.locationId,
        location: locationMap.get(link.locationId) ?? null,
      })),
      characters: undefined,
      episodes: episodes.map((e) => ({
        ...e,
        shotCounts: shotMap.get(e.id) ?? { approved: 0, total: 0 },
      })),
      episodeCount: episodes.length,
      audiences: audienceLinks
        .map((a) => ({ segmentId: a.segmentId, isPrimary: a.isPrimary, segment: a.segment }))
        .sort((a, b) => {
          if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
          return a.segment.name.localeCompare(b.segment.name, 'th');
        }),
      tieInProducts: shapeTieIns(tieInLinks),
    };
  }

  // ─── Create / Update ─────────────────────────────────────────

  async create(dto: CreateSeriesDto, user: AuthUser, via = 'ui') {
    const series = await this.prisma.series.create({ data: dto });
    await this.audit(user, via, 'create', 'series', series.id, { name: series.name });
    return series;
  }

  async update(id: string, dto: UpdateSeriesDto, user: AuthUser, via = 'ui') {
    const existing = await this.prisma.series.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('ไม่พบ series');

    if (dto.coverAssetId) {
      const asset = await this.prisma.asset.count({
        where: { id: dto.coverAssetId, archivedAt: null },
      });
      if (!asset) throw new NotFoundException('ไม่พบ asset สำหรับรูปปก');
    }

    const { bible, broadcastSchedule, ...fields } = dto;
    const series = await this.prisma.series.update({
      where: { id },
      data: {
        ...fields,
        ...(bible !== undefined ? { bible: bible as Prisma.InputJsonValue } : {}),
        ...(broadcastSchedule !== undefined
          ? { broadcastSchedule: broadcastSchedule as unknown as Prisma.InputJsonValue }
          : {}),
      },
    });
    await this.audit(user, via, 'update', 'series', id, { fields: Object.keys(dto) });
    return series;
  }

  // ─── Cast (นักแสดงประจำเรื่อง) ───────────────────────────────

  async addCharacter(id: string, dto: SeriesCastDto, user: AuthUser, via = 'ui') {
    await this.mustExist(id);
    const character = await this.prisma.character.findUnique({ where: { id: dto.characterId } });
    if (!character) throw new NotFoundException('ไม่พบ character');
    const role = dto.role ?? 'main';
    await this.prisma.seriesCharacter.upsert({
      where: { seriesId_characterId: { seriesId: id, characterId: dto.characterId } },
      create: { seriesId: id, characterId: dto.characterId, role },
      update: { role },
    });
    await this.audit(user, via, 'add_cast', 'series', id, { characterId: dto.characterId, role });
    return { ok: true };
  }

  async removeCharacter(id: string, characterId: string, user: AuthUser, via = 'ui') {
    await this.mustExist(id);
    await this.prisma.seriesCharacter.deleteMany({ where: { seriesId: id, characterId } });
    await this.audit(user, via, 'remove_cast', 'series', id, { characterId });
    return { ok: true };
  }

  async addLocation(id: string, locationId: string, user: AuthUser, via = 'ui') {
    await this.mustExist(id);
    const location = await this.prisma.location.findUnique({ where: { id: locationId } });
    if (!location) throw new NotFoundException('ไม่พบ location');
    await this.prisma.seriesLocation.upsert({
      where: { seriesId_locationId: { seriesId: id, locationId } },
      create: { seriesId: id, locationId },
      update: {},
    });
    await this.audit(user, via, 'add_location', 'series', id, { locationId });
    return { ok: true };
  }

  async removeLocation(id: string, locationId: string, user: AuthUser, via = 'ui') {
    await this.mustExist(id);
    await this.prisma.seriesLocation.deleteMany({ where: { seriesId: id, locationId } });
    await this.audit(user, via, 'remove_location', 'series', id, { locationId });
    return { ok: true };
  }

  // ─── Seasons ─────────────────────────────────────────────────

  async createSeason(id: string, dto: CreateSeasonDto, user: AuthUser, via = 'ui') {
    await this.mustExist(id);
    const label = dto.label.trim();
    if (!label) throw new BadRequestException('label ของ season ห้ามว่าง');
    const duplicate = await this.prisma.seriesSeason.count({ where: { seriesId: id, label } });
    if (duplicate) throw new ConflictException(`มี season "${label}" ในซีรีส์นี้อยู่แล้ว`);
    const sortOrder = await this.prisma.seriesSeason.count({ where: { seriesId: id } });
    const season = await this.prisma.seriesSeason.create({
      data: { seriesId: id, label, arc: dto.arc, sortOrder },
    });
    await this.audit(user, via, 'create_season', 'series', id, { seasonId: season.id, label });
    return season;
  }

  async updateSeason(seasonId: string, dto: UpdateSeasonDto, user: AuthUser, via = 'ui') {
    const existing = await this.prisma.seriesSeason.findUnique({ where: { id: seasonId } });
    if (!existing) throw new NotFoundException('ไม่พบ season');
    if (dto.label && dto.label.trim() !== existing.label) {
      const duplicate = await this.prisma.seriesSeason.count({
        where: { seriesId: existing.seriesId, label: dto.label.trim(), id: { not: seasonId } },
      });
      if (duplicate) throw new ConflictException(`มี season "${dto.label.trim()}" ในซีรีส์นี้อยู่แล้ว`);
    }
    const season = await this.prisma.seriesSeason.update({
      where: { id: seasonId },
      data: { ...dto, ...(dto.label ? { label: dto.label.trim() } : {}) },
    });
    // sync Episode.season string เมื่อเปลี่ยน label — ตอนใน season เดิมจะได้ไม่หลุด group
    if (dto.label && dto.label.trim() !== existing.label) {
      await this.prisma.episode.updateMany({
        where: { seriesId: existing.seriesId, season: existing.label },
        data: { season: dto.label.trim() },
      });
    }
    await this.audit(user, via, 'update_season', 'series', existing.seriesId, {
      seasonId,
      fields: Object.keys(dto),
    });
    return season;
  }

  async addSeasonProduct(seasonId: string, productId: string, user: AuthUser, via = 'ui') {
    const season = await this.prisma.seriesSeason.findUnique({ where: { id: seasonId } });
    if (!season) throw new NotFoundException('ไม่พบ season');
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('ไม่พบ product');
    await this.prisma.seasonProduct.upsert({
      where: { seasonId_productId: { seasonId, productId } },
      create: { seasonId, productId },
      update: {},
    });
    await this.audit(user, via, 'add_season_product', 'series', season.seriesId, { seasonId, productId });
    return { ok: true };
  }

  async removeSeasonProduct(seasonId: string, productId: string, user: AuthUser, via = 'ui') {
    const season = await this.prisma.seriesSeason.findUnique({ where: { id: seasonId } });
    if (!season) throw new NotFoundException('ไม่พบ season');
    await this.prisma.seasonProduct.deleteMany({ where: { seasonId, productId } });
    await this.audit(user, via, 'remove_season_product', 'series', season.seriesId, { seasonId, productId });
    return { ok: true };
  }

  // ─── สร้างตอนถัดไปใน season (auto number + auto-link cast) ──

  async createEpisode(id: string, dto: CreateSeriesEpisodeDto, user: AuthUser, via = 'ui') {
    const series = await this.prisma.series.findUnique({
      where: { id },
      include: { characters: true, locations: true },
    });
    if (!series) throw new NotFoundException('ไม่พบ series');

    const season = dto.season.trim();
    if (!season) throw new BadRequestException('ต้องระบุ season');

    const maxAgg = await this.prisma.episode.aggregate({
      where: { seriesId: id, season, archivedAt: null },
      _max: { episodeNumber: true },
    });
    const episodeNumber = (maxAgg._max.episodeNumber ?? 0) + 1;

    const count = await this.prisma.episode.count();
    const displayCode = `EP-${String(count + 1).padStart(4, '0')}`;

    const episode = await this.prisma.episode.create({
      data: {
        displayCode,
        title: dto.title,
        seriesId: id,
        season,
        episodeNumber,
        logline: dto.logline,
        hook: dto.hook,
        twist: dto.twist,
        cta: dto.cta,
        script: dto.script,
        status: 'idea',
        // location แรกของซีรีส์เป็นค่าตั้งต้น (ถ้ามี)
        locationId: series.locations[0]?.locationId ?? null,
        // auto-link นักแสดงประจำเรื่องทุกคน
        ...(series.characters.length
          ? {
              characters: {
                create: series.characters.map((c) => ({ characterId: c.characterId })),
              },
            }
          : {}),
      },
    });

    await this.audit(user, via, 'create', 'episode', episode.id, {
      displayCode,
      seriesId: id,
      season,
      episodeNumber,
      autoLinkedCast: series.characters.length,
      from: 'series_hub',
    });
    return episode;
  }

  // ─── Analytics (Layer 3) ─────────────────────────────────────

  async analytics(id: string) {
    await this.mustExist(id);

    const episodes = await this.prisma.episode.findMany({
      where: { seriesId: id, archivedAt: null },
      orderBy: [{ season: 'asc' }, { episodeNumber: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, displayCode: true, episodeNumber: true, season: true, title: true },
    });
    const episodeIds = episodes.map((e) => e.id);

    const perfRows = episodeIds.length
      ? await this.prisma.contentPerformance.findMany({
          where: { contentItem: { episodeId: { in: episodeIds } } },
          select: {
            views: true,
            likes: true,
            orders: true,
            gmv: true,
            contentItem: { select: { episodeId: true } },
          },
        })
      : [];

    const perEpisode = new Map<string, { views: number; likes: number; gmv: number; orders: number }>();
    for (const p of perfRows) {
      const epId = p.contentItem?.episodeId;
      if (!epId) continue;
      const agg = perEpisode.get(epId) ?? { views: 0, likes: 0, gmv: 0, orders: 0 };
      agg.views += p.views ?? 0;
      agg.likes += p.likes ?? 0;
      agg.orders += p.orders ?? 0;
      agg.gmv += p.gmv ? Number(p.gmv) : 0;
      perEpisode.set(epId, agg);
    }

    // drop-off เทียบตอนก่อนหน้าใน season เดียวกัน
    let prev: { season: string | null; views: number } | null = null;
    const items = episodes.map((e) => {
      const agg = perEpisode.get(e.id) ?? { views: 0, likes: 0, gmv: 0, orders: 0 };
      let dropOffPct: number | null = null;
      if (prev && prev.season === (e.season ?? null) && prev.views > 0) {
        dropOffPct = Math.round(((prev.views - agg.views) / prev.views) * 1000) / 10;
      }
      prev = { season: e.season ?? null, views: agg.views };
      return {
        episodeId: e.id,
        displayCode: e.displayCode,
        episodeNumber: e.episodeNumber,
        season: e.season,
        title: e.title,
        ...agg,
        dropOffPct,
      };
    });

    // rollup ต่อ season
    const seasonMap = new Map<
      string,
      { views: number; gmv: number; dropOffs: number[]; episodeCount: number }
    >();
    for (const it of items) {
      const key = it.season ?? 'ยังไม่จัดซีซัน';
      const agg = seasonMap.get(key) ?? { views: 0, gmv: 0, dropOffs: [], episodeCount: 0 };
      agg.views += it.views;
      agg.gmv += it.gmv;
      agg.episodeCount += 1;
      if (it.dropOffPct !== null) agg.dropOffs.push(it.dropOffPct);
      seasonMap.set(key, agg);
    }
    const seasons = [...seasonMap.entries()].map(([season, agg]) => ({
      season,
      views: agg.views,
      gmv: Math.round(agg.gmv * 100) / 100,
      episodeCount: agg.episodeCount,
      avgDropOff: agg.dropOffs.length
        ? Math.round((agg.dropOffs.reduce((a, b) => a + b, 0) / agg.dropOffs.length) * 10) / 10
        : null,
    }));

    // sequel suggestion — ตอนที่ (views + engagement) ดีที่สุด
    const hasData = items.some((it) => it.views > 0 || it.likes > 0 || it.orders > 0 || it.gmv > 0);
    let sequelSuggestion: { episodeId: string; title: string; displayCode: string; reason: string } | null =
      null;
    if (hasData) {
      const best = [...items].sort(
        (a, b) => b.views + b.likes * 5 + b.orders * 100 - (a.views + a.likes * 5 + a.orders * 100),
      )[0];
      if (best && best.views + best.likes + best.orders > 0) {
        sequelSuggestion = {
          episodeId: best.episodeId,
          title: best.title,
          displayCode: best.displayCode,
          reason: `${best.displayCode} "${best.title}" ทำผลงานดีที่สุด (${best.views.toLocaleString()} views, ${best.likes.toLocaleString()} likes${best.orders ? `, ${best.orders} orders` : ''}) — สูตรของตอนนี้เหมาะจะต่อยอดเป็นตอนถัดไปหรือ spin-off`,
        };
      }
    }

    return { items, seasons, sequelSuggestion, hasData };
  }

  // ─── Calendar Suggest (Layer 3) ──────────────────────────────

  async calendarSuggest(id: string, dto: CalendarSuggestDto, user: AuthUser, via = 'ui') {
    // สร้าง ContentItem → ต้องมีสิทธิ์ C ใน module content (pattern เดียวกับ approve check)
    const canCreateContent = await this.prisma.rolePermission.count({
      where: { module: 'content', actions: { has: 'C' }, role: { key: { in: user.roles } } },
    });
    if (!canCreateContent) {
      throw new ForbiddenException('ต้องมีสิทธิ์ Create ใน module content จึงเสนอลงปฏิทินได้');
    }

    const series = await this.prisma.series.findUnique({
      where: { id },
      include: { characters: true },
    });
    if (!series) throw new NotFoundException('ไม่พบ series');

    const schedule = (Array.isArray(series.broadcastSchedule) ? series.broadcastSchedule : []) as unknown as BroadcastSlot[];
    const validSlots = schedule.filter(
      (s) =>
        s &&
        (BROADCAST_DAYS as readonly string[]).includes(s.day) &&
        /^([01]\d|2[0-3]):[0-5]\d$/.test(s.time ?? '') &&
        typeof s.platform === 'string' &&
        s.platform,
    );
    if (!validSlots.length) {
      throw new BadRequestException(
        'ซีรีส์นี้ยังไม่มีตารางออกอากาศ — ตั้ง broadcastSchedule ในแท็บ Broadcast ก่อนจึงเสนอลงปฏิทินได้',
      );
    }

    const weeks = dto.weeks ?? 4;
    const season = dto.season.trim();

    // วันเริ่ม (ตีความแบบวันที่ท้องถิ่น Bangkok)
    let baseUtcMidnight: number;
    if (dto.startDate) {
      const parsed = Date.parse(`${dto.startDate.slice(0, 10)}T00:00:00Z`);
      if (Number.isNaN(parsed)) throw new BadRequestException('startDate ไม่ใช่วันที่ที่ถูกต้อง');
      baseUtcMidnight = parsed;
    } else {
      // วันนี้ตามเวลา Bangkok
      const nowBkk = new Date(Date.now() + BANGKOK_OFFSET_MS);
      baseUtcMidnight = Date.UTC(nowBkk.getUTCFullYear(), nowBkk.getUTCMonth(), nowBkk.getUTCDate());
    }

    // occurrences ทั้งหมด: slot × weeks (เรียงตามเวลาจริง)
    const occurrences: { slot: BroadcastSlot; scheduledAt: Date; dateStr: string }[] = [];
    for (const slot of validSlots) {
      // หา "วันแรกตั้งแต่ baseDate" ที่ตรงกับ slot.day (นับวันแบบ Bangkok — ใช้ UTC math กับ midnight ได้ตรง ๆ)
      const baseDay = JS_DAY_TO_KEY[new Date(baseUtcMidnight).getUTCDay()];
      const baseIdx = JS_DAY_TO_KEY.indexOf(baseDay);
      const slotIdx = JS_DAY_TO_KEY.indexOf(slot.day as (typeof JS_DAY_TO_KEY)[number]);
      const offsetDays = (slotIdx - baseIdx + 7) % 7;
      for (let w = 0; w < weeks; w++) {
        const dayMs = baseUtcMidnight + (offsetDays + w * 7) * 24 * 60 * 60 * 1000;
        const dateStr = new Date(dayMs).toISOString().slice(0, 10);
        // เวลาไทย → UTC instant
        const scheduledAt = new Date(`${dateStr}T${slot.time}:00+07:00`);
        occurrences.push({ slot, scheduledAt, dateStr });
      }
    }
    occurrences.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());

    // ตอนของ season ที่พร้อมออกอากาศ (edited ขึ้นไป) เรียงตาม episodeNumber → จับคู่ตามลำดับออกอากาศ
    const readyEpisodes = await this.prisma.episode.findMany({
      where: { seriesId: id, season, archivedAt: null, status: { in: ['edited', 'published'] } },
      orderBy: { episodeNumber: 'asc' },
      select: { id: true, displayCode: true, title: true },
    });

    // กันสร้างซ้ำ: ContentItem เดิมที่ platform + scheduledAt ตรงกัน
    const existing = occurrences.length
      ? await this.prisma.contentItem.findMany({
          where: {
            archivedAt: null,
            scheduledAt: { in: occurrences.map((o) => o.scheduledAt) },
          },
          select: { platform: true, scheduledAt: true },
        })
      : [];
    const existingKeys = new Set(
      existing.map((e) => `${e.platform}|${e.scheduledAt?.toISOString() ?? ''}`),
    );

    const castCharacterIds = series.characters.map((c) => c.characterId);
    let created = 0;
    let skipped = 0;
    let episodeCursor = 0;
    const preview: {
      title: string;
      platform: string;
      scheduledAt: string;
      episodeCode: string | null;
      skipped: boolean;
    }[] = [];

    for (const occ of occurrences) {
      const key = `${occ.slot.platform}|${occ.scheduledAt.toISOString()}`;
      const matched = readyEpisodes[episodeCursor] ?? null;
      const title = `${series.name} ${season} — ${DAY_LABEL_TH[occ.slot.day] ?? occ.slot.day} ${occ.slot.time}`;
      if (existingKeys.has(key)) {
        skipped++;
        preview.push({
          title,
          platform: occ.slot.platform,
          scheduledAt: occ.scheduledAt.toISOString(),
          episodeCode: null,
          skipped: true,
        });
        continue;
      }
      await this.prisma.contentItem.create({
        data: {
          title,
          platform: occ.slot.platform,
          scheduledAt: occ.scheduledAt,
          status: 'idea',
          contentFormat: 'short_video',
          contentType: 'drama',
          episodeId: matched?.id ?? null,
          ownerId: user.id,
          ...(castCharacterIds.length
            ? { characters: { create: castCharacterIds.map((characterId) => ({ characterId })) } }
            : {}),
        },
      });
      if (matched) episodeCursor++;
      created++;
      existingKeys.add(key);
      preview.push({
        title,
        platform: occ.slot.platform,
        scheduledAt: occ.scheduledAt.toISOString(),
        episodeCode: matched?.displayCode ?? null,
        skipped: false,
      });
    }

    await this.audit(user, via, 'calendar_suggest', 'series', id, {
      season,
      weeks,
      created,
      skipped,
      slots: validSlots.length,
    });

    return { created, skipped, items: preview };
  }

  // ─── helpers ─────────────────────────────────────────────────

  private async mustExist(id: string) {
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
