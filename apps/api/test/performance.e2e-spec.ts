import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  auth,
  createApp,
  http,
  loginAs,
} from './utils';

// dates are scoped to 2031/2032 so no other suite's data can leak into sums
const MANUAL_RANGE = { dateFrom: '2031-01-01', dateTo: '2031-01-31' };
const CSV_TITLE = 'Perf e2e CSV คลิปรีวิว';

// Performance D6: manual entry + CSV import + insight engine
describe('Performance (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let adminToken: string;
  let characterId: string;
  let contentItemId: string;
  let csvContentId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    app = await createApp();
    adminToken = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);

    const character = await http(app)
      .post('/api/characters')
      .set(auth(adminToken))
      .send({ nameTh: 'เพอร์ฟตัวท็อป', nameEn: 'PerfTop' })
      .expect(201);
    characterId = character.body.id;

    const content = await http(app)
      .post('/api/content-items')
      .set(auth(adminToken))
      .send({
        title: 'Perf e2e คลิปหลัก',
        platform: 'tiktok',
        characterIds: [characterId],
      })
      .expect(201);
    contentItemId = content.body.id;

    const csvContent = await http(app)
      .post('/api/content-items')
      .set(auth(adminToken))
      .send({ title: CSV_TITLE, platform: 'tiktok' })
      .expect(201);
    csvContentId = csvContent.body.id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('manual entry XOR validation: both ids → 400, neither → 400', async () => {
    await http(app)
      .post('/api/performance')
      .set(auth(adminToken))
      .send({
        contentItemId,
        liveSessionId: randomUUID(),
        platform: 'tiktok',
        recordedAt: '2031-01-05',
      })
      .expect(400);

    await http(app)
      .post('/api/performance')
      .set(auth(adminToken))
      .send({ platform: 'tiktok', recordedAt: '2031-01-05' })
      .expect(400);
  });

  it('create 2 manual entries; list filters by platform/source', async () => {
    await http(app)
      .post('/api/performance')
      .set(auth(adminToken))
      .send({
        contentItemId,
        platform: 'tiktok',
        recordedAt: '2031-01-05T00:00:00.000Z',
        views: 100,
        likes: 10,
        orders: 2,
        gmv: 100.5,
        roas: 2,
      })
      .expect(201);

    await http(app)
      .post('/api/performance')
      .set(auth(adminToken))
      .send({
        contentItemId,
        platform: 'facebook_reels',
        recordedAt: '2031-01-12T00:00:00.000Z',
        views: 50,
        likes: 5,
        orders: 1,
        gmv: 20.25,
        roas: 4,
      })
      .expect(201);

    const byPlatform = await http(app)
      .get('/api/performance')
      .query({ contentItemId, platform: 'tiktok' })
      .set(auth(adminToken))
      .expect(200);
    expect(byPlatform.body.total).toBe(1);
    expect(byPlatform.body.items[0].views).toBe(100);
    expect(byPlatform.body.items[0].source).toBe('manual');

    const byRange = await http(app)
      .get('/api/performance')
      .query({ contentItemId, recordedFrom: '2031-01-10', recordedTo: '2031-01-31' })
      .set(auth(adminToken))
      .expect(200);
    expect(byRange.body.total).toBe(1);
    expect(byRange.body.items[0].platform).toBe('facebook_reels');
  });

  it('summary groupBy=character sums both entries into one bucket', async () => {
    const res = await http(app)
      .get('/api/performance/summary')
      .query({ ...MANUAL_RANGE, groupBy: 'character' })
      .set(auth(adminToken))
      .expect(200);

    const bucket = res.body.find((b: { key: string }) => b.key === characterId);
    expect(bucket).toMatchObject({
      label: 'เพอร์ฟตัวท็อป',
      views: 150,
      likes: 15,
      orders: 3,
      gmv: 120.75,
      roas: 3, // avg of 2 and 4
      count: 2,
    });
  });

  it('summary rejects unknown groupBy', async () => {
    await http(app)
      .get('/api/performance/summary')
      .query({ groupBy: 'nope' })
      .set(auth(adminToken))
      .expect(400);
  });

  it('overview totals within the date range', async () => {
    const res = await http(app)
      .get('/api/performance/overview')
      .query(MANUAL_RANGE)
      .set(auth(adminToken))
      .expect(200);
    expect(res.body).toMatchObject({
      views: 150,
      likes: 15,
      orders: 3,
      gmv: 120.75,
      entryCount: 2,
      topPlatform: 'tiktok', // gmv 100.5 beats facebook 20.25
      topCharacter: 'เพอร์ฟตัวท็อป',
    });
  });

  it('CSV import: 2 good rows imported, bad title reported in Thai', async () => {
    const csv = [
      'content_title,platform,recorded_at,views,likes,orders,revenue,gmv',
      `${CSV_TITLE},tiktok,2032-02-01,1000,80,5,2500,3000`,
      `${CSV_TITLE},tiktok,2032-02-02,"2,000",120,7,4000.50,5000`,
      'ไม่มีคอนเทนต์ชื่อนี้,tiktok,2032-02-03,10,1,0,0,0',
    ].join('\n');

    const res = await http(app)
      .post('/api/performance/import')
      .set(auth(adminToken))
      .attach('file', Buffer.from(csv, 'utf8'), 'perf-e2e.csv')
      .expect(201);

    expect(res.body.imported).toBe(2);
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors[0].line).toBe(4);
    expect(res.body.errors[0].error).toContain('ไม่พบ content');
    expect(res.body.jobId).toEqual(expect.any(String));

    const imported = await http(app)
      .get('/api/performance')
      .query({ contentItemId: csvContentId, source: 'csv' })
      .set(auth(adminToken))
      .expect(200);
    expect(imported.body.total).toBe(2);
    // lenient parsing: "2,000" → 2000
    const views = imported.body.items.map((i: { views: number }) => i.views).sort((a: number, b: number) => a - b);
    expect(views).toEqual([1000, 2000]);
  });

  it('CSV import with wrong header → 400', async () => {
    await http(app)
      .post('/api/performance/import')
      .set(auth(adminToken))
      .attach('file', Buffer.from('foo,bar\n1,2', 'utf8'), 'bad.csv')
      .expect(400);
  });

  it('template endpoint returns text/csv with the column header', async () => {
    const res = await http(app)
      .get('/api/performance/import/template')
      .set(auth(adminToken))
      .expect(200)
      .expect('Content-Type', /text\/csv/);
    expect(res.text.split('\n')[0]).toContain('content_title,platform,recorded_at');
    expect(res.headers['content-disposition']).toContain('performance_import_template.csv');
  });

  it('delete removes an entry', async () => {
    const list = await http(app)
      .get('/api/performance')
      .query({ contentItemId, platform: 'facebook_reels' })
      .set(auth(adminToken))
      .expect(200);
    const id = list.body.items[0].id;

    const res = await http(app)
      .delete(`/api/performance/${id}`)
      .set(auth(adminToken))
      .expect(200);
    expect(res.body.deleted).toBe(true);

    const after = await http(app)
      .get('/api/performance')
      .query({ contentItemId, platform: 'facebook_reels' })
      .set(auth(adminToken))
      .expect(200);
    expect(after.body.total).toBe(0);
  });
});
