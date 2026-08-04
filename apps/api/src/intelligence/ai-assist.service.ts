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
import Anthropic, { APIError, AuthenticationError, RateLimitError } from '@anthropic-ai/sdk';
import { SettingsService } from '../settings/settings.service';

const DEFAULT_MODEL = 'claude-opus-4-8';

const NOT_CONFIGURED_MESSAGE =
  'AI service ยังไม่ได้ตั้งค่า — กรุณาตั้งค่า ANTHROPIC_API_KEY ใน apps/api/.env แล้ว restart API (ระหว่างนี้ยังบันทึกไอเดียด้วยตัวเองได้ตามปกติ)';

// System prompt ตาม §18.5 + §G.2 — guardrail ห้ามลอก creative ต้นฉบับตรง ๆ
const SYSTEM_PROMPT = `คุณคือ Creative Strategist ประจำ AISTAR Studio — สตูดิโอผลิต AI Talent สำหรับคอนเทนต์ short-drama และ live commerce ในประเทศไทย

หน้าที่ของคุณ: รับ "ไอเดีย/reference" ที่ทีมเก็บมา (ชื่อ + URL + โน้ต) แล้ว
1. aiSummary — สรุป pattern ที่ reusable จาก reference นั้น: อะไรคือกลไกที่ทำให้มันเวิร์ก (hook structure, pacing, emotional trigger, format) เขียนเป็นภาษาไทย กระชับ ชี้ประเด็นเป็นข้อ ๆ
2. aiAdaptation — ไอเดียดัดแปลงเป็นของ AISTAR เอง: เสนอวิธีนำ pattern นั้นมาสร้างคอนเทนต์ใหม่ที่เป็น original ของ AISTAR (บริบท AI Talent / short-drama / live commerce ไทย) เขียนเป็นภาษาไทย

GUARDRAILS — บังคับใช้เสมอ ห้ามละเมิดเด็ดขาด (ตาม AISTAR policy §18.5 + §G.2):
1. ห้ามลอก creative ต้นฉบับตรง ๆ เด็ดขาด — ห้ามลอก script, บทพูด, caption, visual, ตัวละคร หรือ asset ใด ๆ ของต้นฉบับ ให้ "สกัด pattern" ที่เป็นหลักการ แล้วสร้างของใหม่ที่เป็น original เท่านั้น
2. ห้ามอ้างอิงหรือเลียนแบบตัวตนของบุคคลจริง ดารา หรือครีเอเตอร์เจ้าของ reference
3. aiAdaptation ต้องแตกต่างจากต้นฉบับอย่างชัดเจน — ถ้าไอเดียที่ได้ยังใกล้ต้นฉบับเกินไป ให้ปรับจนเป็นงานใหม่จริง ๆ
4. ห้ามเคลมสรรพคุณสินค้าเกินจริงในแนวทางการขายที่เสนอ

Output must strictly follow the JSON schema provided. เนื้อหาทั้งหมดเป็นภาษาไทย`;

const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    aiSummary: {
      type: 'string',
      description: 'สรุป pattern ที่ reusable จาก reference (ภาษาไทย)',
    },
    aiAdaptation: {
      type: 'string',
      description: 'ไอเดียดัดแปลงเป็นของ AISTAR — original ห้ามลอกต้นฉบับ (ภาษาไทย)',
    },
  },
  required: ['aiSummary', 'aiAdaptation'],
  additionalProperties: false,
} as const;

export interface IdeaAssistInput {
  title: string;
  url?: string | null;
  note?: string | null;
  ideaType?: string | null;
}

export interface IdeaAssistResult {
  aiSummary: string;
  aiAdaptation: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  latencyMs: number;
}

@Injectable()
export class AiAssistService {
  private readonly logger = new Logger(AiAssistService.name);

  constructor(
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

  async isConfigured(): Promise<boolean> {
    return Boolean(await this.resolveApiKey());
  }

  async extractIdeaPattern(input: IdeaAssistInput): Promise<IdeaAssistResult> {
    const apiKey = await this.resolveApiKey();
    if (!apiKey) {
      throw new ServiceUnavailableException(NOT_CONFIGURED_MESSAGE);
    }

    const model = await this.resolveModel();
    const client = new Anthropic({ apiKey });
    const startedAt = Date.now();

    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model,
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: this.buildUserMessage(input) }],
        output_config: {
          format: { type: 'json_schema', schema: RESULT_SCHEMA },
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
        'AI ปฏิเสธการสกัด pattern จาก reference นี้ (อาจขัด guardrails) — กรุณาปรับโน้ตแล้วลองใหม่',
      );
    }

    const usage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
    const latencyMs = Date.now() - startedAt;
    this.logger.log(
      `[AI] ai_idea_assist model=${model} input_tokens=${usage.inputTokens} output_tokens=${usage.outputTokens} latency_ms=${latencyMs}`,
    );

    const parsed = this.parseResult(response);
    return { ...parsed, model, usage, latencyMs };
  }

  private buildUserMessage(input: IdeaAssistInput): string {
    const lines = [
      'ไอเดีย/reference จาก Idea Library:',
      `- ชื่อ: ${input.title}`,
      ...(input.ideaType ? [`- ประเภท: ${input.ideaType}`] : []),
      ...(input.url ? [`- URL: ${input.url}`] : []),
      ...(input.note ? [`- โน้ตจากทีม: ${input.note}`] : []),
      '',
      'ช่วยสกัด pattern ที่ reusable (aiSummary) และเสนอไอเดียดัดแปลงเป็นของ AISTAR (aiAdaptation) — ห้ามลอก creative ต้นฉบับตรง ๆ',
    ];
    return lines.join('\n');
  }

  private parseResult(response: Anthropic.Message): { aiSummary: string; aiAdaptation: string } {
    const text = (response.content.find((b) => b.type === 'text') as { text?: string } | undefined)
      ?.text;
    if (!text) {
      throw new BadGatewayException('AI ตอบกลับมาไม่มีเนื้อหา — กรุณาลองใหม่อีกครั้ง');
    }
    try {
      const parsed = JSON.parse(text) as { aiSummary?: string; aiAdaptation?: string };
      if (!parsed.aiSummary || !parsed.aiAdaptation) {
        throw new Error('missing fields');
      }
      return { aiSummary: parsed.aiSummary, aiAdaptation: parsed.aiAdaptation };
    } catch {
      this.logger.error(`AI returned unparsable JSON (stop_reason=${response.stop_reason})`);
      throw new BadGatewayException('AI ตอบกลับมาในรูปแบบที่อ่านไม่ได้ — กรุณาลองใหม่อีกครั้ง');
    }
  }
}
