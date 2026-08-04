import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SettingsService } from '../settings/settings.service';
import { Prisma } from '@prisma/client';
import Anthropic, { APIError, AuthenticationError, RateLimitError } from '@anthropic-ai/sdk';
import { readFile } from 'node:fs/promises';
import { join, normalize, resolve } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/current-user.decorator';
import {
  AssetConsistencyDto,
  GenerateCaptionDto,
  GenerateShotListDto,
  WeeklyPlanDto,
} from './dto/phase4.dto';
import {
  ASSET_QC_SCHEMA,
  CAMERA_VALUES,
  CAPTION_SCHEMA,
  SHOT_LIST_SCHEMA,
  SIMILARITY_SCHEMA,
  WEEKLY_PLAN_SCHEMA,
} from './phase4.schemas';

const DEFAULT_MODEL = 'claude-opus-4-8';

const NOT_CONFIGURED_MESSAGE =
  'AI service ยังไม่ได้ตั้งค่า — กรุณาตั้งค่า ANTHROPIC_API_KEY ใน apps/api/.env แล้ว restart API';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const VISION_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
const SIMILARITY_CAP = 20;
const SIMILARITY_FLAG_THRESHOLD = 70;

interface ClaudeCallResult<T> {
  parsed: T;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  latencyMs: number;
}

export interface ShotDraft {
  shotNumber: number;
  durationSec: number;
  camera: string;
  action: string;
  dialogue: string;
  emotion: string;
  characterNames: string[];
}

interface CaptionResult {
  caption: string;
  hashtags: string[];
  cta: string;
}

interface AssetQcResult {
  score: number;
  matches: string[];
  mismatches: string[];
  antiCloneViolations: string[];
  verdict: string;
}

interface SimilarityRow {
  characterId: string;
  name: string;
  similarityScore: number;
  overlappingTraits: string[];
  riskNote: string;
}

interface WeeklyPlanResult {
  days: { date: string; items: { platform: string; characterName: string; contentIdea: string; rationale: string }[] }[];
  planNotes: string;
}

// เลือกเฉพาะ key ที่ต้องใช้จาก Json field — ลด token และกันข้อมูลรั่วเกินจำเป็น
function pickJson(value: Prisma.JsonValue | null | undefined, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== '') out[key] = source[key];
  }
  return out;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

@Injectable()
export class AiPhase4Service {
  private readonly logger = new Logger(AiPhase4Service.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    // optional จนกว่า SettingsModule (@Global) จะถูก register ใน AppModule — ระหว่างนั้น fallback ไป .env
    @Optional() private settings?: SettingsService,
  ) {}

  // ค่าอ่านต่อ call — แก้ค่าในหน้า Settings แล้วมีผลทันทีไม่ต้อง restart
  private async resolveApiKey(): Promise<string | undefined> {
    const key =
      (await this.settings?.get('ANTHROPIC_API_KEY')) ??
      this.config.get<string>('ANTHROPIC_API_KEY');
    return key?.trim() ? key.trim() : undefined;
  }

  private async resolveModel(): Promise<string> {
    const model =
      (await this.settings?.get('ANTHROPIC_MODEL')) ??
      this.config.get<string>('ANTHROPIC_MODEL');
    return model?.trim() ? model.trim() : DEFAULT_MODEL;
  }

  private storageDir(): string {
    return resolve(process.env.STORAGE_DIR ?? './storage');
  }

  // ─── shared Claude call (pattern เดียวกับ ai.service.ts: error mapping 503/429/502 + refusal) ───

  private async callClaude<T>(opts: {
    action: string;
    system: string;
    content: string | Anthropic.ContentBlockParam[];
    schema: Record<string, unknown>;
    maxTokens: number;
  }): Promise<ClaudeCallResult<T>> {
    const apiKey = await this.resolveApiKey();
    if (!apiKey) throw new ServiceUnavailableException(NOT_CONFIGURED_MESSAGE);

    const model = await this.resolveModel();
    const client = new Anthropic({ apiKey });
    const startedAt = Date.now();

    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model,
        max_tokens: opts.maxTokens,
        system: opts.system,
        messages: [{ role: 'user', content: opts.content }],
        output_config: {
          format: { type: 'json_schema', schema: opts.schema },
        },
        // SDK 0.70.x ยังไม่มี typing ของ output_config บน stable messages API — cast เพื่อส่งผ่านไปยัง API ตรง ๆ
      } as unknown as Anthropic.MessageCreateParamsNonStreaming);
    } catch (error) {
      // ลำดับสำคัญ: AuthenticationError/RateLimitError เป็น subclass ของ APIError
      if (error instanceof AuthenticationError) {
        throw new ServiceUnavailableException(
          'AI service ยังไม่ได้ตั้งค่า API key ให้ถูกต้อง — กรุณาตรวจสอบ ANTHROPIC_API_KEY ใน apps/api/.env',
        );
      }
      if (error instanceof RateLimitError) {
        throw new HttpException(
          'เรียก AI ถี่เกินไป กรุณารอสักครู่แล้วลองใหม่',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      if (error instanceof APIError) {
        throw new BadGatewayException(`AI service ขัดข้อง: ${error.message}`);
      }
      throw error;
    }

    if (response.stop_reason === 'refusal') {
      throw new BadRequestException(
        'AI ปฏิเสธคำขอนี้ (อาจขัด guardrails) — กรุณาปรับข้อมูลตั้งต้นแล้วลองใหม่',
      );
    }

    const usage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
    const latencyMs = Date.now() - startedAt;
    console.log(
      `[AI] ${opts.action} model=${model} input_tokens=${usage.inputTokens} output_tokens=${usage.outputTokens} latency_ms=${latencyMs}`,
    );

    const text = (response.content.find((b) => b.type === 'text') as { text?: string } | undefined)?.text;
    if (!text) {
      throw new BadGatewayException('AI ตอบกลับมาไม่มีเนื้อหา — กรุณาลองใหม่อีกครั้ง');
    }
    let parsed: T;
    try {
      parsed = JSON.parse(text) as T;
    } catch {
      this.logger.error(`AI returned unparsable JSON (action=${opts.action}, stop_reason=${response.stop_reason})`);
      throw new BadGatewayException('AI ตอบกลับมาในรูปแบบที่อ่านไม่ได้ — กรุณาลองใหม่อีกครั้ง');
    }
    return { parsed, model, usage, latencyMs };
  }

  private audit(user: AuthUser, action: string, entityType: string, entityId: string | null, meta: object) {
    return this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        via: 'ui',
        action,
        entityType,
        ...(entityId ? { entityId } : {}),
        meta: meta as Prisma.InputJsonValue,
      },
    });
  }

  // ─── 1. AI Shot List Generator (v0.1 §12.4 + §13) ────────────

  async generateShotList(episodeId: string, dto: GenerateShotListDto, user: AuthUser) {
    const episode = await this.prisma.episode.findUnique({
      where: { id: episodeId },
      include: {
        location: true,
        characters: true,
        products: { include: { product: true } },
        shots: { select: { id: true } },
      },
    });
    if (!episode || episode.archivedAt) throw new NotFoundException('ไม่พบ episode');

    if (!episode.script?.trim() && !episode.logline?.trim()) {
      throw new BadRequestException(
        'episode นี้ยังไม่มี script — กรุณาเขียน script ก่อนแล้วค่อยให้ AI แตก shot list',
      );
    }
    if (dto.create && episode.shots.length > 0) {
      throw new ConflictException(
        'episode นี้มี shot list อยู่แล้ว — ลบ shot เดิมก่อน หรือเรียกแบบ draft (create=false)',
      );
    }

    const maxShots = dto.maxShots ?? 12;
    const linkedCharacters = episode.characters.length
      ? await this.prisma.character.findMany({
          where: { id: { in: episode.characters.map((c) => c.characterId) } },
        })
      : [];

    const characterLines = linkedCharacters.map((c) => {
      const persona = pickJson(c.persona, ['one_line_concept', 'language_style', 'catchphrases', 'humor_style']);
      return `- ${c.nameTh}${c.nameEn ? ` (${c.nameEn})` : ''}: ${JSON.stringify(persona)}`;
    });

    const userMessage = [
      `Episode: ${episode.displayCode} "${episode.title}"`,
      ...(episode.logline ? [`Logline: ${episode.logline}`] : []),
      '',
      'Script:',
      episode.script ?? '(ไม่มี script เต็ม — ใช้ logline และโครงด้านล่าง)',
      '',
      `Hook (0-3 วิ): ${episode.hook ?? '-'}`,
      `Conflict: ${episode.conflict ?? '-'}`,
      `Twist: ${episode.twist ?? '-'}`,
      `CTA: ${episode.cta ?? '-'}`,
      '',
      characterLines.length
        ? `ตัวละครในตอน (ใช้ชื่อไทยเหล่านี้เท่านั้นใน characterNames):\n${characterLines.join('\n')}`
        : 'ยังไม่มีตัวละคร link กับตอนนี้ — characterNames ให้เป็น array ว่าง',
      ...(episode.location?.prompt
        ? ['', `Location: ${episode.location.name} — ${episode.location.prompt}`]
        : episode.location
          ? ['', `Location: ${episode.location.name}`]
          : []),
      ...(episode.products.length
        ? ['', `สินค้า tie-in ในตอน: ${episode.products.map((p) => p.product.name).join(', ')}`]
        : []),
      '',
      `แตก shot list ไม่เกิน ${maxShots} shots เรียงตามโครงสร้าง Hook 0-3s → Setup → Conflict → Twist → Product tie-in → Punchline → CTA`,
    ].join('\n');

    const system = `คุณคือ Shot List Director ประจำ AISTAR Studio — สตูดิโอผลิต short-drama ด้วย AI Talent ในประเทศไทย
หน้าที่: แตก script ของ episode เป็น shot breakdown สำหรับทีม AI Video Production
กติกา:
- เนื้อหาทั้งหมดเป็นภาษาไทย (action/dialogue/emotion)
- แต่ละ shot ยาว 1-10 วินาที รวมทั้งคลิปควรอยู่ในช่วง 30-90 วินาที (short video)
- shot แรกต้องเป็น Hook 0-3 วินาทีที่ดึงคนดูทันที
- camera ใช้ได้เฉพาะค่า: ${CAMERA_VALUES.join(', ')}
- characterNames ใช้ชื่อไทยของตัวละครที่ให้ไว้เท่านั้น — ห้ามสร้างตัวละครใหม่
- ถ้ามีสินค้า tie-in ต้องมี shot product tie-in ที่เนียนไปกับเนื้อเรื่อง ห้าม claim สรรพคุณเกินจริง (per AISTAR policy §G.2)
- shotNumber เรียง 1, 2, 3, ... ต่อเนื่อง`;

    const { parsed, model, usage, latencyMs } = await this.callClaude<{ shots: ShotDraft[] }>({
      action: 'ai_generate_shot_list',
      system,
      content: userMessage,
      schema: SHOT_LIST_SCHEMA,
      maxTokens: 16000,
    });

    const shots = (parsed.shots ?? []).slice(0, maxShots).map((s, i) => ({
      ...s,
      shotNumber: i + 1,
      camera: (CAMERA_VALUES as readonly string[]).includes(s.camera) ? s.camera : 'medium',
      characterNames: Array.isArray(s.characterNames) ? s.characterNames : [],
    }));
    if (shots.length === 0) {
      throw new BadGatewayException('AI ไม่ได้สร้าง shot ใดเลย — กรุณาลองใหม่อีกครั้ง');
    }

    // map characterNames → characterId ของตัวละครที่ link กับ episode (skip ชื่อที่ไม่ match)
    const nameToId = new Map<string, string>();
    for (const c of linkedCharacters) {
      nameToId.set(normalizeName(c.nameTh), c.id);
      if (c.nameEn) nameToId.set(normalizeName(c.nameEn), c.id);
    }

    let createdCount = 0;
    if (dto.create) {
      await this.prisma.$transaction(async (tx) => {
        // กันคนอื่นเพิ่ม shot ระหว่าง AI ทำงาน — เช็คซ้ำใน transaction
        const existing = await tx.shot.count({ where: { episodeId } });
        if (existing > 0) {
          throw new ConflictException(
            'episode นี้มี shot list อยู่แล้ว — ลบ shot เดิมก่อน หรือเรียกแบบ draft (create=false)',
          );
        }
        for (const s of shots) {
          const characterIds = [
            ...new Set(
              s.characterNames
                .map((n) => nameToId.get(normalizeName(n)))
                .filter((v): v is string => Boolean(v)),
            ),
          ];
          await tx.shot.create({
            data: {
              episodeId,
              shotNumber: s.shotNumber,
              durationSec: s.durationSec > 0 ? s.durationSec : null,
              camera: s.camera,
              action: s.action || null,
              dialogue: s.dialogue || null,
              emotion: s.emotion || null,
              status: 'planned',
              ...(characterIds.length
                ? { characters: { create: characterIds.map((characterId) => ({ characterId })) } }
                : {}),
            },
          });
          createdCount++;
        }
      });
    }

    await this.audit(user, 'ai_generate_shot_list', 'episode', episodeId, {
      model,
      usage,
      latencyMs,
      shotCount: shots.length,
      created: Boolean(dto.create),
      createdCount,
    });

    return { draft: shots, createdCount, provenance: 'ai', model, usage };
  }

  // ─── 2. AI Caption Generator ─────────────────────────────────

  async generateCaption(dto: GenerateCaptionDto, user: AuthUser) {
    const [character, product, episode] = await Promise.all([
      dto.characterId
        ? this.prisma.character.findUnique({ where: { id: dto.characterId } })
        : Promise.resolve(null),
      dto.productId
        ? this.prisma.product.findUnique({ where: { id: dto.productId } })
        : Promise.resolve(null),
      dto.episodeId
        ? this.prisma.episode.findUnique({ where: { id: dto.episodeId } })
        : Promise.resolve(null),
    ]);
    if (dto.characterId && !character) throw new NotFoundException('ไม่พบ character');
    if (dto.productId && !product) throw new NotFoundException('ไม่พบ product');
    if (dto.episodeId && !episode) throw new NotFoundException('ไม่พบ episode');

    const restrictedClaims = (product?.restrictedClaims ?? []).filter((c) => c.trim().length > 0);

    const guardrailLines = [
      'GUARDRAILS — บังคับใช้เสมอ ห้ามละเมิดเด็ดขาด (per AISTAR policy §G.2):',
      '1. ห้าม claim สรรพคุณเกินจริงตามกฎ อย. — ห้ามคำเชิงรับประกันผลลัพธ์ เช่น "หายขาด" "ขาว 100%" "ลดจริงใน 7 วัน"',
      '2. โทนการขายต้องจริงใจ ตรวจสอบได้ ไม่หลอกลวงผู้บริโภค',
      ...(restrictedClaims.length
        ? [
            `3. ห้ามใช้ข้อความ claim เหล่านี้เด็ดขาด (restricted claims ของสินค้า): ${restrictedClaims
              .map((c) => `"${c}"`)
              .join(', ')} — รวมถึงข้อความที่สื่อความหมายเดียวกัน`,
          ]
        : []),
    ];

    const system = `คุณคือ Social Media Copywriter ประจำ AISTAR Studio — เขียน caption ภาษาไทยสำหรับคอนเทนต์ short video / commerce
${guardrailLines.join('\n')}
กติกา:
- caption ภาษาไทย ความยาวเหมาะกับ platform (tiktok/reels สั้นกระชับ 1-3 ประโยค + อีโมจิพอดี, youtube ยาวได้เล็กน้อย)
- hashtags 8-15 อัน ผสมไทย/อังกฤษ ใส่ # นำหน้า สอดคล้องกับเนื้อหาและ platform
- cta สั้น ชวนทำสิ่งเดียวชัด ๆ
- เขียนให้ตรงเสียงของตัวละคร (language_style + catchphrases) ถ้ามีข้อมูลให้`;

    const buildUserMessage = (extra?: string) =>
      [
        `หัวข้อคอนเทนต์: ${dto.title}`,
        `Platform: ${dto.platform}`,
        ...(dto.tone ? [`โทนที่ต้องการ: ${dto.tone}`] : []),
        ...(character
          ? [
              `ตัวละคร: ${character.nameTh}${character.nameEn ? ` (${character.nameEn})` : ''}`,
              `เสียงของตัวละคร: ${JSON.stringify(
                pickJson(character.persona, ['language_style', 'catchphrases', 'humor_style', 'one_line_concept']),
              )}`,
            ]
          : []),
        ...(product
          ? [`สินค้า: ${product.name}${product.category ? ` (หมวด ${product.category})` : ''}`]
          : []),
        ...(episode ? [`Episode: "${episode.title}"${episode.logline ? ` — ${episode.logline}` : ''}`] : []),
        ...(extra ? ['', extra] : []),
        '',
        'ช่วยเขียน caption + hashtags + cta',
      ].join('\n');

    let call = await this.callClaude<CaptionResult>({
      action: 'ai_generate_caption',
      system,
      content: buildUserMessage(),
      schema: CAPTION_SCHEMA,
      maxTokens: 4000,
    });
    let result = call.parsed;

    // Post-check guardrail: restrictedClaims ต้องไม่โผล่ใน caption/cta (case-insensitive)
    const findViolations = (r: CaptionResult) =>
      restrictedClaims.filter((claim) => {
        const needle = claim.toLowerCase();
        return (
          (r.caption ?? '').toLowerCase().includes(needle) || (r.cta ?? '').toLowerCase().includes(needle)
        );
      });

    let warning: string | undefined;
    let regenerated = false;
    let violations = findViolations(result);
    if (violations.length > 0) {
      regenerated = true;
      call = await this.callClaude<CaptionResult>({
        action: 'ai_generate_caption_retry',
        system,
        content: buildUserMessage(
          `คำเตือน: ผลก่อนหน้ามีข้อความ claim ต้องห้าม (${violations.map((v) => `"${v}"`).join(', ')}) — เขียนใหม่โดยห้ามมีข้อความเหล่านี้หรือความหมายเดียวกันเด็ดขาด`,
        ),
        schema: CAPTION_SCHEMA,
        maxTokens: 4000,
      });
      result = call.parsed;
      violations = findViolations(result);
      if (violations.length > 0) {
        // strip claim ที่ยังหลงเหลือ + แนบ warning ให้คนตรวจ
        for (const claim of violations) {
          const pattern = new RegExp(claim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
          result.caption = (result.caption ?? '').replace(pattern, '').replace(/\s{2,}/g, ' ').trim();
          result.cta = (result.cta ?? '').replace(pattern, '').replace(/\s{2,}/g, ' ').trim();
        }
        warning = `พบข้อความ claim ต้องห้ามในผลลัพธ์ AI และถูกตัดออกแล้ว: ${violations.join(', ')} — กรุณาตรวจ caption ด้วยตนเองก่อนใช้งาน`;
      }
    }

    await this.audit(user, 'ai_generate_caption', 'content', null, {
      model: call.model,
      usage: call.usage,
      platform: dto.platform,
      characterId: dto.characterId ?? null,
      productId: dto.productId ?? null,
      episodeId: dto.episodeId ?? null,
      regenerated,
      strippedClaims: warning ? violations : [],
    });

    return {
      caption: result.caption,
      hashtags: result.hashtags ?? [],
      cta: result.cta,
      ...(warning ? { warning } : {}),
      provenance: 'ai',
      model: call.model,
      usage: call.usage,
    };
  }

  // ─── 3. AI Asset QC — vision consistency check ───────────────

  async checkAssetConsistency(assetId: string, dto: AssetConsistencyDto, user: AuthUser) {
    const [asset, character] = await Promise.all([
      this.prisma.asset.findUnique({ where: { id: assetId } }),
      this.prisma.character.findUnique({ where: { id: dto.characterId } }),
    ]);
    if (!asset || asset.archivedAt) throw new NotFoundException('ไม่พบ asset');
    if (!character) throw new NotFoundException('ไม่พบ character');

    if (!(VISION_MEDIA_TYPES as readonly string[]).includes(asset.mimeType)) {
      throw new BadRequestException(
        'AI QC รองรับเฉพาะรูปภาพ (jpeg/png/gif/webp) — asset นี้ไม่ใช่รูปภาพที่รองรับ',
      );
    }
    if (asset.fileSize > MAX_IMAGE_BYTES) {
      throw new BadRequestException('รูปใหญ่เกิน 5MB — AI QC ตรวจไม่ได้ กรุณาใช้รูปที่เล็กกว่านี้');
    }

    const visualDna = character.visualDna as Record<string, unknown> | null;
    if (!visualDna || Object.keys(visualDna).length === 0) {
      throw new BadRequestException('character นี้ยังไม่มี Visual DNA — กรอก Visual DNA ก่อนจึงตรวจ consistency ได้');
    }

    // อ่านไฟล์ตรงจาก STORAGE_DIR (pattern เดียวกับ storage.service) + กัน path traversal
    const baseDir = this.storageDir();
    const filePath = normalize(join(baseDir, asset.storageKey));
    if (!filePath.startsWith(baseDir)) {
      throw new BadRequestException('storage key ของ asset ไม่ถูกต้อง');
    }
    let buffer: Buffer;
    try {
      buffer = await readFile(filePath);
    } catch {
      throw new NotFoundException('ไม่พบไฟล์รูปใน storage — asset อาจถูกลบไปแล้ว');
    }

    const system = `คุณคือ QC Reviewer ด้าน character consistency ประจำ AISTAR Studio
หน้าที่: เทียบรูปภาพกับ Visual DNA spec ของตัวละคร แล้วให้คะแนนความตรง 1-5
กติกา:
- ตรวจทีละจุด: หน้า ตา คิ้ว จมูก ปาก สีผิว ทรงผม รูปร่าง สไตล์แต่งตัว จุดเด่นเฉพาะตัว
- antiCloneViolations: ตรวจว่ารูปละเมิด anti_clone_rules หรือดูคล้ายบุคคลจริง/ตัวละคร IP อื่นหรือไม่
- ให้คะแนนตรงไปตรงมา: 5 = ตรง spec แทบทุกจุด, 3 = ตรงบางส่วนใช้ได้แต่ต้องแก้, 1 = ไม่ใช่ตัวละครนี้
- verdict สรุปภาษาไทย กระชับ พร้อมคำแนะนำว่าควร approve เป็น reference หรือ reject`;

    const content: Anthropic.ContentBlockParam[] = [
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: asset.mimeType as (typeof VISION_MEDIA_TYPES)[number],
          data: buffer.toString('base64'),
        },
      },
      {
        type: 'text',
        text: [
          `ตัวละคร: ${character.nameTh}${character.nameEn ? ` (${character.nameEn})` : ''} [${character.displayCode}]`,
          '',
          'Visual DNA spec:',
          JSON.stringify(visualDna, null, 2),
          '',
          'ประเมินรูปภาพด้านบนเทียบกับ Visual DNA spec นี้',
        ].join('\n'),
      },
    ];

    const { parsed, model, usage, latencyMs } = await this.callClaude<AssetQcResult>({
      action: 'ai_qc_asset_consistency',
      system,
      content,
      schema: ASSET_QC_SCHEMA,
      maxTokens: 4000,
    });

    const score = Math.min(5, Math.max(1, Math.round(parsed.score)));
    const result: AssetQcResult = { ...parsed, score };

    let qcReviewId: string | undefined;
    if (dto.save) {
      const review = await this.prisma.qcReview.create({
        data: {
          entityType: 'asset',
          entityId: assetId,
          category: 'character_consistency',
          score,
          // ระบุชัดว่าเป็น AI pre-check — ไม่ใช่ผลตรวจของมนุษย์ (guardrail §28.2: AI ห้าม approve แทนมนุษย์)
          comment: `[AI pre-check — ไม่ใช่ผลตรวจของมนุษย์] ${result.verdict}`,
          reviewerId: user.id,
        },
      });
      qcReviewId = review.id;
    }

    await this.audit(user, 'ai_qc_asset_consistency', 'asset', assetId, {
      model,
      usage,
      latencyMs,
      characterId: dto.characterId,
      score,
      saved: Boolean(dto.save),
      ...(qcReviewId ? { qcReviewId } : {}),
    });

    return { ...result, saved: Boolean(dto.save), ...(qcReviewId ? { qcReviewId } : {}), provenance: 'ai', model, usage };
  }

  // ─── 4. AI Similarity Checker (text-based v1) ────────────────

  async checkCharacterSimilarity(characterId: string, user: AuthUser) {
    const target = await this.prisma.character.findUnique({ where: { id: characterId } });
    if (!target || target.archivedAt) throw new NotFoundException('ไม่พบ character');

    const others = await this.prisma.character.findMany({
      where: {
        id: { not: characterId },
        archivedAt: null,
        status: { not: 'archived' },
      },
      orderBy: { updatedAt: 'desc' },
      take: SIMILARITY_CAP,
    });

    if (others.length === 0) {
      return {
        items: [],
        summary: 'ยังไม่มีตัวละครอื่นในระบบให้เปรียบเทียบ',
        comparedCount: 0,
        provenance: 'ai' as const,
      };
    }

    const compact = (c: (typeof others)[number]) => ({
      id: c.id,
      name: `${c.nameTh}${c.nameEn ? ` (${c.nameEn})` : ''}`,
      universe: c.universe ?? undefined,
      persona: pickJson(c.persona, [
        'one_line_concept',
        'personality',
        'language_style',
        'catchphrases',
        'humor_style',
      ]),
      visualDna: pickJson(c.visualDna, [
        'ethnicity',
        'face_shape',
        'hair_style',
        'fashion_style',
        'distinctive_features',
        'color_palette',
        'anti_clone_rules',
      ]),
    });

    const system = `คุณคือ Originality Checker ประจำ AISTAR Studio — ตรวจความซ้ำ/ทับซ้อนระหว่างตัวละคร AI Talent ในสตูดิโอเดียวกัน
หน้าที่: เทียบ "ตัวละครเป้าหมาย" กับตัวละครอื่นทุกตัวที่ให้มา แล้วให้คะแนนความคล้าย 0-100 ต่อคู่
กติกา:
- พิจารณาทั้ง persona (บุคลิก สไตล์ภาษา วลีติดปาก) และ visual DNA (หน้าตา ทรงผม แฟชั่น สี)
- similarityScore: 0-30 = ต่างชัดเจน, 31-69 = มีจุดทับซ้อนบ้าง, 70+ = คล้ายจนเสี่ยงตัวละครชนกัน ต้องรีวิว
- ตอบครบทุกตัวละครที่ให้มา ใช้ characterId ตรงตาม id ที่ให้เท่านั้น
- overlappingTraits และ riskNote เป็นภาษาไทย เฉพาะเจาะจง`;

    const userMessage = [
      'ตัวละครเป้าหมาย:',
      JSON.stringify(compact(target), null, 2),
      '',
      `ตัวละครอื่นในสตูดิโอ (${others.length} ตัว):`,
      JSON.stringify(others.map(compact), null, 2),
    ].join('\n');

    const { parsed, model, usage, latencyMs } = await this.callClaude<{
      results: SimilarityRow[];
      summary: string;
    }>({
      action: 'ai_character_similarity',
      system,
      content: userMessage,
      schema: SIMILARITY_SCHEMA,
      maxTokens: 8000,
    });

    const knownIds = new Map(others.map((c) => [c.id, c]));
    const items = (parsed.results ?? [])
      .filter((r) => knownIds.has(r.characterId))
      .map((r) => {
        const c = knownIds.get(r.characterId)!;
        const score = Math.min(100, Math.max(0, Math.round(r.similarityScore)));
        return {
          characterId: r.characterId,
          displayCode: c.displayCode,
          name: c.nameTh,
          similarityScore: score,
          overlappingTraits: r.overlappingTraits ?? [],
          riskNote: r.riskNote,
          flagged: score >= SIMILARITY_FLAG_THRESHOLD,
        };
      })
      .sort((a, b) => b.similarityScore - a.similarityScore);

    await this.audit(user, 'ai_character_similarity', 'character', characterId, {
      model,
      usage,
      latencyMs,
      comparedCount: others.length,
      flaggedCount: items.filter((i) => i.flagged).length,
    });

    return { items, summary: parsed.summary, comparedCount: others.length, provenance: 'ai', model, usage };
  }

  // ─── 5. AI Weekly Plan ───────────────────────────────────────

  async generateWeeklyPlan(dto: WeeklyPlanDto, user: AuthUser) {
    const weekStart = new Date(`${dto.weekStart}T00:00:00.000Z`);
    if (Number.isNaN(weekStart.getTime())) {
      throw new BadRequestException('weekStart ไม่ใช่วันที่ที่ถูกต้อง');
    }
    const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [campaigns, characters, performances, scheduled] = await Promise.all([
      this.prisma.campaign.findMany({
        where: { archivedAt: null, status: { in: ['brief', 'planning', 'production', 'review', 'published'] } },
        orderBy: { updatedAt: 'desc' },
        take: 15,
      }),
      this.prisma.character.findMany({
        where: { archivedAt: null, status: { in: ['approved', 'production_ready'] } },
        orderBy: { updatedAt: 'desc' },
        take: 20,
      }),
      this.prisma.contentPerformance.findMany({
        where: { recordedAt: { gte: since30d } },
        include: { contentItem: { include: { characters: true } } },
      }),
      this.prisma.contentItem.findMany({
        where: { archivedAt: null, scheduledAt: { gte: weekStart, lt: weekEnd } },
        orderBy: { scheduledAt: 'asc' },
        take: 50,
      }),
    ]);

    if (characters.length === 0) {
      throw new BadRequestException('ยังไม่มีตัวละครที่ approved — ต้องมีตัวละครพร้อมใช้ก่อนจึงวางแผนสัปดาห์ได้');
    }

    // aggregate performance 30 วัน by platform และ by character (in-memory จาก raw prisma rows)
    const byPlatform = new Map<string, { views: number; likes: number; orders: number; records: number }>();
    const byCharacter = new Map<string, { views: number; likes: number; orders: number; records: number }>();
    for (const p of performances) {
      const plat = byPlatform.get(p.platform) ?? { views: 0, likes: 0, orders: 0, records: 0 };
      plat.views += p.views ?? 0;
      plat.likes += p.likes ?? 0;
      plat.orders += p.orders ?? 0;
      plat.records += 1;
      byPlatform.set(p.platform, plat);
      for (const link of p.contentItem?.characters ?? []) {
        const ch = byCharacter.get(link.characterId) ?? { views: 0, likes: 0, orders: 0, records: 0 };
        ch.views += p.views ?? 0;
        ch.likes += p.likes ?? 0;
        ch.orders += p.orders ?? 0;
        ch.records += 1;
        byCharacter.set(link.characterId, ch);
      }
    }
    const charNameById = new Map(characters.map((c) => [c.id, c.nameTh]));
    const topCharacters = [...byCharacter.entries()]
      .sort((a, b) => b[1].views - a[1].views)
      .slice(0, 8)
      .map(([cid, agg]) => ({ character: charNameById.get(cid) ?? cid, ...agg }));

    const system = `คุณคือ Content Strategist ประจำ AISTAR Studio — วางแผนคอนเทนต์รายสัปดาห์สำหรับ AI Talent สาย short-drama และ live commerce ในไทย
กติกา:
- แผนครบ 7 วันเริ่มจาก weekStart แต่ละวัน 1-3 ไอเดีย
- characterName ใช้ชื่อจากรายชื่อ approved characters เท่านั้น
- อิงข้อมูลจริงที่ให้: campaign ที่กำลังรัน, performance 30 วันล่าสุด (platform/ตัวละครไหนแรง), และคอนเทนต์ที่ scheduled ไว้แล้ว (อย่าวางซ้ำ/ชนกัน)
- ไอเดียเฉพาะเจาะจง ทำได้จริง เป็นภาษาไทย — ไม่ generic
- ห้ามแนะนำคอนเทนต์ที่ claim สรรพคุณสินค้าเกินจริง (per AISTAR policy §G.2)`;

    const userMessage = [
      `วางแผนคอนเทนต์สัปดาห์เริ่ม ${dto.weekStart} (7 วัน: ${dto.weekStart} ถึงก่อน ${weekEnd.toISOString().slice(0, 10)})`,
      '',
      `Campaign ที่ active (${campaigns.length}):`,
      JSON.stringify(
        campaigns.map((c) => ({
          name: c.name,
          objective: c.objective,
          status: c.status,
          startDate: c.startDate?.toISOString().slice(0, 10),
          endDate: c.endDate?.toISOString().slice(0, 10),
        })),
        null,
        2,
      ),
      '',
      `Approved characters (${characters.length}) — ใช้ชื่อเหล่านี้เท่านั้น:`,
      JSON.stringify(
        characters.map((c) => ({
          name: c.nameTh,
          concept: pickJson(c.persona, ['one_line_concept']).one_line_concept ?? null,
          suitableProducts: pickJson(c.commerceProfile, ['suitable_product_categories']).suitable_product_categories ?? null,
        })),
        null,
        2,
      ),
      '',
      'Performance 30 วันล่าสุด by platform:',
      JSON.stringify([...byPlatform.entries()].map(([platform, agg]) => ({ platform, ...agg })), null, 2),
      '',
      'Performance 30 วันล่าสุด by character (top):',
      JSON.stringify(topCharacters, null, 2),
      '',
      `คอนเทนต์ที่ scheduled ไว้แล้วในสัปดาห์นี้ (${scheduled.length}):`,
      JSON.stringify(
        scheduled.map((s) => ({
          title: s.title,
          platform: s.platform,
          scheduledAt: s.scheduledAt?.toISOString(),
          status: s.status,
        })),
        null,
        2,
      ),
    ].join('\n');

    const { parsed, model, usage, latencyMs } = await this.callClaude<WeeklyPlanResult>({
      action: 'ai_weekly_plan',
      system,
      content: userMessage,
      schema: WEEKLY_PLAN_SCHEMA,
      maxTokens: 8000,
    });

    await this.audit(user, 'ai_weekly_plan', 'content', null, {
      model,
      usage,
      latencyMs,
      weekStart: dto.weekStart,
      campaignCount: campaigns.length,
      characterCount: characters.length,
      scheduledCount: scheduled.length,
    });

    return {
      weekStart: dto.weekStart,
      days: parsed.days ?? [],
      planNotes: parsed.planNotes,
      context: {
        campaignCount: campaigns.length,
        characterCount: characters.length,
        scheduledCount: scheduled.length,
        performanceRecords: performances.length,
      },
      provenance: 'ai',
      model,
      usage,
    };
  }
}
