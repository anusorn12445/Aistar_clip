import {
  BadGatewayException,
  BadRequestException,
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
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/current-user.decorator';
import { ContinuityCheckDto, NextEpisodeDto } from './dto/series-ai.dto';
import {
  CONTINUITY_CHECK_SCHEMA,
  NEXT_EPISODE_SCHEMA,
  SERIES_BIBLE_SCHEMA,
} from './series-ai.schemas';

const DEFAULT_MODEL = 'claude-opus-4-8';

const NOT_CONFIGURED_MESSAGE =
  'AI service ยังไม่ได้ตั้งค่า — กรุณาตั้งค่า ANTHROPIC_API_KEY ใน apps/api/.env แล้ว restart API';

const SCRIPT_EXCERPT_CHARS = 2000;
const TARGET_SCRIPT_CHARS = 8000;

// guardrails ร่วมของ Series Hub AI (สอดคล้อง ai.service.ts §G.2)
const SHARED_GUARDRAILS = `GUARDRAILS — บังคับใช้เสมอ ห้ามละเมิดเด็ดขาด (per AISTAR policy §G.2):
1. ตัวละครทุกตัวอายุ 18 ปีขึ้นไปเสมอ (บริบท commerce) — ห้ามเขียนให้ดูเป็นผู้เยาว์
2. ห้ามลอกเลียนพล็อต ตัวละคร หรือ IP ของคู่แข่ง/ผลงานที่มีอยู่แล้ว ทั้งไทยและต่างประเทศ — original เท่านั้น
3. ห้ามอ้างอิงหน้าตา/ตัวตนของบุคคลจริง ดารา หรือบุคคลสาธารณะ
4. ถ้ามีสินค้า tie-in ห้าม claim สรรพคุณเกินจริง — โทนการขายจริงใจ ตรวจสอบได้`;

interface ClaudeCallResult<T> {
  parsed: T;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  latencyMs: number;
}

export interface SeriesBibleDraft {
  world_rules: string[];
  timeline: { when: string; event: string }[];
  relationships: { pair: string; status: string }[];
  last_cliffhanger: string;
  notes: string;
}

interface ContinuityResult {
  issues: { severity: 'low' | 'medium' | 'high'; what: string; where: string; suggestion: string }[];
  relationshipUpdates: { pair: string; newStatus: string }[];
  cliffhangerSuggestion: string;
  verdict: string;
}

interface NextEpisodeResult {
  options: { title: string; logline: string; hook: string; twist: string; cta: string; rationale: string }[];
}

// เลือกเฉพาะ key ที่ต้องใช้จาก Json field — ลด token (pattern เดียวกับ ai-phase4.service)
function pickJson(value: Prisma.JsonValue | null | undefined, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== '') out[key] = source[key];
  }
  return out;
}

function episodeSummaryLines(e: {
  displayCode: string;
  season: string | null;
  episodeNumber: number | null;
  title: string;
  logline: string | null;
  hook: string | null;
  twist: string | null;
}): string {
  return [
    `- ${e.displayCode} ${e.season ?? ''} EP${e.episodeNumber ?? '?'} "${e.title}"`,
    ...(e.logline ? [`  logline: ${e.logline}`] : []),
    ...(e.hook ? [`  hook: ${e.hook}`] : []),
    ...(e.twist ? [`  twist: ${e.twist}`] : []),
  ].join('\n');
}

@Injectable()
export class AiSeriesService {
  private readonly logger = new Logger(AiSeriesService.name);

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

  // ─── shared Claude call (pattern เดียวกับ ai-phase4.service: 503/429/502 + refusal→400) ───

  private async callClaude<T>(opts: {
    action: string;
    system: string;
    content: string;
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

  private audit(user: AuthUser, action: string, entityId: string, meta: object) {
    return this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        via: 'ui',
        action,
        entityType: 'series',
        entityId,
        meta: meta as Prisma.InputJsonValue,
      },
    });
  }

  private async loadSeries(id: string) {
    const series = await this.prisma.series.findUnique({
      where: { id },
      include: { characters: true },
    });
    if (!series) throw new NotFoundException('ไม่พบ series');
    return series;
  }

  private async castLines(seriesCharacters: { characterId: string; role: string }[]): Promise<string[]> {
    if (!seriesCharacters.length) return [];
    const rows = await this.prisma.character.findMany({
      where: { id: { in: seriesCharacters.map((c) => c.characterId) } },
    });
    const roleMap = new Map(seriesCharacters.map((c) => [c.characterId, c.role]));
    return rows.map((c) => {
      const persona = pickJson(c.persona, [
        'one_line_concept',
        'personality',
        'language_style',
        'catchphrases',
      ]);
      return `- ${c.nameTh}${c.nameEn ? ` (${c.nameEn})` : ''} [บทบาท: ${roleMap.get(c.id) ?? 'main'}]: ${JSON.stringify(persona)}`;
    });
  }

  // ─── 1. Bible Draft — ร่าง series bible จากตอนที่มีอยู่ ──────

  async draftBible(seriesId: string, user: AuthUser) {
    const series = await this.loadSeries(seriesId);

    const episodes = await this.prisma.episode.findMany({
      where: { seriesId, archivedAt: null },
      orderBy: [{ season: 'desc' }, { episodeNumber: 'desc' }],
      take: 5,
      select: {
        displayCode: true,
        season: true,
        episodeNumber: true,
        title: true,
        logline: true,
        hook: true,
        twist: true,
        script: true,
      },
    });
    episodes.reverse(); // เรียงเก่า → ใหม่ ให้ AI เห็นลำดับเรื่อง

    if (!series.premise?.trim() && episodes.length === 0) {
      throw new BadRequestException(
        'ซีรีส์นี้ยังไม่มี premise และยังไม่มีตอน — เพิ่มข้อมูลอย่างน้อยหนึ่งอย่างก่อนให้ AI ร่าง bible',
      );
    }

    const castLines = await this.castLines(series.characters);

    const episodeBlocks = episodes.map((e) =>
      [
        episodeSummaryLines(e),
        ...(e.script
          ? [`  script (ตัดตอน ${SCRIPT_EXCERPT_CHARS} ตัวอักษรแรก): ${e.script.slice(0, SCRIPT_EXCERPT_CHARS)}`]
          : []),
      ].join('\n'),
    );

    const system = `คุณคือ Story Editor ประจำ AISTAR Studio — สตูดิโอผลิต short-drama ด้วย AI Talent ในประเทศไทย
หน้าที่: อ่าน premise + ตอนที่มีอยู่ของซีรีส์ แล้วร่าง "Series Bible" — เอกสาร continuity กลางของเรื่อง
กติกา:
- เนื้อหาทั้งหมดภาษาไทย เฉพาะเจาะจง อิงจากข้อมูลที่ให้เท่านั้น — ห้ามแต่งเหตุการณ์ที่ไม่มีในข้อมูล ยกเว้นส่วน notes ที่แนะนำได้
- world_rules: กฎของโลก/ข้อเท็จจริงคงที่ที่ทุกตอนต้องเคารพ
- timeline: เหตุการณ์สำคัญเรียงลำดับ อ้างอิงตอน (เช่น "S1 EP2")
- relationships: สถานะ ณ จุดล่าสุดของเรื่อง
- last_cliffhanger: สิ่งที่ค้างไว้ท้ายตอนล่าสุด — string ว่างถ้ายังไม่มี
${SHARED_GUARDRAILS}`;

    const userMessage = [
      `ซีรีส์: "${series.name}"${series.universe ? ` (จักรวาล: ${series.universe})` : ''}`,
      ...(series.premise ? [`Premise: ${series.premise}`] : []),
      ...(series.description ? [`Description: ${series.description}`] : []),
      '',
      castLines.length ? `นักแสดงประจำเรื่อง:\n${castLines.join('\n')}` : 'ยังไม่มีนักแสดงประจำเรื่อง',
      '',
      episodes.length
        ? `ตอนที่มีอยู่ (${episodes.length} ตอนล่าสุด เรียงเก่า→ใหม่):\n${episodeBlocks.join('\n\n')}`
        : 'ยังไม่มีตอน — ร่าง bible จาก premise',
      '',
      'ร่าง Series Bible จากข้อมูลข้างต้น',
    ].join('\n');

    const { parsed, model, usage, latencyMs } = await this.callClaude<SeriesBibleDraft>({
      action: 'ai_series_bible_draft',
      system,
      content: userMessage,
      schema: SERIES_BIBLE_SCHEMA,
      maxTokens: 8000,
    });

    await this.audit(user, 'ai_series_bible_draft', seriesId, {
      model,
      usage,
      latencyMs,
      episodeCount: episodes.length,
      castCount: series.characters.length,
    });

    return { bible: parsed, provenance: 'ai', model, usage };
  }

  // ─── 2. Continuity Check — เทียบ script ตอนกับ bible + ตอนก่อนหน้า ───

  async continuityCheck(seriesId: string, dto: ContinuityCheckDto, user: AuthUser) {
    const series = await this.loadSeries(seriesId);

    const target = await this.prisma.episode.findUnique({ where: { id: dto.episodeId } });
    if (!target || target.archivedAt) throw new NotFoundException('ไม่พบ episode');
    if (target.seriesId !== seriesId) {
      throw new BadRequestException('episode นี้ไม่ได้อยู่ในซีรีส์นี้');
    }
    if (!target.script?.trim()) {
      throw new BadRequestException('episode นี้ยังไม่มี script — เขียน script ก่อนจึงเช็ค continuity ได้');
    }

    // ตอนก่อนหน้า 3 ตอน ตามลำดับ season + episodeNumber
    const all = await this.prisma.episode.findMany({
      where: { seriesId, archivedAt: null },
      orderBy: [{ season: 'asc' }, { episodeNumber: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        displayCode: true,
        season: true,
        episodeNumber: true,
        title: true,
        logline: true,
        hook: true,
        twist: true,
      },
    });
    const idx = all.findIndex((e) => e.id === target.id);
    const previous = idx > 0 ? all.slice(Math.max(0, idx - 3), idx) : [];

    const castLines = await this.castLines(series.characters);
    const bible = series.bible && typeof series.bible === 'object' ? series.bible : null;

    const system = `คุณคือ Continuity Supervisor ประจำ AISTAR Studio — ตรวจความต่อเนื่องของ short-drama series
หน้าที่: เทียบ script ของตอนเป้าหมายกับ Series Bible และตอนก่อนหน้า แล้วรายงานปัญหา continuity
กติกา:
- ตรวจ: ข้อเท็จจริงขัด world_rules, ไทม์ไลน์ย้อนแย้ง, ความสัมพันธ์ตัวละครไม่ตรงสถานะล่าสุด, ตัวละครพูด/ทำผิด persona, cliffhanger เดิมถูกทิ้งไม่สานต่อ
- severity: high = คนดูจับได้แน่/เรื่องพัง, medium = คนดูประจำสังเกตได้, low = รายละเอียดเล็กน้อย
- ถ้าไม่พบปัญหา issues เป็น array ว่าง — อย่าแต่งปัญหาที่ไม่มีจริง
- relationshipUpdates: เฉพาะความสัมพันธ์ที่ "เปลี่ยน" จากเหตุการณ์ในตอนนี้
- ทุกข้อความภาษาไทย เฉพาะเจาะจง อ้างจุดใน script ได้
${SHARED_GUARDRAILS}`;

    const userMessage = [
      `ซีรีส์: "${series.name}"${series.premise ? ` — ${series.premise}` : ''}`,
      '',
      bible ? `Series Bible ปัจจุบัน:\n${JSON.stringify(bible, null, 2)}` : 'ยังไม่มี Series Bible (ตรวจเทียบตอนก่อนหน้าแทน)',
      '',
      castLines.length ? `นักแสดงประจำเรื่อง:\n${castLines.join('\n')}` : '',
      '',
      previous.length
        ? `ตอนก่อนหน้า (${previous.length} ตอนล่าสุดก่อนตอนเป้าหมาย):\n${previous.map(episodeSummaryLines).join('\n')}`
        : 'ไม่มีตอนก่อนหน้า — ตอนเป้าหมายเป็นตอนแรก',
      '',
      `ตอนเป้าหมาย: ${target.displayCode} ${target.season ?? ''} EP${target.episodeNumber ?? '?'} "${target.title}"`,
      ...(target.logline ? [`logline: ${target.logline}`] : []),
      ...(target.hook ? [`hook: ${target.hook}`] : []),
      ...(target.twist ? [`twist: ${target.twist}`] : []),
      '',
      `Script ของตอนเป้าหมาย${target.script.length > TARGET_SCRIPT_CHARS ? ` (ตัดตอน ${TARGET_SCRIPT_CHARS} ตัวอักษรแรก)` : ''}:`,
      target.script.slice(0, TARGET_SCRIPT_CHARS),
      '',
      'ตรวจ continuity ของตอนเป้าหมายเทียบกับข้อมูลทั้งหมดข้างต้น',
    ].join('\n');

    const { parsed, model, usage, latencyMs } = await this.callClaude<ContinuityResult>({
      action: 'ai_series_continuity_check',
      system,
      content: userMessage,
      schema: CONTINUITY_CHECK_SCHEMA,
      maxTokens: 8000,
    });

    await this.audit(user, 'ai_series_continuity_check', seriesId, {
      model,
      usage,
      latencyMs,
      episodeId: dto.episodeId,
      issueCount: parsed.issues?.length ?? 0,
      highCount: (parsed.issues ?? []).filter((i) => i.severity === 'high').length,
    });

    return {
      issues: parsed.issues ?? [],
      relationshipUpdates: parsed.relationshipUpdates ?? [],
      cliffhangerSuggestion: parsed.cliffhangerSuggestion,
      verdict: parsed.verdict,
      episode: { id: target.id, displayCode: target.displayCode, title: target.title },
      provenance: 'ai',
      model,
      usage,
    };
  }

  // ─── 3. Next Episode — เสนอ 3 ตัวเลือกตอนถัดไป ──────────────

  async nextEpisode(seriesId: string, dto: NextEpisodeDto, user: AuthUser) {
    const series = await this.loadSeries(seriesId);
    const season = dto.season.trim();
    if (!season) throw new BadRequestException('ต้องระบุ season');

    // 3 ตอนล่าสุดของ season นี้ (ถ้า season ยังว่าง ใช้ 3 ตอนล่าสุดของซีรีส์)
    let recent = await this.prisma.episode.findMany({
      where: { seriesId, season, archivedAt: null },
      orderBy: { episodeNumber: 'desc' },
      take: 3,
      select: {
        displayCode: true,
        season: true,
        episodeNumber: true,
        title: true,
        logline: true,
        hook: true,
        twist: true,
      },
    });
    if (!recent.length) {
      recent = await this.prisma.episode.findMany({
        where: { seriesId, archivedAt: null },
        orderBy: [{ season: 'desc' }, { episodeNumber: 'desc' }],
        take: 3,
        select: {
          displayCode: true,
          season: true,
          episodeNumber: true,
          title: true,
          logline: true,
          hook: true,
          twist: true,
        },
      });
    }
    recent.reverse();

    // hooks ของตอนที่ perform ดีที่สุด (views จาก ContentPerformance ผ่าน contentItems)
    const perfRows = await this.prisma.contentPerformance.findMany({
      where: { contentItem: { episode: { seriesId } } },
      select: { views: true, contentItem: { select: { episodeId: true } } },
    });
    const viewsByEpisode = new Map<string, number>();
    for (const p of perfRows) {
      const epId = p.contentItem?.episodeId;
      if (!epId) continue;
      viewsByEpisode.set(epId, (viewsByEpisode.get(epId) ?? 0) + (p.views ?? 0));
    }
    const topIds = [...viewsByEpisode.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([epId]) => epId);
    const topEpisodes = topIds.length
      ? await this.prisma.episode.findMany({
          where: { id: { in: topIds } },
          select: { id: true, displayCode: true, title: true, hook: true, twist: true },
        })
      : [];
    const topHookLines = topIds
      .map((epId) => {
        const e = topEpisodes.find((x) => x.id === epId);
        if (!e) return null;
        return `- ${e.displayCode} "${e.title}" (${(viewsByEpisode.get(epId) ?? 0).toLocaleString()} views) hook: ${e.hook ?? '-'} / twist: ${e.twist ?? '-'}`;
      })
      .filter((v): v is string => Boolean(v));

    const castLines = await this.castLines(series.characters);
    const bible = series.bible && typeof series.bible === 'object' ? series.bible : null;
    const lastCliffhanger =
      bible && !Array.isArray(bible) ? (bible as Record<string, unknown>).last_cliffhanger : null;

    const system = `คุณคือ Head Writer ประจำ AISTAR Studio — คิดตอนถัดไปของ short-drama series สำหรับ platform วิดีโอสั้นในไทย
หน้าที่: เสนอตัวเลือกตอนถัดไป 3 ทางที่แตกต่างกันชัดเจน (เช่น สานต่อ cliffhanger / ยกระดับ conflict / มุมใหม่ของตัวละคร)
กติกา:
- ต้องมี exactly 3 options — แต่ละ option แตกต่างกันเชิงกลยุทธ์ ไม่ใช่ variation เดียวกัน
- ถ้ามี last_cliffhanger ต้องมีอย่างน้อย 1 option ที่สานต่อโดยตรง
- อิง hook/twist ของตอนที่ perform ดี — เรียนรู้จากสูตรที่เวิร์ก แต่ไม่ซ้ำเดิมเป๊ะ
- ใช้ตัวละครจากรายชื่อนักแสดงประจำเรื่องเท่านั้น — ห้ามสร้างตัวละครหลักใหม่
- ทุกข้อความภาษาไทย hook ต้องดึงใน 3 วินาทีแรก เหมาะกับวิดีโอสั้น 30-90 วินาที
${SHARED_GUARDRAILS}`;

    const userMessage = [
      `ซีรีส์: "${series.name}"${series.universe ? ` (จักรวาล: ${series.universe})` : ''}`,
      ...(series.premise ? [`Premise: ${series.premise}`] : []),
      `Season เป้าหมาย: ${season}`,
      '',
      bible ? `Series Bible:\n${JSON.stringify(bible, null, 2)}` : 'ยังไม่มี Series Bible',
      ...(lastCliffhanger ? ['', `⚠ Cliffhanger ล่าสุดที่ค้างไว้: ${String(lastCliffhanger)}`] : []),
      '',
      castLines.length ? `นักแสดงประจำเรื่อง:\n${castLines.join('\n')}` : 'ยังไม่มีนักแสดงประจำเรื่อง',
      '',
      recent.length
        ? `ตอนล่าสุด (เรียงเก่า→ใหม่):\n${recent.map(episodeSummaryLines).join('\n')}`
        : 'ยังไม่มีตอนในซีรีส์ — ตอนที่เสนอจะเป็นตอนแรกของ season',
      '',
      topHookLines.length
        ? `ตอนที่ perform ดีที่สุด (อิง views จริง):\n${topHookLines.join('\n')}`
        : 'ยังไม่มีข้อมูล performance',
      '',
      'เสนอตอนถัดไป 3 ตัวเลือก',
    ].join('\n');

    const { parsed, model, usage, latencyMs } = await this.callClaude<NextEpisodeResult>({
      action: 'ai_series_next_episode',
      system,
      content: userMessage,
      schema: NEXT_EPISODE_SCHEMA,
      maxTokens: 12000,
    });

    const options = (parsed.options ?? []).slice(0, 3);
    if (!options.length) {
      throw new BadGatewayException('AI ไม่ได้เสนอตัวเลือกตอนถัดไปเลย — กรุณาลองใหม่อีกครั้ง');
    }

    await this.audit(user, 'ai_series_next_episode', seriesId, {
      model,
      usage,
      latencyMs,
      season,
      optionCount: options.length,
    });

    return { options, season, provenance: 'ai', model, usage };
  }
}
