import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  PNG_BUFFER,
  auth,
  binaryParser,
  createApp,
  http,
  loginAs,
  sleep,
} from './utils';

// Phase 4 AI endpoints degrade gracefully (ANTHROPIC_API_KEY is blanked in test-env):
// every endpoint that reaches the Claude call must 503 with Thai setup guidance.
describe('AI Phase 4 graceful degradation + Obsidian export (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let token: string;
  let episodeId: string;
  let characterId: string;
  let assetId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    app = await createApp();
    token = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);

    // episode with a script → shot-list pre-checks pass
    const episode = await http(app)
      .post('/api/episodes')
      .set(auth(token))
      .send({ title: 'AI4 e2e EP', script: 'ฉากเปิด: นางเอกรีวิวลิปหน้ากระจก' })
      .expect(201);
    episodeId = episode.body.id;

    // character with visual DNA → consistency pre-checks pass
    const character = await http(app)
      .post('/api/characters')
      .set(auth(token))
      .send({
        nameTh: 'เอไอโฟร์',
        nameEn: 'AiFour',
        visualDna: { face_shape: 'รูปไข่', hair_style: 'บ๊อบสั้นสีม่วง' },
      })
      .expect(201);
    characterId = character.body.id;

    // second character so similarity has something to compare
    await http(app)
      .post('/api/characters')
      .set(auth(token))
      .send({ nameTh: 'เอไอไฟว์', nameEn: 'AiFive' })
      .expect(201);

    // uploaded PNG asset → consistency reaches the Claude call
    const asset = await http(app)
      .post('/api/assets')
      .set(auth(token))
      .field('assetType', 'face_reference')
      .field('entityType', 'character')
      .field('entityId', characterId)
      .field('linkRole', 'reference')
      .attach('file', PNG_BUFFER, 'ai4.png')
      .expect(201);
    assetId = asset.body.id;

    // approved character → weekly plan pre-checks pass (direct DB set, machine tested elsewhere)
    await prisma.character.update({ where: { id: characterId }, data: { status: 'approved' } });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  function expect503(res: { body: { message: string } }) {
    expect(res.body.message).toContain('ANTHROPIC_API_KEY');
  }

  it('GET /ai/status → configured:false', async () => {
    const res = await http(app).get('/api/ai/status').set(auth(token)).expect(200);
    expect(res.body.configured).toBe(false);
  });

  it('POST /ai/episodes/:id/shot-list → 503', async () => {
    const res = await http(app)
      .post(`/api/ai/episodes/${episodeId}/shot-list`)
      .set(auth(token))
      .send({ maxShots: 6 })
      .expect(503);
    expect503(res);
  });

  it('POST /ai/content/caption → 503', async () => {
    const res = await http(app)
      .post('/api/ai/content/caption')
      .set(auth(token))
      .send({ title: 'รีวิวลิปใหม่', platform: 'tiktok' })
      .expect(503);
    expect503(res);
  });

  it('POST /ai/qc/assets/:assetId/consistency → 503', async () => {
    const res = await http(app)
      .post(`/api/ai/qc/assets/${assetId}/consistency`)
      .set(auth(token))
      .send({ characterId })
      .expect(503);
    expect503(res);
  });

  it('POST /ai/characters/:id/similarity → 503', async () => {
    const res = await http(app)
      .post(`/api/ai/characters/${characterId}/similarity`)
      .set(auth(token))
      .expect(503);
    expect503(res);
  });

  it('POST /ai/weekly-plan → 503', async () => {
    const res = await http(app)
      .post('/api/ai/weekly-plan')
      .set(auth(token))
      .send({ weekStart: '2026-07-13' })
      .expect(503);
    expect503(res);
  });

  describe('Obsidian vault export (§26)', () => {
    let jobId: string;

    it('POST /exports/obsidian → job queued', async () => {
      const res = await http(app).post('/api/exports/obsidian').set(auth(token)).expect(201);
      jobId = res.body.id;
      expect(res.body.entityType).toBe('vault');
      expect(res.body.format).toBe('zip');
      expect(['queued', 'running', 'done']).toContain(res.body.status);
    });

    it('poll GET /exports/:jobId until done (≤15s)', async () => {
      const deadline = Date.now() + 15_000;
      let status = '';
      while (Date.now() < deadline) {
        const res = await http(app).get(`/api/exports/${jobId}`).set(auth(token)).expect(200);
        status = res.body.status;
        if (status === 'done' || status === 'failed') break;
        await sleep(250);
      }
      expect(status).toBe('done');
    }, 20_000);

    it('download → zip (PK magic) containing a 01_Characters/ entry', async () => {
      const res = await http(app)
        .get(`/api/exports/obsidian/${jobId}/download`)
        .set(auth(token))
        .buffer(true)
        .parse(binaryParser)
        .expect(200)
        .expect('Content-Type', /application\/zip/);

      expect(res.headers['content-disposition']).toContain('AISTAR_VAULT_');
      const body = res.body as Buffer;
      expect(body.subarray(0, 2).toString('ascii')).toBe('PK');
      expect(body.length).toBeGreaterThan(500);
      // zip central directory stores entry names in plain bytes
      expect(body.includes(Buffer.from('01_Characters/', 'utf8'))).toBe(true);
    });
  });
});
