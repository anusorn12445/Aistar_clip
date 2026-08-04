// AISTAR → Flow — Shopee product scraper (รันในหน้า shopee.co.th ที่ผู้ใช้ล็อกอินอยู่)
// v1.4: อ่านผ่าน API ภายในของ Shopee (ตัวเดียวกับที่หน้าเว็บใช้เอง — เรียกจาก session ผู้ใช้จริง)
//   → ได้ชื่อ/รูปครบทุกใบ/ราคา/ชื่อร้านจริง/รีวิวพร้อมดาว แม่นกว่า DOM มาก
// fallback 2 ชั้น: JSON-LD/og → DOM (เผื่อ Shopee เปลี่ยน API)

(() => {
  if (window.__aistarShopee145) return;
  window.__aistarShopee145 = true;

  const IMG_BASE = "https://down-th.img.susercontent.com/file/";
  // ข้อความ UI ของ Shopee ที่ห้ามเผลอเก็บเป็นรีวิว (บั๊กที่ CEO เจอ: ได้ "รายงานความไม่เหมาะสม")
  const UI_BLACKLIST = [
    "รายงานความไม่เหมาะสม", "ตอบกลับ", "มีประโยชน์", "แชทเลย", "เพิ่มไปยังรถเข็น",
    "ซื้อสินค้านี้", "ดูร้านค้า", "ติดตาม", "แชร์", "รายงาน",
  ];

  function parseIds() {
    // รองรับทั้ง /product/<shopid>/<itemid> และ /ชื่อสินค้า-i.<shopid>.<itemid>
    const m1 = location.pathname.match(/\/product\/(\d+)\/(\d+)/);
    if (m1) return { shopid: m1[1], itemid: m1[2] };
    const m2 = location.pathname.match(/-i\.(\d+)\.(\d+)/);
    if (m2) return { shopid: m2[1], itemid: m2[2] };
    return null;
  }

  async function getJson(url) {
    const r = await fetch(url, { credentials: "include", headers: { "x-api-source": "pc" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }

  function text(el) {
    return (el?.textContent ?? "").replace(/\s+/g, " ").trim();
  }

  // ── เสริมด้วย API ที่ "ปลอดภัย" เท่านั้น ─────────────────────────────
  // เทสต์กับหน้าจริง (19 ก.ค. 2026): get_ratings + get_shop_base ผ่านฉลุย
  // แต่ /api/v4/item/get โดนด่านกันบอท (เด้ง captcha scene=crawler_item) — ห้ามเรียกเด็ดขาด
  // ข้อมูลสินค้า (ชื่อ/รูป/ราคา/รายละเอียด) อ่านจากหน้าที่ render แล้วแทน
  async function fetchShopName(ids) {
    try {
      const shop = (await getJson(`/api/v4/shop/get_shop_base?shopid=${ids.shopid}`)).data;
      return shop?.name ?? shop?.account?.username ?? null;
    } catch {
      return null;
    }
  }

  async function fetchReviews(ids) {
    try {
      const rr = (await getJson(
        `/api/v4/item/get_ratings?itemid=${ids.itemid}&shopid=${ids.shopid}&limit=30&offset=0&type=5&filter=1&flag=1`,
      )).data;
      return (rr?.ratings ?? [])
        .map((r) => ({ stars: r.rating_star ?? 5, text: (r.comment ?? "").trim() }))
        .filter((r) => r.text.length >= 10);
    } catch {
      return [];
    }
  }

  // ── ชั้นที่ 2: JSON-LD / og / DOM ───────────────────────────────────────
  function readJsonLd() {
    const out = { products: [], breadcrumbs: [] };
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const data = JSON.parse(s.textContent);
        const list = Array.isArray(data) ? data : [data];
        for (const d of list) {
          if (!d) continue;
          const t = Array.isArray(d["@type"]) ? d["@type"] : [d["@type"]];
          if (t.includes("Product")) out.products.push(d);
          if (t.includes("BreadcrumbList")) out.breadcrumbs.push(d);
        }
      } catch { /* ข้ามก้อนที่ไม่ใช่ JSON */ }
    }
    return out;
  }

  function readCategoryPath(breadcrumbs, productName) {
    let names = [];
    const bc = breadcrumbs[0];
    if (bc?.itemListElement?.length) {
      names = [...bc.itemListElement]
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map((el) => el.name ?? el.item?.name ?? "")
        .filter(Boolean);
    }
    if (!names.length) {
      names = [...document.querySelectorAll('[class*="breadcrumb"] a')].map((a) => text(a)).filter(Boolean);
    }
    return names.filter((n) => {
      const low = n.trim().toLowerCase();
      if (low === "shopee" || low === "shopee thailand") return false;
      if (productName && n.trim() === productName.trim()) return false;
      return true;
    });
  }

  // รูปจาก DOM (เทสต์กับหน้าจริง): แกลเลอรีสินค้า = โซนรอบรูปใหญ่แรก (รูปหลัก 450px + thumb มุมอื่น 82px)
  // + รูปรายละเอียดสินค้า (กว้าง ≥600px) — ตัดการ์ดสินค้าแนะนำ/ไอคอน/avatar/รูปในรีวิว
  function scrapeImagesDom() {
    const seen = new Set();
    const cands = [];
    for (const img of document.querySelectorAll("img")) {
      const src = img.currentSrc || img.src || "";
      if (!src.includes("susercontent.com/file/")) continue;
      if (img.closest('[class*="rating"], [class*="review"]')) continue;
      if (img.closest('a[href*="-i."]')) continue; // การ์ดลิงก์ไปสินค้าอื่น
      const r = img.getBoundingClientRect();
      if (r.width < 60 || r.height < 60) continue; // ไอคอนจิ๋ว
      const clean = src.split("@")[0].replace(/_tn$/, "");
      if (seen.has(clean)) continue;
      seen.add(clean);
      cands.push({ url: clean, y: r.y + window.scrollY, w: r.width });
    }
    const firstBig = cands.find((c) => c.w >= 300);
    const gallery = firstBig ? cands.filter((c) => Math.abs(c.y - firstBig.y) <= 800) : cands.slice(0, 6);
    const detail = cands.filter((c) => c.w >= 600 && !gallery.includes(c));
    return [...gallery, ...detail].slice(0, 12).map((c) => c.url);
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // วิธี CEO (เทสต์กับหน้าจริง 19 ก.ค. 2026): กดแท็บ "5 ดาว" ในส่วนรีวิว → ดึงเฉพาะที่แสดง
  // โครงจริง: .product-rating-overview__filter (แท็บ) / .shopee-product-comment-list > * (รีวิวรายอัน)
  // ดาว = จำนวน svg[class*="solid"] ในบล็อก
  async function scrapeFiveStarReviews(maxCount) {
    const region = document.querySelector(".product-ratings, [class*=\"product-rating\"]");
    region?.scrollIntoView({ block: "center" });
    await sleep(600);
    const tab5 = [...document.querySelectorAll(".product-rating-overview__filter")].find((e) =>
      (e.textContent || "").trim().startsWith("5 ดาว"),
    );
    let clicked = false;
    if (tab5) {
      tab5.click();
      clicked = true;
      await sleep(1800);
    }
    const list = document.querySelector(".shopee-product-comment-list");
    const blocks = list ? [...list.children] : [];
    const reviews = [];
    for (const b of blocks) {
      const stars = b.querySelectorAll('svg[class*="solid"]').length;
      let body = "";
      for (const el of b.querySelectorAll("div, span, p")) {
        if (el.children.length > 0) continue;
        const t = text(el);
        if (t.length <= body.length) continue;
        if (UI_BLACKLIST.some((u) => t.includes(u) && t.length < 60)) continue;
        if (/^\d{4}-\d{2}-\d{2}/.test(t)) continue; // วันที่
        if (/^[\w.]*\*+[\w.]*$/.test(t)) continue; // ชื่อผู้ใช้ปกปิด a****b
        body = t;
      }
      if (body.length >= 10) {
        reviews.push({ stars: stars >= 1 && stars <= 5 ? stars : clicked ? 5 : null, text: body });
      }
      if (reviews.length >= maxCount) break;
    }
    return reviews;
  }

  function scrapeDomFallback() {
    const { products, breadcrumbs } = readJsonLd();
    const ld = products[0] ?? {};
    const og = (p) => document.querySelector(`meta[property="${p}"]`)?.content ?? null;

    const name = ld.name ?? og("og:title") ?? document.title.replace(/\|.*$/, "").trim();
    const description =
      ld.description ?? document.querySelector('meta[name="description"]')?.content ?? "";
    let images = scrapeImagesDom();
    if (!images.length) {
      if (Array.isArray(ld.image)) images = ld.image;
      else if (typeof ld.image === "string") images = [ld.image];
      if (!images.length && og("og:image")) images = [og("og:image")];
    }
    images = images.filter((u) => typeof u === "string" && u.startsWith("http")).slice(0, 12);

    const offers = Array.isArray(ld.offers) ? ld.offers[0] : ld.offers;
    const price = offers?.price != null ? Number(offers.price) : null;
    const rating = ld.aggregateRating?.ratingValue != null ? Number(ld.aggregateRating.ratingValue) : null;
    const ratingCount = ld.aggregateRating?.ratingCount != null ? Number(ld.aggregateRating.ratingCount) : null;

    return {
      ok: Boolean(name),
      source: "dom",
      platform: "shopee",
      url: location.href.split("?")[0],
      name,
      description: String(description).slice(0, 8000),
      price: Number.isFinite(price) ? price : null,
      rating,
      ratingCount,
      soldCount: null,
      // ชื่อร้าน: เอาเฉพาะ JSON-LD brand — selector DOM แบบเดิมเคยไปคว้าชื่อ user ที่ล็อกอินมาแทน
      shopName: ld.brand?.name ?? null,
      images,
      categoryPath: readCategoryPath(breadcrumbs, name),
      reviews: [],
    };
  }

  async function scrapeShopeeProduct() {
    const base = scrapeDomFallback();
    base.reviews = await scrapeFiveStarReviews(30); // วิธี CEO: กดแท็บ 5 ดาวแล้วดึงที่แสดง
    const ids = parseIds();
    if (ids) {
      const [shopName, apiReviews] = await Promise.all([fetchShopName(ids), fetchReviews(ids)]);
      if (shopName) base.shopName = shopName;
      // API (5 ดาวเช่นกัน) เป็นตัวเติมให้ได้เยอะขึ้น — ไม่ซ้ำกับที่ดึงจากหน้า
      if (apiReviews.length) {
        const seen = new Set(base.reviews.map((r) => r.text));
        for (const r of apiReviews) {
          if (!seen.has(r.text)) {
            base.reviews.push(r);
            seen.add(r.text);
          }
        }
      }
      base.source = shopName || apiReviews.length ? "dom+api" : "dom";
    }
    // เอา ~15 รายการแรก ติ๊กให้หมดที่ฝั่งแผง (CEO ยกเลิกกฎตัดคำว่า "ส่ง" แล้ว — 19 ก.ค. 2026)
    base.reviews = base.reviews.slice(0, 15);
    return base;
  }

  if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg?.type === "PING_SHOPEE_V2") {
        sendResponse({ ok: true });
        return false;
      }
      if (msg?.type === "SCRAPE_PRODUCT_V2") {
        scrapeShopeeProduct()
          .then((r) => sendResponse(r))
          .catch((e) => sendResponse({ ok: false, error: String(e) }));
        return true; // async response
      }
      return false;
    });
  }

  // เผื่อใช้ทดสอบนอก extension (harness)
  window.__aistarScrapeShopee = scrapeShopeeProduct;
})();
