import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  PNG_BUFFER,
  RESEARCHER_EMAIL,
  RESEARCHER_PASSWORD,
  auth,
  createApp,
  ensureResearcher,
  http,
  loginAs,
} from './utils';
import { BrandKnowledgeService } from '../src/products/brand-knowledge.service';

// Brand Book เต็มรูป (spec: _docs/brand_book_requirement.md) — ต่อยอดระบบ 1
describe('Brand Book (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let adminToken: string;
  let researcherToken: string; // product V only

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

  const FULL_BOOK = {
    // Foundation
    mission: 'ให้ผู้หญิงไทยมั่นใจด้วยสกินแคร์ธรรมชาติ',
    vision: 'แบรนด์ธรรมชาติอันดับหนึ่งปี 2028',
    coreValues: ['จริงใจ', ' โปร่งใส ', ''],
    positioning: 'สกินแคร์ธรรมชาติอ่อนโยนแต่เห็นผลจริง',
    personality: 'The Caregiver — เพื่อนสาวคนโต',
    tagline: 'Naturally Radiant, Always.',
    taglineFont: 'Great Vibes',
    // Verbal
    wordBankUse: ['ผิวแข็งแรง', 'อ่อนโยน'],
    wordBankAvoid: ['ขาวใน 7 วัน'],
    exampleOnBrand: 'ผิวแพ้ง่ายไม่ใช่ความผิดของเราเลยนะคะ',
    exampleOffBrand: 'ด่วน!! ครีมเทพขาวไว x10',
    platformGuides: { facebook: 'เล่าเรื่อง+ให้ความรู้ ยาวได้', tiktok: 'hook 3 วิแรก' },
    // Visual
    nameUsage: 'เขียนตัวพิมพ์ใหญ่เสมอ เน้น RA',
    logoUsageNote: 'โปรไฟล์ = Icon · ห้ามยืด/บีบ',
    moodNote: 'แสงธรรมชาติ ผิวจริง',
    brandColors: [
      { token: 'brand.primary', dark: '#34d399', light: '#059669', usage: 'สีหลัก' },
      { token: 'brand.bg', dark: '#0c1210' },
    ],
    brandFonts: [
      { role: 'heading', family: 'Noto Sans Thai', note: 'พาดหัว' },
      { role: 'display', family: 'Great Vibes' },
    ],
    // Governance
    bookVersion: '2.1',
    bookApproverName: 'คุณนารา',
    bookApproverContact: 'nara@example.co.th',
  };

  it('PATCH persists foundation/verbal/visual/governance fields (normalize + trim arrays)', async () => {
    const id = await createBrand('BrandBook เต็มรูป ' + Date.now());
    await http(app).patch(`/api/brands/${id}`).set(auth(adminToken)).send(FULL_BOOK).expect(200);

    const detail = await http(app).get(`/api/brands/${id}`).set(auth(adminToken)).expect(200);
    expect(detail.body).toMatchObject({
      mission: FULL_BOOK.mission,
      vision: FULL_BOOK.vision,
      positioning: FULL_BOOK.positioning,
      personality: FULL_BOOK.personality,
      tagline: FULL_BOOK.tagline,
      taglineFont: FULL_BOOK.taglineFont,
      exampleOnBrand: FULL_BOOK.exampleOnBrand,
      exampleOffBrand: FULL_BOOK.exampleOffBrand,
      nameUsage: FULL_BOOK.nameUsage,
      logoUsageNote: FULL_BOOK.logoUsageNote,
      moodNote: FULL_BOOK.moodNote,
      bookVersion: '2.1',
      bookApproverName: 'คุณนารา',
      bookApproverContact: 'nara@example.co.th',
    });
    // array trim + ตัดว่าง
    expect(detail.body.coreValues).toEqual(['จริงใจ', 'โปร่งใส']);
    expect(detail.body.wordBankUse).toEqual(['ผิวแข็งแรง', 'อ่อนโยน']);
    expect(detail.body.wordBankAvoid).toEqual(['ขาวใน 7 วัน']);
    // JSON fields normalize แล้ว
    expect(detail.body.platformGuides).toEqual(FULL_BOOK.platformGuides);
    expect(detail.body.brandColors).toEqual([
      { token: 'brand.primary', dark: '#34d399', light: '#059669', usage: 'สีหลัก' },
      { token: 'brand.bg', dark: '#0c1210', light: null, usage: null },
    ]);
    expect(detail.body.brandFonts).toEqual([
      { role: 'heading', family: 'Noto Sans Thai', note: 'พาดหัว' },
      { role: 'display', family: 'Great Vibes', note: null },
    ]);
  });

  it('rejects brandColors with bad hex / missing token / no color value (400)', async () => {
    const id = await createBrand('BrandBook สีผิด ' + Date.now());
    // hex ผิด
    await http(app)
      .patch(`/api/brands/${id}`)
      .set(auth(adminToken))
      .send({ brandColors: [{ token: 'brand.primary', dark: 'green' }] })
      .expect(400);
    // ไม่มี token
    await http(app)
      .patch(`/api/brands/${id}`)
      .set(auth(adminToken))
      .send({ brandColors: [{ dark: '#34d399' }] })
      .expect(400);
    // มี token แต่ไม่มีค่าสีสักฝั่ง
    await http(app)
      .patch(`/api/brands/${id}`)
      .set(auth(adminToken))
      .send({ brandColors: [{ token: 'brand.primary' }] })
      .expect(400);
    // ไม่ใช่ array
    await http(app)
      .patch(`/api/brands/${id}`)
      .set(auth(adminToken))
      .send({ brandColors: { token: 'x' } })
      .expect(400);
  });

  it('rejects brandFonts with bad role / missing family (400)', async () => {
    const id = await createBrand('BrandBook ฟอนต์ผิด ' + Date.now());
    await http(app)
      .patch(`/api/brands/${id}`)
      .set(auth(adminToken))
      .send({ brandFonts: [{ role: 'slogan', family: 'Great Vibes' }] })
      .expect(400);
    await http(app)
      .patch(`/api/brands/${id}`)
      .set(auth(adminToken))
      .send({ brandFonts: [{ role: 'heading' }] })
      .expect(400);
  });

  it('rejects platformGuides non-object / non-string values (400)', async () => {
    const id = await createBrand('BrandBook guide ผิด ' + Date.now());
    await http(app)
      .patch(`/api/brands/${id}`)
      .set(auth(adminToken))
      .send({ platformGuides: 'เขียนสั้นๆ' })
      .expect(400);
    await http(app)
      .patch(`/api/brands/${id}`)
      .set(auth(adminToken))
      .send({ platformGuides: ['facebook'] })
      .expect(400);
    await http(app)
      .patch(`/api/brands/${id}`)
      .set(auth(adminToken))
      .send({ platformGuides: { facebook: 123 } })
      .expect(400);
  });

  it('stamps bookUpdatedAt on book-field change but NOT on unrelated PATCH (contact)', async () => {
    const id = await createBrand('BrandBook stamp ' + Date.now());

    // แบรนด์ใหม่ยังไม่มี stamp
    const before = await http(app).get(`/api/brands/${id}`).set(auth(adminToken)).expect(200);
    expect(before.body.bookUpdatedAt).toBeNull();

    // PATCH ที่ไม่ใช่เนื้อหา book → ไม่ stamp
    await http(app)
      .patch(`/api/brands/${id}`)
      .set(auth(adminToken))
      .send({ contact: 'line: @nostamp' })
      .expect(200);
    const afterContact = await http(app).get(`/api/brands/${id}`).set(auth(adminToken)).expect(200);
    expect(afterContact.body.bookUpdatedAt).toBeNull();

    // PATCH เนื้อหา book → stamp
    await http(app)
      .patch(`/api/brands/${id}`)
      .set(auth(adminToken))
      .send({ mission: 'พันธกิจใหม่' })
      .expect(200);
    const afterBook = await http(app).get(`/api/brands/${id}`).set(auth(adminToken)).expect(200);
    expect(afterBook.body.bookUpdatedAt).not.toBeNull();
  });

  it('GET /brands/:id/book returns aggregate: fields + audiences + assets grouped + clients', async () => {
    const id = await createBrand('BrandBook aggregate ' + Date.now());
    await http(app).patch(`/api/brands/${id}`).set(auth(adminToken)).send(FULL_BOOK).expect(200);

    // audience + primary
    const seg = await http(app)
      .post('/api/audience-segments')
      .set(auth(adminToken))
      .send({ name: 'กลุ่ม book ' + Date.now(), ageMin: 25, ageMax: 38, gender: 'female' })
      .expect(201);
    await http(app)
      .put(`/api/brands/${id}/audiences`)
      .set(auth(adminToken))
      .send({ items: [{ segmentId: seg.body.id, isPrimary: true }] })
      .expect(200);

    // client ผูกแบรนด์
    const client = await http(app)
      .post('/api/clients')
      .set(auth(adminToken))
      .send({ name: 'บจก. ลูกค้า Book ' + Date.now(), type: 'brand', brandId: id })
      .expect(201);

    // โลโก้ icon (linkRole ใหม่) + เทมเพลต
    await http(app)
      .post('/api/assets')
      .set(auth(adminToken))
      .field('assetType', 'brand_logo')
      .field('entityType', 'brand')
      .field('entityId', id)
      .field('linkRole', 'logo_icon')
      .attach('file', PNG_BUFFER, 'logo-icon.png')
      .expect(201);
    await http(app)
      .post('/api/assets')
      .set(auth(adminToken))
      .field('assetType', 'brand_template')
      .field('entityType', 'brand')
      .field('entityId', id)
      .field('linkRole', 'template')
      .attach('file', PNG_BUFFER, 'template-fb.png')
      .expect(201);

    const book = await http(app).get(`/api/brands/${id}/book`).set(auth(adminToken)).expect(200);
    expect(book.body).toMatchObject({
      id,
      mission: FULL_BOOK.mission,
      tagline: FULL_BOOK.tagline,
      bookVersion: '2.1',
      productCount: 0,
    });
    expect(typeof book.body.completeness).toBe('number');
    // audiences พร้อม isPrimary
    expect(book.body.audiences).toHaveLength(1);
    expect(book.body.audiences[0]).toMatchObject({ segmentId: seg.body.id, isPrimary: true });
    // clients ที่ผูกแบรนด์
    expect(book.body.clients).toEqual([{ id: client.body.id, name: client.body.name }]);
    // assets จัดกลุ่มตาม linkRole
    expect(book.body.assets.logos.icon).toMatchObject({
      linkRole: 'logo_icon',
      originalFilename: 'logo-icon.png',
    });
    expect(book.body.assets.logos.full).toBeNull();
    expect(book.body.assets.logos.mono).toBeNull();
    expect(book.body.assets.templates).toHaveLength(1);
    expect(book.body.assets.templates[0].originalFilename).toBe('template-fb.png');
    expect(book.body.assets.moods).toEqual([]);
    expect(book.body.assets.files).toEqual([]);

    // ไม่มีจริง → 404
    await http(app)
      .get('/api/brands/00000000-0000-0000-0000-000000000000/book')
      .set(auth(adminToken))
      .expect(404);
  });

  it('GET /brands list returns bookCompleteness + clientCount + tagline (additive)', async () => {
    const emptyId = await createBrand('BrandBook list ว่าง ' + Date.now());
    const fullId = await createBrand('BrandBook list เต็ม ' + Date.now());
    await http(app).patch(`/api/brands/${fullId}`).set(auth(adminToken)).send(FULL_BOOK).expect(200);

    const list = await http(app).get('/api/brands').set(auth(adminToken)).expect(200);
    const empty = list.body.find((b: { id: string }) => b.id === emptyId);
    const full = list.body.find((b: { id: string }) => b.id === fullId);

    expect(empty).toMatchObject({ bookCompleteness: 0, clientCount: 0, productCount: 0 });
    expect(full.tagline).toBe(FULL_BOOK.tagline);
    // FULL_BOOK กรอก 10/12 ข้อของเช็กลิสต์ (ขาด toneOfVoice + restrictedClaims)
    expect(full.bookCompleteness).toBeGreaterThan(0);
    expect(full.bookCompleteness).toBeLessThanOrEqual(100);
    // ของเดิมยังอยู่ (backward compat กับ CatalogManager)
    expect(full.name).toContain('BrandBook list เต็ม');
    expect(full.status).toBe('active');
  });

  it('buildBrandContext appends mission / word bank / platform guides / colors (append-only)', async () => {
    const svc = app.get(BrandKnowledgeService);
    const id = await createBrand('BrandBook context ' + Date.now());
    await http(app)
      .patch(`/api/brands/${id}`)
      .set(auth(adminToken))
      .send({ ...FULL_BOOK, brandStory: 'เรื่องราวเดิมของระบบ 1', restrictedClaims: ['เคลมต้องห้าม X'] })
      .expect(200);

    const ctx = await svc.buildBrandContext(id);
    // section เดิม (ระบบ 1) ยังครบ
    expect(ctx).toContain('เรื่องราวเดิมของระบบ 1');
    expect(ctx).toContain('เคลมต้องห้าม X');
    // section ใหม่ append
    expect(ctx).toContain(FULL_BOOK.mission);
    expect(ctx).toContain(FULL_BOOK.vision);
    expect(ctx).toContain('ผิวแข็งแรง'); // word bank use
    expect(ctx).toContain('ขาวใน 7 วัน'); // word bank avoid
    expect(ctx).toContain('facebook: เล่าเรื่อง+ให้ความรู้ ยาวได้'); // platform guide
    expect(ctx).toContain(FULL_BOOK.nameUsage);
    expect(ctx).toContain('brand.primary'); // สี token
    expect(ctx).toContain('#34d399');
    expect(ctx).toContain(FULL_BOOK.tagline);
  });

  it('brand ที่มีแค่ book field (ไม่มี knowledge ระบบ 1) ก็ได้ context ไม่ใช่ ""', async () => {
    const svc = app.get(BrandKnowledgeService);
    const id = await createBrand('BrandBook mission เดี่ยว ' + Date.now());
    await http(app)
      .patch(`/api/brands/${id}`)
      .set(auth(adminToken))
      .send({ mission: 'พันธกิจเดี่ยวๆ' })
      .expect(200);
    const ctx = await svc.buildBrandContext(id);
    expect(ctx).toContain('พันธกิจเดี่ยวๆ');
  });

  it('asset link roles ใหม่ (logo_full / mood) ใช้ได้ · role มั่ว → 400', async () => {
    const id = await createBrand('BrandBook asset role ' + Date.now());
    await http(app)
      .post('/api/assets')
      .set(auth(adminToken))
      .field('assetType', 'brand_logo')
      .field('entityType', 'brand')
      .field('entityId', id)
      .field('linkRole', 'logo_full')
      .attach('file', PNG_BUFFER, 'logo-full.png')
      .expect(201);
    await http(app)
      .post('/api/assets')
      .set(auth(adminToken))
      .field('assetType', 'brand_mood')
      .field('entityType', 'brand')
      .field('entityId', id)
      .field('linkRole', 'mood')
      .attach('file', PNG_BUFFER, 'mood.png')
      .expect(201);
    await http(app)
      .post('/api/assets')
      .set(auth(adminToken))
      .field('assetType', 'brand_logo')
      .field('entityType', 'brand')
      .field('entityId', id)
      .field('linkRole', 'logo_sideways')
      .attach('file', PNG_BUFFER, 'bad.png')
      .expect(400);

    const book = await http(app).get(`/api/brands/${id}/book`).set(auth(adminToken)).expect(200);
    expect(book.body.assets.logos.full).toMatchObject({ linkRole: 'logo_full' });
    expect(book.body.assets.moods).toHaveLength(1);
  });

  it('permission gate: researcher (product V) อ่าน book ได้ แต่ PATCH book fields → 403', async () => {
    const id = await createBrand('BrandBook สิทธิ์ ' + Date.now());
    await http(app).get(`/api/brands/${id}/book`).set(auth(researcherToken)).expect(200);
    await http(app)
      .patch(`/api/brands/${id}`)
      .set(auth(researcherToken))
      .send({ mission: 'ไม่ควรบันทึกได้' })
      .expect(403);
  });
});
