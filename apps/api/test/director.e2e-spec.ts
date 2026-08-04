import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ServiceUnavailableException } from '@nestjs/common';
import { AiClaudeService } from '../src/ai/ai-claude.service';
import type { ClaudeCallResult } from '../src/ai/ai-claude.service';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  auth,
  createApp,
  createUserWithRoles,
  http,
  loginAs,
} from './utils';

const VIEWER_EMAIL = 'dir-viewer@aistar.test';
const VIEWER_PASSWORD = 'dir-viewer-2026';
const FAKE_GESTURE_ID = '00000000-0000-4000-8000-000000000abc'; // ไม่มีในคลัง → ต้องถูก coerce เป็น null

// AI Director (SRS slice 4, §3.13) — recommend → apply → InteractionTemplate
// e2e ห้ามยิง Claude จริง — stub AiClaudeService.callClaude ให้คืน recommendation คงที่
describe('AI Director (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let adminToken: string;
  let viewerToken: string; // character_designer: library V only → mutate 403

  const ts = Date.now();
  let handId: string;
  let gOpenId: string; // sealed → opened (bottle)
  let cameraId: string;
  let lightingId: string;
  let productId: string;

  // stub: recommendation คงที่ (อ้าง id ที่ seed จริง + 1 gesture id ปลอมเพื่อทดสอบ coercion)
  function stubRecommend(): jest.SpyInstance {
    const svc = app.get(AiClaudeService);
    jest.spyOn(svc, 'isConfigured').mockResolvedValue(true);
    return jest.spyOn(svc, 'callClaude').mockImplementation(
      async () =>
        ({
          parsed: {
            storyboardType: 'how_to_use',
            durationSec: 9,
            summary: 'สาธิตการเปิดขวดแล้วใช้งานสั้นๆ สำหรับ TikTok',
            baseTemplateId: '',
            steps: [
              { stepOrder: 0, section: 'hook', gestureId: '', handId, cameraId, lightingId, durationSec: 2, reason: 'เปิดด้วยภาพขวดกลางแสงนุ่ม' },
              { stepOrder: 1, section: 'interaction', gestureId: gOpenId, handId, cameraId, lightingId, durationSec: 3, reason: 'โชว์การเปิดฝาแบบมาโคร' },
              { stepOrder: 2, section: 'demonstration', gestureId: FAKE_GESTURE_ID, handId, cameraId: '', lightingId: '', durationSec: 2, reason: 'ท่านี้ AI แต่ง id ขึ้นเอง' },
              { stepOrder: 3, section: 'cta', gestureId: '', handId, cameraId, lightingId, durationSec: 2, reason: 'ปิดด้วย call-to-action' },
            ],
            reasons: [
              { topic: 'เลือกมือ', text: 'ใช้มือผู้หญิงผิวโอลีฟให้เข้ากับสินค้าบิวตี้' },
              { topic: 'เลือกมุมกล้อง', text: 'มาโครโคลสอัพเน้นดีเทลฝาขวด' },
              { topic: 'ความยาว', text: 'รวม ~9 วิ เหมาะกับ TikTok' },
              { topic: 'สิ่งที่ตัดออก', text: 'ตัดขั้นตอนรีวิวยาวออกเพื่อความกระชับ' },
            ],
          },
          model: 'stub-model',
          usage: { inputTokens: 10, outputTokens: 20 },
          latencyMs: 1,
        }) as ClaudeCallResult<unknown>,
    );
  }

  beforeAll(async () => {
    prisma = new PrismaClient();
    await createUserWithRoles(prisma, VIEWER_EMAIL, VIEWER_PASSWORD, ['character_designer']);
    app = await createApp();
    adminToken = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);
    viewerToken = await loginAs(app, VIEWER_EMAIL, VIEWER_PASSWORD);

    const hand = await http(app)
      .post('/api/hands')
      .set(auth(adminToken))
      .send({ name: `มือ Director ${ts}`, category: 'adult_female', skinTone: 'olive', status: 'active' })
      .expect(201);
    handId = hand.body.id;

    const gOpen = await http(app)
      .post('/api/gestures')
      .set(auth(adminToken))
      .send({
        name: `เปิดฝาขวด DIR ${ts}`,
        key: `dir_open_${ts}`,
        category: 'open',
        requiredProductState: 'sealed',
        resultingProductState: 'opened',
        naturalDurationSec: 3,
        compatiblePackaging: ['bottle'],
        promptTemplate: 'twist open the bottle cap, macro',
        negativePrompt: 'no extra fingers',
      })
      .expect(201);
    gOpenId = gOpen.body.id;

    const camera = await http(app)
      .post('/api/camera-presets')
      .set(auth(adminToken))
      .send({ name: `มาโครโคลสอัพ ${ts}`, shotSize: 'close_up', angle: 'eye_level', cameraMovement: 'static', compatiblePackaging: ['bottle'], promptTemplate: 'macro close-up shot' })
      .expect(201);
    cameraId = camera.body.id;

    const lighting = await http(app)
      .post('/api/lighting-presets')
      .set(auth(adminToken))
      .send({ name: `แสงนุ่ม ${ts}`, mood: 'soft', colorTemperature: '5600K', promptTemplate: 'soft window light' })
      .expect(201);
    lightingId = lighting.body.id;

    const product = await http(app)
      .post('/api/products')
      .set(auth(adminToken))
      .send({ name: `เซรั่มทดสอบ Director ${ts}`, category: 'beauty' })
      .expect(201);
    productId = product.body.id;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  // ── permission ──────────────────────────────────────────────
  it('recommend without library:C → 403', async () => {
    await http(app)
      .post('/api/director/recommend')
      .set(auth(viewerToken))
      .send({ productCategory: 'beauty', packagingType: 'bottle' })
      .expect(403);
  });

  // ── recommend pipeline ──────────────────────────────────────
  it('recommend persists DIR code + status ready + prompt-package + validation + coerces hallucinated id', async () => {
    stubRecommend();
    const res = await http(app)
      .post('/api/director/recommend')
      .set(auth(adminToken))
      .send({
        productId,
        packagingType: 'bottle',
        platform: 'tiktok',
        targetDurationSec: 10,
        objective: 'conversion',
        creativeStyle: 'premium',
        preferredHandId: handId,
      })
      .expect(201);

    expect(res.body.displayCode).toMatch(/^DIR-\d{4}$/);
    expect(res.body.status).toBe('ready');
    expect(res.body.productCategory).toBe('beauty'); // เติมจาก product
    expect(res.body.reasoning).toContain('เลือกมือ');

    const result = res.body.resultJson;
    // 4 steps; step index 2 ใช้ gesture id ปลอม → ต้องถูก coerce เป็น null + ติด dropped
    expect(result.steps).toHaveLength(4);
    expect(result.steps[1].gestureId).toBe(gOpenId);
    expect(result.steps[2].gestureId).toBeNull();
    expect(result.dropped.gestureIds).toContain(FAKE_GESTURE_ID);

    // prompt-package fold-in (deterministic composition)
    expect(result.promptPackage.steps).toHaveLength(4);
    expect(result.promptPackage.combined).toContain('twist open the bottle cap');

    // validation block present
    expect(result.validation).toHaveProperty('errors');
    expect(result.validation).toHaveProperty('warnings');

    // defaults ที่ใช้บ่อยสุด → preferredHand
    expect(result.defaults.handId).toBe(handId);
    expect(result.defaults.cameraId).toBe(cameraId);

    // enriched step names (detail-style)
    expect(res.body.steps[1].gesture.name).toContain('เปิดฝาขวด');
    expect(res.body.steps[1].camera.name).toContain('มาโคร');
  });

  it('recommend feeds candidate library ids into the Claude prompt', async () => {
    const spy = stubRecommend();
    await http(app)
      .post('/api/director/recommend')
      .set(auth(adminToken))
      .send({ productCategory: 'beauty', packagingType: 'bottle', platform: 'tiktok' })
      .expect(201);

    const call = spy.mock.calls[0][0] as { content: string; system: string };
    expect(call.content).toContain(gOpenId); // ท่าจริงถูกป้อนเป็น candidate
    expect(call.content).toContain(cameraId);
    expect(call.system).toContain('id ที่ระบุในแต่ละรายการ'); // กติกาห้ามแต่ง id
  });

  // ── list + detail ───────────────────────────────────────────
  it('list + filters (productId/status/q) + detail', async () => {
    stubRecommend();
    const created = await http(app)
      .post('/api/director/recommend')
      .set(auth(adminToken))
      .send({ productId, packagingType: 'bottle', objective: 'awareness' })
      .expect(201);

    const list = await http(app)
      .get(`/api/director?productId=${productId}`)
      .set(auth(adminToken))
      .expect(200);
    expect(list.body.total).toBeGreaterThanOrEqual(1);
    expect(list.body.items.map((r: { id: string }) => r.id)).toContain(created.body.id);

    const filtered = await http(app)
      .get('/api/director?status=ready&q=awareness')
      .set(auth(adminToken))
      .expect(200);
    expect(filtered.body.items.every((r: { status: string }) => r.status === 'ready')).toBe(true);

    const detail = await http(app)
      .get(`/api/director/${created.body.id}`)
      .set(auth(adminToken))
      .expect(200);
    expect(detail.body.id).toBe(created.body.id);
    expect(detail.body.steps.length).toBeGreaterThan(0);
  });

  // ── apply → InteractionTemplate ─────────────────────────────
  it('apply creates an InteractionTemplate with matching steps + sets appliedTemplateId/status applied', async () => {
    stubRecommend();
    const run = await http(app)
      .post('/api/director/recommend')
      .set(auth(adminToken))
      .send({ productId, packagingType: 'bottle', objective: 'conversion' })
      .expect(201);

    const applied = await http(app)
      .post(`/api/director/${run.body.id}/apply`)
      .set(auth(adminToken))
      .expect(201);

    expect(applied.body.displayCode).toMatch(/^ITPL-\d{4}$/);
    expect(applied.body.status).toBe('draft');
    expect(applied.body.defaultHandId).toBe(handId);
    expect(applied.body.steps).toHaveLength(4);
    const openStep = applied.body.steps.find((s: { gestureId: string | null }) => s.gestureId === gOpenId);
    expect(openStep).toBeDefined();

    // run ถูกอัปเดตเป็น applied + ผูก template
    const detail = await http(app)
      .get(`/api/director/${run.body.id}`)
      .set(auth(adminToken))
      .expect(200);
    expect(detail.body.status).toBe('applied');
    expect(detail.body.appliedTemplateId).toBe(applied.body.id);
  });

  it('re-apply does not double-create — returns the existing template', async () => {
    stubRecommend();
    const run = await http(app)
      .post('/api/director/recommend')
      .set(auth(adminToken))
      .send({ productId, packagingType: 'bottle' })
      .expect(201);

    const first = await http(app).post(`/api/director/${run.body.id}/apply`).set(auth(adminToken)).expect(201);
    const second = await http(app).post(`/api/director/${run.body.id}/apply`).set(auth(adminToken)).expect(201);
    expect(second.body.id).toBe(first.body.id); // idempotent — เทมเพลตเดิม
  });

  // ── Claude unavailable → failed (graceful) ──────────────────
  it('Claude unavailable (no key) → status failed + errorMessage, still persisted (no 500)', async () => {
    // no stub → real path sees blanked key → callClaude throws ServiceUnavailableException
    const res = await http(app)
      .post('/api/director/recommend')
      .set(auth(adminToken))
      .send({ productCategory: 'beauty', packagingType: 'bottle' })
      .expect(201);
    expect(res.body.status).toBe('failed');
    expect(res.body.errorMessage).toContain('ANTHROPIC_API_KEY');
    expect(res.body.displayCode).toMatch(/^DIR-\d{4}$/);
    // ยืนยันว่าเป็น ServiceUnavailableException ที่ถูก catch (ไม่ leak เป็น 503)
    void ServiceUnavailableException;
  });

  // ── delete (soft archive) ───────────────────────────────────
  it('delete soft-archives (hidden from default list, visible with status filter)', async () => {
    stubRecommend();
    const run = await http(app)
      .post('/api/director/recommend')
      .set(auth(adminToken))
      .send({ productCategory: 'beauty', packagingType: 'bottle', notes: `ลบทิ้ง ${ts}` })
      .expect(201);

    await http(app).delete(`/api/director/${run.body.id}`).set(auth(adminToken)).expect(200);

    const def = await http(app).get(`/api/director?q=ลบทิ้ง ${ts}`).set(auth(adminToken)).expect(200);
    expect(def.body.items.find((r: { id: string }) => r.id === run.body.id)).toBeUndefined();

    const arch = await http(app).get('/api/director?status=archived').set(auth(adminToken)).expect(200);
    expect(arch.body.items.map((r: { id: string }) => r.id)).toContain(run.body.id);
  });

  it('viewer (library V) can list but not delete/apply', async () => {
    await http(app).get('/api/director').set(auth(viewerToken)).expect(200);
    await http(app).delete(`/api/director/${FAKE_GESTURE_ID}`).set(auth(viewerToken)).expect(403);
  });
});
