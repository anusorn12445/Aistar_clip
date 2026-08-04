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

const FAKE_ID = '00000000-0000-4000-8000-00000000c11b';
const DRIVE_URL = 'https://drive.google.com/file/d/1AbCdEfGh/view?usp=sharing';

// UGC Studio v2 — Clip Jobs (สาย product: concepts → plan → shot board → package)
// e2e MUST NOT call live AI — stub AiClaudeService.callClaude, switch ตาม action
// (ai_ugc_concepts → คอนเซปต์ 3 แบบ, ai_ugc_plan → storyboard, ai_director_recommend → enrichment)
describe('Affiliate Clip Jobs (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let adminToken: string;
  let researcherToken: string; // ไม่มี product permission → 403

  const ts = Date.now();
  let handId: string;
  let gestureId: string;
  let cameraId: string;
  let lightingId: string;
  let productId: string;
  let characterId: string;

  const REVIEW_CANNED = {
    hook: 'ผิวโทรมมานาน ลองตัวนี้แล้วว้าวมาก',
    body: 'เนื้อบางเบา ซึมไว ใช้แล้วผิวนุ่มขึ้นชัด',
    cta: 'กดลิงก์ในโพสต์สั่งเลย',
    caption: 'รีวิวจริงจากคนใช้จริง 😍 #ของดีบอกต่อ',
    hashtags: ['#รีวิว', '#skincare', '#affiliate'],
  };

  const CONCEPTS_CANNED = {
    concepts: [
      {
        name: '📦 แกะกล่องแล้วใช้เลย',
        fit: '🎯 เหมาะกับ: คนเพิ่งรู้จักสินค้า',
        flow: '👋 เปิดหัว → 📦 แกะกล่อง → ✨ ใช้จริง → 🛒 ปิดขาย',
        highlight: '💡 จุดเด่น: เห็นของจริงครบตั้งแต่กล่องยันผลลัพธ์',
      },
      {
        name: '⏱️ ผิวดีใน 1 ขั้นตอน',
        fit: '🎯 เหมาะกับ: คนไม่มีเวลา',
        flow: '😩 เปิดปัญหา → 👆 ใช้ตัวเดียวจบ → 😋 ฟีลหลังใช้ → 🛒 ปิดขาย',
        highlight: '💡 จุดเด่น: ขายความง่าย',
      },
      {
        name: '🫧 เนื้อสัมผัสของจริง',
        fit: '🎯 เหมาะกับ: สายดูเนื้อผลิตภัณฑ์',
        flow: '🫧 texture close-up → 🖐️ ทาโชว์ → ✨ ซึมไว → 🛒 ปิดขาย',
        highlight: '💡 จุดเด่น: macro สวย หยุดนิ้วได้',
      },
    ],
  };

  const PLAN_CANNED = {
    headline: 'เซรั่มตัวเก่งที่ต้องมีติดโต๊ะ',
    script: `${REVIEW_CANNED.hook}\n\n${REVIEW_CANNED.body}\n\n${REVIEW_CANNED.cta}`,
    caption: REVIEW_CANNED.caption,
    hashtags: REVIEW_CANNED.hashtags,
    scenes: [
      {
        section: 'hook',
        sceneType: 'presenter',
        title: 'เปิดหัวดึงคนดู',
        cameraNote: 'medium · หน้าตรงเข้ากล้อง',
        durationSec: 5,
        dialogue: REVIEW_CANNED.hook,
        onScreenText: 'ว้าวมาก',
        reason: 'hook 3 วิแรกหยุดนิ้ว',
      },
      {
        section: 'interaction',
        sceneType: 'hands',
        title: 'แกะกล่อง',
        cameraNote: 'POV overhead · โต๊ะไม้',
        durationSec: 5,
        dialogue: 'เปิดกล่องกัน',
        onScreenText: 'แกะกล่องกัน',
        reason: 'เห็นของจริงในกล่อง',
      },
      {
        section: 'cta',
        sceneType: 'product_only',
        title: 'ปิดขาย',
        cameraNote: 'orbit ช้า · แสง warm home',
        durationSec: 4,
        dialogue: REVIEW_CANNED.cta,
        onScreenText: 'จิ้มตะกร้า',
        reason: 'ปิดการขายชัดเจน',
      },
    ],
  };

  // stub ทุกสาย AI — director อ้าง id ที่ seed จริง + 1 id ปลอม (ต้องถูก coerce)
  function stubClaude(): jest.SpyInstance {
    const svc = app.get(AiClaudeService);
    jest.spyOn(svc, 'isConfigured').mockResolvedValue(true);
    return jest.spyOn(svc, 'callClaude').mockImplementation(
      async (opts) => {
        if (opts.action.startsWith('ai_director')) {
          return {
            parsed: {
              storyboardType: 'how_to_use',
              durationSec: 9,
              summary: 'สูตรรีวิวสั้นสำหรับ TikTok',
              baseTemplateId: '',
              steps: [
                { stepOrder: 0, section: 'hook', gestureId: '', handId, cameraId, lightingId, durationSec: 2, reason: 'เปิดด้วยภาพสินค้า' },
                { stepOrder: 1, section: 'interaction', gestureId, handId, cameraId, lightingId, durationSec: 3, reason: 'โชว์การเปิดฝา' },
                { stepOrder: 2, section: 'cta', gestureId: '', handId, cameraId: '', lightingId: '', durationSec: 2, reason: 'ปิดการขาย' },
              ],
              reasons: [
                { topic: 'เลือกมือ', text: 'มือผู้หญิงเข้ากับสินค้าบิวตี้' },
                { topic: 'ความยาว', text: 'รวม ~7 วิ กระชับ' },
              ],
            },
            model: 'stub-model',
            usage: { inputTokens: 10, outputTokens: 20 },
            latencyMs: 1,
          } as ClaudeCallResult<unknown>;
        }
        if (opts.action === 'ai_ugc_concepts') {
          return {
            parsed: CONCEPTS_CANNED,
            model: 'stub-model',
            usage: { inputTokens: 10, outputTokens: 20 },
            latencyMs: 1,
          } as ClaudeCallResult<unknown>;
        }
        return {
          parsed: PLAN_CANNED,
          model: 'stub-model',
          usage: { inputTokens: 10, outputTokens: 20 },
          latencyMs: 1,
        } as ClaudeCallResult<unknown>;
      },
    );
  }

  /** v2 flow helper: ขอคอนเซปต์ก่อน แล้วค่อย plan ด้วย conceptIndex */
  async function conceptsAndPlan(jobId: string, conceptIndex = 0) {
    await http(app).post(`/api/clip-jobs/${jobId}/concepts`).set(auth(adminToken)).expect(201);
    return http(app)
      .post(`/api/clip-jobs/${jobId}/plan`)
      .set(auth(adminToken))
      .send({ conceptIndex })
      .expect(201);
  }

  beforeAll(async () => {
    prisma = new PrismaClient();
    await ensureResearcher(prisma);
    app = await createApp();
    adminToken = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);
    researcherToken = await loginAs(app, RESEARCHER_EMAIL, RESEARCHER_PASSWORD);

    const hand = await http(app)
      .post('/api/hands')
      .set(auth(adminToken))
      .send({
        name: `มือ Clip ${ts}`,
        category: 'adult_female',
        skinTone: 'olive',
        nailStyle: 'clean natural',
        status: 'active',
      })
      .expect(201);
    handId = hand.body.id;

    const gesture = await http(app)
      .post('/api/gestures')
      .set(auth(adminToken))
      .send({
        name: `เปิดฝาขวด CLIP ${ts}`,
        key: `clip_open_${ts}`,
        category: 'open',
        naturalDurationSec: 3,
        compatiblePackaging: ['bottle'],
        promptTemplate: 'twist open the bottle cap, macro detail',
        negativePrompt: 'no extra fingers',
      })
      .expect(201);
    gestureId = gesture.body.id;

    const camera = await http(app)
      .post('/api/camera-presets')
      .set(auth(adminToken))
      .send({
        name: `มาโครโคลสอัพ CLIP ${ts}`,
        shotSize: 'close_up',
        angle: 'eye_level',
        cameraMovement: 'slow_push_in',
        promptTemplate: 'macro close-up shot',
      })
      .expect(201);
    cameraId = camera.body.id;

    const lighting = await http(app)
      .post('/api/lighting-presets')
      .set(auth(adminToken))
      .send({ name: `แสงนุ่ม CLIP ${ts}`, mood: 'soft', colorTemperature: '5600K', promptTemplate: 'soft window light' })
      .expect(201);
    lightingId = lighting.body.id;

    const product = await http(app)
      .post('/api/products')
      .set(auth(adminToken))
      .send({
        name: `เซรั่ม Clip Jobs ${ts}`,
        category: 'beauty',
        price: 590,
        platformLinks: { shopee: 'https://shope.ee/clip-serum', lazada: 'https://laz.ada/clip-serum' },
      })
      .expect(201);
    productId = product.body.id;

    // ตัวละคร presenter (มี visualDna → compose Master Prompt ได้)
    const character = await prisma.character.create({
      data: {
        displayCode: `CHR-CLIP-${ts}`,
        nameTh: `พรีเซนเตอร์คลิป ${ts}`,
        nameEn: 'Clip Presenter',
        age: 27,
        gender: 'หญิง',
        visualDna: {
          ethnicity: 'Thai, Southeast Asian features',
          hair_style: 'long black hair',
          skin_tone: 'warm tan',
        },
        createdBy: (await prisma.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } })).id,
      },
    });
    characterId = character.id;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  // ── permission ──────────────────────────────────────────────
  it('researcher (product V only) → list ได้ แต่ create/concepts/plan → 403', async () => {
    await http(app).get('/api/clip-jobs').set(auth(researcherToken)).expect(200);
    await http(app)
      .post('/api/clip-jobs')
      .set(auth(researcherToken))
      .send({ productId })
      .expect(403);
    await http(app).post(`/api/clip-jobs/${FAKE_ID}/concepts`).set(auth(researcherToken)).expect(403);
    await http(app)
      .post(`/api/clip-jobs/${FAKE_ID}/plan`)
      .set(auth(researcherToken))
      .send({ conceptIndex: 0 })
      .expect(403);
  });

  // ── create ──────────────────────────────────────────────────
  it('create → CLIP code + defaults (name, affiliateLink จาก platformLinks shopee, 9:16, subjectType product, cta basket)', async () => {
    const res = await http(app)
      .post('/api/clip-jobs')
      .set(auth(adminToken))
      .send({ productId, platform: 'tiktok', targetDurationSec: 15 })
      .expect(201);
    expect(res.body.displayCode).toMatch(/^CLIP-\d{4}$/);
    expect(res.body.name).toBe(`รีวิว เซรั่ม Clip Jobs ${ts}`);
    expect(res.body.subjectType).toBe('product');
    expect(res.body.ctaType).toBe('basket');
    expect(res.body.outputType).toBe('video');
    expect(res.body.aspectRatio).toBe('9:16');
    expect(res.body.affiliateLink).toBe('https://shope.ee/clip-serum'); // shopee ก่อน lazada
    expect(res.body.status).toBe('draft');
  });

  it('v2 Resource Rail: เลือก character + hand พร้อมกันได้, fake product → 404, fake hand → 400', async () => {
    const both = await http(app)
      .post('/api/clip-jobs')
      .set(auth(adminToken))
      .send({ productId, handId, characterId })
      .expect(201);
    expect(both.body.handId).toBe(handId);
    expect(both.body.characterId).toBe(characterId);
    await http(app)
      .post('/api/clip-jobs')
      .set(auth(adminToken))
      .send({ productId: FAKE_ID })
      .expect(404);
    await http(app)
      .post('/api/clip-jobs')
      .set(auth(adminToken))
      .send({ productId, handId: FAKE_ID })
      .expect(400);
  });

  // ── plan (stubbed AI) ───────────────────────────────────────
  it('plan (hands scenes) → shots materialized + prompt คู่ + script/caption/hashtags + status review', async () => {
    stubClaude();
    const job = await http(app)
      .post('/api/clip-jobs')
      .set(auth(adminToken))
      .send({ productId, handId, platform: 'tiktok', targetDurationSec: 12 })
      .expect(201);

    const planned = await conceptsAndPlan(job.body.id);

    expect(planned.body.status).toBe('review');
    expect(planned.body.directorRunId).toBeTruthy(); // product → director enrichment ยังทำงาน
    expect(planned.body.script).toContain(REVIEW_CANNED.hook);
    expect(planned.body.script).toContain(REVIEW_CANNED.cta);
    expect(planned.body.caption).toBe(REVIEW_CANNED.caption);
    expect(planned.body.hashtags).toEqual(REVIEW_CANNED.hashtags);
    expect(planned.body.headline).toBe(PLAN_CANNED.headline);
    expect(planned.body.selectedConceptIndex).toBe(0);
    expect(planned.body.planJson.reasons.length).toBeGreaterThan(0);

    const shots = planned.body.shots;
    expect(shots).toHaveLength(3);
    // sections + dialogue จาก scenes ของ AI โดยตรง
    expect(shots[0].section).toBe('hook');
    expect(shots[0].dialogue).toBe(REVIEW_CANNED.hook);
    expect(shots[2].section).toBe('cta');
    expect(shots[2].dialogue).toBe(REVIEW_CANNED.cta);
    expect(shots[1].dialogue).toBe('เปิดกล่องกัน');

    // hands scene still prompt: no-face UGC + hand descriptor + gesture template (director enrich)
    expect(shots[1].sceneType).toBe('hands');
    expect(shots[1].stillPrompt).toContain('no face visible');
    expect(shots[1].stillPrompt).toContain(`มือ Clip ${ts}`); // hand descriptor
    expect(shots[1].stillPrompt).toContain('twist open the bottle cap');
    // motion prompt v2: Voice/Dialogue block + camera movement + no-morphing guard
    expect(shots[1].motionPrompt).toContain('Voice:');
    expect(shots[1].motionPrompt).toContain('Dialogue:');
    expect(shots[1].motionPrompt).toContain('เปิดกล่องกัน');
    expect(shots[1].motionPrompt).toContain('no morphing');
    expect(shots[1].motionPrompt).toContain('slow_push_in');
    // negative merge จาก gesture + มาตรฐาน
    expect(shots[1].negativePrompt).toContain('no extra fingers');
    expect(shots[1].negativePrompt).toContain('face visible');
    // enriched names
    expect(shots[1].gesture.name).toContain('เปิดฝาขวด');
    expect(shots[1].hand.name).toContain('มือ Clip');
  });

  it('plan (presenter scene + characterId) → still prompt = Master Prompt base (=== DIRECTIVE ===) + shot variation', async () => {
    stubClaude();
    const job = await http(app)
      .post('/api/clip-jobs')
      .set(auth(adminToken))
      .send({ productId, characterId, platform: 'tiktok' })
      .expect(201);

    const planned = await conceptsAndPlan(job.body.id);

    const shot = planned.body.shots[0]; // scene แรกเป็น presenter
    expect(shot.sceneType).toBe('presenter');
    expect(shot.voiceType).toBe('on_camera');
    expect(shot.stillPrompt).toContain('=== DIRECTIVE ===');
    expect(shot.stillPrompt).toContain('=== SHOT — UGC REVIEW ===');
    expect(shot.stillPrompt).toContain(`เซรั่ม Clip Jobs ${ts}`);
    expect(shot.handId).toBeNull(); // presenter ไม่ผูกมือ
    expect(shot.motionPrompt).toContain('no morphing');
  });

  it('plan without concepts → 400 (v2 ต้องเลือกคอนเซปต์ก่อน)', async () => {
    const job = await http(app)
      .post('/api/clip-jobs')
      .set(auth(adminToken))
      .send({ productId })
      .expect(201);
    await http(app)
      .post(`/api/clip-jobs/${job.body.id}/plan`)
      .set(auth(adminToken))
      .send({ conceptIndex: 0 })
      .expect(400);
  });

  it('replan wipes existing shots and recreates fresh', async () => {
    stubClaude();
    const job = await http(app)
      .post('/api/clip-jobs')
      .set(auth(adminToken))
      .send({ productId, handId })
      .expect(201);

    const first = await conceptsAndPlan(job.body.id);
    const firstIds = first.body.shots.map((s: { id: string }) => s.id);

    const second = await http(app)
      .post(`/api/clip-jobs/${job.body.id}/plan`)
      .set(auth(adminToken))
      .send({ conceptIndex: 1 })
      .expect(201);
    const secondIds = second.body.shots.map((s: { id: string }) => s.id);
    expect(second.body.shots).toHaveLength(3);
    expect(second.body.selectedConceptIndex).toBe(1);
    expect(secondIds.some((sid: string) => firstIds.includes(sid))).toBe(false); // ชุดใหม่ทั้งหมด
  });

  it('Claude unavailable (no key) → concepts 503 / plan 503 + job กลับ draft (ไม่พัง)', async () => {
    const spy = stubClaude();
    const job = await http(app)
      .post('/api/clip-jobs')
      .set(auth(adminToken))
      .send({ productId, handId })
      .expect(201);
    // ได้คอนเซปต์แล้ว → ปิด AI (restore) → plan ต้อง 503 และ job กลับ draft
    await http(app).post(`/api/clip-jobs/${job.body.id}/concepts`).set(auth(adminToken)).expect(201);
    spy.mockRestore();
    jest.restoreAllMocks();

    await http(app)
      .post(`/api/clip-jobs/${job.body.id}/plan`)
      .set(auth(adminToken))
      .send({ conceptIndex: 0 })
      .expect(503);

    const detail = await http(app).get(`/api/clip-jobs/${job.body.id}`).set(auth(adminToken)).expect(200);
    expect(detail.body.status).toBe('draft');
    expect(detail.body.shots).toHaveLength(0);

    // ไม่มีคีย์เลย → ขอคอนเซปต์ก็ 503
    const fresh = await http(app)
      .post('/api/clip-jobs')
      .set(auth(adminToken))
      .send({ productId })
      .expect(201);
    await http(app).post(`/api/clip-jobs/${fresh.body.id}/concepts`).set(auth(adminToken)).expect(503);
  });

  // ── shots: patch status flow + job auto-status ──────────────
  it('shot PATCH: videoUrl validation + status flow → job generating → ready', async () => {
    stubClaude();
    const job = await http(app)
      .post('/api/clip-jobs')
      .set(auth(adminToken))
      .send({ productId, handId })
      .expect(201);
    const planned = await conceptsAndPlan(job.body.id);
    const shots = planned.body.shots as { id: string }[];

    // bad videoUrl → 400
    await http(app)
      .patch(`/api/clip-jobs/${job.body.id}/shots/${shots[0].id}`)
      .set(auth(adminToken))
      .send({ videoUrl: 'not a url' })
      .expect(400);

    // shot แรก generated + วางลิงก์ Drive → job = generating
    const p1 = await http(app)
      .patch(`/api/clip-jobs/${job.body.id}/shots/${shots[0].id}`)
      .set(auth(adminToken))
      .send({ status: 'generated', videoUrl: DRIVE_URL })
      .expect(200);
    expect(p1.body.videoUrl).toBe(DRIVE_URL);
    expect(p1.body.jobStatus).toBe('generating');

    // approve ครบทุก shot → job = ready
    for (const s of shots) {
      await http(app)
        .patch(`/api/clip-jobs/${job.body.id}/shots/${s.id}`)
        .set(auth(adminToken))
        .send({ status: 'approved' })
        .expect(200);
    }
    const detail = await http(app).get(`/api/clip-jobs/${job.body.id}`).set(auth(adminToken)).expect(200);
    expect(detail.body.status).toBe('ready');
    expect(detail.body.doneCount).toBe(3);
  });

  // ── replace-set + recompose ─────────────────────────────────
  it('PUT shots replace-set: validates refs (fake gesture → 400) then replaces; recompose fills prompts', async () => {
    const job = await http(app)
      .post('/api/clip-jobs')
      .set(auth(adminToken))
      .send({ productId, handId })
      .expect(201);

    await http(app)
      .put(`/api/clip-jobs/${job.body.id}/shots`)
      .set(auth(adminToken))
      .send({ shots: [{ section: 'hook', gestureId: FAKE_ID }] })
      .expect(400);

    const replaced = await http(app)
      .put(`/api/clip-jobs/${job.body.id}/shots`)
      .set(auth(adminToken))
      .send({
        shots: [
          { section: 'hook', title: 'เปิดคลิป', dialogue: 'ดูนี่ก่อน', durationSec: 2 },
          { section: 'interaction', gestureId, handId, cameraId, lightingId, durationSec: 3 },
        ],
      })
      .expect(200);
    expect(replaced.body.shots).toHaveLength(2);
    expect(replaced.body.shots[1].stillPrompt).toBeNull(); // replace-set ไม่แต่ง prompt ให้เอง
    expect(replaced.body.shots[1].sceneType).toBe('hands'); // default v2
    expect(replaced.body.shots[1].voiceType).toBe('female_vo');

    // recompose → เติม stillPrompt/motionPrompt ของ shot นั้น deterministic (เคารพ sceneType)
    const sid = replaced.body.shots[1].id;
    const rec = await http(app)
      .post(`/api/clip-jobs/${job.body.id}/shots/${sid}/recompose`)
      .set(auth(adminToken))
      .expect(201);
    expect(rec.body.stillPrompt).toContain('twist open the bottle cap');
    expect(rec.body.stillPrompt).toContain('no face visible');
    expect(rec.body.motionPrompt).toContain('no morphing');
    expect(rec.body.motionPrompt).toContain('Voice:');
    expect(rec.body.negativePrompt).toContain('no extra fingers');
  });

  // ── list + filters ──────────────────────────────────────────
  it('list: filters (productId/mode/q) + product name + progress counts', async () => {
    stubClaude();
    const job = await http(app)
      .post('/api/clip-jobs')
      .set(auth(adminToken))
      .send({ productId, handId, name: `คลิปลิสต์ ${ts}` })
      .expect(201);
    await conceptsAndPlan(job.body.id);

    const list = await http(app)
      .get(`/api/clip-jobs?productId=${productId}&mode=hand&q=คลิปลิสต์ ${ts}`)
      .set(auth(adminToken))
      .expect(200);
    expect(list.body.total).toBeGreaterThanOrEqual(1);
    const row = list.body.items.find((r: { id: string }) => r.id === job.body.id);
    expect(row).toBeDefined();
    expect(row.product.name).toBe(`เซรั่ม Clip Jobs ${ts}`);
    expect(row.subject.type).toBe('product');
    expect(row.shotCount).toBe(3);
    expect(row.doneCount).toBe(0);
  });

  // ── PATCH job + package ─────────────────────────────────────
  it('PATCH job (script/caption/finalVideoUrl validation) + package endpoint shape', async () => {
    stubClaude();
    const job = await http(app)
      .post('/api/clip-jobs')
      .set(auth(adminToken))
      .send({ productId, handId })
      .expect(201);
    await conceptsAndPlan(job.body.id);

    await http(app)
      .patch(`/api/clip-jobs/${job.body.id}`)
      .set(auth(adminToken))
      .send({ finalVideoUrl: 'ไม่ใช่ลิงก์' })
      .expect(400);

    const patched = await http(app)
      .patch(`/api/clip-jobs/${job.body.id}`)
      .set(auth(adminToken))
      .send({ script: 'สคริปต์แก้มือ', caption: 'แคปชันใหม่', finalVideoUrl: DRIVE_URL, status: 'published' })
      .expect(200);
    expect(patched.body.script).toBe('สคริปต์แก้มือ');
    expect(patched.body.status).toBe('published');

    const pack = await http(app)
      .get(`/api/clip-jobs/${job.body.id}/package`)
      .set(auth(adminToken))
      .expect(200);
    expect(pack.body.job.displayCode).toMatch(/^CLIP-\d{4}$/);
    expect(pack.body.job.product.name).toBe(`เซรั่ม Clip Jobs ${ts}`);
    expect(pack.body.script).toBe('สคริปต์แก้มือ');
    expect(pack.body.caption).toBe('แคปชันใหม่');
    expect(pack.body.affiliateLink).toBe('https://shope.ee/clip-serum');
    expect(pack.body.finalVideoUrl).toBe(DRIVE_URL);
    // v2: headline + ctaLine + ข้อความขึ้นจอ (พาดหัว + ต่อฉาก)
    expect(pack.body.headline).toBe(PLAN_CANNED.headline);
    expect(pack.body.ctaLine).toBe('จิ้มตะกร้าเลย');
    expect(pack.body.onScreenTexts.length).toBeGreaterThanOrEqual(4); // headline + 3 ฉาก
    expect(pack.body.shots).toHaveLength(3);
    expect(pack.body.shots[0]).toEqual(
      expect.objectContaining({ order: 0, section: 'hook', status: 'pending', sceneType: 'presenter' }),
    );
  });

  // ── archive ─────────────────────────────────────────────────
  it('archive → hidden from default list, visible with status filter', async () => {
    const job = await http(app)
      .post('/api/clip-jobs')
      .set(auth(adminToken))
      .send({ productId, name: `คลิปลบทิ้ง ${ts}` })
      .expect(201);

    await http(app).post(`/api/clip-jobs/${job.body.id}/archive`).set(auth(adminToken)).expect(201);

    const def = await http(app)
      .get(`/api/clip-jobs?q=คลิปลบทิ้ง ${ts}`)
      .set(auth(adminToken))
      .expect(200);
    expect(def.body.items.find((r: { id: string }) => r.id === job.body.id)).toBeUndefined();

    const arch = await http(app)
      .get(`/api/clip-jobs?status=archived&q=คลิปลบทิ้ง ${ts}`)
      .set(auth(adminToken))
      .expect(200);
    expect(arch.body.items.map((r: { id: string }) => r.id)).toContain(job.body.id);
  });
});
