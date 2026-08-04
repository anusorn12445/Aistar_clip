import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SettingsService } from '../settings/settings.service';
import { Prisma } from '@prisma/client';
import { Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/current-user.decorator';
import { GenerateCharacterDraftDto } from './dto/generate-character-draft.dto';
import { buildCharacterDraftSchema, DRAFT_SECTIONS, DraftSection } from './character-draft.schema';
import { mergeCaptureIntoCharacter, AnalyzeMergeMode } from '../characters/capture-merge';
import { AiClaudeService } from './ai-claude.service';
import { CharacterBlueprintsService } from '../characters/character-blueprints.service';
import { buildBlueprintPromptBlock, computeMissingRequired } from '../characters/blueprint-inject';

const DEFAULT_MODEL = 'claude-opus-4-8';

// System prompt ตาม addendum §H + guardrails §G.2
const SYSTEM_PROMPT = `คุณคือ Character Designer ประจำ AISTAR Studio — สตูดิโอผลิต AI Talent สำหรับคอนเทนต์ short-drama และ live commerce ในประเทศไทย
You are the character designer for AISTAR Studio, generating AI Talent "character bibles" for Thai short-drama and live-commerce content.

หน้าที่ของคุณ: รับข้อมูลตั้งต้นสั้น ๆ (ชื่อ + คอนเซปต์หนึ่งบรรทัด + จักรวาล/ซีรีส์ถ้ามี) แล้วร่าง character bible ที่สมบูรณ์ กลมกล่อม และพร้อมใช้ผลิตคอนเทนต์จริง
เนื้อหาทั้งหมดต้องเป็นภาษาไทย (ยกเว้น negative_prompt และค่า enum ที่กำหนดเป็นภาษาอังกฤษ) เขียนให้เฉพาะเจาะจง มีสีสัน ไม่ generic — ตัวละครต้องรู้สึก "มีตัวตนจริง" และแตกต่างจากตัวละครทั่วไปในตลาด

GUARDRAILS — บังคับใช้เสมอ ห้ามละเมิดเด็ดขาด (per AISTAR policy §G.2):
1. อายุตัวละครต้อง 18 ปีขึ้นไปเสมอ (บริบท commerce) — suggested.age >= 18 และห้ามออกแบบให้ดูเป็นผู้เยาว์
2. ห้ามอ้างอิงหรือเลียนแบบหน้าตา/ตัวตนของบุคคลจริง ดารา เน็ตไอดอล หรือบุคคลสาธารณะใด ๆ (no real-person likeness)
3. ห้ามลอกเลียนตัวละครหรือ IP ที่มีอยู่แล้ว ทั้งไทยและต่างประเทศ — ต้องเป็น original character เท่านั้น
4. Commerce Profile ห้ามมีการเคลมสรรพคุณเกินจริง (no exaggerated product claims) — โทนการขายต้องจริงใจ ตรวจสอบได้ และระบุ claim_risk_level ตามความเสี่ยงจริงของแนวทางที่ออกแบบ
5. Visual DNA ต้องมี anti_clone_rules ที่ชัดเจน — จุดอัตลักษณ์เฉพาะตัวที่ทำให้ตัวละครนี้ไม่ซ้ำใครและตรวจจับการโคลนได้
6. Visual DNA: ระบุ ethnicity ให้ชัดเจนเสมอ — default เป็น "ไทย, ลักษณะเอเชียตะวันออกเฉียงใต้ (Thai, Southeast Asian features)" เว้นแต่ region/เรื่องราวของตัวละครบ่งชี้เป็นเชื้อชาติอื่นชัดเจน. กำหนดพารามิเตอร์ภาพให้เป็น photorealistic portrait เป็นค่าเริ่มต้น: art_style = "photorealistic", shot_type = "portrait", camera_angle/lens/depth_of_field/lighting/background_setting/color_grade/mood ให้เหมาะกับ portrait บุคคลจริง, aspect_ratio = "3:4", quality_tags ใส่ tag คุณภาพเช่น 8k, sharp focus

Output must strictly follow the JSON schema provided. Every field must be filled with meaningful, specific content — no placeholders, no empty strings.`;

export interface DraftResult {
  draft: Record<string, unknown>;
  provenance: 'ai';
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  // blueprint ที่ใช้ร่าง (ถ้ามี) + required fields ที่ยังว่างหลังร่าง (UI เอาไปโชว์ amber warning — ไม่ block)
  blueprintId: string | null;
  missingRequired: string[];
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private claude: AiClaudeService,
    private blueprints: CharacterBlueprintsService,
    // optional จนกว่า SettingsModule (@Global) จะถูก register ใน AppModule — ระหว่างนั้น fallback ไป .env
    @Optional() private settings?: SettingsService,
  ) {}

  // ค่าอ่านต่อ call (ไม่ cache ที่ constructor) — แก้ค่าในหน้า Settings แล้วมีผลทันทีไม่ต้อง restart
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

  // GET /ai/status — ให้ UI รู้ว่าจะโชว์ปุ่ม AI generate หรือไม่ (graceful degradation)
  async status() {
    // provider-aware: เครื่องที่ตั้ง OpenAI (AI_PROVIDER=openai + OPENAI_API_KEY) ต้องนับว่า configured ด้วย
    // (เดิมเช็คแค่ ANTHROPIC_API_KEY → UI ซ่อนปุ่ม AI ทั้งหมดทั้งที่ใช้ OpenAI ได้)
    return {
      configured: await this.claude.isConfigured(),
      model: await this.claude.resolveActiveModel(),
    };
  }

  /** ให้ AI ร่าง Character Bible ให้ตัวละครที่มีอยู่แล้ว (ไม่ต้องมีรูป) แล้ว merge ลงเลย
   *  ใช้ข้อมูลตัวละคร (ชื่อ/บริบท/เพศ/อายุ) เป็น seed — เติมเฉพาะ section/ช่องที่ยังว่าง (default)
   *  หรือ regenerate เฉพาะ section ที่ระบุ */
  async generateBibleForCharacter(
    characterId: string,
    opts: { sections?: DraftSection[]; mode?: AnalyzeMergeMode },
    user: AuthUser,
  ) {
    const character = await this.prisma.character.findUnique({ where: { id: characterId } });
    if (!character) throw new NotFoundException('ไม่พบตัวละคร');

    const concept =
      character.roleLabel ||
      character.nickname ||
      `ตัวละคร ${character.nameTh}${character.gender ? ` (${character.gender}` : ''}${character.age ? ` อายุ ${character.age}` : ''}${character.gender || character.age ? ')' : ''} สำหรับคอนเทนต์ commerce ไทย`;

    const draftRes = await this.generateCharacterDraft(
      {
        nameTh: character.nameTh,
        nameEn: character.nameEn ?? undefined,
        oneLineConcept: concept,
        universe: character.universe ?? undefined,
        series: character.series ?? undefined,
        sections: opts.sections,
      },
      user,
    );

    const draft = draftRes as unknown as {
      persona?: Record<string, unknown>;
      visualDna?: Record<string, unknown>;
      commerceProfile?: Record<string, unknown>;
      voiceProfile?: Record<string, unknown>;
      suggested?: { age?: number; gender?: string; region?: string; roleLabel?: string };
    };

    const mode: AnalyzeMergeMode = opts.mode === 'overwrite' ? 'overwrite' : 'fill_empty';
    const { data, applied } = mergeCaptureIntoCharacter(
      {
        persona: (character.persona as Record<string, unknown>) ?? null,
        visualDna: (character.visualDna as Record<string, unknown>) ?? null,
        commerceProfile: (character.commerceProfile as Record<string, unknown>) ?? null,
        voiceProfile: (character.voiceProfile as Record<string, unknown>) ?? null,
        age: character.age,
        gender: character.gender,
        region: character.region,
        roleLabel: character.roleLabel,
      },
      draft,
      mode,
    );

    const updated = await this.prisma.character.update({
      where: { id: characterId },
      data: data as never,
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        via: 'ui',
        action: 'ai_generate_character_bible',
        entityType: 'character',
        entityId: characterId,
        meta: { mode, applied, sections: opts.sections ?? 'all' },
      },
    });
    return { character: updated, applied, mode };
  }

  async generateCharacterDraft(dto: GenerateCharacterDraftDto, user: AuthUser): Promise<DraftResult> {
    const sections: DraftSection[] = dto.sections?.length ? dto.sections : [...DRAFT_SECTIONS];

    // Blueprint (พิมพ์เขียว): ระบุมา = ใช้อันนั้น, ไม่ระบุ = default active — inject house-rules + defaults
    const blueprint = await this.blueprints.resolveForInjection(dto.blueprintId ?? null);
    const system = blueprint
      ? SYSTEM_PROMPT + buildBlueprintPromptBlock(CharacterBlueprintsService.toInject(blueprint))
      : SYSTEM_PROMPT;

    // เรียกผ่าน AiClaudeService (shared client + error mapping 503/429/502 + refusal) — mock ง่ายใน e2e
    const call = await this.claude.callClaude<Record<string, unknown>>({
      action: 'ai_generate_character_draft',
      system,
      content: this.buildUserMessage(dto, sections),
      schema: buildCharacterDraftSchema(sections),
      maxTokens: 16000,
    });

    const draft = call.parsed;

    // Guardrail §G.2: อายุตัวละครในบริบท commerce ต้อง >= 18 — enforce ที่ server ไม่ใช่แค่ prompt
    const suggested = draft.suggested as Record<string, unknown> | undefined;
    if (suggested && typeof suggested.age === 'number' && suggested.age < 18) {
      this.logger.warn(`Model returned suggested.age=${suggested.age} < 18 — clamped to 20`);
      suggested.age = 20;
    }

    // required-field completeness — key map เข้า persona/visualDna (ว่าง = missing) — UI warning เท่านั้น
    const missingRequired = computeMissingRequired(
      blueprint?.requiredFields,
      draft.persona as Record<string, unknown> | undefined,
      draft.visualDna as Record<string, unknown> | undefined,
    );

    await this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        via: 'ui',
        action: 'ai_generate_character_draft',
        entityType: 'character',
        meta: {
          model: call.model,
          usage: call.usage,
          latencyMs: call.latencyMs,
          sections,
          blueprintId: blueprint?.id ?? null,
          missingRequired,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      draft,
      provenance: 'ai',
      model: call.model,
      usage: call.usage,
      blueprintId: blueprint?.id ?? null,
      missingRequired,
    };
  }

  private buildUserMessage(dto: GenerateCharacterDraftDto, sections: DraftSection[]): string {
    const lines = [
      'ข้อมูลตั้งต้นจาก Character Wizard:',
      `- ชื่อ (ไทย): ${dto.nameTh}`,
      ...(dto.nameEn ? [`- ชื่อ (อังกฤษ): ${dto.nameEn}`] : []),
      `- คอนเซปต์หนึ่งบรรทัด: ${dto.oneLineConcept}`,
      ...(dto.universe ? [`- จักรวาล (universe): ${dto.universe}`] : []),
      ...(dto.series ? [`- ซีรีส์: ${dto.series}`] : []),
      '',
      `ช่วยร่าง character bible ให้ครบ section ต่อไปนี้: ${sections.join(', ')} พร้อมค่าแนะนำ (suggested) สำหรับ age/gender/region/roleLabel`,
    ];
    return lines.join('\n');
  }
}
