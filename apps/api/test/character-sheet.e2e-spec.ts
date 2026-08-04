import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
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
  sleep,
} from './utils';
import { renderCharacterSheet } from '../src/exports/character-markdown';
import {
  buildMasterPromptFor,
  buildTurnaroundSheetPrompt,
  buildTurnaroundPrompt,
} from '../src/exports/image-prompt';

// Character Sheet package: Turnaround 5 มุม + รูปมาตรฐานต่อรายการ + Pose CRUD
// + Do's & Don'ts + Export ฉบับเต็ม (sheet markdown + prompt appendix)
describe('Character sheet (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let token: string;
  let researcherToken: string;
  let charId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    app = await createApp();
    token = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);
    await ensureResearcher(prisma);
    researcherToken = await loginAs(app, RESEARCHER_EMAIL, RESEARCHER_PASSWORD);

    const c = await http(app)
      .post('/api/characters')
      .set(auth(token))
      .send({
        nameTh: 'น้องชีท',
        nameEn: 'Sheet',
        age: 24,
        gender: 'หญิง',
        visualDna: {
          ethnicity: 'Thai, Southeast Asian features',
          hair_style: 'long black hair',
          distinctive_features: ['dimple on left cheek'],
        },
      })
      .expect(201);
    charId = c.body.id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  // ── Pose CRUD ──
  it('pose CRUD: create ×2 (sortOrder ไล่ลำดับ) + list + patch + delete (ลบ asset link ด้วย)', async () => {
    const p1 = await http(app)
      .post(`/api/characters/${charId}/poses`)
      .set(auth(token))
      .send({ name: 'ยืนถือสินค้าระดับอก', description: 'สองมือประคองสินค้า มองกล้อง' })
      .expect(201);
    const p2 = await http(app)
      .post(`/api/characters/${charId}/poses`)
      .set(auth(token))
      .send({ name: 'นั่งรีวิวหน้ากล้อง' })
      .expect(201);
    expect(p2.body.sortOrder).toBeGreaterThan(p1.body.sortOrder);

    // แนบรูปกับท่าแรก (standard_image) → list เห็น standardAssetId + imageCount
    await http(app)
      .post('/api/assets')
      .set(auth(token))
      .field('assetType', 'pose')
      .field('entityType', 'character_pose')
      .field('entityId', p1.body.id)
      .field('linkRole', 'standard_image')
      .attach('file', PNG_BUFFER, 'pose.png')
      .expect(201);

    const list = await http(app)
      .get(`/api/characters/${charId}/poses`)
      .set(auth(token))
      .expect(200);
    expect(list.body).toHaveLength(2);
    const item1 = list.body.find((x: { id: string }) => x.id === p1.body.id);
    expect(item1.standardAssetId).toEqual(expect.any(String));
    expect(item1.coverAssetId).toBe(item1.standardAssetId);
    expect(item1.imageCount).toBe(1);

    await http(app)
      .patch(`/api/characters/${charId}/poses/${p2.body.id}`)
      .set(auth(token))
      .send({ name: 'นั่งรีวิวโต๊ะขาว', sortOrder: 0 })
      .expect(200);
    await http(app)
      .patch(`/api/characters/${charId}/poses/${p1.body.id}`)
      .set(auth(token))
      .send({ sortOrder: 9 })
      .expect(200);
    const list2 = await http(app)
      .get(`/api/characters/${charId}/poses`)
      .set(auth(token))
      .expect(200);
    expect(list2.body[0].name).toBe('นั่งรีวิวโต๊ะขาว');

    // delete → assetLink ของ pose หายด้วย
    await http(app)
      .delete(`/api/characters/${charId}/poses/${p1.body.id}`)
      .set(auth(token))
      .expect(200);
    const links = await prisma.assetLink.count({
      where: { entityType: 'character_pose', entityId: p1.body.id },
    });
    expect(links).toBe(0);
  });

  it('pose ของ character อื่น → 404, ลบ character → pose cascade หาย', async () => {
    const other = await http(app)
      .post('/api/characters')
      .set(auth(token))
      .send({ nameTh: 'ตัวชั่วคราว' })
      .expect(201);
    const pose = await http(app)
      .post(`/api/characters/${other.body.id}/poses`)
      .set(auth(token))
      .send({ name: 'ท่าทดสอบ' })
      .expect(201);

    // pose id จริงแต่ผูกกับ character อื่น → 404
    await http(app)
      .patch(`/api/characters/${charId}/poses/${pose.body.id}`)
      .set(auth(token))
      .send({ name: 'x' })
      .expect(404);

    await prisma.character.delete({ where: { id: other.body.id } });
    const left = await prisma.characterPose.count({ where: { characterId: other.body.id } });
    expect(left).toBe(0);
  });

  it('researcher (V only): GET poses ได้ / POST → 403', async () => {
    await http(app).get(`/api/characters/${charId}/poses`).set(auth(researcherToken)).expect(200);
    await http(app)
      .post(`/api/characters/${charId}/poses`)
      .set(auth(researcherToken))
      .send({ name: 'ท่าต้องห้าม' })
      .expect(403);
  });

  // ── Do's & Don'ts ──
  it("dos/donts persist ผ่าน PATCH /characters/:id + GET คืน array", async () => {
    await http(app)
      .patch(`/api/characters/${charId}`)
      .set(auth(token))
      .send({
        dos: ['ยิ้มเห็นลักยิ้มซ้ายทุกรูป', 'ผมยาวสีดำเสมอ'],
        donts: ['ห้ามถือแอลกอฮอล์', 'ห้ามแต่งหรูเกินจริง'],
      })
      .expect(200);

    const got = await http(app).get(`/api/characters/${charId}`).set(auth(token)).expect(200);
    expect(got.body.dos).toEqual(['ยิ้มเห็นลักยิ้มซ้ายทุกรูป', 'ผมยาวสีดำเสมอ']);
    expect(got.body.donts).toEqual(['ห้ามถือแอลกอฮอล์', 'ห้ามแต่งหรูเกินจริง']);

    // ส่งใหม่ = replace ทั้งชุด
    await http(app)
      .patch(`/api/characters/${charId}`)
      .set(auth(token))
      .send({ donts: ['ห้ามถือแอลกอฮอล์'] })
      .expect(200);
    const got2 = await http(app).get(`/api/characters/${charId}`).set(auth(token)).expect(200);
    expect(got2.body.donts).toEqual(['ห้ามถือแอลกอฮอล์']);
    expect(got2.body.dos).toHaveLength(2); // ไม่ส่ง dos = คงเดิม
  });

  // ── Turnaround role: มุมละรูปเดียว (replace = demote ตัวเดิม) ──
  it('re-link turnaround_front → ตัวเดิมถูก demote เป็น reference เหลือ role ละ 1 เสมอ', async () => {
    const a1 = await http(app)
      .post('/api/assets')
      .set(auth(token))
      .field('assetType', 'turnaround')
      .field('entityType', 'character')
      .field('entityId', charId)
      .field('linkRole', 'turnaround_front')
      .attach('file', PNG_BUFFER, 'front-v1.png')
      .expect(201);
    const a2 = await http(app)
      .post('/api/assets')
      .set(auth(token))
      .field('assetType', 'turnaround')
      .field('entityType', 'character')
      .field('entityId', charId)
      .field('linkRole', 'turnaround_front')
      .attach('file', PNG_BUFFER, 'front-v2.png')
      .expect(201);

    const frontLinks = await prisma.assetLink.findMany({
      where: { entityType: 'character', entityId: charId, linkRole: 'turnaround_front' },
    });
    expect(frontLinks).toHaveLength(1);
    expect(frontLinks[0].assetId).toBe(a2.body.id);
    // ตัวเก่ายังอยู่ใน gallery ในฐานะ reference (ไม่หลุดหาย)
    const demoted = await prisma.assetLink.count({
      where: {
        entityType: 'character',
        entityId: charId,
        assetId: a1.body.id,
        linkRole: 'reference',
      },
    });
    expect(demoted).toBe(1);
  });

  it('standard_image ต่อ expression: อัปซ้ำแทนที่ตัวเดิม (role ละ 1 ต่อรายการ)', async () => {
    const e1 = await http(app)
      .post(`/api/characters/${charId}/expressions`)
      .set(auth(token))
      .send({ name: 'ยิ้มหวาน', description: 'ยิ้มเห็นลักยิ้ม' })
      .expect(201);

    const upload = (name: string) =>
      http(app)
        .post('/api/assets')
        .set(auth(token))
        .field('assetType', 'expression')
        .field('entityType', 'character_expression')
        .field('entityId', e1.body.id)
        .field('linkRole', 'standard_image')
        .attach('file', PNG_BUFFER, name)
        .expect(201);
    await upload('smile-v1.png');
    const v2 = await upload('smile-v2.png');

    const stdLinks = await prisma.assetLink.findMany({
      where: { entityType: 'character_expression', entityId: e1.body.id, linkRole: 'standard_image' },
    });
    expect(stdLinks).toHaveLength(1);
    expect(stdLinks[0].assetId).toBe(v2.body.id);

    // list expression คืน standardAssetId = ตัวล่าสุด (และใช้เป็น cover)
    const list = await http(app)
      .get(`/api/characters/${charId}/expressions`)
      .set(auth(token))
      .expect(200);
    const row = list.body.find((x: { id: string }) => x.id === e1.body.id);
    expect(row.standardAssetId).toBe(v2.body.id);
    expect(row.coverAssetId).toBe(v2.body.id);
  });

  it('linkRole นอก whitelist → 400', async () => {
    await http(app)
      .post('/api/assets')
      .set(auth(token))
      .field('assetType', 'turnaround')
      .field('entityType', 'character')
      .field('entityId', charId)
      .field('linkRole', 'turnaround_diagonal')
      .attach('file', PNG_BUFFER, 'bad.png')
      .expect(400);
  });

  // ── Builder sanity (pure functions ฝั่ง API — sync กับ web imagePrompt.ts) ──
  it('builder: turnaround FRONT (chatgpt, มี reference) = DIRECTIVE + ANGLE + MUST-KEEP', () => {
    const c = {
      nameTh: 'น้องชีท',
      age: 24,
      gender: 'หญิง',
      visualDna: { ethnicity: 'Thai, Southeast Asian features', hair_style: 'long black hair' },
      dos: ['ยิ้มเห็นลักยิ้มซ้ายทุกรูป'],
      donts: ['ห้ามถือแอลกอฮอล์'],
    };
    const prompt = buildTurnaroundPrompt('chatgpt', c, null, 'front', { hasReference: true });
    expect(prompt).toContain('=== DIRECTIVE ===');
    expect(prompt).toContain('=== MUST-KEEP ===');
    expect(prompt).toContain('=== ANGLE ===');
    expect(prompt).toContain('Turnaround reference — FRONT view');
    expect(prompt).toContain('facing the camera straight on');
    expect(prompt).toContain('the exact same person as the attached reference image');
    // กฎรูปแนบจาก Master Prompt ยังอยู่ครบ
    expect(prompt).toContain('A reference image of this exact person is attached');
  });

  it('builder: turnaround SHEET (รูปเดียวรวมทุกมุม) = DIRECTIVE + SHEET block + landscape override', () => {
    const c = {
      nameTh: 'น้องชีท',
      visualDna: { ethnicity: 'Thai, Southeast Asian features' },
    };
    const prompt = buildTurnaroundSheetPrompt('chatgpt', c, null, { hasReference: true });
    expect(prompt).toContain('=== DIRECTIVE ===');
    expect(prompt).toContain('=== TURNAROUND SHEET (ONE image, all views) ===');
    expect(prompt).toContain('ONE single WIDE LANDSCAPE image (16:9)');
    expect(prompt).toContain('FIVE times, standing side by side');
    expect(prompt).toContain('the exact same person as the attached reference image');
    expect(prompt).not.toContain('Use --ar 16:9'); // chatgpt ไม่มี param
    const grok = buildTurnaroundSheetPrompt('grok', c, null, {});
    expect(grok).toContain('Use --ar 16:9.');
  });

  it('builder: donts → NEVER bullets ใน ChatGPT (ไม่มี negative block) / Grok merge เข้า negative', () => {
    const c = {
      nameTh: 'น้องชีท',
      visualDna: { ethnicity: 'Thai' },
      dos: ['ยิ้มเห็นลักยิ้มซ้าย'],
      donts: ['ห้ามถือแอลกอฮอล์'],
    };
    const chatgpt = buildMasterPromptFor('chatgpt', c, null, {});
    expect(chatgpt).toContain('ALWAYS:\n- ยิ้มเห็นลักยิ้มซ้าย');
    expect(chatgpt).toContain('NEVER:\n- ห้ามถือแอลกอฮอล์');
    expect(chatgpt).not.toContain('Negative prompt:');

    const grok = buildMasterPromptFor('grok', c, null, {});
    expect(grok).toContain('NEVER:\n- ห้ามถือแอลกอฮอล์');
    const negLine = grok.split('\n').find((l) => l.startsWith('Negative prompt:'));
    expect(negLine).toContain('ห้ามถือแอลกอฮอล์');
  });

  // ── Export ฉบับเต็ม ──
  it('export package: sheet markdown มีครบทุก section + prompt appendix และ job จบ done', async () => {
    // เติม wardrobe ให้ครบชุด (expression/pose มีแล้วจากเทสก่อนหน้า)
    await http(app)
      .post(`/api/characters/${charId}/wardrobe`)
      .set(auth(token))
      .send({ name: 'ชุดไลฟ์สด', occasion: 'ไลฟ์ขายของ', description: 'เสื้อเชิ้ตขาว' })
      .expect(201);

    // pure render: ประกอบ sheet เองจากข้อมูลจริงใน DB
    const character = await prisma.character.findUniqueOrThrow({ where: { id: charId } });
    const [wardrobes, expressions, poses] = await Promise.all([
      prisma.characterWardrobe.findMany({ where: { characterId: charId } }),
      prisma.characterExpression.findMany({ where: { characterId: charId } }),
      prisma.characterPose.findMany({ where: { characterId: charId } }),
    ]);
    const md = renderCharacterSheet(character, {
      wardrobes,
      expressions,
      poses,
      turnaroundSheet: 'sheet-v1.png',
      turnaround: [
        { role: 'turnaround_front', labelTh: 'หน้าตรง', labelEn: 'Front', filename: 'front-v2.png' },
        { role: 'turnaround_side', labelTh: 'ด้านข้าง', labelEn: 'Side', filename: null },
      ],
      hasReference: false,
      blueprint: null,
    });
    expect(md).toContain("## Do's (ต้องมีเสมอ)");
    expect(md).toContain('ยิ้มเห็นลักยิ้มซ้ายทุกรูป');
    expect(md).toContain('ห้ามถือแอลกอฮอล์');
    expect(md).toContain('## ตู้เสื้อผ้า (Wardrobe)');
    expect(md).toContain('ชุดไลฟ์สด');
    expect(md).toContain('## คลังสีหน้า (Expression)');
    expect(md).toContain('ยิ้มหวาน');
    expect(md).toContain('## คลังท่าโพส (Pose)');
    expect(md).toContain('นั่งรีวิวโต๊ะขาว');
    expect(md).toContain('## Turnaround Sheet (รูปเดียวรวมทุกมุม)');
    expect(md).toContain('sheet-v1.png');
    expect(md).toContain('✅ มีรูปแล้ว');
    expect(md).toContain('มุมแยกชุดเก่า — หน้าตรง');
    expect(md).toContain('## Prompt Appendix (ChatGPT variant)');
    expect(md).toContain('### Master Prompt');
    expect(md).toContain('### Turnaround Sheet — แผ่นรวมทุกมุม (แนวนอน)');
    expect(md).toContain('TURNAROUND SHEET (ONE image, all views)');
    expect(md).toContain('### Expression — ยิ้มหวาน');
    expect(md).toContain('### Wardrobe — ชุดไลฟ์สด');
    expect(md).toContain('### Pose — นั่งรีวิวโต๊ะขาว');
    expect(md).toContain('=== DIRECTIVE ===');

    // job จริงต้องจบ done (ไม่พังกับข้อมูลใหม่)
    const job = await http(app)
      .post(`/api/characters/${charId}/export`)
      .set(auth(token))
      .send({})
      .expect(201);
    const deadline = Date.now() + 15_000;
    let status = '';
    while (Date.now() < deadline) {
      const res = await http(app).get(`/api/exports/${job.body.id}`).set(auth(token)).expect(200);
      status = res.body.status;
      if (status === 'done' || status === 'failed') break;
      await sleep(250);
    }
    expect(status).toBe('done');
  }, 20_000);

  it('export ไม่พังกับ character เปล่า (ไม่มี sheet data ใหม่เลย)', async () => {
    const bare = await http(app)
      .post('/api/characters')
      .set(auth(token))
      .send({ nameTh: 'ตัวเปล่า' })
      .expect(201);
    const job = await http(app)
      .post(`/api/characters/${bare.body.id}/export`)
      .set(auth(token))
      .send({})
      .expect(201);
    const deadline = Date.now() + 15_000;
    let status = '';
    while (Date.now() < deadline) {
      const res = await http(app).get(`/api/exports/${job.body.id}`).set(auth(token)).expect(200);
      status = res.body.status;
      if (status === 'done' || status === 'failed') break;
      await sleep(250);
    }
    expect(status).toBe('done');
  }, 20_000);
});
