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

const VIEWER_EMAIL = 'camlight-viewer@aistar.test';
const VIEWER_PASSWORD = 'camlight-viewer-2026';

// Camera & Lighting Library (SRS slice 3) — reference presets + fold เข้า Interaction Template
describe('Camera & Lighting Library (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let adminToken: string;
  let viewerToken: string; // character_designer: library V only → mutate 403

  const ts = Date.now();
  let cameraId: string; // มุมกล้อง macro (compatiblePackaging=[bottle]) + promptTemplate/negative
  let cameraArchivedId: string; // archived → step 400
  let lightingId: string; // แสง luxury + promptTemplate/negative
  let templateId: string; // เทมเพลต bottle

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

  // ═══ Camera CRUD ═════════════════════════════════════════════
  describe('camera presets', () => {
    it('create → auto CAM-code + active', async () => {
      const res = await http(app)
        .post('/api/camera-presets')
        .set(auth(adminToken))
        .send({
          name: `Macro close-up ${ts}`,
          key: `cam_macro_${ts}`,
          shotSize: 'extreme_closeup',
          angle: 'front',
          cameraMovement: 'static',
          lens: 'macro',
          focalLength: '100mm',
          compatiblePackaging: ['bottle'],
          promptTemplate: 'extreme macro close-up, shallow depth of field',
          negativePrompt: 'no motion blur',
        })
        .expect(201);
      cameraId = res.body.id;
      expect(res.body.displayCode).toMatch(/^CAM-\d{4}$/);
      expect(res.body.status).toBe('active');
    });

    it('duplicate key → 400', async () => {
      await http(app)
        .post('/api/camera-presets')
        .set(auth(adminToken))
        .send({ name: 'dup', key: `cam_macro_${ts}` })
        .expect(400);
    });

    it('update → 200', async () => {
      const res = await http(app)
        .patch(`/api/camera-presets/${cameraId}`)
        .set(auth(adminToken))
        .send({ description: 'มาโครโคลสอัป', focusTarget: 'label' })
        .expect(200);
      expect(res.body.description).toBe('มาโครโคลสอัป');
      expect(res.body.focusTarget).toBe('label');
    });

    it('list filters: shotSize + cameraMovement + q', async () => {
      const res = await http(app)
        .get('/api/camera-presets')
        .query({ shotSize: 'extreme_closeup', cameraMovement: 'static', q: `${ts}` })
        .set(auth(adminToken))
        .expect(200);
      expect(res.body.items.find((c: { id: string }) => c.id === cameraId)).toBeDefined();
    });

    it('archived camera hidden from default list', async () => {
      const created = await http(app)
        .post('/api/camera-presets')
        .set(auth(adminToken))
        .send({ name: `archived cam ${ts}`, key: `cam_arch_${ts}` })
        .expect(201);
      cameraArchivedId = created.body.id;
      await http(app).patch(`/api/camera-presets/${cameraArchivedId}/archive`).set(auth(adminToken)).expect(200);

      const list = await http(app)
        .get('/api/camera-presets')
        .query({ q: `archived cam ${ts}` })
        .set(auth(adminToken))
        .expect(200);
      expect(list.body.items.find((c: { id: string }) => c.id === cameraArchivedId)).toBeUndefined();
    });
  });

  // ═══ Lighting CRUD ═══════════════════════════════════════════
  describe('lighting presets', () => {
    it('create → auto LIGHT-code + active + reflective rule', async () => {
      const res = await http(app)
        .post('/api/lighting-presets')
        .set(auth(adminToken))
        .send({
          name: `Luxury ${ts}`,
          key: `light_luxury_${ts}`,
          mood: 'luxury',
          keyLight: 'focused key',
          fillLight: 'soft fill',
          backLight: 'strong rim',
          colorTemperature: 'warm',
          reflectiveProductRule: 'ใช้ rim light เน้นขอบโลหะ',
          promptTemplate: 'dramatic luxury lighting, deep shadows',
          negativePrompt: 'no flat lighting',
        })
        .expect(201);
      lightingId = res.body.id;
      expect(res.body.displayCode).toMatch(/^LIGHT-\d{4}$/);
      expect(res.body.status).toBe('active');
      expect(res.body.reflectiveProductRule).toContain('rim light');
    });

    it('list filter: mood', async () => {
      const res = await http(app)
        .get('/api/lighting-presets')
        .query({ mood: 'luxury', q: `${ts}` })
        .set(auth(adminToken))
        .expect(200);
      expect(res.body.items.find((l: { id: string }) => l.id === lightingId)).toBeDefined();
    });
  });

  // ═══ Template wiring: default camera/lighting ════════════════
  describe('template default camera/lighting', () => {
    it('create template (bottle)', async () => {
      const res = await http(app)
        .post('/api/interaction-templates')
        .set(auth(adminToken))
        .send({ name: `สูตร cam/light ${ts}`, packagingType: 'bottle', materialType: 'serum' })
        .expect(201);
      templateId = res.body.id;
    });

    it('bad defaultCameraId → 400; valid → 200', async () => {
      await http(app)
        .patch(`/api/interaction-templates/${templateId}`)
        .set(auth(adminToken))
        .send({ defaultCameraId: randomUUID() })
        .expect(400);

      const res = await http(app)
        .patch(`/api/interaction-templates/${templateId}`)
        .set(auth(adminToken))
        .send({ defaultCameraId: cameraId, defaultLightingId: lightingId })
        .expect(200);
      expect(res.body.defaultCameraId).toBe(cameraId);
      expect(res.body.defaultLightingId).toBe(lightingId);
    });

    it('null clears defaultLightingId', async () => {
      const res = await http(app)
        .patch(`/api/interaction-templates/${templateId}`)
        .set(auth(adminToken))
        .send({ defaultLightingId: null })
        .expect(200);
      expect(res.body.defaultLightingId).toBeNull();
      // ตั้งกลับเพื่อ test ต่อ
      await http(app)
        .patch(`/api/interaction-templates/${templateId}`)
        .set(auth(adminToken))
        .send({ defaultLightingId: lightingId })
        .expect(200);
    });

    it('archived camera as default → 400', async () => {
      await http(app)
        .patch(`/api/interaction-templates/${templateId}`)
        .set(auth(adminToken))
        .send({ defaultCameraId: cameraArchivedId })
        .expect(400);
    });
  });

  // ═══ Step cameraId/lightingId (replace-set) ══════════════════
  describe('step camera/lighting', () => {
    it('replace steps with cameraId/lightingId → enrich summary', async () => {
      const res = await http(app)
        .put(`/api/interaction-templates/${templateId}/steps`)
        .set(auth(adminToken))
        .send({
          steps: [
            { section: 'hook', note: 'โชว์ขวด' },
            { section: 'interaction', cameraId, lightingId, note: 'เปิดฝา' },
            { section: 'cta', note: 'ปิดท้าย' },
          ],
        })
        .expect(200);
      expect(res.body.steps).toHaveLength(3);
      expect(res.body.steps[1].cameraId).toBe(cameraId);
      expect(res.body.steps[1].camera.name).toBe(`Macro close-up ${ts}`);
      expect(res.body.steps[1].lighting.name).toBe(`Luxury ${ts}`);
    });

    it('archived camera in step → 400', async () => {
      await http(app)
        .put(`/api/interaction-templates/${templateId}/steps`)
        .set(auth(adminToken))
        .send({ steps: [{ section: 'interaction', cameraId: cameraArchivedId }] })
        .expect(400);
    });
  });

  // ═══ Validate: camera-vs-packaging warning ═══════════════════
  describe('validate camera-packaging mismatch', () => {
    it('camera compatiblePackaging excludes template packaging → warning', async () => {
      // camera รองรับเฉพาะ bottle → เปลี่ยน packaging ของเทมเพลตเป็น pump ให้ mismatch
      await http(app)
        .patch(`/api/interaction-templates/${templateId}`)
        .set(auth(adminToken))
        .send({ packagingType: 'pump' })
        .expect(200);
      // step ใช้ default camera (cameraId รองรับ bottle เท่านั้น)
      await http(app)
        .put(`/api/interaction-templates/${templateId}/steps`)
        .set(auth(adminToken))
        .send({
          steps: [
            { section: 'hook', note: 'โชว์ขวด' },
            { section: 'interaction', cameraId, note: 'มาโคร' },
            { section: 'cta', note: 'ปิด' },
          ],
        })
        .expect(200);

      const res = await http(app)
        .get(`/api/interaction-templates/${templateId}/validate`)
        .set(auth(adminToken))
        .expect(200);
      expect(res.body.warnings.some((w: string) => w.includes('ไม่ได้ระบุรองรับ packaging pump'))).toBe(true);
      // กลับเป็น bottle เพื่อ test prompt-package
      await http(app)
        .patch(`/api/interaction-templates/${templateId}`)
        .set(auth(adminToken))
        .send({ packagingType: 'bottle' })
        .expect(200);
    });
  });

  // ═══ Prompt package: camera + lighting fold-in + merged negative ═══
  describe('prompt package folds camera + lighting', () => {
    it('composes Camera:/Lighting: lines + merged negatives', async () => {
      await http(app)
        .put(`/api/interaction-templates/${templateId}/steps`)
        .set(auth(adminToken))
        .send({
          steps: [{ section: 'interaction', cameraId, lightingId, note: 'เปิดฝาขวด' }],
        })
        .expect(200);

      const res = await http(app)
        .get(`/api/interaction-templates/${templateId}/prompt-package`)
        .set(auth(adminToken))
        .expect(200);
      const step = res.body.steps[0];
      expect(step.prompt).toContain(`Camera: Macro close-up ${ts}`);
      expect(step.prompt).toContain('extreme macro close-up'); // camera.promptTemplate
      expect(step.prompt).toContain(`Lighting: Luxury ${ts}`);
      expect(step.prompt).toContain('dramatic luxury lighting'); // lighting.promptTemplate
      // merged negatives: camera "no motion blur" + lighting "no flat lighting"
      expect(step.negativePrompt).toContain('no motion blur');
      expect(step.negativePrompt).toContain('no flat lighting');
    });

    it('step camera/lighting fall back to template default', async () => {
      // step ไม่ระบุ camera/lighting → ใช้ default ของ template (cameraId/lightingId)
      await http(app)
        .put(`/api/interaction-templates/${templateId}/steps`)
        .set(auth(adminToken))
        .send({ steps: [{ section: 'interaction', note: 'ไม่ override' }] })
        .expect(200);
      const res = await http(app)
        .get(`/api/interaction-templates/${templateId}/prompt-package`)
        .set(auth(adminToken))
        .expect(200);
      expect(res.body.steps[0].prompt).toContain(`Camera: Macro close-up ${ts}`);
      expect(res.body.steps[0].prompt).toContain(`Lighting: Luxury ${ts}`);
    });
  });

  // ═══ Permissions ═════════════════════════════════════════════
  describe('permissions', () => {
    it('viewer (library V): list ได้ แต่ mutate → 403', async () => {
      await http(app).get('/api/camera-presets').set(auth(viewerToken)).expect(200);
      await http(app).get('/api/lighting-presets').set(auth(viewerToken)).expect(200);
      await http(app)
        .post('/api/camera-presets')
        .set(auth(viewerToken))
        .send({ name: 'ห้ามสร้าง' })
        .expect(403);
      await http(app)
        .post('/api/lighting-presets')
        .set(auth(viewerToken))
        .send({ name: 'ห้ามสร้าง' })
        .expect(403);
    });
  });
});
