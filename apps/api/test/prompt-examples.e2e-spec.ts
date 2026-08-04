import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  PNG_BUFFER,
  auth,
  createApp,
  createUserWithRoles,
  http,
  loginAs,
} from './utils';

// CEO directive: "Prompt Library อยากให้มีรูปตัวอย่างด้วย"
// รูปตัวอย่างแนบผ่าน polymorphic asset (entityType 'prompt') — ไม่มี schema ใหม่
// list ต้องคืน exampleThumbAssetId (prefer cover) + exampleCount
describe('Prompt examples (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let token: string;
  let viewerToken: string;
  let promptId: string;
  let refAssetId: string;
  let coverAssetId: string;
  let refLinkId: string;

  const VIEWER_EMAIL = 'dev-api-viewer@aistar.test';
  const VIEWER_PASSWORD = 'aistar-devapi-2026';

  beforeAll(async () => {
    prisma = new PrismaClient();
    // dev_api role = prompt V + asset V เท่านั้น (ไม่มี C) → ใช้ทดสอบสิทธิ์อ่านอย่างเดียว
    await createUserWithRoles(prisma, VIEWER_EMAIL, VIEWER_PASSWORD, ['dev_api']);
    app = await createApp();
    token = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);
    viewerToken = await loginAs(app, VIEWER_EMAIL, VIEWER_PASSWORD);

    const prompt = await http(app)
      .post('/api/prompts')
      .set(auth(token))
      .send({
        name: 'E2E Prompt with examples',
        promptType: 'scene',
        body: 'thai street food night market, cinematic',
        targetPlatform: 'grok',
      })
      .expect(201);
    promptId = prompt.body.id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('upload example (reference) linked to prompt → list shows exampleThumbAssetId + exampleCount', async () => {
    const upload = await http(app)
      .post('/api/assets')
      .set(auth(token))
      .field('assetType', 'prompt_example')
      .field('entityType', 'prompt')
      .field('entityId', promptId)
      .field('linkRole', 'reference')
      .attach('file', PNG_BUFFER, 'result-1.png')
      .expect(201);
    refAssetId = upload.body.id;
    const link = upload.body.links.find(
      (l: { entityType: string; entityId: string }) =>
        l.entityType === 'prompt' && l.entityId === promptId,
    );
    refLinkId = link.id;

    const res = await http(app)
      .get('/api/prompts')
      .query({ q: 'E2E Prompt with examples' })
      .set(auth(token))
      .expect(200);
    const item = res.body.items.find((p: { id: string }) => p.id === promptId);
    expect(item).toBeDefined();
    expect(item.exampleThumbAssetId).toBe(refAssetId);
    expect(item.exampleCount).toBe(1);
  });

  it('cover is preferred over reference for the thumbnail', async () => {
    const upload = await http(app)
      .post('/api/assets')
      .set(auth(token))
      .field('assetType', 'prompt_example')
      .field('entityType', 'prompt')
      .field('entityId', promptId)
      .field('linkRole', 'cover')
      .attach('file', PNG_BUFFER, 'result-cover.png')
      .expect(201);
    coverAssetId = upload.body.id;

    const res = await http(app)
      .get('/api/prompts')
      .query({ q: 'E2E Prompt with examples' })
      .set(auth(token))
      .expect(200);
    const item = res.body.items.find((p: { id: string }) => p.id === promptId);
    expect(item.exampleThumbAssetId).toBe(coverAssetId);
    expect(item.exampleCount).toBe(2);
  });

  it('GET /assets?entityType=prompt&entityId= lists the examples', async () => {
    const res = await http(app)
      .get('/api/assets')
      .query({ entityType: 'prompt', entityId: promptId })
      .set(auth(token))
      .expect(200);
    const ids = res.body.items.map((a: { id: string }) => a.id);
    expect(ids).toContain(refAssetId);
    expect(ids).toContain(coverAssetId);
  });

  it('V-only role (dev_api) can read prompt list + example assets', async () => {
    const list = await http(app)
      .get('/api/prompts')
      .query({ q: 'E2E Prompt with examples' })
      .set(auth(viewerToken))
      .expect(200);
    const item = list.body.items.find((p: { id: string }) => p.id === promptId);
    expect(item.exampleThumbAssetId).toBe(coverAssetId);

    await http(app)
      .get('/api/assets')
      .query({ entityType: 'prompt', entityId: promptId })
      .set(auth(viewerToken))
      .expect(200);

    // แต่ upload ไม่ได้ (ไม่มี asset C)
    await http(app)
      .post('/api/assets')
      .set(auth(viewerToken))
      .field('assetType', 'prompt_example')
      .field('entityType', 'prompt')
      .field('entityId', promptId)
      .field('linkRole', 'reference')
      .attach('file', PNG_BUFFER, 'nope.png')
      .expect(403);
  });

  it('unlink an example drops it from exampleCount + thumbnail', async () => {
    // หา link id ของ cover asset ที่ผูกกับ prompt นี้
    const assetList = await http(app)
      .get('/api/assets')
      .query({ entityType: 'prompt', entityId: promptId })
      .set(auth(token))
      .expect(200);
    const coverLinkId = assetList.body.items
      .find((a: { id: string }) => a.id === coverAssetId)
      .links.find(
        (l: { entityType: string; entityId: string }) =>
          l.entityType === 'prompt' && l.entityId === promptId,
      ).id;

    // ลบ cover link → thumbnail ตกกลับไปเป็น reference, count ลดเหลือ 1
    await http(app)
      .delete(`/api/assets/${coverAssetId}/links/${coverLinkId}`)
      .set(auth(token))
      .expect(200);

    const res = await http(app)
      .get('/api/prompts')
      .query({ q: 'E2E Prompt with examples' })
      .set(auth(token))
      .expect(200);
    const item = res.body.items.find((p: { id: string }) => p.id === promptId);
    expect(item.exampleThumbAssetId).toBe(refAssetId);
    expect(item.exampleCount).toBe(1);

    // ลบ reference ตัวสุดท้าย → ไม่มีรูปแล้ว
    await http(app)
      .delete(`/api/assets/${refAssetId}/links/${refLinkId}`)
      .set(auth(token))
      .expect(200);
    const res2 = await http(app)
      .get('/api/prompts')
      .query({ q: 'E2E Prompt with examples' })
      .set(auth(token))
      .expect(200);
    const item2 = res2.body.items.find((p: { id: string }) => p.id === promptId);
    expect(item2.exampleThumbAssetId).toBeNull();
    expect(item2.exampleCount).toBe(0);
  });
});
