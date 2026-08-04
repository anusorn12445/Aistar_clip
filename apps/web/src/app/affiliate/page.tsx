"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import CoverImage from "@/components/CoverImage";
import {
  AFFILIATE_CAMERA_LABEL,
  AFFILIATE_PLATFORMS,
  AffiliateBatchResponse,
  AffiliateContentItem,
  AffiliateProduct,
  AffiliateReviewResponse,
  api,
  getToken,
} from "@/lib/api";
import { ProductCategory, Paged, fmtPrice } from "@/lib/catalog";
import {
  BannedMatch,
  BannedWord,
  fetchActiveBannedWords,
  normalizeCompliancePlatform,
  scanText,
} from "@/lib/banned-words";
import { uploadAsset } from "@/lib/assets";
import { primeEntityThumb } from "@/lib/media";
import { FilterSelect } from "@/components/ui/filter-select";
import { Zap, TriangleAlert, X, CircleCheck, Undo2, Link as LinkIcon, ArrowRight } from "lucide-react";

const ALL = "__all__";

// ผลลัพธ์ import ลิงก์ (POST /products/affiliate-import)
interface AffiliateImportResult {
  total: number;
  created: number;
  needsReview: number;
  duplicates: number;
  failed: number;
  items: {
    url: string;
    ok: boolean;
    productId?: string;
    name?: string;
    platform?: string;
    imageAttached?: boolean;
    needsReview?: boolean;
    duplicate?: boolean;
    reason?: string;
  }[];
}

/** ดึงลิงก์ https จากข้อความที่วาง (แยกด้วยขึ้นบรรทัด/ช่องว่าง) — dedupe คงลำดับ */
function parsePastedUrls(text: string): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const token of text.split(/\s+/)) {
    const t = token.trim();
    if (!t.startsWith("https://") || seen.has(t)) continue;
    seen.add(t);
    urls.push(t);
  }
  return urls;
}

const emptyForm = {
  name: "",
  price: "",
  salePrice: "",
  affiliatePlatform: "shopee",
  affiliateUrl: "",
  commissionPct: "",
  description: "",
};

export default function AffiliatePage() {
  const router = useRouter();

  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [category, setCategory] = useState<string>(ALL);
  const [products, setProducts] = useState<AffiliateProduct[]>([]);
  const [contentByProduct, setContentByProduct] = useState<Record<string, AffiliateContentItem>>({});
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  // 🚫 Banned Words — advisory scan ใต้สคริปต์/แคปชันที่ gen แล้ว (ไม่มี gate ที่หน้านี้)
  const [bannedWords, setBannedWords] = useState<BannedWord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // batch + per-row progress
  const [batching, setBatching] = useState(false);
  const [batchNote, setBatchNote] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // add-product form
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [formCategory, setFormCategory] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // paste-links import (สูงสุด 50 ลิงก์/ครั้ง)
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteCategory, setPasteCategory] = useState<string>("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<AffiliateImportResult | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }, []);

  const loadCategories = useCallback(() => {
    api<ProductCategory[]>("/categories?status=active")
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  const loadData = useCallback(async () => {
    const catQuery = category !== ALL ? `&category=${encodeURIComponent(category)}` : "";
    try {
      const [prods, content] = await Promise.all([
        api<Paged<AffiliateProduct>>(`/products?isAffiliate=1&pageSize=50${catQuery}`),
        api<{ items: AffiliateContentItem[] }>(
          `/ai/affiliate/content${category !== ALL ? `?category=${encodeURIComponent(category)}` : ""}`,
        ),
      ]);
      setProducts(prods.items);
      const map: Record<string, AffiliateContentItem> = {};
      for (const c of content.items) if (c.productId) map[c.productId] = c;
      setContentByProduct(map);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ");
    }
  }, [category]);

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    loadCategories();
    api<{ configured: boolean }>("/ai/affiliate/status")
      .then((s) => setAiConfigured(s.configured))
      .catch(() => setAiConfigured(false));
    fetchActiveBannedWords()
      .then(setBannedWords)
      .catch(() => setBannedWords([])); // API เก่า/ยังไม่ seed → ข้ามการสแกนเงียบ ๆ
  }, [router, loadCategories]);

  useEffect(() => {
    if (!getToken()) return;
    // เรียกผ่าน microtask — setState เกิดใน async callback (เลี่ยง cascading render)
    void Promise.resolve().then(loadData);
  }, [loadData]);

  const readyCount = useMemo(
    () => products.filter((p) => p.hasAffiliateContent || contentByProduct[p.id]).length,
    [products, contentByProduct],
  );

  const catLabel = useMemo(() => {
    const m = new Map(categories.map((c) => [c.key, c.label]));
    return (key: string | null) => (key ? (m.get(key) ?? key) : "—");
  }, [categories]);

  // ── generate one product ──────────────────────────────────
  async function generateOne(productId: string, regenerate = false) {
    if (aiConfigured === false) {
      showToast("ยังไม่ได้ตั้งค่า AI (ANTHROPIC_API_KEY) — ตั้งค่าใน Settings ก่อน");
      return;
    }
    setRowBusy((b) => ({ ...b, [productId]: true }));
    setError(null);
    try {
      const res = await api<AffiliateReviewResponse>("/ai/affiliate/review", {
        method: "POST",
        body: JSON.stringify({ productId, platform: "facebook", regenerate }),
      });
      setContentByProduct((m) => ({ ...m, [productId]: res.item }));
      setProducts((ps) => ps.map((p) => (p.id === productId ? { ...p, hasAffiliateContent: true } : p)));
      setExpanded((e) => ({ ...e, [productId]: true }));
      if (res.warning) showToast(res.warning);
      else showToast(regenerate ? "สร้างใหม่แล้ว" : "สร้างคอนเทนต์แล้ว");
    } catch (err) {
      setError(err instanceof Error ? err.message : "สร้างคอนเทนต์ไม่สำเร็จ");
    } finally {
      setRowBusy((b) => ({ ...b, [productId]: false }));
    }
  }

  // ── batch generate (selected category / all loaded) ───────
  async function generateAll() {
    if (aiConfigured === false) {
      showToast("ยังไม่ได้ตั้งค่า AI (ANTHROPIC_API_KEY) — ตั้งค่าใน Settings ก่อน");
      return;
    }
    const missing = products.filter((p) => !(p.hasAffiliateContent || contentByProduct[p.id]));
    if (missing.length === 0) {
      showToast("ทุกสินค้ามีคอนเทนต์แล้ว");
      return;
    }
    setBatching(true);
    setBatchNote(`กำลังสร้าง ${missing.length} ชิ้น... (อาจใช้เวลาสักครู่)`);
    setError(null);
    try {
      const payload =
        category !== ALL
          ? { categoryKey: category, onlyMissing: true }
          : { productIds: missing.map((p) => p.id), onlyMissing: true };
      const res = await api<AffiliateBatchResponse>("/ai/affiliate/batch", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      await loadData();
      const bits = [`สร้าง ${res.generated} ชิ้น`];
      if (res.skipped) bits.push(`ข้าม ${res.skipped}`);
      if (res.failed) bits.push(`ล้มเหลว ${res.failed}`);
      showToast(bits.join(" · "));
      setBatchNote(res.truncated ? (res.truncatedNote ?? null) : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "สร้างทั้งหมดไม่สำเร็จ");
      setBatchNote(null);
    } finally {
      setBatching(false);
    }
  }

  // ── add product ───────────────────────────────────────────
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const created = await api<AffiliateProduct>("/products", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          category: formCategory || undefined,
          price: form.price ? parseFloat(form.price) : undefined,
          salePrice: form.salePrice ? parseFloat(form.salePrice) : undefined,
          description: form.description || undefined,
          isAffiliate: true,
          affiliatePlatform: form.affiliatePlatform,
          affiliateUrl: form.affiliateUrl || undefined,
          commissionPct: form.commissionPct ? parseFloat(form.commissionPct) : undefined,
        }),
      });
      // อัปโหลดรูปถ้าเลือกไว้
      const file = pendingImage;
      if (file) {
        try {
          const asset = await uploadAsset(file, {
            assetType: "product_image",
            entityType: "product",
            entityId: created.id,
            linkRole: "cover",
          });
          primeEntityThumb("product", created.id, asset.id);
        } catch {
          // รูปพลาดไม่เป็นไร สินค้าถูกสร้างแล้ว
        }
      }
      setShowForm(false);
      setForm({ ...emptyForm });
      setPendingImage(null);
      showToast("เพิ่มสินค้าแล้ว");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "เพิ่มสินค้าไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  const [pendingImage, setPendingImage] = useState<File | null>(null);

  // ── attach media to a generated content item ──────────────
  const [attachBusy, setAttachBusy] = useState<Record<string, boolean>>({});
  // วางลิงก์หลายตัว → ระบบดึงชื่อ/รูป/คำอธิบายสร้างสินค้าให้เอง
  async function handleImportLinks() {
    const urls = parsePastedUrls(pasteText).slice(0, 50);
    if (urls.length === 0) {
      setError("ไม่พบลิงก์ https ในข้อความที่วาง");
      return;
    }
    setImporting(true);
    setImportResult(null);
    setError(null);
    try {
      const res = await api<AffiliateImportResult>("/products/affiliate-import", {
        method: "POST",
        body: JSON.stringify({
          urls,
          ...(pasteCategory ? { categoryKey: pasteCategory } : {}),
        }),
      });
      setImportResult(res);
      showToast(`เพิ่มสินค้า ${res.created} รายการ${res.failed ? ` · พลาด ${res.failed}` : ""}`);
      setPasteText("");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "นำเข้าลิงก์ไม่สำเร็จ");
    } finally {
      setImporting(false);
    }
  }

  async function attachMedia(content: AffiliateContentItem, file: File | undefined) {
    if (!file) return;
    setAttachBusy((b) => ({ ...b, [content.id]: true }));
    try {
      await uploadAsset(file, {
        assetType: file.type.startsWith("video/") ? "content_clip" : "content_image",
        entityType: "content",
        entityId: content.id,
        linkRole: "deliverable",
      });
      showToast("แนบไฟล์แล้ว");
    } catch (err) {
      setError(err instanceof Error ? err.message : "แนบไฟล์ไม่สำเร็จ");
    } finally {
      setAttachBusy((b) => ({ ...b, [content.id]: false }));
    }
  }

  function copyKit(content: AffiliateContentItem, url: string | null) {
    const parts = [content.caption ?? "", (content.hashtags ?? []).join(" ")];
    if (url) parts.push(url);
    const text = parts.filter(Boolean).join("\n\n");
    navigator.clipboard
      .writeText(text)
      .then(() => showToast("ก๊อปแคปชั่น + แฮชแท็ก + ลิงก์แล้ว"))
      .catch(() => showToast("ก๊อปไม่สำเร็จ — เบราว์เซอร์ไม่รองรับ"));
  }

  const inputCls =
    "rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none focus:border-amber-400";

  return (
    <AppShell
      title="Affiliate Content"
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setPasteCategory(category !== ALL ? category : "");
              setShowPaste(true);
              setShowForm(false);
            }}
            className="rounded-lg border border-amber-400/50 px-3 py-1.5 text-sm text-amber-300 hover:bg-amber-400/10"
          >
            วางลิงก์ (สูงสุด 50)
          </button>
          <button
            onClick={() => {
              setFormCategory(category !== ALL ? category : "");
              setShowForm(true);
              setShowPaste(false);
            }}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            + เพิ่มสินค้า
          </button>
          <button
            onClick={generateAll}
            disabled={batching || products.length === 0}
            className="rounded-lg bg-amber-400 px-4 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
          >
            {batching ? "กำลังสร้าง..." : "สร้างคอนเทนต์ทั้งหมด"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* header: category + counts */}
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-3">
          <FilterSelect
            value={category === ALL ? "" : category}
            onChange={(v) => setCategory(v || ALL)}
            options={[
              { value: "", label: "ทุกหมวด" },
              ...categories.map((c) => ({ value: c.key, label: c.label })),
            ]}
          />
          <span className="text-sm text-zinc-400">
            <span className="font-semibold text-zinc-100">{products.length}</span> สินค้า ·{" "}
            <span className="font-semibold text-emerald-300">{readyCount}</span> พร้อมโพสต์
          </span>
          {aiConfigured === false && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-900/60 px-2.5 py-1 text-xs text-red-200">
              <TriangleAlert className="size-3.5" /> ยังไม่ได้ตั้งค่า AI — ตั้ง ANTHROPIC_API_KEY ใน Settings
            </span>
          )}
          {batchNote && (
            <span className="rounded-full bg-amber-900/50 px-2.5 py-1 text-xs text-amber-200">
              {batchNote}
            </span>
          )}
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        {/* paste-links import */}
        {showPaste && (
          <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-amber-300">
                วางลิงก์ affiliate — ระบบดึงชื่อ/รูป/รายละเอียดให้เอง
              </p>
              <button
                type="button"
                onClick={() => {
                  setShowPaste(false);
                  setImportResult(null);
                }}
                className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-300"
              >
                <X className="size-4" /> ปิด
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <FilterSelect
                value={pasteCategory}
                onChange={setPasteCategory}
                options={[
                  { value: "", label: "— หมวดสินค้า (ใช้ทั้งชุด) —" },
                  ...categories.map((c) => ({ value: c.key, label: c.label })),
                ]}
              />
              <span className="text-xs text-zinc-500">
                พบ{" "}
                <span className="font-semibold text-amber-300">
                  {Math.min(parsePastedUrls(pasteText).length, 50)}
                </span>{" "}
                ลิงก์ (สูงสุด 50/ครั้ง{parsePastedUrls(pasteText).length > 50 ? " — ตัดส่วนเกินทิ้ง" : ""})
              </span>
            </div>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={6}
              placeholder={"วางลิงก์ได้เลย — 1 บรรทัดต่อ 1 ลิงก์ (หรือคั่นด้วยช่องว่าง)\nhttps://s.shopee.co.th/...\nhttps://s.lazada.co.th/...\nhttps://vt.tiktok.com/..."}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 p-3 font-mono text-xs text-zinc-200 outline-none focus:border-amber-400"
            />
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => void handleImportLinks()}
                disabled={importing || parsePastedUrls(pasteText).length === 0}
                className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
              >
                {importing
                  ? `กำลังดึงข้อมูล ${Math.min(parsePastedUrls(pasteText).length, 50)} ลิงก์...`
                  : "นำเข้าสินค้า"}
              </button>
              <span className="text-[11px] text-zinc-600">
                ลิงก์ที่ดึงข้อมูลไม่ได้ (ติดกันบอท/ต้อง login) จะถูกสร้างไว้พร้อมลิงก์ แล้วติดป้าย
                &ldquo;รอเติมข้อมูล&rdquo; ให้แก้ทีหลัง
              </span>
            </div>

            {importResult && (
              <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
                <p className="text-xs text-zinc-300">
                  <CircleCheck className="inline size-3.5" /> เพิ่มแล้ว{" "}
                  <span className="font-semibold text-emerald-300">{importResult.created}</span>
                  {importResult.needsReview > 0 && (
                    <>
                      {" "}
                      · <TriangleAlert className="inline size-3.5" /> รอเติมข้อมูล{" "}
                      <span className="font-semibold text-amber-300">{importResult.needsReview}</span>
                    </>
                  )}
                  {importResult.duplicates > 0 && <> · ซ้ำ (ข้าม) {importResult.duplicates}</>}
                  {importResult.failed > 0 && (
                    <>
                      {" "}
                      · <X className="inline size-3.5" /> พลาด <span className="font-semibold text-red-300">{importResult.failed}</span>
                    </>
                  )}
                </p>
                <div className="max-h-48 space-y-1 overflow-auto">
                  {importResult.items.map((it) => (
                    <div key={it.url} className="flex items-center gap-2 text-[11px]">
                      <span>
                        {!it.ok ? <X className="size-4" /> : it.duplicate ? <Undo2 className="size-4" /> : it.needsReview ? <TriangleAlert className="size-4" /> : <CircleCheck className="size-4" />}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-zinc-300">
                        {it.name ?? it.url}
                      </span>
                      {it.reason && <span className="shrink-0 text-zinc-600">{it.reason}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* add-product form */}
        {showForm && (
          <form onSubmit={handleCreate} className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-amber-300">เพิ่มสินค้า Affiliate</p>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-300"
              >
                <X className="size-4" /> ปิด
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="ชื่อสินค้า *"
                className={inputCls}
              />
              <FilterSelect
                value={formCategory}
                onChange={setFormCategory}
                options={[
                  { value: "", label: "— หมวดสินค้า —" },
                  ...categories.map((c) => ({ value: c.key, label: c.label })),
                ]}
              />
            </div>
            <div className="grid grid-cols-4 gap-3">
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                placeholder="ราคาปกติ (฿)"
                className={inputCls}
              />
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.salePrice}
                onChange={(e) => setForm({ ...form, salePrice: e.target.value })}
                placeholder="ราคาโปร (฿)"
                className={inputCls}
              />
              <FilterSelect
                value={form.affiliatePlatform}
                onChange={(v) => setForm({ ...form, affiliatePlatform: v })}
                options={AFFILIATE_PLATFORMS.map((p) => ({ value: p.value, label: p.label }))}
              />
              <input
                type="number"
                min={0}
                max={100}
                step="0.1"
                value={form.commissionPct}
                onChange={(e) => setForm({ ...form, commissionPct: e.target.value })}
                placeholder="ค่าคอม %"
                className={inputCls}
              />
            </div>
            <input
              type="url"
              value={form.affiliateUrl}
              onChange={(e) => setForm({ ...form, affiliateUrl: e.target.value })}
              placeholder="ลิงก์ affiliate (https://...)"
              className={`${inputCls} w-full`}
            />
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="รายละเอียดสินค้า (ช่วยให้ AI เขียนรีวิวได้ตรงขึ้น)"
              rows={2}
              className={`${inputCls} w-full`}
            />
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800">
              {pendingImage ? pendingImage.name : "เลือกรูปสินค้า (ไม่บังคับ)"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setPendingImage(e.target.files?.[0] ?? null)}
              />
            </label>
            <div className="pt-1">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
              >
                {saving ? "กำลังบันทึก..." : "เพิ่มสินค้า"}
              </button>
            </div>
          </form>
        )}

        {/* product rows */}
        <div className="space-y-3">
          {products.map((p) => {
            const content = contentByProduct[p.id];
            const plat = AFFILIATE_PLATFORMS.find((x) => x.value === p.affiliatePlatform);
            const ready = p.hasAffiliateContent || Boolean(content);
            const busy = rowBusy[p.id];
            const isOpen = expanded[p.id];
            return (
              <div key={p.id} className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
                <div className="flex items-center gap-4 p-3">
                  <CoverImage
                    assetId={p.imageAssetId}
                    entityType="product"
                    entityId={p.id}
                    name={p.name}
                    aspect="aspect-square"
                    className="w-16 shrink-0 rounded-lg"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-100" title={p.name}>
                      {p.name}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                      <span className="font-mono text-zinc-500">{p.displayCode}</span>
                      {plat && (
                        <span className={`rounded-full px-2 py-0.5 ${plat.cls}`}>{plat.label}</span>
                      )}
                      {p.category && (
                        <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-zinc-400">
                          {catLabel(p.category)}
                        </span>
                      )}
                      {p.commissionPct != null && (
                        <span className="rounded-full bg-violet-900/60 px-2 py-0.5 text-violet-200">
                          คอม {p.commissionPct}%
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    {p.salePrice != null && p.salePrice !== "" ? (
                      <p className="text-base font-bold text-emerald-300">฿{fmtPrice(p.salePrice)}</p>
                    ) : (
                      <p className="text-base font-bold text-amber-300">฿{fmtPrice(p.price)}</p>
                    )}
                    <span
                      className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] ${
                        ready ? "bg-emerald-900 text-emerald-200" : "bg-zinc-800 text-zinc-400"
                      }`}
                    >
                      {ready ? "พร้อมโพสต์" : "รอสร้าง"}
                    </span>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1.5">
                    {ready ? (
                      <button
                        onClick={() => setExpanded((e) => ({ ...e, [p.id]: !isOpen }))}
                        className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800"
                      >
                        {isOpen ? "ซ่อนคอนเทนต์" : "ดูคอนเทนต์"}
                      </button>
                    ) : (
                      <button
                        onClick={() => generateOne(p.id)}
                        disabled={busy}
                        className="rounded-lg bg-amber-400/90 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
                      >
                        {busy ? "กำลังสร้าง..." : "สร้างคอนเทนต์"}
                      </button>
                    )}
                  </div>
                </div>

                {/* generated content card */}
                {isOpen && content && (
                  <ContentKit
                    content={content}
                    affiliateUrl={p.affiliateUrl}
                    busy={busy}
                    attachBusy={Boolean(attachBusy[content.id])}
                    bannedWords={bannedWords}
                    onCopy={() => copyKit(content, p.affiliateUrl)}
                    onRegenerate={() => generateOne(p.id, true)}
                    onAttach={(f) => attachMedia(content, f)}
                  />
                )}
              </div>
            );
          })}
        </div>

        {products.length === 0 && (
          <div className="rounded-2xl border border-dashed border-zinc-800 px-4 py-14 text-center text-zinc-500">
            <p className="text-3xl"><Zap className="inline size-8" /></p>
            <p className="mt-2 text-sm">
              ยังไม่มีสินค้า affiliate ในหมวดนี้ — กด “+ เพิ่มสินค้า” แล้วกด “<Zap className="inline size-3.5" /> สร้างคอนเทนต์ทั้งหมด”
            </p>
          </div>
        )}
      </div>

      {/* toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-100 shadow-xl">
          {toast}
        </div>
      )}
    </AppShell>
  );
}

// ── 🚫 advisory scan chips — เตือนคำต้องห้ามใต้บล็อกที่ gen แล้ว (หน้านี้ไม่มี gate — แก้ด้วยการ 🔄 สร้างใหม่/แก้เอง) ──
function AdvisoryBannedChips({ matches }: { matches: BannedMatch[] }) {
  if (matches.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {matches.map((m) => (
        <span
          key={m.term}
          className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] ${
            m.severity === "ban"
              ? "bg-red-950/60 text-red-200 ring-1 ring-red-800"
              : "bg-amber-950/50 text-amber-200 ring-1 ring-amber-800/60"
          }`}
        >
          {m.severity === "ban" ? <span className="size-2 rounded-full bg-red-500" /> : <span className="size-2 rounded-full bg-amber-500" />} &ldquo;{m.term}&rdquo;
          {m.replacement && <span className="inline-flex items-center gap-1 text-zinc-400"><ArrowRight className="size-3" /> แนะนำ: {m.replacement}</span>}
        </span>
      ))}
    </div>
  );
}

// ── generated content kit (script + shots + caption + hashtags) ──
function ContentKit({
  content,
  affiliateUrl,
  busy,
  attachBusy,
  bannedWords,
  onCopy,
  onRegenerate,
  onAttach,
}: {
  content: AffiliateContentItem;
  affiliateUrl: string | null;
  busy: boolean;
  attachBusy: boolean;
  bannedWords: BannedWord[];
  onCopy: () => void;
  onRegenerate: () => void;
  onAttach: (file: File | undefined) => void;
}) {
  const script = content.scriptJson;
  // scan สคริปต์รวม (hook/body/cta + บทพูดใน shot) และแคปชัน+แฮชแท็ก — advisory เท่านั้น
  const scanPlatform = normalizeCompliancePlatform(content.platform);
  const scriptText = script
    ? [script.hook, script.body, script.cta, ...(script.shots ?? []).map((s) => s.dialogue ?? "")]
        .filter(Boolean)
        .join("\n")
    : "";
  const scriptMatches = scanText(scriptText, bannedWords, scanPlatform);
  const captionMatches = scanText(
    [content.caption ?? "", (content.hashtags ?? []).join(" ")].join("\n"),
    bannedWords,
    scanPlatform,
  );
  return (
    <div className="space-y-4 border-t border-zinc-800 bg-zinc-950/40 p-4">
      <div className="grid gap-4 lg:grid-cols-2">
        {/* script */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">สคริปต์รีวิว</p>
          {script ? (
            <div className="space-y-2 text-sm">
              <p>
                <span className="text-zinc-500">Hook: </span>
                <span className="text-zinc-100">{script.hook}</span>
              </p>
              <p>
                <span className="text-zinc-500">Body: </span>
                <span className="text-zinc-200">{script.body}</span>
              </p>
              <p>
                <span className="text-zinc-500">CTA: </span>
                <span className="text-zinc-100">{script.cta}</span>
              </p>
            </div>
          ) : (
            <p className="text-sm text-zinc-500">—</p>
          )}
          <AdvisoryBannedChips matches={scriptMatches} />

          {/* shot list */}
          {script?.shots && script.shots.length > 0 && (
            <div className="mt-2 space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">
                Shot list ({script.shots.length})
              </p>
              <ol className="space-y-1.5">
                {script.shots.map((s, i) => (
                  <li key={i} className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs">
                    <span className="mr-2 font-mono text-amber-400">#{i + 1}</span>
                    <span className="text-zinc-300">{s.scene}</span>
                    <span className="mx-1.5 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
                      {AFFILIATE_CAMERA_LABEL[s.camera] ?? s.camera}
                    </span>
                    <span className="text-zinc-400">{s.action}</span>
                    {s.dialogue ? <span className="text-zinc-500"> — “{s.dialogue}”</span> : null}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>

        {/* caption + hashtags */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">
            แคปชั่นพร้อมโพสต์
          </p>
          <p className="whitespace-pre-wrap rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100">
            {content.caption}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {(content.hashtags ?? []).map((h) => (
              <span key={h} className="rounded-full bg-sky-900/60 px-2 py-0.5 text-xs text-sky-200">
                {h}
              </span>
            ))}
          </div>
          <AdvisoryBannedChips matches={captionMatches} />
        </div>
      </div>

      {/* actions */}
      <div className="flex flex-wrap items-center gap-2 border-t border-zinc-800 pt-3">
        <button
          onClick={onCopy}
          className="rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-amber-300"
        >
          ก๊อปแคปชั่น+แฮชแท็ก
        </button>
        {affiliateUrl && (
          <a
            href={affiliateUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800"
          >
            <LinkIcon className="size-3.5" /> เปิดลิงก์ affiliate
          </a>
        )}
        <label className="cursor-pointer rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800">
          {attachBusy ? "กำลังแนบ..." : "แนบคลิป/รูป"}
          <input
            type="file"
            accept="image/*,video/*"
            className="hidden"
            disabled={attachBusy}
            onChange={(e) => {
              onAttach(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        <button
          onClick={onRegenerate}
          disabled={busy}
          className="ml-auto rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
        >
          {busy ? "..." : "สร้างใหม่"}
        </button>
      </div>
    </div>
  );
}
