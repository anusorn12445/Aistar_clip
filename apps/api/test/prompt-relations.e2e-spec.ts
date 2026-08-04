import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  auth,
  createApp,
  createUserWithRoles,
  http,
  loginAs,
} from './utils';

// dev_api = role seed ที่มี prompt: ['V'] อย่างเดียว (ไม่มี C) — ไว้พิสูจน์ 403
const VIEWER_EMAIL = 'prompt-relations-viewer@aistar.test';
const VIEWER_PASSWORD = 'prompt-relations-viewer-2026';

// Prompt Relations — เชื่อม prompt กับ ตัวละคร/สินค้า/ลูกค้า/แบรนด์ (prompt-level UX,
// เก็บจริงเป็น PromptLink ระดับ version): GET รวมทุก version, POST ลง version ล่าสุด,
// DELETE กวาดทุก version, list filter entityType+entityId ครบ 4 ค่าย
describe('Prompt relations (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let token: string;
  let viewerToken: string;

  let promptId: string;
  let v1Id: string;
  let otherPromptId: string; // ไม่ผูกอะไรเลย — ไว้เช็คว่า filter ไม่ติดมาด้วย

  let characterId: string;
  let productId: string;
  let clientId: string;
  let brandId: string;

  beforeAll(async () => {
    app = await createApp();
    prisma = new PrismaClient();
    await createUserWithRoles(prisma, VIEWER_EMAIL, VIEWER_PASSWORD, ['dev_api']);
    token = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);
    viewerToken = await loginAs(app, VIEWER_EMAIL, VIEWER_PASSWORD);

    // prompt หลัก: v1 + v2 (relations ใหม่ต้องลงบน v2 = version ล่าสุด)
    const prompt = await http(app)
      .post('/api/prompts')
      .set(auth(token))
      .send({
        name: 'E2E Relations Main',
        promptType: 'scene',
        body: 'thai presenter holding serum bottle, studio light',
        targetPlatform: 'grok',
      })
      .expect(201);
    promptId = prompt.body.id;
    v1Id = prompt.body.versions[0].id;
    await http(app)
      .post(`/api/prompts/${promptId}/versions`)
      .set(auth(token))
      .send({ body: 'thai presenter holding serum bottle, golden hour', targetPlatform: 'grok' })
      .expect(201);

    const other = await http(app)
      .post('/api/prompts')
      .set(auth(token))
      .send({
        name: 'E2E Relations Unlinked',
        promptType: 'scene',
        body: 'empty scene, no links',
        targetPlatform: 'grok',
      })
      .expect(201);
    otherPromptId = other.body.id;

    // entity ปลายทางครบ 4 ค่าย
    const character = await http(app)
      .post('/api/characters')
      .set(auth(token))
      .send({ nameTh: 'เรลตัวทดสอบ', nameEn: 'RelTest', oneLineConcept: 'ตัวละครทดสอบ relations' })
      .expect(201);
    characterId = character.body.id;

    const brand = await http(app)
      .post('/api/brands')
      .set(auth(token))
      .send({ name: 'E2E Relations Brand' })
      .expect(201);
    brandId = brand.body.id;

    const product = await http(app)
      .post('/api/products')
      .set(auth(token))
      .send({ name: 'E2E Relations เซรั่ม', brandId, category: 'beauty' })
      .expect(201);
    productId = product.body.id;

    const client = await http(app)
      .post('/api/clients')
      .set(auth(token))
      .send({ name: 'E2E Relations Client', type: 'brand' })
      .expect(201);
    clientId = client.body.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  it('POST relation with nonexistent entity → 404 (per type), bad type → 400', async () => {
    const ghost = '00000000-0000-4000-8000-000000000000';
    for (const entityType of ['character', 'product', 'client', 'brand']) {
      await http(app)
        .post(`/api/prompts/${promptId}/relations`)
        .set(auth(token))
        .send({ entityType, entityId: ghost })
        .expect(404);
    }
    await http(app)
      .post(`/api/prompts/${promptId}/relations`)
      .set(auth(token))
      .send({ entityType: 'campaign', entityId: ghost })
      .expect(400);
  });

  it('POST relation → 201 on latest version (v2)', async () => {
    const res = await http(app)
      .post(`/api/prompts/${promptId}/relations`)
      .set(auth(token))
      .send({ entityType: 'character', entityId: characterId })
      .expect(201);
    expect(res.body.entityType).toBe('character');
    expect(res.body.entityId).toBe(characterId);
    expect(res.body.promptVersionId).not.toBe(v1Id); // ต้องเป็น v2 (ล่าสุด) ไม่ใช่ v1
  });

  it('duplicate POST → idempotent, no double link', async () => {
    await http(app)
      .post(`/api/prompts/${promptId}/relations`)
      .set(auth(token))
      .send({ entityType: 'character', entityId: characterId })
      .expect(201);
    const count = await prisma.promptLink.count({
      where: { entityType: 'character', entityId: characterId, promptVersion: { promptId } },
    });
    expect(count).toBe(1);
  });

  it('GET relations aggregates across versions + enriches names', async () => {
    // ผูก product ลง v1 ผ่าน endpoint /links เดิม (ระบุ versionId) — GET ต้องเห็นข้าม version
    await http(app)
      .post(`/api/prompts/${promptId}/links`)
      .set(auth(token))
      .send({ entityType: 'product', entityId: productId, versionId: v1Id })
      .expect(201);

    const res = await http(app)
      .get(`/api/prompts/${promptId}/relations`)
      .set(auth(token))
      .expect(200);
    const byType = new Map(
      (res.body as { entityType: string; entityId: string; name: string; code: string | null }[]).map(
        (r) => [r.entityType, r],
      ),
    );
    expect(byType.get('character')).toMatchObject({
      entityId: characterId,
      name: 'เรลตัวทดสอบ',
    });
    expect(byType.get('character')!.code).toMatch(/^CHR-/);
    expect(byType.get('product')).toMatchObject({
      entityId: productId,
      name: 'E2E Relations เซรั่ม',
    });
    expect(byType.get('product')!.code).toMatch(/^PRD-/);
  });

  it('DELETE removes matching links across ALL versions', async () => {
    // character อยู่ทั้ง v1 (เพิ่มผ่าน /links) และ v2 (จาก POST relations ก่อนหน้า)
    await http(app)
      .post(`/api/prompts/${promptId}/links`)
      .set(auth(token))
      .send({ entityType: 'character', entityId: characterId, versionId: v1Id })
      .expect(201);
    expect(
      await prisma.promptLink.count({
        where: { entityType: 'character', entityId: characterId, promptVersion: { promptId } },
      }),
    ).toBe(2);

    const res = await http(app)
      .delete(`/api/prompts/${promptId}/relations`)
      .set(auth(token))
      .send({ entityType: 'character', entityId: characterId })
      .expect(200);
    expect(res.body.removed).toBe(2);

    const after = await http(app)
      .get(`/api/prompts/${promptId}/relations`)
      .set(auth(token))
      .expect(200);
    const types = (after.body as { entityType: string }[]).map((r) => r.entityType);
    expect(types).not.toContain('character');
  });

  it('list filter works for each of the 4 entity types', async () => {
    // ผูกให้ครบ 4 ค่าย (character ถูกลบไปเมื่อกี้ — ผูกใหม่)
    for (const [entityType, entityId] of [
      ['character', characterId],
      ['client', clientId],
      ['brand', brandId],
    ] as const) {
      await http(app)
        .post(`/api/prompts/${promptId}/relations`)
        .set(auth(token))
        .send({ entityType, entityId })
        .expect(201);
    }

    for (const [entityType, entityId] of [
      ['character', characterId],
      ['product', productId],
      ['client', clientId],
      ['brand', brandId],
    ] as const) {
      const res = await http(app)
        .get('/api/prompts')
        .query({ entityType, entityId })
        .set(auth(token))
        .expect(200);
      const ids = res.body.items.map((p: { id: string }) => p.id);
      expect(ids).toContain(promptId);
      expect(ids).not.toContain(otherPromptId);
    }
  });

  it('list items carry relations[] with enriched names', async () => {
    const res = await http(app)
      .get('/api/prompts')
      .query({ q: 'E2E Relations Main' })
      .set(auth(token))
      .expect(200);
    const item = res.body.items.find((p: { id: string }) => p.id === promptId);
    expect(item).toBeDefined();
    const rels = item.relations as { entityType: string; name: string }[];
    const byType = new Map(rels.map((r) => [r.entityType, r.name]));
    expect(byType.get('product')).toBe('E2E Relations เซรั่ม');
    expect(byType.get('client')).toBe('E2E Relations Client');
    expect(byType.get('brand')).toBe('E2E Relations Brand');
    expect(byType.get('character')).toBe('เรลตัวทดสอบ');
  });

  it('viewer (prompt V only): GET relations 200, POST/DELETE → 403', async () => {
    await http(app)
      .get(`/api/prompts/${promptId}/relations`)
      .set(auth(viewerToken))
      .expect(200);
    await http(app)
      .post(`/api/prompts/${promptId}/relations`)
      .set(auth(viewerToken))
      .send({ entityType: 'brand', entityId: brandId })
      .expect(403);
    await http(app)
      .delete(`/api/prompts/${promptId}/relations`)
      .set(auth(viewerToken))
      .send({ entityType: 'brand', entityId: brandId })
      .expect(403);
  });

  it('GET relations on unknown prompt → 404', async () => {
    await http(app)
      .get('/api/prompts/00000000-0000-4000-8000-000000000000/relations')
      .set(auth(token))
      .expect(404);
  });
});
