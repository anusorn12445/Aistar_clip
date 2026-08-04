import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import archiver from 'archiver';
import type { Response } from 'express';
import { createReadStream, createWriteStream, existsSync } from 'fs';
import { mkdir } from 'fs/promises';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/current-user.decorator';
import {
  renderAssetsManifest,
  renderCharacterBible,
  renderCharacterSheet,
  renderPrompts,
} from './character-markdown';
import { buildCharacterSheetData } from './character-sheet-data';

const SUPPORTED_FORMATS = ['zip'];

@Injectable()
export class ExportsService {
  private readonly logger = new Logger(ExportsService.name);

  constructor(private prisma: PrismaService) {}

  // POST /characters/:id/export — สร้าง job แล้ว build เบื้องหลัง (in-process,
  // ตาม addendum §B: งาน > 5 วิ เป็น background job — BullMQ มาทีหลัง)
  async createCharacterExport(characterId: string, format = 'zip', user: AuthUser, via = 'ui') {
    if (!SUPPORTED_FORMATS.includes(format)) {
      throw new BadRequestException(`รองรับเฉพาะ format: ${SUPPORTED_FORMATS.join(', ')}`);
    }

    const character = await this.prisma.character.findUnique({ where: { id: characterId } });
    if (!character) throw new NotFoundException('ไม่พบ character');

    const job = await this.prisma.exportJob.create({
      data: {
        entityType: 'character',
        entityId: characterId,
        format,
        status: 'queued',
        requestedBy: user.id,
      },
    });

    await this.audit(user.id, via, 'export', characterId, {
      exportJobId: job.id,
      format,
      displayCode: character.displayCode,
    });

    // in-process background job — ห้าม block response
    setImmediate(() => void this.runBuild(job.id, user.id, via));

    return job;
  }

  // GET /exports/:jobId — สถานะ job สำหรับ UI poll
  async getJob(jobId: string) {
    const job = await this.prisma.exportJob.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException('ไม่พบ export job');
    return job;
  }

  // GET /exports/:jobId/download — stream ZIP + DownloadLog + audit
  async download(jobId: string, user: AuthUser, res: Response, via = 'ui') {
    const job = await this.getJob(jobId);

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

    const character = await this.prisma.character.findUnique({ where: { id: job.entityId } });
    if (!character) throw new NotFoundException('ไม่พบ character ของ export job นี้');

    await this.prisma.downloadLog.create({
      data: { userId: user.id, exportJobId: job.id },
    });
    await this.audit(user.id, via, 'export_download', job.entityId, { exportJobId: job.id });

    const filename = `${character.displayCode}_${character.nameEn ?? character.nameTh}_package.zip`;
    // ASCII fallback สำหรับชื่อไทย + RFC 5987 filename*
    const asciiFallback = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    createReadStream(filePath).pipe(res);
  }

  // ─── background build: queued → running → done/failed ─────

  private async runBuild(jobId: string, requestedBy: string, via: string) {
    try {
      await this.buildPackage(jobId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`export job ${jobId} failed: ${message}`, err instanceof Error ? err.stack : undefined);
      try {
        const job = await this.prisma.exportJob.update({
          where: { id: jobId },
          data: { status: 'failed', completedAt: new Date() },
        });
        await this.audit(requestedBy, via, 'export_failed', job.entityId, {
          exportJobId: jobId,
          error: message,
        });
      } catch (inner) {
        this.logger.error(`export job ${jobId}: บันทึกสถานะ failed ไม่สำเร็จ`, inner as Error);
      }
    }
  }

  private async buildPackage(jobId: string) {
    const job = await this.prisma.exportJob.update({
      where: { id: jobId },
      data: { status: 'running' },
    });

    const character = await this.prisma.character.findUnique({ where: { id: job.entityId } });
    if (!character) throw new Error('ไม่พบ character ของ export job นี้');

    const [promptLinks, assetLinks, versions] = await this.prisma.$transaction([
      this.prisma.promptLink.findMany({
        where: { entityType: 'character', entityId: character.id },
        include: { promptVersion: { include: { prompt: true } } },
        orderBy: { promptVersion: { createdAt: 'desc' } },
      }),
      this.prisma.assetLink.findMany({
        where: { entityType: 'character', entityId: character.id },
        include: { asset: true },
      }),
      // version history โดยไม่รวม snapshot body
      this.prisma.entityVersion.findMany({
        where: { entityType: 'character', entityId: character.id },
        select: { id: true, versionLabel: true, notes: true, createdAt: true, createdBy: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // Character Sheet data — helper กลาง (ใช้ร่วมกับ zip ของ Asset Gallery)
    const sheetData = await buildCharacterSheetData(this.prisma, character, assetLinks);

    const slug = character.displayCode.toLowerCase();
    const exportsDir = path.join(this.storageDir(), 'exports');
    await mkdir(exportsDir, { recursive: true });
    const fileKey = `exports/${jobId}.zip`;
    const filePath = path.join(this.storageDir(), fileKey);

    // โครง package ตาม PRD v0.1 §8.3
    await new Promise<void>((resolve, reject) => {
      const output = createWriteStream(filePath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => resolve());
      output.on('error', reject);
      archive.on('error', reject);
      archive.pipe(output);

      archive.append(renderCharacterBible(character), {
        name: `01_character_bible/${slug}_character_bible.md`,
      });
      archive.append(renderPrompts(character, promptLinks), {
        name: `02_prompts/${slug}_prompts.md`,
      });
      archive.append(renderAssetsManifest(character, assetLinks), {
        name: `03_reference_assets/assets_manifest.md`,
      });
      // Character Sheet ฉบับเต็ม + Prompt Appendix (freelance ทำงานจากไฟล์เดียวได้)
      archive.append(renderCharacterSheet(character, sheetData), {
        name: `04_character_sheet/${slug}_character_sheet.md`,
      });
      archive.append(JSON.stringify(character, null, 2), {
        name: `06_data/${slug}_character_data.json`,
      });
      archive.append(JSON.stringify(versions, null, 2), {
        name: `06_data/${slug}_version_history.json`,
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
        entityType: 'character',
        entityId,
        meta: meta as Prisma.InputJsonValue,
      },
    });
  }
}
