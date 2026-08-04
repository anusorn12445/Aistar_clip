import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
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

// AC-4: researcher role = character V only (no C, no E)
describe('RBAC permission matrix (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let adminToken: string;
  let researcherToken: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await ensureResearcher(prisma);
    app = await createApp();
    adminToken = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);
    researcherToken = await loginAs(app, RESEARCHER_EMAIL, RESEARCHER_PASSWORD);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('researcher (character: V only)', () => {
    it('GET /api/characters → 200', async () => {
      const res = await http(app)
        .get('/api/characters')
        .set(auth(researcherToken))
        .expect(200);
      expect(res.body).toHaveProperty('items');
    });

    it('POST /api/characters → 403 (no C)', async () => {
      await http(app)
        .post('/api/characters')
        .set(auth(researcherToken))
        .send({ nameTh: 'ห้ามสร้าง', nameEn: 'Forbidden' })
        .expect(403);
    });

    it('POST /api/characters/:id/export → 403 (no E)', async () => {
      await http(app)
        .post(`/api/characters/${randomUUID()}/export`)
        .set(auth(researcherToken))
        .send({})
        .expect(403);
    });
  });

  describe('admin (full permissions)', () => {
    it('GET / POST /characters and export all allowed', async () => {
      await http(app).get('/api/characters').set(auth(adminToken)).expect(200);

      const created = await http(app)
        .post('/api/characters')
        .set(auth(adminToken))
        .send({ nameTh: 'ตัวละครทดสอบสิทธิ์', nameEn: 'RbacProbe' })
        .expect(201);

      const exportRes = await http(app)
        .post(`/api/characters/${created.body.id}/export`)
        .set(auth(adminToken))
        .send({})
        .expect(201);
      expect(['queued', 'running', 'done']).toContain(exportRes.body.status);

      // let the in-process background build finish before app teardown
      const deadline = Date.now() + 15_000;
      let status = exportRes.body.status;
      while (status !== 'done' && status !== 'failed' && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 200));
        const poll = await http(app)
          .get(`/api/exports/${exportRes.body.id}`)
          .set(auth(adminToken))
          .expect(200);
        status = poll.body.status;
      }
      expect(status).toBe('done');
    });
  });
});
