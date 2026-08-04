import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../auth/current-user.decorator';
import {
  detectProfile,
  findProfileByOverride,
  mapRow,
  stripBom,
  type MappedRow,
  type MappingProfile,
  type RawRow,
} from './mapping-profiles';

// ─── Product Import — นำเข้าไฟล์ export จากเครื่องมือวิจัยสินค้า ──────────────────
// รองรับ .csv (UTF-8 with BOM) และ .xlsx — parse ด้วย SheetJS (xlsx) จาก Buffer ทั้งคู่
// เก็บ "ทุกคอลัมน์ต้นฉบับ" ลง Product.sourceRaw + map field หลักเข้าโครงสร้างกลาง
// dedup ข้ามไฟล์ด้วย externalItemId (Shopee item id) → upsert (มีอยู่แล้ว = update)

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_ROWS = 2000; // cap ต่อไฟล์ (เกินนี้ตัด + report truncation)
const PREVIEW_ROWS = 10;

export interface ImportPreviewResult {
  detectedPlatform: string;
  sourceType: string | null;
  profileId: string;
  totalRows: number;
  headers: string[];
  mappedColumns: string[]; // header ที่โปรไฟล์ map เข้า target field
  unmappedColumns: string[]; // header ที่เหลือ (ยังเก็บใน sourceRaw ครบ)
  mappedPreview: MappedRow[];
}

export interface ImportFailedRow {
  row: number; // index (1-based ในไฟล์ ไม่รวม header)
  reason: string;
}

export interface ImportResult {
  platform: string;
  sourceType: string | null;
  profileId: string;
  total: number; // แถวที่ประมวลผล (หลัง cap)
  created: number;
  updated: number;
  skipped: number; // ไม่มีทั้งชื่อและลิงก์
  failed: number;
  truncated: boolean; // ไฟล์เกิน MAX_ROWS → ตัด
  truncatedNote?: string;
  failedRows: ImportFailedRow[];
}

interface ParsedFile {
  headers: string[];
  rows: RawRow[];
  truncated: boolean;
}

@Injectable()
export class ProductImportService {
  private readonly logger = new Logger(ProductImportService.name);

  constructor(private prisma: PrismaService) {}

  // ── preview: parse + detect + map ~10 แถว (ไม่ persist) ──
  async preview(file: Express.Multer.File): Promise<ImportPreviewResult> {
    this.validateFile(file);
    const { headers, rows } = this.parse(file);
    const profile = detectProfile(headers);
    const mappedCols = this.mappedColumns(profile, headers);
    const mappedPreview = rows.slice(0, PREVIEW_ROWS).map((r) => mapRow(profile, r));
    return {
      detectedPlatform: profile.platform,
      sourceType: profile.sourceType ?? null,
      profileId: profile.id,
      totalRows: rows.length,
      headers,
      mappedColumns: mappedCols,
      unmappedColumns: headers.filter((h) => !mappedCols.includes(h)),
      mappedPreview,
    };
  }

  // ── import: parse ทั้งไฟล์ → upsert by externalItemId (ต่อแถว fail ไม่ล้มทั้งไฟล์) ──
  async import(
    file: Express.Multer.File,
    override: { platform?: string; sourceType?: string },
    user: AuthUser,
  ): Promise<ImportResult> {
    this.validateFile(file);
    const { headers, rows, truncated } = this.parse(file);

    // override โปรไฟล์ได้ (ผู้ใช้ยืนยันเครื่องมือเอง) — ไม่งั้น auto-detect
    const profile =
      findProfileByOverride(override.platform, override.sourceType) ?? detectProfile(headers);

    // category keys ที่มีจริง — ใช้ตัดสินว่าจะ set category ไหม (ไม่มั่ว category ใหม่)
    const validCategories = await this.loadCategoryKeys();

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const failedRows: ImportFailedRow[] = [];

    // displayCode: นับครั้งเดียว แล้วเดินเลขเอง (สร้างเรียงกัน ไม่ชน)
    let seq = await this.prisma.product.count();

    for (let i = 0; i < rows.length; i++) {
      const mapped = mapRow(profile, rows[i]);
      // ข้ามแถวที่ไม่มีทั้งชื่อและลิงก์ (ขยะ/แถวว่าง) — ไม่ถือว่า fail
      if (!mapped.name && !mapped.productUrl) {
        skipped++;
        continue;
      }
      try {
        const res = await this.upsertRow(mapped, profile, validCategories, () => {
          seq++;
          return `PRD-${String(seq).padStart(4, '0')}`;
        });
        if (res === 'created') created++;
        else updated++;
      } catch (err) {
        // ต่อแถวพัง = ข้ามแถวนั้น ไปต่อ (ไม่ throw ทั้งไฟล์)
        seq = await this.prisma.product.count(); // sync เลขเผื่อ create ชนกลางคัน
        failedRows.push({
          row: i + 1,
          reason: err instanceof Error ? err.message : 'บันทึกแถวไม่สำเร็จ',
        });
      }
    }

    await this.audit(user, 'import', {
      platform: profile.platform,
      sourceType: profile.sourceType ?? null,
      total: rows.length,
      created,
      updated,
      skipped,
      failed: failedRows.length,
      truncated,
      filename: file.originalname,
    });

    return {
      platform: profile.platform,
      sourceType: profile.sourceType ?? null,
      profileId: profile.id,
      total: rows.length,
      created,
      updated,
      skipped,
      failed: failedRows.length,
      truncated,
      truncatedNote: truncated
        ? `ไฟล์เกิน ${MAX_ROWS} แถว — นำเข้าเฉพาะ ${MAX_ROWS} แถวแรก`
        : undefined,
      failedRows,
    };
  }

  // ── upsert แถวเดียว: มี externalItemId + เจอในฐาน → update, ไม่งั้น create ──
  private async upsertRow(
    mapped: MappedRow,
    profile: MappingProfile,
    validCategories: Set<string>,
    nextDisplayCode: () => string,
  ): Promise<'created' | 'updated'> {
    const platformLinks = mapped.productUrl ? { shopee: mapped.productUrl } : undefined;
    // category: set เฉพาะเมื่อ match key จริง — ไม่งั้นทิ้งไว้ใน sourceRaw อย่างเดียว
    const category =
      mapped.category && validCategories.has(mapped.category) ? mapped.category : undefined;

    const common = {
      name: mapped.name ?? 'สินค้านำเข้า (ไม่มีชื่อ)',
      ...(category ? { category } : {}),
      ...(mapped.price != null ? { price: new Prisma.Decimal(mapped.price) } : {}),
      ...(mapped.salePrice != null ? { salePrice: new Prisma.Decimal(mapped.salePrice) } : {}),
      ...(platformLinks ? { platformLinks: platformLinks as Prisma.InputJsonValue } : {}),
      // affiliate: ทุกแถวเป็น Shopee affiliate — ตั้ง flag ให้เข้ากับ Content Factory
      isAffiliate: true,
      affiliatePlatform: 'shopee',
      ...(mapped.affiliateUrl ? { affiliateUrl: mapped.affiliateUrl } : {}),
      ...(mapped.commissionPct != null ? { commissionPct: mapped.commissionPct } : {}),
      // structured source fields
      sourcePlatform: profile.platform,
      sourceType: profile.sourceType ?? null,
      ...(mapped.externalItemId ? { externalItemId: mapped.externalItemId } : {}),
      ...(mapped.externalShopId ? { externalShopId: mapped.externalShopId } : {}),
      ...(mapped.shopName ? { shopName: mapped.shopName } : {}),
      ...(mapped.rating != null ? { rating: mapped.rating } : {}),
      ...(mapped.soldMonth != null ? { soldMonth: mapped.soldMonth } : {}),
      ...(mapped.soldTotal != null ? { soldTotal: mapped.soldTotal } : {}),
      ...(mapped.stockQty != null ? { stockQty: mapped.stockQty } : {}),
      sourceRaw: mapped.sourceRaw as Prisma.InputJsonValue,
      importedAt: new Date(),
    };

    // dedup key = externalItemId (ข้ามไฟล์ด้วย — query ฐานทุกแถว)
    if (mapped.externalItemId) {
      const existing = await this.prisma.product.findFirst({
        where: { externalItemId: mapped.externalItemId },
        select: { id: true },
      });
      if (existing) {
        await this.prisma.product.update({ where: { id: existing.id }, data: common });
        return 'updated';
      }
    }

    await this.prisma.product.create({
      data: { ...common, displayCode: nextDisplayCode() },
    });
    return 'created';
  }

  // ── parse .csv/.xlsx จาก Buffer ด้วย SheetJS — คีย์สะอาด (ตัด BOM) + คงลำดับคอลัมน์ ──
  private parse(file: Express.Multer.File): ParsedFile {
    let wb: XLSX.WorkBook;
    try {
      wb = XLSX.read(file.buffer, { type: 'buffer', cellDates: false, raw: true });
    } catch {
      throw new BadRequestException('อ่านไฟล์ไม่ได้ — รองรับเฉพาะ .csv / .xlsx');
    }
    const sheetName = wb.SheetNames[0];
    if (!sheetName) throw new BadRequestException('ไฟล์ว่าง — ไม่พบชีต');
    const sheet = wb.Sheets[sheetName];

    // array-of-arrays → คุมลำดับหัวคอลัมน์เอง + สร้าง object คีย์สะอาด (เลี่ยง quirk ของ sheet_to_json)
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      blankrows: false,
      defval: null,
      raw: true,
    });
    if (aoa.length === 0) throw new BadRequestException('ไฟล์ไม่มีข้อมูล');

    const headers = (aoa[0] ?? []).map((h) => stripBom(String(h ?? '')).trim());
    if (headers.every((h) => h === '')) throw new BadRequestException('ไม่พบหัวคอลัมน์');

    const dataRows = aoa.slice(1);
    const truncated = dataRows.length > MAX_ROWS;
    const limited = truncated ? dataRows.slice(0, MAX_ROWS) : dataRows;

    const rows: RawRow[] = limited.map((arr) => {
      const obj: RawRow = {};
      const cells = arr as unknown[];
      headers.forEach((h, idx) => {
        if (h === '') return; // ข้ามคอลัมน์ไม่มีหัว
        obj[h] = cells[idx] ?? null;
      });
      return obj;
    });

    return { headers: headers.filter((h) => h !== ''), rows, truncated };
  }

  private mappedColumns(profile: MappingProfile, headers: string[]): string[] {
    const cols = new Set<string>();
    for (const src of Object.values(profile.map)) {
      // เฉพาะ mapping ที่อ้างชื่อคอลัมน์ตรงๆ (resolver fn อ่านหลายคอลัมน์ — ไม่นับตายตัว)
      if (typeof src === 'string' && headers.includes(src)) cols.add(src);
    }
    return headers.filter((h) => cols.has(h));
  }

  private async loadCategoryKeys(): Promise<Set<string>> {
    const cats = await this.prisma.productCategory.findMany({ select: { key: true } });
    return new Set(cats.map((c) => c.key));
  }

  private validateFile(file: Express.Multer.File | undefined): void {
    if (!file) throw new BadRequestException('ไม่พบไฟล์ที่อัปโหลด');
    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException(`ไฟล์ใหญ่เกิน ${MAX_FILE_SIZE / 1024 / 1024}MB`);
    }
    const name = (file.originalname ?? '').toLowerCase();
    if (!name.endsWith('.csv') && !name.endsWith('.xlsx')) {
      throw new BadRequestException('รองรับเฉพาะไฟล์ .csv หรือ .xlsx');
    }
  }

  private audit(user: AuthUser, action: string, meta: object) {
    return this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        via: 'product_import',
        action,
        entityType: 'product',
        entityId: null, // bulk import — ไม่มี entity เดียว
        meta: meta as Prisma.InputJsonValue,
      },
    });
  }
}
