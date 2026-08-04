import { INestApplication, BadRequestException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AiClaudeService } from '../src/ai/ai-claude.service';
import type { ClaudeCallResult } from '../src/ai/ai-claude.service';
import { assertSafeImportUrl } from '../src/assets/import-url.util';
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

// Product Review Brief — ข้อมูลรีวิวบนตัวสินค้า (กรอกครั้งเดียว ใช้ทุก Clip Job)
// ครอบคลุม: PATCH reviewBrief roundtrip (+sanitize), AI extract (stub — ห้ามแตะ AI จริง),
// SSRF guard ของ /assets/import-url, subjectBrief ระดับ job ของ job สินค้า,
// และ subjectPromptLines ต้องแนบ brief + social proof + โจทย์ job เข้า prompt
describe('Product Review Brief (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let adminToken: string;
  let researcherToken: string; // ไม่มีสิทธิ์ product C / asset C → 403
  let productId: string;

  const CANNED_BRIEF = {
    highlights: ['ซึมไว ไม่เหนียว', 'มี Niacinamide 5%'],
    specs: 'เซรั่มเนื้อน้ำ มี Niacinamide 5% + Zinc',
    targetAudience: 'สาวออฟฟิศผิวแพ้ง่าย 25-35',
    painPoint: 'ผิวหมองคล้ำ เป็นสิวง่าย',
    howToUse: ['ล้างหน้าให้สะอาด', 'หยด 2-3 หยด ทาเช้า-เย็น'],
    promo: 'ลด 40% เหลือ 259.-',
    cautions: 'ห้ามเคลมรักษาสิว',
    extraNote: 'มี 3 สูตรให้เลือก',
  };

  const CANNED_CONCEPTS = {
    concepts: [1, 2, 3].map((i) => ({
      name: `🧪 คอนเซปต์ ${i}`,
      fit: '🎯 เหมาะกับ: สายรีวิวจริงใจ',
      flow: '🎬 เปิด → 🖐️ ลอง → 🛒 ปิด',
      highlight: '💡 จุดเด่น: เล่าจากปัญหาจริง',
    })),
  };

  function stubClaude(parsed: Record<string, unknown> = CANNED_BRIEF): jest.SpyInstance {
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
      .send({ name: 'เซรั่มทดสอบ Review Brief', price: 359 })
      .expect(201);
    productId = res.body.id;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  // ── 1) PATCH reviewBrief roundtrip + sanitize ────────────────────────────
  it('PATCH /products/:id reviewBrief → sanitized roundtrip (trim + cap 20 items)', async () => {
    const dirty = {
      highlights: [
        '  ซึมไว  ',
        '',
        '   ',
        ...Array.from({ length: 30 }, (_, i) => `ข้อ ${i + 1}`),
      ],
      specs: '  Niacinamide 5%  ',
      targetAudience: 'สาวออฟฟิศ',
      painPoint: '',
      howToUse: ['  ล้างหน้า ', ' ทาเช้าเย็น  '],
      promo: 'ลด 40%',
      cautions: '',
      extraNote: '',
    };
    await http(app)
      .patch(`/api/products/${productId}`)
      .set(auth(adminToken))
      .send({ reviewBrief: dirty })
      .expect(200);

    const res = await http(app).get(`/api/products/${productId}`).set(auth(adminToken)).expect(200);
    const brief = res.body.reviewBrief;
    expect(brief.highlights[0]).toBe('ซึมไว'); // trimmed + ตัดค่าว่าง
    expect(brief.highlights.length).toBe(20); // cap 20 รายการ
    expect(brief.specs).toBe('Niacinamide 5%');
    expect(brief.howToUse).toEqual(['ล้างหน้า', 'ทาเช้าเย็น']);

    // list ก็ต้องแนบ reviewBrief มาด้วย (การ์ดใช้โชว์ badge 📋)
    const list = await http(app)
      .get(`/api/products?q=${encodeURIComponent('Review Brief')}`)
      .set(auth(adminToken))
      .expect(200);
    const row = list.body.items.find((p: { id: string }) => p.id === productId);
    expect(row?.reviewBrief?.specs).toBe('Niacinamide 5%');
  });

  it('PATCH reviewBrief: null ล้างทิ้ง / researcher (ไม่มี product C) → 403', async () => {
    await http(app)
      .patch(`/api/products/${productId}`)
      .set(auth(researcherToken))
      .send({ reviewBrief: CANNED_BRIEF })
      .expect(403);

    await http(app)
      .patch(`/api/products/${productId}`)
      .set(auth(adminToken))
      .send({ reviewBrief: null })
      .expect(200);
    const res = await http(app).get(`/api/products/${productId}`).set(auth(adminToken)).expect(200);
    expect(res.body.reviewBrief).toBeNull();
  });

  // ── 2) AI extract (stubbed) ──────────────────────────────────────────────
  it('POST /products/:id/review-brief/extract (stubbed AI) → { brief, usage } และไม่ auto-save', async () => {
    const spy = stubClaude();
    const res = await http(app)
      .post(`/api/products/${productId}/review-brief/extract`)
      .set(auth(adminToken))
      .send({ text: 'เซรั่ม Niacinamide 5% ลด 40% เหลือ 259 บาท ส่งฟรี' })
      .expect(201);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0].action).toBe('product_review_brief_extract');
    expect(res.body.brief.highlights).toEqual(CANNED_BRIEF.highlights);
    expect(res.body.usage).toEqual({ inputTokens: 10, outputTokens: 20 });

    // ไม่ auto-save — reviewBrief บนตัวสินค้ายังเป็น null (เคลียร์ไว้จาก test ก่อนหน้า)
    const product = await http(app).get(`/api/products/${productId}`).set(auth(adminToken)).expect(200);
    expect(product.body.reviewBrief).toBeNull();
  });

  it('extract: text ว่าง + ไม่มีรูป → 400 / researcher → 403', async () => {
    const spy = stubClaude();
    await http(app)
      .post(`/api/products/${productId}/review-brief/extract`)
      .set(auth(adminToken))
      .send({ text: '   ' })
      .expect(400);
    expect(spy).not.toHaveBeenCalled();

    await http(app)
      .post(`/api/products/${productId}/review-brief/extract`)
      .set(auth(researcherToken))
      .send({ text: 'ข้อความ' })
      .expect(403);
  });

  // ── 3) /assets/import-url — SSRF guard (ตกก่อนยิง network) ──────────────
  it('POST /assets/import-url ปฏิเสธ non-https และ private host', async () => {
    const post = (url: string) =>
      http(app)
        .post('/api/assets/import-url')
        .set(auth(adminToken))
        .send({ url, entityType: 'product', entityId: productId });

    await post('http://example.com/pic.png').expect(400); // ไม่ใช่ https
    await post('https://127.0.0.1/pic.png').expect(400); // loopback
    await post('https://localhost/pic.png').expect(400);
    await post('https://192.168.1.5/pic.png').expect(400); // private
    await post('https://169.254.169.254/latest/meta-data').expect(400); // cloud metadata
    await post('not-a-url').expect(400);

    // researcher ไม่มีสิทธิ์ asset C
    await http(app)
      .post('/api/assets/import-url')
      .set(auth(researcherToken))
      .send({ url: 'https://example.com/pic.png', entityType: 'product', entityId: productId })
      .expect(403);
  });

  it('assertSafeImportUrl (unit): ครอบ private ranges ครบ', () => {
    expect(assertSafeImportUrl('https://cdn.example.com/a.png')).toBeInstanceOf(URL);
    const bad = [
      'http://example.com/a.png',
      'https://10.0.0.8/a.png',
      'https://172.16.0.1/a.png',
      'https://172.31.255.1/a.png',
      'https://0.0.0.0/a.png',
      'https://[::1]/a.png',
      'https://app.localhost/a.png',
      'ftp://example.com/a.png',
      'ไม่ใช่ลิงก์',
    ];
    for (const url of bad) {
      expect(() => assertSafeImportUrl(url)).toThrow(BadRequestException);
    }
    // ขอบเขต 172.x — 172.32.x ไม่ใช่ private ต้องผ่าน
    expect(assertSafeImportUrl('https://172.32.0.1/a.png')).toBeInstanceOf(URL);
  });

  // ── 4) Clip Job สินค้า + subjectBrief (โจทย์ระดับ job) ───────────────────
  it('POST /clip-jobs productId + subjectBrief → เก็บเฉพาะ angle/promo/note และ PATCH ได้', async () => {
    const created = await http(app)
      .post('/api/clip-jobs')
      .set(auth(adminToken))
      .send({
        subjectType: 'product',
        productId,
        subjectBrief: {
          angle: 'เน้นใช้ก่อนออกแดด',
          promo: '9.9 ลดเหลือ 199.-',
          note: 'โทนตลก ๆ',
          name: 'ต้องถูกตัดทิ้ง', // job สินค้าไม่เก็บ key อื่นนอกจาก angle/promo/note
          highlights: ['ต้องถูกตัดทิ้ง'],
        },
      })
      .expect(201);
    const jobId = created.body.id;
    expect(created.body.subjectBrief).toEqual({
      angle: 'เน้นใช้ก่อนออกแดด',
      promo: '9.9 ลดเหลือ 199.-',
      note: 'โทนตลก ๆ',
    });

    // PATCH subjectBrief ของ job สินค้า (เดิม 400 — ตอนนี้ต้องแก้ได้)
    await http(app)
      .patch(`/api/clip-jobs/${jobId}`)
      .set(auth(adminToken))
      .send({ subjectBrief: { angle: 'มุมใหม่', promo: '', note: '' } })
      .expect(200);
    const detail = await http(app).get(`/api/clip-jobs/${jobId}`).set(auth(adminToken)).expect(200);
    expect(detail.body.subjectBrief).toEqual({ angle: 'มุมใหม่' });
  });

  // ── 5) subjectPromptLines — brief + social proof + โจทย์ job เข้า prompt ──
  it('POST /clip-jobs/:id/concepts (stubbed) — prompt มีบรรทัด Review Brief/Social proof/โจทย์', async () => {
    // เติม brief + social proof fields (shopName/rating/soldMonth มาจาก import — เซ็ตตรงใน DB)
    await http(app)
      .patch(`/api/products/${productId}`)
      .set(auth(adminToken))
      .send({ reviewBrief: CANNED_BRIEF })
      .expect(200);
    await prisma.product.update({
      where: { id: productId },
      data: { shopName: 'ร้านทดสอบ', rating: 4.9, soldMonth: 1200 },
    });

    const created = await http(app)
      .post('/api/clip-jobs')
      .set(auth(adminToken))
      .send({
        subjectType: 'product',
        productId,
        subjectBrief: { angle: 'เน้นหน้าร้อน', promo: 'ลดเหลือ 199.-' },
      })
      .expect(201);

    const spy = stubClaude(CANNED_CONCEPTS);
    await http(app)
      .post(`/api/clip-jobs/${created.body.id}/concepts`)
      .set(auth(adminToken))
      .expect(201);

    expect(spy).toHaveBeenCalledTimes(1);
    const content = String(spy.mock.calls[0][0].content);
    expect(content).toContain('- จุดเด่น/USP: ซึมไว ไม่เหนียว, มี Niacinamide 5%');
    expect(content).toContain('- สรรพคุณ/สเปก: เซรั่มเนื้อน้ำ มี Niacinamide 5% + Zinc');
    expect(content).toContain('- กลุ่มเป้าหมาย: สาวออฟฟิศผิวแพ้ง่าย 25-35 / ปัญหาที่แก้: ผิวหมองคล้ำ เป็นสิวง่าย');
    expect(content).toContain('- วิธีใช้: 1. ล้างหน้าให้สะอาด 2. หยด 2-3 หยด ทาเช้า-เย็น');
    expect(content).toContain('- โปรโมชั่น: ลด 40% เหลือ 259.-');
    expect(content).toContain('- ข้อควรระวังเพิ่มเติม: ห้ามเคลมรักษาสิว');
    expect(content).toContain('- Social proof: ร้าน ร้านทดสอบ · เรตติ้ง 4.9 · ขาย 1,200 ชิ้น/เดือน (ใช้เป็น hook ได้)');
    expect(content).toContain('- โจทย์ของคลิปนี้: มุมที่ตี เน้นหน้าร้อน / โปรช่วงนี้ ลดเหลือ 199.-');
  });
});
