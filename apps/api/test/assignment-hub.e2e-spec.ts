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

// ─── Assignment Hub (KPI Phase 2) — เป้ารายคน + assignment-summary ────────
// user-scope goals (PUT/GET /kpi/goals scope=user) + GET /kpi/assignment-summary
// (effective target: user > role สูงสุด, actuals จาก audit_logs, workload counts)

interface SummaryTarget {
  metric: string;
  target: number;
  source: 'user' | 'role';
  actual: number;
  progressPct: number;
  status: 'on_track' | 'behind' | 'done';
}

interface SummaryMember {
  userId: string;
  name: string;
  roles: { key: string; name: string }[];
  teams: { id: string; name: string }[];
  targets: SummaryTarget[];
  workload: { tasks: number; imageRequests: number; episodes: number; contentItems: number };
  totals: { targets: number; done: number; onTrack: number; behind: number };
}

interface SummaryBody {
  period: string;
  from: string;
  to: string;
  elapsedFraction: number;
  members: SummaryMember[];
}

describe('Assignment Hub (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let researcherToken: string;
  const prisma = new PrismaClient();

  const HUB1_EMAIL = 'assign-hub1@aistar.test';
  const HUB2_EMAIL = 'assign-hub2@aistar.test';
  const PW = 'assign-hub-2026';
  let hub1Id: string;
  let hub2Id: string;
  let teamId: string;
  let adminId: string;

  // rows ที่สร้างเองไว้ลบตอนจบ
  const createdTaskIds: string[] = [];
  const createdImageRequestIds: string[] = [];
  const createdEpisodeIds: string[] = [];
  const createdContentIds: string[] = [];

  const getSummary = async (qs: string): Promise<SummaryBody> => {
    const res = await http(app)
      .get(`/api/kpi/assignment-summary?${qs}`)
      .set(auth(adminToken))
      .expect(200);
    return res.body as SummaryBody;
  };

  const memberOf = (body: SummaryBody, userId: string) =>
    body.members.find((m) => m.userId === userId);

  beforeAll(async () => {
    app = await createApp();
    adminToken = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);

    await ensureResearcher(prisma);
    researcherToken = await loginAs(app, RESEARCHER_EMAIL, RESEARCHER_PASSWORD);

    hub1Id = await createUserWithRoles(prisma, HUB1_EMAIL, PW, ['creator'], 'Assign Hub One');
    hub2Id = await createUserWithRoles(prisma, HUB2_EMAIL, PW, ['creator'], 'Assign Hub Two');
    adminId = (await prisma.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } })).id;

    // ทีมสำหรับ team filter — สมาชิกคือ hub1 คนเดียว
    const teamRes = await http(app)
      .post('/api/teams')
      .set(auth(adminToken))
      .send({ name: 'Assignment Hub E2E Team' })
      .expect(201);
    teamId = teamRes.body.id;
    await http(app)
      .put(`/api/teams/${teamId}/members`)
      .set(auth(adminToken))
      .send({ userIds: [hub1Id] })
      .expect(200);
  });

  afterAll(async () => {
    await prisma.kpiGoal.deleteMany({
      where: {
        OR: [
          { scope: 'user', userId: { in: [hub1Id, hub2Id] } },
          { scope: 'role', roleKey: 'creator' },
        ],
      },
    });
    if (createdTaskIds.length) {
      await prisma.task.deleteMany({ where: { id: { in: createdTaskIds } } });
    }
    if (createdImageRequestIds.length) {
      await prisma.imageRequest.deleteMany({ where: { id: { in: createdImageRequestIds } } });
    }
    if (createdEpisodeIds.length) {
      await prisma.episode.deleteMany({ where: { id: { in: createdEpisodeIds } } });
    }
    if (createdContentIds.length) {
      await prisma.contentItem.deleteMany({ where: { id: { in: createdContentIds } } });
    }
    await prisma.teamMember.deleteMany({ where: { teamId } });
    await prisma.team.deleteMany({ where: { id: teamId } });
    await prisma.$disconnect();
    await app.close();
  });

  // ── per-user goals ──────────────────────────────────────────

  it('PUT /kpi/goals scope=user upserts per-user goals in place (replace-set, no duplicates)', async () => {
    const first = await http(app)
      .put('/api/kpi/goals')
      .set(auth(adminToken))
      .send({
        scope: 'user',
        userId: hub1Id,
        goals: [{ metric: 'character_created', period: 'weekly', target: 5 }],
      })
      .expect(200);
    expect(first.body.scope).toBe('user');
    expect(first.body.userId).toBe(hub1Id);

    await http(app)
      .put('/api/kpi/goals')
      .set(auth(adminToken))
      .send({
        scope: 'user',
        userId: hub1Id,
        goals: [{ metric: 'character_created', period: 'weekly', target: 7 }],
      })
      .expect(200);

    const rows = await prisma.kpiGoal.findMany({
      where: { scope: 'user', userId: hub1Id, metric: 'character_created', period: 'weekly' },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].target).toBe(7);
    expect(rows[0].roleKey).toBeNull();
  });

  it('PUT /kpi/goals scope=user with unknown userId → 400', async () => {
    await http(app)
      .put('/api/kpi/goals')
      .set(auth(adminToken))
      .send({
        scope: 'user',
        userId: '00000000-0000-4000-8000-000000000000',
        goals: [{ metric: 'character_created', period: 'weekly', target: 5 }],
      })
      .expect(400);
  });

  it('PUT /kpi/goals scope=user without userId → 400 (validator)', async () => {
    await http(app)
      .put('/api/kpi/goals')
      .set(auth(adminToken))
      .send({
        scope: 'user',
        goals: [{ metric: 'character_created', period: 'weekly', target: 5 }],
      })
      .expect(400);
  });

  it('GET /kpi/goals?scope=user&userId= returns the user-scope rows + actual', async () => {
    const res = await http(app)
      .get(`/api/kpi/goals?scope=user&userId=${hub1Id}`)
      .set(auth(adminToken))
      .expect(200);
    expect(res.body.scope).toBe('user');
    expect(res.body.userId).toBe(hub1Id);
    const goal = (res.body.goals as { metric: string; period: string; target: number; actual: number }[]).find(
      (g) => g.metric === 'character_created' && g.period === 'weekly',
    )!;
    expect(goal).toBeTruthy();
    expect(goal.target).toBe(7);
    expect(goal.actual).toEqual(expect.any(Number));
  });

  // ── assignment-summary ──────────────────────────────────────

  it('assignment-summary: user-scope goal overrides role goal, with source flags', async () => {
    // role goal ของ creator = 3 (weekly) + 10 (monthly — ใช้ทดสอบ period window ทีหลัง)
    await http(app)
      .put('/api/kpi/goals')
      .set(auth(adminToken))
      .send({
        roleKey: 'creator',
        goals: [
          { metric: 'character_created', period: 'weekly', target: 3 },
          { metric: 'character_created', period: 'monthly', target: 10 },
        ],
      })
      .expect(200);

    const body = await getSummary('period=weekly&roleKey=creator');
    const m1 = memberOf(body, hub1Id)!;
    const m2 = memberOf(body, hub2Id)!;
    expect(m1).toBeTruthy();
    expect(m2).toBeTruthy();

    // hub1 มีเป้าเฉพาะคน 7 → override เป้า role 3
    const t1 = m1.targets.find((t) => t.metric === 'character_created')!;
    expect(t1.target).toBe(7);
    expect(t1.source).toBe('user');

    // hub2 ไม่มีเป้าเฉพาะคน → ใช้เป้า role 3
    const t2 = m2.targets.find((t) => t.metric === 'character_created')!;
    expect(t2.target).toBe(3);
    expect(t2.source).toBe('role');
  });

  it('assignment-summary: actuals นับจาก audit rows ที่ seed + status math สอดคล้อง elapsedFraction', async () => {
    // hub2 ยังไม่เคยสร้างอะไร — seed audit row ตรง ๆ 1 แถว (ตอนนี้)
    await prisma.auditLog.create({
      data: { actorId: hub2Id, via: 'ui', action: 'create', entityType: 'character' },
    });

    const body = await getSummary('period=weekly&roleKey=creator');
    expect(body.elapsedFraction).toBeGreaterThanOrEqual(0);
    expect(body.elapsedFraction).toBeLessThanOrEqual(1);

    const t2 = memberOf(body, hub2Id)!.targets.find((t) => t.metric === 'character_created')!;
    expect(t2.actual).toBe(1);
    expect(t2.progressPct).toBe(Math.round((1 / 3) * 100));

    // status ต้องตรงสูตร: pct>=100 → done, pct >= elapsed% → on_track, else behind
    for (const m of body.members) {
      for (const t of m.targets) {
        const pct = t.target > 0 ? (t.actual / t.target) * 100 : 100;
        const expected =
          pct >= 100 ? 'done' : pct >= body.elapsedFraction * 100 ? 'on_track' : 'behind';
        expect(t.status).toBe(expected);
      }
      expect(m.totals.targets).toBe(m.targets.length);
      expect(m.totals.done + m.totals.onTrack + m.totals.behind).toBe(m.targets.length);
    }
  });

  it('assignment-summary: done เมื่อ actual >= เป้าเฉพาะคน (override แล้วคิดจากเป้าใหม่)', async () => {
    // hub2 ทำได้ 1 → ตั้งเป้าเฉพาะคน 1 → ต้อง done (เป้า role 3 ถูก override)
    await http(app)
      .put('/api/kpi/goals')
      .set(auth(adminToken))
      .send({
        scope: 'user',
        userId: hub2Id,
        goals: [{ metric: 'character_created', period: 'weekly', target: 1 }],
      })
      .expect(200);

    const body = await getSummary('period=weekly&roleKey=creator');
    const t2 = memberOf(body, hub2Id)!.targets.find((t) => t.metric === 'character_created')!;
    expect(t2.source).toBe('user');
    expect(t2.target).toBe(1);
    expect(t2.status).toBe('done');
    expect(t2.progressPct).toBeGreaterThanOrEqual(100);
  });

  it('assignment-summary: workload นับเฉพาะงานค้าง (open task / image request / episode / content)', async () => {
    // task ค้างผ่าน endpoint จริง (มอบหมายให้ hub1) + task done ตรง ๆ (ต้องไม่ถูกนับ)
    const taskRes = await http(app)
      .post('/api/tasks')
      .set(auth(adminToken))
      .send({ title: 'Assignment Hub E2E — งานค้าง', assigneeId: hub1Id })
      .expect(201);
    createdTaskIds.push(taskRes.body.id);
    const doneTask = await prisma.task.create({
      data: { title: 'Assignment Hub E2E — เสร็จแล้ว', assigneeId: hub1Id, status: 'done', createdBy: adminId },
    });
    createdTaskIds.push(doneTask.id);

    // image request: open (นับ) + approved (ไม่นับ)
    const imgOpen = await prisma.imageRequest.create({
      data: {
        displayCode: 'IMG-E2EHUB-1',
        title: 'ภาพค้าง',
        imageType: 'banner',
        requesterId: adminId,
        assigneeId: hub1Id,
        status: 'open',
      },
    });
    const imgClosed = await prisma.imageRequest.create({
      data: {
        displayCode: 'IMG-E2EHUB-2',
        title: 'ภาพอนุมัติแล้ว',
        imageType: 'banner',
        requesterId: adminId,
        assigneeId: hub1Id,
        status: 'approved',
      },
    });
    createdImageRequestIds.push(imgOpen.id, imgClosed.id);

    // episode: idea (นับ) + published (ไม่นับ)
    const epOpen = await prisma.episode.create({
      data: { displayCode: 'EP-E2EHUB-1', title: 'อีพีค้าง', ownerId: hub1Id, status: 'idea' },
    });
    const epClosed = await prisma.episode.create({
      data: { displayCode: 'EP-E2EHUB-2', title: 'อีพีเผยแพร่แล้ว', ownerId: hub1Id, status: 'published' },
    });
    createdEpisodeIds.push(epOpen.id, epClosed.id);

    // content: idea (นับ) + published (ไม่นับ)
    const cOpen = await prisma.contentItem.create({
      data: { title: 'คอนเทนต์ค้าง', platform: 'tiktok', ownerId: hub1Id, status: 'idea' },
    });
    const cClosed = await prisma.contentItem.create({
      data: { title: 'คอนเทนต์เผยแพร่แล้ว', platform: 'tiktok', ownerId: hub1Id, status: 'published' },
    });
    createdContentIds.push(cOpen.id, cClosed.id);

    const body = await getSummary('period=weekly&roleKey=creator');
    const m1 = memberOf(body, hub1Id)!;
    expect(m1.workload).toEqual({ tasks: 1, imageRequests: 1, episodes: 1, contentItems: 1 });
  });

  it('assignment-summary: teamId filter คืนเฉพาะสมาชิกทีม', async () => {
    const body = await getSummary(`period=weekly&teamId=${teamId}`);
    expect(body.members).toHaveLength(1);
    expect(body.members[0].userId).toBe(hub1Id);
    expect(body.members[0].teams.map((t) => t.id)).toContain(teamId);

    // teamId ไม่ใช่ uuid → 400
    await http(app)
      .get('/api/kpi/assignment-summary?teamId=not-a-uuid')
      .set(auth(adminToken))
      .expect(400);
  });

  it('assignment-summary: roleKey filter คืนเฉพาะคนที่ถือ role นั้น', async () => {
    const body = await getSummary('period=weekly&roleKey=creator');
    expect(body.members.length).toBeGreaterThanOrEqual(2);
    for (const m of body.members) {
      expect(m.roles.map((r) => r.key)).toContain('creator');
    }
    expect(memberOf(body, hub1Id)).toBeTruthy();
    expect(memberOf(body, hub2Id)).toBeTruthy();
  });

  it('assignment-summary: period windows — weekly/monthly คนละหน้าต่าง, monthly นับ row ต้นเดือน', async () => {
    const weekly = currentPeriod('weekly');
    const monthly = currentPeriod('monthly');

    // seed row ต้นเดือน +1 ชม. ให้ hub2 (แถวที่สองของ hub2)
    const rowMonthStart = new Date(monthly.start.getTime() + 60 * 60 * 1000);
    await prisma.auditLog.create({
      data: {
        actorId: hub2Id,
        via: 'ui',
        action: 'create',
        entityType: 'character',
        createdAt: rowMonthStart,
      },
    });

    const weeklyBody = await getSummary('period=weekly&roleKey=creator');
    expect(new Date(weeklyBody.from).getTime()).toBe(weekly.start.getTime());
    expect(new Date(weeklyBody.to).getTime()).toBe(weekly.end.getTime());

    const monthlyBody = await getSummary('period=monthly&roleKey=creator');
    expect(monthlyBody.period).toBe('monthly');
    expect(new Date(monthlyBody.from).getTime()).toBe(monthly.start.getTime());
    expect(new Date(monthlyBody.to).getTime()).toBe(monthly.end.getTime());

    // monthly เห็นทั้งสองแถว, weekly เห็นแถวปัจจุบัน (+แถวต้นเดือนถ้าตกในสัปดาห์นี้)
    const monthlyActual = memberOf(monthlyBody, hub2Id)!.targets.find(
      (t) => t.metric === 'character_created',
    )!.actual;
    expect(monthlyActual).toBe(2);

    const monthStartInWeek =
      rowMonthStart >= weekly.start && rowMonthStart < weekly.end ? 1 : 0;
    const weeklyActual = memberOf(weeklyBody, hub2Id)!.targets.find(
      (t) => t.metric === 'character_created',
    )!.actual;
    expect(weeklyActual).toBe(1 + monthStartInWeek);
  });

  it('assignment-summary + user goals → 403 สำหรับ role ที่ไม่มีสิทธิ์ setting (researcher)', async () => {
    await http(app)
      .get('/api/kpi/assignment-summary?period=weekly')
      .set(auth(researcherToken))
      .expect(403);

    await http(app)
      .put('/api/kpi/goals')
      .set(auth(researcherToken))
      .send({
        scope: 'user',
        userId: hub1Id,
        goals: [{ metric: 'character_created', period: 'weekly', target: 5 }],
      })
      .expect(403);
  });

  it('assignment-summary: founder/creative_lead มีสิทธิ์ setting → เข้า Assignment Hub ได้ (ไม่ 403)', async () => {
    const FOUNDER_EMAIL = 'assign-hub-founder@aistar.test';
    const LEAD_EMAIL = 'assign-hub-lead@aistar.test';
    await createUserWithRoles(prisma, FOUNDER_EMAIL, PW, ['founder'], 'Assign Hub Founder');
    await createUserWithRoles(prisma, LEAD_EMAIL, PW, ['creative_lead'], 'Assign Hub Lead');
    const founderToken = await loginAs(app, FOUNDER_EMAIL, PW);
    const leadToken = await loginAs(app, LEAD_EMAIL, PW);

    await http(app)
      .get('/api/kpi/assignment-summary?period=weekly')
      .set(auth(founderToken))
      .expect(200);
    await http(app)
      .get('/api/kpi/assignment-summary?period=weekly')
      .set(auth(leadToken))
      .expect(200);
    // setting C → ตั้งเป้ารายคนได้ด้วย
    await http(app)
      .put('/api/kpi/goals')
      .set(auth(founderToken))
      .send({
        scope: 'user',
        userId: hub1Id,
        goals: [{ metric: 'character_created', period: 'weekly', target: 3 }],
      })
      .expect(200);
  });
});
