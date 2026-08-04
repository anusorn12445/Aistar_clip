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

// Visibility Scope (row-level viewScope 'all'|'own') — RolePermission.viewScope
//   content: own = ownerId หรือ reviewerId เป็นตัวเอง
//   episode: own = ownerId ตัวเอง + อีพีไร้เจ้าของ (ownerId null) เห็นได้ทุกคน · shots/storyboard สืบทอด
//   หลาย role → most-permissive wins (มี 'all' สักตัว → all)
// ใช้ role เฉพาะกิจ (vsc_*) — ไม่แตะ viewScope ของ role ที่ seed ไว้ (default 'all' ต้องเป็น no-op)

const A_EMAIL = 'vscope-a@aistar.test';
const B_EMAIL = 'vscope-b@aistar.test';
const MULTI_EMAIL = 'vscope-multi@aistar.test';
const VIEWER_EMAIL = 'vscope-viewer@aistar.test';
// scope 'team' — T1/T2 อยู่ทีมเดียวกัน · T3 = own+team (most-permissive → team) · MULTI2 = team+all (→ all)
const T1_EMAIL = 'vscope-t1@aistar.test';
const T2_EMAIL = 'vscope-t2@aistar.test';
const T3_EMAIL = 'vscope-t3@aistar.test';
const MULTI2_EMAIL = 'vscope-multi2@aistar.test';
const PASSWORD = 'vscope-e2e-2026';

const MARK = `vscope${Date.now()}`;

async function ensureRole(
  prisma: PrismaClient,
  key: string,
  perms: { module: string; actions: string[]; viewScope: string }[],
) {
  const role = await prisma.role.upsert({
    where: { key },
    update: {},
    create: { key, name: `E2E ${key}` },
  });
  for (const p of perms) {
    await prisma.rolePermission.upsert({
      where: { roleId_module: { roleId: role.id, module: p.module } },
      update: { actions: p.actions, viewScope: p.viewScope },
      create: { roleId: role.id, module: p.module, actions: p.actions, viewScope: p.viewScope },
    });
  }
}

describe('Visibility Scope — row-level viewScope (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let adminToken: string;
  let aToken: string;
  let bToken: string;
  let multiToken: string;
  let viewerToken: string;
  let t1Token: string;
  let t2Token: string;
  let t3Token: string;
  let multi2Token: string;
  let aId: string;
  let bId: string;
  let t1Id: string;
  let t2Id: string;
  let t3Id: string;
  let teamId: string;

  // fixtures
  let contentA: string; // ของ userA
  let contentB: string; // ของ userB (foreign ต่อ userA)
  let epA: string; // owner = userA
  let epB: string; // owner = userB
  let epNone: string; // ไม่มีเจ้าของ (legacy/shared)

  beforeAll(async () => {
    prisma = new PrismaClient();

    // role เฉพาะกิจ: เริ่มที่ 'all' แล้ว flip เป็น 'own' ผ่าน API (ทดสอบ endpoint จริง)
    await ensureRole(prisma, 'vsc_content', [
      { module: 'content', actions: ['V', 'C', 'A'], viewScope: 'all' },
    ]);
    await ensureRole(prisma, 'vsc_episode_own', [
      { module: 'episode', actions: ['V', 'C'], viewScope: 'own' },
    ]);
    await ensureRole(prisma, 'vsc_all', [
      { module: 'content', actions: ['V'], viewScope: 'all' },
      { module: 'episode', actions: ['V'], viewScope: 'all' },
    ]);
    // scope 'team' — character V เพิ่มให้เข้า dashboard ได้ (guard ของ GET /dashboard)
    await ensureRole(prisma, 'vsc_team', [
      { module: 'content', actions: ['V', 'C'], viewScope: 'team' },
      { module: 'episode', actions: ['V'], viewScope: 'team' },
      { module: 'character', actions: ['V'], viewScope: 'all' },
    ]);

    // character V เฉย ๆ — ให้ B เปิด dashboard ได้ (ทดสอบตัวเลขฝั่ง scope 'own')
    await ensureRole(prisma, 'vsc_dash', [
      { module: 'character', actions: ['V'], viewScope: 'all' },
    ]);

    aId = await createUserWithRoles(prisma, A_EMAIL, PASSWORD, ['vsc_content', 'vsc_episode_own']);
    bId = await createUserWithRoles(prisma, B_EMAIL, PASSWORD, [
      'vsc_content',
      'vsc_episode_own',
      'vsc_dash',
    ]);
    await createUserWithRoles(prisma, MULTI_EMAIL, PASSWORD, [
      'vsc_content',
      'vsc_episode_own',
      'vsc_all',
    ]);
    await createUserWithRoles(prisma, VIEWER_EMAIL, PASSWORD, ['vsc_all']);
    t1Id = await createUserWithRoles(prisma, T1_EMAIL, PASSWORD, ['vsc_team']);
    t2Id = await createUserWithRoles(prisma, T2_EMAIL, PASSWORD, ['vsc_team']);
    t3Id = await createUserWithRoles(prisma, T3_EMAIL, PASSWORD, ['vsc_content', 'vsc_team']);
    await createUserWithRoles(prisma, MULTI2_EMAIL, PASSWORD, ['vsc_team', 'vsc_all']);

    app = await createApp();
    adminToken = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);
    aToken = await loginAs(app, A_EMAIL, PASSWORD);
    bToken = await loginAs(app, B_EMAIL, PASSWORD);
    multiToken = await loginAs(app, MULTI_EMAIL, PASSWORD);
    viewerToken = await loginAs(app, VIEWER_EMAIL, PASSWORD);
    t1Token = await loginAs(app, T1_EMAIL, PASSWORD);
    t2Token = await loginAs(app, T2_EMAIL, PASSWORD);
    t3Token = await loginAs(app, T3_EMAIL, PASSWORD);
    multi2Token = await loginAs(app, MULTI2_EMAIL, PASSWORD);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  // ── 1. role-permission endpoint ────────────────────────────

  it('PATCH /roles/:key/permissions/:module accepts viewScope', async () => {
    const res = await http(app)
      .patch('/api/roles/vsc_content/permissions/content')
      .set(auth(adminToken))
      .send({ viewScope: 'own' })
      .expect(200);
    expect(res.body.viewScope).toBe('own');
    expect(res.body.module).toBe('content');

    // matrix endpoint สะท้อนค่าใหม่
    const matrix = await http(app).get('/api/roles/permissions').set(auth(adminToken)).expect(200);
    const role = matrix.body.find((r: { key: string }) => r.key === 'vsc_content');
    expect(role.permissions).toEqual(
      expect.arrayContaining([expect.objectContaining({ module: 'content', viewScope: 'own' })]),
    );
  });

  it('PATCH viewScope rejects bad value → 400', async () => {
    await http(app)
      .patch('/api/roles/vsc_content/permissions/content')
      .set(auth(adminToken))
      .send({ viewScope: 'everything' })
      .expect(400);
  });

  it('PATCH viewScope on module the role has no permission for → 404', async () => {
    await http(app)
      .patch('/api/roles/vsc_content/permissions/episode')
      .set(auth(adminToken))
      .send({ viewScope: 'own' })
      .expect(404);
  });

  // ── 2. content scope 'own' ─────────────────────────────────

  it('content list: user เห็นเฉพาะงานตัวเอง (owner) เมื่อ scope=own', async () => {
    const mk = (t: string) =>
      http(app).post('/api/content-items').send({ title: t, platform: 'tiktok' });
    const resA = await mk(`${MARK} ของ A`).set(auth(aToken)).expect(201);
    const resB = await mk(`${MARK} ของ B`).set(auth(bToken)).expect(201);
    contentA = resA.body.id;
    contentB = resB.body.id;

    const list = await http(app)
      .get(`/api/content-items?q=${MARK}`)
      .set(auth(aToken))
      .expect(200);
    const ids = list.body.items.map((i: { id: string }) => i.id);
    expect(ids).toContain(contentA);
    expect(ids).not.toContain(contentB);
  });

  it('content detail: ของคนอื่น → 404, ของตัวเอง → 200 (พร้อม owner)', async () => {
    await http(app).get(`/api/content-items/${contentB}`).set(auth(aToken)).expect(404);
    const res = await http(app).get(`/api/content-items/${contentA}`).set(auth(aToken)).expect(200);
    expect(res.body.owner).toMatchObject({ id: aId });
  });

  it('reviewer เห็นงานที่ตัวเองเป็นผู้ตรวจ แม้ scope=own', async () => {
    await prisma.contentItem.update({ where: { id: contentB }, data: { reviewerId: aId } });
    await http(app).get(`/api/content-items/${contentB}`).set(auth(aToken)).expect(200);
    const list = await http(app)
      .get(`/api/content-items?q=${MARK}`)
      .set(auth(aToken))
      .expect(200);
    expect(list.body.items.map((i: { id: string }) => i.id)).toContain(contentB);
    // ล้าง reviewer กลับ — เทสต์ถัดไปต้องเห็น contentB เป็น foreign อีกครั้ง
    await prisma.contentItem.update({ where: { id: contentB }, data: { reviewerId: null } });
  });

  it('most-permissive wins: user มี role own + role all → เห็นทั้งหมด', async () => {
    await http(app).get(`/api/content-items/${contentB}`).set(auth(multiToken)).expect(200);
    const list = await http(app)
      .get(`/api/content-items?q=${MARK}`)
      .set(auth(multiToken))
      .expect(200);
    const ids = list.body.items.map((i: { id: string }) => i.id);
    expect(ids).toEqual(expect.arrayContaining([contentA, contentB]));
  });

  it('admin (default all) เห็นครบ — พฤติกรรมเดิมไม่เปลี่ยน', async () => {
    const list = await http(app)
      .get(`/api/content-items?q=${MARK}`)
      .set(auth(adminToken))
      .expect(200);
    const ids = list.body.items.map((i: { id: string }) => i.id);
    expect(ids).toEqual(expect.arrayContaining([contentA, contentB]));
  });

  // ── 3. episode scope 'own' (+ ownerId management) ──────────

  it('PATCH /episodes/:id ตั้ง ownerId ได้ และคืนค่า owner ใน detail', async () => {
    const mkEp = async (title: string) => {
      const res = await http(app)
        .post('/api/episodes')
        .set(auth(adminToken))
        .send({ title })
        .expect(201);
      return res.body.id as string;
    };
    epA = await mkEp(`${MARK} EP ของ A`);
    epB = await mkEp(`${MARK} EP ของ B`);
    epNone = await mkEp(`${MARK} EP ไร้เจ้าของ`);
    // create() default ownerId = ผู้สร้าง (admin) แล้ว → เคลียร์เจ้าของให้เป็นอีพี "ไร้เจ้าของ" จริง
    await http(app)
      .patch(`/api/episodes/${epNone}`)
      .set(auth(adminToken))
      .send({ ownerId: null })
      .expect(200);

    const patched = await http(app)
      .patch(`/api/episodes/${epA}`)
      .set(auth(adminToken))
      .send({ ownerId: aId })
      .expect(200);
    expect(patched.body.ownerId).toBe(aId);
    await http(app)
      .patch(`/api/episodes/${epB}`)
      .set(auth(adminToken))
      .send({ ownerId: bId })
      .expect(200);

    const detail = await http(app).get(`/api/episodes/${epA}`).set(auth(adminToken)).expect(200);
    expect(detail.body.owner).toMatchObject({ id: aId });
  });

  it('PATCH ownerId ที่ไม่มีอยู่จริง → 404', async () => {
    await http(app)
      .patch(`/api/episodes/${epA}`)
      .set(auth(adminToken))
      .send({ ownerId: '00000000-0000-4000-8000-000000000000' })
      .expect(404);
  });

  it('episode list scope=own: เห็นของตัวเอง + ไร้เจ้าของ แต่ไม่เห็นของคนอื่น', async () => {
    const list = await http(app).get(`/api/episodes?q=${MARK}`).set(auth(aToken)).expect(200);
    const ids = list.body.items.map((i: { id: string }) => i.id);
    expect(ids).toEqual(expect.arrayContaining([epA, epNone]));
    expect(ids).not.toContain(epB);
  });

  it('episode detail scope=own: ของคนอื่น → 404, ไร้เจ้าของ → 200', async () => {
    await http(app).get(`/api/episodes/${epB}`).set(auth(aToken)).expect(404);
    await http(app).get(`/api/episodes/${epNone}`).set(auth(aToken)).expect(200);
  });

  it('shots + storyboard สืบทอด scope จาก episode', async () => {
    // สร้าง shot ในอีพีของ A และของ B (โดย admin)
    await http(app)
      .post(`/api/episodes/${epA}/shots`)
      .set(auth(adminToken))
      .send({ action: `${MARK} shot A` })
      .expect(201);
    await http(app)
      .post(`/api/episodes/${epB}/shots`)
      .set(auth(adminToken))
      .send({ action: `${MARK} shot B` })
      .expect(201);

    // list shots ของ epB ในสายตา userA → ว่าง (กรองทิ้ง ไม่ error)
    const shotsB = await http(app)
      .get(`/api/shots?episodeId=${epB}`)
      .set(auth(aToken))
      .expect(200);
    expect(shotsB.body.items).toHaveLength(0);
    // ของตัวเองเห็นปกติ
    const shotsA = await http(app)
      .get(`/api/shots?episodeId=${epA}`)
      .set(auth(aToken))
      .expect(200);
    expect(shotsA.body.items.length).toBeGreaterThan(0);

    // storyboard: อีพีคนอื่น → 404, ของตัวเอง → 200
    await http(app).get(`/api/episodes/${epB}/storyboard`).set(auth(aToken)).expect(404);
    await http(app).get(`/api/episodes/${epA}/storyboard`).set(auth(aToken)).expect(200);
  });

  // ── 4. global search ───────────────────────────────────────

  it('search กรองผล contents/episodes ตาม scope', async () => {
    const res = await http(app)
      .get(`/api/search?q=${MARK}&types=contents,episodes`)
      .set(auth(aToken))
      .expect(200);
    const ids = res.body.map((r: { id: string }) => r.id);
    expect(ids).toEqual(expect.arrayContaining([contentA, epA, epNone]));
    expect(ids).not.toContain(contentB);
    expect(ids).not.toContain(epB);

    // admin (scope all) เห็นครบ
    const all = await http(app)
      .get(`/api/search?q=${MARK}&types=contents,episodes`)
      .set(auth(adminToken))
      .expect(200);
    const allIds = all.body.map((r: { id: string }) => r.id);
    expect(allIds).toEqual(expect.arrayContaining([contentA, contentB, epA, epB, epNone]));
  });

  // ── 5. permission 403 ไม่ถูกกระทบ ──────────────────────────

  it('viewScope ไม่เปลี่ยนกติกา permission: content V อย่างเดียว POST → 403', async () => {
    await http(app)
      .post('/api/content-items')
      .set(auth(viewerToken))
      .send({ title: `${MARK} ห้ามสร้าง`, platform: 'tiktok' })
      .expect(403);
  });

  // ── 6. viewScope 'team' — เห็นงานของสมาชิกทีมเดียวกัน ───────

  let contentT1: string;
  let contentT2: string;
  let epT1: string;
  let epT2: string;

  it('PATCH /roles/:key/permissions/:module ยอมรับค่า team', async () => {
    const res = await http(app)
      .patch('/api/roles/vsc_team/permissions/content')
      .set(auth(adminToken))
      .send({ viewScope: 'team' })
      .expect(200);
    expect(res.body.viewScope).toBe('team');
  });

  it('scope team: user เห็นงานตัวเอง + ของเพื่อนร่วมทีม แต่ไม่เห็นของคนนอกทีม', async () => {
    // ทีมผ่าน API จริง (admin มี user X)
    const team = await http(app)
      .post('/api/teams')
      .set(auth(adminToken))
      .send({ name: `E2E scope team ${MARK}` })
      .expect(201);
    teamId = team.body.id;
    await http(app)
      .put(`/api/teams/${teamId}/members`)
      .set(auth(adminToken))
      .send({ userIds: [t1Id, t2Id, t3Id] })
      .expect(200);

    const mk = (t: string, token: string) =>
      http(app)
        .post('/api/content-items')
        .set(auth(token))
        .send({ title: t, platform: 'tiktok' })
        .expect(201);
    contentT1 = (await mk(`${MARK} ของ T1`, t1Token)).body.id;
    contentT2 = (await mk(`${MARK} ของ T2`, t2Token)).body.id;

    const list = await http(app).get(`/api/content-items?q=${MARK}`).set(auth(t1Token)).expect(200);
    const ids = list.body.items.map((i: { id: string }) => i.id);
    expect(ids).toEqual(expect.arrayContaining([contentT1, contentT2]));
    expect(ids).not.toContain(contentB); // B อยู่นอกทีม

    // detail: ของเพื่อนร่วมทีม → 200, ของคนนอกทีม → 404
    await http(app).get(`/api/content-items/${contentT2}`).set(auth(t1Token)).expect(200);
    await http(app).get(`/api/content-items/${contentB}`).set(auth(t1Token)).expect(404);
  });

  it('scope team: episode เห็นของทีม + อีพีไร้เจ้าของ แต่ไม่เห็นของคนนอก', async () => {
    const mkEp = async (title: string, ownerId: string) => {
      const res = await http(app)
        .post('/api/episodes')
        .set(auth(adminToken))
        .send({ title })
        .expect(201);
      await http(app)
        .patch(`/api/episodes/${res.body.id}`)
        .set(auth(adminToken))
        .send({ ownerId })
        .expect(200);
      return res.body.id as string;
    };
    epT1 = await mkEp(`${MARK} EP ของ T1`, t1Id);
    epT2 = await mkEp(`${MARK} EP ของ T2`, t2Id);

    const list = await http(app).get(`/api/episodes?q=${MARK}`).set(auth(t1Token)).expect(200);
    const ids = list.body.items.map((i: { id: string }) => i.id);
    expect(ids).toEqual(expect.arrayContaining([epT1, epT2, epNone]));
    expect(ids).not.toContain(epA);
    expect(ids).not.toContain(epB);
  });

  it('most-permissive: own+team → team (เห็นงานเพื่อนร่วมทีม)', async () => {
    const list = await http(app).get(`/api/content-items?q=${MARK}`).set(auth(t3Token)).expect(200);
    const ids = list.body.items.map((i: { id: string }) => i.id);
    expect(ids).toEqual(expect.arrayContaining([contentT1, contentT2]));
    expect(ids).not.toContain(contentB);
  });

  it('most-permissive: team+all → all (เห็นครบรวมของคนนอกทีม)', async () => {
    const list = await http(app)
      .get(`/api/content-items?q=${MARK}`)
      .set(auth(multi2Token))
      .expect(200);
    const ids = list.body.items.map((i: { id: string }) => i.id);
    expect(ids).toEqual(expect.arrayContaining([contentT1, contentT2, contentA, contentB]));
  });

  it('dashboard: ตัวเลข content/episode กรองตาม scope (own/team) — all ไม่กรอง', async () => {
    const sum = (m: Record<string, number>) => Object.values(m).reduce((a, b) => a + b, 0);
    const teamIds = [t1Id, t2Id, t3Id];

    // team: pipeline.content ต้องเท่ากับจำนวนงานของสมาชิกทีมเป๊ะ ๆ (owner/reviewer ในทีม)
    const expectedTeam = await prisma.contentItem.count({
      where: {
        archivedAt: null,
        OR: [{ ownerId: { in: teamIds } }, { reviewerId: { in: teamIds } }],
      },
    });
    const t1Dash = await http(app).get('/api/dashboard').set(auth(t1Token)).expect(200);
    expect(sum(t1Dash.body.pipeline.content)).toBe(expectedTeam);

    // all (admin): เท่ากับจำนวนงานทั้งหมด — no-op เหมือนเดิม
    const expectedAll = await prisma.contentItem.count({ where: { archivedAt: null } });
    const adminDash = await http(app).get('/api/dashboard').set(auth(adminToken)).expect(200);
    expect(sum(adminDash.body.pipeline.content)).toBe(expectedAll);

    // own (B): เท่ากับงานที่ B เป็น owner/reviewer เท่านั้น
    const expectedOwn = await prisma.contentItem.count({
      where: {
        archivedAt: null,
        OR: [{ ownerId: bId }, { reviewerId: bId }],
      },
    });
    const bDash = await http(app).get('/api/dashboard').set(auth(bToken)).expect(200);
    expect(sum(bDash.body.pipeline.content)).toBe(expectedOwn);
    expect(expectedAll).toBeGreaterThan(expectedOwn);
  });

  it('calendar: กรองตาม scope เหมือนหน้า list', async () => {
    const now = new Date();
    await prisma.contentItem.updateMany({
      where: { id: { in: [contentT1, contentT2, contentB] } },
      data: { scheduledAt: now },
    });
    const from = new Date(now.getTime() - 60_000).toISOString();
    const to = new Date(now.getTime() + 60_000).toISOString();

    const t1Cal = await http(app)
      .get(`/api/content-items/calendar?from=${from}&to=${to}`)
      .set(auth(t1Token))
      .expect(200);
    const t1Ids = t1Cal.body.items.map((i: { id: string }) => i.id);
    expect(t1Ids).toEqual(expect.arrayContaining([contentT1, contentT2]));
    expect(t1Ids).not.toContain(contentB);

    const adminCal = await http(app)
      .get(`/api/content-items/calendar?from=${from}&to=${to}`)
      .set(auth(adminToken))
      .expect(200);
    const adminIds = adminCal.body.items.map((i: { id: string }) => i.id);
    expect(adminIds).toEqual(expect.arrayContaining([contentT1, contentT2, contentB]));
  });

  it('ทีมที่ archive แล้วไม่นับ — scope team หดกลับเป็นเห็นเฉพาะของตัวเอง', async () => {
    await http(app)
      .patch(`/api/teams/${teamId}`)
      .set(auth(adminToken))
      .send({ status: 'archived' })
      .expect(200);
    const list = await http(app).get(`/api/content-items?q=${MARK}`).set(auth(t1Token)).expect(200);
    const ids = list.body.items.map((i: { id: string }) => i.id);
    expect(ids).toContain(contentT1);
    expect(ids).not.toContain(contentT2);
  });
});
