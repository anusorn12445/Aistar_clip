import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
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

// Character Category (taxonomy) + relationship-based filter suite.
// scope ด้วย universe เฉพาะของ spec นี้ เพื่อไม่ชนกับ suite อื่น
const UNIVERSE = 'CATFLT-VERSE';
const listQ = (extra = '') =>
  `/api/characters?universe=${encodeURIComponent(UNIVERSE)}${extra}`;

describe('Character categories + relationship filters (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let token: string;

  let idA: string; // ครบทุกความสัมพันธ์ (ผ่าน path ตรง: SeriesCharacter, Job, CampaignCharacter, live, gmv สูง)
  let idB: string; // match ผ่าน path อ้อม (EpisodeCharacter, content→product, content.campaignId), gmv ต่ำ, ไม่ไลฟ์
  let idC: string; // control — ไม่มีความสัมพันธ์

  let cat1: string; // ผูก A
  let cat2: string; // ผูก B

  const createChar = async (nameTh: string) => {
    const res = await http(app)
      .post('/api/characters')
      .set(auth(token))
      .send({ nameTh, universe: UNIVERSE })
      .expect(201);
    return res.body.id as string;
  };

  beforeAll(async () => {
    prisma = new PrismaClient();
    app = await createApp();
    token = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);
    await ensureResearcher(prisma);

    idA = await createChar('แคทเอ');
    idB = await createChar('แคทบี');
    idC = await createChar('แคทซี');

    // ── categories (taxonomy) ──
    const c1 = await http(app)
      .post('/api/character-categories')
      .set(auth(token))
      .send({ label: 'รีวิวเวอร์' })
      .expect(201);
    cat1 = c1.body.id;
    const c2 = await http(app)
      .post('/api/character-categories')
      .set(auth(token))
      .send({ label: 'พิธีกร' })
      .expect(201);
    cat2 = c2.body.id;

    // assign (replace-set ผ่าน update path) — A=[cat1], B=[cat2]
    await http(app)
      .patch(`/api/characters/${idA}`)
      .set(auth(token))
      .send({ categoryIds: [cat1] })
      .expect(200);
    await http(app)
      .patch(`/api/characters/${idB}`)
      .set(auth(token))
      .send({ categoryIds: [cat2] })
      .expect(200);

    // ── brand / client / job (A ทำงานกับแบรนด์ผ่าน job) ──
    const brand = await prisma.brand.create({ data: { name: 'CATFLT Brand' } });
    const client = await prisma.client.create({
      data: { name: 'CATFLT Client', brandId: brand.id },
    });
    const job = await prisma.job.create({
      data: { displayCode: 'JOB-CATFLT-1', title: 'CATFLT Job', clientId: client.id },
    });
    await prisma.jobPresenter.create({ data: { jobId: job.id, characterId: idA } });

    // ── products (P1 รีวิวโดย A; P3 อยู่ในคอนเทนต์ของ B เพื่อทดสอบ brand union; P2 tie-in ของ A) ──
    const p1 = await prisma.product.create({
      data: { displayCode: 'PRD-CATFLT-1', name: 'CATFLT P1', brandId: brand.id },
    });
    const p3 = await prisma.product.create({
      data: { displayCode: 'PRD-CATFLT-3', name: 'CATFLT P3', brandId: brand.id },
    });
    const p2 = await prisma.product.create({
      data: { displayCode: 'PRD-CATFLT-2', name: 'CATFLT P2 tie-in' },
    });
    await prisma.characterProduct.create({ data: { characterId: idA, productId: p2.id } });

    // ── series (A ผ่าน SeriesCharacter; B ผ่าน Episode→seriesId) ──
    const series = await prisma.series.create({ data: { name: 'CATFLT Series' } });
    await prisma.seriesCharacter.create({
      data: { seriesId: series.id, characterId: idA },
    });
    const episode = await prisma.episode.create({
      data: { displayCode: 'EP-CATFLT-1', title: 'CATFLT Ep', seriesId: series.id },
    });
    await prisma.episodeCharacter.create({
      data: { episodeId: episode.id, characterId: idB },
    });

    // ── campaign (A ผ่าน CampaignCharacter; B ผ่าน content.campaignId) ──
    const campaign = await prisma.campaign.create({
      data: { displayCode: 'CMP-CATFLT-1', name: 'CATFLT Campaign', status: 'planning' },
    });
    await prisma.campaignCharacter.create({
      data: { campaignId: campaign.id, characterId: idA },
    });

    // ── audience segment (A) ──
    const seg = await prisma.audienceSegment.create({
      data: { name: 'CATFLT Segment' },
    });
    await prisma.characterAudience.create({
      data: { characterId: idA, segmentId: seg.id },
    });

    // ── live (A เคยไลฟ์) ──
    const live = await prisma.liveSession.create({
      data: { title: 'CATFLT Live', platform: 'tiktok', scheduledAt: new Date() },
    });
    await prisma.liveCharacter.create({ data: { liveId: live.id, characterId: idA } });

    // ── content + performance ──
    // itemA: product P1 (รีวิว), char A, gmv 30,000 (สองก้อน)
    const itemA = await prisma.contentItem.create({
      data: { title: 'CATFLT clip A', platform: 'tiktok', productId: p1.id },
    });
    // itemB: product P3 (brand union), campaignId (campaign union), char B, gmv 5,000
    const itemB = await prisma.contentItem.create({
      data: {
        title: 'CATFLT clip B',
        platform: 'tiktok',
        productId: p3.id,
        campaignId: campaign.id,
      },
    });
    await prisma.contentItemCharacter.createMany({
      data: [
        { contentItemId: itemA.id, characterId: idA },
        { contentItemId: itemB.id, characterId: idB },
      ],
    });
    await prisma.contentPerformance.createMany({
      data: [
        { contentItemId: itemA.id, platform: 'tiktok', recordedAt: new Date(), gmv: 20000 },
        { contentItemId: itemA.id, platform: 'tiktok', recordedAt: new Date(), gmv: 10000 },
        { contentItemId: itemB.id, platform: 'tiktok', recordedAt: new Date(), gmv: 5000 },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const names = (res: { body: { items: { nameTh: string }[] } }) =>
    res.body.items.map((i) => i.nameTh).sort();

  // ─── Category taxonomy CRUD ───────────────────────────────────

  it('category CRUD: create → list (characterCount) → update label → archive', async () => {
    const created = await http(app)
      .post('/api/character-categories')
      .set(auth(token))
      .send({ label: 'สายมู' })
      .expect(201);
    expect(created.body).toEqual(
      expect.objectContaining({ label: 'สายมู', characterCount: 0, builtin: false }),
    );
    expect(typeof created.body.key).toBe('string');
    const tmpId = created.body.id;

    const list = await http(app)
      .get('/api/character-categories')
      .set(auth(token))
      .expect(200);
    const found = list.body.find((c: { id: string }) => c.id === tmpId);
    expect(found).toBeTruthy();
    // cat1 ผูก A แล้ว → characterCount ≥ 1
    const c1row = list.body.find((c: { id: string }) => c.id === cat1);
    expect(c1row.characterCount).toBeGreaterThanOrEqual(1);

    const updated = await http(app)
      .patch(`/api/character-categories/${tmpId}`)
      .set(auth(token))
      .send({ label: 'สายมูเตลู' })
      .expect(200);
    expect(updated.body.label).toBe('สายมูเตลู');

    const archived = await http(app)
      .patch(`/api/character-categories/${tmpId}`)
      .set(auth(token))
      .send({ status: 'archived' })
      .expect(200);
    expect(archived.body.status).toBe('archived');

    // ลบได้ (ยังไม่มีใครใช้)
    await http(app)
      .delete(`/api/character-categories/${tmpId}`)
      .set(auth(token))
      .expect(200);
  });

  it('in-use guard: ลบ category ที่มีตัวละครใช้อยู่ → 409', async () => {
    await http(app)
      .delete(`/api/character-categories/${cat1}`)
      .set(auth(token))
      .expect(409);
  });

  it('assign multiple + replace-set: PATCH categoryIds → detail + list สะท้อนถูก', async () => {
    // assign ทั้งสอง
    await http(app)
      .patch(`/api/characters/${idA}`)
      .set(auth(token))
      .send({ categoryIds: [cat1, cat2] })
      .expect(200);
    const detailBoth = await http(app)
      .get(`/api/characters/${idA}`)
      .set(auth(token))
      .expect(200);
    expect(detailBoth.body.categories.map((c: { id: string }) => c.id).sort()).toEqual(
      [cat1, cat2].sort(),
    );

    // replace-set กลับเป็น [cat1] เท่านั้น
    await http(app)
      .patch(`/api/characters/${idA}`)
      .set(auth(token))
      .send({ categoryIds: [cat1] })
      .expect(200);
    const detailOne = await http(app)
      .get(`/api/characters/${idA}`)
      .set(auth(token))
      .expect(200);
    expect(detailOne.body.categories.map((c: { id: string }) => c.id)).toEqual([cat1]);
    expect(detailOne.body.categories[0]).toEqual(
      expect.objectContaining({ label: 'รีวิวเวอร์' }),
    );

    // list row แนบ categories
    const list = await http(app).get(listQ()).set(auth(token)).expect(200);
    const a = list.body.items.find((i: { id: string }) => i.id === idA);
    expect(a.categories).toEqual([expect.objectContaining({ id: cat1, label: 'รีวิวเวอร์' })]);
  });

  it('assign categoryIds ที่ไม่มีจริง → 400', async () => {
    await http(app)
      .patch(`/api/characters/${idA}`)
      .set(auth(token))
      .send({ categoryIds: ['00000000-0000-0000-0000-000000000000'] })
      .expect(400);
  });

  // ─── Relationship filters ─────────────────────────────────────

  it('categoryIds (ANY): หนึ่ง = เฉพาะตัวที่มี, หลายอัน = union', async () => {
    const one = await http(app)
      .get(listQ(`&categoryIds=${cat1}`))
      .set(auth(token))
      .expect(200);
    expect(names(one)).toEqual(['แคทเอ']);

    const any = await http(app)
      .get(listQ(`&categoryIds=${cat1},${cat2}`))
      .set(auth(token))
      .expect(200);
    expect(names(any)).toEqual(['แคทเอ', 'แคทบี'].sort());
  });

  it('reviewedProductId: ตัวละครในคอนเทนต์ที่ผูกสินค้านี้', async () => {
    const p1 = await prisma.product.findFirstOrThrow({ where: { displayCode: 'PRD-CATFLT-1' } });
    const res = await http(app)
      .get(listQ(`&reviewedProductId=${p1.id}`))
      .set(auth(token))
      .expect(200);
    expect(names(res)).toEqual(['แคทเอ']);
  });

  it('seriesId: SeriesCharacter (A) union Episode→seriesId (B)', async () => {
    const series = await prisma.series.findFirstOrThrow({ where: { name: 'CATFLT Series' } });
    const res = await http(app)
      .get(listQ(`&seriesId=${series.id}`))
      .set(auth(token))
      .expect(200);
    expect(names(res)).toEqual(['แคทเอ', 'แคทบี'].sort());
  });

  it('brandId: Job→Client (A) union content→product (B)', async () => {
    const brand = await prisma.brand.findFirstOrThrow({ where: { name: 'CATFLT Brand' } });
    const res = await http(app)
      .get(listQ(`&brandId=${brand.id}`))
      .set(auth(token))
      .expect(200);
    expect(names(res)).toEqual(['แคทเอ', 'แคทบี'].sort());
  });

  it('clientId: ผ่าน Job.clientId', async () => {
    const client = await prisma.client.findFirstOrThrow({ where: { name: 'CATFLT Client' } });
    const res = await http(app)
      .get(listQ(`&clientId=${client.id}`))
      .set(auth(token))
      .expect(200);
    expect(names(res)).toEqual(['แคทเอ']);
  });

  it('campaignId: CampaignCharacter (A) union content.campaignId (B)', async () => {
    const campaign = await prisma.campaign.findFirstOrThrow({
      where: { displayCode: 'CMP-CATFLT-1' },
    });
    const res = await http(app)
      .get(listQ(`&campaignId=${campaign.id}`))
      .set(auth(token))
      .expect(200);
    expect(names(res)).toEqual(['แคทเอ', 'แคทบี'].sort());
  });

  it('tieInProductId + audienceSegmentId: CharacterProduct / CharacterAudience (A)', async () => {
    const p2 = await prisma.product.findFirstOrThrow({ where: { displayCode: 'PRD-CATFLT-2' } });
    const tie = await http(app)
      .get(listQ(`&tieInProductId=${p2.id}`))
      .set(auth(token))
      .expect(200);
    expect(names(tie)).toEqual(['แคทเอ']);

    const seg = await prisma.audienceSegment.findFirstOrThrow({
      where: { name: 'CATFLT Segment' },
    });
    const aud = await http(app)
      .get(listQ(`&audienceSegmentId=${seg.id}`))
      .set(auth(token))
      .expect(200);
    expect(names(aud)).toEqual(['แคทเอ']);
  });

  it('hasLived: เคยไลฟ์ (A) / ไม่เคย (B,C)', async () => {
    const lived = await http(app).get(listQ('&hasLived=1')).set(auth(token)).expect(200);
    expect(names(lived)).toEqual(['แคทเอ']);
    const notLived = await http(app).get(listQ('&hasLived=0')).set(auth(token)).expect(200);
    expect(names(notLived)).toEqual(['แคทบี', 'แคทซี'].sort());
  });

  it('sortByGmv: เรียงยอดขายรวม desc + แนบ metric', async () => {
    const res = await http(app).get(listQ('&sortByGmv=1')).set(auth(token)).expect(200);
    expect(res.body.items.map((i: { nameTh: string }) => i.nameTh)).toEqual([
      'แคทเอ',
      'แคทบี',
      'แคทซี',
    ]);
    expect(res.body.items[0].metric).toBe(30000);
    expect(res.body.items[1].metric).toBe(5000);
  });

  it('combine filters (AND): seriesId + hasLived → ตัดตัวที่ไม่ไลฟ์ออก', async () => {
    const series = await prisma.series.findFirstOrThrow({ where: { name: 'CATFLT Series' } });
    const res = await http(app)
      .get(listQ(`&seriesId=${series.id}&hasLived=1`))
      .set(auth(token))
      .expect(200);
    // A อยู่ series และไลฟ์ / B อยู่ series แต่ไม่ไลฟ์ → เหลือ A
    expect(names(res)).toEqual(['แคทเอ']);
  });

  it('permission: researcher (ไม่มี setting C) mutate category → 403', async () => {
    const researcherToken = await loginAs(app, RESEARCHER_EMAIL, RESEARCHER_PASSWORD);
    await http(app)
      .post('/api/character-categories')
      .set(auth(researcherToken))
      .send({ label: 'ห้ามเพิ่ม' })
      .expect(403);
  });
});
