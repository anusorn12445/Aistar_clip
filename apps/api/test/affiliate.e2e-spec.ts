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

// Affiliate Content Factory (Phase 1).
// e2e MUST NOT call live AI — ANTHROPIC_API_KEY is blanked in test-env, so the
// real Claude path 503s. For persistence/guardrail assertions we stub
// AiClaudeService.callClaude with a canned structured result and spy on its args.
describe('Affiliate Content Factory (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let adminToken: string;
  let researcherToken: string; // no content permission → 403 on generate

  let affiliateProductId: string; // product with restrictedClaims (guardrail probe)
  let plainProductId: string; // isAffiliate=false → review 400

  const CANNED = {
    hook: 'ผิวโทรมมา 3 ปี ลองตัวนี้แล้วเปลี่ยนใจ',
    body: 'เนื้อบางเบา ซึมไว ใช้แล้วรู้สึกผิวนุ่มขึ้น เหมาะกับคนผิวแพ้ง่าย',
    cta: 'กดลิงก์ในโพสต์เพื่อสั่งซื้อได้เลย',
    shots: [
      { scene: 'แกะกล่อง', camera: 'product_close_up', action: 'โชว์แพ็กเกจ', dialogue: '' },
      { scene: 'ทาลงผิว', camera: 'close_up', action: 'ทาครีมที่หลังมือ', dialogue: 'เนื้อบางมาก' },
      { scene: 'สรุป', camera: 'medium', action: 'พูดปิดท้าย', dialogue: 'ลองเลย' },
    ],
    caption: 'รีวิวจริงจากคนใช้จริง ผิวนุ่มขึ้นจริง ๆ นะ 😍',
    hashtags: ['#รีวิวสกินแคร์', '#ครีมบำรุง', '#skincare', '#ผิวแพ้ง่าย', '#affiliate', '#ของดีบอกต่อ', '#beauty', '#สกินแคร์'],
  };

  // canned result ที่ "สะอาด" (ไม่มี restricted claim) — ใช้ตอน assert persistence
  function stubCallClaude(): jest.SpyInstance {
    const svc = app.get(AiClaudeService);
    return jest.spyOn(svc, 'callClaude').mockImplementation(
      async () =>
        ({
          parsed: CANNED,
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

    // affiliate product with a restrictedClaim → guardrail must feed it into the prompt
    const affiliate = await http(app)
      .post('/api/products')
      .set(auth(adminToken))
      .send({
        name: 'ครีมบำรุงหน้าใส AISTAR',
        category: 'beauty',
        price: 590,
        salePrice: 390,
        isAffiliate: true,
        affiliatePlatform: 'shopee',
        affiliateUrl: 'https://shope.ee/aistar-cream',
        commissionPct: 12.5,
        claimRiskLevel: 'high',
        restrictedClaims: ['ขาวใน 7 วัน'],
      })
      .expect(201);
    affiliateProductId = affiliate.body.id;
    expect(affiliate.body.isAffiliate).toBe(true);
    expect(affiliate.body.affiliatePlatform).toBe('shopee');
    expect(affiliate.body.commissionPct).toBe(12.5);

    const plain = await http(app)
      .post('/api/products')
      .set(auth(adminToken))
      .send({ name: 'สินค้าธรรมดาไม่ใช่ affiliate' })
      .expect(201);
    plainProductId = plain.body.id;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  // ── validation ──────────────────────────────────────────────

  it('product create rejects commissionPct > 100 (400)', async () => {
    await http(app)
      .post('/api/products')
      .set(auth(adminToken))
      .send({ name: 'คอมเกิน', isAffiliate: true, commissionPct: 150 })
      .expect(400);
  });

  it('product create rejects a non-URL affiliateUrl (400)', async () => {
    await http(app)
      .post('/api/products')
      .set(auth(adminToken))
      .send({ name: 'ลิงก์มั่ว', isAffiliate: true, affiliateUrl: 'not a url' })
      .expect(400);
  });

  it('product create rejects an unknown affiliatePlatform (400)', async () => {
    await http(app)
      .post('/api/products')
      .set(auth(adminToken))
      .send({ name: 'แพลตฟอร์มมั่ว', isAffiliate: true, affiliatePlatform: 'amazon' })
      .expect(400);
  });

  it('GET /products?isAffiliate=1 returns only affiliate products with hasAffiliateContent flag', async () => {
    const res = await http(app)
      .get('/api/products?isAffiliate=1')
      .set(auth(adminToken))
      .expect(200);
    const ids = res.body.items.map((p: { id: string }) => p.id);
    expect(ids).toContain(affiliateProductId);
    expect(ids).not.toContain(plainProductId);
    const row = res.body.items.find((p: { id: string }) => p.id === affiliateProductId);
    expect(row).toHaveProperty('hasAffiliateContent');
    expect(typeof row.hasAffiliateContent).toBe('boolean');
  });

  // ── permission ──────────────────────────────────────────────

  it('review without content:C → 403', async () => {
    await http(app)
      .post('/api/ai/affiliate/review')
      .set(auth(researcherToken))
      .send({ productId: affiliateProductId })
      .expect(403);
  });

  // ── graceful degradation (no ANTHROPIC_API_KEY, no stub) ─────

  it('review reaches Claude call and 503s when key is unset', async () => {
    const res = await http(app)
      .post('/api/ai/affiliate/review')
      .set(auth(adminToken))
      .send({ productId: affiliateProductId })
      .expect(503);
    expect(res.body.message).toContain('ANTHROPIC_API_KEY');
  });

  it('review on a non-affiliate product → 400 (before touching Claude)', async () => {
    await http(app)
      .post('/api/ai/affiliate/review')
      .set(auth(adminToken))
      .send({ productId: plainProductId })
      .expect(400);
  });

  // ── guardrail + persistence (stubbed AI result) ─────────────

  it('review feeds restrictedClaims + claimRiskLevel into the prompt and persists a ContentItem', async () => {
    const spy = stubCallClaude();

    const res = await http(app)
      .post('/api/ai/affiliate/review')
      .set(auth(adminToken))
      .send({ productId: affiliateProductId, platform: 'facebook' })
      .expect(201);

    // prompt (system) carried the guardrail terms
    expect(spy).toHaveBeenCalled();
    const firstArg = spy.mock.calls[0][0] as { system: string };
    expect(firstArg.system).toContain('GUARDRAILS');
    expect(firstArg.system).toContain('ขาวใน 7 วัน'); // restrictedClaim fed verbatim
    expect(firstArg.system).toContain('high'); // claimRiskLevel fed

    // persisted ContentItem shape
    const item = res.body.item;
    expect(item.sourceType).toBe('affiliate');
    expect(item.productId).toBe(affiliateProductId);
    expect(item.platform).toBe('facebook');
    expect(item.status).toBe('idea');
    expect(item.caption).toBe(CANNED.caption);
    expect(item.hook).toBe(CANNED.hook);
    expect(item.hashtags).toEqual(CANNED.hashtags);
    expect(item.affiliateUrlSnapshot).toBe('https://shope.ee/aistar-cream');
    expect(item.scriptJson.shots).toHaveLength(3);

    // list endpoint now returns it; product now flags hasAffiliateContent
    const list = await http(app)
      .get(`/api/ai/affiliate/content?productId=${affiliateProductId}`)
      .set(auth(adminToken))
      .expect(200);
    expect(list.body.items.length).toBeGreaterThanOrEqual(1);

    const prod = await http(app)
      .get('/api/products?isAffiliate=1')
      .set(auth(adminToken))
      .expect(200);
    const row = prod.body.items.find((p: { id: string }) => p.id === affiliateProductId);
    expect(row.hasAffiliateContent).toBe(true);
  });

  it('regenerate updates the existing ContentItem instead of creating a new one', async () => {
    stubCallClaude();
    // first ensure at least one exists
    await http(app)
      .post('/api/ai/affiliate/review')
      .set(auth(adminToken))
      .send({ productId: affiliateProductId })
      .expect(201);

    const before = await prisma.contentItem.count({
      where: { sourceType: 'affiliate', productId: affiliateProductId, archivedAt: null },
    });

    const res = await http(app)
      .post('/api/ai/affiliate/review')
      .set(auth(adminToken))
      .send({ productId: affiliateProductId, regenerate: true })
      .expect(201);
    expect(res.body.regenerated).toBe(true);

    const after = await prisma.contentItem.count({
      where: { sourceType: 'affiliate', productId: affiliateProductId, archivedAt: null },
    });
    expect(after).toBe(before); // updated in place, not appended
  });

  it('batch by category generates for missing affiliate products and reports counts', async () => {
    stubCallClaude();

    // fresh affiliate product in its own category so counts are deterministic
    // sortOrder high so this throwaway category doesn't disturb other suites'
    // "fashion sorts first" assertions (categories share one DB across suites)
    const cat = await http(app)
      .post('/api/categories')
      .set(auth(adminToken))
      .send({ label: 'Batch Cat', sortOrder: 999 })
      .expect(201);
    const p1 = await http(app)
      .post('/api/products')
      .set(auth(adminToken))
      .send({ name: 'สินค้า batch 1', category: cat.body.key, isAffiliate: true })
      .expect(201);

    const res = await http(app)
      .post('/api/ai/affiliate/batch')
      .set(auth(adminToken))
      .send({ categoryKey: cat.body.key, onlyMissing: true })
      .expect(201);
    expect(res.body.generated).toBe(1);
    expect(res.body.failed).toBe(0);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].productId).toBe(p1.body.id);

    // running again with onlyMissing skips the now-generated product
    const again = await http(app)
      .post('/api/ai/affiliate/batch')
      .set(auth(adminToken))
      .send({ categoryKey: cat.body.key, onlyMissing: true })
      .expect(201);
    expect(again.body.generated).toBe(0);
    expect(again.body.skipped).toBe(1);
  });

  it('batch with neither categoryKey nor productIds → 400', async () => {
    stubCallClaude();
    await http(app)
      .post('/api/ai/affiliate/batch')
      .set(auth(adminToken))
      .send({ onlyMissing: true })
      .expect(400);
  });
});
