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

// Creators registry — ทะเบียนผู้สร้างตัวละคร (freelance) + ผูกกับ character
// ชื่อทดสอบ prefix 'CRT-' เพื่อไม่ชนข้อมูลของ suite อื่น
const PREFIX = 'CRT-Creator';

describe('Creators (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let token: string;

  let creatorId: string;
  let characterId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    app = await createApp();
    token = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);
    await ensureResearcher(prisma);
  });

  afterAll(async () => {
    // ล้างข้อมูลของ suite นี้ (FK: unlink character ก่อนลบ creator)
    await prisma.character.updateMany({
      where: { creator: { name: { startsWith: PREFIX } } },
      data: { creatorId: null },
    });
    await prisma.character.deleteMany({ where: { nameEn: { startsWith: 'CrtChar' } } });
    await prisma.creator.deleteMany({ where: { name: { startsWith: PREFIX } } });
    await prisma.$disconnect();
    await app.close();
  });

  it('POST /creators creates a creator with contact info + audit log', async () => {
    const res = await http(app)
      .post('/api/creators')
      .set(auth(token))
      .send({
        name: `${PREFIX} พี่หนึ่ง`,
        phone: '081-234-5678',
        line: '@nueng.art',
        email: 'nueng@example.com',
        portfolio: 'https://portfolio.example.com/nueng',
        rateNote: 'ตัวละครละ 3,500 บาท แก้ฟรี 2 รอบ',
        notes: 'ตอบไวช่วงเย็น',
      })
      .expect(201);
    creatorId = res.body.id;
    expect(res.body.name).toBe(`${PREFIX} พี่หนึ่ง`);
    expect(res.body.line).toBe('@nueng.art');

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: 'creator', entityId: creatorId, action: 'create' },
    });
    expect(audit).not.toBeNull();
  });

  it('POST /creators rejects invalid email with 400', async () => {
    await http(app)
      .post('/api/creators')
      .set(auth(token))
      .send({ name: `${PREFIX} อีเมลเพี้ยน`, email: 'not-an-email' })
      .expect(400);
  });

  it('GET /creators lists with characterCount and q filters by name (insensitive)', async () => {
    // ตัวที่สองไว้ทดสอบว่า q กรองออก
    await http(app)
      .post('/api/creators')
      .set(auth(token))
      .send({ name: `${PREFIX} สตูดิโอบี` })
      .expect(201);

    const all = await http(app).get('/api/creators').set(auth(token)).expect(200);
    const mine = all.body.filter((c: { name: string }) => c.name.startsWith(PREFIX));
    expect(mine.length).toBeGreaterThanOrEqual(2);
    expect(mine[0]).toHaveProperty('characterCount', 0);

    const filtered = await http(app)
      .get(`/api/creators?q=${encodeURIComponent('crt-creator พี่หนึ่ง')}`)
      .set(auth(token))
      .expect(200);
    expect(filtered.body).toHaveLength(1);
    expect(filtered.body[0].id).toBe(creatorId);
  });

  it('PATCH /creators/:id updates contact fields + audits changed field names', async () => {
    const res = await http(app)
      .patch(`/api/creators/${creatorId}`)
      .set(auth(token))
      .send({ phone: '099-999-9999', rateNote: 'ปรับเรตใหม่ 4,000 บาท' })
      .expect(200);
    expect(res.body.phone).toBe('099-999-9999');

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: 'creator', entityId: creatorId, action: 'update' },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit?.meta).toEqual({ fields: ['phone', 'rateNote'] });
  });

  it('links creatorId on character create and GET /characters/:id includes full creator', async () => {
    const c = await http(app)
      .post('/api/characters')
      .set(auth(token))
      .send({ nameTh: 'น้องคริ', nameEn: 'CrtChar1', creatorId })
      .expect(201);
    characterId = c.body.id;
    expect(c.body.creatorId).toBe(creatorId);

    const detail = await http(app)
      .get(`/api/characters/${characterId}`)
      .set(auth(token))
      .expect(200);
    expect(detail.body.creator).toMatchObject({
      id: creatorId,
      name: `${PREFIX} พี่หนึ่ง`,
      phone: '099-999-9999',
      line: '@nueng.art',
    });

    // GET /creators/:id ฝั่งกลับกัน — โชว์ character ที่ทำ + characterCount ใน list ขยับเป็น 1
    const one = await http(app).get(`/api/creators/${creatorId}`).set(auth(token)).expect(200);
    expect(one.body.characters).toEqual([
      expect.objectContaining({ id: characterId, nameTh: 'น้องคริ', status: 'draft' }),
    ]);
    const list = await http(app)
      .get(`/api/creators?q=${encodeURIComponent('พี่หนึ่ง')}`)
      .set(auth(token))
      .expect(200);
    expect(list.body[0].characterCount).toBe(1);
  });

  it('PATCH character with unknown creatorId → Thai 404', async () => {
    const res = await http(app)
      .patch(`/api/characters/${characterId}`)
      .set(auth(token))
      .send({ creatorId: '00000000-0000-4000-8000-000000000000' })
      .expect(404);
    expect(res.body.message).toBe('ไม่พบผู้สร้างนี้');
  });

  it('PATCH character {creatorId: null} unlinks the creator', async () => {
    const res = await http(app)
      .patch(`/api/characters/${characterId}`)
      .set(auth(token))
      .send({ creatorId: null })
      .expect(200);
    expect(res.body.creatorId).toBeNull();

    const detail = await http(app)
      .get(`/api/characters/${characterId}`)
      .set(auth(token))
      .expect(200);
    expect(detail.body.creator).toBeNull();
  });

  it('GET /creators/:id unknown → Thai 404, researcher (V only) reads but cannot write', async () => {
    const res = await http(app)
      .get('/api/creators/00000000-0000-4000-8000-000000000000')
      .set(auth(token))
      .expect(404);
    expect(res.body.message).toBe('ไม่พบผู้สร้างนี้');

    const researcherToken = await loginAs(app, RESEARCHER_EMAIL, RESEARCHER_PASSWORD);
    await http(app).get('/api/creators').set(auth(researcherToken)).expect(200);
    await http(app)
      .post('/api/creators')
      .set(auth(researcherToken))
      .send({ name: `${PREFIX} ห้ามสร้าง` })
      .expect(403);
  });
});
