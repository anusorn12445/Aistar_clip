import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  auth,
  createApp,
  createUserWithRoles,
  http,
  loginAs,
} from './utils';

const DESIGNER_EMAIL = 'lib-designer@aistar.test';
const DESIGNER_PASSWORD = 'lib-designer-2026';
const COMMERCE_EMAIL = 'lib-commerce@aistar.test';
const COMMERCE_PASSWORD = 'lib-commerce-2026';

// Library: locations (§14), voices (§15), rights (§16), QC reviews (§10)
describe('Library (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let adminToken: string;
  let designerToken: string; // voice V only → approve blocked
  let commerceToken: string; // rights V only → approve blocked
  let characterId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await createUserWithRoles(prisma, DESIGNER_EMAIL, DESIGNER_PASSWORD, ['character_designer']);
    await createUserWithRoles(prisma, COMMERCE_EMAIL, COMMERCE_PASSWORD, ['commerce_lead']);
    app = await createApp();
    adminToken = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);
    designerToken = await loginAs(app, DESIGNER_EMAIL, DESIGNER_PASSWORD);
    commerceToken = await loginAs(app, COMMERCE_EMAIL, COMMERCE_PASSWORD);

    const character = await http(app)
      .post('/api/characters')
      .set(auth(adminToken))
      .send({ nameTh: 'เจ้าของเสียง Lib', nameEn: 'LibVoiceOwner' })
      .expect(201);
    characterId = character.body.id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('locations', () => {
    let locationId: string;

    it('CRUD + filters', async () => {
      const created = await http(app)
        .post('/api/locations')
        .set(auth(adminToken))
        .send({
          name: 'Lib e2e คาเฟ่ริมคลอง',
          type: 'cafe',
          mood: 'อบอุ่น',
          timeOfDay: 'golden_hour',
        })
        .expect(201);
      locationId = created.body.id;
      expect(created.body.status).toBe('active');

      await http(app)
        .post('/api/locations')
        .set(auth(adminToken))
        .send({ name: 'Lib e2e ตลาดนัดกลางคืน', type: 'market', timeOfDay: 'night' })
        .expect(201);

      const byType = await http(app)
        .get('/api/locations')
        .query({ type: 'cafe', q: 'Lib e2e' })
        .set(auth(adminToken))
        .expect(200);
      expect(byType.body.items.map((l: { id: string }) => l.id)).toEqual([locationId]);

      const byTime = await http(app)
        .get('/api/locations')
        .query({ timeOfDay: 'night', q: 'Lib e2e' })
        .set(auth(adminToken))
        .expect(200);
      expect(byTime.body.items).toHaveLength(1);
      expect(byTime.body.items[0].name).toContain('ตลาดนัด');

      const updated = await http(app)
        .patch(`/api/locations/${locationId}`)
        .set(auth(adminToken))
        .send({ mood: 'ชิลล์', lighting: 'soft warm' })
        .expect(200);
      expect(updated.body.mood).toBe('ชิลล์');
    });

    it('archive hides the location from the default list', async () => {
      await http(app)
        .patch(`/api/locations/${locationId}/archive`)
        .set(auth(adminToken))
        .expect(200);

      const list = await http(app)
        .get('/api/locations')
        .query({ q: 'Lib e2e คาเฟ่' })
        .set(auth(adminToken))
        .expect(200);
      expect(list.body.items).toHaveLength(0);

      const archived = await http(app)
        .get('/api/locations')
        .query({ q: 'Lib e2e คาเฟ่', status: 'archived' })
        .set(auth(adminToken))
        .expect(200);
      expect(archived.body.items.map((l: { id: string }) => l.id)).toEqual([locationId]);
    });
  });

  describe('voices', () => {
    let voiceId: string;

    it('create with invalid characterId → 400', async () => {
      await http(app)
        .post('/api/voices')
        .set(auth(adminToken))
        .send({ characterId: randomUUID(), voiceType: 'สดใส' })
        .expect(400);
    });

    it('create draft voice profile bound to character', async () => {
      const res = await http(app)
        .post('/api/voices')
        .set(auth(adminToken))
        .send({
          characterId,
          voiceType: 'สดใสมีพลัง',
          tone: 'เป็นกันเอง',
          sampleDialogues: ['สวัสดีค่า ทุกคน!'],
        })
        .expect(201);
      voiceId = res.body.id;
      expect(res.body.status).toBe('draft');
    });

    it('approve needs A: designer (voice V) 403, admin ok; approved→draft 400', async () => {
      await http(app)
        .patch(`/api/voices/${voiceId}/status`)
        .set(auth(designerToken))
        .send({ status: 'approved' })
        .expect(403);

      const approved = await http(app)
        .patch(`/api/voices/${voiceId}/status`)
        .set(auth(adminToken))
        .send({ status: 'approved' })
        .expect(200);
      expect(approved.body.status).toBe('approved');

      await http(app)
        .patch(`/api/voices/${voiceId}/status`)
        .set(auth(adminToken))
        .send({ status: 'draft' })
        .expect(400);
    });
  });

  describe('rights', () => {
    let rightId: string;

    it('entityType whitelist: unknown type → 400', async () => {
      await http(app)
        .post('/api/rights')
        .set(auth(adminToken))
        .send({ entityType: 'brand', entityId: characterId, owner: 'AISTAR Studio' })
        .expect(400);
    });

    it('create draft right, then draft→internal_only (C)', async () => {
      const res = await http(app)
        .post('/api/rights')
        .set(auth(adminToken))
        .send({
          entityType: 'character',
          entityId: characterId,
          owner: 'AISTAR Studio',
          commercialUsage: true,
          riskLevel: 'medium',
        })
        .expect(201);
      rightId = res.body.id;
      expect(res.body.legalStatus).toBe('draft');

      const internal = await http(app)
        .patch(`/api/rights/${rightId}/status`)
        .set(auth(adminToken))
        .send({ legalStatus: 'internal_only' })
        .expect(200);
      expect(internal.body.legalStatus).toBe('internal_only');
    });

    it('internal_only→commercial_approved needs A: commerce_lead (rights V) 403, admin ok', async () => {
      await http(app)
        .patch(`/api/rights/${rightId}/status`)
        .set(auth(commerceToken))
        .send({ legalStatus: 'commercial_approved' })
        .expect(403);

      const res = await http(app)
        .patch(`/api/rights/${rightId}/status`)
        .set(auth(adminToken))
        .send({ legalStatus: 'commercial_approved' })
        .expect(200);
      expect(res.body.legalStatus).toBe('commercial_approved');

      // backward move blocked by the machine
      await http(app)
        .patch(`/api/rights/${rightId}/status`)
        .set(auth(adminToken))
        .send({ legalStatus: 'internal_only' })
        .expect(400);
    });
  });

  describe('qc reviews', () => {
    it('score outside 1–5 → 400', async () => {
      await http(app)
        .post('/api/qc-reviews')
        .set(auth(adminToken))
        .send({
          entityType: 'character',
          entityId: characterId,
          category: 'character_consistency',
          score: 6,
        })
        .expect(400);
    });

    it('create reviews, summary computes avg + byCategory', async () => {
      const reviews = [
        { category: 'character_consistency', score: 5 },
        { category: 'character_consistency', score: 2 },
        { category: 'visual_quality', score: 4 },
      ];
      for (const r of reviews) {
        await http(app)
          .post('/api/qc-reviews')
          .set(auth(adminToken))
          .send({ entityType: 'character', entityId: characterId, ...r, comment: 'lib e2e' })
          .expect(201);
      }

      const summary = await http(app)
        .get('/api/qc-reviews/summary')
        .query({ entityType: 'character', entityId: characterId })
        .set(auth(adminToken))
        .expect(200);
      expect(summary.body.count).toBe(3);
      expect(summary.body.avgScore).toBe(3.67); // (5+2+4)/3 rounded to 2dp
      expect(summary.body.byCategory).toEqual({
        character_consistency: 3.5,
        visual_quality: 4,
      });
      expect(summary.body.latest.category).toBe('visual_quality');

      const list = await http(app)
        .get('/api/qc-reviews')
        .query({ entityType: 'character', entityId: characterId, scoreMin: 4 })
        .set(auth(adminToken))
        .expect(200);
      expect(list.body.total).toBe(2);
      expect(list.body.items[0].reviewerName).toBe('AISTAR Admin');
    });

    it('summary without entity params → 400', async () => {
      await http(app).get('/api/qc-reviews/summary').set(auth(adminToken)).expect(400);
    });
  });
});
