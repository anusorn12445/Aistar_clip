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
} from './utils';

// PRD §5.2 character sections: Relationship graph, Wardrobe, Expression.
describe('Character sections (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let token: string;
  let researcherToken: string;
  let charA: string;
  let charB: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    app = await createApp();
    token = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);
    await ensureResearcher(prisma);
    researcherToken = await loginAs(app, RESEARCHER_EMAIL, RESEARCHER_PASSWORD);

    const a = await http(app)
      .post('/api/characters')
      .set(auth(token))
      .send({ nameTh: 'ตัวเอกเอ', nameEn: 'HeroA' })
      .expect(201);
    charA = a.body.id;
    const b = await http(app)
      .post('/api/characters')
      .set(auth(token))
      .send({ nameTh: 'ตัวเอกบี', nameEn: 'HeroB' })
      .expect(201);
    charB = b.body.id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  // ── Relationships ──
  it('create relationship to self → 400 Thai', async () => {
    const res = await http(app)
      .post(`/api/characters/${charA}/relationships`)
      .set(auth(token))
      .send({ toCharacterId: charA, relationType: 'เพื่อน' })
      .expect(400);
    expect(res.body.message).toMatch(/[฀-๿]/);
  });

  it('create relationship to unknown target → 404', async () => {
    await http(app)
      .post(`/api/characters/${charA}/relationships`)
      .set(auth(token))
      .send({ toCharacterId: '00000000-0000-0000-0000-000000000000', relationType: 'คู่แข่ง' })
      .expect(404);
  });

  it('create relationship A→B → 201, then bidirectional list from both sides', async () => {
    await http(app)
      .post(`/api/characters/${charA}/relationships`)
      .set(auth(token))
      .send({ toCharacterId: charB, relationType: 'คู่แข่ง', notes: 'ชิงพรีเซนเตอร์' })
      .expect(201);

    const fromA = await http(app)
      .get(`/api/characters/${charA}/relationships`)
      .set(auth(token))
      .expect(200);
    expect(fromA.body).toHaveLength(1);
    expect(fromA.body[0].direction).toBe('outgoing');
    expect(fromA.body[0].other.id).toBe(charB);
    expect(fromA.body[0].relationType).toBe('คู่แข่ง');

    const fromB = await http(app)
      .get(`/api/characters/${charB}/relationships`)
      .set(auth(token))
      .expect(200);
    expect(fromB.body).toHaveLength(1);
    expect(fromB.body[0].direction).toBe('incoming');
    expect(fromB.body[0].other.id).toBe(charA);
  });

  it('delete relationship → gone from both sides', async () => {
    const list = await http(app)
      .get(`/api/characters/${charA}/relationships`)
      .set(auth(token))
      .expect(200);
    const relId = list.body[0].id;
    await http(app)
      .delete(`/api/characters/${charA}/relationships/${relId}`)
      .set(auth(token))
      .expect(200);
    const after = await http(app)
      .get(`/api/characters/${charB}/relationships`)
      .set(auth(token))
      .expect(200);
    expect(after.body).toHaveLength(0);
  });

  // ── Wardrobe ──
  it('wardrobe CRUD + reorder + coverAssetId after asset link', async () => {
    const w1 = await http(app)
      .post(`/api/characters/${charA}/wardrobe`)
      .set(auth(token))
      .send({ name: 'ชุดออฟฟิศ', occasion: 'ทำงาน' })
      .expect(201);
    const w2 = await http(app)
      .post(`/api/characters/${charA}/wardrobe`)
      .set(auth(token))
      .send({ name: 'ชุดไลฟ์สด' })
      .expect(201);
    expect(w2.body.sortOrder).toBeGreaterThan(w1.body.sortOrder);

    // upload asset linked to the wardrobe item
    await http(app)
      .post('/api/assets')
      .set(auth(token))
      .field('assetType', 'outfit')
      .field('entityType', 'character_wardrobe')
      .field('entityId', w1.body.id)
      .attach('file', PNG_BUFFER, 'outfit.png')
      .expect(201);

    const list = await http(app)
      .get(`/api/characters/${charA}/wardrobe`)
      .set(auth(token))
      .expect(200);
    const item1 = list.body.find((x: { id: string }) => x.id === w1.body.id);
    expect(item1.coverAssetId).toEqual(expect.any(String));
    expect(item1.imageCount).toBe(1);

    // reorder: bump w1 to the back so w2 becomes first + rename w2
    await http(app)
      .patch(`/api/characters/${charA}/wardrobe/${w1.body.id}`)
      .set(auth(token))
      .send({ sortOrder: 9 })
      .expect(200);
    await http(app)
      .patch(`/api/characters/${charA}/wardrobe/${w2.body.id}`)
      .set(auth(token))
      .send({ name: 'ชุดไลฟ์สดใหม่' })
      .expect(200);
    const list2 = await http(app)
      .get(`/api/characters/${charA}/wardrobe`)
      .set(auth(token))
      .expect(200);
    expect(list2.body[0].id).toBe(w2.body.id);
    expect(list2.body[0].name).toBe('ชุดไลฟ์สดใหม่');

    // delete w1 (cascades its asset link)
    await http(app)
      .delete(`/api/characters/${charA}/wardrobe/${w1.body.id}`)
      .set(auth(token))
      .expect(200);
    const links = await prisma.assetLink.count({
      where: { entityType: 'character_wardrobe', entityId: w1.body.id },
    });
    expect(links).toBe(0);
  });

  // ── Expression ──
  it('expression CRUD', async () => {
    const e1 = await http(app)
      .post(`/api/characters/${charA}/expressions`)
      .set(auth(token))
      .send({ name: 'ยิ้มหวาน', description: 'อารมณ์ดี' })
      .expect(201);
    expect(e1.body.name).toBe('ยิ้มหวาน');

    const list = await http(app)
      .get(`/api/characters/${charA}/expressions`)
      .set(auth(token))
      .expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].imageCount).toBe(0);

    await http(app)
      .patch(`/api/characters/${charA}/expressions/${e1.body.id}`)
      .set(auth(token))
      .send({ name: 'ยิ้มแฉ่ง' })
      .expect(200);
    await http(app)
      .delete(`/api/characters/${charA}/expressions/${e1.body.id}`)
      .set(auth(token))
      .expect(200);
    const after = await http(app)
      .get(`/api/characters/${charA}/expressions`)
      .set(auth(token))
      .expect(200);
    expect(after.body).toHaveLength(0);
  });

  // ── Permissions ──
  it('researcher (V only) can read but POST relationship → 403', async () => {
    await http(app)
      .get(`/api/characters/${charA}/wardrobe`)
      .set(auth(researcherToken))
      .expect(200);
    await http(app)
      .post(`/api/characters/${charA}/relationships`)
      .set(auth(researcherToken))
      .send({ toCharacterId: charB, relationType: 'เพื่อน' })
      .expect(403);
    await http(app)
      .post(`/api/characters/${charA}/wardrobe`)
      .set(auth(researcherToken))
      .send({ name: 'ชุดต้องห้าม' })
      .expect(403);
  });
});
