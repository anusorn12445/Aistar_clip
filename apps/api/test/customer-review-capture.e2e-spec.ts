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

// Customer Review Capture → Clip Job selection
// ครอบคลุม: POST /customer-feedback/extract-reviews (stub AI — ห้ามแตะ Anthropic จริง)
//   คัดเฉพาะ 4-5 ดาว / ไม่รู้ดาวแต่ positive (rating null) + dedupe ข้อความซ้ำต่อสินค้า,
// GET /customer-feedback?minRating=, subjectBrief.reviews roundtrip (cap 5 ข้อ / 300 ตัวอักษร),
// และ prompt concepts ต้องมีบล็อกเสียงลูกค้าแบบ "สารตั้งต้นหาไอเดีย" (ห้ามอ้างคำชม + ข้ามได้)
describe('Customer Review Capture (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let adminToken: string;
  let researcherToken: string; // ไม่มีสิทธิ์ content C → 403
  let productId: string;

  // ก้อนรีวิวจาก AI (stub) — ผสมดาวให้ครบเคสคัดเข้า/คัดออก
  const CANNED_REVIEWS = {
    reviews: [
      { text: 'ซึมไวมาก ไม่เหนียวเลย ใช้ 3 วันหน้าใสขึ้น', rating: 5, gem: 'ใช้ 3 วันหน้าใสขึ้น', sentiment: 'positive' },
      { text: 'กลิ่นหอมอ่อน ๆ เนื้อบางเบา ทาก่อนแต่งหน้าได้', rating: 4, gem: '', sentiment: 'positive' },
      { text: 'ส่งช้ามาก กล่องบุบด้วย ผิดหวัง', rating: 2, gem: '', sentiment: 'negative' },
      { text: 'ของดีเกินราคา ซื้อซ้ำรอบสามแล้วค่ะ', rating: 0, gem: 'ซื้อซ้ำรอบสาม', sentiment: 'positive' },
      { text: 'เฉย ๆ นะ ยังไม่เห็นผลอะไร', rating: 0, gem: '', sentiment: 'neutral' },
    ],
  };

  const CANNED_CONCEPTS = {
    concepts: [1, 2, 3].map((i) => ({
      name: `🧪 คอนเซปต์ ${i}`,
      fit: '🎯 เหมาะกับ: สายรีวิวจริงใจ',
      flow: '🎬 เปิด → 🖐️ ลอง → 🛒 ปิด',
      highlight: '💡 จุดเด่น: เล่าจากปัญหาจริง',
    })),
  };

  function stubClaude(parsed: Record<string, unknown>): jest.SpyInstance {
    const svc = app.get(AiClaudeService);
    jest.spyOn(svc, 'isConfigured').mockResolvedValue(true);
    return jest.spyOn(svc, 'callClaude').mockImplementation(
      async () =>
        ({
          parsed,
          model: 'stub-model',
          usage: { inputTokens: 10, outputTokens: 20 },
          latencyMs: 1,
        }) as ClaudeCallResult<unknown>,
    );
  }

  beforeAll(async () => {
    prisma = new PrismaClient();
    await ensureResearcher(prisma);
    app = await createApp();
    adminToken = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);
    researcherToken = await loginAs(app, RESEARCHER_EMAIL, RESEARCHER_PASSWORD);

    const res = await http(app)
      .post('/api/products')
      .set(auth(adminToken))
      .send({ name: 'เซรั่มทดสอบ Review Capture', price: 299 })
      .expect(201);
    productId = res.body.id;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    // เก็บกวาด feedback ของสินค้าทดสอบ กัน DB บวมข้ามรอบรัน
    await prisma.customerFeedback.deleteMany({ where: { productId } });
    await app.close();
    await prisma.$disconnect();
  });

  // ── 1) extract-reviews — คัดเฉพาะ 4-5 ดาว / unknown-positive + dedupe ──────
  it('POST /customer-feedback/extract-reviews (stubbed) → เก็บเฉพาะ >=4 ดาว หรือไม่รู้ดาวแต่ positive', async () => {
    const spy = stubClaude(CANNED_REVIEWS);
    const res = await http(app)
      .post('/api/customer-feedback/extract-reviews')
      .set(auth(adminToken))
      .send({ productId, text: '⭐5 ซึมไวมาก...\n⭐4 กลิ่นหอม...\n⭐2 ส่งช้า...' })
      .expect(201);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0].action).toBe('customer_review_extract');

    // 5 รีวิวจาก AI: เก็บ 3 (5⭐, 4⭐, unknown-positive) ข้าม 2 (2⭐ negative, unknown-neutral)
    expect(res.body.saved).toBe(3);
    expect(res.body.skipped).toBe(2);
    expect(res.body.items).toHaveLength(3);

    const rows = await prisma.customerFeedback.findMany({
      where: { productId },
      orderBy: { createdAt: 'asc' },
    });
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.source).toBe('comment');
      expect(row.sourceRef).toBe('shopee_paste');
      expect(row.aiProcessedAt).not.toBeNull();
    }
    const five = rows.find((r) => r.rating === 5)!;
    expect(five.text).toBe('ซึมไวมาก ไม่เหนียวเลย ใช้ 3 วันหน้าใสขึ้น');
    expect(five.themes).toEqual(['ใช้ 3 วันหน้าใสขึ้น']); // gem → themes
    expect(five.sentiment).toBe('positive');
    const four = rows.find((r) => r.rating === 4)!;
    expect(four.themes).toEqual([]); // gem ว่าง → ไม่ยัด theme ว่าง
    // ไม่รู้ดาวแต่ positive ชัด → เก็บด้วย rating null
    const unknown = rows.find((r) => r.rating === null)!;
    expect(unknown.text).toBe('ของดีเกินราคา ซื้อซ้ำรอบสามแล้วค่ะ');
    expect(unknown.sentiment).toBe('positive');
  });

  it('extract-reviews รอบสอง (ก้อนเดิม) → dedupe ข้อความซ้ำ ไม่เก็บเพิ่ม', async () => {
    stubClaude(CANNED_REVIEWS);
    const res = await http(app)
      .post('/api/customer-feedback/extract-reviews')
      .set(auth(adminToken))
      .send({ productId, text: 'วางก้อนเดิมซ้ำ' })
      .expect(201);

    expect(res.body.saved).toBe(0);
    expect(res.body.skipped).toBe(5); // 3 ซ้ำของเดิม + 2 ไม่ผ่านเกณฑ์
    const count = await prisma.customerFeedback.count({ where: { productId } });
    expect(count).toBe(3);
  });

  it('extract-reviews: validation + สิทธิ์', async () => {
    const spy = stubClaude(CANNED_REVIEWS);
    // productId ไม่ใช่ uuid / text ว่าง → 400 (ก่อนถึง AI)
    await http(app)
      .post('/api/customer-feedback/extract-reviews')
      .set(auth(adminToken))
      .send({ productId: 'not-a-uuid', text: 'รีวิว' })
      .expect(400);
    await http(app)
      .post('/api/customer-feedback/extract-reviews')
      .set(auth(adminToken))
      .send({ productId })
      .expect(400);
    // สินค้าไม่มีจริง → 404
    await http(app)
      .post('/api/customer-feedback/extract-reviews')
      .set(auth(adminToken))
      .send({ productId: '00000000-0000-4000-8000-000000000000', text: 'รีวิว' })
      .expect(404);
    expect(spy).not.toHaveBeenCalled();

    // researcher ไม่มีสิทธิ์ content C → 403
    await http(app)
      .post('/api/customer-feedback/extract-reviews')
      .set(auth(researcherToken))
      .send({ productId, text: 'รีวิว' })
      .expect(403);
  });

  // ── 2) GET list minRating — กรองเรตติ้งขั้นต่ำ + serialize rating ──────────
  it('GET /customer-feedback?minRating=4 → เฉพาะแถว rating >= 4 (null ไม่ติดมา)', async () => {
    const all = await http(app)
      .get(`/api/customer-feedback?productId=${productId}`)
      .set(auth(adminToken))
      .expect(200);
    expect(all.body.total).toBe(3);
    // rating ต้อง serialize มาในทุกแถว (4/5/null)
    const ratings = all.body.items.map((r: { rating: number | null }) => r.rating);
    expect(ratings).toHaveLength(3);
    expect(ratings).toEqual(expect.arrayContaining([4, 5, null]));

    const filtered = await http(app)
      .get(`/api/customer-feedback?productId=${productId}&minRating=4`)
      .set(auth(adminToken))
      .expect(200);
    expect(filtered.body.total).toBe(2);
    for (const row of filtered.body.items) {
      expect(row.rating).toBeGreaterThanOrEqual(4);
    }

    // minRating เกินสเกล → 400
    await http(app)
      .get(`/api/customer-feedback?minRating=6`)
      .set(auth(adminToken))
      .expect(400);
  });

  // ── 3) Clip Job — subjectBrief.reviews roundtrip (cap 5 ข้อ / 300 ตัวอักษร) ──
  it('POST /clip-jobs subjectBrief.reviews → trim + cap 300 ตัวอักษร + cap 5 ข้อ + PATCH ได้', async () => {
    const long = 'ย'.repeat(400);
    const created = await http(app)
      .post('/api/clip-jobs')
      .set(auth(adminToken))
      .send({
        subjectType: 'product',
        productId,
        subjectBrief: {
          angle: 'เน้นเสียงลูกค้า',
          reviews: ['  รีวิว A  ', '', '   ', long, 'รีวิว C', 'รีวิว D', 'รีวิว E', 'รีวิว F'],
        },
      })
      .expect(201);
    const jobId = created.body.id;
    expect(created.body.subjectBrief).toEqual({
      angle: 'เน้นเสียงลูกค้า',
      // ตัดข้อว่าง → เหลือ 6 ข้อ → cap 5 ข้อแรก, ข้อยาวโดนตัดเหลือ 300
      reviews: ['รีวิว A', 'ย'.repeat(300), 'รีวิว C', 'รีวิว D', 'รีวิว E'],
    });

    // PATCH เปลี่ยนชุดรีวิว + คงโจทย์ (server เก็บเฉพาะ key ที่ส่งมา — client ส่งครบทุก field)
    await http(app)
      .patch(`/api/clip-jobs/${jobId}`)
      .set(auth(adminToken))
      .send({ subjectBrief: { angle: 'เน้นเสียงลูกค้า', reviews: ['ซื้อซ้ำรอบสามแล้วค่ะ'] } })
      .expect(200);
    const detail = await http(app).get(`/api/clip-jobs/${jobId}`).set(auth(adminToken)).expect(200);
    expect(detail.body.subjectBrief).toEqual({
      angle: 'เน้นเสียงลูกค้า',
      reviews: ['ซื้อซ้ำรอบสามแล้วค่ะ'],
    });

    // PATCH เอารีวิวออกหมด (ไม่ส่ง reviews) → เหลือแต่ angle
    await http(app)
      .patch(`/api/clip-jobs/${jobId}`)
      .set(auth(adminToken))
      .send({ subjectBrief: { angle: 'มุมใหม่' } })
      .expect(200);
    const detail2 = await http(app).get(`/api/clip-jobs/${jobId}`).set(auth(adminToken)).expect(200);
    expect(detail2.body.subjectBrief).toEqual({ angle: 'มุมใหม่' });
  });

  // ── 4) prompt concepts — บล็อกเสียงรีวิวจริง + คำสั่ง PARAPHRASE ──────────
  it('POST /clip-jobs/:id/concepts (stubbed) — prompt มีบล็อกเสียงลูกค้าแบบสารตั้งต้นไอเดีย', async () => {
    const created = await http(app)
      .post('/api/clip-jobs')
      .set(auth(adminToken))
      .send({
        subjectType: 'product',
        productId,
        subjectBrief: {
          angle: 'เน้นหน้าร้อน',
          reviews: ['ซึมไวมาก ไม่เหนียวเลย ใช้ 3 วันหน้าใสขึ้น', 'ของดีเกินราคา ซื้อซ้ำรอบสามแล้วค่ะ'],
        },
      })
      .expect(201);

    const spy = stubClaude(CANNED_CONCEPTS);
    await http(app)
      .post(`/api/clip-jobs/${created.body.id}/concepts`)
      .set(auth(adminToken))
      .expect(201);

    expect(spy).toHaveBeenCalledTimes(1);
    const content = String(spy.mock.calls[0][0].content);
    expect(content).toContain(
      '- เสียงจากลูกค้าตัวจริง (สารตั้งต้นหาไอเดียคอนเทนต์',
    );
    // ปรัชญา CEO: insight ไม่ใช่คำชม — ห้ามอ้าง "ลูกค้าชมว่า" + ข้ามได้ถ้าไม่น่าสนใจ
    expect(content).toContain('ห้ามเขียนบทแนว "ลูกค้าชมว่า/รีวิวบอกว่า"');
    expect(content).toContain('ให้ข้ามไปเลย ไม่ต้องฝืนใช้');
    expect(content).toContain('  1. "ซึมไวมาก ไม่เหนียวเลย ใช้ 3 วันหน้าใสขึ้น"');
    expect(content).toContain('  2. "ของดีเกินราคา ซื้อซ้ำรอบสามแล้วค่ะ"');
    // โจทย์ระดับ job เดิมยังอยู่ครบ (ไม่โดนบล็อกรีวิวเบียด)
    expect(content).toContain('- โจทย์ของคลิปนี้: มุมที่ตี เน้นหน้าร้อน');
  });
});
