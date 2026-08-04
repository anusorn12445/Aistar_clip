import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
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

// Content Intelligence — System 4 (Content Analytics). CLOSES THE LOOP.
// e2e MUST NOT call live AI — ANTHROPIC_API_KEY is blanked in test-env so the
// real Claude path 503s. We STUB AiClaudeService.callClaude with a canned
// synthesis and assert that the DETERMINISTIC aggregates (bestFormat/
// bestCharacter/…) are computed from the seeded data, NOT from the AI.
//
// Data is isolated by a UNIQUE platform value ("PLATFORM") so `overall`/other
// suites' content never leaks into these aggregates.
describe('Content Analytics — System 4 (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let adminToken: string;
  let researcherToken: string; // no content permission → 403

  const PLATFORM = `tiktok_ci4_${randomUUID().slice(0, 8)}`;
  const EMPTY_PLATFORM = `void_${randomUUID().slice(0, 8)}`;
  const SCHEDULED = new Date('2025-01-03T12:00:00.000Z'); // Friday 19:00 เวลาไทย (12:00Z + 7)
  const RECORDED = new Date('2025-01-05T10:00:00.000Z');

  // canned AI synthesis (only interpretation — numbers come from aggregation)
  const SYNTH = {
    summary: 'ภาพรวม: short_video ทำยอดวิวสูงสุด และพี่หมีคือพรีเซนเตอร์ที่เวิร์คสุด',
    patterns: [{ signal: 'short_video เด่น', evidence: 'views รวม 18000', metric: 'views' }],
    recommendations: [
      {
        action: 'ทำ short_video ดราม่าราคาโดยใช้พี่หมีต่อเนื่อง',
        rationale: 'ฟอร์แมตและพรีเซนเตอร์นี้เวิร์คสุด',
        targetPlatform: PLATFORM,
      },
    ],
    bestHook: 'ทำไมแพง',
    bestFormat: 'short_video',
    bestCharacter: 'พี่หมี',
    bestTime: 'วันศุกร์ ช่วง 19:00 น.',
  };
  const IDEAS = {
    ideas: [
      {
        title: 'ต่อยอด short_video',
        hook: 'ทำไมแพง',
        angle: 'ดราม่าราคา',
        platform: PLATFORM,
        format: 'short_video',
        contentType: 'drama',
        characterHint: 'พี่หมี',
        productHint: '',
        captionDirection: 'จริงใจ',
        rationale: 'อ้างอิง insight',
        sourceSignals: ['insight จากผลงานเก่า'],
      },
    ],
  };

  function stubCallClaude(): jest.SpyInstance {
    const svc = app.get(AiClaudeService);
    jest.spyOn(svc, 'isConfigured').mockResolvedValue(true);
    return jest.spyOn(svc, 'callClaude').mockImplementation(
      async (args: { action: string }) => {
        const parsed = args.action.startsWith('ai_ideate') ? IDEAS : SYNTH;
        return {
          parsed,
          model: 'stub-model',
          usage: { inputTokens: 5, outputTokens: 10 },
          latencyMs: 1,
        } as ClaudeCallResult<unknown>;
      },
    );
  }

  // seed 4 content items (unique PLATFORM) + performances with clear winners:
  //  short_video (18000 views) > live (2000) > image_post (500)  → bestFormat=short_video
  //  charA "พี่หมี" (18000) > charB "น้องดาว" (2500)               → bestCharacter=พี่หมี
  async function seed(): Promise<void> {
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } });

    const charA = await prisma.character.create({
      data: {
        displayCode: `CHR-CI4-A-${randomUUID().slice(0, 6)}`,
        nameTh: 'พี่หมี',
        createdBy: admin.id,
      },
    });
    const charB = await prisma.character.create({
      data: {
        displayCode: `CHR-CI4-B-${randomUUID().slice(0, 6)}`,
        nameTh: 'น้องดาว',
        createdBy: admin.id,
      },
    });

    const mkItem = async (
      title: string,
      contentFormat: string,
      contentType: string,
      hook: string,
      charId: string,
      views: number,
      gmv: number,
    ) => {
      const item = await prisma.contentItem.create({
        data: {
          title,
          platform: PLATFORM,
          contentFormat,
          contentType,
          hook,
          scheduledAt: SCHEDULED,
          characters: { create: { characterId: charId } },
        },
      });
      await prisma.contentPerformance.create({
        data: {
          contentItemId: item.id,
          platform: PLATFORM,
          recordedAt: RECORDED,
          views,
          gmv,
          orders: Math.round(gmv / 500),
          ctr: 0.05,
          completionRate: 0.6,
          roas: 3,
        },
      });
      return item;
    };

    await mkItem('ดราม่าราคา', 'short_video', 'drama', 'ทำไมแพง', charA.id, 10000, 5000);
    await mkItem('รีวิวเปย์', 'short_video', 'review', 'ลองแล้วรัก', charA.id, 8000, 4000);
    await mkItem('ไลฟ์ขายของ', 'live', 'live', 'มาไลฟ์กัน', charB.id, 2000, 1000);
    await mkItem('โพสต์ภาพ', 'image_post', 'tie_in', 'ดูภาพนี้', charB.id, 500, 0);
  }

  beforeAll(async () => {
    prisma = new PrismaClient();
    await ensureResearcher(prisma);
    app = await createApp();
    adminToken = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);
    researcherToken = await loginAs(app, RESEARCHER_EMAIL, RESEARCHER_PASSWORD);
    await seed();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  // ── permission ──────────────────────────────────────────────

  it('generate without content:C → 403', async () => {
    await http(app)
      .post('/api/content-insights/generate')
      .set(auth(researcherToken))
      .send({ scope: 'platform', scopeRef: PLATFORM })
      .expect(403);
  });

  // ── deterministic aggregation (numbers NOT from AI) ─────────

  it('generate computes deterministic aggregates from seeded data (bestFormat/bestCharacter correct)', async () => {
    stubCallClaude();
    const res = await http(app)
      .post('/api/content-insights/generate')
      .set(auth(adminToken))
      .send({ scope: 'platform', scopeRef: PLATFORM })
      .expect(201);

    const agg = res.body.insight.insightJson.aggregates;
    expect(res.body.insight.sampleSize).toBe(4);
    expect(agg.sampleSize).toBe(4);
    expect(agg.snapshotCount).toBe(4);

    // deterministic winners — computed from views, NOT from AI
    expect(agg.best.bestFormat).toBe('short_video');
    expect(agg.best.bestCharacter).toBe('พี่หมี');
    expect(agg.best.bestPlatform).toBe(PLATFORM);
    expect(agg.best.bestDayOfWeek).toBe('วันศุกร์'); // scheduledAt Friday
    expect(agg.best.bestHour).toBe('19:00 น.');

    // ranking order: short_video (18000) > live (2000) > image_post (500)
    expect(agg.byFormat.map((b: { key: string }) => b.key)).toEqual([
      'short_video',
      'live',
      'image_post',
    ]);
    expect(agg.byFormat[0].views).toBe(18000);

    // character ranking: พี่หมี (18000) > น้องดาว (2500)
    expect(agg.byCharacter[0].label).toBe('พี่หมี');
    expect(agg.byCharacter[0].views).toBe(18000);

    // top performers ranked by views
    expect(agg.topPerformers[0].title).toBe('ดราม่าราคา');
    expect(agg.topPerformers[0].views).toBe(10000);
    expect(agg.totals.views).toBe(20500);
  });

  it('AI synthesis (stubbed) is persisted + summary from AI + provenance ai', async () => {
    const spy = stubCallClaude();
    const res = await http(app)
      .post('/api/content-insights/generate')
      .set(auth(adminToken))
      .send({ scope: 'platform', scopeRef: PLATFORM })
      .expect(201);

    expect(res.body.provenance).toBe('ai');
    expect(res.body.insight.summary).toBe(SYNTH.summary);
    expect(res.body.insight.insightJson.aiAvailable).toBe(true);
    expect(res.body.insight.insightJson.synthesis.bestFormat).toBe('short_video');
    expect(res.body.insight.insightJson.synthesis.recommendations).toHaveLength(1);

    // AI was fed the computed aggregates (not asked to compute)
    const call = spy.mock.calls.find(
      (c) => (c[0] as { action: string }).action === 'ai_content_insight',
    );
    expect(call).toBeDefined();
    const prompt = (call![0] as { content: string }).content;
    expect(prompt).toContain('ห้ามคำนวณ'); // AI told to interpret, not compute
    expect(prompt).toContain('short_video');
  });

  it('graceful path: AI unconfigured → persists deterministic aggregates + aiUnavailable (no 500)', async () => {
    // no stub → blanked key → isConfigured()=false
    const res = await http(app)
      .post('/api/content-insights/generate')
      .set(auth(adminToken))
      .send({ scope: 'platform', scopeRef: PLATFORM })
      .expect(201);

    expect(res.body.provenance).toBe('deterministic');
    expect(res.body.aiUnavailable).toBe(true);
    expect(res.body.insight.insightJson.aiAvailable).toBe(false);
    expect(res.body.insight.insightJson.synthesis).toBeNull();
    // aggregates still correct
    expect(res.body.insight.insightJson.aggregates.best.bestFormat).toBe('short_video');
    expect(res.body.insight.summary).toContain('short_video'); // deterministic summary
  });

  it('empty-data handled: scope matching nothing → sampleSize 0, 200', async () => {
    stubCallClaude();
    const res = await http(app)
      .post('/api/content-insights/generate')
      .set(auth(adminToken))
      .send({ scope: 'platform', scopeRef: EMPTY_PLATFORM })
      .expect(201);

    expect(res.body.insight.sampleSize).toBe(0);
    expect(res.body.insight.insightJson.aggregates.topPerformers).toHaveLength(0);
    // AI not invoked when there is nothing to interpret
    expect(res.body.insight.insightJson.synthesis).toBeNull();
  });

  // ── list + detail ───────────────────────────────────────────

  it('list + detail work (content:V)', async () => {
    stubCallClaude();
    const created = await http(app)
      .post('/api/content-insights/generate')
      .set(auth(adminToken))
      .send({ scope: 'platform', scopeRef: PLATFORM })
      .expect(201);
    const id = created.body.insight.id;

    const list = await http(app)
      .get('/api/content-insights?scope=platform')
      .set(auth(adminToken))
      .expect(200);
    expect(list.body.total).toBeGreaterThanOrEqual(1);
    expect(list.body.items.map((i: { id: string }) => i.id)).toContain(id);

    const detail = await http(app)
      .get(`/api/content-insights/${id}`)
      .set(auth(adminToken))
      .expect(200);
    expect(detail.body.id).toBe(id);
    expect(detail.body.insightJson.aggregates.sampleSize).toBe(4);
  });

  it('content:V (researcher) can list but cannot generate (V/C split)', async () => {
    // researcher has content V → list OK
    await http(app).get('/api/content-insights').set(auth(researcherToken)).expect(200);
    // but not content C → generate denied (covered above, re-assert the split here)
    await http(app)
      .post('/api/content-insights/generate')
      .set(auth(researcherToken))
      .send({ scope: 'overall' })
      .expect(403);
  });

  // ── LOOP CLOSURE: ContentInsight → ideation assembleContext ──

  it('loop closure: after an insight exists, an ideation run injects its summary + records it', async () => {
    const spy = stubCallClaude();

    // 1) create an insight (System 4)
    const gen = await http(app)
      .post('/api/content-insights/generate')
      .set(auth(adminToken))
      .send({ scope: 'platform', scopeRef: PLATFORM })
      .expect(201);
    const insightId = gen.body.insight.id;

    // 2) ideation (System 2) with matching platformHint → should pull the insight
    const res = await http(app)
      .post('/api/ai/ideate')
      .set(auth(adminToken))
      .send({ mode: 'auto', platformHint: PLATFORM, count: 1 })
      .expect(201);

    // prompt carried the insight summary + recommendation (closed loop)
    const ideateCall = spy.mock.calls.find(
      (c) => (c[0] as { action: string }).action.startsWith('ai_ideate'),
    );
    expect(ideateCall).toBeDefined();
    const prompt = (ideateCall![0] as { content: string }).content;
    expect(prompt).toContain('insight จากผลงานเก่า');
    expect(prompt).toContain(SYNTH.summary);
    expect(prompt).toContain(SYNTH.recommendations[0].action);

    // recorded in contextJson (audit/debug trail)
    expect(res.body.run.contextJson.contentInsight.insightId).toBe(insightId);
    expect(res.body.run.contextJson.contentInsight.scope).toBe('platform');
  });
});
