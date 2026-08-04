import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import archiver from 'archiver';
import type { Response } from 'express';
import { createReadStream, createWriteStream, existsSync } from 'fs';
import { mkdir } from 'fs/promises';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/current-user.decorator';
import {
  PlatformAggregate,
  renderCampaignVaultNote,
  renderCharacterVaultNote,
  renderEpisodeVaultNote,
  renderPerformanceSummary,
  renderProductVaultNote,
  renderSeriesVaultNote,
  sanitizeFileBase,
} from './obsidian-markdown';

// Obsidian Vault Export (PRD v0.1 §26) — ZIP โครง vault พร้อม frontmatter + wikilinks
// ใช้ ExportJob flow เดิม (queued → running → done/failed, fileKey exports/<jobId>.zip)
@Injectable()
export class ObsidianService {
  private readonly logger = new Logger(ObsidianService.name);

  constructor(private prisma: PrismaService) {}

  // POST /exports/obsidian — สร้าง job แล้ว build เบื้องหลัง (pattern เดียวกับ exports.service)
  async createVaultExport(user: AuthUser, via = 'ui') {
    const job = await this.prisma.exportJob.create({
      data: {
        entityType: 'vault',
        // vault export ไม่ผูกกับ entity ใด — เก็บ user id เป็น entityId (schema บังคับ uuid)
        entityId: user.id,
        format: 'zip',
        status: 'queued',
        requestedBy: user.id,
      },
    });

    await this.audit(user.id, via, 'export_vault', job.id, { exportJobId: job.id, format: 'zip' });

    // in-process background job — ห้าม block response
    setImmediate(() => void this.runBuild(job.id, user.id, via));

    return job;
  }

  // GET /exports/obsidian/:jobId/download — download endpoint เดิมผูกกับ character
  // vault job จึงต้องมี download path ของตัวเอง (status poll ใช้ GET /exports/:jobId เดิมได้)
  async download(jobId: string, user: AuthUser, res: Response, via = 'ui') {
    const job = await this.prisma.exportJob.findUnique({ where: { id: jobId } });
    if (!job || job.entityType !== 'vault') throw new NotFoundException('ไม่พบ vault export job');

    if (job.status === 'failed') {
      throw new ConflictException('export job นี้ล้มเหลว — กรุณาสั่ง export ใหม่');
    }
    if (job.status !== 'done' || !job.fileKey) {
      throw new ConflictException('ไฟล์ยังไม่พร้อม — export กำลังทำงานอยู่ กรุณารอสักครู่');
    }

    const filePath = path.join(this.storageDir(), job.fileKey);
    if (!existsSync(filePath)) {
      throw new NotFoundException('ไม่พบไฟล์ export ใน storage');
    }

    await this.prisma.downloadLog.create({ data: { userId: user.id, exportJobId: job.id } });
    await this.audit(user.id, via, 'export_download', job.id, { exportJobId: job.id, kind: 'vault' });

    const filename = `AISTAR_VAULT_${job.createdAt.toISOString().slice(0, 10)}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    createReadStream(filePath).pipe(res);
  }

  // ─── background build: queued → running → done/failed ─────

  private async runBuild(jobId: string, requestedBy: string, via: string) {
    try {
      await this.buildVault(jobId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`vault export job ${jobId} failed: ${message}`, err instanceof Error ? err.stack : undefined);
      try {
        await this.prisma.exportJob.update({
          where: { id: jobId },
          data: { status: 'failed', completedAt: new Date() },
        });
        await this.audit(requestedBy, via, 'export_failed', jobId, { exportJobId: jobId, error: message });
      } catch (inner) {
        this.logger.error(`vault export job ${jobId}: บันทึกสถานะ failed ไม่สำเร็จ`, inner as Error);
      }
    }
  }

  private async buildVault(jobId: string) {
    await this.prisma.exportJob.update({ where: { id: jobId }, data: { status: 'running' } });

    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // เฉพาะ entity ที่ไม่ถูก archive (PRD §26)
    const [characters, seriesList, episodes, campaigns, products, performances] = await Promise.all([
      this.prisma.character.findMany({
        where: { archivedAt: null, status: { not: 'archived' } },
        orderBy: { displayCode: 'asc' },
      }),
      this.prisma.series.findMany({
        where: { status: { not: 'archived' } },
        orderBy: { name: 'asc' },
      }),
      this.prisma.episode.findMany({
        where: { archivedAt: null },
        include: {
          series: true,
          location: true,
          characters: true,
          products: { include: { product: true } },
          shots: { orderBy: { shotNumber: 'asc' }, include: { characters: true } },
        },
        orderBy: { displayCode: 'asc' },
      }),
      this.prisma.campaign.findMany({
        where: { archivedAt: null },
        include: {
          characters: true,
          products: { include: { product: true } },
          episodes: { where: { archivedAt: null }, select: { id: true } },
        },
        orderBy: { displayCode: 'asc' },
      }),
      this.prisma.product.findMany({
        where: { archivedAt: null },
        include: { brand: { select: { name: true } } },
        orderBy: { displayCode: 'asc' },
      }),
      this.prisma.contentPerformance.findMany({ where: { recordedAt: { gte: since30d } } }),
    ]);

    // Character Sheet extras — batch เดียวทั้งระบบ แล้ว group ต่อ character (ไม่มี N+1)
    const [allWardrobes, allExpressions, allPoses] = await Promise.all([
      this.prisma.characterWardrobe.findMany({
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.characterExpression.findMany({
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.characterPose.findMany({
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);
    const groupByChar = <T extends { characterId: string }>(rows: T[]) => {
      const map = new Map<string, T[]>();
      for (const r of rows) {
        const list = map.get(r.characterId) ?? [];
        list.push(r);
        map.set(r.characterId, list);
      }
      return map;
    };
    const wardrobesByChar = groupByChar(allWardrobes);
    const expressionsByChar = groupByChar(allExpressions);
    const posesByChar = groupByChar(allPoses);

    // ── wikilink file bases (unique ด้วย displayCode) ──
    const charById = new Map(characters.map((c) => [c.id, c]));
    const charBase = (c: (typeof characters)[number]) => sanitizeFileBase(`${c.displayCode} ${c.nameTh}`);
    const epBase = (e: { displayCode: string; title: string }) => sanitizeFileBase(`${e.displayCode} ${e.title}`);
    const campBase = (c: { displayCode: string; name: string }) => sanitizeFileBase(`${c.displayCode} ${c.name}`);
    const prodBase = (p: { displayCode: string; name: string }) => sanitizeFileBase(`${p.displayCode} ${p.name}`);
    const seriesBase = (s: { name: string; id: string }) => {
      const base = sanitizeFileBase(s.name);
      return base || s.id.slice(0, 8);
    };
    const epById = new Map(episodes.map((e) => [e.id, e]));
    const prodById = new Map(products.map((p) => [p.id, p]));

    // ── reverse links: character → episodes / campaigns ──
    const charEpisodes = new Map<string, string[]>();
    for (const e of episodes) {
      for (const link of e.characters) {
        const list = charEpisodes.get(link.characterId) ?? [];
        list.push(epBase(e));
        charEpisodes.set(link.characterId, list);
      }
    }
    const charCampaigns = new Map<string, string[]>();
    for (const c of campaigns) {
      for (const link of c.characters) {
        const list = charCampaigns.get(link.characterId) ?? [];
        list.push(campBase(c));
        charCampaigns.set(link.characterId, list);
      }
    }

    // ── performance aggregate by platform (30 วัน) ──
    const byPlatform = new Map<string, PlatformAggregate>();
    for (const p of performances) {
      const agg =
        byPlatform.get(p.platform) ??
        ({ platform: p.platform, records: 0, views: 0, likes: 0, comments: 0, shares: 0, orders: 0, gmv: 0 } satisfies PlatformAggregate);
      agg.records += 1;
      agg.views += p.views ?? 0;
      agg.likes += p.likes ?? 0;
      agg.comments += p.comments ?? 0;
      agg.shares += p.shares ?? 0;
      agg.orders += p.orders ?? 0;
      agg.gmv += p.gmv ? Number(p.gmv) : 0;
      byPlatform.set(p.platform, agg);
    }
    const perfRows = [...byPlatform.values()].sort((a, b) => b.views - a.views);

    const exportsDir = path.join(this.storageDir(), 'exports');
    await mkdir(exportsDir, { recursive: true });
    const fileKey = `exports/${jobId}.zip`;
    const filePath = path.join(this.storageDir(), fileKey);

    await new Promise<void>((resolvePromise, reject) => {
      const output = createWriteStream(filePath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => resolvePromise());
      output.on('error', reject);
      archive.on('error', reject);
      archive.pipe(output);

      // 01_Characters (+ Character Sheet: wardrobe/expression/pose + dos/donts)
      for (const c of characters) {
        archive.append(
          renderCharacterVaultNote(
            c,
            {
              episodes: charEpisodes.get(c.id) ?? [],
              campaigns: charCampaigns.get(c.id) ?? [],
            },
            {
              wardrobes: wardrobesByChar.get(c.id) ?? [],
              expressions: expressionsByChar.get(c.id) ?? [],
              poses: posesByChar.get(c.id) ?? [],
            },
          ),
          { name: `01_Characters/${charBase(c)}.md` },
        );
      }

      // 02_Series
      for (const s of seriesList) {
        const links = episodes.filter((e) => e.seriesId === s.id).map((e) => epBase(e));
        archive.append(renderSeriesVaultNote(s, links), { name: `02_Series/${seriesBase(s)}.md` });
      }

      // 03_Episodes
      for (const e of episodes) {
        const campaign = campaigns.find((c) => c.id === e.campaignId);
        archive.append(
          renderEpisodeVaultNote(e, {
            shots: e.shots.map((s) => ({
              ...s,
              characterNames: s.characters
                .map((sc) => charById.get(sc.characterId)?.nameTh)
                .filter((v): v is string => Boolean(v)),
            })),
            characterLinks: e.characters
              .map((link) => charById.get(link.characterId))
              .filter((c): c is NonNullable<typeof c> => Boolean(c))
              .map((c) => charBase(c)),
            productLinks: e.products
              .map((link) => prodById.get(link.productId))
              .filter((p): p is NonNullable<typeof p> => Boolean(p))
              .map((p) => prodBase(p)),
            campaignLink: campaign ? campBase(campaign) : undefined,
            seriesLink: e.series ? seriesBase(e.series) : undefined,
          }),
          { name: `03_Episodes/${epBase(e)}.md` },
        );
      }

      // 14_Campaigns
      for (const c of campaigns) {
        archive.append(
          renderCampaignVaultNote(c, {
            characters: c.characters
              .map((link) => charById.get(link.characterId))
              .filter((ch): ch is NonNullable<typeof ch> => Boolean(ch))
              .map((ch) => charBase(ch)),
            products: c.products
              .map((link) => prodById.get(link.productId))
              .filter((p): p is NonNullable<typeof p> => Boolean(p))
              .map((p) => prodBase(p)),
            episodes: c.episodes
              .map((link) => epById.get(link.id))
              .filter((e): e is NonNullable<typeof e> => Boolean(e))
              .map((e) => epBase(e)),
          }),
          { name: `14_Campaigns/${campBase(c)}.md` },
        );
      }

      // 07_Products
      for (const p of products) {
        archive.append(renderProductVaultNote(p), { name: `07_Products/${prodBase(p)}.md` });
      }

      // 10_Performance
      archive.append(renderPerformanceSummary(perfRows, new Date()), {
        name: `10_Performance/summary.md`,
      });

      void archive.finalize();
    });

    await this.prisma.exportJob.update({
      where: { id: jobId },
      data: { status: 'done', fileKey, completedAt: new Date() },
    });
  }

  private storageDir(): string {
    return path.resolve(process.env.STORAGE_DIR ?? './storage');
  }

  private audit(actorId: string, via: string, action: string, entityId: string, meta: object) {
    return this.prisma.auditLog.create({
      data: {
        actorId,
        via,
        action,
        entityType: 'vault',
        entityId,
        meta: meta as Prisma.InputJsonValue,
      },
    });
  }
}
