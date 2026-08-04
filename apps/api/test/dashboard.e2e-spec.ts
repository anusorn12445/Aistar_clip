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

// finance-allowed = ระดับ CEO เท่านั้น (founder); finance-hidden = role อื่น แม้จะมี performance V (researcher) ก็ไม่เห็นยอดเงิน
const FINANCE_EMAIL = 'dash-finance@aistar.test';
const FINANCE_PASSWORD = 'dash-finance-2026';
const NOFIN_EMAIL = 'dash-nofin@aistar.test';
const NOFIN_PASSWORD = 'dash-nofin-2026';

describe('Dashboard (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let adminToken: string;
  let financeToken: string;
  let noFinToken: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await createUserWithRoles(prisma, FINANCE_EMAIL, FINANCE_PASSWORD, ['founder']);
    // researcher มี performance V แต่ไม่ใช่ CEO → ต้องไม่เห็นยอดเงิน (พิสูจน์ว่า gate รัดที่ระดับ CEO จริง)
    await createUserWithRoles(prisma, NOFIN_EMAIL, NOFIN_PASSWORD, ['researcher']);
    app = await createApp();
    adminToken = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);
    financeToken = await loginAs(app, FINANCE_EMAIL, FINANCE_PASSWORD);
    noFinToken = await loginAs(app, NOFIN_EMAIL, NOFIN_PASSWORD);

    // เตรียมข้อมูล action-needed: task เลยกำหนด + character รออนุมัติ + job deliverable submitted
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } });
    await prisma.task.create({
      data: {
        title: 'Dash e2e งานเลยกำหนด',
        dueDate: new Date('2020-01-01'),
        status: 'todo',
        createdBy: admin.id,
      },
    });

    // character → internal_review (คิวอนุมัติ)
    const chr = await http(app)
      .post('/api/characters')
      .set(auth(adminToken))
      .send({ nameTh: 'Dash e2e รออนุมัติ', nameEn: 'DashReview' })
      .expect(201);
    await http(app)
      .patch(`/api/characters/${chr.body.id}/status`)
      .set(auth(adminToken))
      .send({ status: 'internal_review' })
      .expect(200);

    // job + deliverable submitted (deliverable รอลูกค้าตรวจรับ)
    const client = await http(app)
      .post('/api/clients')
      .set(auth(adminToken))
      .send({ name: 'Dash e2e ลูกค้า' })
      .expect(201);
    const job = await http(app)
      .post('/api/jobs')
      .set(auth(adminToken))
      .send({ title: 'Dash e2e งาน', clientId: client.body.id, quotePrice: 50000 })
      .expect(201);
    const deliverable = await http(app)
      .post(`/api/jobs/${job.body.id}/deliverables`)
      .set(auth(adminToken))
      .send({ title: 'รอบ 1' })
      .expect(201);
    await http(app)
      .patch(`/api/jobs/${job.body.id}/deliverables/${deliverable.body.id}`)
      .set(auth(adminToken))
      .send({ status: 'submitted' })
      .expect(200);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('401 เมื่อไม่มี token', async () => {
    await http(app).get('/api/dashboard').expect(401);
  });

  it('คืน payload ครบ 5 กลุ่มตาม shape', async () => {
    const res = await http(app).get('/api/dashboard').set(auth(adminToken)).expect(200);
    const body = res.body;
    expect(body).toHaveProperty('financeVisible');
    expect(body).toHaveProperty('kpis');
    expect(body).toHaveProperty('actionNeeded');
    expect(body).toHaveProperty('pipeline');
    expect(body).toHaveProperty('week');
    expect(body).toHaveProperty('activity');
    expect(body.kpis).toEqual(
      expect.objectContaining({
        charactersReady: expect.any(Number),
        charactersTotal: expect.any(Number),
        jobsInProduction: expect.any(Number),
        contentThisWeek: expect.any(Number),
        liveToday: expect.any(Number),
      }),
    );
    expect(Array.isArray(body.week)).toBe(true);
    expect(Array.isArray(body.activity)).toBe(true);
  });

  it('financeVisible=true (CEO/founder) → มี gmv + pipeline value + performance block', async () => {
    const res = await http(app).get('/api/dashboard').set(auth(financeToken)).expect(200);
    expect(res.body.financeVisible).toBe(true);
    expect(res.body.kpis).toHaveProperty('gmvThisMonth');
    expect(res.body.kpis).toHaveProperty('gmvDeltaPct');
    expect(res.body.kpis).toHaveProperty('pipelineValue');
    expect(typeof res.body.kpis.gmvThisMonth).toBe('number');
    expect(res.body.performance).toBeDefined();
    expect(Array.isArray(res.body.performance.gmvDailyLast7)).toBe(true);
    expect(res.body.performance.gmvDailyLast7).toHaveLength(7);
    expect(Array.isArray(res.body.performance.topPresenters)).toBe(true);
    expect(Array.isArray(res.body.performance.topProducts)).toBe(true);
  });

  it('financeVisible=false (researcher มี performance V แต่ไม่ใช่ CEO) → ซ่อน gmv/pipeline value/performance', async () => {
    const res = await http(app).get('/api/dashboard').set(auth(noFinToken)).expect(200);
    expect(res.body.financeVisible).toBe(false);
    expect(res.body.kpis).not.toHaveProperty('gmvThisMonth');
    expect(res.body.kpis).not.toHaveProperty('gmvDeltaPct');
    expect(res.body.kpis).not.toHaveProperty('pipelineValue');
    expect(res.body.performance).toBeUndefined();
    // KPI ที่ไม่ใช่การเงินยังต้องมา
    expect(res.body.kpis).toHaveProperty('jobsInProduction');
  });

  it('actionNeeded มีครบทุก counter และสะท้อนข้อมูลที่เตรียมไว้', async () => {
    const res = await http(app).get('/api/dashboard').set(auth(adminToken)).expect(200);
    const a = res.body.actionNeeded;
    for (const key of [
      'overdueTasks',
      'overdueJobs',
      'pendingApprovals',
      'qcPending',
      'deliverablesAwaitingClient',
      'rightsExpiringSoon',
    ]) {
      expect(a).toHaveProperty(key);
      expect(typeof a[key]).toBe('number');
    }
    expect(a.overdueTasks).toBeGreaterThanOrEqual(1); // task เลยกำหนดที่ seed ไว้
    expect(a.pendingApprovals).toBeGreaterThanOrEqual(1); // character internal_review
    expect(a.deliverablesAwaitingClient).toBeGreaterThanOrEqual(1); // deliverable submitted
  });

  it('pipeline แยกเป็น bucket ตาม status ของ jobs/episodes/content', async () => {
    const res = await http(app).get('/api/dashboard').set(auth(adminToken)).expect(200);
    const p = res.body.pipeline;
    expect(p).toHaveProperty('jobs');
    expect(p).toHaveProperty('episodes');
    expect(p).toHaveProperty('content');
    // job ที่สร้างไว้เริ่มที่ inquiry → ต้องมี bucket inquiry >= 1
    expect(p.jobs.inquiry).toBeGreaterThanOrEqual(1);
    for (const bucket of Object.values(p.jobs)) {
      expect(typeof bucket).toBe('number');
    }
  });
});
