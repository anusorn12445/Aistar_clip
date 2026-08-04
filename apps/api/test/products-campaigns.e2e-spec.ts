import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  RESEARCHER_EMAIL,
  RESEARCHER_PASSWORD,
  auth,
  createApp,
  createUserWithRoles,
  ensureResearcher,
  http,
  loginAs,
} from './utils';

const PLANNER_EMAIL = 'pc-planner@aistar.test';
const PLANNER_PASSWORD = 'pc-planner-2026';

// Commerce: brands + products (PRD §9) and campaigns state machine (§11)
describe('Products & campaigns (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let adminToken: string;
  let researcherToken: string;
  let plannerToken: string;
  let brandId: string;
  let cheapId: string;
  let priceyId: string;
  let campaignId: string;
  let characterId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await ensureResearcher(prisma);
    // content_planner: campaign V+C but no A — probes the publish approval gate
    await createUserWithRoles(prisma, PLANNER_EMAIL, PLANNER_PASSWORD, ['content_planner']);
    app = await createApp();
    adminToken = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);
    researcherToken = await loginAs(app, RESEARCHER_EMAIL, RESEARCHER_PASSWORD);
    plannerToken = await loginAs(app, PLANNER_EMAIL, PLANNER_PASSWORD);

    const character = await http(app)
      .post('/api/characters')
      .set(auth(adminToken))
      .send({ nameTh: 'พรีเซนเตอร์ PC', nameEn: 'PcPresenter' })
      .expect(201);
    characterId = character.body.id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('brand + product create → PRD-code, brand linked', async () => {
    const brand = await http(app)
      .post('/api/brands')
      .set(auth(adminToken))
      .send({ name: 'PC e2e Brand', contact: 'line: @pcbrand' })
      .expect(201);
    brandId = brand.body.id;

    const cheap = await http(app)
      .post('/api/products')
      .set(auth(adminToken))
      .send({
        name: 'PC e2e ลิปบาล์ม',
        brandId,
        category: 'beauty',
        claimRiskLevel: 'low',
        price: 99,
      })
      .expect(201);
    cheapId = cheap.body.id;
    expect(cheap.body.displayCode).toMatch(/^PRD-\d{4}$/);
    expect(cheap.body.status).toBe('active');

    const pricey = await http(app)
      .post('/api/products')
      .set(auth(adminToken))
      .send({
        name: 'PC e2e เซรั่มลดริ้วรอย',
        brandId,
        category: 'supplement',
        claimRiskLevel: 'high',
        price: 1590,
        restrictedClaims: ['หายขาด', 'ขาวใน 3 วัน'],
      })
      .expect(201);
    priceyId = pricey.body.id;
    expect(pricey.body.displayCode).toMatch(/^PRD-\d{4}$/);
    expect(pricey.body.displayCode).not.toBe(cheap.body.displayCode);
  });

  it('product filters: category, claimRiskLevel, priceMin/priceMax', async () => {
    const byCategory = await http(app)
      .get('/api/products')
      .query({ brandId, category: 'beauty' })
      .set(auth(adminToken))
      .expect(200);
    expect(byCategory.body.items.map((p: { id: string }) => p.id)).toEqual([cheapId]);

    const byRisk = await http(app)
      .get('/api/products')
      .query({ brandId, claimRiskLevel: 'high' })
      .set(auth(adminToken))
      .expect(200);
    expect(byRisk.body.items.map((p: { id: string }) => p.id)).toEqual([priceyId]);

    const byPrice = await http(app)
      .get('/api/products')
      .query({ brandId, priceMin: 500, priceMax: 2000 })
      .set(auth(adminToken))
      .expect(200);
    expect(byPrice.body.items.map((p: { id: string }) => p.id)).toEqual([priceyId]);

    const none = await http(app)
      .get('/api/products')
      .query({ brandId, priceMax: 50 })
      .set(auth(adminToken))
      .expect(200);
    expect(none.body.total).toBe(0);
  });

  it('product status machine: active↔paused→discontinued, discontinued is terminal', async () => {
    const paused = await http(app)
      .patch(`/api/products/${cheapId}/status`)
      .set(auth(adminToken))
      .send({ status: 'paused' })
      .expect(200);
    expect(paused.body.status).toBe('paused');

    await http(app)
      .patch(`/api/products/${cheapId}/status`)
      .set(auth(adminToken))
      .send({ status: 'active' })
      .expect(200);

    await http(app)
      .patch(`/api/products/${cheapId}/status`)
      .set(auth(adminToken))
      .send({ status: 'discontinued' })
      .expect(200);

    await http(app)
      .patch(`/api/products/${cheapId}/status`)
      .set(auth(adminToken))
      .send({ status: 'active' })
      .expect(400);
  });

  it('campaign create → CMP-code, brief status; link character + product', async () => {
    const res = await http(app)
      .post('/api/campaigns')
      .set(auth(adminToken))
      .send({ name: 'PC e2e Q3 Launch', objective: 'gmv' })
      .expect(201);
    campaignId = res.body.id;
    expect(res.body.displayCode).toMatch(/^CMP-\d{4}$/);
    expect(res.body.status).toBe('brief');

    await http(app)
      .post(`/api/campaigns/${campaignId}/characters`)
      .set(auth(adminToken))
      .send({ characterId })
      .expect(201);
    await http(app)
      .post(`/api/campaigns/${campaignId}/products`)
      .set(auth(adminToken))
      .send({ productId: priceyId })
      .expect(201);

    const detail = await http(app)
      .get(`/api/campaigns/${campaignId}`)
      .set(auth(adminToken))
      .expect(200);
    expect(detail.body.characters.map((c: { id: string }) => c.id)).toEqual([characterId]);
    expect(detail.body.products.map((p: { id: string }) => p.id)).toEqual([priceyId]);
  });

  it('campaign status machine walks brief→planning→production→review; skips are 400', async () => {
    await http(app)
      .patch(`/api/campaigns/${campaignId}/status`)
      .set(auth(adminToken))
      .send({ status: 'published' })
      .expect(400); // brief → published skips the machine

    for (const status of ['planning', 'production', 'review']) {
      const res = await http(app)
        .patch(`/api/campaigns/${campaignId}/status`)
        .set(auth(adminToken))
        .send({ status })
        .expect(200);
      expect(res.body.status).toBe(status);
    }
  });

  it('review→published requires Approve: researcher 403 (guard), planner 403 (no A), admin ok', async () => {
    await http(app)
      .patch(`/api/campaigns/${campaignId}/status`)
      .set(auth(researcherToken))
      .send({ status: 'published' })
      .expect(403);

    await http(app)
      .patch(`/api/campaigns/${campaignId}/status`)
      .set(auth(plannerToken))
      .send({ status: 'published' })
      .expect(403);

    const res = await http(app)
      .patch(`/api/campaigns/${campaignId}/status`)
      .set(auth(adminToken))
      .send({ status: 'published' })
      .expect(200);
    expect(res.body.status).toBe('published');
  });

  it('archive: published→archived sets archivedAt and hides from list', async () => {
    const res = await http(app)
      .patch(`/api/campaigns/${campaignId}/status`)
      .set(auth(adminToken))
      .send({ status: 'archived' })
      .expect(200);
    expect(res.body.archivedAt).not.toBeNull();

    const list = await http(app)
      .get('/api/campaigns')
      .query({ q: 'PC e2e Q3 Launch' })
      .set(auth(adminToken))
      .expect(200);
    expect(list.body.items.map((c: { id: string }) => c.id)).not.toContain(campaignId);
  });
});
