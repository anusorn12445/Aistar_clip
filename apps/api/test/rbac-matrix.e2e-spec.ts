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

const PUBLISHER_EMAIL = 'matrix-publisher@aistar.test';
const PUBLISHER_PASSWORD = 'matrix-publisher-2026';
const COMMERCE_EMAIL = 'matrix-commerce@aistar.test';
const COMMERCE_PASSWORD = 'matrix-commerce-2026';

// Addendum §C spot-checks for the expanded Phase 2–4 permission matrix
describe('RBAC matrix Phase 2–4 spot-checks (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let adminToken: string;
  let publisherToken: string;
  let commerceToken: string;
  let approvedItemId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await createUserWithRoles(prisma, PUBLISHER_EMAIL, PUBLISHER_PASSWORD, ['publisher']);
    await createUserWithRoles(prisma, COMMERCE_EMAIL, COMMERCE_PASSWORD, ['commerce_lead']);
    app = await createApp();
    adminToken = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);
    publisherToken = await loginAs(app, PUBLISHER_EMAIL, PUBLISHER_PASSWORD);
    commerceToken = await loginAs(app, COMMERCE_EMAIL, COMMERCE_PASSWORD);

    // admin walks a content item to approved so the publisher can schedule it
    const item = await http(app)
      .post('/api/content-items')
      .set(auth(adminToken))
      .send({ title: 'Matrix e2e คลิปพร้อมโพสต์', platform: 'tiktok', caption: 'พร้อมแล้ว' })
      .expect(201);
    approvedItemId = item.body.id;
    for (const status of ['brief', 'in_production', 'internal_review', 'approved']) {
      await http(app)
        .patch(`/api/content-items/${approvedItemId}/status`)
        .set(auth(adminToken))
        .send({ status })
        .expect(200);
    }
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('publisher (content V+P, product V)', () => {
    it('PATCH content approved→scheduled allowed (P)', async () => {
      const res = await http(app)
        .patch(`/api/content-items/${approvedItemId}/status`)
        .set(auth(publisherToken))
        .send({ status: 'scheduled', scheduledAt: '2030-08-01T12:00:00.000Z' })
        .expect(200);
      expect(res.body.status).toBe('scheduled');
    });

    it('POST /products → 403 (no product C)', async () => {
      await http(app)
        .post('/api/products')
        .set(auth(publisherToken))
        .send({ name: 'Matrix e2e ห้ามสร้าง' })
        .expect(403);
    });

    it('POST /content-items → 403 (no content C)', async () => {
      await http(app)
        .post('/api/content-items')
        .set(auth(publisherToken))
        .send({ title: 'Matrix e2e publisher สร้างไม่ได้', platform: 'tiktok' })
        .expect(403);
    });
  });

  describe('commerce_lead (product C+A, content V only)', () => {
    it('POST /products allowed', async () => {
      const res = await http(app)
        .post('/api/products')
        .set(auth(commerceToken))
        .send({ name: 'Matrix e2e สินค้า commerce', category: 'gadget' })
        .expect(201);
      expect(res.body.displayCode).toMatch(/^PRD-\d{4}$/);
    });

    it('POST /content-items → 403 (content V only)', async () => {
      await http(app)
        .post('/api/content-items')
        .set(auth(commerceToken))
        .send({ title: 'Matrix e2e commerce สร้างไม่ได้', platform: 'tiktok' })
        .expect(403);
    });

    it('GET /content-items allowed (content V)', async () => {
      const res = await http(app)
        .get('/api/content-items')
        .query({ q: 'Matrix e2e' })
        .set(auth(commerceToken))
        .expect(200);
      expect(res.body.items.length).toBeGreaterThanOrEqual(1);
    });

    it('POST /live-sessions allowed (live C) and can go live (P)', async () => {
      const live = await http(app)
        .post('/api/live-sessions')
        .set(auth(commerceToken))
        .send({
          title: 'Matrix e2e Live commerce',
          platform: 'tiktok_shop',
          scheduledAt: '2030-08-02T19:00:00.000Z',
        })
        .expect(201);

      const res = await http(app)
        .patch(`/api/live-sessions/${live.body.id}/status`)
        .set(auth(commerceToken))
        .send({ status: 'live' })
        .expect(200);
      expect(res.body.status).toBe('live');
    });
  });
});
