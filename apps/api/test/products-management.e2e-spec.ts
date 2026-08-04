import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  RESEARCHER_EMAIL,
  RESEARCHER_PASSWORD,
  auth,
  createApp,
  createUserWithRoles,
  ensureResearcher,
  http,
  loginAs,
} from './utils';

const COMMERCE_EMAIL = 'pm-commerce@aistar.test';
const COMMERCE_PASSWORD = 'aistar-commerce-2026';

// Products Management: quick/bulk archive + restore (มุมมองกรุ) + hard delete (admin X) พร้อม reference guard
describe('Products management: archive/restore/bulk/hard-delete (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let adminToken: string;
  let researcherToken: string; // product V only
  let commerceToken: string; // commerce_lead: product V,C,A — ไม่มี X
  let adminId: string;

  const run = Date.now();

  beforeAll(async () => {
    prisma = new PrismaClient();
    await ensureResearcher(prisma);
    await createUserWithRoles(prisma, COMMERCE_EMAIL, COMMERCE_PASSWORD, ['commerce_lead']);
    // createUserWithRoles upsert ไม่ตั้งรหัสใหม่ให้ user เดิม — sync hash ตรงๆ กัน login พังข้ามรอบ
    const bcrypt = await import('bcryptjs');
    await prisma.user.update({
      where: { email: COMMERCE_EMAIL },
      data: { passwordHash: await bcrypt.hash(COMMERCE_PASSWORD, 10) },
    });
    adminId = (await prisma.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } })).id;
    app = await createApp();
    adminToken = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);
    researcherToken = await loginAs(app, RESEARCHER_EMAIL, RESEARCHER_PASSWORD);
    commerceToken = await loginAs(app, COMMERCE_EMAIL, COMMERCE_PASSWORD);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function createProduct(name: string): Promise<{ id: string; displayCode: string }> {
    const res = await http(app)
      .post('/api/products')
      .set(auth(adminToken))
      .send({ name })
      .expect(201);
    return res.body;
  }

  it('archive → archived=1 list shows it (with archivedAt); default list hides; restore brings back; re-restore 404', async () => {
    const name = `PM Restore ${run}`;
    const p = await createProduct(name);

    await http(app).post(`/api/products/${p.id}/archive`).set(auth(adminToken)).expect(201);

    // default list ไม่เห็นของในกรุ
    const def = await http(app)
      .get('/api/products')
      .query({ q: name })
      .set(auth(adminToken))
      .expect(200);
    expect(def.body.items.map((x: { id: string }) => x.id)).not.toContain(p.id);

    // archived=1 เห็นเฉพาะของในกรุ + แนบ archivedAt
    const arch = await http(app)
      .get('/api/products')
      .query({ q: name, archived: '1' })
      .set(auth(adminToken))
      .expect(200);
    const item = arch.body.items.find((x: { id: string }) => x.id === p.id);
    expect(item).toBeDefined();
    expect(item.archivedAt).toEqual(expect.any(String));

    // restore → กลับมาใน list ปกติ และหายจากมุมมองกรุ
    const restored = await http(app)
      .post(`/api/products/${p.id}/restore`)
      .set(auth(adminToken))
      .expect(201);
    expect(restored.body.archivedAt).toBeNull();

    const def2 = await http(app)
      .get('/api/products')
      .query({ q: name })
      .set(auth(adminToken))
      .expect(200);
    expect(def2.body.items.map((x: { id: string }) => x.id)).toContain(p.id);

    const arch2 = await http(app)
      .get('/api/products')
      .query({ q: name, archived: '1' })
      .set(auth(adminToken))
      .expect(200);
    expect(arch2.body.items.map((x: { id: string }) => x.id)).not.toContain(p.id);

    // restore ของที่ไม่ได้ถูกเก็บถาวร → 404
    await http(app).post(`/api/products/${p.id}/restore`).set(auth(adminToken)).expect(404);
  });

  it('restore unknown id → 404', async () => {
    await http(app)
      .post(`/api/products/${randomUUID()}/restore`)
      .set(auth(adminToken))
      .expect(404);
  });

  it('bulk archive counts only non-archived; bulk restore counts back', async () => {
    const a = await createProduct(`PM BulkA ${run}`);
    const b = await createProduct(`PM BulkB ${run}`);
    await http(app).post(`/api/products/${b.id}/archive`).set(auth(adminToken)).expect(201);

    // b ถูกเก็บไปแล้ว → archive เพิ่มได้แค่ a
    const res = await http(app)
      .post('/api/products/bulk/archive')
      .set(auth(adminToken))
      .send({ ids: [a.id, b.id] })
      .expect(201);
    expect(res.body).toEqual({ archived: 1 });

    const back = await http(app)
      .post('/api/products/bulk/restore')
      .set(auth(adminToken))
      .send({ ids: [a.id, b.id] })
      .expect(201);
    expect(back.body).toEqual({ restored: 2 });

    // cleanup — เก็บกลับเข้ากรุ กันหลุดไปหน้า list อื่น
    await http(app)
      .post('/api/products/bulk/archive')
      .set(auth(adminToken))
      .send({ ids: [a.id, b.id] })
      .expect(201);
  });

  it('bulk validation: cap 100 ids, unknown id, non-uuid → 400', async () => {
    // 101 ids → เกิน cap
    await http(app)
      .post('/api/products/bulk/archive')
      .set(auth(adminToken))
      .send({ ids: Array.from({ length: 101 }, () => randomUUID()) })
      .expect(400);

    // id หน้าตา uuid แต่ไม่มีจริง → 400 ทั้งก้อน (ไม่ทำครึ่งๆ)
    const p = await createProduct(`PM BulkVal ${run}`);
    const bad = await http(app)
      .post('/api/products/bulk/archive')
      .set(auth(adminToken))
      .send({ ids: [p.id, randomUUID()] })
      .expect(400);
    expect(bad.body.message).toContain('ไม่พบสินค้า');
    // ต้องไม่ archive ตัวที่มีจริงไปด้วย
    const fresh = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
    expect(fresh.archivedAt).toBeNull();

    // ไม่ใช่ uuid → 400 จาก validation
    await http(app)
      .post('/api/products/bulk/archive')
      .set(auth(adminToken))
      .send({ ids: ['not-a-uuid'] })
      .expect(400);

    await http(app).post(`/api/products/${p.id}/archive`).set(auth(adminToken)).expect(201);
  });

  it('bulk set-category: validates active key, updates all', async () => {
    const a = await createProduct(`PM Cat A ${run}`);
    const b = await createProduct(`PM Cat B ${run}`);

    const res = await http(app)
      .post('/api/products/bulk/set-category')
      .set(auth(adminToken))
      .send({ ids: [a.id, b.id], category: 'beauty' })
      .expect(201);
    expect(res.body).toEqual({ updated: 2 });

    const got = await http(app).get(`/api/products/${a.id}`).set(auth(adminToken)).expect(200);
    expect(got.body.category).toBe('beauty');

    // key มั่ว → 400
    await http(app)
      .post('/api/products/bulk/set-category')
      .set(auth(adminToken))
      .send({ ids: [a.id], category: 'does-not-exist' })
      .expect(400);

    await http(app)
      .post('/api/products/bulk/archive')
      .set(auth(adminToken))
      .send({ ids: [a.id, b.id] })
      .expect(201);
  });

  it('bulk set-brand: sets active brand; null clears; unknown brand 400', async () => {
    const p = await createProduct(`PM Brand ${run}`);
    const brand = await http(app)
      .post('/api/brands')
      .set(auth(adminToken))
      .send({ name: `PM Bulk Brand ${run}` })
      .expect(201);

    const set = await http(app)
      .post('/api/products/bulk/set-brand')
      .set(auth(adminToken))
      .send({ ids: [p.id], brandId: brand.body.id })
      .expect(201);
    expect(set.body).toEqual({ updated: 1 });
    const got = await http(app).get(`/api/products/${p.id}`).set(auth(adminToken)).expect(200);
    expect(got.body.brandId).toBe(brand.body.id);

    // brandId: null → ล้างแบรนด์ออก
    const clear = await http(app)
      .post('/api/products/bulk/set-brand')
      .set(auth(adminToken))
      .send({ ids: [p.id], brandId: null })
      .expect(201);
    expect(clear.body).toEqual({ updated: 1 });
    const got2 = await http(app).get(`/api/products/${p.id}`).set(auth(adminToken)).expect(200);
    expect(got2.body.brandId).toBeNull();

    // แบรนด์ไม่มีจริง → 400
    await http(app)
      .post('/api/products/bulk/set-brand')
      .set(auth(adminToken))
      .send({ ids: [p.id], brandId: randomUUID() })
      .expect(400);

    await http(app).post(`/api/products/${p.id}/archive`).set(auth(adminToken)).expect(201);
  });

  it('DELETE clean product: removes it + its asset links (asset file row stays) + audit hard_delete snapshot', async () => {
    const p = await createProduct(`PM HardDel ${run}`);

    // ลิงก์รูปปก — ต้องถูกลบตามสินค้า แต่ Asset จริงต้องอยู่
    const asset = await prisma.asset.create({
      data: {
        assetType: 'product_image',
        storageKey: `e2e/pm-${run}.png`,
        originalFilename: 'pm.png',
        mimeType: 'image/png',
        fileSize: 68,
        uploadedBy: adminId,
      },
    });
    await prisma.assetLink.create({
      data: { assetId: asset.id, entityType: 'product', entityId: p.id, linkRole: 'cover' },
    });

    const res = await http(app).delete(`/api/products/${p.id}`).set(auth(adminToken)).expect(200);
    expect(res.body).toEqual({ ok: true });

    expect(await prisma.product.findUnique({ where: { id: p.id } })).toBeNull();
    expect(
      await prisma.assetLink.count({ where: { entityType: 'product', entityId: p.id } }),
    ).toBe(0);
    expect(await prisma.asset.findUnique({ where: { id: asset.id } })).not.toBeNull();

    // audit hard_delete พร้อม snapshot ชื่อ/รหัส
    const log = await prisma.auditLog.findFirst({
      where: { action: 'hard_delete', entityType: 'product', entityId: p.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(log).not.toBeNull();
    expect(log?.meta).toMatchObject({ displayCode: p.displayCode });

    // ลบซ้ำ → 404
    await http(app).delete(`/api/products/${p.id}`).set(auth(adminToken)).expect(404);
  });

  it('DELETE referenced product → 409 with Thai per-type counts', async () => {
    const p = await createProduct(`PM RefDel ${run}`);
    const job = await prisma.affiliateClipJob.create({
      data: {
        displayCode: `CLIP-E2E-${run}`,
        name: 'e2e ref clip job',
        productId: p.id,
        createdBy: adminId,
      },
    });

    const res = await http(app).delete(`/api/products/${p.id}`).set(auth(adminToken)).expect(409);
    expect(res.body.message).toContain('ลบถาวรไม่ได้');
    expect(res.body.message).toContain('Clip Job 1');
    expect(res.body.message).toContain('แนะนำเก็บถาวรแทน');

    // ยังอยู่ครบ — guard บล็อคจริง
    expect(await prisma.product.findUnique({ where: { id: p.id } })).not.toBeNull();

    // cleanup: ปลด ref → เก็บเข้ากรุ
    await prisma.affiliateClipJob.delete({ where: { id: job.id } });
    await http(app).post(`/api/products/${p.id}/archive`).set(auth(adminToken)).expect(201);
  });

  it('DELETE needs product X: commerce_lead (V,C,A) → 403; researcher bulk (no C) → 403', async () => {
    const p = await createProduct(`PM Perm ${run}`);

    // commerce_lead มี C แต่ไม่มี X → ลบถาวรไม่ได้
    await http(app).delete(`/api/products/${p.id}`).set(auth(commerceToken)).expect(403);

    // researcher มีแค่ V → bulk/restore ใช้ไม่ได้
    await http(app)
      .post('/api/products/bulk/archive')
      .set(auth(researcherToken))
      .send({ ids: [p.id] })
      .expect(403);
    await http(app)
      .post(`/api/products/${p.id}/restore`)
      .set(auth(researcherToken))
      .expect(403);

    // commerce_lead มี C → bulk archive ได้
    const ok = await http(app)
      .post('/api/products/bulk/archive')
      .set(auth(commerceToken))
      .send({ ids: [p.id] })
      .expect(201);
    expect(ok.body).toEqual({ archived: 1 });
  });
});
