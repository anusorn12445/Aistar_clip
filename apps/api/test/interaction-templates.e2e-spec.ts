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

const VIEWER_EMAIL = 'itpl-viewer@aistar.test';
const VIEWER_PASSWORD = 'itpl-viewer-2026';

// Interaction Templates (SRS slice 2) — clip recipes ผูก Hand/Gesture/ProductState ต่อ packaging
describe('Interaction Templates (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let adminToken: string;
  let viewerToken: string; // character_designer: library V only → mutate 403

  const ts = Date.now();
  let handId: string; // default hand (olive skin, ring)
  let restrictHandId: string; // มือที่ห้ามท่า open
  let gOpenId: string; // sealed → opened (1–4s, bottle) + promptTemplate
  let gRemoveId: string; // opened → cap_removed
  let gApplyId: string; // in_use → result ("เทเซรั่ม")
  let gSprayId: string; // packaging spray → mismatch warning บนเทมเพลต bottle
  let gArchivedId: string; // archived gesture → 400
  const openKey = `tpl_open_${ts}`;

  let templateId: string; // เทมเพลตหลัก (bottle)

  beforeAll(async () => {
    prisma = new PrismaClient();
    await createUserWithRoles(prisma, VIEWER_EMAIL, VIEWER_PASSWORD, ['character_designer']);
    app = await createApp();
    adminToken = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);
    viewerToken = await loginAs(app, VIEWER_EMAIL, VIEWER_PASSWORD);

    // ── seed fixtures ผ่าน API slice 1 ──
    const hand = await http(app)
      .post('/api/hands')
      .set(auth(adminToken))
      .send({
        name: 'มือเทมเพลตหลัก',
        category: 'adult_female',
        skinTone: 'olive',
        nailLength: 'short',
        nailShape: 'oval',
        accessories: ['ring'],
      })
      .expect(201);
    handId = hand.body.id;

    const restrictHand = await http(app)
      .post('/api/hands')
      .set(auth(adminToken))
      .send({
        name: 'มือห้ามเปิดฝา',
        category: 'adult_male',
        restrictedGestures: [openKey],
      })
      .expect(201);
    restrictHandId = restrictHand.body.id;

    const gOpen = await http(app)
      .post('/api/gestures')
      .set(auth(adminToken))
      .send({
        name: 'เปิดฝาขวด (tpl)',
        key: openKey,
        category: 'open',
        requiredProductState: 'sealed',
        resultingProductState: 'opened',
        naturalDurationSec: 2,
        minDurationSec: 1,
        maxDurationSec: 4,
        compatiblePackaging: ['bottle'],
        promptTemplate: 'twist open the bottle cap slowly, macro close-up',
        negativePrompt: 'no logo distortion, no extra fingers',
      })
      .expect(201);
    gOpenId = gOpen.body.id;

    const gRemove = await http(app)
      .post('/api/gestures')
      .set(auth(adminToken))
      .send({
        name: 'ยกฝาออก (tpl)',
        key: `tpl_remove_${ts}`,
        requiredProductState: 'opened',
        resultingProductState: 'cap_removed',
        naturalDurationSec: 1.5,
      })
      .expect(201);
    gRemoveId = gRemove.body.id;

    const gApply = await http(app)
      .post('/api/gestures')
      .set(auth(adminToken))
      .send({
        name: 'เทเซรั่ม (tpl)',
        key: `tpl_apply_${ts}`,
        requiredProductState: 'in_use',
        resultingProductState: 'result',
        naturalDurationSec: 3,
      })
      .expect(201);
    gApplyId = gApply.body.id;

    const gSpray = await http(app)
      .post('/api/gestures')
      .set(auth(adminToken))
      .send({
        name: 'ฉีดสเปรย์ (tpl)',
        key: `tpl_spray_${ts}`,
        compatiblePackaging: ['spray'],
        naturalDurationSec: 1,
      })
      .expect(201);
    gSprayId = gSpray.body.id;

    const gArchived = await http(app)
      .post('/api/gestures')
      .set(auth(adminToken))
      .send({ name: 'ท่าที่ถูกเก็บ (tpl)', key: `tpl_archived_${ts}` })
      .expect(201);
    gArchivedId = gArchived.body.id;
    await http(app).patch(`/api/gestures/${gArchivedId}/archive`).set(auth(adminToken)).expect(200);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  // ═══ Template CRUD ═══════════════════════════════════════════
  describe('template CRUD', () => {
    it('create → auto ITPL-code + draft + v1', async () => {
      const res = await http(app)
        .post('/api/interaction-templates')
        .set(auth(adminToken))
        .send({
          name: `สูตรเปิดขวดเซรั่ม ${ts}`,
          packagingType: 'bottle',
          materialType: 'serum',
          platform: 'tiktok',
          aspectRatio: '9:16',
          storyboardType: 'how_to_use',
          defaultHandId: handId,
        })
        .expect(201);
      templateId = res.body.id;
      expect(res.body.displayCode).toMatch(/^ITPL-\d{4}$/);
      expect(res.body.status).toBe('draft');
      expect(res.body.version).toBe('v1');
    });

    it('update: bad defaultHandId → 400, valid fields → 200', async () => {
      await http(app)
        .patch(`/api/interaction-templates/${templateId}`)
        .set(auth(adminToken))
        .send({ defaultHandId: randomUUID() })
        .expect(400);

      const res = await http(app)
        .patch(`/api/interaction-templates/${templateId}`)
        .set(auth(adminToken))
        .send({ description: 'สูตรมาตรฐานขวดเซรั่ม', status: 'active' })
        .expect(200);
      expect(res.body.description).toBe('สูตรมาตรฐานขวดเซรั่ม');
      expect(res.body.status).toBe('active');
    });

    it('list: filters + stepCount + totalDurationSec', async () => {
      const res = await http(app)
        .get('/api/interaction-templates')
        .query({ packagingType: 'bottle', q: `${ts}` })
        .set(auth(adminToken))
        .expect(200);
      const found = res.body.items.find((t: { id: string }) => t.id === templateId);
      expect(found).toBeDefined();
      expect(found.stepCount).toBe(0);
      expect(found.totalDurationSec).toBe(0);
    });
  });

  // ═══ Step editor (replace-set) ═══════════════════════════════
  describe('step editor', () => {
    it('PUT steps: replace-set กำหนด stepOrder ตาม index + enrich gesture', async () => {
      const res = await http(app)
        .put(`/api/interaction-templates/${templateId}/steps`)
        .set(auth(adminToken))
        .send({
          steps: [
            { section: 'hook', note: 'โชว์ขวดกลางแสง', durationSec: 1.5 },
            { section: 'interaction', gestureId: gOpenId, cameraNote: 'macro หมุนฝา' },
            { section: 'interaction', gestureId: gRemoveId },
            { section: 'cta', note: 'ชี้ไปตะกร้าสินค้า' },
          ],
        })
        .expect(200);
      expect(res.body.steps).toHaveLength(4);
      expect(res.body.steps.map((s: { stepOrder: number }) => s.stepOrder)).toEqual([0, 1, 2, 3]);
      expect(res.body.steps[1].gesture.name).toBe('เปิดฝาขวด (tpl)');
      expect(res.body.warnings).toEqual([]);
      // ความยาวรวม = 1.5 + natural(2) + natural(1.5) + 0
      expect(res.body.totalDurationSec).toBe(5);

      // replace อีกครั้ง → ชุดเดิมถูกแทนที่ทั้งหมด
      const res2 = await http(app)
        .put(`/api/interaction-templates/${templateId}/steps`)
        .set(auth(adminToken))
        .send({
          steps: [
            { section: 'hook', note: 'โชว์ขวด' },
            { section: 'interaction', gestureId: gOpenId },
            { section: 'interaction', gestureId: gRemoveId },
          ],
        })
        .expect(200);
      expect(res2.body.steps).toHaveLength(3);
    });

    it('archived gesture ใน step → 400', async () => {
      await http(app)
        .put(`/api/interaction-templates/${templateId}/steps`)
        .set(auth(adminToken))
        .send({ steps: [{ section: 'interaction', gestureId: gArchivedId }] })
        .expect(400);
    });

    it('restricted-gesture conflict (มือ step ห้ามท่า) → 400', async () => {
      const res = await http(app)
        .put(`/api/interaction-templates/${templateId}/steps`)
        .set(auth(adminToken))
        .send({
          steps: [{ section: 'interaction', gestureId: gOpenId, handId: restrictHandId }],
        })
        .expect(400);
      expect(res.body.message).toContain('restrictedGestures');
    });

    it('packaging mismatch → warn (ไม่ fail)', async () => {
      const res = await http(app)
        .put(`/api/interaction-templates/${templateId}/steps`)
        .set(auth(adminToken))
        .send({
          steps: [
            { section: 'hook', note: 'โชว์ขวด' },
            { section: 'interaction', gestureId: gOpenId },
            { section: 'interaction', gestureId: gSprayId },
          ],
        })
        .expect(200);
      expect(res.body.warnings.length).toBeGreaterThan(0);
      expect(res.body.warnings[0]).toContain('spray');
    });
  });

  // ═══ Clone ═══════════════════════════════════════════════════
  describe('clone', () => {
    it('copies template + steps → new code, "(copy)", draft, v1', async () => {
      // เตรียม steps ชุดหลักก่อน clone
      await http(app)
        .put(`/api/interaction-templates/${templateId}/steps`)
        .set(auth(adminToken))
        .send({
          steps: [
            { section: 'hook', note: 'โชว์ขวด' },
            { section: 'interaction', gestureId: gOpenId },
            { section: 'interaction', gestureId: gRemoveId },
            { section: 'cta', note: 'ชี้ตะกร้า' },
          ],
        })
        .expect(200);

      const source = await http(app)
        .get(`/api/interaction-templates/${templateId}`)
        .set(auth(adminToken))
        .expect(200);

      const res = await http(app)
        .post(`/api/interaction-templates/${templateId}/clone`)
        .set(auth(adminToken))
        .expect(201);
      expect(res.body.id).not.toBe(templateId);
      expect(res.body.displayCode).toMatch(/^ITPL-\d{4}$/);
      expect(res.body.displayCode).not.toBe(source.body.displayCode);
      expect(res.body.name).toBe(`${source.body.name} (copy)`);
      expect(res.body.status).toBe('draft');
      expect(res.body.version).toBe('v1');
      expect(res.body.steps).toHaveLength(4);
      expect(res.body.steps[1].gestureId).toBe(gOpenId);
    });
  });

  // ═══ Validate — recipe checker ═══════════════════════════════
  describe('validate', () => {
    it('legal state chain → ok true', async () => {
      // steps ปัจจุบัน: hook → open(sealed→opened) → remove(opened→cap_removed) → cta
      const res = await http(app)
        .get(`/api/interaction-templates/${templateId}/validate`)
        .set(auth(adminToken))
        .expect(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.errors).toEqual([]);
    });

    it('broken state chain (ข้ามสถานะ) → error Thai', async () => {
      await http(app)
        .put(`/api/interaction-templates/${templateId}/steps`)
        .set(auth(adminToken))
        .send({
          steps: [
            { section: 'hook', gestureId: gOpenId }, // sealed → opened
            { section: 'demonstration', gestureId: gApplyId }, // ต้องการ in_use แต่ยัง opened
            { section: 'cta', note: 'ปิดท้าย' },
          ],
        })
        .expect(200);
      const res = await http(app)
        .get(`/api/interaction-templates/${templateId}/validate`)
        .set(auth(adminToken))
        .expect(200);
      expect(res.body.ok).toBe(false);
      expect(res.body.errors.some((e: string) => e.includes('ต้องการสถานะ in_use'))).toBe(true);
    });

    it('per-step duration นอกช่วง min/max ของท่า → error', async () => {
      await http(app)
        .put(`/api/interaction-templates/${templateId}/steps`)
        .set(auth(adminToken))
        .send({
          steps: [
            { section: 'hook', note: 'โชว์ขวด' },
            { section: 'interaction', gestureId: gOpenId, durationSec: 10 }, // max 4
            { section: 'cta', note: 'ปิดท้าย' },
          ],
        })
        .expect(200);
      const res = await http(app)
        .get(`/api/interaction-templates/${templateId}/validate`)
        .set(auth(adminToken))
        .expect(200);
      expect(res.body.ok).toBe(false);
      expect(res.body.errors.some((e: string) => e.includes('นอกช่วง'))).toBe(true);
    });

    it('duration รวมต่างจากเป้าหมายเกิน ±10% → warn + missing hook/cta warn', async () => {
      const created = await http(app)
        .post('/api/interaction-templates')
        .set(auth(adminToken))
        .send({ name: `สูตรสั้นเกิน ${ts}`, targetDurationSec: 60 })
        .expect(201);
      await http(app)
        .put(`/api/interaction-templates/${created.body.id}/steps`)
        .set(auth(adminToken))
        .send({ steps: [{ section: 'interaction', gestureId: gOpenId }] })
        .expect(200);
      const res = await http(app)
        .get(`/api/interaction-templates/${created.body.id}/validate`)
        .set(auth(adminToken))
        .expect(200);
      expect(res.body.warnings.some((w: string) => w.includes('สั้นกว่าเป้าหมาย'))).toBe(true);
      expect(res.body.warnings.some((w: string) => w.includes('hook'))).toBe(true);
      expect(res.body.warnings.some((w: string) => w.includes('cta'))).toBe(true);
    });
  });

  // ═══ Prompt package ══════════════════════════════════════════
  describe('prompt package', () => {
    it('composes gesture template + hand descriptor + notes (deterministic)', async () => {
      await http(app)
        .put(`/api/interaction-templates/${templateId}/steps`)
        .set(auth(adminToken))
        .send({
          steps: [
            {
              section: 'interaction',
              gestureId: gOpenId,
              cameraNote: 'macro close-up',
              lightingNote: 'soft window light',
            },
          ],
        })
        .expect(200);

      const res = await http(app)
        .get(`/api/interaction-templates/${templateId}/prompt-package`)
        .set(auth(adminToken))
        .expect(200);
      expect(res.body.steps).toHaveLength(1);
      const step = res.body.steps[0];
      expect(step.order).toBe(1);
      expect(step.section).toBe('interaction');
      expect(step.prompt).toContain('twist open the bottle cap slowly'); // gesture.promptTemplate
      expect(step.prompt).toContain('olive'); // hand descriptor จากมือ default
      expect(step.prompt).toContain('Camera note: macro close-up');
      expect(step.prompt).toContain('Lighting note: soft window light');
      expect(step.negativePrompt).toContain('no extra fingers');
      expect(res.body.combined).toContain('twist open the bottle cap slowly');
    });
  });

  // ═══ Permissions ═════════════════════════════════════════════
  describe('permissions', () => {
    it('viewer (library V): list ได้ แต่ mutate → 403', async () => {
      await http(app).get('/api/interaction-templates').set(auth(viewerToken)).expect(200);
      await http(app)
        .post('/api/interaction-templates')
        .set(auth(viewerToken))
        .send({ name: 'ห้ามสร้าง' })
        .expect(403);
      await http(app)
        .put(`/api/interaction-templates/${templateId}/steps`)
        .set(auth(viewerToken))
        .send({ steps: [] })
        .expect(403);
      await http(app)
        .post(`/api/interaction-templates/${templateId}/clone`)
        .set(auth(viewerToken))
        .expect(403);
    });
  });

  // ═══ Archive (ท้ายสุด — ซ่อนจาก list default) ═══════════════
  describe('archive', () => {
    it('archive → หายจาก list default แต่ยัง get ได้', async () => {
      await http(app)
        .patch(`/api/interaction-templates/${templateId}/archive`)
        .set(auth(adminToken))
        .expect(200);
      const list = await http(app)
        .get('/api/interaction-templates')
        .query({ q: `สูตรเปิดขวดเซรั่ม ${ts}` })
        .set(auth(adminToken))
        .expect(200);
      expect(
        list.body.items.find((t: { id: string }) => t.id === templateId),
      ).toBeUndefined();
      const got = await http(app)
        .get(`/api/interaction-templates/${templateId}`)
        .set(auth(adminToken))
        .expect(200);
      expect(got.body.status).toBe('archived');
    });
  });
});
