import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AiClaudeService } from '../src/ai/ai-claude.service';
import type { ClaudeCallResult } from '../src/ai/ai-claude.service';
import { sceneCountGuidance } from '../src/affiliate-clips/review-recipes';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  auth,
  createApp,
  http,
  loginAs,
} from './utils';

// UGC Studio v2.1 — Software/Feature review (GoSell)
// ของใหม่: subjectType=software + sceneType=screen ("ใบสั่ง Capture" — ห้าม AI gen UI)
// + CTA signup + package แยกสายงาน capture + sceneCountGuidance bracket 8 วิ
// e2e MUST NOT call live AI — stub AiClaudeService.callClaude ตาม action (pattern เดียวกับ v2 spec)
describe('UGC Studio v2.1 — Software review (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let adminToken: string;

  const ts = Date.now();
  const bannedTerm = `คำแบนซอฟต์แวร์${ts}`;
  const SIGNUP_URL = 'https://gosell.example/signup';
  const AFF_URL = 'https://gosell.example/aff';

  const CONCEPTS_CANNED = {
    concepts: [
      {
        name: '😩 แพ็คของทีละออเดอร์อยู่หรอ',
        fit: '🎯 เหมาะกับ: แม่ค้าออนไลน์ออเดอร์เยอะ',
        flow: '😩 เปิด pain → 🎭 แนะนำตัวช่วย → 🖥️ เดโมหน้าจอ → 📊 ตัวเลข → 🔗 สมัคร',
        highlight: '💡 จุดเด่น: เห็นหน้าจอจริง เชื่อได้เลย',
      },
      {
        name: '⏱️ 1 คลิกได้ใบปะหน้า 100 ใบ',
        fit: '🎯 เหมาะกับ: คนอยากประหยัดเวลา',
        flow: '⏱️ จับเวลา → 🖥️ กดจริงให้ดู → 📊 เทียบก่อน-หลัง → 🔗 สมัคร',
        highlight: '💡 จุดเด่น: ตัวเลขชัด',
      },
      {
        name: '🧾 วันที่ 500 ออเดอร์ก็ไม่กลัว',
        fit: '🎯 เหมาะกับ: ร้านช่วงแคมเปญ',
        flow: '🧾 ออเดอร์ทะลัก → 🖥️ ระบบจัดให้ → 🔗 สมัคร',
        highlight: '💡 จุดเด่น: ขายความชิล',
      },
    ],
  };

  // 4 ฉาก: presenter (AI gen) → screen ×2 (ใบสั่ง Capture ตาม steps) → presenter CTA
  const PLAN_CANNED = {
    headline: 'แพ็ค 100 ออเดอร์ใน 1 คลิก',
    script:
      'เมื่อก่อนพิมพ์ใบปะหน้าทีละใบ เสียเป็นชั่วโมง เดี๋ยวนี้กดปุ่มเดียวจบ แพ็คเร็วขึ้น 3 เท่า สมัครฟรี/ทดลองใช้เลย ลิงก์ในคอมเมนต์/ไบโอ',
    caption: 'แม่ค้าต้องรู้ 💻 ฟีเจอร์นี้ช่วยชีวิต',
    hashtags: ['#GoSell', '#แม่ค้าออนไลน์', '#saas'],
    scenes: [
      {
        section: 'hook',
        sceneType: 'presenter',
        title: 'เปิด pain',
        cameraNote: 'medium · หน้าตรงเข้ากล้อง โต๊ะแพ็คของรก ๆ',
        durationSec: 5,
        dialogue: 'ใครยังพิมพ์ใบปะหน้าทีละใบอยู่ ฟังทางนี้',
        onScreenText: 'เสียเวลาเป็นชั่วโมง',
        reason: 'เปิดปัญหาที่แม่ค้าเจอจริง',
        capturePage: '',
        captureAction: '',
        captureZoom: '',
        captureExpect: '',
        captureEditNote: '',
      },
      {
        section: 'demonstration',
        sceneType: 'screen',
        title: 'เดโมหน้าจอ ขั้นเลือกออเดอร์',
        cameraNote: 'screen recording เต็มจอ',
        durationSec: 5,
        dialogue: 'เข้าหน้าออเดอร์ ติ๊กเลือกทั้งหมด แล้วกดพิมพ์ใบปะหน้า',
        onScreenText: 'กดปุ่มเดียว',
        reason: 'เดโมขั้นตอนจริงตาม brief',
        capturePage: 'GoSell > ออเดอร์ > รอแพ็ค',
        captureAction: 'ติ๊กเลือกออเดอร์ทั้งหมด แล้วกดปุ่ม "พิมพ์ใบปะหน้า"',
        captureZoom: 'ซูมปุ่มพิมพ์ใบปะหน้า มุมขวาบน',
        captureExpect: 'PDF ใบปะหน้า 50 ออเดอร์ถูกสร้างในไฟล์เดียว',
        captureEditNote: 'เร่ง speed 1.5x ช่วงระบบโหลด',
      },
      {
        section: 'result',
        sceneType: 'screen',
        title: 'ผลลัพธ์ตัวเลข',
        cameraNote: 'screen recording ซูมสรุปยอด',
        durationSec: 4,
        dialogue: 'ห้าสิบออเดอร์ ใบปะหน้าครบในไฟล์เดียว',
        onScreenText: 'เร็วขึ้น 3 เท่า',
        reason: 'ตัวเลขจับต้องได้',
        capturePage: 'GoSell > รายงาน > สรุปการแพ็ค',
        captureAction: 'เลื่อนดูสรุปจำนวนออเดอร์ที่แพ็คเสร็จวันนี้',
        captureZoom: 'ซูมตัวเลขจำนวนออเดอร์',
        captureExpect: 'ตัวเลขออเดอร์แพ็คเสร็จโชว์ชัด',
        captureEditNote: 'ค้างตัวเลข 1 วิ ให้คนอ่านทัน',
      },
      {
        section: 'cta',
        sceneType: 'presenter',
        title: 'สรุปคุ้ม + สมัคร',
        cameraNote: 'close-up ยิ้มเข้ากล้อง',
        durationSec: 4,
        dialogue: 'สรุปคุ้มมาก สมัครฟรี/ทดลองใช้เลย ลิงก์ในคอมเมนต์/ไบโอ',
        onScreenText: 'สมัครฟรี',
        reason: 'ปิดด้วย CTA สมัคร',
        capturePage: '',
        captureAction: '',
        captureZoom: '',
        captureExpect: '',
        captureEditNote: '',
      },
    ],
  };

  function stubClaude(): jest.SpyInstance {
    const svc = app.get(AiClaudeService);
    jest.spyOn(svc, 'isConfigured').mockResolvedValue(true);
    return jest.spyOn(svc, 'callClaude').mockImplementation(async (opts) => {
      if (opts.action === 'ai_ugc_concepts') {
        return {
          parsed: CONCEPTS_CANNED,
          model: 'stub-model',
          usage: { inputTokens: 10, outputTokens: 20 },
          latencyMs: 1,
        } as ClaudeCallResult<unknown>;
      }
      if (opts.action === 'ai_ugc_plan') {
        return {
          parsed: PLAN_CANNED,
          model: 'stub-model',
          usage: { inputTokens: 10, outputTokens: 20 },
          latencyMs: 1,
        } as ClaudeCallResult<unknown>;
      }
      throw new Error(`unexpected AI action in software spec: ${opts.action}`);
    });
  }

  beforeAll(async () => {
    prisma = new PrismaClient();
    app = await createApp();
    adminToken = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);

    await prisma.bannedWord.create({
      data: {
        term: bannedTerm,
        platforms: [],
        severity: 'ban',
        replacement: 'คำปลอดภัย',
        status: 'active',
      },
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await prisma.bannedWord.deleteMany({ where: { term: bannedTerm } });
    await app.close();
    await prisma.$disconnect();
  });

  // ── A) create validation + defaults ──
  it('create software job: name บังคับ → 400, valid → cta default signup + category default feature + steps เก็บครบ', async () => {
    // ไม่มี subjectBrief.name → 400
    await http(app)
      .post('/api/clip-jobs')
      .set(auth(adminToken))
      .send({ subjectType: 'software', subjectBrief: { product: 'GoSell' } })
      .expect(400);

    const res = await http(app)
      .post('/api/clip-jobs')
      .set(auth(adminToken))
      .send({
        subjectType: 'software',
        subjectBrief: {
          name: `ฟีเจอร์ทดสอบ ${ts}`,
          product: 'GoSell',
          steps: ['เปิดหน้าออเดอร์', 'กดพิมพ์ใบปะหน้า', 'ได้ PDF ไฟล์เดียว'],
        },
      })
      .expect(201);
    expect(res.body.subjectType).toBe('software');
    expect(res.body.productId).toBeNull();
    expect(res.body.ctaType).toBe('signup'); // smart default v2.1
    expect(res.body.name).toBe(`รีวิว ฟีเจอร์ทดสอบ ${ts}`);
    expect(res.body.subjectBrief.category).toBe('feature'); // alias category default
    expect(res.body.subjectBrief.steps).toHaveLength(3);
  });

  it('sceneCountGuidance v2.1: bracket เล็กตาม step 8 วิ — 8→1-2, 16→3-4, 24→4-5, 32→6-7; 45/60/90 เดิมคงไว้', () => {
    expect(sceneCountGuidance(8)).toEqual({ min: 1, max: 2 });
    expect(sceneCountGuidance(16)).toEqual({ min: 3, max: 4 });
    expect(sceneCountGuidance(24)).toEqual({ min: 4, max: 5 });
    expect(sceneCountGuidance(32)).toEqual({ min: 6, max: 7 });
    expect(sceneCountGuidance(45)).toEqual({ min: 8, max: 10 });
    expect(sceneCountGuidance(60)).toEqual({ min: 10, max: 13 });
    expect(sceneCountGuidance(90)).toEqual({ min: 13, max: 18 });
  });

  // ── B) recipe + concepts ──
  let jobId: string;
  let shots: Array<Record<string, unknown>> = [];

  it('concepts: recipe software/feature เข้า prompt (sceneFlow เดโมหน้าจอ + CTA signup)', async () => {
    const spy = stubClaude();
    const job = await http(app)
      .post('/api/clip-jobs')
      .set(auth(adminToken))
      .send({
        subjectType: 'software',
        subjectBrief: {
          name: `พิมพ์ใบปะหน้า 100 ออเดอร์ ${ts}`,
          product: 'GoSell',
          painPoint: 'พิมพ์ใบปะหน้าทีละใบ เสียเวลาเป็นชั่วโมง',
          steps: [
            'เปิดหน้าออเดอร์ > รอแพ็ค',
            'ติ๊กเลือกทั้งหมด แล้วกดพิมพ์ใบปะหน้า',
            'ได้ PDF ใบปะหน้าทุกออเดอร์ในไฟล์เดียว',
          ],
          resultMetric: 'แพ็คออเดอร์เร็วขึ้น 3 เท่า',
          pricing: 'เริ่มต้นฟรี / โปร 590 บาท/เดือน',
          signupUrl: SIGNUP_URL,
        },
        platform: 'tiktok',
        targetDurationSec: 16, // step 8 วิ → guidance 3-4 ฉาก
        affiliateLink: AFF_URL,
      })
      .expect(201);
    jobId = job.body.id;
    expect(job.body.ctaType).toBe('signup');

    await http(app).post(`/api/clip-jobs/${jobId}/concepts`).set(auth(adminToken)).expect(201);

    const call = spy.mock.calls.find((c) => (c[0] as { action: string }).action === 'ai_ugc_concepts');
    expect(call).toBeDefined();
    const opts = call![0] as { system: string; content: string };
    expect(opts.system).toContain('ซอฟต์แวร์/ฟีเจอร์'); // recipe label
    expect(opts.system).toContain('เดโมหน้าจอ'); // sceneFlow ของ recipe
    expect(opts.content).toContain('GoSell'); // subject lines
    expect(opts.content).toContain('ติ๊กเลือกทั้งหมด แล้วกดพิมพ์ใบปะหน้า'); // steps เข้า prompt
  });

  // ── C) plan: screen shots → ใบสั่ง Capture (ไม่ใช่ prompt คู่) ──
  it('plan: screen shots ได้ stillPrompt = ใบสั่ง CAPTURE (+PDPA) map ตาม steps + motion มี Voice/Dialogue + guidance 3-4 ฉาก', async () => {
    const spy = stubClaude();
    const planned = await http(app)
      .post(`/api/clip-jobs/${jobId}/plan`)
      .set(auth(adminToken))
      .send({ conceptIndex: 0 })
      .expect(201);

    expect(planned.body.status).toBe('review');
    shots = planned.body.shots;
    expect(shots).toHaveLength(4);

    // system prompt: guidance ตาม bracket ใหม่ (16 วิ → 3-4 ฉาก) + กฎ screen + CTA signup
    const planOpts = spy.mock.calls.find(
      (c) => (c[0] as { action: string }).action === 'ai_ugc_plan',
    )![0] as { system: string; content: string };
    expect(planOpts.system).toContain('จำนวนฉาก 3-4 ฉาก');
    expect(planOpts.system).toContain('screen = ภาพ capture หน้าจอจริงจากระบบ');
    expect(planOpts.system).toContain('สมัครฟรี/ทดลองใช้เลย ลิงก์ในคอมเมนต์/ไบโอ');
    expect(planOpts.system).toContain('screen content NOT readable'); // recipe emphasis
    expect(planOpts.content).toContain('เปิดหน้าออเดอร์ > รอแพ็ค'); // steps ใน brief

    // screen shot ขั้นเดโม — ใบสั่ง Capture แทน prompt ภาพ
    const s1 = shots[1] as Record<string, unknown>;
    expect(s1.sceneType).toBe('screen');
    expect(s1.voiceType).toBe('female_vo');
    expect(s1.negativePrompt).toBeNull(); // ไม่ gen ภาพ → ไม่มี negative
    const brief1 = s1.stillPrompt as string;
    expect(brief1).toContain('🖥️ ใบสั่ง CAPTURE หน้าจอจริง — ห้ามใช้ AI gen UI');
    expect(brief1).toContain('หน้า: GoSell > ออเดอร์ > รอแพ็ค'); // map ตาม step
    expect(brief1).toContain('ทำ: ติ๊กเลือกออเดอร์ทั้งหมด');
    expect(brief1).toContain('ซูม/ไฮไลต์: ซูมปุ่มพิมพ์ใบปะหน้า');
    expect(brief1).toContain('ต้องเห็นผล: PDF ใบปะหน้า 50 ออเดอร์');
    expect(brief1).toContain('ความยาว: 5 วิ');
    expect(brief1).toContain('ไฮไลต์ cursor');
    expect(brief1).toContain('ซ่อนข้อมูลลูกค้าจริง (PDPA)');

    // motion = โน้ตตัดต่อ + บล็อก Voice/Dialogue ฟอร์แมตเดียวกับฉากอื่น (VO ยัง gen ได้)
    const motion1 = s1.motionPrompt as string;
    expect(motion1).toContain('screen recording จริง');
    expect(motion1).toContain('ห้ามใช้ AI gen UI');
    expect(motion1).toContain('Voice:');
    expect(motion1).toContain('Dialogue:');
    expect(motion1).toContain('เข้าหน้าออเดอร์ ติ๊กเลือกทั้งหมด');

    // screen shot ที่สอง map คนละหน้า
    expect((shots[2] as { stillPrompt: string }).stillPrompt).toContain('GoSell > รายงาน > สรุปการแพ็ค');

    // ฉาก AI gen (presenter) ยังเป็น prompt ปกติ + การ์ดจอเบลอ/เอียง + กันวาด UI ปลอม
    const s0 = shots[0] as { sceneType: string; stillPrompt: string; negativePrompt: string };
    expect(s0.sceneType).toBe('presenter');
    expect(s0.stillPrompt).not.toContain('ใบสั่ง CAPTURE');
    expect(s0.stillPrompt).toContain('screen content NOT readable');
    expect(s0.negativePrompt).toContain('fake app UI');
  });

  // ── D) guard: screen เฉพาะงานซอฟต์แวร์ ──
  it('screen ถูกปฏิเสธบน job ที่ไม่ใช่ software → 400 (ทั้ง PUT replace-set และ PATCH shot)', async () => {
    const food = await http(app)
      .post('/api/clip-jobs')
      .set(auth(adminToken))
      .send({ subjectType: 'food', subjectBrief: { name: `เมนูกันชน ${ts}` } })
      .expect(201);

    // PUT replace-set มี screen → 400
    const put = await http(app)
      .put(`/api/clip-jobs/${food.body.id}/shots`)
      .set(auth(adminToken))
      .send({ shots: [{ section: 'hook', sceneType: 'screen' }] })
      .expect(400);
    expect(put.body.message).toContain('เฉพาะงานรีวิวซอฟต์แวร์');

    // PATCH sceneType=screen บน shot ของ job food → 400
    await http(app)
      .put(`/api/clip-jobs/${food.body.id}/shots`)
      .set(auth(adminToken))
      .send({ shots: [{ section: 'hook', dialogue: 'ดูก่อน' }] })
      .expect(200);
    const detail = await http(app).get(`/api/clip-jobs/${food.body.id}`).set(auth(adminToken)).expect(200);
    const patch = await http(app)
      .patch(`/api/clip-jobs/${food.body.id}/shots/${detail.body.shots[0].id}`)
      .set(auth(adminToken))
      .send({ sceneType: 'screen' })
      .expect(400);
    expect(patch.body.message).toContain('เฉพาะงานรีวิวซอฟต์แวร์');
  });

  it('PATCH sceneType=screen บน job software → ผ่าน + voiceType auto female_vo', async () => {
    const shotId = (shots[0] as { id: string }).id; // presenter → screen
    const patched = await http(app)
      .patch(`/api/clip-jobs/${jobId}/shots/${shotId}`)
      .set(auth(adminToken))
      .send({ sceneType: 'screen' })
      .expect(200);
    expect(patched.body.sceneType).toBe('screen');
    expect(patched.body.voiceType).toBe('female_vo');
    // เปลี่ยนกลับ presenter (ให้ shot 0 เป็นฉาก AI gen เหมือนเดิม)
    await http(app)
      .patch(`/api/clip-jobs/${jobId}/shots/${shotId}`)
      .set(auth(adminToken))
      .send({ sceneType: 'presenter' })
      .expect(200);
  });

  // ── E) recompose screen — deterministic re-render จาก planJson.captures ──
  it('recompose screen shot: เขียนทับใบสั่งแล้วกด recompose → re-render กลับจาก planJson (page/action เดิม)', async () => {
    const shotId = (shots[1] as { id: string }).id;
    await http(app)
      .patch(`/api/clip-jobs/${jobId}/shots/${shotId}`)
      .set(auth(adminToken))
      .send({ stillPrompt: 'โดนมือลบทิ้ง', motionPrompt: 'โดนมือลบทิ้ง' })
      .expect(200);

    const rec = await http(app)
      .post(`/api/clip-jobs/${jobId}/shots/${shotId}/recompose`)
      .set(auth(adminToken))
      .expect(201);
    expect(rec.body.stillPrompt).toContain('🖥️ ใบสั่ง CAPTURE หน้าจอจริง');
    expect(rec.body.stillPrompt).toContain('GoSell > ออเดอร์ > รอแพ็ค');
    expect(rec.body.stillPrompt).toContain('PDPA');
    expect(rec.body.motionPrompt).toContain('Voice:');
  });

  it('recompose screen shot ที่ไม่มี entry ใน planJson (เพิ่มมือ) → คงข้อความเดิมไว้ ไม่ทับ', async () => {
    // job software ใหม่ (ไม่มี planJson.captures) + shot screen เขียนใบสั่งมือ
    const job2 = await http(app)
      .post('/api/clip-jobs')
      .set(auth(adminToken))
      .send({
        subjectType: 'software',
        subjectBrief: { name: `ฟีเจอร์เขียนมือ ${ts}` },
        affiliateLink: AFF_URL, // ไม่มี signupUrl → package fallback ไป affiliateLink
      })
      .expect(201);
    await http(app)
      .put(`/api/clip-jobs/${job2.body.id}/shots`)
      .set(auth(adminToken))
      .send({
        shots: [
          { section: 'hook', sceneType: 'screen', dialogue: 'ดูหน้าจอนี้', stillPrompt: 'ใบสั่งเขียนมือ ห้ามหาย' },
        ],
      })
      .expect(200);
    const detail = await http(app).get(`/api/clip-jobs/${job2.body.id}`).set(auth(adminToken)).expect(200);
    const sid = detail.body.shots[0].id;
    const rec = await http(app)
      .post(`/api/clip-jobs/${job2.body.id}/shots/${sid}/recompose`)
      .set(auth(adminToken))
      .expect(201);
    expect(rec.body.stillPrompt).toBe('ใบสั่งเขียนมือ ห้ามหาย'); // keep-as-is (documented)

    // package ของ job2: signupUrl fallback = affiliateLink + capture section เห็น shot นี้
    const pack2 = await http(app)
      .get(`/api/clip-jobs/${job2.body.id}/package`)
      .set(auth(adminToken))
      .expect(200);
    expect(pack2.body.signupUrl).toBe(AFF_URL);
    expect(pack2.body.captureShots).toHaveLength(1);
    expect(pack2.body.captureShots[0].captureBrief).toBe('ใบสั่งเขียนมือ ห้ามหาย');
  });

  // ── F) gate: dialogue ของ screen shot เข้า scan ตามปกติ ──
  it('banned gate: dialogue ของ screen shot ติดคำแบน → compliance ชี้ตำแหน่ง + PATCH ready 400, แก้แล้วผ่าน', async () => {
    const shotId = (shots[2] as { id: string }).id;
    await http(app)
      .patch(`/api/clip-jobs/${jobId}/shots/${shotId}`)
      .set(auth(adminToken))
      .send({ dialogue: `ตัวเลขดีจน${bannedTerm}` })
      .expect(200);

    const detail = await http(app).get(`/api/clip-jobs/${jobId}`).set(auth(adminToken)).expect(200);
    expect(detail.body.compliance.hasBan).toBe(true);
    const match = detail.body.compliance.matches.find(
      (m: { source: string; term: string }) => m.source === 'dialogue' && m.term === bannedTerm,
    );
    expect(match).toBeDefined();

    await http(app)
      .patch(`/api/clip-jobs/${jobId}`)
      .set(auth(adminToken))
      .send({ status: 'ready' })
      .expect(400);

    // แก้กลับ → ตั้ง ready ผ่าน
    await http(app)
      .patch(`/api/clip-jobs/${jobId}/shots/${shotId}`)
      .set(auth(adminToken))
      .send({ dialogue: 'ห้าสิบออเดอร์ ใบปะหน้าครบในไฟล์เดียว' })
      .expect(200);
    await http(app)
      .patch(`/api/clip-jobs/${jobId}`)
      .set(auth(adminToken))
      .send({ status: 'ready' })
      .expect(200);
  });

  // ── G) package: signupUrl (brief ก่อน) + สายงาน capture แยก ──
  it('package: signupUrl จาก brief (ชนะ affiliateLink) + captureShots เฉพาะฉาก screen + ctaLine signup', async () => {
    const pack = await http(app).get(`/api/clip-jobs/${jobId}/package`).set(auth(adminToken)).expect(200);
    expect(pack.body.job.subjectType).toBe('software');
    expect(pack.body.ctaType).toBe('signup');
    expect(pack.body.ctaLine).toBe('สมัครฟรี/ทดลองใช้เลย ลิงก์ในคอมเมนต์/ไบโอ');
    expect(pack.body.affiliateLink).toBe(AFF_URL);
    expect(pack.body.signupUrl).toBe(SIGNUP_URL); // brief.signupUrl ชนะ fallback

    // สายงานที่ 2 — เฉพาะ screen shots (2 จาก 4) พร้อมใบสั่ง render แล้ว
    expect(pack.body.captureShots).toHaveLength(2);
    const orders = pack.body.captureShots.map((c: { order: number }) => c.order);
    expect(orders).toEqual([1, 2]);
    expect(pack.body.captureShots[0].captureBrief).toContain('ใบสั่ง CAPTURE');
    // shots เต็มยังครบ 4 (สาย AI gen + capture รวมกัน)
    expect(pack.body.shots).toHaveLength(4);
  });

  // ── H) ประเภทอื่นไม่กระทบ: signupUrl/captureShots ว่างบน job food ──
  it('legacy/subject อื่นไม่กระทบ: package job food → signupUrl null + captureShots ว่าง', async () => {
    const food = await http(app)
      .post('/api/clip-jobs')
      .set(auth(adminToken))
      .send({ subjectType: 'food', subjectBrief: { name: `เมนูเช็ค regression ${ts}` } })
      .expect(201);
    expect(food.body.ctaType).toBe('map'); // default เดิมไม่เปลี่ยน
    const pack = await http(app)
      .get(`/api/clip-jobs/${food.body.id}/package`)
      .set(auth(adminToken))
      .expect(200);
    expect(pack.body.signupUrl).toBeNull();
    expect(pack.body.captureShots).toEqual([]);
  });
});
