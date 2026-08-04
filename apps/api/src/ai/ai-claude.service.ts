import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import Anthropic, { APIError, AuthenticationError, RateLimitError } from '@anthropic-ai/sdk';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { AuthUser } from '../auth/current-user.decorator';

// Shared Claude client + settings-key resolver + error mapping (503/429/502 + refusal).
// รวม logic การเรียก Claude ไว้ที่เดียว — service ใหม่ ๆ (เช่น affiliate) inject ตัวนี้แทน
// การ new Anthropic() เอง เพื่อไม่ให้มีการ re-implement client หลายที่
const DEFAULT_MODEL = 'claude-opus-4-8';
const DEFAULT_OPENAI_MODEL = 'gpt-4o';

export const NOT_CONFIGURED_MESSAGE =
  'AI service ยังไม่ได้ตั้งค่า — กรุณาตั้งค่า OPENAI_API_KEY (หรือ ANTHROPIC_API_KEY) ในหน้า Settings หรือใน apps/api/.env แล้ว restart API';

export type AiProvider = 'anthropic' | 'openai';

export interface ClaudeCallResult<T> {
  parsed: T;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  latencyMs: number;
}

export interface ClaudeTextResult {
  text: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  latencyMs: number;
}

@Injectable()
export class AiClaudeService {
  private readonly logger = new Logger(AiClaudeService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    // optional จนกว่า SettingsModule (@Global) จะถูก register — ระหว่างนั้น fallback ไป .env
    @Optional() private settings?: SettingsService,
  ) {}

  // ค่าอ่านต่อ call (ไม่ cache) — แก้ในหน้า Settings แล้วมีผลทันทีไม่ต้อง restart
  async resolveApiKey(): Promise<string | undefined> {
    const key =
      (await this.settings?.get('ANTHROPIC_API_KEY')) ??
      this.config.get<string>('ANTHROPIC_API_KEY');
    return key?.trim() ? key.trim() : undefined;
  }

  async resolveModel(): Promise<string> {
    const model =
      (await this.settings?.get('ANTHROPIC_MODEL')) ?? this.config.get<string>('ANTHROPIC_MODEL');
    return model?.trim() ? model.trim() : DEFAULT_MODEL;
  }

  async resolveOpenAiKey(): Promise<string | undefined> {
    const key =
      (await this.settings?.get('OPENAI_API_KEY')) ?? this.config.get<string>('OPENAI_API_KEY');
    return key?.trim() ? key.trim() : undefined;
  }

  async resolveOpenAiModel(): Promise<string> {
    const model =
      (await this.settings?.get('OPENAI_MODEL')) ?? this.config.get<string>('OPENAI_MODEL');
    return model?.trim() ? model.trim() : DEFAULT_OPENAI_MODEL;
  }

  /** provider ที่ใช้จริง: AI_PROVIDER (settings/.env) ชี้ตรง — ไม่ตั้ง = เลือกจาก key ที่มี (openai ก่อน) */
  async resolveProvider(): Promise<AiProvider> {
    const explicit = (
      (await this.settings?.get('AI_PROVIDER')) ?? this.config.get<string>('AI_PROVIDER') ?? ''
    )
      .trim()
      .toLowerCase();
    if (explicit === 'openai' || explicit === 'anthropic') return explicit;
    if (await this.resolveOpenAiKey()) return 'openai';
    return 'anthropic';
  }

  /** โมเดลของ provider ที่ใช้จริง — ใช้โชว์ใน status endpoints */
  async resolveActiveModel(): Promise<string> {
    return (await this.resolveProvider()) === 'openai'
      ? this.resolveOpenAiModel()
      : this.resolveModel();
  }

  async isConfigured(): Promise<boolean> {
    const provider = await this.resolveProvider();
    return provider === 'openai'
      ? Boolean(await this.resolveOpenAiKey())
      : Boolean(await this.resolveApiKey());
  }

  // ── OpenAI helpers ─────────────────────────────────────────────
  /** แปลง content (string | Anthropic blocks) → OpenAI chat content (รองรับ text + image base64) */
  private toOpenAiContent(
    content: string | Anthropic.ContentBlockParam[],
  ): string | Array<Record<string, unknown>> {
    if (typeof content === 'string') return content;
    return content
      .map((b) => {
        if (b.type === 'text') return { type: 'text', text: (b as { text: string }).text };
        if (b.type === 'image') {
          const src = (b as { source: { type: string; media_type?: string; data?: string; url?: string } }).source;
          const url =
            src.type === 'base64' ? `data:${src.media_type};base64,${src.data}` : (src.url ?? '');
          return { type: 'image_url', image_url: { url } };
        }
        return null;
      })
      .filter(Boolean) as Array<Record<string, unknown>>;
  }

  private mapOpenAiError(status: number, body: string): never {
    if (status === 401) {
      throw new ServiceUnavailableException(
        'AI service ยังไม่ได้ตั้งค่า API key ให้ถูกต้อง — กรุณาตรวจสอบ OPENAI_API_KEY ในหน้า Settings (หรือใน apps/api/.env)',
      );
    }
    if (status === 429) {
      throw new HttpException('เรียก AI ถี่เกินไป กรุณารอสักครู่แล้วลองใหม่', HttpStatus.TOO_MANY_REQUESTS);
    }
    throw new BadGatewayException(`AI service ขัดข้อง (OpenAI ${status}): ${body.slice(0, 300)}`);
  }

  /** เรียก OpenAI chat.completions — โหมด JSON (schema แนบเป็น guidance) หรือ plain text */
  private async callOpenAi(opts: {
    action: string;
    system: string;
    content: string | Anthropic.ContentBlockParam[];
    maxTokens: number;
    schema?: Record<string, unknown>;
  }): Promise<{ text: string; model: string; usage: { inputTokens: number; outputTokens: number }; latencyMs: number }> {
    const apiKey = await this.resolveOpenAiKey();
    if (!apiKey) throw new ServiceUnavailableException(NOT_CONFIGURED_MESSAGE);
    const model = await this.resolveOpenAiModel();
    const startedAt = Date.now();

    const system = opts.schema
      ? `${opts.system}\n\nตอบเป็น JSON ล้วนตาม schema นี้เท่านั้น (ห้ามมีข้อความอื่นหรือ markdown):\n${JSON.stringify(opts.schema)}`
      : opts.system;

    let res: Response;
    try {
      res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          max_completion_tokens: opts.maxTokens,
          ...(opts.schema ? { response_format: { type: 'json_object' } } : {}),
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: this.toOpenAiContent(opts.content) },
          ],
        }),
      });
    } catch (e) {
      throw new BadGatewayException(`AI service เชื่อมต่อ OpenAI ไม่ได้: ${(e as Error).message}`);
    }
    if (!res.ok) this.mapOpenAiError(res.status, await res.text());

    const data = (await res.json()) as {
      choices?: { message?: { content?: string; refusal?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const msg = data.choices?.[0]?.message;
    if (msg?.refusal) {
      throw new BadRequestException('AI ปฏิเสธคำขอนี้ (อาจขัด guardrails) — กรุณาปรับข้อมูลตั้งต้นแล้วลองใหม่');
    }
    const text = (msg?.content ?? '').trim();
    if (!text) throw new BadGatewayException('AI ตอบกลับมาไม่มีเนื้อหา — กรุณาลองใหม่อีกครั้ง');

    const usage = {
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
    };
    const latencyMs = Date.now() - startedAt;
    console.log(
      `[AI] ${opts.action} model=${model} input_tokens=${usage.inputTokens} output_tokens=${usage.outputTokens} latency_ms=${latencyMs}`,
    );
    return { text, model, usage, latencyMs };
  }

  // เรียก Claude แบบ structured JSON output — mirror ai-phase4.service.callClaude
  async callClaude<T>(opts: {
    action: string;
    system: string;
    content: string | Anthropic.ContentBlockParam[];
    schema: Record<string, unknown>;
    maxTokens: number;
  }): Promise<ClaudeCallResult<T>> {
    if ((await this.resolveProvider()) === 'openai') {
      const r = await this.callOpenAi({ ...opts, schema: opts.schema });
      let parsed: T;
      try {
        parsed = JSON.parse(r.text.replace(/^```json\s*|```\s*$/g, '')) as T;
      } catch {
        this.logger.error(`AI returned unparsable JSON (action=${opts.action}, provider=openai)`);
        throw new BadGatewayException('AI ตอบกลับมาในรูปแบบที่อ่านไม่ได้ — กรุณาลองใหม่อีกครั้ง');
      }
      return { parsed, model: r.model, usage: r.usage, latencyMs: r.latencyMs };
    }

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
        // SDK 0.70.x ยังไม่มี typing ของ output_config บน stable messages API — cast เพื่อส่งผ่านตรง ๆ
      } as unknown as Anthropic.MessageCreateParamsNonStreaming);
    } catch (error) {
      // ลำดับสำคัญ: AuthenticationError/RateLimitError เป็น subclass ของ APIError
      if (error instanceof AuthenticationError) {
        throw new ServiceUnavailableException(
          'AI service ยังไม่ได้ตั้งค่า API key ให้ถูกต้อง — กรุณาตรวจสอบ ANTHROPIC_API_KEY ในหน้า Settings (หรือใน apps/api/.env)',
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

    const text = (response.content.find((b) => b.type === 'text') as { text?: string } | undefined)
      ?.text;
    if (!text) {
      throw new BadGatewayException('AI ตอบกลับมาไม่มีเนื้อหา — กรุณาลองใหม่อีกครั้ง');
    }
    let parsed: T;
    try {
      parsed = JSON.parse(text) as T;
    } catch {
      this.logger.error(
        `AI returned unparsable JSON (action=${opts.action}, stop_reason=${response.stop_reason})`,
      );
      throw new BadGatewayException('AI ตอบกลับมาในรูปแบบที่อ่านไม่ได้ — กรุณาลองใหม่อีกครั้ง');
    }
    return { parsed, model, usage, latencyMs };
  }

  // เรียก Claude แบบ plain-text output (ไม่บังคับ JSON schema) — รองรับ server tools
  // เช่น web search: tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 3 }]
  // (SDK 0.70.x ยังไม่มี typing ของ web search tool บน stable messages API — cast แบบเดียวกับ output_config)
  async callClaudeText(opts: {
    action: string;
    system: string;
    content: string | Anthropic.ContentBlockParam[];
    maxTokens: number;
    tools?: unknown[];
  }): Promise<ClaudeTextResult> {
    if ((await this.resolveProvider()) === 'openai') {
      if (opts.tools?.length) {
        this.logger.warn(`[AI] ${opts.action}: provider=openai — ข้าม server tools (เช่น web search) ที่รองรับเฉพาะ Anthropic`);
      }
      const r = await this.callOpenAi(opts);
      return { text: r.text, model: r.model, usage: r.usage, latencyMs: r.latencyMs };
    }

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
        ...(opts.tools ? { tools: opts.tools } : {}),
      } as unknown as Anthropic.MessageCreateParamsNonStreaming);
    } catch (error) {
      // ลำดับสำคัญ: AuthenticationError/RateLimitError เป็น subclass ของ APIError (mapping เดียวกับ callClaude)
      if (error instanceof AuthenticationError) {
        throw new ServiceUnavailableException(
          'AI service ยังไม่ได้ตั้งค่า API key ให้ถูกต้อง — กรุณาตรวจสอบ ANTHROPIC_API_KEY ในหน้า Settings (หรือใน apps/api/.env)',
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

    // web search อาจคืน text หลาย block คั่นด้วย server_tool_use/result blocks — ต่อทุก text block
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    if (!text) {
      throw new BadGatewayException('AI ตอบกลับมาไม่มีเนื้อหา — กรุณาลองใหม่อีกครั้ง');
    }
    return { text, model, usage, latencyMs };
  }

  audit(user: AuthUser, action: string, entityType: string, entityId: string | null, meta: object) {
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
}
