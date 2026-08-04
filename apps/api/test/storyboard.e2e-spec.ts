import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  PNG_BUFFER,
  auth,
  createApp,
  createUserWithRoles,
  http,
  loginAs,
} from './utils';

// Storyboard (Content Intelligence ระบบ 3) — ร่าง image prompt ต่อช็อต (deterministic)
// + comic-panel view + แนบเฟรมผ่าน AssetLink entityType 'shot'
const VIEWER_EMAIL = 'sb-viewer@aistar.test';
const VIEWER_PASSWORD = 'sb-viewer-2026';

describe('Storyboard (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let adminToken: string;
  let viewerToken: string; // character_designer: episode V only (ไม่มี C)
  let episodeId: string;
  let emptyEpisodeId: string;
  let shotIds: string[];
  let characterId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    // character_designer มี episode ['V'] เท่านั้น — เคสสิทธิ์ไม่พอ (403 บน gen)
    await createUserWithRoles(prisma, VIEWER_EMAIL, VIEWER_PASSWORD, ['character_designer']);
    app = await createApp();
    adminToken = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);
    viewerToken = await loginAs(app, VIEWER_EMAIL, VIEWER_PASSWORD);

    // location → ฉีดเข้า prompt ได้
    const location = await prisma.location.create({
      data: { name: 'ลิฟต์ชั้น 13', mood: 'หลอน', lighting: 'ไฟกระพริบ', timeOfDay: 'กลางคืน' },
    });

    // episode + script + location
    const ep = await http(app)
      .post('/api/episodes')
      .set(auth(adminToken))
      .send({ title: 'SB e2e EP', script: 'ฉากเปิด: นางเอกติดในลิฟต์', locationId: location.id })
      .expect(201);
    episodeId = ep.body.id;

    // ตัวละครมี Visual DNA รวย → prompt มีเนื้อหาให้ยืนยัน
    const char = await http(app)
      .post('/api/characters')
      .set(auth(adminToken))
      .send({
        nameTh: 'แพรวา',
        nameEn: 'Praewa',
        visualDna: {
          face_shape: 'รูปไข่',
          hair_style: 'ผมยาวสีน้ำตาล',
          skin_tone: 'ผิวสองสี',
          anti_clone_rules: ['ต้องมีไฝใต้ตาซ้าย'],
          negative_prompt: 'blurry, extra fingers',
        },
      })
      .expect(201);
    characterId = char.body.id;

    // 3 ช็อตเรียง 1..3 (ช็อต 1 มีตัวละคร)
    shotIds = [];
    const shots = [
      { action: 'เปิดประตูลิฟต์', camera: 'wide', emotion: 'กังวล', characterIds: [characterId] },
      { action: 'ไฟดับ', camera: 'close_up', emotion: 'ตกใจ' },
      { action: 'เผชิญหน้าผี', camera: 'reaction', emotion: 'สยอง' },
    ];
    for (const s of shots) {
      const res = await http(app)
        .post(`/api/episodes/${episodeId}/shots`)
        .set(auth(adminToken))
        .send(s)
        .expect(201);
      shotIds.push(res.body.id);
    }

    // อีพีว่าง (ไม่มีช็อต) → เคส empty-episode
    const empty = await http(app)
      .post('/api/episodes')
      .set(auth(adminToken))
      .send({ title: 'SB e2e EP ว่าง' })
      .expect(201);
    emptyEpisodeId = empty.body.id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('POST /episodes/:id/storyboard-prompts → ร่าง imagePrompt ทุกช็อต (deterministic)', async () => {
    const res = await http(app)
      .post(`/api/episodes/${episodeId}/storyboard-prompts`)
      .set(auth(adminToken))
      .send({})
      .expect(201);
    expect(res.body).toMatchObject({
      total: 3,
      generated: 3,
      skipped: 0,
      failed: 0,
      provenance: 'deterministic',
    });

    const shot = await prisma.shot.findUnique({ where: { id: shotIds[0] } });
    expect(shot?.imagePrompt).toBeTruthy();
    // ประกอบจาก ช็อต + Visual DNA ตัวละคร + Location
    expect(shot!.imagePrompt).toContain('ช็อต #1');
    expect(shot!.imagePrompt).toContain('Praewa');
    expect(shot!.imagePrompt).toContain('ผมยาวสีน้ำตาล');
    expect(shot!.imagePrompt).toContain('ต้องมีไฝใต้ตาซ้าย'); // anti-clone
    expect(shot!.imagePrompt).toContain('blurry'); // negative prompt
    expect(shot!.imagePrompt).toContain('ลิฟต์ชั้น 13'); // location
  });

  it('รอบสองไม่ regenerate → ช็อตที่มี prompt แล้วถูก skip', async () => {
    const res = await http(app)
      .post(`/api/episodes/${episodeId}/storyboard-prompts`)
      .set(auth(adminToken))
      .send({})
      .expect(201);
    expect(res.body).toMatchObject({ total: 3, generated: 0, skipped: 3 });
  });

  it('regenerate:true → เขียนทับ imagePrompt เดิม', async () => {
    // ทำให้ prompt เดิมเป็นค่าที่รู้ก่อน แล้วดูว่าถูกทับ
    await prisma.shot.update({ where: { id: shotIds[1] }, data: { imagePrompt: 'OLD_PROMPT' } });
    const res = await http(app)
      .post(`/api/episodes/${episodeId}/storyboard-prompts`)
      .set(auth(adminToken))
      .send({ regenerate: true })
      .expect(201);
    expect(res.body).toMatchObject({ total: 3, generated: 3, skipped: 0 });
    const shot = await prisma.shot.findUnique({ where: { id: shotIds[1] } });
    expect(shot?.imagePrompt).not.toBe('OLD_PROMPT');
    expect(shot!.imagePrompt).toContain('ช็อต #2');
  });

  it('PATCH /shots/:id → คนแก้ imagePrompt เองได้', async () => {
    const tweaked = 'prompt ที่คนปรับเอง — close up on eyes';
    await http(app)
      .patch(`/api/shots/${shotIds[0]}`)
      .set(auth(adminToken))
      .send({ imagePrompt: tweaked })
      .expect(200);
    const shot = await prisma.shot.findUnique({ where: { id: shotIds[0] } });
    expect(shot?.imagePrompt).toBe(tweaked);
  });

  it('POST /shots/:id/image-prompt → regenerate ช็อตเดียว (เขียนทับที่คนแก้)', async () => {
    const res = await http(app)
      .post(`/api/shots/${shotIds[0]}/image-prompt`)
      .set(auth(adminToken))
      .expect(201);
    expect(res.body.imagePrompt).toContain('ช็อต #1');
    expect(res.body.imagePrompt).not.toContain('close up on eyes');
  });

  it('GET /episodes/:id/storyboard → ช็อตเรียงตาม shotNumber + ชื่อตัวละคร + prompt', async () => {
    const res = await http(app)
      .get(`/api/episodes/${episodeId}/storyboard`)
      .set(auth(adminToken))
      .expect(200);
    expect(res.body.episode).toMatchObject({ id: episodeId, title: 'SB e2e EP' });
    expect(res.body.shots.map((s: { shotNumber: number }) => s.shotNumber)).toEqual([1, 2, 3]);
    const first = res.body.shots[0];
    expect(first.characters[0]).toMatchObject({ characterId, nameEn: 'Praewa' });
    expect(first.imagePrompt).toContain('ช็อต #1');
    expect(first.frames).toEqual([]); // ยังไม่มีเฟรม
  });

  it('อัปเฟรม (AssetLink entityType shot) → โผล่ใน storyboard', async () => {
    const asset = await http(app)
      .post('/api/assets')
      .set(auth(adminToken))
      .field('assetType', 'storyboard_frame')
      .field('entityType', 'shot')
      .field('entityId', shotIds[0])
      .field('linkRole', 'deliverable')
      .attach('file', PNG_BUFFER, 'frame1.png')
      .expect(201);

    const res = await http(app)
      .get(`/api/episodes/${episodeId}/storyboard`)
      .set(auth(adminToken))
      .expect(200);
    const first = res.body.shots.find((s: { id: string }) => s.id === shotIds[0]);
    expect(first.frames).toHaveLength(1);
    expect(first.frames[0]).toMatchObject({
      assetId: asset.body.id,
      linkRole: 'deliverable',
      assetType: 'storyboard_frame',
    });
  });

  it('empty episode → total 0, storyboard shots ว่าง', async () => {
    const gen = await http(app)
      .post(`/api/episodes/${emptyEpisodeId}/storyboard-prompts`)
      .set(auth(adminToken))
      .send({})
      .expect(201);
    expect(gen.body).toMatchObject({ total: 0, generated: 0, skipped: 0, failed: 0 });

    const view = await http(app)
      .get(`/api/episodes/${emptyEpisodeId}/storyboard`)
      .set(auth(adminToken))
      .expect(200);
    expect(view.body.shots).toEqual([]);
  });

  it('สิทธิ์ไม่พอ (episode V only) → gen 403', async () => {
    await http(app)
      .post(`/api/episodes/${episodeId}/storyboard-prompts`)
      .set(auth(viewerToken))
      .send({})
      .expect(403);

    // แต่ดู storyboard ได้ (V)
    await http(app)
      .get(`/api/episodes/${episodeId}/storyboard`)
      .set(auth(viewerToken))
      .expect(200);
  });
});
