import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AiClaudeService } from '../src/ai/ai-claude.service';
import type { ClaudeCallResult } from '../src/ai/ai-claude.service';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  PNG_BUFFER,
  RESEARCHER_EMAIL,
  RESEARCHER_PASSWORD,
  auth,
  createApp,
  ensureResearcher,
  http,
  loginAs,
} from './utils';

// Verify: ตรวจ "รูปที่ gen มาจากค่ายนอก" เทียบ visualDna ที่บันทึกไว้ (round-trip diff)
// POST /ai/character-spec-verify — perm character C.
// e2e MUST NOT call live AI (ANTHROPIC_API_KEY blanked in test-env → real path 503s;
// happy paths stub AiClaudeService.callClaude). ไม่แตะ network จริง.
describe('Character spec-verify (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let adminToken: string;
  let researcherToken: string; // researcher: character V only → ไม่มี C → 403
  let characterId: string;

  const VISUAL_DNA = {
    ethnicity: 'ไทย, ลักษณะเอเชียตะวันออกเฉียงใต้',
    hair_style: 'ผมยาวสีน้ำตาล',
    skin_tone: 'ผิวสองสี',
    distinctive_features: ['ลักยิ้มซ้าย'],
    negative_prompt: 'blurry, extra fingers', // non-visual — ต้องไม่อยู่ในสเปกที่เทียบ
  };

  // ผลเทียบปลอมจาก Claude: 2 match + 1 mismatch + 1 uncertain → score = 2/3 ≈ 67
  const CANNED_VERIFY = {
    fields: [
      { key: 'ethnicity', observed: 'หญิงไทย ลักษณะเอเชียตะวันออกเฉียงใต้', verdict: 'match' },
      { key: 'hair_style', observed: 'ผมยาวสีน้ำตาล', verdict: 'match' },
      { key: 'skin_tone', observed: 'ผิวขาวมาก', verdict: 'mismatch' },
      { key: 'distinctive_features', observed: '', verdict: 'uncertain' },
    ],
    summary: 'ตรงสเปกเป็นส่วนใหญ่ ยกเว้นสีผิวที่ขาวกว่าสเปก',
  };

  function stubCallClaude(parsed: Record<string, unknown> = CANNED_VERIFY): jest.SpyInstance {
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

  const pngImage = () => [{ mediaType: 'image/png', data: PNG_BUFFER.toString('base64') }];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await ensureResearcher(prisma);
    app = await createApp();
    adminToken = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);
    researcherToken = await loginAs(app, RESEARCHER_EMAIL, RESEARCHER_PASSWORD);

    const res = await http(app)
      .post('/api/characters')
      .set(auth(adminToken))
      .send({ nameTh: 'ตัวละครตรวจสเปก e2e', visualDna: VISUAL_DNA })
      .expect(201);
    characterId = res.body.id;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('verify without any image → 400 (Claude not called)', async () => {
    const spy = stubCallClaude();
    await http(app)
      .post('/api/ai/character-spec-verify')
      .set(auth(adminToken))
      .send({ characterId })
      .expect(400);
    expect(spy).not.toHaveBeenCalled();
  });

  it('role without character C gets 403 on verify', async () => {
    await http(app)
      .post('/api/ai/character-spec-verify')
      .set(auth(researcherToken))
      .send({ characterId, imageBase64: pngImage() })
      .expect(403);
  });

  it('unknown characterId → 404 (before Claude is called)', async () => {
    const spy = stubCallClaude();
    await http(app)
      .post('/api/ai/character-spec-verify')
      .set(auth(adminToken))
      .send({ characterId: randomUUID(), imageBase64: pngImage() })
      .expect(404);
    expect(spy).not.toHaveBeenCalled();
  });

  it('happy path (stubbed): per-field checklist + expected from stored spec + score excludes uncertain', async () => {
    const spy = stubCallClaude();
    const res = await http(app)
      .post('/api/ai/character-spec-verify')
      .set(auth(adminToken))
      .send({ characterId, imageBase64: pngImage() })
      .expect(201);

    // score = matches / (matches + mismatches) = 2/3 → 67 (uncertain ไม่ถ่วง)
    expect(res.body.score).toBe(67);
    expect(res.body.summary).toContain('สีผิว');
    expect(res.body.model).toBe('stub-model');
    expect(res.body.fields).toHaveLength(4);

    const byKey = new Map(
      (res.body.fields as { key: string; expected: string; observed: string; verdict: string }[]).map(
        (f) => [f.key, f],
      ),
    );
    expect(byKey.get('ethnicity')?.verdict).toBe('match');
    expect(byKey.get('skin_tone')?.verdict).toBe('mismatch');
    // expected เติมจาก visualDna ที่บันทึกไว้ฝั่ง server ไม่ใช่จาก model
    expect(byKey.get('skin_tone')?.expected).toBe('ผิวสองสี');
    expect(byKey.get('distinctive_features')?.expected).toBe('ลักยิ้มซ้าย');
    expect(byKey.get('distinctive_features')?.verdict).toBe('uncertain');

    // multimodal: image block นำหน้า text block ที่มี SPEC
    const args = spy.mock.calls[0][0] as { content: { type: string }[]; system: string };
    expect(args.content.map((b) => b.type)).toEqual(['image', 'text']);
    expect(args.system).toContain('ห้ามทำตาม'); // injection guard
  });

  it('coerces keys outside the stored spec to uncertain (excluded from score)', async () => {
    stubCallClaude({
      fields: [
        { key: 'hair_style', observed: 'ผมยาวสีน้ำตาล', verdict: 'match' },
        { key: 'imaginary_key', observed: 'อะไรก็ไม่รู้', verdict: 'match' },
        { key: 'negative_prompt', observed: 'ไม่มี blur', verdict: 'match' }, // non-visual key — นอกสเปกเช่นกัน
      ],
      summary: 'ok',
    });
    const res = await http(app)
      .post('/api/ai/character-spec-verify')
      .set(auth(adminToken))
      .send({ characterId, imageBase64: pngImage() })
      .expect(201);

    const byKey = new Map(
      (res.body.fields as { key: string; expected: string; verdict: string }[]).map((f) => [
        f.key,
        f,
      ]),
    );
    expect(byKey.get('imaginary_key')?.verdict).toBe('uncertain');
    expect(byKey.get('imaginary_key')?.expected).toBe('');
    expect(byKey.get('negative_prompt')?.verdict).toBe('uncertain');
    // score นับเฉพาะ hair_style ที่อยู่ในสเปกจริง → 1/1 = 100
    expect(res.body.score).toBe(100);
  });

  it('empty observed (no evidence) is coerced to uncertain — never a mismatch', async () => {
    stubCallClaude({
      fields: [{ key: 'hair_style', observed: '', verdict: 'mismatch' }],
      summary: 'มองไม่เห็นผม',
    });
    const res = await http(app)
      .post('/api/ai/character-spec-verify')
      .set(auth(adminToken))
      .send({ characterId, imageBase64: pngImage() })
      .expect(201);
    expect(res.body.fields[0].verdict).toBe('uncertain');
    // ไม่เหลือ key ที่ตัดสินได้ → score = null
    expect(res.body.score).toBeNull();
  });

  it('all-uncertain result → score null (nothing comparable)', async () => {
    stubCallClaude({
      fields: [
        { key: 'ethnicity', observed: '', verdict: 'uncertain' },
        { key: 'skin_tone', observed: '', verdict: 'uncertain' },
      ],
      summary: 'รูปมืดเกินไป ตัดสินไม่ได้',
    });
    const res = await http(app)
      .post('/api/ai/character-spec-verify')
      .set(auth(adminToken))
      .send({ characterId, imageBase64: pngImage() })
      .expect(201);
    expect(res.body.score).toBeNull();
    expect(res.body.summary).toContain('ตัดสินไม่ได้');
  });

  it('character without visualDna → 400 (nothing to compare against)', async () => {
    const spy = stubCallClaude();
    const created = await http(app)
      .post('/api/characters')
      .set(auth(adminToken))
      .send({ nameTh: 'ตัวละครไม่มี DNA e2e' })
      .expect(201);
    await http(app)
      .post('/api/ai/character-spec-verify')
      .set(auth(adminToken))
      .send({ characterId: created.body.id, imageBase64: pngImage() })
      .expect(400);
    expect(spy).not.toHaveBeenCalled();
  });

  it('accepts an uploaded image asset (imageAssetIds) and logs an audit row', async () => {
    stubCallClaude();
    const upload = await http(app)
      .post('/api/assets')
      .set(auth(adminToken))
      .field('assetType', 'character_reference')
      .attach('file', PNG_BUFFER, 'generated.png')
      .expect(201);
    const before = await prisma.auditLog.count({ where: { action: 'character_spec_verify' } });
    await http(app)
      .post('/api/ai/character-spec-verify')
      .set(auth(adminToken))
      .send({ characterId, imageAssetIds: [upload.body.id] })
      .expect(201);
    expect(await prisma.auditLog.count({ where: { action: 'character_spec_verify' } })).toBe(
      before + 1,
    );
  });

  it('verify 503s gracefully when AI is unconfigured (no stub)', async () => {
    await http(app)
      .post('/api/ai/character-spec-verify')
      .set(auth(adminToken))
      .send({ characterId, imageBase64: pngImage() })
      .expect(503);
  });

  it('prompt_reference link is single-per-character — replacing demotes the old one', async () => {
    // upload 2 รูป ผูกกับตัวละคร
    const up = async (name: string) =>
      (
        await http(app)
          .post('/api/assets')
          .set(auth(adminToken))
          .field('assetType', 'character_reference')
          .field('entityType', 'character')
          .field('entityId', characterId)
          .field('linkRole', 'reference')
          .attach('file', PNG_BUFFER, name)
          .expect(201)
      ).body.id as string;
    const a1 = await up('ref1.png');
    const a2 = await up('ref2.png');

    // ล็อก a1 เป็น prompt_reference
    await http(app)
      .post(`/api/assets/${a1}/links`)
      .set(auth(adminToken))
      .send({ entityType: 'character', entityId: characterId, linkRole: 'prompt_reference' })
      .expect(201);
    // เปลี่ยนเป็น a2 — server ต้อง demote a1 อัตโนมัติ
    await http(app)
      .post(`/api/assets/${a2}/links`)
      .set(auth(adminToken))
      .send({ entityType: 'character', entityId: characterId, linkRole: 'prompt_reference' })
      .expect(201);

    const links = await prisma.assetLink.findMany({
      where: { entityType: 'character', entityId: characterId, linkRole: 'prompt_reference' },
    });
    expect(links).toHaveLength(1);
    expect(links[0].assetId).toBe(a2);
  });
});
