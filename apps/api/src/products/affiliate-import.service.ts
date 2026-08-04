import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { PrismaService } from '../prisma/prisma.service';
import { AssetsService } from '../assets/assets.service';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { AuthUser } from '../auth/current-user.decorator';

// Affiliate Link Import — วางลิงก์ (สูงสุด 50/ครั้ง) → ระบบดึงชื่อ/รูป/คำอธิบายจาก Open Graph
// แล้วสร้างสินค้า isAffiliate ให้เอง (best-effort — โดนบอทกัน/ดึงไม่ได้ก็ยังสร้างสินค้า+ลิงก์ไว้
// พร้อม flag needsReview ให้เติมข้อมูลเอง). SSRF guard ชุดเดียวกับ prompt-capture (ฉบับย่อ):
// https เท่านั้น + บล็อก localhost/private IP ทั้งแบบ literal และหลัง DNS resolve + เช็คซ้ำทุก redirect hop

const MAX_LINKS = 50;
const CONCURRENCY = 5;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5; // ลิงก์ affiliate มัก short-link หลาย hop
const HTML_CAP = 2 * 1024 * 1024;
const IMAGE_CAP = 5 * 1024 * 1024;
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

export interface ImportItemResult {
  url: string;
  ok: boolean;
  productId?: string;
  name?: string;
  platform?: string;
  imageAttached?: boolean;
  needsReview?: boolean;
  duplicate?: boolean;
  reason?: string;
}

@Injectable()
export class AffiliateImportService {
  private readonly logger = new Logger(AffiliateImportService.name);

  constructor(
    private prisma: PrismaService,
    private products: ProductsService,
    private assets: AssetsService,
  ) {}

  async importLinks(rawUrls: string[], categoryKey: string | undefined, user: AuthUser) {
    // normalize + dedupe (คงลำดับที่วาง)
    const urls: string[] = [];
    const seen = new Set<string>();
    for (const raw of rawUrls) {
      const u = raw.trim();
      if (!u || seen.has(u)) continue;
      seen.add(u);
      urls.push(u);
    }
    if (urls.length === 0) throw new BadRequestException('ไม่พบลิงก์ที่ใช้ได้');
    if (urls.length > MAX_LINKS) {
      throw new BadRequestException(`วางได้สูงสุด ${MAX_LINKS} ลิงก์ต่อครั้ง (ส่งมา ${urls.length})`);
    }

    // ทำทีละก้อน (concurrency จำกัด) — 50 ลิงก์ไม่ยิงพร้อมกันทั้งหมด
    const results: ImportItemResult[] = new Array<ImportItemResult>(urls.length);
    let cursor = 0;
    const worker = async () => {
      while (cursor < urls.length) {
        const idx = cursor++;
        results[idx] = await this.importOne(urls[idx], categoryKey, user);
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, urls.length) }, worker));

    return {
      total: urls.length,
      created: results.filter((r) => r.ok && !r.duplicate).length,
      needsReview: results.filter((r) => r.ok && r.needsReview).length,
      duplicates: results.filter((r) => r.duplicate).length,
      failed: results.filter((r) => !r.ok).length,
      items: results,
    };
  }

  private async importOne(
    url: string,
    categoryKey: string | undefined,
    user: AuthUser,
  ): Promise<ImportItemResult> {
    // ลิงก์เดิมเคยเพิ่มแล้ว → ไม่สร้างซ้ำ
    const existing = await this.prisma.product.findFirst({
      where: { affiliateUrl: url, archivedAt: null },
      select: { id: true, name: true },
    });
    if (existing) {
      return { url, ok: true, duplicate: true, productId: existing.id, name: existing.name };
    }

    let og: { title?: string; description?: string; image?: string; finalHost: string } | null =
      null;
    let reason: string | undefined;
    try {
      og = await this.fetchOpenGraph(url);
    } catch (err) {
      reason = err instanceof Error ? err.message : 'ดึงข้อมูลไม่สำเร็จ';
    }

    // ลิงก์ต้องเป็น https ที่ parse ได้ ถึงจะสร้างสินค้า (กันขยะเข้า DB)
    let host: string;
    try {
      host = this.parseHttpsUrl(url).hostname;
    } catch (err) {
      return { url, ok: false, reason: err instanceof Error ? err.message : 'ลิงก์ไม่ถูกต้อง' };
    }

    const platform = this.detectPlatform(og?.finalHost ?? host);
    const name = og?.title
      ? this.cleanTitle(og.title)
      : `สินค้า ${this.platformLabel(platform)} (รอเติมชื่อ)`;
    const needsReview = !og?.title;

    try {
      const dto = {
        name,
        category: categoryKey,
        description: og?.description?.slice(0, 1000) || undefined,
        isAffiliate: true,
        affiliateUrl: url,
        affiliatePlatform: platform,
      } as CreateProductDto;
      const product = await this.products.create(dto, user, 'affiliate_import');

      // รูปปก (best-effort — พลาดไม่ถือว่า fail)
      let imageAttached = false;
      if (og?.image) {
        try {
          imageAttached = await this.attachCover(og.image, product.id, user);
        } catch {
          /* รูปดึงไม่ได้ — ข้าม */
        }
      }

      return { url, ok: true, productId: product.id, name, platform, imageAttached, needsReview, reason };
    } catch (err) {
      return { url, ok: false, reason: err instanceof Error ? err.message : 'สร้างสินค้าไม่สำเร็จ' };
    }
  }

  // ── Open Graph fetch (SSRF-guarded) ─────────────────────────

  private async fetchOpenGraph(rawUrl: string) {
    const start = this.parseHttpsUrl(rawUrl);
    await this.assertPublicHost(start.hostname);

    let current = start;
    let res: Response | null = null;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      res = await this.timedGet(current);
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        if (!loc) break;
        const next = new URL(loc, current);
        // https เท่านั้น — กัน redirect ลด downgrade เป็น http (หรือ protocol อื่น)
        if (next.protocol !== 'https:') {
          throw new BadRequestException('redirect ต้องเป็น https เท่านั้น');
        }
        // hop ใหม่ต้องผ่าน guard เหมือนเดิม
        this.assertSafeHostname(next.hostname);
        await this.assertPublicHost(next.hostname);
        current = next;
        continue;
      }
      break;
    }
    if (!res || !res.ok) {
      throw new BadRequestException(`ดึงหน้าเว็บไม่ได้ (HTTP ${res?.status ?? '—'}) — อาจติดระบบกันบอท`);
    }

    const html = (await this.readBody(res, HTML_CAP, { allowTruncated: true })).toString('utf8');
    const meta = (prop: string): string | undefined => {
      const re = new RegExp(
        `<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["']|<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${prop}["']`,
        'i',
      );
      const m = html.match(re);
      const val = m?.[1] ?? m?.[2];
      return val ? this.decodeEntities(val).trim() : undefined;
    };
    const fallbackTitle =
      this.decodeEntities(html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ?? '').trim() ||
      undefined;
    const title = meta('og:title') ?? fallbackTitle;
    const description = meta('og:description') ?? meta('description');
    let image = meta('og:image');
    if (image) image = new URL(image, current).toString();

    if (!title && !description && !image) {
      throw new BadRequestException('หน้านี้ไม่มีข้อมูล Open Graph — อาจติด login/กันบอท');
    }
    return { title, description, image, finalHost: current.hostname };
  }

  private async attachCover(imageUrl: string, productId: string, user: AuthUser): Promise<boolean> {
    const u = this.parseHttpsUrl(imageUrl);
    await this.assertPublicHost(u.hostname);
    const res = await this.timedGet(u);
    if (!res.ok) return false;
    const mime = res.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
    if (!mime.startsWith('image/')) return false;
    const buf = await this.readBody(res, IMAGE_CAP);
    if (buf.byteLength === 0) return false;

    const ext = mime === 'image/png' ? '.png' : mime === 'image/webp' ? '.webp' : '.jpg';
    const asset = await this.assets.createFromBuffer(
      buf,
      { assetType: 'product_photo', originalFilename: `affiliate-cover${ext}`, mimeType: mime },
      user,
      'affiliate_import',
    );
    await this.assets.addLink(
      asset.id,
      { entityType: 'product', entityId: productId, linkRole: 'cover' },
      user,
      'affiliate_import',
    );
    return true;
  }

  // ── helpers ──────────────────────────────────────────────────

  private detectPlatform(host: string): string {
    const h = host.toLowerCase();
    if (h.includes('shopee') || h.includes('shp.ee')) return 'shopee';
    if (h.includes('lazada') || h.includes('s.lazada')) return 'lazada';
    if (h.includes('tiktok')) return 'tiktok_shop';
    return 'other';
  }

  private platformLabel(platform: string): string {
    return (
      { shopee: 'Shopee', lazada: 'Lazada', tiktok_shop: 'TikTok Shop', other: 'จากลิงก์' }[
        platform
      ] ?? 'จากลิงก์'
    );
  }

  /** ตัดขยะท้ายชื่อ เช่น " | Shopee Thailand", " | Lazada.co.th" */
  private cleanTitle(title: string): string {
    const first = title.split(/\s*[|•·]\s*/)[0]?.trim();
    const cleaned = first && first.length >= 8 ? first : title.trim();
    return cleaned.slice(0, 200);
  }

  private decodeEntities(s: string): string {
    return s
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#0*39;|&apos;/g, "'");
  }

  private async timedGet(url: URL): Promise<Response> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      return await fetch(url, {
        redirect: 'manual',
        signal: ctrl.signal,
        headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,image/*,*/*' },
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new BadRequestException('ดึงข้อมูลช้าเกินไป (timeout 10 วิ)');
      }
      throw new BadRequestException('เชื่อมต่อปลายทางไม่ได้');
    } finally {
      clearTimeout(timer);
    }
  }

  // อ่าน body แบบจำกัดขนาด — เกิน cap:
  //   allowTruncated=true (HTML): คืนเท่าที่อ่านได้ (best-effort สำหรับ parse OG)
  //   allowTruncated=false (รูป): throw — ห้ามเก็บไฟล์ที่ถูกตัดกลางคัน (asset เสีย)
  private async readBody(
    res: Response,
    cap: number,
    opts: { allowTruncated?: boolean } = {},
  ): Promise<Buffer> {
    const reader = res.body?.getReader();
    if (!reader) return Buffer.alloc(0);
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > cap) {
          await reader.cancel();
          if (opts.allowTruncated) break;
          throw new BadRequestException(`ไฟล์ใหญ่เกิน ${cap} bytes`);
        }
        chunks.push(value);
      }
    }
    return Buffer.concat(chunks);
  }

  private parseHttpsUrl(rawUrl: string): URL {
    let url: URL;
    try {
      url = new URL(rawUrl.trim());
    } catch {
      throw new BadRequestException('ลิงก์ไม่ถูกต้อง');
    }
    if (url.protocol !== 'https:') throw new BadRequestException('รองรับเฉพาะลิงก์ https');
    this.assertSafeHostname(url.hostname);
    return url;
  }

  private assertSafeHostname(hostname: string): void {
    // ตัด [] ของ IPv6 literal ก่อนเช็ค — มิฉะนั้น [::1]/[::ffff:127.0.0.1] จะหลุด guard
    const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
      throw new BadRequestException('ไม่อนุญาตลิงก์ภายในเครื่อง');
    }
    if (isIP(host) && this.isPrivateAddress(host)) {
      throw new BadRequestException('ไม่อนุญาตลิงก์ที่ชี้ไป private IP');
    }
  }

  private async assertPublicHost(hostname: string): Promise<void> {
    this.assertSafeHostname(hostname);
    const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
    // literal IP ผ่านการเช็คแล้ว — ชื่อโดเมนต้อง resolve เป็น public ทั้งหมด
    if (isIP(host)) return;
    let addrs: { address: string }[];
    try {
      addrs = await lookup(host, { all: true });
    } catch {
      throw new BadRequestException('resolve โดเมนไม่ได้');
    }
    if (addrs.length === 0 || addrs.some((a) => this.isPrivateAddress(a.address))) {
      throw new BadRequestException('ไม่อนุญาตลิงก์ที่ resolve ไป private IP');
    }
  }

  // mirror prompt-capture.service.ts — loopback/unspecified, ULA, link-local, v4-mapped
  private isPrivateAddress(address: string): boolean {
    const ip = address.toLowerCase();
    if (isIP(ip) === 4) {
      const octets = ip.split('.').map(Number);
      const [a, b] = octets;
      return (
        a === 0 ||
        a === 10 ||
        a === 127 ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        (a === 169 && b === 254)
      );
    }
    // IPv6: loopback/unspecified, unique-local fc00::/7, link-local fe80::/10, IPv4-mapped
    if (ip === '::1' || ip === '::') return true;
    if (ip.startsWith('fc') || ip.startsWith('fd')) return true;
    if (/^fe[89ab]/.test(ip)) return true;
    const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return this.isPrivateAddress(mapped[1]);
    return false;
  }
}
