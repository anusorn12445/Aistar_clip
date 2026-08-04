import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
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

// Intelligence: ideas (§19), postits (§20), competitors (§18)
describe('Intelligence (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let adminToken: string;
  let researcherToken: string;
  let adminId: string;
  let researcherId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await ensureResearcher(prisma);
    app = await createApp();
    adminToken = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);
    researcherToken = await loginAs(app, RESEARCHER_EMAIL, RESEARCHER_PASSWORD);
    adminId = (await prisma.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } })).id;
    researcherId = (await prisma.user.findUniqueOrThrow({ where: { email: RESEARCHER_EMAIL } })).id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('ideas', () => {
    let ideaId: string;

    it('quick-add → captured; forward-only status machine', async () => {
      const res = await http(app)
        .post('/api/ideas')
        .set(auth(researcherToken))
        .send({ title: 'Intel e2e ไอเดีย hook เปิดกล้องหน้า', ideaType: 'hook' })
        .expect(201);
      ideaId = res.body.id;
      expect(res.body.status).toBe('captured');

      // forward jump allowed (captured → shortlisted)
      const forward = await http(app)
        .patch(`/api/ideas/${ideaId}/status`)
        .set(auth(researcherToken))
        .send({ status: 'shortlisted' })
        .expect(200);
      expect(forward.body.status).toBe('shortlisted');

      // backward → 400
      await http(app)
        .patch(`/api/ideas/${ideaId}/status`)
        .set(auth(researcherToken))
        .send({ status: 'captured' })
        .expect(400);

      // converted only via /convert
      await http(app)
        .patch(`/api/ideas/${ideaId}/status`)
        .set(auth(researcherToken))
        .send({ status: 'converted' })
        .expect(400);
    });

    it('researcher cannot convert to campaign (no campaign C)', async () => {
      await http(app)
        .post(`/api/ideas/${ideaId}/convert`)
        .set(auth(researcherToken))
        .send({ to: 'campaign' })
        .expect(403);
    });

    it('convert-to-campaign creates CMP brief + idea becomes converted; re-convert blocked', async () => {
      const res = await http(app)
        .post(`/api/ideas/${ideaId}/convert`)
        .set(auth(adminToken))
        .send({ to: 'campaign', title: 'Intel e2e แคมเปญจากไอเดีย' })
        .expect(201);
      expect(res.body.to).toBe('campaign');
      expect(res.body.entity.displayCode).toMatch(/^CMP-\d{4}$/);
      expect(res.body.entity.status).toBe('brief');
      expect(res.body.idea.status).toBe('converted');

      await http(app)
        .post(`/api/ideas/${ideaId}/convert`)
        .set(auth(adminToken))
        .send({ to: 'episode' })
        .expect(400);
    });

    it('convert-to-episode path works too', async () => {
      const idea = await http(app)
        .post('/api/ideas')
        .set(auth(adminToken))
        .send({ title: 'Intel e2e ไอเดียตอนใหม่', ideaType: 'story' })
        .expect(201);

      const res = await http(app)
        .post(`/api/ideas/${idea.body.id}/convert`)
        .set(auth(adminToken))
        .send({ to: 'episode' })
        .expect(201);
      expect(res.body.entity.displayCode).toMatch(/^EP-\d{4}$/);
      expect(res.body.entity.status).toBe('idea');
    });
  });

  describe('postits', () => {
    let postitId: string;

    it('create → comment by another user notifies the creator', async () => {
      const created = await http(app)
        .post('/api/postits')
        .set(auth(adminToken))
        .send({
          type: 'todo',
          content: 'Intel e2e เช็คสีเสื้อผ้าตัวละครใน EP ล่าสุด',
          assigneeId: researcherId,
          priority: 'normal',
        })
        .expect(201);
      postitId = created.body.id;
      expect(created.body.status).toBe('open');

      // assignment notification for the researcher
      const assigned = await prisma.notification.findMany({
        where: { userId: researcherId, type: 'postit_assigned', entityId: postitId },
      });
      expect(assigned).toHaveLength(1);

      const comment = await http(app)
        .post(`/api/postits/${postitId}/comments`)
        .set(auth(researcherToken))
        .send({ content: 'เช็คแล้ว สีตรง DNA ทุกช็อต' })
        .expect(201);
      expect(comment.body.createdByName).toBe('E2E Researcher');

      const rows = await prisma.notification.findMany({
        where: { userId: adminId, type: 'postit_comment', entityId: postitId },
      });
      expect(rows).toHaveLength(1);
    });

    it('status is forward-only (resolved → open blocked)', async () => {
      await http(app)
        .patch(`/api/postits/${postitId}`)
        .set(auth(adminToken))
        .send({ status: 'in_progress' })
        .expect(200);
      await http(app)
        .patch(`/api/postits/${postitId}`)
        .set(auth(adminToken))
        .send({ status: 'open' })
        .expect(400);
    });

    it('convert-to-task creates a task and resolves the postit', async () => {
      const res = await http(app)
        .post(`/api/postits/${postitId}/convert-to-task`)
        .set(auth(adminToken))
        .expect(201);

      expect(res.body.postit.status).toBe('resolved');
      expect(res.body.task.createdFrom).toBe('postit');
      expect(res.body.task.assigneeId).toBe(researcherId);
      expect(res.body.task.title).toContain('Intel e2e เช็คสีเสื้อผ้า');

      const task = await http(app)
        .get('/api/tasks')
        .query({ createdFrom: 'postit', assigneeId: researcherId })
        .set(auth(adminToken))
        .expect(200);
      expect(task.body.items.map((t: { id: string }) => t.id)).toContain(res.body.task.id);
    });
  });

  describe('competitors + insights', () => {
    let competitorId: string;
    let insightId: string;

    it('create competitor + channel + content observation', async () => {
      const competitor = await http(app)
        .post('/api/competitors')
        .set(auth(researcherToken))
        .send({
          name: 'Intel e2e คู่แข่ง VTuber',
          type: 'creator',
          threatLevel: 'high',
          category: ['beauty'],
        })
        .expect(201);
      competitorId = competitor.body.id;

      const channel = await http(app)
        .post(`/api/competitors/${competitorId}/channels`)
        .set(auth(researcherToken))
        .send({ platform: 'tiktok', handle: '@rivalvtuber', followers: 120000 })
        .expect(201);
      expect(channel.body.competitorId).toBe(competitorId);

      await http(app)
        .post(`/api/competitors/${competitorId}/contents`)
        .set(auth(researcherToken))
        .send({
          url: 'https://www.tiktok.com/@rivalvtuber/video/9',
          platform: 'tiktok',
          hook: 'เปิดด้วยเสียงกรี๊ด',
        })
        .expect(201);

      const detail = await http(app)
        .get(`/api/competitors/${competitorId}`)
        .set(auth(researcherToken))
        .expect(200);
      expect(detail.body.channels).toHaveLength(1);
      expect(detail.body.contents).toHaveLength(1);
    });

    it('insight requires fact (§18.4) → 400 without', async () => {
      await http(app)
        .post(`/api/competitors/${competitorId}/insights`)
        .set(auth(researcherToken))
        .send({ assumption: 'น่าจะใช้ทีมตัดต่อ 5 คน' })
        .expect(400);
    });

    it('insight create + list filter hasRecommendation', async () => {
      const res = await http(app)
        .post(`/api/competitors/${competitorId}/insights`)
        .set(auth(researcherToken))
        .send({
          fact: 'ลง live commerce ทุกศุกร์ 2 ทุ่ม ยอดวิวเฉลี่ย 5 หมื่น',
          assumption: 'จับกลุ่มคนเลิกงาน',
          recommendation: 'Intel e2e ทำ live ศุกร์เย็นชนกันด้วย offer แรงกว่า',
        })
        .expect(201);
      insightId = res.body.id;

      const withRec = await http(app)
        .get('/api/insights')
        .query({ competitorId, hasRecommendation: 'true' })
        .set(auth(researcherToken))
        .expect(200);
      expect(withRec.body.items.map((i: { id: string }) => i.id)).toEqual([insightId]);
    });

    it('convert-to-campaign sets convertedToCampaignId; double convert blocked; researcher 403', async () => {
      await http(app)
        .post(`/api/insights/${insightId}/convert-to-campaign`)
        .set(auth(researcherToken))
        .send({})
        .expect(403); // researcher lacks campaign C

      const res = await http(app)
        .post(`/api/insights/${insightId}/convert-to-campaign`)
        .set(auth(adminToken))
        .send({ name: 'Intel e2e Friday Live Counter' })
        .expect(201);
      expect(res.body.campaign.displayCode).toMatch(/^CMP-\d{4}$/);
      expect(res.body.campaign.status).toBe('brief');
      expect(res.body.insight.convertedToCampaignId).toBe(res.body.campaign.id);

      await http(app)
        .post(`/api/insights/${insightId}/convert-to-campaign`)
        .set(auth(adminToken))
        .send({})
        .expect(400);
    });
  });
});
