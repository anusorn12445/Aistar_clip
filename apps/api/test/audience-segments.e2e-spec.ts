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

// Audience Segment — taxonomy กลางของกลุ่มผู้ชม (Phase 1)
// catalog (setting) + link ต่อ character (character) / series (episode)
describe('Audience Segments (e2e)', () => {
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

  it('creates a segment with all dimensions and lists it (usageCount 0)', async () => {
    const created = await http(app)
      .post('/api/audience-segments')
      .set(auth(adminToken))
      .send({
        name: 'สาวออฟฟิศสายมู 25-35',
        description: 'มนุษย์เงินเดือนสายมูเตลู',
        ageMin: 25,
        ageMax: 35,
        gender: 'female',
        interests: ['มู', 'บิวตี้'],
        platforms: ['TikTok'],
        spendingPower: 'medium',
        region: 'กลาง',
        painPoint: 'อยากปังแต่ไม่มีเวลา',
      })
      .expect(201);
    expect(created.body).toMatchObject({
      name: 'สาวออฟฟิศสายมู 25-35',
      gender: 'female',
      spendingPower: 'medium',
      usageCount: 0,
    });
    expect(created.body.interests).toEqual(['มู', 'บิวตี้']);

    const list = await http(app)
      .get('/api/audience-segments')
      .query({ q: 'สายมู' })
      .set(auth(adminToken))
      .expect(200);
    const found = list.body.find((s: { id: string }) => s.id === created.body.id);
    expect(found).toBeTruthy();
    expect(found.usageCount).toBe(0);
  });

  it('rejects invalid enums and bad age range', async () => {
    await http(app)
      .post('/api/audience-segments')
      .set(auth(adminToken))
      .send({ name: 'เพศมั่ว', gender: 'alien' })
      .expect(400);

    await http(app)
      .post('/api/audience-segments')
      .set(auth(adminToken))
      .send({ name: 'อายุกลับ', ageMin: 40, ageMax: 20 })
      .expect(400);
  });

  it('archives a segment via PATCH status', async () => {
    const seg = await http(app)
      .post('/api/audience-segments')
      .set(auth(adminToken))
      .send({ name: 'กลุ่มเก็บเข้ากรุ' })
      .expect(201);

    await http(app)
      .patch(`/api/audience-segments/${seg.body.id}`)
      .set(auth(adminToken))
      .send({ status: 'archived' })
      .expect(200);

    const active = await http(app)
      .get('/api/audience-segments')
      .query({ status: 'active' })
      .set(auth(adminToken))
      .expect(200);
    expect(active.body.map((s: { id: string }) => s.id)).not.toContain(seg.body.id);
  });

  it('V-only role (no setting) gets 403 on segment POST', async () => {
    await http(app)
      .post('/api/audience-segments')
      .set(auth(researcherToken))
      .send({ name: 'ไม่ควรได้' })
      .expect(403);
  });

  it('links segments to a character with one primary; detail includes audiences', async () => {
    const segA = await http(app)
      .post('/api/audience-segments')
      .set(auth(adminToken))
      .send({ name: 'ผู้ติดตาม A' })
      .expect(201);
    const segB = await http(app)
      .post('/api/audience-segments')
      .set(auth(adminToken))
      .send({ name: 'ผู้ติดตาม B' })
      .expect(201);

    const character = await http(app)
      .post('/api/characters')
      .set(auth(adminToken))
      .send({ nameTh: 'ทดสอบผู้ชม', oneLineConcept: 'AI Talent' })
      .expect(201);

    const put = await http(app)
      .put(`/api/characters/${character.body.id}/audiences`)
      .set(auth(adminToken))
      .send({
        items: [
          { segmentId: segA.body.id, isPrimary: true },
          { segmentId: segB.body.id },
        ],
      })
      .expect(200);
    expect(put.body).toHaveLength(2);
    expect(put.body[0]).toMatchObject({ segmentId: segA.body.id, isPrimary: true });

    // GET link endpoint
    const links = await http(app)
      .get(`/api/characters/${character.body.id}/audiences`)
      .set(auth(adminToken))
      .expect(200);
    expect(links.body.map((l: { segmentId: string }) => l.segmentId).sort()).toEqual(
      [segA.body.id, segB.body.id].sort(),
    );

    // detail includes audiences
    const detail = await http(app)
      .get(`/api/characters/${character.body.id}`)
      .set(auth(adminToken))
      .expect(200);
    expect(detail.body.audiences).toHaveLength(2);
    expect(detail.body.audiences.find((a: { isPrimary: boolean }) => a.isPrimary).segmentId).toBe(
      segA.body.id,
    );

    // usageCount now reflects the link
    const list = await http(app)
      .get('/api/audience-segments')
      .set(auth(adminToken))
      .expect(200);
    expect(list.body.find((s: { id: string }) => s.id === segA.body.id).usageCount).toBe(1);
  });

  it('rejects >1 primary (400) and unknown segment (404) on character link', async () => {
    const seg1 = await http(app)
      .post('/api/audience-segments')
      .set(auth(adminToken))
      .send({ name: 'สองพรอมารี่ 1' })
      .expect(201);
    const seg2 = await http(app)
      .post('/api/audience-segments')
      .set(auth(adminToken))
      .send({ name: 'สองพรอมารี่ 2' })
      .expect(201);
    const character = await http(app)
      .post('/api/characters')
      .set(auth(adminToken))
      .send({ nameTh: 'ทดสอบพรอมารี่' })
      .expect(201);

    await http(app)
      .put(`/api/characters/${character.body.id}/audiences`)
      .set(auth(adminToken))
      .send({
        items: [
          { segmentId: seg1.body.id, isPrimary: true },
          { segmentId: seg2.body.id, isPrimary: true },
        ],
      })
      .expect(400);

    await http(app)
      .put(`/api/characters/${character.body.id}/audiences`)
      .set(auth(adminToken))
      .send({ items: [{ segmentId: '00000000-0000-0000-0000-000000000000' }] })
      .expect(404);
  });

  it('links segments to a series, saves targetViews, detail includes both', async () => {
    const seg = await http(app)
      .post('/api/audience-segments')
      .set(auth(adminToken))
      .send({ name: 'คนดูซีรีส์' })
      .expect(201);

    const series = await http(app)
      .post('/api/series')
      .set(auth(adminToken))
      .send({ name: 'ซีรีส์ทดสอบผู้ชม' })
      .expect(201);

    await http(app)
      .put(`/api/series/${series.body.id}/audiences`)
      .set(auth(adminToken))
      .send({ items: [{ segmentId: seg.body.id, isPrimary: true }] })
      .expect(200);

    await http(app)
      .patch(`/api/series/${series.body.id}`)
      .set(auth(adminToken))
      .send({ targetViews: 1_000_000, targetViewsUnit: 'per_episode' })
      .expect(200);

    const detail = await http(app)
      .get(`/api/series/${series.body.id}`)
      .set(auth(adminToken))
      .expect(200);
    expect(detail.body.targetViews).toBe(1_000_000);
    expect(detail.body.targetViewsUnit).toBe('per_episode');
    expect(detail.body.audiences).toHaveLength(1);
    expect(detail.body.audiences[0]).toMatchObject({ segmentId: seg.body.id, isPrimary: true });
  });

  it('delete-guard: in-use segment 409, unused segment deletes', async () => {
    // in-use (linked to the character below) → 409
    const used = await http(app)
      .post('/api/audience-segments')
      .set(auth(adminToken))
      .send({ name: 'กลุ่มถูกใช้งาน' })
      .expect(201);
    const character = await http(app)
      .post('/api/characters')
      .set(auth(adminToken))
      .send({ nameTh: 'ตัวละครใช้กลุ่ม' })
      .expect(201);
    await http(app)
      .put(`/api/characters/${character.body.id}/audiences`)
      .set(auth(adminToken))
      .send({ items: [{ segmentId: used.body.id }] })
      .expect(200);
    await http(app)
      .delete(`/api/audience-segments/${used.body.id}`)
      .set(auth(adminToken))
      .expect(409);

    // unused → 200 delete
    const unused = await http(app)
      .post('/api/audience-segments')
      .set(auth(adminToken))
      .send({ name: 'กลุ่มไม่ถูกใช้' })
      .expect(201);
    await http(app)
      .delete(`/api/audience-segments/${unused.body.id}`)
      .set(auth(adminToken))
      .expect(200);
  });
});
