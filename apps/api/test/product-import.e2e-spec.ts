import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
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

// Product Import จากไฟล์ export (shoptool.app / pyptools.io / generic fallback)
// ทุกเทสต์ใช้ fixture inline (CSV string + XLSX build จาก xlsx lib) — ไม่พึ่งไฟล์จริงใน ~/Downloads

// build .xlsx buffer จาก array ของ object (คีย์ = header)
function xlsxBuffer(rows: Record<string, unknown>[]): Buffer {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

// shoptool CSV — UTF-8 with BOM, หัวไทย+emoji
const SHOPTOOL_HEADERS = [
  '🔥ประเภทสินค้า',
  '🎯ช่องทาง',
  '🛒หมวดหมู่',
  'สินค้า',
  'ลิงก์สินค้า',
  '💵 ราคา',
  '💵 ราคา (สูงสุด)',
  '🕙ช่วงเวลา',
  'ยอดขายในช่วงเวลา',
  'ขาย/เดือน (ชิ้น)',
  'ขายทั้งหมด (ชิ้น)',
  '🎁ค่าคอม Extra (%)',
  '🎁ค่าคอม Extra เริ่มต้น (฿)',
  '🎁ค่าคอม Extra สูงสุด (฿)',
  'ลิงก์หน้า Affiliate',
  'สต๊อก',
  'ร้าน Mall',
  'Shop ID',
  'Item ID',
];

function csvLine(cells: string[]): string {
  return cells
    .map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c))
    .join(',');
}

function shoptoolCsv(rows: string[][], withBom = true): Buffer {
  const lines = [csvLine(SHOPTOOL_HEADERS), ...rows.map(csvLine)].join('\n');
  return Buffer.from((withBom ? '﻿' : '') + lines, 'utf8');
}

describe('Product Import (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let adminToken: string;
  let researcherToken: string; // product V only — no C

  beforeAll(async () => {
    prisma = new PrismaClient();
    await ensureResearcher(prisma);
    app = await createApp();
    adminToken = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);
    researcherToken = await loginAs(app, RESEARCHER_EMAIL, RESEARCHER_PASSWORD);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  // ── shoptool.app ──
  it('preview: shoptool CSV (BOM + Thai emoji headers) detects platform + keeps all headers', async () => {
    const csv = shoptoolCsv([
      [
        'บิวตี้', 'Shopee', 'ความงาม', 'เซรั่มหน้าใส',
        'https://shopee.co.th/product/111/222', '199', '299', '30 วัน',
        '500', '150', '2000', '12', '20', '40',
        'https://s.shopee.co.th/aff123', '88', 'ใช่', '111', '222',
      ],
    ]);
    const res = await http(app)
      .post('/api/products/import/preview')
      .set(auth(adminToken))
      .attach('file', csv, 'สินค้า.csv')
      .expect(201);

    expect(res.body.detectedPlatform).toBe('shoptool.app');
    expect(res.body.totalRows).toBe(1);
    // header ต้องครบทุกคอลัมน์ (ไม่มี BOM ติดหัวแรก)
    expect(res.body.headers).toEqual(SHOPTOOL_HEADERS);
    expect(res.body.headers[0]).toBe('🔥ประเภทสินค้า');
    const m = res.body.mappedPreview[0];
    expect(m.name).toBe('เซรั่มหน้าใส');
    expect(m.productUrl).toBe('https://shopee.co.th/product/111/222');
    expect(m.externalItemId).toBe('222');
    expect(m.price).toBe(199);
    // sourceRaw เก็บครบทุกคอลัมน์ต้นฉบับ
    expect(Object.keys(m.sourceRaw)).toEqual(expect.arrayContaining(SHOPTOOL_HEADERS));
  });

  it('preview does NOT persist any product', async () => {
    const before = await prisma.product.count();
    const csv = shoptoolCsv([
      [
        'อาหาร', 'Shopee', 'อาหาร', 'ขนมไม่เปอร์ซิสต์',
        'https://shopee.co.th/product/999/888', '50', '', '30 วัน',
        '10', '5', '20', '8', '', '', '', '3', '', '999', '888',
      ],
    ]);
    await http(app)
      .post('/api/products/import/preview')
      .set(auth(adminToken))
      .attach('file', csv, 'preview-only.csv')
      .expect(201);
    expect(await prisma.product.count()).toBe(before);
  });

  it('import: shoptool maps name/link/price/commission + parses itemid + sourceRaw complete', async () => {
    const csv = shoptoolCsv([
      [
        'บิวตี้', 'Shopee', 'ความงาม', 'ครีมกันแดด SPF50',
        'https://shopee.co.th/product/333/444', '350', '450', '30 วัน',
        '800', '260', '5400', '15', '25', '55',
        'https://s.shopee.co.th/affABC', '120', 'ใช่', '333', '444',
      ],
    ]);
    const res = await http(app)
      .post('/api/products/import')
      .set(auth(adminToken))
      .attach('file', csv, 'shoptool-import.csv')
      .expect(201);

    expect(res.body).toMatchObject({
      platform: 'shoptool.app',
      total: 1,
      created: 1,
      updated: 0,
      failed: 0,
    });

    const p = await prisma.product.findFirst({ where: { externalItemId: '444' } });
    expect(p).toBeTruthy();
    expect(p!.name).toBe('ครีมกันแดด SPF50');
    expect(p!.externalShopId).toBe('333');
    expect(Number(p!.price)).toBe(350);
    expect(Number(p!.salePrice)).toBe(450);
    expect(p!.commissionPct).toBe(15);
    expect(p!.soldMonth).toBe(260);
    expect(p!.soldTotal).toBe(5400);
    expect(p!.stockQty).toBe(120);
    expect(p!.affiliateUrl).toBe('https://s.shopee.co.th/affABC');
    expect(p!.isAffiliate).toBe(true);
    expect(p!.affiliatePlatform).toBe('shopee');
    expect((p!.platformLinks as { shopee?: string }).shopee).toBe(
      'https://shopee.co.th/product/333/444',
    );
    expect(p!.sourcePlatform).toBe('shoptool.app');
    // sourceRaw = ทุกคอลัมน์ต้นฉบับ
    expect((p!.sourceRaw as Record<string, unknown>)['🛒หมวดหมู่']).toBe('ความงาม');
    expect((p!.sourceRaw as Record<string, unknown>)['ร้าน Mall']).toBe('ใช่');
  });

  it('import: shoptool falls back to Item ID column when link is not parseable', async () => {
    const csv = shoptoolCsv([
      [
        'แกดเจ็ต', 'Shopee', 'แกดเจ็ต', 'หูฟังบลูทูธ',
        'https://shopee.co.th/นอกรูปแบบลิงก์', '590', '', '30 วัน',
        '100', '40', '900', '10', '', '', '', '15', '', '777', '555',
      ],
    ]);
    await http(app)
      .post('/api/products/import')
      .set(auth(adminToken))
      .attach('file', csv, 'shoptool-fallback.csv')
      .expect(201);
    const p = await prisma.product.findFirst({ where: { externalItemId: '555' } });
    expect(p).toBeTruthy();
    expect(p!.externalShopId).toBe('777'); // จากคอลัมน์ Shop ID
  });

  // ── pyptools.io — 3 variants ──
  it('import: pyptools flash_sale detects sourceType + maps price/commission/sold', async () => {
    const buf = xlsxBuffer([
      {
        name: 'ยาสีฟันสมุนไพร',
        seller_commission_rate: 18,
        seller_commission: 9,
        sold_month: 300,
        sold_his: 4200,
        price: '฿49.00',
        price_min: '฿45.00',
        price_max: '฿59.00',
        product_link: 'https://shopee.co.th/product/1001/2002',
        stock: 500,
        shop_name: 'ร้านสมุนไพรไทย',
        shop_session: 'sess1',
        comm: 18,
        sold: 4200,
        shopid: 1001,
      },
    ]);
    const res = await http(app)
      .post('/api/products/import')
      .set(auth(adminToken))
      .attach('file', buf, 'flash_sale.xlsx')
      .expect(201);

    expect(res.body.platform).toBe('pyptools.io');
    expect(res.body.sourceType).toBe('flash_sale');
    expect(res.body.created).toBe(1);
    const p = await prisma.product.findFirst({ where: { externalItemId: '2002' } });
    expect(p).toBeTruthy();
    expect(p!.name).toBe('ยาสีฟันสมุนไพร');
    expect(Number(p!.price)).toBe(49); // "฿49.00" → 49
    expect(Number(p!.salePrice)).toBe(59); // price_max "฿59.00"
    expect(p!.commissionPct).toBe(18);
    expect(p!.soldTotal).toBe(4200);
    expect(p!.shopName).toBe('ร้านสมุนไพรไทย');
  });

  it('import: pyptools livextra detects sourceType + maps title/rating', async () => {
    const buf = xlsxBuffer([
      {
        itemid: 30303,
        shopid: 3003,
        shop_name: 'ร้านไลฟ์',
        title: 'ลิปสติกแมตต์',
        item_rating: 4.8,
        seller_commission_rate: 20,
        seller_commission: 12,
        sold_month: 150,
        sold_his: 1800,
        price: '฿120.00',
        product_link: 'https://shopee.co.th/product/3003/30303',
        productCatIds: '11,22',
        shop_shopee_user_id: 'u1',
        stock: 60,
      },
    ]);
    const res = await http(app)
      .post('/api/products/import')
      .set(auth(adminToken))
      .attach('file', buf, 'livextra.xlsx')
      .expect(201);

    expect(res.body.sourceType).toBe('livextra');
    const p = await prisma.product.findFirst({ where: { externalItemId: '30303' } });
    expect(p).toBeTruthy();
    expect(p!.name).toBe('ลิปสติกแมตต์');
    expect(p!.rating).toBe(4.8);
    expect(Number(p!.price)).toBe(120);
  });

  it('import: pyptools product_v3v4 (20-col, v3+v4 shared) maps salePrice + captures first image note', async () => {
    const buf = xlsxBuffer([
      {
        itemid: 40404,
        shopid: 4004,
        shop_name: 'ร้านโปรดัก',
        title: 'กระเป๋าสะพาย',
        item_rating: 4.5,
        seller_commission_rate: 10,
        seller_commission: 5,
        sold_month: 90,
        sold_his: 700,
        price: 250,
        price_min: 220,
        price_max: 320,
        product_link: 'https://shopee.co.th/product/4004/40404',
        productCatIds: '33',
        shop_shopee_user_id: 'u2',
        stock: 45,
        sold: 700,
        images: 'https://img/1.jpg https://img/2.jpg',
        vdo: 'https://vid/1.mp4',
        vdoCount: 1,
      },
    ]);
    const res = await http(app)
      .post('/api/products/import')
      .set(auth(adminToken))
      .attach('file', buf, 'productv4.xlsx')
      .expect(201);

    expect(res.body.sourceType).toBe('product_v3v4');
    const p = await prisma.product.findFirst({ where: { externalItemId: '40404' } });
    expect(p).toBeTruthy();
    expect(Number(p!.salePrice)).toBe(320);
    expect(p!.rating).toBe(4.5);
    // phase-2 hook: รูปแรกเก็บเป็นโน้ตใน sourceRaw + คอลัมน์ images เดิมยังอยู่ครบ
    const raw = p!.sourceRaw as Record<string, unknown>;
    expect(raw._firstImage).toBe('https://img/1.jpg');
    expect(raw.images).toBe('https://img/1.jpg https://img/2.jpg');
  });

  // ── dedup by externalItemId (ข้ามไฟล์) ──
  it('dedup: same itemid imported twice → 1 product, updated (not duplicated)', async () => {
    const mk = (price: number) =>
      xlsxBuffer([
        {
          itemid: 55555,
          shopid: 5005,
          shop_name: 'ร้านดีดัพ',
          title: 'ครีมกันแดดรุ่นเดิม',
          item_rating: 4.2,
          seller_commission_rate: 14,
          seller_commission: 7,
          sold_month: 10,
          sold_his: 100,
          price,
          product_link: 'https://shopee.co.th/product/5005/55555',
          productCatIds: '1',
          shop_shopee_user_id: 'u',
          stock: 10,
        },
      ]);

    const first = await http(app)
      .post('/api/products/import')
      .set(auth(adminToken))
      .attach('file', mk(100), 'dedup-a.xlsx')
      .expect(201);
    expect(first.body.created).toBe(1);

    // ไฟล์ที่ 2 (คนละไฟล์) itemid เดิม → update
    const second = await http(app)
      .post('/api/products/import')
      .set(auth(adminToken))
      .attach('file', mk(150), 'dedup-b.xlsx')
      .expect(201);
    expect(second.body.created).toBe(0);
    expect(second.body.updated).toBe(1);

    const rows = await prisma.product.findMany({ where: { externalItemId: '55555' } });
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].price)).toBe(150); // อัปเดตราคาใหม่
  });

  // ── generic fallback ──
  it('generic fallback: unknown headers still import (sourceRaw kept, no crash)', async () => {
    const buf = xlsxBuffer([
      {
        product_name: 'สินค้าเครื่องมือใหม่',
        buy_link: 'https://shopee.co.th/product/6006/60606',
        custom_metric_a: 'xyz',
        custom_metric_b: 123,
      },
    ]);
    const res = await http(app)
      .post('/api/products/import')
      .set(auth(adminToken))
      .attach('file', buf, 'unknown-tool.xlsx')
      .expect(201);

    expect(res.body.platform).toBe('generic');
    expect(res.body.created).toBe(1);
    const p = await prisma.product.findFirst({ where: { externalItemId: '60606' } });
    expect(p).toBeTruthy();
    expect(p!.name).toBe('สินค้าเครื่องมือใหม่'); // fuzzy: *name*
    // คอลัมน์แปลกถูกเก็บครบใน sourceRaw
    const raw = p!.sourceRaw as Record<string, unknown>;
    expect(raw.custom_metric_a).toBe('xyz');
    expect(raw.custom_metric_b).toBe(123);
  });

  // ── row-level resilience ──
  it('bad row (no name AND no link) is skipped, not fatal', async () => {
    const csv = shoptoolCsv([
      // แถวดี
      [
        'บิวตี้', 'Shopee', 'ความงาม', 'โฟมล้างหน้า',
        'https://shopee.co.th/product/700/701', '99', '', '30 วัน',
        '5', '2', '10', '5', '', '', '', '9', '', '700', '701',
      ],
      // แถวเสีย — ไม่มีทั้งชื่อและลิงก์
      ['', 'Shopee', 'ความงาม', '', '', '', '', '30 วัน', '', '', '', '', '', '', '', '', '', '', ''],
    ]);
    const res = await http(app)
      .post('/api/products/import')
      .set(auth(adminToken))
      .attach('file', csv, 'with-bad-row.csv')
      .expect(201);
    expect(res.body.created).toBe(1);
    expect(res.body.skipped).toBe(1);
    expect(res.body.failed).toBe(0);
  });

  // ── row cap / truncation ──
  it('truncates files over the row cap (2000) and reports it', async () => {
    // 2001 แถวไม่มีชื่อ/ลิงก์ → skip ทั้งหมด (เร็ว) แต่ยังทดสอบ truncation ได้
    const rows = Array.from({ length: 2001 }, (_, i) => ({ junk_col: `x${i}` }));
    const buf = xlsxBuffer(rows);
    const res = await http(app)
      .post('/api/products/import')
      .set(auth(adminToken))
      .attach('file', buf, 'huge.xlsx')
      .expect(201);
    expect(res.body.truncated).toBe(true);
    expect(res.body.total).toBe(2000); // cap
    expect(typeof res.body.truncatedNote).toBe('string');
  });

  // ── permission ──
  it('rejects import without product:C permission (403)', async () => {
    const csv = shoptoolCsv([
      [
        'บิวตี้', 'Shopee', 'ความงาม', 'เทสสิทธิ์',
        'https://shopee.co.th/product/1/2', '10', '', '30 วัน',
        '', '', '', '', '', '', '', '', '', '1', '2',
      ],
    ]);
    await http(app)
      .post('/api/products/import')
      .set(auth(researcherToken))
      .attach('file', csv, 'noperm.csv')
      .expect(403);
    await http(app)
      .post('/api/products/import/preview')
      .set(auth(researcherToken))
      .attach('file', csv, 'noperm.csv')
      .expect(403);
  });

  it('rejects unsupported file extensions', async () => {
    await http(app)
      .post('/api/products/import/preview')
      .set(auth(adminToken))
      .attach('file', Buffer.from('hello'), 'notes.txt')
      .expect(400);
  });
});
