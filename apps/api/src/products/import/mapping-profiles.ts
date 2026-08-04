// ─── Product Import — Mapping-profile registry ───────────────────────────────
// เครื่องมือวิจัยสินค้า (shoptool.app / pyptools.io / ...) export ไฟล์ต่างหัวคอลัมน์กัน
// registry นี้ = "โปรไฟล์" แบบ data/config ล้วน เพิ่มเครื่องมือใหม่ = เพิ่ม 1 object
//
// แต่ละโปรไฟล์:
//   { id, platform, sourceType?, detect(headers)->bool, map }
// - detect(): ดูจาก "ลายเซ็นหัวคอลัมน์" (ไม่ผูกลำดับ) ว่าไฟล์นี้ใช่โปรไฟล์นี้ไหม
// - map: ต่อ target field 1 ตัว = ชื่อคอลัมน์ต้นทาง (string) หรือ resolver fn(row)=>value
// คอลัมน์ที่ไม่รู้จัก/เกินมา จะถูกเก็บทั้งดุ้นใน sourceRaw เสมอ (ไม่มีวันหาย)
//
// ลำดับสำคัญ: เรียงจาก "เฉพาะเจาะจง → กว้าง" — generic fallback อยู่ท้ายสุด
// เพื่อให้ไฟล์เครื่องมือใหม่ที่ยังไม่มีโปรไฟล์ ก็ยัง import ได้โดยไม่เสียข้อมูล

export type RawRow = Record<string, unknown>;
export type FieldSource = string | ((row: RawRow) => unknown);

// target fields (unified) ที่โปรไฟล์ map เข้ามา
export interface FieldMap {
  name?: FieldSource;
  productUrl?: FieldSource; // ลิงก์สินค้า Shopee → platformLinks.shopee
  affiliateUrl?: FieldSource;
  price?: FieldSource;
  salePrice?: FieldSource;
  commissionPct?: FieldSource;
  externalItemId?: FieldSource;
  externalShopId?: FieldSource;
  shopName?: FieldSource;
  rating?: FieldSource;
  soldMonth?: FieldSource;
  soldTotal?: FieldSource;
  stockQty?: FieldSource;
  category?: FieldSource; // ค่าดิบ — จะ set จริงเฉพาะเมื่อ match ProductCategory key
  firstImage?: FieldSource; // productv3/v4: รูปแรก (phase-2 hook — ยังไม่โหลด)
}

export interface MappingProfile {
  id: string;
  platform: string; // shoptool.app | pyptools.io | generic
  sourceType?: string; // subtype เช่น flash_sale | livextra | product_v3v4
  detect(headers: string[]): boolean;
  map: FieldMap;
}

// ผลลัพธ์ที่ map แล้ว 1 แถว (ยังไม่ลง DB)
export interface MappedRow {
  name?: string;
  productUrl?: string;
  affiliateUrl?: string;
  price?: number;
  salePrice?: number;
  commissionPct?: number;
  externalItemId?: string;
  externalShopId?: string;
  shopName?: string;
  rating?: number;
  soldMonth?: number;
  soldTotal?: number;
  stockQty?: number;
  category?: string;
  firstImage?: string;
  sourceRaw: RawRow; // ทุกคอลัมน์ต้นฉบับ (คีย์สะอาด ตัด BOM แล้ว)
}

// ─── helpers (export ไว้ให้ service + test ใช้ซ้ำ) ────────────────────────────

/** ตัด BOM (U+FEFF) หัวสตริง — CSV shoptool เป็น UTF-8 with BOM */
export function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

/** แปลงเป็นตัวเลข: รับทั้ง number และ string เช่น "฿49.00", "1,299", " 4.8 " */
export function parseNumber(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  // ตัด ฿ / คอมมา / ช่องว่าง / ตัวอักษรอื่น เหลือแต่ตัวเลข จุด ลบ
  const s = String(v)
    .replace(/[฿,\s]/g, '')
    .replace(/[^0-9.\-]/g, '');
  if (s === '' || s === '-' || s === '.' || s === '-.') return undefined;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : undefined;
}

/** จำนวนเต็ม (ยอดขาย/สต๊อก) — parse แล้วตัดทศนิยม */
export function parseIntSafe(v: unknown): number | undefined {
  const n = parseNumber(v);
  return n == null ? undefined : Math.trunc(n);
}

/** string ที่ trim แล้ว — คืน undefined ถ้าว่าง */
export function str(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s === '' ? undefined : s;
}

/**
 * ดึง shopId + itemId จากลิงก์ Shopee
 *   shopee.co.th/product/{shopid}/{itemid}
 *   ...-i.{shopid}.{itemid}   (รูปแบบลิงก์เก่า)
 */
export function parseShopeeIds(link: unknown): { shopId?: string; itemId?: string } {
  const s = str(link);
  if (!s) return {};
  const m1 = s.match(/\/product\/(\d+)\/(\d+)/);
  if (m1) return { shopId: m1[1], itemId: m1[2] };
  const m2 = s.match(/-i\.(\d+)\.(\d+)/);
  if (m2) return { shopId: m2[1], itemId: m2[2] };
  return {};
}

/** รูปแรกจากคอลัมน์ images (คั่นด้วย , หรือ ช่องว่าง) */
function firstImageOf(v: unknown): string | undefined {
  const s = str(v);
  if (!s) return undefined;
  const first = s.split(/[,\s]+/).find(Boolean);
  return first ? first.trim() : undefined;
}

// ─── โปรไฟล์: shoptool.app ────────────────────────────────────────────────────
// CSV UTF-8 with BOM, หัวไทย+emoji ~19 คอลัมน์
const SHOPTOOL: MappingProfile = {
  id: 'shoptool',
  platform: 'shoptool.app',
  detect: (h) => h.includes('สินค้า') && h.includes('ลิงก์สินค้า'),
  map: {
    name: 'สินค้า',
    productUrl: 'ลิงก์สินค้า',
    affiliateUrl: 'ลิงก์หน้า Affiliate',
    price: '💵 ราคา',
    salePrice: '💵 ราคา (สูงสุด)',
    commissionPct: '🎁ค่าคอม Extra (%)',
    soldMonth: 'ขาย/เดือน (ชิ้น)',
    soldTotal: 'ขายทั้งหมด (ชิ้น)',
    stockQty: 'สต๊อก',
    shopName: 'ร้าน Mall',
    category: '🛒หมวดหมู่',
    // dedup key: ลิงก์ก่อน แล้วค่อย fallback คอลัมน์ Item ID / Shop ID
    externalItemId: (r) => parseShopeeIds(r['ลิงก์สินค้า']).itemId ?? str(r['Item ID']),
    externalShopId: (r) => parseShopeeIds(r['ลิงก์สินค้า']).shopId ?? str(r['Shop ID']),
  },
};

// ─── โปรไฟล์: pyptools.io — 3 variants ────────────────────────────────────────
// variant A: product_v3v4 (20 คอลัมน์) — v3 กับ v4 หัวคอลัมน์เหมือนกันเป๊ะ ใช้โปรไฟล์เดียว
const PYP_PRODUCT_V3V4: MappingProfile = {
  id: 'pyptools.product_v3v4',
  platform: 'pyptools.io',
  sourceType: 'product_v3v4',
  detect: (h) =>
    h.includes('product_link') &&
    h.includes('itemid') &&
    (h.includes('images') || h.includes('vdo')),
  map: {
    name: 'title',
    productUrl: 'product_link',
    price: 'price',
    salePrice: 'price_max',
    commissionPct: 'seller_commission_rate',
    rating: 'item_rating',
    soldMonth: 'sold_month',
    soldTotal: (r) => str(r['sold_his']) ?? str(r['sold']),
    stockQty: 'stock',
    shopName: 'shop_name',
    firstImage: (r) => firstImageOf(r['images']),
    externalItemId: (r) => str(r['itemid']) ?? parseShopeeIds(r['product_link']).itemId,
    externalShopId: (r) => str(r['shopid']) ?? parseShopeeIds(r['product_link']).shopId,
  },
};

// variant B: livextra (14 คอลัมน์) — มี itemid + item_rating แต่ไม่มี images
const PYP_LIVEXTRA: MappingProfile = {
  id: 'pyptools.livextra',
  platform: 'pyptools.io',
  sourceType: 'livextra',
  detect: (h) =>
    h.includes('product_link') &&
    h.includes('itemid') &&
    h.includes('item_rating') &&
    !h.includes('images') &&
    !h.includes('vdo'),
  map: {
    name: 'title',
    productUrl: 'product_link',
    price: 'price',
    commissionPct: 'seller_commission_rate',
    rating: 'item_rating',
    soldMonth: 'sold_month',
    soldTotal: 'sold_his',
    stockQty: 'stock',
    shopName: 'shop_name',
    externalItemId: (r) => str(r['itemid']) ?? parseShopeeIds(r['product_link']).itemId,
    externalShopId: (r) => str(r['shopid']) ?? parseShopeeIds(r['product_link']).shopId,
  },
};

// variant C: flash_sale (15 คอลัมน์) — ไม่มี itemid, มี comm + sold
const PYP_FLASH_SALE: MappingProfile = {
  id: 'pyptools.flash_sale',
  platform: 'pyptools.io',
  sourceType: 'flash_sale',
  detect: (h) =>
    h.includes('product_link') &&
    h.includes('seller_commission_rate') &&
    !h.includes('itemid') &&
    h.includes('comm') &&
    h.includes('sold'),
  map: {
    name: 'name',
    productUrl: 'product_link',
    price: 'price',
    salePrice: 'price_max',
    commissionPct: (r) => str(r['seller_commission_rate']) ?? str(r['comm']),
    soldMonth: 'sold_month',
    soldTotal: (r) => str(r['sold_his']) ?? str(r['sold']),
    stockQty: 'stock',
    shopName: 'shop_name',
    externalItemId: (r) => parseShopeeIds(r['product_link']).itemId,
    externalShopId: (r) => str(r['shopid']) ?? parseShopeeIds(r['product_link']).shopId,
  },
};

// ─── generic fallback — ไฟล์เครื่องมือใหม่ที่ยังไม่มีโปรไฟล์ ก็ import ได้ไม่เสียข้อมูล ──
// จับ header แบบ fuzzy: name/title/สินค้า → name ; *link*/ลิงก์/url → product url
// ที่เหลือ dump ลง sourceRaw ทั้งหมด
function fuzzyHeader(headers: string[], patterns: RegExp[]): string | undefined {
  for (const re of patterns) {
    const found = headers.find((h) => re.test(h));
    if (found) return found;
  }
  return undefined;
}

function buildGenericProfile(headers: string[]): MappingProfile {
  const nameCol = fuzzyHeader(headers, [/^name$/i, /^title$/i, /สินค้า/, /ชื่อ/, /name/i, /title/i]);
  const linkCol = fuzzyHeader(headers, [/product_?link/i, /ลิงก์สินค้า/, /ลิงก์/, /link/i, /url/i]);
  const priceCol = fuzzyHeader(headers, [/^price$/i, /ราคา/, /price/i]);
  const shopCol = fuzzyHeader(headers, [/shop_?name/i, /ร้าน/, /shop/i]);
  const ratingCol = fuzzyHeader(headers, [/rating/i, /เรตติ้ง|เรต/]);
  return {
    id: 'generic',
    platform: 'generic',
    detect: () => true,
    map: {
      ...(nameCol ? { name: nameCol } : {}),
      ...(linkCol ? { productUrl: linkCol } : {}),
      ...(priceCol ? { price: priceCol } : {}),
      ...(shopCol ? { shopName: shopCol } : {}),
      ...(ratingCol ? { rating: ratingCol } : {}),
      // dedup key: พยายามดึงจากลิงก์ที่ fuzzy เจอ (ถ้าเป็น Shopee)
      ...(linkCol
        ? {
            externalItemId: (r: RawRow) => parseShopeeIds(r[linkCol]).itemId,
            externalShopId: (r: RawRow) => parseShopeeIds(r[linkCol]).shopId,
          }
        : {}),
    },
  };
}

// เรียงเฉพาะเจาะจง → กว้าง (generic ไม่อยู่ในนี้ — สร้าง dynamic เมื่อไม่ match)
export const MAPPING_PROFILES: MappingProfile[] = [
  SHOPTOOL,
  PYP_PRODUCT_V3V4,
  PYP_LIVEXTRA,
  PYP_FLASH_SALE,
];

/** เลือกโปรไฟล์จากหัวคอลัมน์ — ไม่ match ตัวไหน → generic (สร้างจาก header) */
export function detectProfile(headers: string[]): MappingProfile {
  for (const p of MAPPING_PROFILES) {
    if (p.detect(headers)) return p;
  }
  return buildGenericProfile(headers);
}

/** หาโปรไฟล์จาก override {platform, sourceType} ที่ผู้ใช้เลือกเอง (ไม่เจอ → null) */
export function findProfileByOverride(
  platform?: string,
  sourceType?: string,
): MappingProfile | null {
  if (!platform) return null;
  const found = MAPPING_PROFILES.find(
    (p) => p.platform === platform && (sourceType ? p.sourceType === sourceType : true),
  );
  return found ?? null;
}

// อ่านค่าจาก source (ชื่อคอลัมน์ หรือ resolver fn)
function readSource(row: RawRow, src: FieldSource): unknown {
  return typeof src === 'function' ? src(row) : row[src];
}

// จัดกลุ่ม field ตามชนิดค่า เพื่อ coerce ให้ถูก
const FLOAT_FIELDS = ['price', 'salePrice', 'commissionPct', 'rating'] as const;
const INT_FIELDS = ['soldMonth', 'soldTotal', 'stockQty'] as const;
const STRING_FIELDS = [
  'name',
  'productUrl',
  'affiliateUrl',
  'externalItemId',
  'externalShopId',
  'shopName',
  'category',
  'firstImage',
] as const;

/**
 * map 1 แถวดิบ → MappedRow ตามโปรไฟล์
 * sourceRaw = ทุกคอลัมน์ต้นฉบับเสมอ (คีย์สะอาด) — คอลัมน์ที่ไม่ได้ map ก็อยู่ครบ
 */
export function mapRow(profile: MappingProfile, row: RawRow): MappedRow {
  const out: MappedRow = { sourceRaw: { ...row } };
  const m = profile.map;

  for (const f of STRING_FIELDS) {
    const src = m[f];
    if (src != null) {
      const v = str(readSource(row, src));
      if (v != null) (out as unknown as Record<string, unknown>)[f] = v;
    }
  }
  for (const f of FLOAT_FIELDS) {
    const src = m[f];
    if (src != null) {
      const v = parseNumber(readSource(row, src));
      if (v != null) (out as unknown as Record<string, unknown>)[f] = v;
    }
  }
  for (const f of INT_FIELDS) {
    const src = m[f];
    if (src != null) {
      const v = parseIntSafe(readSource(row, src));
      if (v != null) (out as unknown as Record<string, unknown>)[f] = v;
    }
  }

  // productv3/v4: เก็บ "รูปแรก" เป็นโน้ตใน sourceRaw (phase-2: auto-attach) — คอลัมน์ images เดิมยังอยู่ครบ
  if (out.firstImage) out.sourceRaw._firstImage = out.firstImage;

  return out;
}
