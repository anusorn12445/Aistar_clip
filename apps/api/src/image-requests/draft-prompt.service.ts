import { Injectable, Logger } from '@nestjs/common';
import { ImageRequest } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/current-user.decorator';
import { AiClaudeService } from '../ai/ai-claude.service';
import { BrandKnowledgeService } from '../products/brand-knowledge.service';
import { ImageRequestsService } from './image-requests.service';

// ─── Draft Prompt (งานภาพ) ──────────────────────────────────────────────────
// ประกอบ image-gen prompt ให้คนก๊อปไป gen เองใน ChatGPT/Grok (ไม่ gen ในระบบ — เฟส 2)
// ชั้นที่ 1: deterministic ล้วนจากข้อมูล request + Brand Book context (สไตล์เดียวกับ
//           production/storyboard.service buildShotImagePrompt — ไม่พึ่ง API key)
// ชั้นที่ 2: ถ้าตั้งค่า AI ไว้ → ส่ง draft ให้ Claude เกลาเป็น prompt พร้อมใช้
//           (structured output {prompt, negativePrompt, notes}) — AI ล่ม/ไม่ตั้งค่า
//           ไม่ fail hard: คืน deterministic draft พร้อม provenance บอกที่มา

const IMAGE_TYPE_TH: Record<string, string> = {
  banner: 'แบนเนอร์โปรโมท (banner)',
  cover: 'ภาพปก (cover)',
  illustration: 'ภาพประกอบ (illustration)',
  other: 'ภาพกราฟิก',
};

const DRAFT_SCHEMA = {
  type: 'object',
  properties: {
    prompt: { type: 'string', description: 'image-gen prompt ฉบับเกลาแล้ว พร้อมก๊อปไปใช้' },
    negativePrompt: { type: 'string', description: 'สิ่งที่ห้ามปรากฏในภาพ (ถ้ามี)' },
    notes: { type: 'string', description: 'คำแนะนำสั้น ๆ ถึงคน gen (ถ้ามี)' },
  },
  required: ['prompt'],
  additionalProperties: false,
} as const;

interface DraftAiResult {
  prompt: string;
  negativePrompt?: string;
  notes?: string;
}

export interface DraftPromptResult {
  draftPrompt: string;
  negativePrompt: string | null;
  notes: string | null;
  provenance: 'ai' | 'deterministic';
}

/** ประกอบ prompt ตั้งต้นแบบ deterministic ล้วน — export ให้เทสต์เรียกตรงได้ */
export function buildImageRequestPrompt(req: ImageRequest, brandContext: string): string {
  const lines: string[] = [
    `สร้างภาพ ${IMAGE_TYPE_TH[req.imageType] ?? req.imageType} สำหรับงาน "${req.title}" — ห้ามอ้างอิงหน้าบุคคลจริงหรือดารา:`,
  ];
  if (req.platform?.trim()) lines.push(`- แพลตฟอร์มปลายทาง: ${req.platform.trim()}`);
  if (req.sizeNote?.trim()) lines.push(`- ขนาด/สัดส่วนภาพ: ${req.sizeNote.trim()}`);
  if (req.copyText?.trim())
    lines.push(`- ข้อความที่ต้องอยู่บนภาพ (สะกดให้เป๊ะ): "${req.copyText.trim()}"`);
  if (req.brief?.trim()) lines.push(`- โจทย์/บรีฟ: ${req.brief.trim()}`);

  if (brandContext.trim()) {
    lines.push('', 'บริบทแบรนด์ (คุมมู้ด/โทน/สีของภาพให้ on-brand):', brandContext.trim());
  }
  return lines.join('\n');
}

@Injectable()
export class DraftPromptService {
  private readonly logger = new Logger(DraftPromptService.name);

  constructor(
    private prisma: PrismaService,
    private requests: ImageRequestsService,
    private aiClaude: AiClaudeService,
    private brandKnowledge: BrandKnowledgeService,
  ) {}

  async draftPrompt(id: string, user: AuthUser): Promise<DraftPromptResult> {
    const req = await this.requests.findVisible(id, user);

    const brandContext = req.brandId
      ? await this.brandKnowledge.buildBrandContext(req.brandId)
      : '';
    const deterministic = buildImageRequestPrompt(req, brandContext);

    let result: DraftPromptResult = {
      draftPrompt: deterministic,
      negativePrompt: null,
      notes: null,
      provenance: 'deterministic',
    };

    // AI refine — เฉพาะเมื่อตั้งค่า key ไว้; ล่มก็ถอยกลับ deterministic (ไม่ fail hard)
    if (await this.aiClaude.isConfigured()) {
      try {
        const ai = await this.aiClaude.callClaude<DraftAiResult>({
          action: 'image_request_draft_prompt',
          system:
            'คุณคือ prompt engineer มือโปรด้านภาพนิ่ง (banner/cover/illustration) ' +
            'หน้าที่: เกลาข้อมูลงานภาพ + บริบทแบรนด์ ให้เป็น image-gen prompt ภาษาไทยผสมศัพท์ภาพอังกฤษ ' +
            'ที่คนก๊อปไปวางใน ChatGPT/Grok แล้วได้ภาพตรงโจทย์ทันที ' +
            'คงข้อความบนภาพ (copy text) ให้ตรงตามต้นฉบับทุกตัวอักษร ระบุสีแบรนด์เป็นค่า hex เมื่อมีให้ ' +
            'ห้ามอ้างอิงบุคคลจริง/ดารา/โลโก้แบรนด์อื่น',
          content: deterministic,
          schema: DRAFT_SCHEMA as unknown as Record<string, unknown>,
          maxTokens: 1500,
        });
        if (ai.parsed?.prompt?.trim()) {
          result = {
            draftPrompt: ai.parsed.prompt.trim(),
            negativePrompt: ai.parsed.negativePrompt?.trim() || null,
            notes: ai.parsed.notes?.trim() || null,
            provenance: 'ai',
          };
        }
      } catch (error) {
        // AI ขัดข้อง → ใช้ deterministic draft ต่อ ไม่ให้ปุ่มร่าง prompt พัง
        this.logger.warn(
          `draft-prompt AI refine failed (request ${id}): ${error instanceof Error ? error.message : error}`,
        );
      }
    }

    // persist ลง draftPrompt (แก้ต่อได้ผ่าน PATCH)
    await this.prisma.imageRequest.update({
      where: { id },
      data: { draftPrompt: result.draftPrompt },
    });
    await this.aiClaude.audit(user, 'draft_prompt', 'image_request', id, {
      provenance: result.provenance,
    });

    return result;
  }
}
