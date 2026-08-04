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

// Character filtering system — 4 filter groups + tags + stats + aggregate sorts.
// ข้อมูลทดสอบถูก scope ด้วย universe เฉพาะของ spec นี้ เพื่อไม่ชนกับ suite อื่น
const UNIVERSE = 'FLT-VERSE';
const listQ = (extra = '') => `/api/characters?universe=${encodeURIComponent(UNIVERSE)}${extra}`;

describe('Character filters + tags + stats (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let token: string;

  let idA: string; // ฟ้าใส — ครบทุกอย่าง: รูป, เสียง, bible, commerce, campaign active, gmv สูง
  let idB: string; // หมอก — ไม่มีรูป/เสียง, bible ไม่ครบ, campaign จบแล้ว (free), gmv ต่ำ
  let idC: string; // เมฆ — เปล่า ๆ ไม่เคยถูกใช้เลย (unused)
  let tagSaepId: string;
  let tagReviewId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    app = await createApp();
    token = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);
    await ensureResearcher(prisma);

    // ── สร้าง 3 ตัวละครที่โปรไฟล์ต่างกันคนละขั้ว ──
    const a = await http(app)
      .post('/api/characters')
      .set(auth(token))
      .send({
        nameTh: 'ฟ้าใส',
        nameEn: 'FltFasai',
        universe: UNIVERSE,
        series: 'FLT-Series-1',
        roleLabel: 'นางเอกสายรีวิว',
        age: 22,
        gender: 'หญิง',
        region: 'อีสาน',
        persona: { one_line_concept: 'สาวอีสานสายแซ่บ', short_bio: 'รีวิวจริงใจ' },
        visualDna: { hair: 'ดำยาว', face: 'หวาน' },
        commerceProfile: {
          suitable_product_categories: ['ความงาม', 'สกินแคร์'],
          restricted_product_categories: ['เหล้า'],
          claim_risk_level: 'low',
          brand_safety_level: 'high',
        },
      })
      .expect(201);
    idA = a.body.id;

    const b = await http(app)
      .post('/api/characters')
      .set(auth(token))
      .send({
        nameTh: 'หมอก',
        nameEn: 'FltMok',
        universe: UNIVERSE,
        series: 'FLT-Series-2',
        roleLabel: 'พระรองสายฮา',
        age: 35,
        gender: 'ชาย',
        region: 'เหนือ',
        persona: { one_line_concept: 'หนุ่มเหนือสายกิน' }, // trivial (key เดียว) → bible ไม่ครบ
        commerceProfile: {
          suitable_product_categories: ['ขนม', 'อาหาร'],
          claim_risk_level: 'high',
          brand_safety_level: 'medium',
        },
      })
      .expect(201);
    idB = b.body.id;

    const c = await http(app)
      .post('/api/characters')
      .set(auth(token))
      .send({
        nameTh: 'เมฆ',
        nameEn: 'FltMek',
        universe: UNIVERSE,
        age: 28,
        gender: 'ชาย',
        region: 'กลาง',
      })
      .expect(201);
    idC = c.body.id;

    // A: รูป primary_reference (ผ่าน API จริง ให้ mimeType/links ถูกตาม flow)
    await http(app)
      .post('/api/assets')
      .set(auth(token))
      .field('assetType', 'face_reference')
      .field('entityType', 'character')
      .field('entityId', idA)
      .field('linkRole', 'primary_reference')
      .attach('file', PNG_BUFFER, 'flt_fasai.png')
      .expect(201);

    // A: voice profile
    await prisma.characterVoiceProfile.create({
      data: { characterId: idA, voiceType: 'สดใส', tone: 'เป็นกันเอง' },
    });

    // Campaigns: A อยู่ใน campaign active (planning) + จบแล้ว 1 (usage=2), B จบแล้ว (free, usage=1), C ไม่เคยถูกใช้
    const cmpActive = await prisma.campaign.create({
      data: { displayCode: 'CMP-FLT-001', name: 'FLT active', status: 'planning' },
    });
    const cmpDoneA = await prisma.campaign.create({
      data: { displayCode: 'CMP-FLT-002', name: 'FLT done A', status: 'completed' },
    });
    const cmpDoneB = await prisma.campaign.create({
      data: { displayCode: 'CMP-FLT-003', name: 'FLT done B', status: 'completed' },
    });
    await prisma.campaignCharacter.createMany({
      data: [
        { campaignId: cmpActive.id, characterId: idA },
        { campaignId: cmpDoneA.id, characterId: idA },
        { campaignId: cmpDoneB.id, characterId: idB },
      ],
    });

    // Performance: A gmv 22,617 (สองก้อนต้องถูกรวม) / views 150,000 — B gmv 5,000 / views 60,000
    const itemA = await prisma.contentItem.create({
      data: { title: 'FLT clip A', platform: 'tiktok' },
    });
    const itemB = await prisma.contentItem.create({
      data: { title: 'FLT clip B', platform: 'tiktok' },
    });
    await prisma.contentItemCharacter.createMany({
      data: [
        { contentItemId: itemA.id, characterId: idA },
        { contentItemId: itemB.id, characterId: idB },
      ],
    });
    await prisma.contentPerformance.createMany({
      data: [
        { contentItemId: itemA.id, platform: 'tiktok', recordedAt: new Date(), gmv: 20000, views: 100000 },
        { contentItemId: itemA.id, platform: 'tiktok', recordedAt: new Date(), gmv: 2617, views: 50000 },
        { contentItemId: itemB.id, platform: 'tiktok', recordedAt: new Date(), gmv: 5000, views: 60000 },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const names = (res: { body: { items: { nameTh: string }[] } }) =>
    res.body.items.map((i) => i.nameTh).sort();

  it('attribute filters: universe / gender / age range / roleLabel / seriesName', async () => {
    const all = await http(app).get(listQ()).set(auth(token)).expect(200);
    expect(names(all)).toEqual(['ฟ้าใส', 'หมอก', 'เมฆ'].sort());

    const male = await http(app).get(listQ('&gender=ชาย')).set(auth(token)).expect(200);
    expect(names(male)).toEqual(['หมอก', 'เมฆ'].sort());

    const age = await http(app).get(listQ('&ageMin=25&ageMax=30')).set(auth(token)).expect(200);
    expect(names(age)).toEqual(['เมฆ']);

    const role = await http(app)
      .get(listQ(`&roleLabel=${encodeURIComponent('นางเอก')}`))
      .set(auth(token))
      .expect(200);
    expect(names(role)).toEqual(['ฟ้าใส']);

    const series = await http(app)
      .get(listQ('&seriesName=FLT-Series-2'))
      .set(auth(token))
      .expect(200);
    expect(names(series)).toEqual(['หมอก']);
  });

  it('readiness filters: hasImage / hasVoice / bibleComplete (ทั้งฝั่งมีและไม่มี)', async () => {
    const withImage = await http(app).get(listQ('&hasImage=1')).set(auth(token)).expect(200);
    expect(names(withImage)).toEqual(['ฟ้าใส']);
    const noImage = await http(app).get(listQ('&hasImage=0')).set(auth(token)).expect(200);
    expect(names(noImage)).toEqual(['หมอก', 'เมฆ'].sort());

    const withVoice = await http(app).get(listQ('&hasVoice=1')).set(auth(token)).expect(200);
    expect(names(withVoice)).toEqual(['ฟ้าใส']);

    const complete = await http(app).get(listQ('&bibleComplete=1')).set(auth(token)).expect(200);
    expect(names(complete)).toEqual(['ฟ้าใส']);
    const incomplete = await http(app).get(listQ('&bibleComplete=0')).set(auth(token)).expect(200);
    expect(names(incomplete)).toEqual(['หมอก', 'เมฆ'].sort());
  });

  it('commerce filters: productCategory (Thai ILIKE) / claimRisk / brandSafety', async () => {
    const beauty = await http(app)
      .get(listQ(`&productCategory=${encodeURIComponent('ความงาม')}`))
      .set(auth(token))
      .expect(200);
    expect(names(beauty)).toEqual(['ฟ้าใส']);

    const snack = await http(app)
      .get(listQ(`&productCategory=${encodeURIComponent('ขนม')}`))
      .set(auth(token))
      .expect(200);
    expect(names(snack)).toEqual(['หมอก']);

    const highRisk = await http(app).get(listQ('&claimRisk=high')).set(auth(token)).expect(200);
    expect(names(highRisk)).toEqual(['หมอก']);

    const safe = await http(app).get(listQ('&brandSafety=high')).set(auth(token)).expect(200);
    expect(names(safe)).toEqual(['ฟ้าใส']);

    // ผสมกัน: casting finder ใช้ productCategory + brandSafety พร้อมกัน
    const combo = await http(app)
      .get(listQ(`&productCategory=${encodeURIComponent('ความงาม')}&brandSafety=high&sortBy=gmv`))
      .set(auth(token))
      .expect(200);
    expect(names(combo)).toEqual(['ฟ้าใส']);
  });

  it('availability: busy / free / unused', async () => {
    const busy = await http(app).get(listQ('&availability=busy')).set(auth(token)).expect(200);
    expect(names(busy)).toEqual(['ฟ้าใส']);

    const free = await http(app).get(listQ('&availability=free')).set(auth(token)).expect(200);
    expect(names(free)).toEqual(['หมอก', 'เมฆ'].sort());

    const unused = await http(app).get(listQ('&availability=unused')).set(auth(token)).expect(200);
    expect(names(unused)).toEqual(['เมฆ']);
  });

  it('list items แนบ tags[], campaignActiveCount', async () => {
    const res = await http(app).get(listQ()).set(auth(token)).expect(200);
    const a = res.body.items.find((i: { id: string }) => i.id === idA);
    expect(a.tags).toEqual([]);
    expect(a.campaignActiveCount).toBe(1); // planning เท่านั้น (completed ไม่นับ)
    const c = res.body.items.find((i: { id: string }) => i.id === idC);
    expect(c.campaignActiveCount).toBe(0);
  });

  it('tags: add (get-or-create, idempotent) + list useCount + audit', async () => {
    const add1 = await http(app)
      .post(`/api/characters/${idA}/tags`)
      .set(auth(token))
      .send({ name: 'สายแซ่บ' })
      .expect(201);
    expect(add1.body.tags).toEqual([expect.objectContaining({ name: 'สายแซ่บ' })]);
    tagSaepId = add1.body.tags[0].id;

    // ซ้ำ → idempotent, case-insensitive get-or-create ไม่สร้าง tag ใหม่
    const again = await http(app)
      .post(`/api/characters/${idA}/tags`)
      .set(auth(token))
      .send({ name: '  สายแซ่บ ' })
      .expect(201);
    expect(again.body.tags).toHaveLength(1);
    expect(again.body.tags[0].id).toBe(tagSaepId);

    const add2 = await http(app)
      .post(`/api/characters/${idA}/tags`)
      .set(auth(token))
      .send({ name: 'รีวิวเก่ง' })
      .expect(201);
    expect(add2.body.tags).toHaveLength(2);
    tagReviewId = add2.body.tags.find((t: { name: string }) => t.name === 'รีวิวเก่ง').id;

    await http(app)
      .post(`/api/characters/${idB}/tags`)
      .set(auth(token))
      .send({ name: 'สายแซ่บ' })
      .expect(201);

    const list = await http(app)
      .get(`/api/tags?q=${encodeURIComponent('สายแซ่บ')}&entityType=character`)
      .set(auth(token))
      .expect(200);
    expect(list.body).toEqual([{ id: tagSaepId, name: 'สายแซ่บ', useCount: 2 }]);

    const audit = await prisma.auditLog.count({
      where: { action: 'tag_add', entityType: 'character', entityId: idA },
    });
    expect(audit).toBeGreaterThanOrEqual(2);
  });

  it('tag filter: tagIds ต้องมีครบทุก tag (AND) + remove tag', async () => {
    const one = await http(app).get(listQ(`&tagIds=${tagSaepId}`)).set(auth(token)).expect(200);
    expect(names(one)).toEqual(['ฟ้าใส', 'หมอก'].sort());

    const both = await http(app)
      .get(listQ(`&tagIds=${tagSaepId},${tagReviewId}`))
      .set(auth(token))
      .expect(200);
    expect(names(both)).toEqual(['ฟ้าใส']);

    // GET /characters/:id แนบ tags ให้หน้า detail
    const detail = await http(app).get(`/api/characters/${idA}`).set(auth(token)).expect(200);
    expect(detail.body.tags.map((t: { name: string }) => t.name).sort()).toEqual(
      ['รีวิวเก่ง', 'สายแซ่บ'].sort(),
    );

    // เอา tag ออกจาก B → filter เหลือแค่ A
    await http(app)
      .delete(`/api/characters/${idB}/tags/${tagSaepId}`)
      .set(auth(token))
      .expect(200);
    const after = await http(app).get(listQ(`&tagIds=${tagSaepId}`)).set(auth(token)).expect(200);
    expect(names(after)).toEqual(['ฟ้าใส']);
  });

  it('tags write ต้องมีสิทธิ์ C — researcher (V อย่างเดียว) โดน 403 แต่ยังอ่านได้', async () => {
    const researcherToken = await loginAs(app, RESEARCHER_EMAIL, RESEARCHER_PASSWORD);
    await http(app).get('/api/tags').set(auth(researcherToken)).expect(200);
    await http(app)
      .post(`/api/characters/${idA}/tags`)
      .set(auth(researcherToken))
      .send({ name: 'ห้ามเพิ่ม' })
      .expect(403);
  });

  it('aggregate sorts: gmv (รวมหลาย record) / views / usage + metric แนบมาด้วย', async () => {
    const gmv = await http(app).get(listQ('&sortBy=gmv')).set(auth(token)).expect(200);
    expect(gmv.body.items.map((i: { nameTh: string }) => i.nameTh)).toEqual([
      'ฟ้าใส',
      'หมอก',
      'เมฆ',
    ]);
    expect(gmv.body.items[0].metric).toBe(22617);
    expect(gmv.body.items[1].metric).toBe(5000);
    expect(gmv.body.total).toBe(3);

    const views = await http(app).get(listQ('&sortBy=views')).set(auth(token)).expect(200);
    expect(views.body.items[0].nameTh).toBe('ฟ้าใส');
    expect(views.body.items[0].metric).toBe(150000);

    const usage = await http(app).get(listQ('&sortBy=usage')).set(auth(token)).expect(200);
    expect(usage.body.items.map((i: { nameTh: string }) => i.nameTh)).toEqual([
      'ฟ้าใส',
      'หมอก',
      'เมฆ',
    ]);
    expect(usage.body.items[0].metric).toBe(2);
  });

  it('GET /characters/stats: ตัวเลขสรุป + facets สำหรับ dropdown', async () => {
    const res = await http(app).get('/api/characters/stats').set(auth(token)).expect(200);
    expect(res.body.total).toBeGreaterThanOrEqual(3);
    expect(res.body.byStatus.draft).toBeGreaterThanOrEqual(3);
    expect(typeof res.body.ready).toBe('number');
    expect(typeof res.body.missingImage).toBe('number');
    expect(typeof res.body.archived).toBe('number');
    expect(res.body.facets.universes).toContain(UNIVERSE);
    expect(res.body.facets.regions).toEqual(expect.arrayContaining(['อีสาน', 'เหนือ', 'กลาง']));
    expect(res.body.facets.genders).toEqual(expect.arrayContaining(['หญิง', 'ชาย']));
    expect(res.body.facets.seriesNames).toContain('FLT-Series-1');
  });

  it('legacy params (q + status) ยังใช้ได้เหมือนเดิม', async () => {
    const res = await http(app)
      .get(`/api/characters?q=${encodeURIComponent('ฟ้าใส')}&status=draft`)
      .set(auth(token))
      .expect(200);
    expect(res.body.items.map((i: { id: string }) => i.id)).toContain(idA);
  });

  it('archive: หายจาก list ปกติ → โผล่ใน archived=1 → กู้คืนกลับ draft', async () => {
    // archive เมฆ
    await http(app)
      .patch(`/api/characters/${idC}/status`)
      .set(auth(token))
      .send({ status: 'archived' })
      .expect(200);

    const normal = await http(app).get(listQ()).set(auth(token)).expect(200);
    expect(names(normal)).toEqual(['ฟ้าใส', 'หมอก'].sort());

    const archived = await http(app).get(listQ('&archived=1')).set(auth(token)).expect(200);
    expect(names(archived)).toEqual(['เมฆ']);

    const stats = await http(app).get('/api/characters/stats').set(auth(token)).expect(200);
    expect(stats.body.archived).toBeGreaterThanOrEqual(1);

    // กู้คืน → draft + archivedAt หาย + กลับมาใน list ปกติ
    const restored = await http(app)
      .patch(`/api/characters/${idC}/status`)
      .set(auth(token))
      .send({ status: 'draft' })
      .expect(200);
    expect(restored.body.status).toBe('draft');
    expect(restored.body.archivedAt).toBeNull();

    const back = await http(app).get(listQ()).set(auth(token)).expect(200);
    expect(names(back)).toEqual(['ฟ้าใส', 'หมอก', 'เมฆ'].sort());

    const unarchiveAudit = await prisma.auditLog.count({
      where: { action: 'unarchive', entityType: 'character', entityId: idC },
    });
    expect(unarchiveAudit).toBe(1);
  });
});
