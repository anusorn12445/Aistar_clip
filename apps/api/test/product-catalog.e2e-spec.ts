import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
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

// Brand & Product-category management (CEO: จัดการแบรนด์ + หมวดหมู่สินค้า)
describe('Product catalog: categories & brands (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let adminToken: string;
  let researcherToken: string; // product V only — no C

  beforeAll(async () => {
    prisma = new PrismaClient();
    await ensureResearcher(prisma);
    app = await createApp();
    adminToken = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);
    researcherToken = await loginAs(app, RESEARCHER_EMAIL, RESEARCHER_PASSWORD);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('lists 7 builtin categories with keys/labels and productCount', async () => {
    const res = await http(app)
      .get('/api/categories')
      .set(auth(adminToken))
      .expect(200);
    const keys = res.body.map((c: { key: string }) => c.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        'fashion',
        'beauty',
        'food',
        'supplement',
        'home',
        'gadget',
        'other',
      ]),
    );
    const beauty = res.body.find((c: { key: string }) => c.key === 'beauty');
    expect(beauty).toMatchObject({ builtin: true, status: 'active' });
    expect(typeof beauty.productCount).toBe('number');
    // sorted by sortOrder → fashion(0) first
    expect(res.body[0].key).toBe('fashion');
  });

  it('creates a category from ascii label → slug key', async () => {
    const res = await http(app)
      .post('/api/categories')
      .set(auth(adminToken))
      .send({ label: 'Premium Goods' })
      .expect(201);
    expect(res.body.key).toBe('premium-goods');
    expect(res.body.label).toBe('Premium Goods');
    expect(res.body.builtin).toBe(false);
    expect(res.body.productCount).toBe(0);
  });

  it('creates a category from pure-Thai label → cat_ fallback key + uniqueness', async () => {
    const a = await http(app)
      .post('/api/categories')
      .set(auth(adminToken))
      .send({ label: 'ของพรีเมียม' })
      .expect(201);
    expect(a.body.key).toMatch(/^cat_[a-f0-9]{8}$/);

    // same Thai label again → different key (uniqueness holds, no clash)
    const b = await http(app)
      .post('/api/categories')
      .set(auth(adminToken))
      .send({ label: 'ของพรีเมียม' })
      .expect(201);
    expect(b.body.key).toMatch(/^cat_[a-f0-9]{8}$/);
    expect(b.body.key).not.toBe(a.body.key);
  });

  it('PATCH label keeps key immutable; can archive', async () => {
    const created = await http(app)
      .post('/api/categories')
      .set(auth(adminToken))
      .send({ label: 'Gift Sets' })
      .expect(201);
    const id = created.body.id;
    const key = created.body.key;

    const patched = await http(app)
      .patch(`/api/categories/${id}`)
      .set(auth(adminToken))
      .send({ label: 'Gift Bundles', status: 'archived' })
      .expect(200);
    expect(patched.body.key).toBe(key); // key never changes
    expect(patched.body.label).toBe('Gift Bundles');
    expect(patched.body.status).toBe('archived');

    // archived drops from active-only list
    const active = await http(app)
      .get('/api/categories')
      .query({ status: 'active' })
      .set(auth(adminToken))
      .expect(200);
    expect(active.body.map((c: { id: string }) => c.id)).not.toContain(id);
  });

  it('builtin category cannot be deleted (400)', async () => {
    const list = await http(app)
      .get('/api/categories')
      .set(auth(adminToken))
      .expect(200);
    const builtin = list.body.find((c: { key: string }) => c.key === 'fashion');
    await http(app)
      .delete(`/api/categories/${builtin.id}`)
      .set(auth(adminToken))
      .expect(400);
  });

  it('in-use category cannot be deleted (409) but can be archived', async () => {
    const cat = await http(app)
      .post('/api/categories')
      .set(auth(adminToken))
      .send({ label: 'In Use Cat' })
      .expect(201);

    const product = await http(app)
      .post('/api/products')
      .set(auth(adminToken))
      .send({ name: 'ใช้หมวดนี้', category: cat.body.key })
      .expect(201);

    // productCount reflects the linked product
    const listed = await http(app)
      .get('/api/categories')
      .set(auth(adminToken))
      .expect(200);
    expect(
      listed.body.find((c: { id: string }) => c.id === cat.body.id).productCount,
    ).toBe(1);

    // delete blocked with 409
    await http(app)
      .delete(`/api/categories/${cat.body.id}`)
      .set(auth(adminToken))
      .expect(409);

    // archive works as the escape hatch
    await http(app)
      .patch(`/api/categories/${cat.body.id}`)
      .set(auth(adminToken))
      .send({ status: 'archived' })
      .expect(200);

    // cleanup product so it doesn't leak into other counts
    await http(app)
      .post(`/api/products/${product.body.id}/archive`)
      .set(auth(adminToken))
      .expect(201);
  });

  it('product create rejects unknown category (400)', async () => {
    await http(app)
      .post('/api/products')
      .set(auth(adminToken))
      .send({ name: 'หมวดมั่ว', category: 'does-not-exist' })
      .expect(400);
  });

  it('brands include productCount and delete-guard 409 when in use', async () => {
    const brand = await http(app)
      .post('/api/brands')
      .set(auth(adminToken))
      .send({ name: 'Catalog e2e Brand' })
      .expect(201);

    await http(app)
      .post('/api/products')
      .set(auth(adminToken))
      .send({ name: 'สินค้าแบรนด์นี้', brandId: brand.body.id })
      .expect(201);

    const list = await http(app)
      .get('/api/brands')
      .query({ q: 'Catalog e2e Brand' })
      .set(auth(adminToken))
      .expect(200);
    expect(
      list.body.find((b: { id: string }) => b.id === brand.body.id).productCount,
    ).toBe(1);

    // in-use brand → 409
    await http(app)
      .delete(`/api/brands/${brand.body.id}`)
      .set(auth(adminToken))
      .expect(409);
  });

  it('empty brand can be deleted; category delete works when unused', async () => {
    const brand = await http(app)
      .post('/api/brands')
      .set(auth(adminToken))
      .send({ name: 'Empty Brand' })
      .expect(201);
    await http(app)
      .delete(`/api/brands/${brand.body.id}`)
      .set(auth(adminToken))
      .expect(200);

    const cat = await http(app)
      .post('/api/categories')
      .set(auth(adminToken))
      .send({ label: 'Disposable Cat' })
      .expect(201);
    await http(app)
      .delete(`/api/categories/${cat.body.id}`)
      .set(auth(adminToken))
      .expect(200);
  });

  it('V-only role gets 403 on category/brand writes', async () => {
    await http(app)
      .post('/api/categories')
      .set(auth(researcherToken))
      .send({ label: 'ไม่ควรได้' })
      .expect(403);

    // researcher can still read
    await http(app)
      .get('/api/categories')
      .set(auth(researcherToken))
      .expect(200);
  });
});
