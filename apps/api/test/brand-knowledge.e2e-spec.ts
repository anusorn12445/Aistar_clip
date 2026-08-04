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
import { BrandKnowledgeService } from '../src/products/brand-knowledge.service';

// Content Intelligence ระบบ 1 — Brand Knowledge Base
describe('Brand Knowledge Base (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let adminToken: string;
  let researcherToken: string; // product V only → ใช้ทดสอบ 403 บน PATCH (C)

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

  async function createBrand(name: string): Promise<string> {
    const res = await http(app)
      .post('/api/brands')
      .set(auth(adminToken))
      .send({ name })
      .expect(201);
    return res.body.id;
  }

  it('PATCH persists knowledge fields; GET /brands/:id returns them + trims array empties', async () => {
    const id = await createBrand('แบรนด์ความรู้ ' + Date.now());

    await http(app)
      .patch(`/api/brands/${id}`)
      .set(auth(adminToken))
      .send({
        brandStory: 'แบรนด์บิวตี้สายมูสำหรับสาวออฟฟิศ',
        toneOfVoice: 'เป็นกันเอง สนุก จริงใจ',
        doList: ['พูดจริงใจ', '  ', 'ใช้ภาษาบวก '],
        dontList: ['อย่าโอเวอร์เคลม'],
        keyMessages: ['ผิวดีใน 7 วัน'],
        usp: 'สกัดจากสมุนไพรไทย',
        restrictedClaims: ['รักษาสิวหายขาด', ''],
        visualIdentity: 'โทนพาสเทล อบอุ่น',
        competitorsNote: 'ต่างจากคู่แข่งตรงส่วนผสมธรรมชาติ',
      })
      .expect(200);

    const detail = await http(app)
      .get(`/api/brands/${id}`)
      .set(auth(adminToken))
      .expect(200);

    expect(detail.body).toMatchObject({
      brandStory: 'แบรนด์บิวตี้สายมูสำหรับสาวออฟฟิศ',
      toneOfVoice: 'เป็นกันเอง สนุก จริงใจ',
      usp: 'สกัดจากสมุนไพรไทย',
      visualIdentity: 'โทนพาสเทล อบอุ่น',
      competitorsNote: 'ต่างจากคู่แข่งตรงส่วนผสมธรรมชาติ',
    });
    // trim + ตัดค่าว่างทิ้ง
    expect(detail.body.doList).toEqual(['พูดจริงใจ', 'ใช้ภาษาบวก']);
    expect(detail.body.restrictedClaims).toEqual(['รักษาสิวหายขาด']);
    expect(detail.body.brandBook).toMatchObject({ count: 0, assets: [] });
    // ของเดิมยังทำงาน
    expect(detail.body.name).toContain('แบรนด์ความรู้');
    expect(detail.body.status).toBe('active');
  });

  it('rejects non-array knowledge field (400)', async () => {
    const id = await createBrand('แบรนด์ validate ' + Date.now());
    await http(app)
      .patch(`/api/brands/${id}`)
      .set(auth(adminToken))
      .send({ doList: 'ไม่ใช่ array' })
      .expect(400);
  });

  it('links audiences with ≤1 primary; unlink works; >1 primary rejected (400)', async () => {
    const id = await createBrand('แบรนด์กลุ่มเป้าหมาย ' + Date.now());
    const segA = await http(app)
      .post('/api/audience-segments')
      .set(auth(adminToken))
      .send({ name: 'กลุ่มแบรนด์ A ' + Date.now() })
      .expect(201);
    const segB = await http(app)
      .post('/api/audience-segments')
      .set(auth(adminToken))
      .send({ name: 'กลุ่มแบรนด์ B ' + Date.now() })
      .expect(201);

    // >1 primary → 400
    await http(app)
      .put(`/api/brands/${id}/audiences`)
      .set(auth(adminToken))
      .send({
        items: [
          { segmentId: segA.body.id, isPrimary: true },
          { segmentId: segB.body.id, isPrimary: true },
        ],
      })
      .expect(400);

    // valid: หนึ่ง primary
    const put = await http(app)
      .put(`/api/brands/${id}/audiences`)
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

    // detail สะท้อน audiences
    const detail = await http(app).get(`/api/brands/${id}`).set(auth(adminToken)).expect(200);
    expect(detail.body.audiences).toHaveLength(2);

    // unlink (set เหลือกลุ่มเดียว)
    const put2 = await http(app)
      .put(`/api/brands/${id}/audiences`)
      .set(auth(adminToken))
      .send({ items: [{ segmentId: segB.body.id, isPrimary: true }] })
      .expect(200);
    expect(put2.body).toHaveLength(1);
    expect(put2.body[0].segmentId).toBe(segB.body.id);

    // unknown segment → 404
    await http(app)
      .put(`/api/brands/${id}/audiences`)
      .set(auth(adminToken))
      .send({ items: [{ segmentId: '00000000-0000-0000-0000-000000000000' }] })
      .expect(404);
  });

  it('buildBrandContext assembles Thai text incl. restrictedClaims + audience; empty brand → ""', async () => {
    const svc = app.get(BrandKnowledgeService);

    // แบรนด์เปล่า → ''
    const emptyId = await createBrand('แบรนด์เปล่า ' + Date.now());
    expect(await svc.buildBrandContext(emptyId)).toBe('');
    // brandId ที่ไม่มีจริง → '' (null-safe)
    expect(await svc.buildBrandContext('00000000-0000-0000-0000-000000000000')).toBe('');

    // แบรนด์ที่มีความรู้ + กลุ่มเป้าหมาย
    const id = await createBrand('แบรนด์คอนเท็กซ์ ' + Date.now());
    await http(app)
      .patch(`/api/brands/${id}`)
      .set(auth(adminToken))
      .send({
        brandStory: 'เรื่องราวแบรนด์ทดสอบ',
        toneOfVoice: 'สนุกสดใส',
        doList: ['พูดบวก'],
        keyMessages: ['ของดีราคาโดน'],
        usp: 'ส่วนผสมพิเศษ',
        restrictedClaims: ['เคลมห้ามใช้เด็ดขาด'],
      })
      .expect(200);
    const seg = await http(app)
      .post('/api/audience-segments')
      .set(auth(adminToken))
      .send({ name: 'กลุ่มคอนเท็กซ์ ' + Date.now(), ageMin: 25, ageMax: 35, gender: 'female' })
      .expect(201);
    await http(app)
      .put(`/api/brands/${id}/audiences`)
      .set(auth(adminToken))
      .send({ items: [{ segmentId: seg.body.id, isPrimary: true }] })
      .expect(200);

    const ctx = await svc.buildBrandContext(id);
    expect(ctx).toContain('แบรนด์คอนเท็กซ์');
    expect(ctx).toContain('เรื่องราวแบรนด์ทดสอบ');
    expect(ctx).toContain('เคลมห้ามใช้เด็ดขาด'); // restrictedClaims
    expect(ctx).toContain('ส่วนผสมพิเศษ'); // USP
    expect(ctx).toContain('กลุ่มคอนเท็กซ์'); // audience segment name
    expect(ctx).toContain('กลุ่มหลัก'); // primary marker
  });

  it('keeps existing name/contact/notes/status editable; unknown id → 404', async () => {
    const id = await createBrand('แบรนด์เดิม ' + Date.now());
    await http(app)
      .patch(`/api/brands/${id}`)
      .set(auth(adminToken))
      .send({ name: 'แบรนด์เปลี่ยนชื่อ', contact: 'line: @brand', notes: 'โน้ต', status: 'archived' })
      .expect(200);
    const detail = await http(app).get(`/api/brands/${id}`).set(auth(adminToken)).expect(200);
    expect(detail.body).toMatchObject({
      name: 'แบรนด์เปลี่ยนชื่อ',
      contact: 'line: @brand',
      notes: 'โน้ต',
      status: 'archived',
    });

    await http(app)
      .get('/api/brands/00000000-0000-0000-0000-000000000000')
      .set(auth(adminToken))
      .expect(404);
  });

  it('permission gate: product V-only role gets 403 on PATCH /brands/:id', async () => {
    const id = await createBrand('แบรนด์สิทธิ์ ' + Date.now());
    // researcher มี product V เท่านั้น → อ่านได้
    await http(app).get(`/api/brands/${id}`).set(auth(researcherToken)).expect(200);
    // แต่เขียน (C) ไม่ได้
    await http(app)
      .patch(`/api/brands/${id}`)
      .set(auth(researcherToken))
      .send({ brandStory: 'ไม่ควรบันทึกได้' })
      .expect(403);
    await http(app)
      .put(`/api/brands/${id}/audiences`)
      .set(auth(researcherToken))
      .send({ items: [] })
      .expect(403);
  });
});
