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

const VIEWER_EMAIL = 'interaction-viewer@aistar.test';
const VIEWER_PASSWORD = 'interaction-viewer-2026';

// Product Interaction Library — Slice 1: Hand Library + Gesture Library + Product State machine
describe('Interaction Library (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let adminToken: string;
  let viewerToken: string; // character_designer: library V only, no `setting` → mutate/settings 403

  beforeAll(async () => {
    prisma = new PrismaClient();
    await createUserWithRoles(prisma, VIEWER_EMAIL, VIEWER_PASSWORD, ['character_designer']);
    app = await createApp();
    adminToken = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);
    viewerToken = await loginAs(app, VIEWER_EMAIL, VIEWER_PASSWORD);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  // ═══ Hand Library ═══════════════════════════════════════════
  describe('hand profiles', () => {
    let handId: string;

    it('create → auto HAND-code + draft status', async () => {
      const res = await http(app)
        .post('/api/hands')
        .set(auth(adminToken))
        .send({
          name: 'มือสาวออฟฟิศ',
          category: 'adult_female',
          skinTone: 'medium',
          productCategorySuitability: ['beauty', 'supplement'],
        })
        .expect(201);
      handId = res.body.id;
      expect(res.body.displayCode).toMatch(/^HAND-\d{4}$/);
      expect(res.body.status).toBe('draft');
    });

    it('filters: category + productCategorySuitability contains', async () => {
      await http(app)
        .post('/api/hands')
        .set(auth(adminToken))
        .send({ name: 'มือช่าง', category: 'mechanic', productCategorySuitability: ['gadget'] })
        .expect(201);

      const byCat = await http(app)
        .get('/api/hands')
        .query({ category: 'adult_female' })
        .set(auth(adminToken))
        .expect(200);
      expect(byCat.body.items.every((h: { category: string }) => h.category === 'adult_female')).toBe(true);

      const bySuit = await http(app)
        .get('/api/hands')
        .query({ productCategorySuitability: 'gadget' })
        .set(auth(adminToken))
        .expect(200);
      expect(bySuit.body.items.every((h: { productCategorySuitability: string[] }) =>
        h.productCategorySuitability.includes('gadget'),
      )).toBe(true);
    });

    it('allowed/restricted gestures overlap → 400', async () => {
      await http(app)
        .post('/api/hands')
        .set(auth(adminToken))
        .send({
          name: 'มือทดสอบ overlap',
          category: 'adult_male',
          allowedGestures: ['hold_product', 'pour'],
          restrictedGestures: ['pour'],
        })
        .expect(400);
    });

    it('viewer (library V only) cannot create → 403', async () => {
      await http(app)
        .post('/api/hands')
        .set(auth(viewerToken))
        .send({ name: 'ห้ามสร้าง', category: 'adult_female' })
        .expect(403);
      // but can list
      await http(app).get('/api/hands').set(auth(viewerToken)).expect(200);
    });

    // ── Child-hand compliance gate ──
    it('child hand without policyFlag → 400', async () => {
      await http(app)
        .post('/api/hands')
        .set(auth(adminToken))
        .send({ name: 'มือเด็ก A', category: 'child', isChild: true })
        .expect(400);
    });

    it('child hand active without review → 400; with review → ok', async () => {
      const created = await http(app)
        .post('/api/hands')
        .set(auth(adminToken))
        .send({
          name: 'มือเด็ก B',
          category: 'child',
          isChild: true,
          policyFlag: 'parental_consent',
        })
        .expect(201);
      const childId = created.body.id;

      // block activate without complianceReviewed
      await http(app)
        .patch(`/api/hands/${childId}`)
        .set(auth(adminToken))
        .send({ status: 'active' })
        .expect(400);

      // review first, then activate
      await http(app)
        .patch(`/api/hands/${childId}`)
        .set(auth(adminToken))
        .send({ complianceReviewed: true })
        .expect(200);
      const activated = await http(app)
        .patch(`/api/hands/${childId}`)
        .set(auth(adminToken))
        .send({ status: 'active' })
        .expect(200);
      expect(activated.body.status).toBe('active');
    });

    it('archive hides from default list', async () => {
      await http(app).patch(`/api/hands/${handId}/archive`).set(auth(adminToken)).expect(200);
      const list = await http(app)
        .get('/api/hands')
        .query({ q: 'มือสาวออฟฟิศ' })
        .set(auth(adminToken))
        .expect(200);
      expect(list.body.items).toHaveLength(0);
    });
  });

  // ═══ Gesture Library ════════════════════════════════════════
  describe('gestures', () => {
    let gestureId: string;

    it('create with valid product-state refs (builtin) + risk badge', async () => {
      const res = await http(app)
        .post('/api/gestures')
        .set(auth(adminToken))
        .send({
          name: 'เปิดฝาขวด',
          key: `open_cap_${Date.now()}`,
          category: 'open',
          riskLevel: 'medium',
          requiredProductState: 'sealed',
          resultingProductState: 'opened',
          naturalDurationSec: 2,
          minDurationSec: 1,
          maxDurationSec: 4,
          compatiblePackaging: ['bottle'],
        })
        .expect(201);
      gestureId = res.body.id;
      expect(res.body.riskLevel).toBe('medium');
    });

    it('duration validation: min > max → 400', async () => {
      await http(app)
        .post('/api/gestures')
        .set(auth(adminToken))
        .send({ name: 'ท่าเวลาผิด', minDurationSec: 5, maxDurationSec: 2 })
        .expect(400);
    });

    it('bad product-state ref → 400', async () => {
      await http(app)
        .post('/api/gestures')
        .set(auth(adminToken))
        .send({ name: 'ท่าสถานะมั่ว', requiredProductState: 'not_a_real_state' })
        .expect(400);
    });

    it('filters: riskLevel + compatiblePackaging contains', async () => {
      const byRisk = await http(app)
        .get('/api/gestures')
        .query({ riskLevel: 'medium', compatiblePackaging: 'bottle' })
        .set(auth(adminToken))
        .expect(200);
      expect(byRisk.body.items.map((g: { id: string }) => g.id)).toContain(gestureId);
    });

    it('viewer cannot create gesture → 403', async () => {
      await http(app)
        .post('/api/gestures')
        .set(auth(viewerToken))
        .send({ name: 'ห้ามสร้าง' })
        .expect(403);
    });
  });

  // ═══ Product State taxonomy + transitions + validate-sequence ═══
  describe('product states', () => {
    it('builtin states exist (seed) incl. initial + terminal', async () => {
      const res = await http(app).get('/api/product-states').set(auth(adminToken)).expect(200);
      const keys = res.body.map((s: { key: string }) => s.key);
      expect(keys).toEqual(
        expect.arrayContaining(['sealed', 'opened', 'cap_removed', 'in_use', 'result', 'empty']),
      );
      const sealed = res.body.find((s: { key: string }) => s.key === 'sealed');
      expect(sealed.isInitial).toBe(true);
      const empty = res.body.find((s: { key: string }) => s.key === 'empty');
      expect(empty.isTerminal).toBe(true);
    });

    it('CRUD: create (auto key) + update + in-use 409 + delete', async () => {
      const created = await http(app)
        .post('/api/product-states')
        .set(auth(adminToken))
        .send({ label: 'Shaken', sortOrder: 20 })
        .expect(201);
      const stateId = created.body.id;
      expect(created.body.key).toBe('shaken');

      await http(app)
        .patch(`/api/product-states/${stateId}`)
        .set(auth(adminToken))
        .send({ label: 'Shaken well', isTerminal: false })
        .expect(200);

      // reference it from a gesture → delete blocked with 409
      await http(app)
        .post('/api/gestures')
        .set(auth(adminToken))
        .send({ name: 'เขย่า', resultingProductState: 'shaken' })
        .expect(201);
      await http(app)
        .delete(`/api/product-states/${stateId}`)
        .set(auth(adminToken))
        .expect(409);
    });

    it('builtin state cannot be deleted → 400', async () => {
      const res = await http(app).get('/api/product-states').set(auth(adminToken)).expect(200);
      const sealed = res.body.find((s: { key: string }) => s.key === 'sealed');
      await http(app)
        .delete(`/api/product-states/${sealed.id}`)
        .set(auth(adminToken))
        .expect(400);
    });

    it('transitions replace-set + read back', async () => {
      const before = await http(app)
        .get('/api/product-states/transitions')
        .set(auth(adminToken))
        .expect(200);
      const original = before.body.transitions.map((t: { from: string; to: string }) => ({
        from: t.from,
        to: t.to,
      }));

      // replace with a minimal set then restore builtin set
      await http(app)
        .put('/api/product-states/transitions')
        .set(auth(adminToken))
        .send({ transitions: [{ from: 'sealed', to: 'opened' }] })
        .expect(200);
      const mid = await http(app)
        .get('/api/product-states/transitions')
        .set(auth(adminToken))
        .expect(200);
      expect(mid.body.transitions).toHaveLength(1);

      // self-loop rejected
      await http(app)
        .put('/api/product-states/transitions')
        .set(auth(adminToken))
        .send({ transitions: [{ from: 'sealed', to: 'sealed' }] })
        .expect(400);

      // restore
      await http(app)
        .put('/api/product-states/transitions')
        .set(auth(adminToken))
        .send({ transitions: original })
        .expect(200);
    });

    it('validate-sequence: valid chain ok', async () => {
      const res = await http(app)
        .post('/api/product-states/validate-sequence')
        .set(auth(adminToken))
        .send({ stateKeys: ['sealed', 'opened', 'cap_removed', 'in_use', 'result'] })
        .expect(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.errors).toHaveLength(0);
    });

    it('validate-sequence: illegal pair (skip) returns error', async () => {
      const res = await http(app)
        .post('/api/product-states/validate-sequence')
        .set(auth(adminToken))
        .send({ stateKeys: ['sealed', 'result'] })
        .expect(201);
      expect(res.body.ok).toBe(false);
      expect(res.body.errors[0]).toMatchObject({ index: 0, from: 'sealed', to: 'result' });
      expect(typeof res.body.errors[0].reason).toBe('string');
    });

    it('validate-sequence: non-initial start warns', async () => {
      const res = await http(app)
        .post('/api/product-states/validate-sequence')
        .set(auth(adminToken))
        .send({ stateKeys: ['opened', 'cap_removed'] })
        .expect(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.warnings.length).toBeGreaterThan(0);
    });

    it('viewer (no setting perm) cannot list/mutate product states → 403', async () => {
      await http(app).get('/api/product-states').set(auth(viewerToken)).expect(403);
      await http(app)
        .post('/api/product-states')
        .set(auth(viewerToken))
        .send({ label: 'nope' })
        .expect(403);
    });
  });
});
