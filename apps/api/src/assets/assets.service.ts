import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AssetStatus, Prisma } from '@prisma/client';
import archiver from 'archiver';
import { buildCharacterSheetData } from '../exports/character-sheet-data';
import { renderCharacterSheet } from '../exports/character-markdown';
import { createHash, randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { Readable } from 'node:stream';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/current-user.decorator';
import { StorageService } from './storage.service';
import { CreateAssetDto } from './dto/create-asset.dto';
import { CreateAssetLinkDto } from './dto/create-asset-link.dto';
import { ImportAssetUrlDto } from './dto/import-asset-url.dto';
import { assertSafeImportUrl } from './import-url.util';

// State machine ของ asset (§F.3) — archived ไปได้จากทุก state
const TRANSITIONS: Record<AssetStatus, AssetStatus[]> = {
  uploaded: ['selected', 'rejected', 'archived'],
  ai_generated: ['selected', 'rejected', 'archived'],
  selected: ['approved_reference', 'archived'],
  rejected: ['archived'],
  approved_reference: ['production_used', 'archived'],
  production_used: ['archived'],
  archived: [],
};

// transition ที่ต้องมีสิทธิ์ Approve — มนุษย์เท่านั้น (D8, §28.2)
const NEEDS_APPROVE: AssetStatus[] = ['approved_reference'];

// import-url: fetch รูปจากเว็บนอก — จำกัด 10MB + timeout 15 วิ (กันโดนลิงก์ไฟล์ยักษ์/ช้าแช่)
const IMPORT_URL_MAX_BYTES = 10 * 1024 * 1024;
const IMPORT_URL_TIMEOUT_MS = 15_000;

// linkRole ที่ entity หนึ่งมีได้ตัวเดียว — addLink demote ตัวเดิมเป็น 'reference' ก่อนเสมอ
// (primary_reference/prompt_reference เดิม + Turnaround 5 มุม + รูปมาตรฐานประจำรายการ)
const SINGLE_PER_ENTITY_ROLES = [
  'primary_reference',
  'prompt_reference',
  'turnaround_sheet',
  'turnaround_front',
  'turnaround_side',
  'turnaround_three_quarter',
  'turnaround_back',
  'turnaround_full_body',
  'standard_image',
];

@Injectable()
export class AssetsService {
  private readonly logger = new Logger(AssetsService.name);

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  async create(file: Express.Multer.File, dto: CreateAssetDto, user: AuthUser, via = 'ui') {
    if (!file) throw new BadRequestException('ต้องแนบไฟล์ (field ชื่อ file)');
    if ((dto.entityType && !dto.entityId) || (!dto.entityType && dto.entityId)) {
      throw new BadRequestException('ต้องส่ง entityType กับ entityId คู่กัน');
    }

    const checksum = createHash('sha256').update(file.buffer).digest('hex');
    const key = `assets/${randomUUID()}${extname(file.originalname).toLowerCase()}`;
    await this.storage.save(file.buffer, key);

    const asset = await this.prisma.asset.create({
      data: {
        assetType: dto.assetType,
        storageKey: key,
        originalFilename: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
        checksumSha256: checksum,
        generationTool: dto.generationTool,
        status: dto.generationTool ? 'ai_generated' : 'uploaded',
        uploadedBy: user.id,
      },
    });
    await this.audit(user, via, 'create', asset.id, {
      assetType: dto.assetType,
      originalFilename: file.originalname,
      fileSize: file.size,
      checksumSha256: checksum,
    });

    // link ทันทีถ้าส่ง entity มาด้วย
    if (dto.entityType && dto.entityId) {
      await this.addLink(
        asset.id,
        { entityType: dto.entityType, entityId: dto.entityId, linkRole: dto.linkRole ?? 'reference' },
        user,
        via,
      );
    }

    return this.get(asset.id);
  }

  /**
   * สร้าง asset จาก Buffer ฝั่ง server (ไม่ผ่าน multipart) — mirror create()
   * ใช้โดย prompt quick-capture ตอนดึงรูป og:image จากลิงก์ (additive helper)
   */
  async createFromBuffer(
    buffer: Buffer,
    opts: {
      assetType: string;
      originalFilename: string;
      mimeType: string;
      generationTool?: string;
    },
    user: AuthUser,
    via = 'ui',
  ) {
    if (!buffer || buffer.byteLength === 0) throw new BadRequestException('ไฟล์ว่าง');

    const checksum = createHash('sha256').update(buffer).digest('hex');
    const key = `assets/${randomUUID()}${extname(opts.originalFilename).toLowerCase()}`;
    await this.storage.save(buffer, key);

    const asset = await this.prisma.asset.create({
      data: {
        assetType: opts.assetType,
        storageKey: key,
        originalFilename: opts.originalFilename,
        mimeType: opts.mimeType,
        fileSize: buffer.byteLength,
        checksumSha256: checksum,
        generationTool: opts.generationTool,
        status: 'uploaded',
        uploadedBy: user.id,
      },
    });
    await this.audit(user, via, 'create', asset.id, {
      assetType: opts.assetType,
      originalFilename: opts.originalFilename,
      fileSize: buffer.byteLength,
      checksumSha256: checksum,
      source: 'server_fetch',
    });
    return this.get(asset.id);
  }

  /**
   * POST /assets/import-url — ลากรูปจากเว็บอื่น (ได้ URL) → server fetch แล้วเก็บเหมือน upload
   * guard: https เท่านั้น + บล็อก private host (SSRF), content-type ต้อง image/*, สูงสุด 10MB,
   * timeout 15 วิ — สำเร็จ = Asset + AssetLink (default linkRole 'review_image')
   */
  async importFromUrl(dto: ImportAssetUrlDto, user: AuthUser, via = 'ui') {
    const url = assertSafeImportUrl(dto.url);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), IMPORT_URL_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    } catch (err) {
      const aborted = err instanceof Error && err.name === 'AbortError';
      throw new BadRequestException(
        aborted
          ? 'ดึงรูปจากลิงก์ไม่ทัน (เกิน 15 วินาที) — ลองบันทึกรูปแล้วอัปโหลดแทน'
          : 'ดึงรูปจากลิงก์ไม่สำเร็จ — ลองบันทึกรูปแล้วอัปโหลดแทน',
      );
    } finally {
      clearTimeout(timer);
    }
    // กัน redirect พาไป host ภายใน — เช็คปลายทางสุดท้ายซ้ำอีกรอบ
    if (res.url) assertSafeImportUrl(res.url);
    if (!res.ok) {
      throw new BadRequestException(`ดึงรูปไม่สำเร็จ (HTTP ${res.status}) — เช็คว่าลิงก์เปิดดูได้จริง`);
    }

    const mimeType = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!mimeType.startsWith('image/')) {
      throw new BadRequestException('ลิงก์นี้ไม่ใช่ไฟล์รูป (content-type ต้องเป็น image/*)');
    }
    const declaredLength = Number(res.headers.get('content-length') ?? 0);
    if (declaredLength > IMPORT_URL_MAX_BYTES) {
      throw new BadRequestException('รูปใหญ่เกิน 10MB — ย่อรูปก่อนแล้วอัปโหลดแทน');
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength === 0) throw new BadRequestException('ลิงก์นี้ไม่มีเนื้อหารูป');
    if (buffer.byteLength > IMPORT_URL_MAX_BYTES) {
      throw new BadRequestException('รูปใหญ่เกิน 10MB — ย่อรูปก่อนแล้วอัปโหลดแทน');
    }

    // ชื่อไฟล์: ใช้ basename ของ path ถ้ามีนามสกุล ไม่งั้นตั้งจาก mime
    const base = decodeURIComponent(url.pathname.split('/').pop() ?? '');
    const extFromMime = mimeType.split('/')[1]?.split('+')[0] ?? 'img';
    const originalFilename = /\.[a-z0-9]{2,5}$/i.test(base) ? base : `imported-image.${extFromMime}`;

    const asset = await this.createFromBuffer(
      buffer,
      { assetType: dto.assetType ?? 'product_image', originalFilename, mimeType },
      user,
      via,
    );
    await this.addLink(
      asset.id,
      { entityType: dto.entityType, entityId: dto.entityId, linkRole: dto.linkRole ?? 'review_image' },
      user,
      via,
    );
    return this.get(asset.id);
  }

  async list(params: {
    entityType?: string;
    entityId?: string;
    assetType?: string;
    status?: AssetStatus;
    page?: number;
  }) {
    if ((params.entityType && !params.entityId) || (!params.entityType && params.entityId)) {
      throw new BadRequestException('ต้องส่ง entityType กับ entityId คู่กัน');
    }
    const page = params.page && params.page > 0 ? params.page : 1;
    const take = 20;
    const where: Prisma.AssetWhereInput = {
      archivedAt: null,
      ...(params.assetType ? { assetType: params.assetType } : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.entityType && params.entityId
        ? { links: { some: { entityType: params.entityType, entityId: params.entityId } } }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.asset.findMany({
        where,
        include: { links: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * take,
        take,
      }),
      this.prisma.asset.count({ where }),
    ]);
    return { items, total, page, pageSize: take };
  }

  async get(id: string) {
    const asset = await this.prisma.asset.findUnique({ where: { id }, include: { links: true } });
    if (!asset) throw new NotFoundException('ไม่พบ asset');
    return asset;
  }

  /**
   * batch thumbnail ต่อ entity (เลี่ยง N+1 ฝั่ง client) — เลือกรูปที่ "ดีสุด" ต่อ entity:
   * primary_reference > cover > thumbnail > รูป image อื่นเก่าสุด
   */
  async thumbnails(entityType: string, ids: string[]): Promise<{ entityId: string; assetId: string }[]> {
    if (!entityType || ids.length === 0) {
      throw new BadRequestException('ต้องส่ง entityType และ ids (คั่นด้วย comma)');
    }
    if (ids.length > 50) throw new BadRequestException('ids ได้สูงสุด 50 ตัวต่อคำขอ');

    const links = await this.prisma.assetLink.findMany({
      where: {
        entityType,
        entityId: { in: ids },
        asset: { archivedAt: null, mimeType: { startsWith: 'image/' } },
      },
      select: {
        entityId: true,
        assetId: true,
        linkRole: true,
        asset: { select: { createdAt: true } },
      },
    });

    const ROLE_PRIORITY: Record<string, number> = { primary_reference: 0, cover: 1, thumbnail: 2 };
    const best = new Map<string, { assetId: string; prio: number; createdAt: Date }>();
    for (const link of links) {
      const prio = ROLE_PRIORITY[link.linkRole] ?? 3;
      const cur = best.get(link.entityId);
      if (
        !cur ||
        prio < cur.prio ||
        (prio === cur.prio && link.asset.createdAt < cur.createdAt)
      ) {
        best.set(link.entityId, { assetId: link.assetId, prio, createdAt: link.asset.createdAt });
      }
    }
    return ids
      .filter((id) => best.has(id))
      .map((id) => ({ entityId: id, assetId: best.get(id)!.assetId }));
  }

  async getFileStream(id: string): Promise<{
    stream: Readable;
    mimeType: string;
    originalFilename: string;
    fileSize: number;
  }> {
    const asset = await this.get(id);
    return {
      stream: await this.storage.getStream(asset.storageKey),
      mimeType: asset.mimeType,
      originalFilename: asset.originalFilename,
      fileSize: asset.fileSize,
    };
  }

  /** asset ทั้งหมดที่ผูกกับ entity (ไม่รวม archived, dedupe ข้าม link role) — ใช้ทำ zip โหลดทั้งชุด */
  async listEntityAssetsForZip(entityType: string, entityId: string) {
    const links = await this.prisma.assetLink.findMany({
      where: { entityType, entityId, asset: { archivedAt: null } },
      include: { asset: true },
      orderBy: { asset: { createdAt: 'asc' } },
    });
    const seen = new Set<string>();
    const assets: (typeof links)[number]['asset'][] = [];
    for (const l of links) {
      if (seen.has(l.assetId)) continue;
      seen.add(l.assetId);
      assets.push(l.asset);
    }
    return assets;
  }

  /** zip ทุกไฟล์ของ entity เป็น archive stream — ชื่อไฟล์นำด้วยลำดับกันชนกัน (01_, 02_...) */
  async createEntityZip(
    entityType: string,
    entityId: string,
  ): Promise<{ archive: archiver.Archiver; count: number }> {
    const assets = await this.listEntityAssetsForZip(entityType, entityId);
    if (assets.length === 0) {
      throw new NotFoundException('ไม่มีไฟล์ในคลังของรายการนี้ให้ดาวน์โหลด');
    }
    const archive = archiver('zip', { zlib: { level: 1 } }); // รูปบีบอัดแล้ว — เน้นเร็ว
    // ตัวละคร → แนบไฟล์ prompt ครบชุด (Character Sheet + Prompt Appendix) ไว้บนสุดของ zip
    // เอารูปไป gen ต่อได้ทันทีโดยไม่ต้องเปิดระบบ (CEO directive)
    if (entityType === 'character') {
      const character = await this.prisma.character.findUnique({ where: { id: entityId } });
      if (character) {
        const sheetData = await buildCharacterSheetData(this.prisma, character);
        archive.append(renderCharacterSheet(character, sheetData), { name: '00_PROMPTS.md' });
      }
    }
    for (let i = 0; i < assets.length; i++) {
      const a = assets[i];
      const stream = await this.storage.getStream(a.storageKey);
      archive.append(stream, { name: `${String(i + 1).padStart(2, '0')}_${a.originalFilename}` });
    }
    return { archive, count: assets.length };
  }

  /**
   * ย้ายไฟล์เดิมจาก local disk → R2 (admin เท่านั้น, permission asset X)
   * - ทำเฉพาะเมื่อ R2 ตั้งค่าครบแล้ว
   * - iterate asset ที่ยังไม่ archived, อ่านจาก disk, อัปโหลดขึ้น R2 ใต้ storageKey เดิม
   * - ไม่ลบไฟล์ local (safety), ไฟล์ที่หาย = skip, overwrite ได้ (idempotent-ish)
   */
  async migrateToR2(user: AuthUser, via = 'ui'): Promise<{
    total: number;
    migrated: number;
    skipped: number;
    failed: number;
  }> {
    const r2 = await this.storage.getR2Driver();
    if (!r2) {
      throw new BadRequestException(
        'R2 ยังไม่ได้ตั้งค่า — กรอก R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET ในหน้า Settings ก่อน',
      );
    }
    const local = this.storage.getLocalDriver();

    const assets = await this.prisma.asset.findMany({
      where: { archivedAt: null },
      select: { id: true, storageKey: true },
    });

    let migrated = 0;
    let skipped = 0;
    let failed = 0;
    for (const asset of assets) {
      let buffer: Buffer | null;
      try {
        buffer = await local.readBuffer(asset.storageKey);
      } catch (err) {
        failed++;
        this.logger.error(`migrate-to-r2 อ่าน local ไม่ได้ ${asset.storageKey}: ${String(err)}`);
        continue;
      }
      if (buffer === null) {
        // ไฟล์ local หาย — ข้าม (นับ skipped)
        skipped++;
        this.logger.warn(`migrate-to-r2 ข้าม (ไม่พบไฟล์ local): ${asset.storageKey}`);
        continue;
      }
      try {
        await r2.save(buffer, asset.storageKey);
        migrated++;
      } catch (err) {
        failed++;
        this.logger.error(`migrate-to-r2 อัปโหลด R2 ไม่ได้ ${asset.storageKey}: ${String(err)}`);
      }
    }

    const summary = { total: assets.length, migrated, skipped, failed };
    this.logger.log(
      `migrate-to-r2 เสร็จ: migrated=${migrated} skipped=${skipped} failed=${failed} (total=${assets.length})`,
    );
    await this.audit(user, via, 'migrate_to_r2', null, summary);
    return summary;
  }

  async addLink(assetId: string, dto: CreateAssetLinkDto, user: AuthUser, via = 'ui') {
    await this.get(assetId); // 404 ถ้าไม่มี

    // entity หนึ่งมี role พิเศษ (primary/prompt_reference, turnaround ต่อมุม, standard_image)
    // ได้อย่างละตัวเดียว — demote ตัวเดิมเป็น reference ก่อน = อัปโหลดซ้ำแล้วแทนที่สะอาด
    // (characters.service.changeStatus เช็ค primary_reference ตอน approve — AC-2)
    if (SINGLE_PER_ENTITY_ROLES.includes(dto.linkRole)) {
      await this.prisma.assetLink.updateMany({
        where: {
          entityType: dto.entityType,
          entityId: dto.entityId,
          linkRole: dto.linkRole,
        },
        data: { linkRole: 'reference' },
      });
    }

    const link = await this.prisma.assetLink.create({
      data: {
        assetId,
        entityType: dto.entityType,
        entityId: dto.entityId,
        linkRole: dto.linkRole,
      },
    });
    await this.audit(user, via, 'link', assetId, {
      linkId: link.id,
      entityType: dto.entityType,
      entityId: dto.entityId,
      linkRole: dto.linkRole,
    });
    return link;
  }

  async removeLink(assetId: string, linkId: string, user: AuthUser, via = 'ui') {
    const link = await this.prisma.assetLink.findFirst({ where: { id: linkId, assetId } });
    if (!link) throw new NotFoundException('ไม่พบ link ของ asset นี้');

    await this.prisma.assetLink.delete({ where: { id: linkId } });
    await this.audit(user, via, 'unlink', assetId, {
      linkId,
      entityType: link.entityType,
      entityId: link.entityId,
      linkRole: link.linkRole,
    });
    return { deleted: true };
  }

  async changeStatus(id: string, next: AssetStatus, user: AuthUser, via = 'ui') {
    const existing = await this.get(id);

    if (!TRANSITIONS[existing.status].includes(next)) {
      throw new BadRequestException(`เปลี่ยน status ${existing.status} → ${next} ไม่ได้`);
    }

    if (NEEDS_APPROVE.includes(next)) {
      if (via !== 'ui') {
        // guardrail §28.2: ห้าม approve แทนมนุษย์ — เฉพาะ UI path เท่านั้น
        throw new ForbiddenException('การ approve ทำได้ผ่าน UI โดยมนุษย์เท่านั้น');
      }
      const canApprove = await this.prisma.rolePermission.count({
        where: { module: 'asset', actions: { has: 'A' }, role: { key: { in: user.roles } } },
      });
      if (!canApprove) throw new ForbiddenException('ต้องมีสิทธิ์ Approve');
    }

    const asset = await this.prisma.asset.update({
      where: { id },
      data: { status: next, ...(next === 'archived' ? { archivedAt: new Date() } : {}) },
      include: { links: true },
    });
    await this.audit(user, via, 'status_change', id, { from: existing.status, to: next });
    return asset;
  }

  // entityId = null สำหรับ action ระดับระบบ (เช่น migrate_to_r2) — entityId เป็น @db.Uuid
  // จึงใส่ค่าที่ไม่ใช่ UUID ('r2') ไม่ได้ ต้องเว้น entityType/entityId ไปเลย
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
        ...(entityId ? { entityType: 'asset', entityId } : {}),
        meta: meta as Prisma.InputJsonValue,
      },
    });
  }
}
