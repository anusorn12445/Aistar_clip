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

const PLANNER_EMAIL = 'pub-planner@aistar.test';
const PLANNER_PASSWORD = 'pub-planner-2026';
const LEAD_EMAIL = 'pub-lead@aistar.test';
const LEAD_PASSWORD = 'pub-lead-2026';

// Publishing §D.1 content state machine + live sessions
describe('Publishing (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let adminToken: string;
  let plannerToken: string; // content V,C,P — no A; live V,C — no P
  let plannerId: string;
  let leadId: string; // creative_lead — review notification target
  let itemId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    plannerId = await createUserWithRoles(prisma, PLANNER_EMAIL, PLANNER_PASSWORD, [
      'content_planner',
    ]);
    leadId = await createUserWithRoles(prisma, LEAD_EMAIL, LEAD_PASSWORD, ['creative_lead']);
    app = await createApp();
    adminToken = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);
    plannerToken = await loginAs(app, PLANNER_EMAIL, PLANNER_PASSWORD);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function changeStatus(
    id: string,
    body: Record<string, unknown>,
    token: string,
    expected: number,
  ) {
    return http(app)
      .patch(`/api/content-items/${id}/status`)
      .set(auth(token))
      .send(body)
      .expect(expected);
  }

  it('create content item → status idea, owner = creator', async () => {
    const res = await http(app)
      .post('/api/content-items')
      .set(auth(plannerToken))
      .send({ title: 'Pub e2e รีวิวลิป', platform: 'tiktok', contentFormat: 'short_video' })
      .expect(201);
    itemId = res.body.id;
    expect(res.body.status).toBe('idea');
    expect(res.body.owner.id).toBe(plannerId);
    expect(res.body.readiness).toEqual({ caption: false, scheduledAt: false, characters: false });
  });

  it('→internal_review without caption → 400 Thai readiness message', async () => {
    await changeStatus(itemId, { status: 'brief' }, plannerToken, 200);
    await changeStatus(itemId, { status: 'in_production' }, plannerToken, 200);

    const res = await changeStatus(itemId, { status: 'internal_review' }, plannerToken, 400);
    expect(res.body.message).toContain('caption');
    expect(res.body.message).toContain('readiness');
  });

  it('with caption → internal_review ok + reviewer roles notified', async () => {
    await http(app)
      .patch(`/api/content-items/${itemId}`)
      .set(auth(plannerToken))
      .send({ caption: 'ลิปติดทนสีสวยมากแม่ 💄' })
      .expect(200);

    await changeStatus(itemId, { status: 'internal_review' }, plannerToken, 200);

    const rows = await prisma.notification.findMany({
      where: { userId: leadId, type: 'content_review_request', entityId: itemId },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].message).toContain('Pub e2e รีวิวลิป');
  });

  it('internal_review→approved needs A: planner 403, admin ok', async () => {
    await changeStatus(itemId, { status: 'approved' }, plannerToken, 403);
    const res = await changeStatus(itemId, { status: 'approved' }, adminToken, 200);
    expect(res.body.reviewerId).not.toBeNull();
  });

  it('approved→scheduled requires scheduledAt; scheduled→published requires postUrl', async () => {
    await changeStatus(itemId, { status: 'scheduled' }, adminToken, 400);

    const scheduled = await changeStatus(
      itemId,
      { status: 'scheduled', scheduledAt: '2030-05-05T12:00:00.000Z' },
      adminToken,
      200,
    );
    expect(scheduled.body.scheduledAt).toBe('2030-05-05T12:00:00.000Z');

    await changeStatus(itemId, { status: 'published' }, adminToken, 400);
    const published = await changeStatus(
      itemId,
      { status: 'published', postUrl: 'https://www.tiktok.com/@aistar/video/1' },
      adminToken,
      200,
    );
    expect(published.body.postUrl).toBe('https://www.tiktok.com/@aistar/video/1');
  });

  it('revision_needed requires comment → blockedReason set + owner notified', async () => {
    const item = await http(app)
      .post('/api/content-items')
      .set(auth(plannerToken))
      .send({ title: 'Pub e2e คลิปต้องแก้', platform: 'facebook_reels', caption: 'มีแคปชันแล้ว' })
      .expect(201);
    const id = item.body.id;
    await changeStatus(id, { status: 'brief' }, plannerToken, 200);
    await changeStatus(id, { status: 'in_production' }, plannerToken, 200);
    await changeStatus(id, { status: 'internal_review' }, plannerToken, 200);

    await changeStatus(id, { status: 'revision_needed' }, adminToken, 400);

    const res = await changeStatus(
      id,
      { status: 'revision_needed', comment: 'แก้ hook 3 วิแรกให้แรงกว่านี้' },
      adminToken,
      200,
    );
    expect(res.body.blockedReason).toBe('แก้ hook 3 วิแรกให้แรงกว่านี้');

    const notif = await prisma.notification.findMany({
      where: { userId: plannerId, type: 'content_revision_needed', entityId: id },
    });
    expect(notif).toHaveLength(1);
    expect(notif[0].message).toContain('แก้ hook');

    // revision_needed → in_production clears the comment
    const back = await changeStatus(id, { status: 'in_production' }, plannerToken, 200);
    expect(back.body.blockedReason).toBeNull();
  });

  it('calendar endpoint returns items in range; missing range → 400', async () => {
    await http(app).get('/api/content-items/calendar').set(auth(adminToken)).expect(400);

    const inRange = await http(app)
      .get('/api/content-items/calendar')
      .query({ from: '2030-05-01', to: '2030-05-31' })
      .set(auth(adminToken))
      .expect(200);
    const hit = inRange.body.items.find((i: { id: string }) => i.id === itemId);
    expect(hit).toBeDefined();
    expect(hit.title).toBe('Pub e2e รีวิวลิป');

    const outOfRange = await http(app)
      .get('/api/content-items/calendar')
      .query({ from: '2030-06-01', to: '2030-06-30' })
      .set(auth(adminToken))
      .expect(200);
    expect(outOfRange.body.items.map((i: { id: string }) => i.id)).not.toContain(itemId);
  });

  describe('live sessions', () => {
    let liveId: string;
    let productA: string;
    let productB: string;

    beforeAll(async () => {
      const a = await http(app)
        .post('/api/products')
        .set(auth(adminToken))
        .send({ name: 'Pub e2e Live สินค้า A' })
        .expect(201);
      productA = a.body.id;
      const b = await http(app)
        .post('/api/products')
        .set(auth(adminToken))
        .send({ name: 'Pub e2e Live สินค้า B' })
        .expect(201);
      productB = b.body.id;
    });

    it('create live session with pinned products', async () => {
      const res = await http(app)
        .post('/api/live-sessions')
        .set(auth(adminToken))
        .send({
          title: 'Pub e2e Live ศุกร์นี้',
          platform: 'tiktok',
          scheduledAt: '2030-05-09T19:00:00.000Z',
          products: [{ productId: productA, pinOrder: 1 }],
          targetGmv: 50000,
        })
        .expect(201);
      liveId = res.body.id;
      expect(res.body.status).toBe('scheduled');
      expect(res.body.products).toHaveLength(1);
      expect(res.body.products[0].id).toBe(productA);
    });

    it('PUT products replaces the pinned set; duplicates → 400', async () => {
      await http(app)
        .put(`/api/live-sessions/${liveId}/products`)
        .set(auth(adminToken))
        .send({
          items: [
            { productId: productB, pinOrder: 1 },
            { productId: productB, pinOrder: 2 },
          ],
        })
        .expect(400);

      const res = await http(app)
        .put(`/api/live-sessions/${liveId}/products`)
        .set(auth(adminToken))
        .send({
          items: [
            { productId: productB, pinOrder: 1 },
            { productId: productA, pinOrder: 2 },
          ],
        })
        .expect(200);
      expect(res.body.products.map((p: { id: string }) => p.id)).toEqual([productB, productA]);
    });

    it('scheduled→live→done needs P: planner (live C only) 403, admin ok', async () => {
      await http(app)
        .patch(`/api/live-sessions/${liveId}/status`)
        .set(auth(plannerToken))
        .send({ status: 'live' })
        .expect(403);

      for (const status of ['live', 'done']) {
        const res = await http(app)
          .patch(`/api/live-sessions/${liveId}/status`)
          .set(auth(adminToken))
          .send({ status })
          .expect(200);
        expect(res.body.status).toBe(status);
      }

      // done is terminal
      await http(app)
        .patch(`/api/live-sessions/${liveId}/status`)
        .set(auth(adminToken))
        .send({ status: 'live' })
        .expect(400);
    });

    it('scheduled→cancelled needs only C (planner allowed)', async () => {
      const other = await http(app)
        .post('/api/live-sessions')
        .set(auth(plannerToken))
        .send({
          title: 'Pub e2e Live ยกเลิก',
          platform: 'shopee_video',
          scheduledAt: '2030-05-10T19:00:00.000Z',
        })
        .expect(201);

      const res = await http(app)
        .patch(`/api/live-sessions/${other.body.id}/status`)
        .set(auth(plannerToken))
        .send({ status: 'cancelled' })
        .expect(200);
      expect(res.body.status).toBe('cancelled');
    });
  });
});
