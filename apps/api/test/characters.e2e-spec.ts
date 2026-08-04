import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  PNG_BUFFER,
  auth,
  createApp,
  http,
  loginAs,
} from './utils';

// AC-2: character lifecycle — wizard create, state machine, approve readiness,
// optimistic locking, version snapshots. Plus audit trail assertions (§27.1).
describe('Character lifecycle (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let token: string;
  let characterId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    app = await createApp();
    token = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('create with 3 fields → 201, displayCode CHR-*, status draft', async () => {
    const res = await http(app)
      .post('/api/characters')
      .set(auth(token))
      .send({
        nameTh: 'แพรวา',
        nameEn: 'Praewa',
        oneLineConcept: 'สาวออฟฟิศสายมูที่ขายเครื่องรางออนไลน์',
      })
      .expect(201);

    characterId = res.body.id;
    expect(res.body.displayCode).toMatch(/^CHR-[A-Z0-9]+-\d{3}$/);
    expect(res.body.status).toBe('draft');
    expect(res.body.nameTh).toBe('แพรวา');
    // oneLineConcept is folded into persona JSON
    expect(res.body.persona).toMatchObject({
      one_line_concept: 'สาวออฟฟิศสายมูที่ขายเครื่องรางออนไลน์',
    });
  });

  it('PATCH update works', async () => {
    const res = await http(app)
      .patch(`/api/characters/${characterId}`)
      .set(auth(token))
      .send({ universe: 'AISTAR Universe', roleLabel: 'นางเอก' })
      .expect(200);
    expect(res.body.universe).toBe('AISTAR Universe');
    expect(res.body.roleLabel).toBe('นางเอก');
  });

  it('invalid transition draft → approved → 400', async () => {
    const res = await http(app)
      .patch(`/api/characters/${characterId}/status`)
      .set(auth(token))
      .send({ status: 'approved' })
      .expect(400);
    expect(res.body.message).toContain('draft');
  });

  it('draft → internal_review → 200', async () => {
    const res = await http(app)
      .patch(`/api/characters/${characterId}/status`)
      .set(auth(token))
      .send({ status: 'internal_review' })
      .expect(200);
    expect(res.body.status).toBe('internal_review');
  });

  it('approve WITHOUT primary reference asset → 400 with Thai message', async () => {
    const res = await http(app)
      .patch(`/api/characters/${characterId}/status`)
      .set(auth(token))
      .send({ status: 'approved' })
      .expect(400);
    expect(res.body.message).toContain('primary reference');
    expect(res.body.message).toMatch(/[฀-๿]/); // contains Thai characters
  });

  it('upload primary_reference asset then approve → 200 approved', async () => {
    const upload = await http(app)
      .post('/api/assets')
      .set(auth(token))
      .field('assetType', 'face_reference')
      .field('entityType', 'character')
      .field('entityId', characterId)
      .field('linkRole', 'primary_reference')
      .attach('file', PNG_BUFFER, 'praewa_face.png')
      .expect(201);

    expect(upload.body.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityType: 'character',
          entityId: characterId,
          linkRole: 'primary_reference',
        }),
      ]),
    );

    const res = await http(app)
      .patch(`/api/characters/${characterId}/status`)
      .set(auth(token))
      .send({ status: 'approved' })
      .expect(200);
    expect(res.body.status).toBe('approved');
  });

  it('optimistic locking: PATCH with stale expectedUpdatedAt → 409', async () => {
    const current = await http(app)
      .get(`/api/characters/${characterId}`)
      .set(auth(token))
      .expect(200);
    const staleTimestamp = current.body.updatedAt;

    // someone else edits in between → updatedAt moves
    await http(app)
      .patch(`/api/characters/${characterId}`)
      .set(auth(token))
      .send({ series: 'ซีรีส์หนึ่ง' })
      .expect(200);

    await http(app)
      .patch(`/api/characters/${characterId}`)
      .set(auth(token))
      .send({ series: 'ซีรีส์สอง', expectedUpdatedAt: staleTimestamp })
      .expect(409);

    // matching expectedUpdatedAt still works
    const fresh = await http(app)
      .get(`/api/characters/${characterId}`)
      .set(auth(token))
      .expect(200);
    await http(app)
      .patch(`/api/characters/${characterId}`)
      .set(auth(token))
      .send({ series: 'ซีรีส์สาม', expectedUpdatedAt: fresh.body.updatedAt })
      .expect(200);
  });

  it('POST /characters/:id/versions snapshot → 201 and GET lists it', async () => {
    const created = await http(app)
      .post(`/api/characters/${characterId}/versions`)
      .set(auth(token))
      .send({ label: 'v1.0', notes: 'snapshot หลัง approve' })
      .expect(201);
    expect(created.body.versionLabel).toBe('v1.0');
    expect(created.body.entityType).toBe('character');
    expect(created.body.entityId).toBe(characterId);
    expect(created.body.snapshot).toMatchObject({ id: characterId });

    const list = await http(app)
      .get(`/api/characters/${characterId}/versions`)
      .set(auth(token))
      .expect(200);
    expect(list.body.map((v: { versionLabel: string }) => v.versionLabel)).toContain('v1.0');
  });

  it('audit trail: audit_logs contains create + status_change rows for the entity', async () => {
    const logs = await prisma.auditLog.findMany({
      where: { entityType: 'character', entityId: characterId },
    });
    const actions = logs.map((l) => l.action);
    expect(actions).toContain('create');
    expect(actions).toContain('status_change');

    const statusChanges = logs.filter((l) => l.action === 'status_change');
    const transitions = statusChanges.map((l) => l.meta as { from: string; to: string });
    expect(transitions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: 'draft', to: 'internal_review' }),
        expect.objectContaining({ from: 'internal_review', to: 'approved' }),
      ]),
    );
  });
});
