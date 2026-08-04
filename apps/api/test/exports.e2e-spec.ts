import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  auth,
  binaryParser,
  createApp,
  http,
  loginAs,
  sleep,
} from './utils';

// AC-7: character package export — job queued → done, zip download, download log
describe('Character export (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let token: string;
  let characterId: string;
  let jobId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    app = await createApp();
    token = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);

    const character = await http(app)
      .post('/api/characters')
      .set(auth(token))
      .send({
        nameTh: 'มะลิ',
        nameEn: 'Mali',
        oneLineConcept: 'แม่ค้าไลฟ์สายฮาขายของเก่ง',
      })
      .expect(201);
    characterId = character.body.id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('POST /characters/:id/export → job queued', async () => {
    const res = await http(app)
      .post(`/api/characters/${characterId}/export`)
      .set(auth(token))
      .send({})
      .expect(201);

    jobId = res.body.id;
    expect(res.body.entityType).toBe('character');
    expect(res.body.entityId).toBe(characterId);
    expect(res.body.format).toBe('zip');
    expect(['queued', 'running', 'done']).toContain(res.body.status);
  });

  it('poll GET /exports/:jobId until done (≤15s)', async () => {
    const deadline = Date.now() + 15_000;
    let status = '';
    let fileKey: string | null = null;
    while (Date.now() < deadline) {
      const res = await http(app).get(`/api/exports/${jobId}`).set(auth(token)).expect(200);
      status = res.body.status;
      fileKey = res.body.fileKey;
      if (status === 'done' || status === 'failed') break;
      await sleep(250);
    }
    expect(status).toBe('done');
    expect(fileKey).toBeTruthy();
  }, 20_000);

  it('GET /exports/:jobId/download → 200 zip starting with PK', async () => {
    const res = await http(app)
      .get(`/api/exports/${jobId}/download`)
      .set(auth(token))
      .buffer(true)
      .parse(binaryParser)
      .expect(200)
      .expect('Content-Type', /application\/zip/);

    expect(res.headers['content-disposition']).toContain('attachment');
    const body = res.body as Buffer;
    expect(body.length).toBeGreaterThan(0);
    expect(body.subarray(0, 2).toString('ascii')).toBe('PK');
  });

  it('DownloadLog row exists for the download', async () => {
    const logs = await prisma.downloadLog.findMany({ where: { exportJobId: jobId } });
    expect(logs.length).toBeGreaterThanOrEqual(1);
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } });
    expect(logs[0].userId).toBe(admin.id);
  });
});
