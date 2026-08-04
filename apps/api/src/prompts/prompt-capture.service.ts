import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Anthropic from '@anthropic-ai/sdk';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { extname } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/current-user.decorator';
import { AiClaudeService } from '../ai/ai-claude.service';
import { AssetsService } from '../assets/assets.service';
import {
  CAPTURE_CONFIDENCE_VALUES,
  CAPTURE_EXTRACTION_SCHEMA,
  CAPTURE_PLATFORM_HINTS,
  CaptureExtractionResult,
} from './capture.schemas';
import { PROMPT_TYPES } from './dto/create-prompt.dto';
import {
  CAPTURE_IMAGE_MEDIA_TYPES,
  CaptureCreateDto,
  CaptureExtractDto,
} from './dto/capture.dto';

// ── ลิมิตของ quick-capture ─────────────────────────────────────
const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // รูปที่ส่งให้ Claude (~4MB)
const MAX_PAGE_BYTES = 2 * 1024 * 1024; // HTML ที่ยอมอ่านจากลิงก์ (~2MB)
const MAX_OG_IMAGE_BYTES = 5 * 1024 * 1024; // รูป og:image ที่ยอมดาวน์โหลด (~5MB)
const FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

type ClaudeImageMediaType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';

export interface CaptureFetchUrlResult {
  ok: boolean;
  title?: string;
  description?: string;
  imageAssetId?: string;
  reason?: string;
}

@Injectable()
export class PromptCaptureService {
  private readonly logger = new Logger(PromptCaptureService.name);

  constructor(
    private prisma: PrismaService,
    private claude: AiClaudeService,
    private assets: AssetsService,
  ) {}

  // ─── 1. Extract — โพสต์ที่ก๊อปมา (รูป+ข้อความ) → ฟิลด์ prompt library ───

  async extract(dto: CaptureExtractDto, user: AuthUser) {
    const text = dto.text?.trim() ?? '';
    const image = await this.resolveImage(dto);
    if (!text && !image) {
      throw new BadRequestException('ต้องส่งข้อความโพสต์ (text) หรือรูป อย่างน้อยหนึ่งอย่าง');
    }

    const system = `คุณคือผู้ช่วยจัดคลัง Prompt Library ของ AISTAR Studio — หน้าที่คือแตกโพสต์ที่ก๊อปมาจากโซเชียล (ส่วนใหญ่จาก Facebook กลุ่มแชร์ prompt สร้างรูป AI) ให้เป็น prompt library entry ที่มีโครงสร้าง
กติกา:
- body = ตัว generation prompt จริงเท่านั้น (ภาษาเดิมของ prompt — ส่วนใหญ่อังกฤษ) ตัด emoji, บรรทัดเครดิต (เช่น "cr.", "prompt by"), CTA, ข้อความชวนไลก์/แชร์/สมัครกลุ่ม ออกให้หมด
- ห้ามแต่ง prompt ขึ้นเอง — ถ้าในโพสต์/รูปไม่มี prompt เลย ให้ body เป็น string ว่างและ confidence = low
- ถ้ามีรูปตัวอย่างแนบมา ใช้รูปช่วยเดา promptType/targetPlatform ได้ แต่ห้าม reverse-engineer เป็น prompt ใหม่แทนของจริง
- negativeBody เอาเฉพาะที่โพสต์ระบุ (เช่นบรรทัด "Negative:" หรือ "--no ...")
- targetPlatform: เดาจากบริบท (${CAPTURE_PLATFORM_HINTS.join(', ')}) — พารามิเตอร์แบบ --ar/--v บ่งชี้ midjourney; ไม่แน่ใจตอบ unknown
- notes: เก็บของมีค่าที่ไม่ใช่ตัว prompt เช่น พารามิเตอร์, model ที่โพสต์อ้าง, เคล็ดลับการใช้
- name: ตั้งชื่อสั้น ๆ สื่อความหมายจากเนื้อหา prompt`;

    const parts: string[] = [];
    if (text) parts.push(`ข้อความโพสต์ที่ก๊อปมา:\n"""\n${text}\n"""`);
    else parts.push('โพสต์นี้ไม่มีข้อความแนบมา — มีแต่รูป ให้ดึงข้อมูลเท่าที่เห็นจากรูป');
    if (dto.sourceUrl) parts.push(`ลิงก์ที่มา: ${dto.sourceUrl}`);
    parts.push('แตกโพสต์นี้เป็น prompt library entry ตามสคีมา');

    const content: Anthropic.ContentBlockParam[] = [
      ...(image
        ? [
            {
              type: 'image' as const,
              source: {
                type: 'base64' as const,
                media_type: image.mediaType,
                data: image.data,
              },
            },
          ]
        : []),
      { type: 'text' as const, text: parts.join('\n\n') },
    ];

    const call = await this.claude.callClaude<CaptureExtractionResult>({
      action: 'prompt_capture_extract',
      system,
      content,
      schema: CAPTURE_EXTRACTION_SCHEMA,
      maxTokens: 4000,
    });

    // sanitize — กัน promptType/confidence หลุด enum (เช่นตอน model เก่า/stub)
    const raw = call.parsed;
    const promptTypeValid = (PROMPT_TYPES as readonly string[]).includes(raw.promptType);
    const confidenceValid = (CAPTURE_CONFIDENCE_VALUES as readonly string[]).includes(
      raw.confidence,
    );
    const result: CaptureExtractionResult = {
      name: (raw.name ?? '').trim(),
      promptType: promptTypeValid ? raw.promptType : 'scene',
      body: (raw.body ?? '').trim(),
      negativeBody: (raw.negativeBody ?? '').trim(),
      targetPlatform: (raw.targetPlatform ?? '').trim() || 'unknown',
      notes: (raw.notes ?? '').trim(),
      confidence: !promptTypeValid || !confidenceValid ? 'low' : raw.confidence,
    };

    await this.claude.audit(user, 'prompt_capture_extract', 'prompt', null, {
      model: call.model,
      usage: call.usage,
      hasImage: Boolean(image),
      textLength: text.length,
      confidence: result.confidence,
      promptTypeCoerced: !promptTypeValid,
    });

    return { ...result, model: call.model, usage: call.usage };
  }

  // โหลดรูปจาก assetId (ทางหลัก — client อัปโหลดผ่าน /assets ก่อน) หรือ base64 ตรง ๆ
  private async resolveImage(
    dto: CaptureExtractDto,
  ): Promise<{ mediaType: ClaudeImageMediaType; data: string } | null> {
    if (dto.imageAssetId) {
      const asset = await this.assets.get(dto.imageAssetId); // 404 ถ้าไม่มี
      if (!(CAPTURE_IMAGE_MEDIA_TYPES as readonly string[]).includes(asset.mimeType)) {
        throw new BadRequestException(
          `asset นี้ไม่ใช่รูปที่รองรับ (${asset.mimeType}) — รองรับ ${CAPTURE_IMAGE_MEDIA_TYPES.join(', ')}`,
        );
      }
      if (asset.fileSize > MAX_IMAGE_BYTES) {
        throw new BadRequestException('รูปใหญ่เกิน 4MB — ย่อรูปก่อนแล้วลองใหม่');
      }
      const { stream } = await this.assets.getFileStream(dto.imageAssetId);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return {
        mediaType: asset.mimeType as ClaudeImageMediaType,
        data: Buffer.concat(chunks).toString('base64'),
      };
    }

    if (dto.imageBase64) {
      const buffer = Buffer.from(dto.imageBase64.data, 'base64');
      if (buffer.byteLength === 0) throw new BadRequestException('imageBase64.data ไม่ใช่ base64 ที่ถูกต้อง');
      if (buffer.byteLength > MAX_IMAGE_BYTES) {
        throw new BadRequestException('รูปใหญ่เกิน 4MB — ย่อรูปก่อนแล้วลองใหม่');
      }
      return { mediaType: dto.imageBase64.mediaType, data: buffer.toString('base64') };
    }

    return null;
  }

  // ─── 2. Fetch URL — best-effort ดึง Open Graph จากลิงก์สาธารณะ ──────────

  async fetchUrl(rawUrl: string, user: AuthUser): Promise<CaptureFetchUrlResult> {
    const url = this.parseHttpsUrl(rawUrl); // 400 ถ้าไม่ใช่ https / host อันตราย (SSRF)
    await this.assertPublicHost(url.hostname);

    let result: CaptureFetchUrlResult;
    try {
      result = await this.fetchOpenGraph(url, user);
    } catch (err) {
      // หน้าเว็บดึงไม่ได้ = เคสปกติของ Facebook (login wall / โพสต์ในกลุ่ม) — ไม่ throw 500
      this.logger.warn(`capture fetch-url ล้มเหลว ${url.hostname}: ${String(err)}`);
      result = {
        ok: false,
        reason:
          'ดึงข้อมูลจากลิงก์ไม่สำเร็จ — โพสต์อาจติด login หรือเป็นโพสต์ในกลุ่มปิด ใช้วิธีวางรูป+ข้อความแทน',
      };
    }

    await this.claude.audit(user, 'prompt_capture_fetch_url', 'prompt', null, {
      host: url.hostname,
      ok: result.ok,
      hasImage: Boolean(result.imageAssetId),
      ...(result.reason ? { reason: result.reason } : {}),
    });
    return result;
  }

  private async fetchOpenGraph(url: URL, user: AuthUser): Promise<CaptureFetchUrlResult> {
    const res = await this.getWithRedirects(url);
    if (!res.ok) {
      return {
        ok: false,
        reason: `เข้าถึงหน้านี้ไม่ได้ (HTTP ${res.status}) — โพสต์อาจติด login หรือเป็นโพสต์ในกลุ่มปิด`,
      };
    }
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html')) {
      return { ok: false, reason: 'ลิงก์นี้ไม่ใช่หน้าเว็บ HTML — ดึง Open Graph ไม่ได้' };
    }

    const html = (await this.readBody(res, MAX_PAGE_BYTES, { allowTruncated: true })).toString(
      'utf8',
    );
    const ogTitle = this.metaContent(html, 'og:title');
    const ogDescription = this.metaContent(html, 'og:description');
    const ogImage = this.metaContent(html, 'og:image');
    const title = ogTitle ?? this.htmlTitle(html);
    const description = ogDescription ?? this.metaContent(html, 'description', 'name');

    // heuristic login wall — Facebook คืนหน้า "Log in" แทนเนื้อโพสต์
    if (title && /log ?in|เข้าสู่ระบบ/i.test(title) && !ogImage) {
      return {
        ok: false,
        reason: 'หน้านี้ติด login (Facebook ไม่เปิดให้อ่านโพสต์นี้แบบสาธารณะ) — ใช้วิธีวางรูป+ข้อความแทน',
      };
    }
    if (!title && !description && !ogImage) {
      return { ok: false, reason: 'ไม่พบข้อมูล Open Graph ในหน้านี้ — ใช้วิธีวางรูป+ข้อความแทน' };
    }

    // ดาวน์โหลดรูปตัวอย่าง (best-effort — พังก็ยังคืน title/description ได้)
    let imageAssetId: string | undefined;
    if (ogImage) {
      try {
        imageAssetId = await this.downloadOgImage(ogImage, user);
      } catch (err) {
        this.logger.warn(`capture ดึง og:image ไม่สำเร็จ: ${String(err)}`);
      }
    }

    return {
      ok: true,
      ...(title ? { title } : {}),
      ...(description ? { description } : {}),
      ...(imageAssetId ? { imageAssetId } : {}),
    };
  }

  private async downloadOgImage(imageUrl: string, user: AuthUser): Promise<string | undefined> {
    const url = new URL(imageUrl);
    // https เท่านั้น — ไม่ยอมโหลดรูปผ่าน http (กัน downgrade)
    if (url.protocol !== 'https:') {
      throw new BadRequestException('og:image ต้องเป็น https เท่านั้น');
    }
    this.assertSafeHostname(url.hostname);
    await this.assertPublicHost(url.hostname);

    const res = await this.getWithRedirects(url);
    if (!res.ok) return undefined;
    const mimeType = (res.headers.get('content-type') ?? '').split(';')[0].trim();
    if (!mimeType.startsWith('image/')) return undefined;

    const buffer = await this.readBody(res, MAX_OG_IMAGE_BYTES);
    if (buffer.byteLength === 0) return undefined;

    const ext = extname(url.pathname).toLowerCase() || '.jpg';
    const asset = await this.assets.createFromBuffer(
      buffer,
      {
        assetType: 'prompt_example',
        originalFilename: `og-image${ext}`,
        mimeType,
        generationTool: undefined,
      },
      user,
    );
    return asset.id;
  }

  // ─── 3. Capture — persist Prompt + PromptVersion v1 + ผูกรูปตัวอย่าง ───

  async capture(dto: CaptureCreateDto, user: AuthUser, via = 'ui') {
    const body = dto.body.trim();
    if (!body) throw new BadRequestException('body ต้องไม่ว่าง');

    const exampleAssetIds = [...new Set(dto.exampleAssetIds ?? [])];
    if (exampleAssetIds.length > 0) {
      const found = await this.prisma.asset.count({
        where: { id: { in: exampleAssetIds }, archivedAt: null },
      });
      if (found !== exampleAssetIds.length) {
        throw new BadRequestException('ไม่พบ asset ตัวอย่างบางตัว — อัปโหลดใหม่แล้วลองอีกครั้ง');
      }
    }

    const prompt = await this.prisma.prompt.create({
      data: {
        name: dto.name.trim(),
        promptType: dto.promptType,
        createdBy: user.id,
        versions: {
          create: {
            versionLabel: 'v1',
            body,
            negativeBody: dto.negativeBody?.trim() || undefined,
            targetPlatform: dto.targetPlatform?.trim() || 'unknown',
            performanceNote: dto.notes?.trim() || undefined,
            sourceUrl: dto.sourceUrl?.trim() || undefined,
            createdBy: user.id,
          },
        },
      },
      include: { versions: true },
    });
    const version = prompt.versions[0];

    // ผูกรูปตัวอย่าง — กลไกเดียวกับ Prompt Library เดิม:
    // Asset.promptVersionId (สายตรงถึง version) + AssetLink entityType 'prompt' (gallery/thumbnail)
    if (exampleAssetIds.length > 0) {
      await this.prisma.asset.updateMany({
        where: { id: { in: exampleAssetIds } },
        data: { promptVersionId: version.id },
      });
      await this.prisma.assetLink.createMany({
        data: exampleAssetIds.map((assetId) => ({
          assetId,
          entityType: 'prompt',
          entityId: prompt.id,
          linkRole: 'reference',
        })),
      });
    }

    await this.audit(user, via, 'capture', prompt.id, {
      name: prompt.name,
      promptType: prompt.promptType,
      targetPlatform: version.targetPlatform,
      sourceUrl: version.sourceUrl ?? null,
      exampleAssetIds,
    });

    return prompt;
  }

  // ─── SSRF guard + HTTP helpers ─────────────────────────────────────────

  /** validate ว่าเป็น https URL + hostname ไม่ใช่ localhost/.local/private IP (literal) */
  private parseHttpsUrl(rawUrl: string): URL {
    let url: URL;
    try {
      url = new URL(rawUrl.trim());
    } catch {
      throw new BadRequestException('ลิงก์ไม่ถูกต้อง — ต้องเป็น URL เต็มรูปแบบ เช่น https://...');
    }
    if (url.protocol !== 'https:') {
      throw new BadRequestException('รองรับเฉพาะลิงก์ https:// เท่านั้น');
    }
    this.assertSafeHostname(url.hostname);
    return url;
  }

  /** เช็ค hostname แบบ literal (ไม่ต้อง DNS): localhost, *.local, private IP */
  private assertSafeHostname(hostname: string): void {
    const host = hostname.toLowerCase().replace(/^\[|\]$/g, ''); // ตัด [] ของ IPv6
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
      throw new BadRequestException('ไม่อนุญาตลิงก์ภายในเครื่อง/เครือข่ายภายใน');
    }
    if (isIP(host) && this.isPrivateAddress(host)) {
      throw new BadRequestException('ไม่อนุญาตลิงก์ที่ชี้ไป private IP');
    }
  }

  /** resolve hostname ก่อน fetch — ทุก address ที่ได้ต้องเป็น public IP */
  private async assertPublicHost(hostname: string): Promise<void> {
    const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (isIP(host)) {
      if (this.isPrivateAddress(host)) {
        throw new BadRequestException('ไม่อนุญาตลิงก์ที่ชี้ไป private IP');
      }
      return;
    }
    let addresses: string[];
    try {
      addresses = await this.lookupHost(host);
    } catch {
      throw new BadRequestException('resolve โดเมนของลิงก์ไม่ได้ — ตรวจสอบลิงก์อีกครั้ง');
    }
    if (addresses.some((address) => this.isPrivateAddress(address))) {
      throw new BadRequestException('ไม่อนุญาตลิงก์ที่ resolve ไป private IP');
    }
  }

  /** DNS lookup ทุก address — แยกเป็น method เพื่อให้ e2e stub ได้ (ไม่แตะ network จริง) */
  async lookupHost(hostname: string): Promise<string[]> {
    const records = await lookup(hostname, { all: true });
    return records.map((r) => r.address);
  }

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

  /** GET เดียว (redirect manual + timeout) — แยกเป็น method เพื่อให้ e2e stub ได้ */
  async httpGet(url: string): Promise<Response> {
    return fetch(url, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'text/html,application/xhtml+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'th,en;q=0.9',
      },
    });
  }

  /** follow redirect เอง ≤3 hop — re-check SSRF ทุก hop */
  private async getWithRedirects(url: URL): Promise<Response> {
    let current = url;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const res = await this.httpGet(current.href);
      if (res.status < 300 || res.status >= 400) return res;
      const location = res.headers.get('location');
      if (!location) return res;
      current = new URL(location, current);
      // https เท่านั้น — กัน redirect ลด downgrade เป็น http (หรือ protocol อื่น)
      if (current.protocol !== 'https:') {
        throw new BadRequestException(`redirect ต้องเป็น https เท่านั้น (ได้ ${current.protocol})`);
      }
      this.assertSafeHostname(current.hostname);
      await this.assertPublicHost(current.hostname);
    }
    throw new Error('redirect เกินจำนวนที่อนุญาต');
  }

  /**
   * อ่าน response body แบบจำกัดขนาด — เกิน cap:
   *   allowTruncated=true (HTML): คืนเท่าที่อ่านได้ (best-effort สำหรับ parse OG)
   *   allowTruncated=false (รูป): throw — ห้ามเก็บ asset ที่ถูกตัดกลางคัน (ไฟล์เสีย)
   */
  private async readBody(
    res: Response,
    cap: number,
    opts: { allowTruncated?: boolean } = {},
  ): Promise<Buffer> {
    const contentLength = Number(res.headers.get('content-length') ?? 0);
    if (contentLength > cap) throw new Error(`response ใหญ่เกิน ${cap} bytes`);
    if (!res.body) return Buffer.alloc(0);

    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > cap) {
        await reader.cancel();
        if (opts.allowTruncated) break;
        throw new Error(`response ใหญ่เกิน ${cap} bytes (ตัดกลางคัน)`);
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  }

  // ─── HTML meta parsing (regex — ไม่เพิ่ม dependency) ───────────────────

  private metaContent(html: string, key: string, attr: 'property' | 'name' = 'property'): string | undefined {
    const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [
      new RegExp(`<meta[^>]*${attr}=["']${esc}["'][^>]*content=["']([^"']*)["']`, 'i'),
      new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*${attr}=["']${esc}["']`, 'i'),
    ];
    for (const pattern of patterns) {
      const m = html.match(pattern);
      if (m?.[1]) return this.decodeEntities(m[1]).trim() || undefined;
    }
    return undefined;
  }

  private htmlTitle(html: string): string | undefined {
    const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    return m?.[1] ? this.decodeEntities(m[1]).trim() || undefined : undefined;
  }

  private decodeEntities(s: string): string {
    return s
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;|&apos;/g, "'")
      .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)));
  }

  private audit(user: AuthUser, via: string, action: string, entityId: string, meta: object) {
    return this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        via,
        action,
        entityType: 'prompt',
        entityId,
        meta: meta as Prisma.InputJsonValue,
      },
    });
  }
}
