import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
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

// AC-3 asset pipeline + §D state machine (§F.3)
describe('Assets (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let adminToken: string;
  let researcherToken: string;
  let characterId: string;
  let assetId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await ensureResearcher(prisma);
    app = await createApp();
    adminToken = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);
    researcherToken = await loginAs(app, RESEARCHER_EMAIL, RESEARCHER_PASSWORD);

    const character = await http(app)
      .post('/api/characters')
      .set(auth(adminToken))
      .send({ nameTh: 'เจ้าของแอสเซ็ต', nameEn: 'AssetOwner' })
      .expect(201);
    characterId = character.body.id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('upload → 201 with sha256 checksum + fileSize, status uploaded', async () => {
    const expectedChecksum = createHash('sha256').update(PNG_BUFFER).digest('hex');

    const res = await http(app)
      .post('/api/assets')
      .set(auth(adminToken))
      .field('assetType', 'face_reference')
      .field('entityType', 'character')
      .field('entityId', characterId)
      .field('linkRole', 'reference')
      .attach('file', PNG_BUFFER, 'ref.png')
      .expect(201);

    assetId = res.body.id;
    expect(res.body.checksumSha256).toBe(expectedChecksum);
    expect(res.body.fileSize).toBe(PNG_BUFFER.length);
    expect(res.body.status).toBe('uploaded');
    expect(res.body.mimeType).toBe('image/png');
    expect(res.body.originalFilename).toBe('ref.png');
  });

  it('GET /assets?entityType=character&entityId= filters to linked assets', async () => {
    const res = await http(app)
      .get('/api/assets')
      .query({ entityType: 'character', entityId: characterId })
      .set(auth(adminToken))
      .expect(200);

    expect(res.body.items.length).toBeGreaterThanOrEqual(1);
    const ids = res.body.items.map((a: { id: string }) => a.id);
    expect(ids).toContain(assetId);
    for (const item of res.body.items) {
      expect(item.links).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ entityType: 'character', entityId: characterId }),
        ]),
      );
    }
  });

  it('GET /assets/:id/file streams 200 with content-type + original bytes', async () => {
    const res = await http(app)
      .get(`/api/assets/${assetId}/file`)
      .set(auth(adminToken))
      .buffer(true)
      .parse(binaryParser)
      .expect(200)
      .expect('Content-Type', /image\/png/);
    expect((res.body as Buffer).equals(PNG_BUFFER)).toBe(true);
  });

  it('invalid status transition uploaded → production_used → 400', async () => {
    const res = await http(app)
      .patch(`/api/assets/${assetId}/status`)
      .set(auth(adminToken))
      .send({ status: 'production_used' })
      .expect(400);
    expect(res.body.message).toContain('uploaded');
  });

  it('approved_reference requires A — researcher denied, admin allowed', async () => {
    // admin: uploaded → selected (valid transition, no A needed)
    const selected = await http(app)
      .patch(`/api/assets/${assetId}/status`)
      .set(auth(adminToken))
      .send({ status: 'selected' })
      .expect(200);
    expect(selected.body.status).toBe('selected');

    // researcher has no asset permissions at all → 403
    await http(app)
      .patch(`/api/assets/${assetId}/status`)
      .set(auth(researcherToken))
      .send({ status: 'approved_reference' })
      .expect(403);

    // admin has asset A → 200
    const approved = await http(app)
      .patch(`/api/assets/${assetId}/status`)
      .set(auth(adminToken))
      .send({ status: 'approved_reference' })
      .expect(200);
    expect(approved.body.status).toBe('approved_reference');
  });
});
