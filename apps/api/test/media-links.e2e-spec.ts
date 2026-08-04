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

// Media Center — ลิงก์ Google Drive / คลังงานของทีม
// hub (GET) = ทุกคนที่ล็อกอิน · จัดการ (manage/POST/PATCH/DELETE) = admin (`setting`)
describe('Media Links (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let adminToken: string;
  let researcherToken: string; // ไม่มี setting → ใช้ทดสอบ 403

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

  it('normal authenticated user can GET the hub list (200, active only)', async () => {
    const seeded = await http(app)
      .post('/api/media-links')
      .set(auth(adminToken))
      .send({ label: 'ลิงก์เปิดใช้', url: 'https://drive.google.com/active', category: 'รูปสินค้า' })
      .expect(201);
    const archived = await http(app)
      .post('/api/media-links')
      .set(auth(adminToken))
      .send({ label: 'ลิงก์เก็บกรุ', url: 'https://drive.google.com/archived', status: 'archived' })
      .expect(201);

    const res = await http(app)
      .get('/api/media-links')
      .set(auth(researcherToken))
      .expect(200);
    const ids = res.body.map((l: { id: string }) => l.id);
    expect(ids).toContain(seeded.body.id);
    expect(ids).not.toContain(archived.body.id); // archived ไม่โผล่ใน hub
  });

  it('admin can create, patch, then delete a link', async () => {
    const created = await http(app)
      .post('/api/media-links')
      .set(auth(adminToken))
      .send({ label: 'คลังวิดีโอ', url: 'https://drive.google.com/videos' })
      .expect(201);
    expect(created.body).toMatchObject({ label: 'คลังวิดีโอ', status: 'active' });

    const patched = await http(app)
      .patch(`/api/media-links/${created.body.id}`)
      .set(auth(adminToken))
      .send({ label: 'คลังวิดีโอ (ใหม่)', status: 'archived' })
      .expect(200);
    expect(patched.body).toMatchObject({ label: 'คลังวิดีโอ (ใหม่)', status: 'archived' });

    await http(app)
      .delete(`/api/media-links/${created.body.id}`)
      .set(auth(adminToken))
      .expect(200);
  });

  it('non-admin (no setting) gets 403 on create', async () => {
    await http(app)
      .post('/api/media-links')
      .set(auth(researcherToken))
      .send({ label: 'ไม่ควรได้', url: 'https://drive.google.com/nope' })
      .expect(403);
  });

  it('rejects a non-URL / non-https value with 400', async () => {
    await http(app)
      .post('/api/media-links')
      .set(auth(adminToken))
      .send({ label: 'ลิงก์เสีย', url: 'not-a-url' })
      .expect(400);
  });

  it('non-admin gets 403 on the manage (archived-inclusive) list', async () => {
    await http(app)
      .get('/api/media-links/manage')
      .set(auth(researcherToken))
      .expect(403);
  });

  it('admin manage list includes archived links', async () => {
    const archived = await http(app)
      .post('/api/media-links')
      .set(auth(adminToken))
      .send({ label: 'กรุจัดการ', url: 'https://drive.google.com/manage-archived', status: 'archived' })
      .expect(201);

    const res = await http(app)
      .get('/api/media-links/manage')
      .set(auth(adminToken))
      .expect(200);
    expect(res.body.map((l: { id: string }) => l.id)).toContain(archived.body.id);
  });
});
