import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AiClaudeService } from '../src/ai/ai-claude.service';
import type { ClaudeCallResult } from '../src/ai/ai-claude.service';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  RESEARCHER_EMAIL,
  RESEARCHER_PASSWORD,
  auth,
  createApp,
  ensureResearcher,
  http,
  loginAs,
} from './utils';

// Content Intelligence — System 2 (AI Ideation) + 2.1 (Customer Voice).
// e2e MUST NOT call live AI — ANTHROPIC_API_KEY is blanked in test-env so the
// real Claude path 503s. We stub AiClaudeService.callClaude with canned
// structured results keyed by action, and spy on the prompt passed to it.
describe('Content Intelligence (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let adminToken: string;
  let researcherToken: string; // no content permission → 403

  let brandId: string;
  const BRAND_STORY = 'AISTAR ปลุกความมั่นใจให้ครีเอเตอร์ไทยผ่านคอนเทนต์ที่จริงใจ';

  const CLASSIFY = { sentiment: 'negative', themes: ['บ่นราคา', 'อยากได้โปร'] };
  const IDEAS = {
    ideas: [
      {
        title: 'ตอบดราม่าเรื่องราคา',
        hook: 'ทำไมของดีถึงไม่ต้องแพง?',
        angle: 'เปรียบเทียบความคุ้มค่า',
        platform: 'tiktok',
        format: 'short_video',
        contentType: 'review',
        characterHint: 'พี่หมี',
        productHint: 'ครีมกันแดด',
        captionDirection: 'โทนจริงใจ ตอบข้อกังวลเรื่องราคา',
        rationale: 'ลูกค้าบ่นเรื่องราคาบ่อย จึงตอบตรงจุด',
        sourceSignals: ['customer theme: บ่นราคา', 'brand story'],
      },
      {
        title: 'รีวิวสายเปย์',
        hook: 'ลองแล้วจะรัก',
        angle: 'unboxing',
        platform: 'facebook_reels',
        format: 'short_video',
        contentType: 'review',
        characterHint: '',
        productHint: '',
        captionDirection: 'สนุก เป็นกันเอง',
        rationale: 'ต่อยอด pattern รีวิวที่เคยเวิร์ค',
        sourceSignals: ['performance winner'],
      },
    ],
  };

  // stub callClaude — คืนผลตาม action (classify vs ideate)
  // note: feedback create เช็ค isConfigured() ก่อน → ต้อง mock ให้ true ด้วย
  function stubCallClaude(opts?: { throwOn?: string }): jest.SpyInstance {
    const svc = app.get(AiClaudeService);
    jest.spyOn(svc, 'isConfigured').mockResolvedValue(true);
    return jest.spyOn(svc, 'callClaude').mockImplementation(
      async (args: { action: string; content: string | unknown }) => {
        if (opts?.throwOn && typeof args.content === 'string' && args.content.includes(opts.throwOn)) {
          throw new Error('stubbed classify failure');
        }
        const parsed = args.action.startsWith('ai_ideate') ? IDEAS : CLASSIFY;
        return {
          parsed,
          model: 'stub-model',
          usage: { inputTokens: 5, outputTokens: 10 },
          latencyMs: 1,
        } as ClaudeCallResult<unknown>;
      },
    );
  }

  beforeAll(async () => {
    prisma = new PrismaClient();
    await ensureResearcher(prisma);
    app = await createApp();
    adminToken = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);
    researcherToken = await loginAs(app, RESEARCHER_EMAIL, RESEARCHER_PASSWORD);

    const brand = await http(app)
      .post('/api/brands')
      .set(auth(adminToken))
      .send({ name: 'AISTAR แบรนด์ทดสอบ CI' })
      .expect(201);
    brandId = brand.body.id;
    // ใส่ความรู้แบรนด์ → buildBrandContext มีเนื้อหาให้ฉีดเข้า prompt
    await http(app)
      .patch(`/api/brands/${brandId}`)
      .set(auth(adminToken))
      .send({
        brandStory: BRAND_STORY,
        toneOfVoice: 'จริงใจ เป็นกันเอง',
        usp: 'ครีเอเตอร์จริง รีวิวจริง',
        keyMessages: ['จริงใจ', 'คุ้มค่า'],
      })
      .expect(200);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  // ── permission ──────────────────────────────────────────────

  it('feedback create without content:C → 403', async () => {
    await http(app)
      .post('/api/customer-feedback')
      .set(auth(researcherToken))
      .send({ text: 'ทดสอบ', source: 'comment' })
      .expect(403);
  });

  it('ideate without content:C → 403', async () => {
    await http(app)
      .post('/api/ai/ideate')
      .set(auth(researcherToken))
      .send({ mode: 'auto' })
      .expect(403);
  });

  // ── customer voice: create + AI classify ────────────────────

  it('feedback create persists + sets stubbed sentiment/themes + aiProcessedAt', async () => {
    stubCallClaude();
    const res = await http(app)
      .post('/api/customer-feedback')
      .set(auth(adminToken))
      .send({ text: 'ทำไมแพงจัง อยากได้โปรโมชั่น', source: 'comment', brandId })
      .expect(201);

    expect(res.body.aiProcessed).toBe(true);
    expect(res.body.feedback.sentiment).toBe('negative');
    expect(res.body.feedback.themes).toEqual(['บ่นราคา', 'อยากได้โปร']);
    expect(res.body.feedback.aiProcessedAt).toBeTruthy();
    expect(res.body.feedback.brandId).toBe(brandId);
  });

  it('feedback create without AI configured saves raw + flags aiUnavailable (no 500)', async () => {
    // no stub → real path sees blanked key → isConfigured()=false → raw save
    const res = await http(app)
      .post('/api/customer-feedback')
      .set(auth(adminToken))
      .send({ text: 'สินค้าดีมากกก', source: 'chat' })
      .expect(201);
    expect(res.body.aiProcessed).toBe(false);
    expect(res.body.aiUnavailable).toBe(true);
    expect(res.body.feedback.sentiment).toBeNull();
  });

  it('bulk create: one classify failure does not fail the batch', async () => {
    stubCallClaude({ throwOn: 'ระเบิด' });
    const res = await http(app)
      .post('/api/customer-feedback/bulk')
      .set(auth(adminToken))
      .send({
        text: 'บรรทัดปกติ1\nระเบิด\nบรรทัดปกติ2',
        source: 'sales_note',
        brandId,
      })
      .expect(201);

    expect(res.body.created).toBe(3);
    expect(res.body.processed).toBe(2);
    expect(res.body.failed).toBe(1);
    expect(res.body.items).toHaveLength(3);
  });

  it('insights returns top themes + sentiment breakdown + recent negatives', async () => {
    stubCallClaude();
    // seed a couple negatives scoped to brand
    await http(app)
      .post('/api/customer-feedback')
      .set(auth(adminToken))
      .send({ text: 'แพงไป', source: 'comment', brandId })
      .expect(201);

    const res = await http(app)
      .get(`/api/customer-feedback/insights?brandId=${brandId}`)
      .set(auth(adminToken))
      .expect(200);

    expect(res.body).toHaveProperty('total');
    expect(Array.isArray(res.body.topThemes)).toBe(true);
    expect(Array.isArray(res.body.sentimentBreakdown)).toBe(true);
    expect(Array.isArray(res.body.recentNegatives)).toBe(true);
    const themes = res.body.topThemes.map((t: { theme: string }) => t.theme);
    expect(themes).toContain('บ่นราคา');
  });

  it('reprocess re-runs classify on an unprocessed row', async () => {
    // create raw (no stub)
    const raw = await http(app)
      .post('/api/customer-feedback')
      .set(auth(adminToken))
      .send({ text: 'ส่งช้ามาก', source: 'chat', brandId })
      .expect(201);
    expect(raw.body.feedback.sentiment).toBeNull();

    stubCallClaude();
    const res = await http(app)
      .post(`/api/customer-feedback/${raw.body.feedback.id}/reprocess`)
      .set(auth(adminToken))
      .expect(201);
    expect(res.body.feedback.sentiment).toBe('negative');
    expect(res.body.feedback.aiProcessedAt).toBeTruthy();
  });

  // ── ideation ────────────────────────────────────────────────

  it('ideate (auto) persists an IdeationRun + injects buildBrandContext + voice themes into the prompt', async () => {
    stubCallClaude();
    // ensure at least one processed, brand-scoped negative feedback exists (voice signal)
    await http(app)
      .post('/api/customer-feedback')
      .set(auth(adminToken))
      .send({ text: 'ทำไมแพง', source: 'comment', brandId })
      .expect(201);

    const spy = stubCallClaude();
    const res = await http(app)
      .post('/api/ai/ideate')
      .set(auth(adminToken))
      .send({ mode: 'auto', brandId, count: 2 })
      .expect(201);

    // prompt carried brand context (from buildBrandContext) + customer-voice theme
    const ideateCall = spy.mock.calls.find(
      (c) => (c[0] as { action: string }).action.startsWith('ai_ideate'),
    );
    expect(ideateCall).toBeDefined();
    const promptContent = (ideateCall![0] as { content: string }).content;
    expect(promptContent).toContain(BRAND_STORY); // buildBrandContext output injected
    expect(promptContent).toContain('บ่นราคา'); // customer-voice theme injected

    // persisted run shape
    const run = res.body.run;
    expect(run.mode).toBe('auto');
    expect(run.brandId).toBe(brandId);
    expect(run.ideaCount).toBe(2);
    expect(run.resultJson).toHaveLength(2);
    expect(run.contextJson.brandContextUsed).toBe(true);
    expect(run.contextJson.voiceThemes.frequent).toContain('บ่นราคา');
  });

  it('ideate (iterate) loads the prior run', async () => {
    const spy = stubCallClaude();
    const first = await http(app)
      .post('/api/ai/ideate')
      .set(auth(adminToken))
      .send({ mode: 'auto', brandId, count: 2 })
      .expect(201);
    const priorRunId = first.body.run.id;

    const res = await http(app)
      .post('/api/ai/ideate')
      .set(auth(adminToken))
      .send({ mode: 'iterate', priorRunId, comment: 'ขอฮากว่านี้', count: 2 })
      .expect(201);

    expect(res.body.run.mode).toBe('iterate');
    expect(res.body.run.contextJson.priorIdeaCount).toBe(2);
    expect(res.body.run.contextJson.iterateComment).toBe('ขอฮากว่านี้');

    // iterate prompt carried prior ideas + comment
    const iterateCall = spy.mock.calls.find(
      (c) => (c[0] as { action: string }).action === 'ai_ideate_iterate',
    );
    const promptContent = (iterateCall![0] as { content: string }).content;
    expect(promptContent).toContain('ตอบดราม่าเรื่องราคา'); // prior idea title
    expect(promptContent).toContain('ขอฮากว่านี้'); // comment
  });

  it('ideate (iterate) without priorRunId → 400', async () => {
    stubCallClaude();
    await http(app)
      .post('/api/ai/ideate')
      .set(auth(adminToken))
      .send({ mode: 'iterate', count: 2 })
      .expect(400);
  });

  it('ideate 503s gracefully when AI unconfigured (no stub)', async () => {
    const res = await http(app)
      .post('/api/ai/ideate')
      .set(auth(adminToken))
      .send({ mode: 'auto', brandId, count: 2 })
      .expect(503);
    expect(res.body.message).toContain('ANTHROPIC_API_KEY');
  });

  // ── convert ─────────────────────────────────────────────────

  it('convert → Idea (Idea Library)', async () => {
    stubCallClaude();
    const run = await http(app)
      .post('/api/ai/ideate')
      .set(auth(adminToken))
      .send({ mode: 'auto', brandId, count: 2 })
      .expect(201);

    const res = await http(app)
      .post(`/api/ideation-runs/${run.body.run.id}/convert`)
      .set(auth(adminToken))
      .send({ ideaIndex: 0, target: 'idea' })
      .expect(201);

    expect(res.body.target).toBe('idea');
    expect(res.body.record.title).toBe('ตอบดราม่าเรื่องราคา');
    expect(res.body.record.status).toBe('captured');
  });

  it('convert → ContentItem (status idea, sourceType ideation)', async () => {
    stubCallClaude();
    const run = await http(app)
      .post('/api/ai/ideate')
      .set(auth(adminToken))
      .send({ mode: 'auto', brandId, count: 2 })
      .expect(201);

    const res = await http(app)
      .post(`/api/ideation-runs/${run.body.run.id}/convert`)
      .set(auth(adminToken))
      .send({ ideaIndex: 1, target: 'content' })
      .expect(201);

    expect(res.body.target).toBe('content');
    expect(res.body.record.sourceType).toBe('ideation');
    expect(res.body.record.status).toBe('idea');
    expect(res.body.record.title).toBe('รีวิวสายเปย์');
    expect(res.body.record.hook).toBe('ลองแล้วจะรัก');
  });

  it('ideation-runs history lists persisted runs + detail fetch works', async () => {
    stubCallClaude();
    const created = await http(app)
      .post('/api/ai/ideate')
      .set(auth(adminToken))
      .send({ mode: 'auto', brandId, count: 2 })
      .expect(201);

    const list = await http(app)
      .get('/api/ideation-runs?brandId=' + brandId)
      .set(auth(adminToken))
      .expect(200);
    expect(list.body.total).toBeGreaterThanOrEqual(1);
    const ids = list.body.items.map((r: { id: string }) => r.id);
    expect(ids).toContain(created.body.run.id);

    const detail = await http(app)
      .get(`/api/ideation-runs/${created.body.run.id}`)
      .set(auth(adminToken))
      .expect(200);
    expect(detail.body.id).toBe(created.body.run.id);
  });
});
