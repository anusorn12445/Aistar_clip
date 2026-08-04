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

// AI Usage & Cost Accountability — pure CRUD + aggregation, ไม่มี live AI.
// ต้อง deterministic: seed top-up ledger เอง, ใช้ date-range แยก dataset ของ flag test.
describe('AI Usage & Cost Accountability (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let adminToken: string; // CEO (admin) — เห็นทุกคน + จัดการ tool
  let aToken: string; // พนักงาน A (video_editor: ai_usage V+C)
  let bToken: string; // พนักงาน B
  let aUserId: string;
  let bUserId: string;

  let toolMainId: string; // มี top-up ledger → blended rate 2
  let toolNoRateId: string; // ไม่มี rate → rateWarning
  let episodeId: string; // งานจริงสำหรับผูก

  const A_EMAIL = 'aiusage-a@aistar.test';
  const B_EMAIL = 'aiusage-b@aistar.test';
  const PW = 'aistar-aiusage-2026';

  beforeAll(async () => {
    prisma = new PrismaClient();
    aUserId = await createUserWithRoles(prisma, A_EMAIL, PW, ['video_editor'], 'AI Usage A');
    bUserId = await createUserWithRoles(prisma, B_EMAIL, PW, ['video_editor'], 'AI Usage B');

    app = await createApp();
    adminToken = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);
    aToken = await loginAs(app, A_EMAIL, PW);
    bToken = await loginAs(app, B_EMAIL, PW);

    // งานจริงสำหรับผูก
    const ep = await prisma.episode.create({
      data: { displayCode: 'EP-AIUSAGE-1', title: 'AI Usage Test Episode' },
    });
    episodeId = ep.id;

    // tool หลัก + top-up ledger: จ่าย 1000 บาท ได้ 500 เครดิต → blended rate = 2 บาท/หน่วย
    const toolMain = await http(app)
      .post('/api/ai-tools')
      .set(auth(adminToken))
      .send({ name: 'Google Flow', unit: 'credit' })
      .expect(201);
    toolMainId = toolMain.body.id;
    await http(app)
      .post(`/api/ai-tools/${toolMainId}/topups`)
      .set(auth(adminToken))
      .send({ purchasedAt: '2026-07-01T00:00:00.000Z', amountBaht: 1000, quantity: 500 })
      .expect(201);

    // tool ที่ไม่มี rate เลย
    const toolNoRate = await http(app)
      .post('/api/ai-tools')
      .set(auth(adminToken))
      .send({ name: 'Mystery Tool', unit: 'token' })
      .expect(201);
    toolNoRateId = toolNoRate.body.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  const validLog = (over: Record<string, unknown> = {}) => ({
    aiToolId: toolMainId,
    usedAt: '2026-07-13T00:00:00.000Z',
    quantity: 100,
    outputsCount: 5,
    outputType: 'image',
    links: [{ entityType: 'episode', entityId: episodeId }],
    ...over,
  });

  it('blended rate = Σบาท ÷ Σหน่วย (1000/500 = 2) แสดงใน GET /ai-tools', async () => {
    const res = await http(app).get('/api/ai-tools').set(auth(adminToken)).expect(200);
    const tool = res.body.find((t: { id: string }) => t.id === toolMainId);
    expect(tool.blendedRate).toBe(2);
    expect(tool.rateSource).toBe('ledger');
  });

  it('บังคับผูกงาน: links ว่าง → 400', async () => {
    await http(app)
      .post('/api/ai-usage')
      .set(auth(aToken))
      .send(validLog({ links: [] }))
      .expect(400);
  });

  it('ผูกงานที่ไม่มีจริง → 400', async () => {
    await http(app)
      .post('/api/ai-usage')
      .set(auth(aToken))
      .send(
        validLog({
          links: [
            { entityType: 'episode', entityId: '00000000-0000-0000-0000-000000000000' },
          ],
        }),
      )
      .expect(400);
  });

  it('auto costBaht = quantity × blended rate (100 × 2 = 200)', async () => {
    const res = await http(app)
      .post('/api/ai-usage')
      .set(auth(aToken))
      .send(validLog({ quantity: 100 }))
      .expect(201);
    expect(res.body.costBaht).toBe(200);
    expect(res.body.rateWarning).toBeNull();
    expect(res.body.links).toHaveLength(1);
    expect(res.body.links[0].label).toContain('EP-AIUSAGE-1');
  });

  it('ไม่มี rate → costBaht 0 + rateWarning', async () => {
    const res = await http(app)
      .post('/api/ai-usage')
      .set(auth(aToken))
      .send(validLog({ aiToolId: toolNoRateId, quantity: 50 }))
      .expect(201);
    expect(res.body.costBaht).toBe(0);
    expect(res.body.rateWarning).toEqual(expect.any(String));
  });

  it('พนักงาน B บันทึกงานของตัวเองได้', async () => {
    await http(app)
      .post('/api/ai-usage')
      .set(auth(bToken))
      .send(validLog({ quantity: 20, outputsCount: 2 }))
      .expect(201);
  });

  it('non-CEO เห็นเฉพาะ log ของตัวเอง (isolation)', async () => {
    const res = await http(app).get('/api/ai-usage').set(auth(bToken)).expect(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.every((l: { userId: string }) => l.userId === bUserId)).toBe(true);
    // ต้องไม่เห็นของ A แม้จะพยายาม filter userId=A
    const spy = await http(app)
      .get(`/api/ai-usage?userId=${aUserId}`)
      .set(auth(bToken))
      .expect(200);
    expect(spy.body.every((l: { userId: string }) => l.userId === bUserId)).toBe(true);
  });

  it('CEO เห็น log ของทุกคน', async () => {
    const res = await http(app).get('/api/ai-usage').set(auth(adminToken)).expect(200);
    const userIds = new Set(res.body.map((l: { userId: string }) => l.userId));
    expect(userIds.has(aUserId)).toBe(true);
    expect(userIds.has(bUserId)).toBe(true);
  });

  it('summary: non-CEO perPerson เห็นแค่ตัวเอง, CEO เห็นทุกคน', async () => {
    const mine = await http(app).get('/api/ai-usage/summary').set(auth(bToken)).expect(200);
    expect(mine.body.ceo).toBe(false);
    expect(mine.body.perPerson).toHaveLength(1);
    expect(mine.body.perPerson[0].userId).toBe(bUserId);

    const all = await http(app).get('/api/ai-usage/summary').set(auth(adminToken)).expect(200);
    expect(all.body.ceo).toBe(true);
    const ids = all.body.perPerson.map((p: { userId: string }) => p.userId);
    expect(ids).toContain(aUserId);
    expect(ids).toContain(bUserId);
    expect(all.body.totals.outputs).toBeGreaterThan(0);
  });

  it('flag outlier: บาท/ชิ้น > 1.75× median ทีม → review (แยก dataset ด้วย date-range)', async () => {
    // 3 คนใหม่ ช่วงเวลาเฉพาะ (2019-06) — median คุมได้แน่นอน
    // (เดิมใช้ 2020-01 แล้วชนกับ log 999 บาทของ admin จาก roi.e2e-spec (OLD_USED_AT
    //  2020-01-05) เมื่อ roi รันก่อน — median เลื่อนจนไม่ flag → เทสต์ flaky ตามลำดับ suite)
    const xId = await createUserWithRoles(prisma, 'aiusage-x@aistar.test', PW, ['video_editor'], 'X');
    const yId = await createUserWithRoles(prisma, 'aiusage-y@aistar.test', PW, ['video_editor'], 'Y');
    const zId = await createUserWithRoles(prisma, 'aiusage-z@aistar.test', PW, ['video_editor'], 'Z');
    const xTok = await loginAs(app, 'aiusage-x@aistar.test', PW);
    const yTok = await loginAs(app, 'aiusage-y@aistar.test', PW);
    const zTok = await loginAs(app, 'aiusage-z@aistar.test', PW);
    const flagLog = (cost: number) =>
      validLog({ usedAt: '2019-06-15T00:00:00.000Z', quantity: 10, outputsCount: 10, costBaht: cost });
    await http(app).post('/api/ai-usage').set(auth(xTok)).send(flagLog(20)).expect(201); // cpo 2
    await http(app).post('/api/ai-usage').set(auth(yTok)).send(flagLog(20)).expect(201); // cpo 2
    await http(app).post('/api/ai-usage').set(auth(zTok)).send(flagLog(200)).expect(201); // cpo 20 → outlier

    const res = await http(app)
      .get('/api/ai-usage/summary?from=2019-06-01T00:00:00.000Z&to=2019-06-30T00:00:00.000Z')
      .set(auth(adminToken))
      .expect(200);
    const rowById = (id: string) =>
      res.body.perPerson.find((p: { userId: string }) => p.userId === id);
    expect(rowById(zId).flag).toBe('review');
    expect(rowById(xId).flag).toBe('ok');
    expect(rowById(yId).flag).toBe('ok');
    void xId;
  });

  it('ลบ tool ที่มี usage log อยู่ → 409', async () => {
    await http(app).delete(`/api/ai-tools/${toolMainId}`).set(auth(adminToken)).expect(409);
  });

  it('non-admin สร้าง tool ไม่ได้ (ai_usage A = admin เท่านั้น) → 403', async () => {
    await http(app)
      .post('/api/ai-tools')
      .set(auth(aToken))
      .send({ name: 'Nope', unit: 'token' })
      .expect(403);
  });
});
