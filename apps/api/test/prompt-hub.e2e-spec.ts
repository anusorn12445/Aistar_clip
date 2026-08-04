import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  auth,
  createApp,
  createUserWithRoles,
  http,
  loginAs,
} from './utils';

// Prompt Hub (🌐 ทุกแหล่ง) — live reference จาก 6 คลัง + snapshot เข้าคลังหลัก
//  - GET /prompts/hub: merge Location/Gesture/Camera/Lighting/Hand/Character (visualDna)
//    เรียง updatedAt desc, q ข้ามคลัง, sourceType filter, ตัดแหล่งที่ไม่มีสิทธิ์ V ออกเงียบ ๆ
//  - POST /prompts/hub/snapshot: compose canonical → Prompt+v1 (sourceUrl origin),
//    re-snapshot origin เดิม = เพิ่ม v2 บน Prompt เดิม (ไม่สร้างซ้ำ), reuse รูปต้นทาง

// ai_video_operator = prompt V + location V + character V แต่ไม่มี library → พิสูจน์ omission
const OMIT_EMAIL = 'prompt-hub-omit@aistar.test';
const OMIT_PASSWORD = 'prompt-hub-omit-2026';
// dev_api = prompt: ['V'] อย่างเดียว → พิสูจน์ 403 snapshot (ไม่มี prompt C)
const VIEWER_EMAIL = 'prompt-hub-viewer@aistar.test';
const VIEWER_PASSWORD = 'prompt-hub-viewer-2026';
// prompt_engineer = prompt C ครบ แต่ไม่มี location/library V → 403 snapshot ข้ามสิทธิ์ต้นทาง
const ENGINEER_EMAIL = 'prompt-hub-engineer@aistar.test';
const ENGINEER_PASSWORD = 'prompt-hub-engineer-2026';
// researcher = ไม่มี module prompt เลย → 403 ที่ GET /prompts/hub
const NOPROMPT_EMAIL = 'prompt-hub-noprompt@aistar.test';
const NOPROMPT_PASSWORD = 'prompt-hub-noprompt-2026';

describe('Prompt Hub (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let token: string;
  let omitToken: string;
  let viewerToken: string;
  let engineerToken: string;
  let noPromptToken: string;

  let locationId: string;
  let gestureId: string;
  let handId: string;
  let characterId: string;
  let noDnaCharacterId: string;
  let locationAssetId: string;

  beforeAll(async () => {
    app = await createApp();
    prisma = new PrismaClient();
    await createUserWithRoles(prisma, OMIT_EMAIL, OMIT_PASSWORD, ['ai_video_operator']);
    await createUserWithRoles(prisma, VIEWER_EMAIL, VIEWER_PASSWORD, ['dev_api']);
    await createUserWithRoles(prisma, ENGINEER_EMAIL, ENGINEER_PASSWORD, ['prompt_engineer']);
    await createUserWithRoles(prisma, NOPROMPT_EMAIL, NOPROMPT_PASSWORD, ['researcher']);
    token = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);
    omitToken = await loginAs(app, OMIT_EMAIL, OMIT_PASSWORD);
    viewerToken = await loginAs(app, VIEWER_EMAIL, VIEWER_PASSWORD);
    engineerToken = await loginAs(app, ENGINEER_EMAIL, ENGINEER_PASSWORD);
    noPromptToken = await loginAs(app, NOPROMPT_EMAIL, NOPROMPT_PASSWORD);

    // fixtures ตั้งชื่อ prefix เดียวกัน "E2E Hub" — ใช้ q ค้นข้ามคลังได้
    const location = await http(app)
      .post('/api/locations')
      .set(auth(token))
      .send({
        name: 'E2E Hub Neon Alley',
        type: 'urban',
        mood: 'moody',
        prompt: 'neon-lit Bangkok alley at night, rain reflections on wet pavement',
        negativePrompt: 'blurry, low quality',
      })
      .expect(201);
    locationId = location.body.id;

    const gesture = await http(app)
      .post('/api/gestures')
      .set(auth(token))
      .send({
        name: 'E2E Hub Slow Wave',
        promptTemplate: 'hand waving slowly toward the camera, relaxed fingers',
        negativePrompt: 'extra fingers',
      })
      .expect(201);
    gestureId = gesture.body.id;

    // seed test DB อาจไม่มี hand เลย — สร้าง fixture เอง
    const hand = await http(app)
      .post('/api/hands')
      .set(auth(token))
      .send({
        name: 'E2E Hub Mother Hand',
        category: 'mother',
        gender: 'female',
        skinTone: 'warm fair',
        nailLength: 'short',
      })
      .expect(201);
    handId = hand.body.id;

    const character = await http(app)
      .post('/api/characters')
      .set(auth(token))
      .send({
        nameTh: 'E2E Hub พราวฮับ',
        nameEn: 'E2E Hub Praohub',
        age: 25,
        gender: 'หญิง',
        visualDna: {
          ethnicity: 'Thai, Southeast Asian features',
          hair_style: 'long straight black hair',
          skin_tone: 'warm tan',
          distinctive_features: ['left cheek dimple'],
        },
        dos: ['always smile with dimple visible'],
        donts: ['no alcohol in frame'],
      })
      .expect(201);
    characterId = character.body.id;

    // ตัวละครที่ยังไม่มี visualDna — ต้องไม่โผล่ใน hub
    const noDna = await http(app)
      .post('/api/characters')
      .set(auth(token))
      .send({ nameTh: 'E2E Hub NoDna', nameEn: 'E2E Hub NoDna' })
      .expect(201);
    noDnaCharacterId = noDna.body.id;

    // รูปปกของ location — สร้างตรงผ่าน prisma (ไม่ต้องยุ่ง storage) เพื่อทดสอบ reuse asset
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } });
    const asset = await prisma.asset.create({
      data: {
        assetType: 'location_reference',
        storageKey: 'test/e2e-hub-location.png',
        originalFilename: 'e2e-hub-location.png',
        mimeType: 'image/png',
        fileSize: 100,
        uploadedBy: admin.id,
      },
    });
    locationAssetId = asset.id;
    await prisma.assetLink.create({
      data: {
        assetId: asset.id,
        entityType: 'location',
        entityId: locationId,
        linkRole: 'cover',
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  // ─── GET /prompts/hub ────────────────────────────────────────

  it('lists merged rows sorted by updatedAt desc with per-type shape', async () => {
    const res = await http(app).get('/api/prompts/hub?pageSize=50').set(auth(token)).expect(200);
    expect(res.body.total).toBeGreaterThan(0);
    expect(res.body.page).toBe(1);
    const items = res.body.items as {
      sourceType: string;
      sourceId: string;
      updatedAt: string;
      preview: string;
      source?: Record<string, unknown>;
      thumbnailAssetId: string | null;
    }[];

    // เรียง updatedAt desc
    for (let i = 1; i < items.length; i++) {
      expect(new Date(items[i - 1].updatedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(items[i].updatedAt).getTime(),
      );
    }

    // fixture ล่าสุด — ต้องอยู่ในหน้าแรก พร้อม source record + thumbnail ของ location
    const loc = items.find((i) => i.sourceType === 'location' && i.sourceId === locationId);
    expect(loc).toBeDefined();
    expect(loc!.preview).toContain('neon-lit Bangkok alley');
    expect(loc!.source).toMatchObject({ name: 'E2E Hub Neon Alley', mood: 'moody' });
    expect(loc!.thumbnailAssetId).toBe(locationAssetId);

    const ges = items.find((i) => i.sourceType === 'gesture' && i.sourceId === gestureId);
    expect(ges).toBeDefined();
    expect(ges!.preview).toContain('hand waving slowly');
  });

  it('every source type has rows (seeded cameras/lightings + created fixtures)', async () => {
    for (const t of ['location', 'gesture', 'camera_preset', 'lighting_preset', 'hand', 'character']) {
      const res = await http(app)
        .get(`/api/prompts/hub?sourceType=${t}`)
        .set(auth(token))
        .expect(200);
      expect(res.body.total).toBeGreaterThan(0);
      for (const item of res.body.items) expect(item.sourceType).toBe(t);
    }
    // sourceType แปลก ๆ → 400
    await http(app).get('/api/prompts/hub?sourceType=weird').set(auth(token)).expect(400);
  });

  it('q searches across source types at once', async () => {
    const res = await http(app).get('/api/prompts/hub?q=E2E%20Hub').set(auth(token)).expect(200);
    const types = new Set(res.body.items.map((i: { sourceType: string }) => i.sourceType));
    expect(types.has('location')).toBe(true);
    expect(types.has('gesture')).toBe(true);
    expect(types.has('hand')).toBe(true);
    expect(types.has('character')).toBe(true);
  });

  it('character rows: only with visualDna, with 3 server-composed master-prompt variants', async () => {
    const res = await http(app)
      .get('/api/prompts/hub?q=E2E%20Hub&sourceType=character')
      .set(auth(token))
      .expect(200);
    const ids = res.body.items.map((i: { sourceId: string }) => i.sourceId);
    expect(ids).toContain(characterId);
    expect(ids).not.toContain(noDnaCharacterId); // ไม่มี visualDna → ไม่โผล่

    const row = res.body.items.find((i: { sourceId: string }) => i.sourceId === characterId);
    const variants = row.characterVariants as { tool: string; label: string; text: string }[];
    expect(variants.map((v) => v.tool)).toEqual(['chatgpt', 'gemini', 'grok']);
    // Master Prompt เต็ม: DIRECTIVE + MUST-KEEP + Do's/Don'ts ฝังแบบ export appendix
    expect(variants[0].text).toContain('=== DIRECTIVE ===');
    expect(variants[0].text).toContain('=== MUST-KEEP ===');
    expect(variants[0].text).toContain('always smile with dimple visible');
    expect(variants[0].text).toContain('no alcohol in frame');
    // Grok variant พก negative + merge donts
    expect(variants[2].text).toContain('Negative prompt:');
  });

  it('silently omits sources the caller cannot V (library) but keeps location/character', async () => {
    const res = await http(app)
      .get('/api/prompts/hub?q=E2E%20Hub&pageSize=50')
      .set(auth(omitToken))
      .expect(200);
    const types = new Set(res.body.items.map((i: { sourceType: string }) => i.sourceType));
    expect(types.has('location')).toBe(true); // location V ของ ai_video_operator
    expect(types.has('character')).toBe(true);
    expect(types.has('gesture')).toBe(false); // ไม่มี library V → หายเงียบ ๆ
    expect(types.has('camera_preset')).toBe(false);
    expect(types.has('lighting_preset')).toBe(false);
    expect(types.has('hand')).toBe(false);
  });

  it('requires prompt V to call hub at all', async () => {
    await http(app).get('/api/prompts/hub').set(auth(noPromptToken)).expect(403);
  });

  // ─── POST /prompts/hub/snapshot ──────────────────────────────

  it('snapshot creates approved Prompt + v1 with origin sourceUrl and reuses source image', async () => {
    const res = await http(app)
      .post('/api/prompts/hub/snapshot')
      .set(auth(token))
      .send({ sourceType: 'location', sourceId: locationId })
      .expect(201);

    expect(res.body.versionLabel).toBe('v1');
    const prompt = res.body.prompt;
    expect(prompt.name).toBe('E2E Hub Neon Alley');
    expect(prompt.promptType).toBe('scene'); // mapping: location → scene
    expect(prompt.status).toBe('approved');
    expect(prompt.versions).toHaveLength(1);
    const v1 = prompt.versions[0];
    expect(v1.versionLabel).toBe('v1');
    expect(v1.targetPlatform).toBe('chatgpt');
    expect(v1.sourceUrl).toBe(`aistar://location/${locationId}`);
    expect(v1.body).toContain('neon-lit Bangkok alley');
    expect(v1.negativeBody).toContain('blurry');

    // รูปตัวอย่าง: ลิงก์ asset เดิมของ location เข้า prompt (ไม่อัปโหลดซ้ำ)
    const link = await prisma.assetLink.findFirst({
      where: { entityType: 'prompt', entityId: prompt.id, assetId: locationAssetId },
    });
    expect(link).not.toBeNull();
    expect(link!.linkRole).toBe('cover');
  });

  it('re-snapshot same origin appends v2 to the SAME prompt — no duplicate Prompt', async () => {
    const res = await http(app)
      .post('/api/prompts/hub/snapshot')
      .set(auth(token))
      .send({ sourceType: 'location', sourceId: locationId })
      .expect(201);

    expect(res.body.versionLabel).toBe('v2');
    expect(res.body.prompt.versions).toHaveLength(2);

    const dupes = await prisma.prompt.count({
      where: {
        versions: { some: { sourceUrl: `aistar://location/${locationId}` } },
        archivedAt: null,
      },
    });
    expect(dupes).toBe(1);

    // ไม่ลิงก์รูปซ้ำ (asset เดิม + prompt เดิม)
    const links = await prisma.assetLink.count({
      where: { entityType: 'prompt', entityId: res.body.prompt.id, assetId: locationAssetId },
    });
    expect(links).toBe(1);
  });

  it('promptType mapping per source: gesture → shot, character → identity (master prompt body)', async () => {
    const ges = await http(app)
      .post('/api/prompts/hub/snapshot')
      .set(auth(token))
      .send({ sourceType: 'gesture', sourceId: gestureId })
      .expect(201);
    expect(ges.body.prompt.promptType).toBe('shot');
    expect(ges.body.prompt.versions[0].sourceUrl).toBe(`aistar://gesture/${gestureId}`);

    const chr = await http(app)
      .post('/api/prompts/hub/snapshot')
      .set(auth(token))
      .send({ sourceType: 'character', sourceId: characterId })
      .expect(201);
    expect(chr.body.prompt.promptType).toBe('identity');
    expect(chr.body.prompt.versions[0].body).toContain('=== DIRECTIVE ===');
  });

  it('snapshot 404 on unknown source, 400 on bad sourceType', async () => {
    await http(app)
      .post('/api/prompts/hub/snapshot')
      .set(auth(token))
      .send({ sourceType: 'location', sourceId: '00000000-0000-4000-8000-000000000000' })
      .expect(404);
    await http(app)
      .post('/api/prompts/hub/snapshot')
      .set(auth(token))
      .send({ sourceType: 'weird', sourceId: locationId })
      .expect(400);
  });

  it('snapshot 403 without prompt C, and 403 without V on the source module', async () => {
    // dev_api: prompt V เท่านั้น — guard ตัดที่ prompt C
    await http(app)
      .post('/api/prompts/hub/snapshot')
      .set(auth(viewerToken))
      .send({ sourceType: 'location', sourceId: locationId })
      .expect(403);
    // prompt_engineer: prompt C ครบ แต่ไม่มี location V → ห้าม snapshot ข้ามสิทธิ์ต้นทาง
    await http(app)
      .post('/api/prompts/hub/snapshot')
      .set(auth(engineerToken))
      .send({ sourceType: 'location', sourceId: locationId })
      .expect(403);
  });
});
