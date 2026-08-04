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

// Product Tie-Ins (ไม่บังคับ) — ผูกสินค้าจริงกับ character / series / location
// permission ต่อ entity: character → `character`, series → `episode`, location → `location`
// researcher = character V only (no C, no episode, no location) → ใช้ทดสอบ 403
describe('Product Tie-Ins (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let adminToken: string;
  let researcherToken: string;

  let productA: string;
  let productB: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await ensureResearcher(prisma);
    app = await createApp();
    adminToken = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);
    researcherToken = await loginAs(app, RESEARCHER_EMAIL, RESEARCHER_PASSWORD);

    productA = (
      await http(app)
        .post('/api/products')
        .set(auth(adminToken))
        .send({ name: 'ครีมกันแดด Tie-In A' })
        .expect(201)
    ).body.id;
    productB = (
      await http(app)
        .post('/api/products')
        .set(auth(adminToken))
        .send({ name: 'เซรั่ม Tie-In B' })
        .expect(201)
    ).body.id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('sets tie-in products (with note) on a character; detail + GET include them', async () => {
    const character = (
      await http(app)
        .post('/api/characters')
        .set(auth(adminToken))
        .send({ nameTh: 'ตัวละคร Tie-In', oneLineConcept: 'AI Talent' })
        .expect(201)
    ).body;

    const put = await http(app)
      .put(`/api/characters/${character.id}/tie-in-products`)
      .set(auth(adminToken))
      .send({
        items: [
          { productId: productA, note: 'ตัวเอกใช้ประจำ' },
          { productId: productB },
        ],
      })
      .expect(200);
    expect(put.body).toHaveLength(2);
    const a = put.body.find((l: { productId: string }) => l.productId === productA);
    expect(a).toMatchObject({ note: 'ตัวเอกใช้ประจำ' });
    expect(a.product).toMatchObject({ id: productA, displayCode: expect.any(String) });

    // GET link endpoint
    const links = await http(app)
      .get(`/api/characters/${character.id}/tie-in-products`)
      .set(auth(adminToken))
      .expect(200);
    expect(links.body.map((l: { productId: string }) => l.productId).sort()).toEqual(
      [productA, productB].sort(),
    );

    // detail GET includes tieInProducts
    const detail = await http(app)
      .get(`/api/characters/${character.id}`)
      .set(auth(adminToken))
      .expect(200);
    expect(detail.body.tieInProducts).toHaveLength(2);
  });

  it('replaces the whole set on a character (PUT is replace, dedupe last-wins)', async () => {
    const character = (
      await http(app)
        .post('/api/characters')
        .set(auth(adminToken))
        .send({ nameTh: 'ตัวละครแทนที่ Tie-In' })
        .expect(201)
    ).body;

    await http(app)
      .put(`/api/characters/${character.id}/tie-in-products`)
      .set(auth(adminToken))
      .send({ items: [{ productId: productA }, { productId: productB }] })
      .expect(200);

    // replace with just B, and a duplicate B with a note (last-wins dedupe)
    const replaced = await http(app)
      .put(`/api/characters/${character.id}/tie-in-products`)
      .set(auth(adminToken))
      .send({
        items: [
          { productId: productB },
          { productId: productB, note: 'ทับด้วย note' },
        ],
      })
      .expect(200);
    expect(replaced.body).toHaveLength(1);
    expect(replaced.body[0]).toMatchObject({ productId: productB, note: 'ทับด้วย note' });
  });

  it('unlinks all with an empty set (optional feature)', async () => {
    const character = (
      await http(app)
        .post('/api/characters')
        .set(auth(adminToken))
        .send({ nameTh: 'ตัวละครปลดลิงก์' })
        .expect(201)
    ).body;

    await http(app)
      .put(`/api/characters/${character.id}/tie-in-products`)
      .set(auth(adminToken))
      .send({ items: [{ productId: productA }] })
      .expect(200);

    const cleared = await http(app)
      .put(`/api/characters/${character.id}/tie-in-products`)
      .set(auth(adminToken))
      .send({ items: [] })
      .expect(200);
    expect(cleared.body).toHaveLength(0);

    const detail = await http(app)
      .get(`/api/characters/${character.id}`)
      .set(auth(adminToken))
      .expect(200);
    expect(detail.body.tieInProducts).toHaveLength(0);
  });

  it('sets tie-in products on a series; detail includes them', async () => {
    const series = (
      await http(app)
        .post('/api/series')
        .set(auth(adminToken))
        .send({ name: 'ซีรีส์ Tie-In' })
        .expect(201)
    ).body;

    const put = await http(app)
      .put(`/api/series/${series.id}/tie-in-products`)
      .set(auth(adminToken))
      .send({ items: [{ productId: productA, note: 'สปอนเซอร์หลัก' }] })
      .expect(200);
    expect(put.body).toHaveLength(1);

    const detail = await http(app)
      .get(`/api/series/${series.id}`)
      .set(auth(adminToken))
      .expect(200);
    expect(detail.body.tieInProducts).toHaveLength(1);
    expect(detail.body.tieInProducts[0]).toMatchObject({ productId: productA, note: 'สปอนเซอร์หลัก' });
  });

  it('sets tie-in products on a location; detail includes them', async () => {
    const location = (
      await http(app)
        .post('/api/locations')
        .set(auth(adminToken))
        .send({ name: 'คาเฟ่ Tie-In', type: 'cafe' })
        .expect(201)
    ).body;

    await http(app)
      .put(`/api/locations/${location.id}/tie-in-products`)
      .set(auth(adminToken))
      .send({ items: [{ productId: productB, note: 'วางขายในร้าน' }] })
      .expect(200);

    const detail = await http(app)
      .get(`/api/locations/${location.id}`)
      .set(auth(adminToken))
      .expect(200);
    expect(detail.body.tieInProducts).toHaveLength(1);
    expect(detail.body.tieInProducts[0]).toMatchObject({ productId: productB });
  });

  it('unknown product → Thai 404 (character / series / location)', async () => {
    const ghost = '00000000-0000-0000-0000-000000000000';

    const character = (
      await http(app)
        .post('/api/characters')
        .set(auth(adminToken))
        .send({ nameTh: 'ตัวละคร 404' })
        .expect(201)
    ).body;
    await http(app)
      .put(`/api/characters/${character.id}/tie-in-products`)
      .set(auth(adminToken))
      .send({ items: [{ productId: ghost }] })
      .expect(404);

    const series = (
      await http(app)
        .post('/api/series')
        .set(auth(adminToken))
        .send({ name: 'ซีรีส์ 404' })
        .expect(201)
    ).body;
    await http(app)
      .put(`/api/series/${series.id}/tie-in-products`)
      .set(auth(adminToken))
      .send({ items: [{ productId: ghost }] })
      .expect(404);

    const location = (
      await http(app)
        .post('/api/locations')
        .set(auth(adminToken))
        .send({ name: 'โลเคชัน 404', type: 'street' })
        .expect(201)
    ).body;
    await http(app)
      .put(`/api/locations/${location.id}/tie-in-products`)
      .set(auth(adminToken))
      .send({ items: [{ productId: ghost }] })
      .expect(404);
  });

  it('403 for a role lacking the entity C perm (researcher on character PUT)', async () => {
    const character = (
      await http(app)
        .post('/api/characters')
        .set(auth(adminToken))
        .send({ nameTh: 'ตัวละครสิทธิ์' })
        .expect(201)
    ).body;

    await http(app)
      .put(`/api/characters/${character.id}/tie-in-products`)
      .set(auth(researcherToken))
      .send({ items: [{ productId: productA }] })
      .expect(403);
  });
});
