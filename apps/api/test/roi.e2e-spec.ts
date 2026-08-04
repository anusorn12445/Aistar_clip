import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  RESEARCHER_EMAIL,
  RESEARCHER_PASSWORD,
  auth,
  createApp,
  createUserWithRoles,
  ensureResearcher,
  http,
  loginAs,
} from './utils';

// ROI ต่อคลิป — GET /content-insights/roi (deterministic, no AI)
// ปิดวง: ต้นทุน AI (AiUsageLog+AiUsageLink) ↔ ผลงาน (ContentPerformance) ต่อ ContentItem
//
// Isolation: platform ที่ unique ต่อ run + filter platform=PLATFORM ทุก request
// เพื่อไม่ให้ข้อมูลจาก suite อื่นปนเข้า rows/totals
describe('ROI ต่อคลิป — cost vs performance (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let adminToken: string; // CEO (admin ∈ FINANCE_ROLES)
  let researcherToken: string; // content V แต่ไม่ใช่ CEO
  let designerToken: string; // character_designer — ไม่มี content permission → 403

  const PLATFORM = `tiktok_roi_${randomUUID().slice(0, 8)}`;
  const DESIGNER_EMAIL = 'roi-designer@aistar.test';
  const PW = 'aistar-roi-2026';

  // ช่วงเวลาหลักของชุดข้อมูล (2026-03) + ข้อมูลนอกช่วง (2020-01) ไว้ทดสอบ date filter
  const USED_AT = new Date('2026-03-10T08:00:00.000Z');
  const RECORDED_AT = new Date('2026-03-12T10:00:00.000Z');
  const OLD_USED_AT = new Date('2020-01-05T08:00:00.000Z');
  const OLD_RECORDED_AT = new Date('2020-01-07T10:00:00.000Z');
  const RANGE = 'from=2026-03-01&to=2026-03-31';

  let aiToolId: string;
  let itemAId: string; // cost 500 (2 logs) + views 10000 + gmv 5000 → profit 4500, roi 9
  let itemBId: string; // no cost + views 20000 + gmv 0 → costPerView 0
  let itemCId: string; // cost 400, no perf → views 0, costPerView null, profit -400
  let itemDId: string; // idle (no cost, no perf) → ต้องไม่โผล่ใน rows
  let episodeId: string; // อีพีของ A: episode log 1000 + shot log 250 → episodeCost 1250

  const roiGet = (qs: string, token: string) =>
    http(app).get(`/api/content-insights/roi?${qs}`).set(auth(token));

  async function mkLog(costBaht: number, usedAt: Date, entityType: string, entityId: string) {
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } });
    await prisma.aiUsageLog.create({
      data: {
        userId: admin.id,
        aiToolId,
        usedAt,
        quantity: 1,
        costBaht,
        outputsCount: 1,
        outputType: 'video',
        links: { create: [{ entityType, entityId }] },
      },
    });
  }

  beforeAll(async () => {
    prisma = new PrismaClient();
    await ensureResearcher(prisma);
    await createUserWithRoles(prisma, DESIGNER_EMAIL, PW, ['character_designer'], 'ROI Designer');
    app = await createApp();
    adminToken = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);
    researcherToken = await loginAs(app, RESEARCHER_EMAIL, RESEARCHER_PASSWORD);
    designerToken = await loginAs(app, DESIGNER_EMAIL, PW);

    const tool = await prisma.aiTool.create({
      data: { name: `ROI Tool ${randomUUID().slice(0, 6)}`, unit: 'credit' },
    });
    aiToolId = tool.id;

    const ep = await prisma.episode.create({
      data: { displayCode: `EP-ROI-${randomUUID().slice(0, 6)}`, title: 'ROI Episode' },
    });
    episodeId = ep.id;
    const shot = await prisma.shot.create({ data: { episodeId, shotNumber: 1 } });

    const mkItem = (title: string, over: Record<string, unknown> = {}) =>
      prisma.contentItem.create({
        data: { title, platform: PLATFORM, contentFormat: 'short_video', ...over },
      });

    // A: ผูกอีพี + ต้นทุนตรง 300+200 + perf (2 snapshot รวม views 10000, gmv 5000)
    const itemA = await mkItem('คลิปกำไร', { episodeId, contentType: 'drama' });
    itemAId = itemA.id;
    await mkLog(300, USED_AT, 'content', itemAId);
    await mkLog(200, USED_AT, 'content', itemAId);
    // นอกช่วง: ต้องหายไปเมื่อ filter ด้วย RANGE
    await mkLog(999, OLD_USED_AT, 'content', itemAId);
    await prisma.contentPerformance.create({
      data: { contentItemId: itemAId, platform: PLATFORM, recordedAt: RECORDED_AT, views: 6000, gmv: 3000 },
    });
    await prisma.contentPerformance.create({
      data: { contentItemId: itemAId, platform: PLATFORM, recordedAt: RECORDED_AT, views: 4000, gmv: 2000 },
    });
    await prisma.contentPerformance.create({
      data: { contentItemId: itemAId, platform: PLATFORM, recordedAt: OLD_RECORDED_AT, views: 111, gmv: 11 },
    });
    // ต้นทุนระดับอีพี (แชร์) — ต้องไปโผล่ที่ episodeCost ไม่ใช่ cost
    await mkLog(1000, USED_AT, 'episode', episodeId);
    await mkLog(250, USED_AT, 'shot', shot.id);

    // B: วิวเยอะ ไม่มีต้นทุน ไม่มียอดขาย (sourceType affiliate ไว้ทดสอบ filter)
    const itemB = await mkItem('คลิปวิวเยอะ', { sourceType: 'affiliate' });
    itemBId = itemB.id;
    await prisma.contentPerformance.create({
      data: { contentItemId: itemBId, platform: PLATFORM, recordedAt: RECORDED_AT, views: 20000 },
    });

    // C: มีต้นทุน ไม่มีผลงาน
    const itemC = await mkItem('คลิปเผาเงิน');
    itemCId = itemC.id;
    await mkLog(400, USED_AT, 'content', itemCId);

    // D: idle — ไม่มีทั้งต้นทุนและผลงาน → ต้องถูกตัดทิ้ง
    const itemD = await mkItem('คลิปว่างเปล่า');
    itemDId = itemD.id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('ไม่มี content V (character_designer) → 403', async () => {
    await roiGet(`platform=${PLATFORM}`, designerToken).expect(403);
  });

  it('CEO: cost รวมจาก log ที่ผูกตรงตัว + episodeCost แยกต่างหาก (ไม่รวมเข้า cost)', async () => {
    const res = await roiGet(`platform=${PLATFORM}&${RANGE}`, adminToken).expect(200);
    expect(res.body.ceo).toBe(true);

    const rowA = res.body.rows.find((r: { contentItemId: string }) => r.contentItemId === itemAId);
    expect(rowA).toBeDefined();
    expect(rowA.cost).toBe(500); // 300+200 (log นอกช่วง 999 ถูกกรองออก)
    expect(rowA.episodeCost).toBe(1250); // 1000 (episode) + 250 (shot) — แชร์ทั้งอีพี ไม่บวกเข้า cost
    expect(rowA.views).toBe(10000); // sum 2 snapshot ในช่วง (snapshot เก่า 111 ถูกกรองออก)
    expect(rowA.gmv).toBe(5000);
    expect(rowA.profit).toBe(4500);
    expect(rowA.roi).toBe(9); // (5000-500)/500
  });

  it('CEO: เรียงตาม profit desc + คลิป idle (ไม่มีทั้ง cost และ perf) ถูกตัดทิ้ง', async () => {
    const res = await roiGet(`platform=${PLATFORM}&${RANGE}`, adminToken).expect(200);
    const ids = res.body.rows.map((r: { contentItemId: string }) => r.contentItemId);
    // profit: A 4500 > B 0 > C -400
    expect(ids).toEqual([itemAId, itemBId, itemCId]);
    expect(ids).not.toContain(itemDId);
    expect(res.body.count).toBe(3);
  });

  it('non-CEO (content V): ceo:false + gmv/revenue/profit/roi เป็น null แต่ cost/views เห็นได้ + เรียงตาม views', async () => {
    const res = await roiGet(`platform=${PLATFORM}&${RANGE}`, researcherToken).expect(200);
    expect(res.body.ceo).toBe(false);

    // เรียงตาม views desc: B 20000 > A 10000 > C 0
    const ids = res.body.rows.map((r: { contentItemId: string }) => r.contentItemId);
    expect(ids).toEqual([itemBId, itemAId, itemCId]);

    const rowA = res.body.rows.find((r: { contentItemId: string }) => r.contentItemId === itemAId);
    expect(rowA.cost).toBe(500);
    expect(rowA.episodeCost).toBe(1250);
    expect(rowA.views).toBe(10000);
    expect(rowA.gmv).toBeNull();
    expect(rowA.revenue).toBeNull();
    expect(rowA.profit).toBeNull();
    expect(rowA.roi).toBeNull();
    expect(res.body.totals.totalGmv).toBeNull();
    expect(res.body.totals.totalProfit).toBeNull();
    // ฝั่งที่ไม่ใช่เงินยังครบ
    expect(res.body.totals.totalCost).toBe(900);
    expect(res.body.totals.totalViews).toBe(30000);
  });

  it('costPerView: cost/views · views=0 → null · cost=0 กับมีวิว → 0', async () => {
    const res = await roiGet(`platform=${PLATFORM}&${RANGE}`, adminToken).expect(200);
    const byId = new Map(
      res.body.rows.map((r: { contentItemId: string }) => [r.contentItemId, r]),
    );
    expect((byId.get(itemAId) as { costPerView: number }).costPerView).toBe(0.05); // 500/10000
    expect((byId.get(itemBId) as { costPerView: number }).costPerView).toBe(0); // 0/20000
    expect((byId.get(itemCId) as { costPerView: number | null }).costPerView).toBeNull(); // views 0
    // roi null เมื่อ cost 0
    expect((byId.get(itemBId) as { roi: number | null }).roi).toBeNull();
  });

  it('date range กรองทั้งสองฝั่ง: ไม่ใส่ range → log เก่า (999) + snapshot เก่า (111 วิว) กลับเข้ามา', async () => {
    const res = await roiGet(`platform=${PLATFORM}`, adminToken).expect(200);
    const rowA = res.body.rows.find((r: { contentItemId: string }) => r.contentItemId === itemAId);
    expect(rowA.cost).toBe(1499); // 300+200+999
    expect(rowA.views).toBe(10111); // 10000+111
    expect(rowA.gmv).toBe(5011);
  });

  it('totals (CEO): totalCost/totalViews/totalGmv/totalProfit คิดจากทุกแถวที่เข้าเงื่อนไข', async () => {
    const res = await roiGet(`platform=${PLATFORM}&${RANGE}`, adminToken).expect(200);
    expect(res.body.totals).toEqual({
      totalCost: 900, // A 500 + C 400
      totalViews: 30000, // A 10000 + B 20000
      totalGmv: 5000,
      totalProfit: 4100, // 5000 - 900
    });
  });

  it('filter sourceType/platform: sourceType=affiliate → เฉพาะ B · platform มั่ว → ว่าง', async () => {
    const bySource = await roiGet(
      `platform=${PLATFORM}&sourceType=affiliate&${RANGE}`,
      adminToken,
    ).expect(200);
    expect(
      bySource.body.rows.map((r: { contentItemId: string }) => r.contentItemId),
    ).toEqual([itemBId]);

    const none = await roiGet(`platform=no_such_platform_${randomUUID().slice(0, 6)}`, adminToken)
      .expect(200);
    expect(none.body.rows).toHaveLength(0);
    expect(none.body.count).toBe(0);
    expect(none.body.totals.totalCost).toBe(0);
  });

  it('filter category (contentType): drama → เฉพาะ A', async () => {
    const res = await roiGet(`platform=${PLATFORM}&category=drama&${RANGE}`, adminToken).expect(
      200,
    );
    expect(res.body.rows.map((r: { contentItemId: string }) => r.contentItemId)).toEqual([
      itemAId,
    ]);
  });
});
