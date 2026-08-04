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

const WRITER_EMAIL = 'prod-writer@aistar.test';
const WRITER_PASSWORD = 'prod-writer-2026';
const LEAD_EMAIL = 'prod-lead@aistar.test';
const LEAD_PASSWORD = 'prod-lead-2026';
const OPERATOR_EMAIL = 'prod-operator@aistar.test';
const OPERATOR_PASSWORD = 'prod-operator-2026';
const EDITOR_EMAIL = 'prod-editor@aistar.test';
const EDITOR_PASSWORD = 'prod-editor-2026';

// Production: series/episodes/shots state machines + handoff (§E.2, PRD §12–13)
describe('Production (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let adminToken: string;
  let writerToken: string;
  let leadId: string;
  let operatorId: string;
  let editorId: string;
  let seriesId: string;
  let episodeId: string;
  let shotIds: string[];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await createUserWithRoles(prisma, WRITER_EMAIL, WRITER_PASSWORD, ['script_writer']);
    leadId = await createUserWithRoles(prisma, LEAD_EMAIL, LEAD_PASSWORD, ['creative_lead']);
    operatorId = await createUserWithRoles(prisma, OPERATOR_EMAIL, OPERATOR_PASSWORD, [
      'ai_video_operator',
    ]);
    editorId = await createUserWithRoles(prisma, EDITOR_EMAIL, EDITOR_PASSWORD, ['video_editor']);
    app = await createApp();
    adminToken = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);
    writerToken = await loginAs(app, WRITER_EMAIL, WRITER_PASSWORD);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function walk(id: string, statuses: string[], token = adminToken) {
    for (const status of statuses) {
      await http(app)
        .patch(`/api/episodes/${id}/status`)
        .set(auth(token))
        .send({ status })
        .expect(200);
    }
  }

  it('series + episode create → EP-code, status idea', async () => {
    const series = await http(app)
      .post('/api/series')
      .set(auth(adminToken))
      .send({ name: 'Prod e2e Series', universe: 'AISTAR' })
      .expect(201);
    seriesId = series.body.id;

    const ep = await http(app)
      .post('/api/episodes')
      .set(auth(adminToken))
      .send({ title: 'Prod e2e EP หลัก', seriesId, logline: 'สาวออฟฟิศเจอผีในลิฟต์' })
      .expect(201);
    episodeId = ep.body.id;
    expect(ep.body.displayCode).toMatch(/^EP-\d{4}$/);
    expect(ep.body.status).toBe('idea');
  });

  it('script PATCH creates an EntityVersion snapshot per change', async () => {
    const first = await http(app)
      .patch(`/api/episodes/${episodeId}`)
      .set(auth(adminToken))
      .send({ script: 'ฉากเปิด: ลิฟต์ค้าง ไฟกระพริบ', hook: 'ลิฟต์หยุดเองชั้น 13' })
      .expect(200);
    expect(first.body.scriptVersion).toBe('v1');

    const second = await http(app)
      .patch(`/api/episodes/${episodeId}`)
      .set(auth(adminToken))
      .send({ script: 'ฉากเปิด: ลิฟต์ค้าง ไฟดับสนิท', twist: 'ผีคือแม่บ้านเก่า' })
      .expect(200);
    expect(second.body.scriptVersion).toBe('v2');

    const versions = await http(app)
      .get(`/api/episodes/${episodeId}/versions`)
      .set(auth(adminToken))
      .expect(200);
    expect(versions.body).toHaveLength(2);
    expect(versions.body[0].versionLabel).toBe('v2');
    expect(versions.body[0].snapshot.script).toContain('ไฟดับสนิท');

    // non-script field change does not snapshot
    await http(app)
      .patch(`/api/episodes/${episodeId}`)
      .set(auth(adminToken))
      .send({ season: 'S1' })
      .expect(200);
    const after = await http(app)
      .get(`/api/episodes/${episodeId}/versions`)
      .set(auth(adminToken))
      .expect(200);
    expect(after.body).toHaveLength(2);
  });

  it('idea→script_draft→script_review notifies approver roles', async () => {
    await walk(episodeId, ['script_draft', 'script_review']);

    const rows = await prisma.notification.findMany({
      where: { userId: leadId, type: 'episode_review_request', entityId: episodeId },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].message).toContain('Prod e2e EP หลัก');
  });

  it('script_review→script_approved needs A (+ui): writer 403, admin ok; then shot_breakdown', async () => {
    await http(app)
      .patch(`/api/episodes/${episodeId}/status`)
      .set(auth(writerToken))
      .send({ status: 'script_approved' })
      .expect(403);

    await walk(episodeId, ['script_approved', 'shot_breakdown']);
    const detail = await http(app)
      .get(`/api/episodes/${episodeId}`)
      .set(auth(adminToken))
      .expect(200);
    expect(detail.body.status).toBe('shot_breakdown');
  });

  it('invalid episode transition → 400', async () => {
    await http(app)
      .patch(`/api/episodes/${episodeId}/status`)
      .set(auth(adminToken))
      .send({ status: 'published' })
      .expect(400);
  });

  it('shots: create 3 numbered sequentially, then reorder', async () => {
    shotIds = [];
    for (const action of ['เปิดลิฟต์', 'ไฟดับ', 'เผชิญหน้าผี']) {
      const res = await http(app)
        .post(`/api/episodes/${episodeId}/shots`)
        .set(auth(adminToken))
        .send({ action, camera: 'medium', durationSec: 5 })
        .expect(201);
      shotIds.push(res.body.id);
    }
    const list = await http(app)
      .get('/api/shots')
      .query({ episodeId })
      .set(auth(adminToken))
      .expect(200);
    expect(list.body.items.map((s: { shotNumber: number }) => s.shotNumber)).toEqual([1, 2, 3]);

    const reversed = [...shotIds].reverse();
    await http(app)
      .post(`/api/episodes/${episodeId}/shots/reorder`)
      .set(auth(adminToken))
      .send({ shotIds: reversed })
      .expect(201);

    const after = await http(app)
      .get('/api/shots')
      .query({ episodeId })
      .set(auth(adminToken))
      .expect(200);
    expect(after.body.items.map((s: { id: string }) => s.id)).toEqual(reversed);

    // reorder must include every shot exactly once
    await http(app)
      .post(`/api/episodes/${episodeId}/shots/reorder`)
      .set(auth(adminToken))
      .send({ shotIds: [shotIds[0]] })
      .expect(400);
  });

  it('shot state machine: invalid jump 400; selected→approved needs A', async () => {
    const shotId = shotIds[0];
    await http(app)
      .patch(`/api/shots/${shotId}/status`)
      .set(auth(adminToken))
      .send({ status: 'generated' })
      .expect(400); // planned → generated skips the machine

    for (const status of ['prompt_ready', 'generating', 'generated', 'selected']) {
      await http(app)
        .patch(`/api/shots/${shotId}/status`)
        .set(auth(adminToken))
        .send({ status })
        .expect(200);
    }

    // writer has episode C but no A → approve blocked
    await http(app)
      .patch(`/api/shots/${shotId}/status`)
      .set(auth(writerToken))
      .send({ status: 'approved' })
      .expect(403);

    const approved = await http(app)
      .patch(`/api/shots/${shotId}/status`)
      .set(auth(adminToken))
      .send({ status: 'approved' })
      .expect(200);
    expect(approved.body.status).toBe('approved');
  });

  describe('production handoff (§E.2)', () => {
    let handoffEpisodeId: string;

    beforeAll(async () => {
      const ep = await http(app)
        .post('/api/episodes')
        .set(auth(adminToken))
        .send({ title: 'Prod e2e EP handoff', script: 'สคริปต์พร้อมถ่าย' })
        .expect(201);
      handoffEpisodeId = ep.body.id;
    });

    it('handoff on wrong status → 400', async () => {
      await http(app)
        .post(`/api/episodes/${handoffEpisodeId}/handoff`)
        .set(auth(adminToken))
        .send({ operatorId })
        .expect(400);
    });

    it('handoff without shots → 400', async () => {
      await walk(handoffEpisodeId, [
        'script_draft',
        'script_review',
        'script_approved',
        'shot_breakdown',
      ]);
      await http(app)
        .post(`/api/episodes/${handoffEpisodeId}/handoff`)
        .set(auth(adminToken))
        .send({ operatorId })
        .expect(400);
    });

    it('handoff creates gen+edit tasks, notifies assignees, moves episode to production', async () => {
      for (const action of ['ช็อตเปิด', 'ช็อตจบ']) {
        await http(app)
          .post(`/api/episodes/${handoffEpisodeId}/shots`)
          .set(auth(adminToken))
          .send({ action })
          .expect(201);
      }

      const res = await http(app)
        .post(`/api/episodes/${handoffEpisodeId}/handoff`)
        .set(auth(adminToken))
        .send({ operatorId, editorId })
        .expect(201);
      expect(res.body).toMatchObject({ taskCount: 3, shotCount: 2, status: 'production' });

      const genTasks = await http(app)
        .get('/api/tasks')
        .query({ createdFrom: 'handoff', assigneeId: operatorId, entityType: 'shot' })
        .set(auth(adminToken))
        .expect(200);
      expect(genTasks.body.total).toBe(2);

      const editTasks = await http(app)
        .get('/api/tasks')
        .query({ createdFrom: 'handoff', assigneeId: editorId, entityId: handoffEpisodeId })
        .set(auth(adminToken))
        .expect(200);
      expect(editTasks.body.total).toBe(1);
      expect(editTasks.body.items[0].title).toContain('ตัดต่อ');

      const notif = await prisma.notification.findMany({
        where: { entityId: handoffEpisodeId, type: 'task_assigned' },
      });
      expect(notif.map((n) => n.userId).sort()).toEqual([operatorId, editorId].sort());

      // second handoff blocked — episode already in production
      await http(app)
        .post(`/api/episodes/${handoffEpisodeId}/handoff`)
        .set(auth(adminToken))
        .send({ operatorId })
        .expect(400);
    });
  });
});
