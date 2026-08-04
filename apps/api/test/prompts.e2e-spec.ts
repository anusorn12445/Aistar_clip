import { INestApplication } from '@nestjs/common';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  auth,
  createApp,
  http,
  loginAs,
} from './utils';

// AC-6 (partial): prompt library — versioning, search/filter, best flag,
// approval state machine, generation runs (§F.2)
describe('Prompts (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let promptId: string;
  let v2Id: string;

  beforeAll(async () => {
    app = await createApp();
    token = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);
  });

  afterAll(async () => {
    await app.close();
  });

  it('create prompt + v1 → 201', async () => {
    const res = await http(app)
      .post('/api/prompts')
      .set(auth(token))
      .send({
        name: 'E2E Identity Praewa',
        promptType: 'identity',
        body: 'thai woman, mole under left eye, warm smile',
        negativeBody: 'blurry, deformed',
        targetPlatform: 'kling',
        modelName: 'kling-1.5',
      })
      .expect(201);

    promptId = res.body.id;
    expect(res.body.status).toBe('draft');
    expect(res.body.bestFlag).toBe(false);
    expect(res.body.versions).toHaveLength(1);
    expect(res.body.versions[0].versionLabel).toBe('v1');
    expect(res.body.versions[0].targetPlatform).toBe('kling');
  });

  it('add version → v2', async () => {
    const res = await http(app)
      .post(`/api/prompts/${promptId}/versions`)
      .set(auth(token))
      .send({
        body: 'thai woman, mole under left eye, warm smile, cinematic light',
        targetPlatform: 'grok',
        performanceNote: 'grok ให้ผิวเนียนกว่า',
      })
      .expect(201);

    v2Id = res.body.id;
    expect(res.body.versionLabel).toBe('v2');
    expect(res.body.targetPlatform).toBe('grok');
  });

  it('GET /prompts?q= finds it', async () => {
    const res = await http(app)
      .get('/api/prompts')
      .query({ q: 'E2E Identity' })
      .set(auth(token))
      .expect(200);
    const names = res.body.items.map((p: { name: string }) => p.name);
    expect(names).toContain('E2E Identity Praewa');
  });

  it('GET /prompts?targetPlatform=grok filters by latest version platform', async () => {
    const grok = await http(app)
      .get('/api/prompts')
      .query({ targetPlatform: 'grok' })
      .set(auth(token))
      .expect(200);
    const grokIds = grok.body.items.map((p: { id: string }) => p.id);
    expect(grokIds).toContain(promptId);

    // latest version is grok, so a kling filter must NOT return this prompt
    const kling = await http(app)
      .get('/api/prompts')
      .query({ targetPlatform: 'kling' })
      .set(auth(token))
      .expect(200);
    const klingIds = kling.body.items.map((p: { id: string }) => p.id);
    expect(klingIds).not.toContain(promptId);
  });

  it('PATCH bestFlag by admin (has prompt A) → 200', async () => {
    const res = await http(app)
      .patch(`/api/prompts/${promptId}`)
      .set(auth(token))
      .send({ bestFlag: true })
      .expect(200);
    expect(res.body.bestFlag).toBe(true);
  });

  it('status machine: draft → internal_review → approved OK', async () => {
    const review = await http(app)
      .patch(`/api/prompts/${promptId}/status`)
      .set(auth(token))
      .send({ status: 'internal_review' })
      .expect(200);
    expect(review.body.status).toBe('internal_review');

    const approved = await http(app)
      .patch(`/api/prompts/${promptId}/status`)
      .set(auth(token))
      .send({ status: 'approved' })
      .expect(200);
    expect(approved.body.status).toBe('approved');
  });

  it('invalid status jump draft → production_ready → 400', async () => {
    const other = await http(app)
      .post('/api/prompts')
      .set(auth(token))
      .send({
        name: 'E2E Invalid Jump',
        promptType: 'negative',
        body: 'nsfw, watermark',
        targetPlatform: 'veo',
      })
      .expect(201);

    const res = await http(app)
      .patch(`/api/prompts/${other.body.id}/status`)
      .set(auth(token))
      .send({ status: 'production_ready' })
      .expect(400);
    expect(res.body.message).toContain('draft');
  });

  it('POST /prompt-versions/:id/runs with qcScore 5 → 201', async () => {
    const res = await http(app)
      .post(`/api/prompt-versions/${v2Id}/runs`)
      .set(auth(token))
      .send({ platform: 'grok', qcScore: 5, notes: 'ตรง visual DNA ทุกจุด' })
      .expect(201);
    expect(res.body.promptVersionId).toBe(v2Id);
    expect(res.body.qcScore).toBe(5);
  });
});
