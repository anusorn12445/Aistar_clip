import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  RESEARCHER_EMAIL,
  RESEARCHER_PASSWORD,
  auth,
  createApp,
  createUserWithRoles,
  ensureResearcher,
  http,
  loginAs,
} from './utils';
import { currentPeriod } from '../src/kpi/kpi.constants';

// KPI / Goal-setting (Phase 1) — per-role goals, actuals จาก audit_logs
describe('Team KPI (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let researcherToken: string;
  const prisma = new PrismaClient();

  // creator user #1 — สร้าง character จริงผ่าน API เพื่อให้ actual เพิ่ม
  const CREATOR1_EMAIL = 'kpi-creator1@aistar.test';
  const CREATOR1_PW = 'kpi-creator1-2026';
  let creator1Id: string;
  let creator1Token: string;

  // creator user #2 — ใช้ทดสอบ period windowing ด้วย audit row ที่คุมเวลาเอง
  const CREATOR2_EMAIL = 'kpi-creator2@aistar.test';
  const CREATOR2_PW = 'kpi-creator2-2026';
  let creator2Id: string;
  let creator2Token: string;

  beforeAll(async () => {
    app = await createApp();
    adminToken = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);

    await ensureResearcher(prisma);
    researcherToken = await loginAs(app, RESEARCHER_EMAIL, RESEARCHER_PASSWORD);

    creator1Id = await createUserWithRoles(prisma, CREATOR1_EMAIL, CREATOR1_PW, ['creator']);
    creator1Token = await loginAs(app, CREATOR1_EMAIL, CREATOR1_PW);

    creator2Id = await createUserWithRoles(prisma, CREATOR2_EMAIL, CREATOR2_PW, ['creator']);
    creator2Token = await loginAs(app, CREATOR2_EMAIL, CREATOR2_PW);
  });

  afterAll(async () => {
    await prisma.kpiGoal.deleteMany({});
    await prisma.$disconnect();
    await app.close();
  });

  it('PUT /kpi/goals upserts the creator goal set + writes an audit row', async () => {
    const res = await http(app)
      .put('/api/kpi/goals')
      .set(auth(adminToken))
      .send({
        roleKey: 'creator',
        goals: [
          { metric: 'character_created', period: 'weekly', target: 5 },
          { metric: 'character_created', period: 'monthly', target: 20 },
          { metric: 'episode_created', period: 'weekly', target: 3 },
          { metric: 'series_created', period: 'monthly', target: 1, active: false },
        ],
      })
      .expect(200);

    expect(res.body.roleKey).toBe('creator');
    const metrics = (res.body.goals as { metric: string; period: string; target: number }[]).map(
      (g) => `${g.metric}:${g.period}=${g.target}`,
    );
    expect(metrics).toEqual(
      expect.arrayContaining([
        'character_created:weekly=5',
        'character_created:monthly=20',
        'episode_created:weekly=3',
        'series_created:monthly=1',
      ]),
    );

    const log = await prisma.auditLog.findFirst({
      where: { entityType: 'kpi_goal', action: 'upsert' },
      orderBy: { createdAt: 'desc' },
    });
    expect(log).toBeTruthy();
    expect((log!.meta as { roleKey: string }).roleKey).toBe('creator');
  });

  it('PUT /kpi/goals re-upsert updates target in place (no duplicate rows)', async () => {
    await http(app)
      .put('/api/kpi/goals')
      .set(auth(adminToken))
      .send({ roleKey: 'creator', goals: [{ metric: 'character_created', period: 'weekly', target: 7 }] })
      .expect(200);

    const rows = await prisma.kpiGoal.findMany({
      where: { scope: 'role', roleKey: 'creator', metric: 'character_created', period: 'weekly' },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].target).toBe(7);
  });

  it('PUT /kpi/goals with unknown metric → 400', async () => {
    await http(app)
      .put('/api/kpi/goals')
      .set(auth(adminToken))
      .send({ roleKey: 'creator', goals: [{ metric: 'bogus_metric', period: 'weekly', target: 5 }] })
      .expect(400);
  });

  it('PUT /kpi/goals with invalid period → 400', async () => {
    await http(app)
      .put('/api/kpi/goals')
      .set(auth(adminToken))
      .send({ roleKey: 'creator', goals: [{ metric: 'character_created', period: 'yearly', target: 5 }] })
      .expect(400);
  });

  it('PUT /kpi/goals with target > 1000 → 400', async () => {
    await http(app)
      .put('/api/kpi/goals')
      .set(auth(adminToken))
      .send({ roleKey: 'creator', goals: [{ metric: 'character_created', period: 'weekly', target: 5000 }] })
      .expect(400);
  });

  it('PUT /kpi/goals → 403 for a role without setting C (researcher)', async () => {
    await http(app)
      .put('/api/kpi/goals')
      .set(auth(researcherToken))
      .send({ roleKey: 'creator', goals: [{ metric: 'character_created', period: 'weekly', target: 5 }] })
      .expect(403);
  });

  it('GET /kpi/goals reflects a real create by a creator-role user in teamActual + perUser', async () => {
    // creator1 สร้าง character จริง → audit row entityType=character action=create actorId=creator1
    await http(app)
      .post('/api/characters')
      .set(auth(creator1Token))
      .send({ nameTh: 'ตัวละครทดสอบ KPI' })
      .expect(201);

    const res = await http(app)
      .get('/api/kpi/goals?roleKey=creator')
      .set(auth(adminToken))
      .expect(200);

    const weekly = (res.body.goals as {
      metric: string;
      period: string;
      teamActual: number;
      teamTarget: number;
      target: number;
      memberCount: number;
      perUser: { userId: string; actual: number }[];
    }[]).find((g) => g.metric === 'character_created' && g.period === 'weekly')!;

    expect(weekly).toBeTruthy();
    expect(weekly.memberCount).toBeGreaterThanOrEqual(2); // creator1 + creator2
    expect(weekly.teamTarget).toBe(weekly.target * weekly.memberCount);
    expect(weekly.teamActual).toBeGreaterThanOrEqual(1);
    const mine = weekly.perUser.find((u) => u.userId === creator1Id)!;
    expect(mine.actual).toBeGreaterThanOrEqual(1);
  });

  it('GET /kpi/me returns the logged-in user goals + their own actual', async () => {
    const res = await http(app).get('/api/kpi/me').set(auth(creator1Token)).expect(200);
    const rows = res.body as { metric: string; period: string; target: number; actual: number }[];
    // active goals เท่านั้น — series (active:false) ต้องไม่โผล่
    expect(rows.some((r) => r.metric === 'series_created')).toBe(false);
    const weekly = rows.find((r) => r.metric === 'character_created' && r.period === 'weekly')!;
    expect(weekly).toBeTruthy();
    expect(weekly.target).toBe(7);
    expect(weekly.actual).toBeGreaterThanOrEqual(1);
  });

  it('period windowing: weekly window excludes a create from earlier in the month; monthly includes it', async () => {
    const monthly = currentPeriod('monthly');
    const weekly = currentPeriod('weekly');
    const rowNow = new Date();
    const rowMonthStart = new Date(monthly.start.getTime() + 60 * 60 * 1000); // ต้นเดือน +1 ชม.

    // creator2 ไม่มี create อื่น — ใส่ audit row ตรง ๆ สองแถว
    await prisma.auditLog.createMany({
      data: [
        { actorId: creator2Id, via: 'ui', action: 'create', entityType: 'character', createdAt: rowNow },
        { actorId: creator2Id, via: 'ui', action: 'create', entityType: 'character', createdAt: rowMonthStart },
      ],
    });

    const res = await http(app).get('/api/kpi/me').set(auth(creator2Token)).expect(200);
    const rows = res.body as { metric: string; period: string; actual: number }[];
    const w = rows.find((r) => r.metric === 'character_created' && r.period === 'weekly')!;
    const m = rows.find((r) => r.metric === 'character_created' && r.period === 'monthly')!;

    const monthStartInWeek =
      rowMonthStart >= weekly.start && rowMonthStart < weekly.end ? 1 : 0;
    expect(w.actual).toBe(1 + monthStartInWeek); // rowNow + (rowMonthStart ถ้าตกในสัปดาห์นี้)
    expect(m.actual).toBe(2); // ทั้งสองแถวอยู่ในเดือนนี้
  });

  it('GET /kpi/goals with unknown roleKey → empty goals', async () => {
    const res = await http(app)
      .get('/api/kpi/goals?roleKey=no_such_role')
      .set(auth(adminToken))
      .expect(200);
    expect(res.body.goals).toEqual([]);
  });
});
