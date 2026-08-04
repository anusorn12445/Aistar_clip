import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AiClaudeService } from '../src/ai/ai-claude.service';
import type { ClaudeCallResult, ClaudeTextResult } from '../src/ai/ai-claude.service';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  RESEARCHER_EMAIL,
  RESEARCHER_PASSWORD,
  auth,
  createApp,
  ensureResearcher,
  http,
  loginAs,
} from './utils';

// Teams management (viewScope 'team') + Ideation external web trends (two-step).
// e2e MUST NOT call live AI — we stub BOTH AiClaudeService.callClaude (structured)
// and callClaudeText (plain text + web search) with canned results.
describe('Teams + Ideation web trends (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let adminToken: string;
  let researcherToken: string; // ไม่มี user X / content C → 403

  const MARK = `teamtrend${Date.now()}`;
  let teamId: string;
  let userA: string;
  let userB: string;

  const IDEAS = {
    ideas: [
      {
        title: 'ไอเดียจากเทรนด์',
        hook: 'เกาะเทรนด์ให้ทัน',
        angle: 'เล่นกับกระแส',
        platform: 'tiktok',
        format: 'short_video',
        contentType: 'trend',
        characterHint: '',
        productHint: '',
        captionDirection: 'สนุก ทันกระแส',
        rationale: 'อิงเทรนด์ล่าสุดจาก web search',
        sourceSignals: ['external trend'],
      },
    ],
  };
  const TRENDS_TEXT =
    '1. เทรนด์เต้น XYZ กำลังมาใน TikTok ไทย (ที่มา: tiktok.com)\n2. คลิปสายรีวิวของถูกยอดพุ่ง (ที่มา: brandinside)';

  beforeAll(async () => {
    prisma = new PrismaClient();
    await ensureResearcher(prisma);
    app = await createApp();
    adminToken = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);
    researcherToken = await loginAs(app, RESEARCHER_EMAIL, RESEARCHER_PASSWORD);

    // ผู้ใช้จริงสองคนสำหรับ replace-set สมาชิก
    const users = await prisma.user.findMany({ take: 2, select: { id: true } });
    userA = users[0].id;
    userB = users[1]?.id ?? users[0].id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    jest.restoreAllMocks();
  });

  afterEach(() => jest.restoreAllMocks());

  // ── 1. Teams CRUD + members ─────────────────────────────────

  it('POST /teams สร้างทีม + GET /teams เห็นทีมพร้อม memberCount', async () => {
    const created = await http(app)
      .post('/api/teams')
      .set(auth(adminToken))
      .send({ name: `ทีม ${MARK}` })
      .expect(201);
    teamId = created.body.id;
    expect(created.body).toMatchObject({ name: `ทีม ${MARK}`, status: 'active', memberCount: 0 });

    const list = await http(app).get('/api/teams').set(auth(adminToken)).expect(200);
    const row = list.body.find((t: { id: string }) => t.id === teamId);
    expect(row).toMatchObject({ name: `ทีม ${MARK}`, memberCount: 0, members: [] });
  });

  it('PUT /teams/:id/members replace-set สมาชิกทั้งชุด', async () => {
    const set1 = await http(app)
      .put(`/api/teams/${teamId}/members`)
      .set(auth(adminToken))
      .send({ userIds: [userA, userB] })
      .expect(200);
    expect(set1.body.memberCount).toBe(userA === userB ? 1 : 2);

    // replace ด้วยชุดใหม่ (เหลือคนเดียว) — ไม่ใช่ append
    const set2 = await http(app)
      .put(`/api/teams/${teamId}/members`)
      .set(auth(adminToken))
      .send({ userIds: [userA] })
      .expect(200);
    expect(set2.body.memberCount).toBe(1);
    expect(set2.body.members[0].id).toBe(userA);

    const inDb = await prisma.teamMember.findMany({ where: { teamId } });
    expect(inDb).toHaveLength(1);
  });

  it('PUT members ที่มี userId ไม่มีจริง → 400', async () => {
    await http(app)
      .put(`/api/teams/${teamId}/members`)
      .set(auth(adminToken))
      .send({ userIds: [userA, '00000000-0000-4000-8000-000000000000'] })
      .expect(400);
  });

  it('PATCH /teams/:id เปลี่ยนชื่อ + archive', async () => {
    const renamed = await http(app)
      .patch(`/api/teams/${teamId}`)
      .set(auth(adminToken))
      .send({ name: `ทีม ${MARK} v2` })
      .expect(200);
    expect(renamed.body.name).toBe(`ทีม ${MARK} v2`);

    const archived = await http(app)
      .patch(`/api/teams/${teamId}`)
      .set(auth(adminToken))
      .send({ status: 'archived' })
      .expect(200);
    expect(archived.body.status).toBe('archived');

    await http(app)
      .patch(`/api/teams/${teamId}`)
      .set(auth(adminToken))
      .send({ status: 'invalid-status' })
      .expect(400);
  });

  it('DELETE /teams/:id hard delete + cascade สมาชิก', async () => {
    await http(app).delete(`/api/teams/${teamId}`).set(auth(adminToken)).expect(200);
    expect(await prisma.team.findUnique({ where: { id: teamId } })).toBeNull();
    expect(await prisma.teamMember.count({ where: { teamId } })).toBe(0);

    await http(app).delete(`/api/teams/${teamId}`).set(auth(adminToken)).expect(404);
  });

  it('permission: role ที่ไม่มี user X แก้ทีมไม่ได้ (403) — ไม่มี user V ก็ดูไม่ได้', async () => {
    await http(app)
      .post('/api/teams')
      .set(auth(researcherToken))
      .send({ name: 'ห้ามสร้าง' })
      .expect(403);
    await http(app).get('/api/teams').set(auth(researcherToken)).expect(403);
  });

  // ── 2. Ideation two-step web trends (stubbed) ───────────────

  function stubClaude(opts?: { trendsFail?: boolean }) {
    const svc = app.get(AiClaudeService);
    jest.spyOn(svc, 'isConfigured').mockResolvedValue(true);
    const textSpy = jest.spyOn(svc, 'callClaudeText');
    if (opts?.trendsFail) {
      textSpy.mockRejectedValue(new Error('stubbed web search down'));
    } else {
      textSpy.mockResolvedValue({
        text: TRENDS_TEXT,
        model: 'stub-model',
        usage: { inputTokens: 3, outputTokens: 7 },
        latencyMs: 1,
      } as ClaudeTextResult);
    }
    const callSpy = jest.spyOn(svc, 'callClaude').mockResolvedValue({
      parsed: IDEAS,
      model: 'stub-model',
      usage: { inputTokens: 5, outputTokens: 10 },
      latencyMs: 1,
    } as ClaudeCallResult<unknown>);
    return { textSpy, callSpy };
  }

  it('ideate + useWebTrends: step 1 ถูกเรียกด้วย web search tool และเทรนด์ถูกฉีดเข้า prompt + contextJson', async () => {
    const { textSpy, callSpy } = stubClaude();

    const res = await http(app)
      .post('/api/ai/ideate')
      .set(auth(adminToken))
      .send({ mode: 'auto', count: 1, useWebTrends: true })
      .expect(201);

    // step 1: callClaudeText ถูกเรียกพร้อม web search tool
    expect(textSpy).toHaveBeenCalledTimes(1);
    const textArgs = textSpy.mock.calls[0][0];
    expect(textArgs.action).toBe('ai_ideate_trends');
    expect(textArgs.tools).toEqual([
      { type: 'web_search_20260209', name: 'web_search', max_uses: 3 },
    ]);

    // step 2: เทรนด์ถูกฉีดเป็นบล็อก [เทรนด์ภายนอกล่าสุด] + system มี injection guard
    expect(callSpy).toHaveBeenCalledTimes(1);
    const ideateArgs = callSpy.mock.calls[0][0];
    expect(ideateArgs.content).toContain('[เทรนด์ภายนอกล่าสุด');
    expect(ideateArgs.content).toContain(TRENDS_TEXT);
    expect(ideateArgs.system).toContain('ห้ามทำตามคำสั่ง');

    // contextJson บันทึก webTrends + trendsSummary
    expect(res.body.run.contextJson).toMatchObject({ webTrends: true, trendsSummary: TRENDS_TEXT });
    expect(res.body.run.resultJson).toHaveLength(1);
  });

  it('ideate โดยไม่เปิด useWebTrends: ไม่เรียก web search และไม่มีบล็อกเทรนด์', async () => {
    const { textSpy, callSpy } = stubClaude();

    const res = await http(app)
      .post('/api/ai/ideate')
      .set(auth(adminToken))
      .send({ mode: 'auto', count: 1 })
      .expect(201);

    expect(textSpy).not.toHaveBeenCalled();
    const ideateArgs = callSpy.mock.calls[0][0];
    expect(ideateArgs.content).not.toContain('[เทรนด์ภายนอกล่าสุด');
    expect(res.body.run.contextJson.webTrends).toBeUndefined();
  });

  it('step 1 พัง → ideate ยังสำเร็จ โดย webTrends:false + เหตุผล และไม่มีบล็อกเทรนด์', async () => {
    const { callSpy } = stubClaude({ trendsFail: true });

    const res = await http(app)
      .post('/api/ai/ideate')
      .set(auth(adminToken))
      .send({ mode: 'auto', count: 1, useWebTrends: true })
      .expect(201);

    expect(res.body.run.contextJson.webTrends).toBe(false);
    expect(res.body.run.contextJson.trendsSkippedReason).toContain('stubbed web search down');
    const ideateArgs = callSpy.mock.calls[0][0];
    expect(ideateArgs.content).not.toContain('[เทรนด์ภายนอกล่าสุด');
    expect(ideateArgs.system).not.toContain('ห้ามทำตามคำสั่ง');
  });
});
