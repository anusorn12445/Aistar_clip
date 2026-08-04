import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  PNG_BUFFER,
  RESEARCHER_EMAIL,
  RESEARCHER_PASSWORD,
  auth,
  binaryParser,
  createApp,
  ensureResearcher,
  http,
  loginAs,
} from './utils';

// Brand Book share link (เฟส 2) — ลิงก์แชร์ read-only ให้ลูกค้า (ไม่ต้อง login)
// token = crypto-random 48 hex chars, lookup อย่างเดียว, revoke ได้ทันที
describe('Brand Book share link (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let adminToken: string;
  let researcherToken: string; // product V only — ห้ามเปิด/ปิดแชร์

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

  async function uploadBrandAsset(
    brandId: string,
    linkRole: string,
    filename: string,
  ): Promise<string> {
    const res = await http(app)
      .post('/api/assets')
      .set(auth(adminToken))
      .field('assetType', linkRole === 'template' ? 'brand_template' : 'brand_logo')
      .field('entityType', 'brand')
      .field('entityId', brandId)
      .field('linkRole', linkRole)
      .attach('file', PNG_BUFFER, filename)
      .expect(201);
    return res.body.id;
  }

  const BOOK_FIELDS = {
    mission: 'ให้ผู้หญิงไทยมั่นใจด้วยสกินแคร์ธรรมชาติ',
    tagline: 'Naturally Radiant, Always.',
    toneOfVoice: 'อบอุ่น จริงใจ',
    wordBankUse: ['ผิวแข็งแรง'],
    restrictedClaims: ['ขาวใน 7 วัน'],
    brandColors: [{ token: 'brand.primary', dark: '#34d399', light: '#059669', usage: 'สีหลัก' }],
    bookVersion: '1.0',
    bookApproverName: 'คุณนารา',
    bookApproverContact: 'nara@example.co.th', // ต้องไม่โผล่ใน payload สาธารณะ
    contact: 'line: @internal-only', // ข้อมูลบริหารแบรนด์ — ห้ามหลุด
    notes: 'โน้ตภายใน ห้ามลูกค้าเห็น',
    competitorsNote: 'คู่แข่งหลักลับสุดยอด ห้ามลูกค้าเห็น', // กลยุทธ์ภายใน — ห้ามหลุด
  };

  it('POST /brands/:id/share creates hex token (≥32 chars) and is idempotent until rotate', async () => {
    const id = await createBrand('BrandShare token ' + Date.now());

    const first = await http(app).post(`/api/brands/${id}/share`).set(auth(adminToken)).expect(201);
    expect(first.body.token).toMatch(/^[0-9a-f]{32,}$/);

    // ยิงซ้ำโดยไม่ rotate → token เดิม
    const again = await http(app).post(`/api/brands/${id}/share`).set(auth(adminToken)).expect(201);
    expect(again.body.token).toBe(first.body.token);

    // rotate → token ใหม่ + ลิงก์เก่า 404 ทันที
    const rotated = await http(app)
      .post(`/api/brands/${id}/share`)
      .set(auth(adminToken))
      .send({ rotate: true })
      .expect(201);
    expect(rotated.body.token).toMatch(/^[0-9a-f]{32,}$/);
    expect(rotated.body.token).not.toBe(first.body.token);
    await http(app).get(`/api/public/brand-book/${first.body.token}`).expect(404);
    await http(app).get(`/api/public/brand-book/${rotated.body.token}`).expect(200);
  });

  it('public GET by token (no auth) returns book WITHOUT clients/approver contact/internal fields', async () => {
    const id = await createBrand('BrandShare public ' + Date.now());
    await http(app).patch(`/api/brands/${id}`).set(auth(adminToken)).send(BOOK_FIELDS).expect(200);

    // client ผูกแบรนด์ (ต้องไม่โผล่ฝั่ง public)
    await http(app)
      .post('/api/clients')
      .set(auth(adminToken))
      .send({ name: 'บจก. ลูกค้าลับ ' + Date.now(), type: 'brand', brandId: id })
      .expect(201);
    await uploadBrandAsset(id, 'logo_icon', 'logo.png');

    const share = await http(app).post(`/api/brands/${id}/share`).set(auth(adminToken)).expect(201);

    // ไม่มี Authorization header เลย
    const pub = await http(app).get(`/api/public/brand-book/${share.body.token}`).expect(200);

    // เนื้อหา book ครบ
    expect(pub.body).toMatchObject({
      id,
      mission: BOOK_FIELDS.mission,
      tagline: BOOK_FIELDS.tagline,
      toneOfVoice: BOOK_FIELDS.toneOfVoice,
      bookVersion: '1.0',
      bookApproverName: 'คุณนารา',
    });
    expect(typeof pub.body.completeness).toBe('number');
    expect(Array.isArray(pub.body.audiences)).toBe(true);
    expect(pub.body.assets.logos.icon).toMatchObject({ linkRole: 'logo_icon' });

    // ข้อมูลภายในต้องไม่หลุด
    expect(pub.body.clients).toBeUndefined();
    expect(pub.body.productCount).toBeUndefined();
    expect(pub.body.bookApproverContact).toBeUndefined();
    expect(pub.body.contact).toBeUndefined();
    expect(pub.body.notes).toBeUndefined();
    expect(pub.body.bookShareToken).toBeUndefined();
    expect(pub.body.competitorsNote).toBeUndefined();
    expect(JSON.stringify(pub.body)).not.toContain('nara@example.co.th');
    expect(JSON.stringify(pub.body)).not.toContain('ลูกค้าลับ');
    expect(JSON.stringify(pub.body)).not.toContain('คู่แข่งหลักลับสุดยอด');
  });

  it('archived brand → share link 404 (token stops working once brand archived)', async () => {
    const id = await createBrand('BrandShare archived ' + Date.now());
    const share = await http(app).post(`/api/brands/${id}/share`).set(auth(adminToken)).expect(201);
    await http(app).get(`/api/public/brand-book/${share.body.token}`).expect(200);

    // archive แบรนด์ → ลิงก์แชร์ต้องตายทันที (404 เหมือน token ผิด)
    await prisma.brand.update({ where: { id }, data: { status: 'archived' } });
    await http(app).get(`/api/public/brand-book/${share.body.token}`).expect(404);
  });

  it('bad token → 404 · DELETE revokes → old link 404', async () => {
    const id = await createBrand('BrandShare revoke ' + Date.now());
    const share = await http(app).post(`/api/brands/${id}/share`).set(auth(adminToken)).expect(201);
    await http(app).get(`/api/public/brand-book/${share.body.token}`).expect(200);

    // token มั่ว (hex ยาวถูก format แต่ไม่มีจริง) + สั้นมั่ว → 404 เหมือนกัน
    await http(app).get(`/api/public/brand-book/${'0'.repeat(48)}`).expect(404);
    await http(app).get('/api/public/brand-book/nope').expect(404);

    await http(app).delete(`/api/brands/${id}/share`).set(auth(adminToken)).expect(200);
    await http(app).get(`/api/public/brand-book/${share.body.token}`).expect(404);
    await http(app)
      .get(`/api/public/brand-book/${share.body.token}/asset/00000000-0000-0000-0000-000000000000`)
      .expect(404);
  });

  it('public asset streams (no auth) when linked to the shared brand', async () => {
    const id = await createBrand('BrandShare asset ' + Date.now());
    const assetId = await uploadBrandAsset(id, 'logo_icon', 'logo-share.png');
    const share = await http(app).post(`/api/brands/${id}/share`).set(auth(adminToken)).expect(201);

    const res = await http(app)
      .get(`/api/public/brand-book/${share.body.token}/asset/${assetId}`)
      .buffer(true)
      .parse(binaryParser)
      .expect(200)
      .expect('Content-Type', /image\/png/);
    expect((res.body as Buffer).equals(PNG_BUFFER)).toBe(true);
  });

  it('foreign asset (linked to another brand) → 404 through the share token', async () => {
    const idA = await createBrand('BrandShare A ' + Date.now());
    const idB = await createBrand('BrandShare B ' + Date.now());
    const foreignAssetId = await uploadBrandAsset(idB, 'logo_icon', 'foreign.png');
    const share = await http(app).post(`/api/brands/${idA}/share`).set(auth(adminToken)).expect(201);

    // asset ของแบรนด์อื่น + asset id ที่ไม่มีจริง → 404 เหมือนกัน (ไม่ leak)
    await http(app)
      .get(`/api/public/brand-book/${share.body.token}/asset/${foreignAssetId}`)
      .expect(404);
    await http(app)
      .get(`/api/public/brand-book/${share.body.token}/asset/00000000-0000-0000-0000-000000000000`)
      .expect(404);
  });

  it('internal share endpoints are permission-gated: researcher (V) → 403, no auth → 401', async () => {
    const id = await createBrand('BrandShare สิทธิ์ ' + Date.now());
    await http(app).post(`/api/brands/${id}/share`).set(auth(researcherToken)).expect(403);
    await http(app).delete(`/api/brands/${id}/share`).set(auth(researcherToken)).expect(403);
    await http(app).post(`/api/brands/${id}/share`).expect(401);
    await http(app).delete(`/api/brands/${id}/share`).expect(401);
  });

  it('internal book aggregate exposes bookShareToken for the share UI', async () => {
    const id = await createBrand('BrandShare UI ' + Date.now());

    const before = await http(app).get(`/api/brands/${id}/book`).set(auth(adminToken)).expect(200);
    expect(before.body.bookShareToken).toBeNull();

    const share = await http(app).post(`/api/brands/${id}/share`).set(auth(adminToken)).expect(201);
    const after = await http(app).get(`/api/brands/${id}/book`).set(auth(adminToken)).expect(200);
    expect(after.body.bookShareToken).toBe(share.body.token);
  });

  it('share on missing brand → 404 · audit rows written for enable/rotate/revoke', async () => {
    await http(app)
      .post('/api/brands/00000000-0000-0000-0000-000000000000/share')
      .set(auth(adminToken))
      .expect(404);

    const id = await createBrand('BrandShare audit ' + Date.now());
    await http(app).post(`/api/brands/${id}/share`).set(auth(adminToken)).expect(201);
    await http(app)
      .post(`/api/brands/${id}/share`)
      .set(auth(adminToken))
      .send({ rotate: true })
      .expect(201);
    await http(app).delete(`/api/brands/${id}/share`).set(auth(adminToken)).expect(200);

    const logs = await prisma.auditLog.findMany({
      where: { entityType: 'brand', entityId: id },
      orderBy: { createdAt: 'asc' },
    });
    const actions = logs.map((l) => l.action);
    expect(actions).toEqual(expect.arrayContaining(['share_enable', 'share_rotate', 'share_revoke']));
  });
});
