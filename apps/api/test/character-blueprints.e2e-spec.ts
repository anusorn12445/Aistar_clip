import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AiClaudeService } from '../src/ai/ai-claude.service';
import type { ClaudeCallResult } from '../src/ai/ai-claude.service';
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

// Character Blueprint (พิมพ์เขียว) — CRUD (setting perm) + inject into AI Wizard & Reverse-capture.
// e2e MUST NOT call live AI (stub AiClaudeService.callClaude เหมือน character-capture suite).
describe('Character Blueprint (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let adminToken: string;
  let researcherToken: string; // character V only → มี GET list ได้ แต่ mutate 403

  // draft ปลอมจาก Claude — distinctive_features ว่าง (จะกลายเป็น missingRequired)
  const CANNED_DRAFT = {
    persona: { one_line_concept: 'สาวรีวิว', short_bio: 'ย่อ', personality: ['ร่าเริง'] },
    visualDna: {
      ethnicity: 'ไทย, ลักษณะเอเชียตะวันออกเฉียงใต้',
      distinctive_features: [], // ว่าง → missingRequired
      art_style: 'photorealistic',
    },
    commerceProfile: {},
    voiceProfile: {},
    suggested: { age: 24, gender: 'หญิง', region: 'ภาคกลาง', roleLabel: 'นักรีวิว' },
  };

  const CANNED_CAPTURE = {
    ...CANNED_DRAFT,
    nameTh: 'มะลิ',
    nameEn: 'Mali',
    confidence: 'high',
  };

  function stubCallClaude(parsed: Record<string, unknown>): jest.SpyInstance {
    const svc = app.get(AiClaudeService);
    return jest.spyOn(svc, 'callClaude').mockImplementation(
      async () =>
        ({
          parsed,
          model: 'stub-model',
          usage: { inputTokens: 10, outputTokens: 20 },
          latencyMs: 1,
        }) as ClaudeCallResult<unknown>,
    );
  }

  beforeAll(async () => {
    prisma = new PrismaClient();
    await ensureResearcher(prisma);
    app = await createApp();
    adminToken = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);
    researcherToken = await loginAs(app, RESEARCHER_EMAIL, RESEARCHER_PASSWORD);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('seed provides the 4 builtin blueprints incl. one active default', async () => {
    const res = await http(app).get('/api/character-blueprints').set(auth(adminToken)).expect(200);
    const names = res.body.map((b: { name: string }) => b.name);
    expect(names).toEqual(expect.arrayContaining(['มาตรฐานทั่วไป', 'แม่บ้านอีสาน', 'Beauty Presenter', 'Gen-Z Reviewer']));
    const defaults = res.body.filter((b: { isDefault: boolean; status: string }) => b.isDefault && b.status === 'active');
    expect(defaults.length).toBe(1);
  });

  it('active list is GET-able by a character-viewer without setting perm', async () => {
    const res = await http(app)
      .get('/api/character-blueprints?status=active')
      .set(auth(researcherToken))
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('list is ordered by sortOrder ascending', async () => {
    const res = await http(app).get('/api/character-blueprints').set(auth(adminToken)).expect(200);
    const orders = res.body.map((b: { sortOrder: number }) => b.sortOrder);
    const sorted = [...orders].sort((a, b) => a - b);
    expect(orders).toEqual(sorted);
  });

  it('admin creates → updates → archives a blueprint (setting perm)', async () => {
    const created = await http(app)
      .post('/api/character-blueprints')
      .set(auth(adminToken))
      .send({
        name: 'ทดสอบ CRUD',
        icon: '🧪',
        houseRules: 'กฎทดสอบ',
        requiredFields: ['ethnicity'],
        defaults: { ethnicity: 'ไทย', art_style: 'photorealistic' },
        sortOrder: 90,
      })
      .expect(201);
    expect(created.body.id).toEqual(expect.any(String));
    expect(created.body.requiredFields).toEqual(['ethnicity']);

    const updated = await http(app)
      .patch(`/api/character-blueprints/${created.body.id}`)
      .set(auth(adminToken))
      .send({ houseRules: 'กฎใหม่', requiredFields: ['ethnicity', 'skin_tone'] })
      .expect(200);
    expect(updated.body.houseRules).toBe('กฎใหม่');
    expect(updated.body.requiredFields).toEqual(['ethnicity', 'skin_tone']);

    const archived = await http(app)
      .post(`/api/character-blueprints/${created.body.id}/archive`)
      .set(auth(adminToken))
      .expect(201);
    expect(archived.body.status).toBe('archived');
    expect(archived.body.archivedAt).toEqual(expect.any(String));
  });

  it('setting isDefault on a new blueprint clears the previous default (single default invariant)', async () => {
    const created = await http(app)
      .post('/api/character-blueprints')
      .set(auth(adminToken))
      .send({ name: 'Default ใหม่', isDefault: true, sortOrder: 91 })
      .expect(201);
    expect(created.body.isDefault).toBe(true);

    const list = await http(app).get('/api/character-blueprints?status=active').set(auth(adminToken)).expect(200);
    const activeDefaults = list.body.filter((b: { isDefault: boolean }) => b.isDefault);
    expect(activeDefaults.length).toBe(1);
    expect(activeDefaults[0].id).toBe(created.body.id);
  });

  it('non-setting role gets 403 on mutate', async () => {
    await http(app)
      .post('/api/character-blueprints')
      .set(auth(researcherToken))
      .send({ name: 'ห้ามสร้าง' })
      .expect(403);
  });

  it('creating a character with blueprintId persists it', async () => {
    const bp = await http(app)
      .post('/api/character-blueprints')
      .set(auth(adminToken))
      .send({ name: 'ผูกกับตัวละคร', sortOrder: 92 })
      .expect(201);
    const res = await http(app)
      .post('/api/characters')
      .set(auth(adminToken))
      .send({ nameTh: 'ตัวละครมี blueprint', blueprintId: bp.body.id })
      .expect(201);
    expect(res.body.blueprintId).toBe(bp.body.id);
  });

  it('creating a character without blueprintId applies the active default', async () => {
    const list = await http(app).get('/api/character-blueprints?status=active').set(auth(adminToken)).expect(200);
    const def = list.body.find((b: { isDefault: boolean }) => b.isDefault);
    expect(def).toBeDefined();
    const res = await http(app)
      .post('/api/characters')
      .set(auth(adminToken))
      .send({ nameTh: 'ตัวละครไม่ได้เลือก blueprint' })
      .expect(201);
    expect(res.body.blueprintId).toBe(def.id);
  });

  it('AI Wizard draft with blueprintId returns draft + missingRequired for empty required fields', async () => {
    const spy = stubCallClaude(CANNED_DRAFT);
    const bp = await http(app)
      .post('/api/character-blueprints')
      .set(auth(adminToken))
      .send({ name: 'Wizard required', requiredFields: ['distinctive_features'], sortOrder: 93 })
      .expect(201);

    const res = await http(app)
      .post('/api/ai/characters/draft')
      .set(auth(adminToken))
      .send({ nameTh: 'น้ำหวาน', oneLineConcept: 'ไอดอลสายรีวิว', blueprintId: bp.body.id })
      .expect(201);

    expect(res.body.blueprintId).toBe(bp.body.id);
    expect(res.body.missingRequired).toContain('distinctive_features');
    expect(res.body.draft.persona.one_line_concept).toBe('สาวรีวิว');
    // house-rules injected into system prompt
    const args = spy.mock.calls[0][0] as { system: string };
    expect(args.system).toContain('# BLUEPRINT: Wizard required');
    expect(args.system).toContain('REQUIRED');
  });

  it('Reverse-capture with blueprintId returns blueprintId + missingRequired (and it persists on create)', async () => {
    stubCallClaude(CANNED_CAPTURE);
    const bp = await http(app)
      .post('/api/character-blueprints')
      .set(auth(adminToken))
      .send({ name: 'Capture required', requiredFields: ['distinctive_features'], sortOrder: 94 })
      .expect(201);

    const cap = await http(app)
      .post('/api/ai/characters/capture')
      .set(auth(adminToken))
      .send({ text: 'สรุปตัวละคร มะลิ', blueprintId: bp.body.id })
      .expect(201);
    expect(cap.body.blueprintId).toBe(bp.body.id);
    expect(cap.body.missingRequired).toContain('distinctive_features');

    // ผู้ใช้กด "สร้างตัวละคร" → persist พร้อม blueprintId
    const created = await http(app)
      .post('/api/characters')
      .set(auth(adminToken))
      .send({ nameTh: cap.body.nameTh, blueprintId: bp.body.id })
      .expect(201);
    expect(created.body.blueprintId).toBe(bp.body.id);
  });
});
