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

// Jobs / งานรับจ้างผลิต — client production orders (MVP work-management)
describe('Jobs module (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let adminToken: string;
  let researcherToken: string; // job V only — probes the C guard

  let clientId: string;
  let productId: string;
  let characterId: string;
  let creatorId: string;
  let jobId: string;
  let firstCode: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await ensureResearcher(prisma);
    app = await createApp();
    adminToken = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);
    researcherToken = await loginAs(app, RESEARCHER_EMAIL, RESEARCHER_PASSWORD);

    // referenced entities for m2m sets
    const product = await http(app)
      .post('/api/products')
      .set(auth(adminToken))
      .send({ name: 'Job e2e สินค้า', category: 'beauty', claimRiskLevel: 'low', price: 199 })
      .expect(201);
    productId = product.body.id;

    const character = await http(app)
      .post('/api/characters')
      .set(auth(adminToken))
      .send({ nameTh: 'Job e2e พรีเซนเตอร์', nameEn: 'JobPresenter' })
      .expect(201);
    characterId = character.body.id;

    const creator = await http(app)
      .post('/api/creators')
      .set(auth(adminToken))
      .send({ name: 'Job e2e ทีมผลิต', line: '@jobcrew' })
      .expect(201);
    creatorId = creator.body.id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  // ── Clients ──────────────────────────────────────────────

  it('POST /clients creates a client + GET lists with jobCount', async () => {
    const created = await http(app)
      .post('/api/clients')
      .set(auth(adminToken))
      .send({ name: 'Job e2e Client', type: 'brand', contactName: 'คุณเอ', line: '@jobclient' })
      .expect(201);
    clientId = created.body.id;
    expect(created.body.status).toBe('active');

    const list = await http(app).get('/api/clients?q=Job e2e Client').set(auth(adminToken)).expect(200);
    const found = list.body.find((c: { id: string }) => c.id === clientId);
    expect(found).toBeDefined();
    expect(found.jobCount).toBe(0);
  });

  it('POST /clients is forbidden (403) for a V-only role', async () => {
    await http(app)
      .post('/api/clients')
      .set(auth(researcherToken))
      .send({ name: 'nope' })
      .expect(403);
  });

  // ── Jobs create / code sequence / validation ─────────────

  it('POST /jobs generates JOB-#### and links products/presenters/crew', async () => {
    const created = await http(app)
      .post('/api/jobs')
      .set(auth(adminToken))
      .send({
        title: 'รีวิวสินค้า e2e 3 คลิป',
        clientId,
        type: 'video_review',
        qtyClips: 3,
        quotePrice: 25000,
        productIds: [productId],
        characterIds: [characterId],
        crew: [{ creatorId, roleNote: 'ตัดต่อ' }],
      })
      .expect(201);
    jobId = created.body.id;
    firstCode = created.body.displayCode;
    expect(firstCode).toMatch(/^JOB-\d{4}$/);
    expect(created.body.status).toBe('inquiry');
  });

  it('POST /jobs increments the JOB-#### sequence', async () => {
    const created = await http(app)
      .post('/api/jobs')
      .set(auth(adminToken))
      .send({ title: 'งานที่สอง', clientId })
      .expect(201);
    const n1 = parseInt(firstCode.split('-')[1], 10);
    const n2 = parseInt(created.body.displayCode.split('-')[1], 10);
    expect(n2).toBe(n1 + 1);
  });

  it('POST /jobs rejects unknown product with 404', async () => {
    await http(app)
      .post('/api/jobs')
      .set(auth(adminToken))
      .send({
        title: 'bad',
        clientId,
        productIds: ['00000000-0000-0000-0000-000000000000'],
      })
      .expect(404);
  });

  it('POST /jobs is forbidden (403) for a V-only role', async () => {
    await http(app)
      .post('/api/jobs')
      .set(auth(researcherToken))
      .send({ title: 'nope', clientId })
      .expect(403);
  });

  // ── List filters ─────────────────────────────────────────

  it('GET /jobs filters by clientId + returns counts and paging shape', async () => {
    const res = await http(app)
      .get(`/api/jobs?clientId=${clientId}`)
      .set(auth(adminToken))
      .expect(200);
    expect(res.body).toEqual(
      expect.objectContaining({ total: expect.any(Number), page: 1, pageSize: expect.any(Number) }),
    );
    const item = res.body.items.find((j: { id: string }) => j.id === jobId);
    expect(item).toBeDefined();
    expect(item.client.name).toBe('Job e2e Client');
    expect(item.counts).toEqual(
      expect.objectContaining({ products: 1, presenters: 1, crew: 1, deliverables: 0 }),
    );
  });

  // ── Detail shape ─────────────────────────────────────────

  it('GET /jobs/:id returns full detail with products/presenters/crew', async () => {
    const res = await http(app).get(`/api/jobs/${jobId}`).set(auth(adminToken)).expect(200);
    expect(res.body.displayCode).toBe(firstCode);
    expect(res.body.products).toHaveLength(1);
    expect(res.body.presenters[0].id).toBe(characterId);
    expect(res.body.crew[0].creatorId).toBe(creatorId);
    expect(res.body.crew[0].line).toBe('@jobcrew');
    expect(res.body.crew[0].roleNote).toBe('ตัดต่อ');
  });

  it('PATCH /jobs/:id replaces the product set when provided', async () => {
    await http(app)
      .patch(`/api/jobs/${jobId}`)
      .set(auth(adminToken))
      .send({ productIds: [] })
      .expect(200);
    const res = await http(app).get(`/api/jobs/${jobId}`).set(auth(adminToken)).expect(200);
    expect(res.body.products).toHaveLength(0);
  });

  // ── Status state machine ─────────────────────────────────

  it('PATCH /jobs/:id/status rejects an illegal transition with 400', async () => {
    // inquiry → in_production is not allowed
    await http(app)
      .patch(`/api/jobs/${jobId}/status`)
      .set(auth(adminToken))
      .send({ status: 'in_production' })
      .expect(400);
  });

  it('PATCH /jobs/:id/status walks the pipeline and notifies owner/creator', async () => {
    for (const status of ['quoted', 'confirmed', 'in_production', 'internal_qc', 'delivered']) {
      await http(app)
        .patch(`/api/jobs/${jobId}/status`)
        .set(auth(adminToken))
        .send({ status })
        .expect(200);
    }
    const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
    expect(job.status).toBe('delivered');
    expect(job.deliveredAt).not.toBeNull();

    // admin created + owns the job → notify() excludes self, so no self-notification.
    // Assign a different owner then transition to confirm a notification row is written.
    const other = await prisma.user.findFirstOrThrow({ where: { email: RESEARCHER_EMAIL } });
    await prisma.job.update({ where: { id: jobId }, data: { ownerId: other.id } });
    await http(app)
      .patch(`/api/jobs/${jobId}/status`)
      .set(auth(adminToken))
      .send({ status: 'approved' })
      .expect(200);
    const notif = await prisma.notification.findFirst({
      where: { userId: other.id, entityType: 'job', entityId: jobId, type: 'job_status_change' },
    });
    expect(notif).not.toBeNull();
  });

  // ── Deliverables ─────────────────────────────────────────

  it('POST /jobs/:id/deliverables auto-increments round; PATCH updates status', async () => {
    const r1 = await http(app)
      .post(`/api/jobs/${jobId}/deliverables`)
      .set(auth(adminToken))
      .send({ title: 'ส่งรอบแรก' })
      .expect(201);
    expect(r1.body.round).toBe(1);
    expect(r1.body.status).toBe('pending');

    const r2 = await http(app)
      .post(`/api/jobs/${jobId}/deliverables`)
      .set(auth(adminToken))
      .send({})
      .expect(201);
    expect(r2.body.round).toBe(2);

    const upd = await http(app)
      .patch(`/api/jobs/${jobId}/deliverables/${r1.body.id}`)
      .set(auth(adminToken))
      .send({ status: 'approved', clientFeedback: 'โอเคเลย' })
      .expect(200);
    expect(upd.body.status).toBe('approved');
    expect(upd.body.clientFeedback).toBe('โอเคเลย');
  });

  // ── Archive / unarchive ──────────────────────────────────

  it('DELETE /jobs/:id archives; PATCH unarchive restores', async () => {
    await http(app).delete(`/api/jobs/${jobId}`).set(auth(adminToken)).expect(200);
    let hidden = await http(app).get(`/api/jobs?clientId=${clientId}`).set(auth(adminToken)).expect(200);
    expect(hidden.body.items.find((j: { id: string }) => j.id === jobId)).toBeUndefined();

    const archivedList = await http(app)
      .get(`/api/jobs?clientId=${clientId}&archived=1`)
      .set(auth(adminToken))
      .expect(200);
    expect(archivedList.body.items.find((j: { id: string }) => j.id === jobId)).toBeDefined();

    await http(app).patch(`/api/jobs/${jobId}/unarchive`).set(auth(adminToken)).expect(200);
    hidden = await http(app).get(`/api/jobs?clientId=${clientId}`).set(auth(adminToken)).expect(200);
    expect(hidden.body.items.find((j: { id: string }) => j.id === jobId)).toBeDefined();
  });

  it('GET /clients/:id shows the client with a jobs summary', async () => {
    const res = await http(app).get(`/api/clients/${clientId}`).set(auth(adminToken)).expect(200);
    expect(res.body.name).toBe('Job e2e Client');
    expect(res.body.jobs.length).toBeGreaterThanOrEqual(1);
  });
});
