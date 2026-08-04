import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/current-user.decorator';
import { ScopeService } from '../auth/scope.service';

// type ในผลลัพธ์ → module ใน permission matrix (เช็คสิทธิ์ V ต่อกลุ่ม)
const TYPE_MODULE: Record<string, string> = {
  characters: 'character',
  prompts: 'prompt',
  assets: 'asset',
  products: 'product',
  campaigns: 'campaign',
  episodes: 'episode',
  series: 'episode',
  contents: 'content',
  ideas: 'idea',
  competitors: 'competitor',
  locations: 'location',
  tasks: 'task',
};

export const SEARCH_TYPES = Object.keys(TYPE_MODULE);

export interface SearchResult {
  type: string;
  id: string;
  title: string;
  subtitle: string | null;
  status: string | null;
  href: string;
}

function snippet(text: string | null | undefined, max = 90): string | null {
  if (!text) return null;
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean || null;
}

@Injectable()
export class SearchService {
  constructor(
    private prisma: PrismaService,
    private scope: ScopeService,
  ) {}

  async search(q: string, types: string[] | undefined, user: AuthUser): Promise<SearchResult[]> {
    const query = q?.trim();
    if (!query) return [];

    const wanted = (types?.length ? types : SEARCH_TYPES).filter((t) => TYPE_MODULE[t]);

    // เช็คสิทธิ์ครั้งเดียว — รวมทุก module ที่ user มีสิทธิ์ V
    const perms = await this.prisma.rolePermission.findMany({
      where: { role: { key: { in: user.roles } }, actions: { has: 'V' } },
      select: { module: true },
    });
    const viewable = new Set(perms.map((p) => p.module));
    const allowed = wanted.filter((t) => viewable.has(TYPE_MODULE[t]));
    if (!allowed.length) return [];

    // row-level viewScope (content/episode: own/team) — ผลลัพธ์ search ต้องกรองเหมือนหน้า list
    const contentVisibleIds: string[] | null = allowed.includes('contents')
      ? await this.scope.resolveVisibleUserIds(user, 'content')
      : null;
    const episodeVisibleIds: string[] | null = allowed.includes('episodes')
      ? await this.scope.resolveVisibleUserIds(user, 'episode')
      : null;

    const c = { contains: query, mode: 'insensitive' as const };
    const searchers: Record<string, () => Promise<SearchResult[]>> = {
      characters: async () =>
        (
          await this.prisma.character.findMany({
            where: { archivedAt: null, OR: [{ nameTh: c }, { nameEn: c }, { displayCode: c }] },
            take: 5,
            orderBy: { updatedAt: 'desc' },
          })
        ).map((x) => {
          const persona = x.persona as { one_line_concept?: string } | null;
          return {
            type: 'characters',
            id: x.id,
            title: x.nameEn ? `${x.nameTh} (${x.nameEn})` : x.nameTh,
            subtitle: snippet(persona?.one_line_concept) ?? x.displayCode,
            status: x.status,
            href: `/characters/${x.id}`,
          };
        }),

      prompts: async () =>
        (
          await this.prisma.prompt.findMany({
            where: {
              archivedAt: null,
              OR: [{ name: c }, { versions: { some: { body: c } } }],
            },
            include: { versions: { orderBy: { createdAt: 'desc' }, take: 1 } },
            take: 5,
            orderBy: { updatedAt: 'desc' },
          })
        ).map((x) => ({
          type: 'prompts',
          id: x.id,
          title: x.name,
          subtitle: snippet(x.versions[0]?.body) ?? x.promptType,
          status: x.status,
          href: '/prompts',
        })),

      assets: async () =>
        (
          await this.prisma.asset.findMany({
            where: { archivedAt: null, OR: [{ originalFilename: c }, { assetType: c }] },
            include: { links: { take: 1, where: { entityType: 'character' } } },
            take: 5,
            orderBy: { createdAt: 'desc' },
          })
        ).map((x) => ({
          type: 'assets',
          id: x.id,
          title: x.originalFilename,
          subtitle: `${x.assetType} · ${x.mimeType}`,
          status: x.status,
          // asset ยังไม่มีหน้า detail — ลิงก์ไป character ที่ผูกไว้ (ถ้ามี)
          href: x.links[0] ? `/characters/${x.links[0].entityId}` : '/characters',
        })),

      products: async () =>
        (
          await this.prisma.product.findMany({
            where: { archivedAt: null, OR: [{ name: c }, { displayCode: c }, { description: c }] },
            take: 5,
            orderBy: { updatedAt: 'desc' },
          })
        ).map((x) => ({
          type: 'products',
          id: x.id,
          title: x.name,
          subtitle: [x.displayCode, x.category].filter(Boolean).join(' · ') || null,
          status: x.status,
          href: '/products',
        })),

      campaigns: async () =>
        (
          await this.prisma.campaign.findMany({
            where: { archivedAt: null, OR: [{ name: c }, { displayCode: c }, { clientBrand: c }] },
            take: 5,
            orderBy: { updatedAt: 'desc' },
          })
        ).map((x) => ({
          type: 'campaigns',
          id: x.id,
          title: x.name,
          subtitle: [x.displayCode, x.clientBrand].filter(Boolean).join(' · ') || null,
          status: x.status,
          href: '/campaigns',
        })),

      episodes: async () =>
        (
          await this.prisma.episode.findMany({
            where: {
              archivedAt: null,
              OR: [{ title: c }, { displayCode: c }, { logline: c }, { script: c }],
              // viewScope 'own'/'team': อีพีของตัวเอง (+ทีม) + อีพีไร้เจ้าของ (เหมือนหน้า list)
              ...(episodeVisibleIds
                ? { AND: [{ OR: [{ ownerId: { in: episodeVisibleIds } }, { ownerId: null }] }] }
                : {}),
            },
            take: 5,
            orderBy: { updatedAt: 'desc' },
          })
        ).map((x) => ({
          type: 'episodes',
          id: x.id,
          title: x.title,
          subtitle: snippet(x.logline) ?? x.displayCode,
          status: x.status,
          href: `/episodes/${x.id}`,
        })),

      series: async () =>
        (
          await this.prisma.series.findMany({
            where: { OR: [{ name: c }, { premise: c }, { universe: c }] },
            take: 5,
            orderBy: { updatedAt: 'desc' },
          })
        ).map((x) => ({
          type: 'series',
          id: x.id,
          title: x.name,
          subtitle: snippet(x.premise) ?? x.universe,
          status: x.status,
          href: `/series/${x.id}`,
        })),

      contents: async () =>
        (
          await this.prisma.contentItem.findMany({
            where: {
              archivedAt: null,
              OR: [{ title: c }, { caption: c }],
              // viewScope 'own'/'team': งานที่เป็น owner/reviewer ในชุดที่มองเห็น (เหมือนหน้า list)
              ...(contentVisibleIds
                ? {
                    AND: [
                      {
                        OR: [
                          { ownerId: { in: contentVisibleIds } },
                          { reviewerId: { in: contentVisibleIds } },
                        ],
                      },
                    ],
                  }
                : {}),
            },
            take: 5,
            orderBy: { updatedAt: 'desc' },
          })
        ).map((x) => ({
          type: 'contents',
          id: x.id,
          title: x.title,
          subtitle: snippet(x.caption) ?? x.platform,
          status: x.status,
          href: '/calendar',
        })),

      ideas: async () =>
        (
          await this.prisma.idea.findMany({
            where: { OR: [{ title: c }, { note: c }, { aiSummary: c }] },
            take: 5,
            orderBy: { updatedAt: 'desc' },
          })
        ).map((x) => ({
          type: 'ideas',
          id: x.id,
          title: x.title,
          subtitle: snippet(x.note) ?? x.ideaType,
          status: x.status,
          href: '/ideas',
        })),

      competitors: async () =>
        (
          await this.prisma.competitor.findMany({
            where: { OR: [{ name: c }, { positioning: c }, { notes: c }] },
            take: 5,
            orderBy: { updatedAt: 'desc' },
          })
        ).map((x) => ({
          type: 'competitors',
          id: x.id,
          title: x.name,
          subtitle: snippet(x.positioning) ?? x.type,
          status: x.threatLevel ? `threat: ${x.threatLevel}` : null,
          href: '/competitors',
        })),

      locations: async () =>
        (
          await this.prisma.location.findMany({
            where: { OR: [{ name: c }, { mood: c }, { prompt: c }] },
            take: 5,
            orderBy: { updatedAt: 'desc' },
          })
        ).map((x) => ({
          type: 'locations',
          id: x.id,
          title: x.name,
          subtitle: [x.type, x.mood].filter(Boolean).join(' · ') || null,
          status: x.status,
          href: '/library',
        })),

      tasks: async () =>
        (
          await this.prisma.task.findMany({
            where: { title: c },
            take: 5,
            orderBy: { updatedAt: 'desc' },
            include: { assignee: { select: { name: true } } },
          })
        ).map((x) => ({
          type: 'tasks',
          id: x.id,
          title: x.title,
          subtitle: x.assignee ? `ผู้รับผิดชอบ: ${x.assignee.name}` : 'ยังไม่มอบหมาย',
          status: x.status,
          href: '/my-work',
        })),
    };

    const groups = await Promise.all(allowed.map((t) => searchers[t]()));
    return groups.flat();
  }
}
