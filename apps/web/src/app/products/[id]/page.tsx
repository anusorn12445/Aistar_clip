"use client";

// 🛍️ หน้ารายละเอียดสินค้า — CEO: "เข้าไปดูแล้วข้อมูลต้องแสดงเลย ไม่ต้องกดดูตรง icon"
// รวมทุกอย่างในหน้าเดียว: ข้อมูลสินค้า + Review Brief (แสดงเปิด) + แกลเลอรีรูป + รีวิวลูกค้า 5★
// แก้ไขได้ในที่: Brief กดแก้ inline / รูปเปิด modal จัดการเดิม / ข้อมูลหลักไปฟอร์มแก้ไขที่หน้า list

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import ProductBriefEditor from "@/components/ProductBriefEditor";
import ReviewBriefModal from "@/app/products/ReviewBriefModal";
import { api, getToken, CustomerFeedback, fetchProductTopReviews, deleteFeedback } from "@/lib/api";
import {
  CLAIM_RISK,
  PRODUCT_STATUS,
  Product,
  ProductCategory,
  ReviewBrief,
  hasReviewBrief,
} from "@/lib/catalog";
import { Asset, fetchAssetObjectUrl, fetchEntityImageAssets } from "@/lib/assets";
import {
  ArrowLeft,
  Check,
  Clapperboard,
  FileText,
  Film,
  Image as ImageIcon,
  Link as LinkIcon,
  Loader2,
  MessageSquare,
  Pencil,
  ShoppingBag,
  Sparkles,
  Star,
  Tag,
  Target,
  Trash2,
  TriangleAlert,
  Wallet,
} from "lucide-react";

// 🧩 Product Sheet — AI แตกสินค้าเป็นส่วนประกอบ+สถานะ พร้อม prompt EN ต่อชิ้น (ก๊อปเข้า Flow ได้เลย)
interface ProductSheetPart { nameTh: string; nameEn: string; promptEn: string }
interface ProductSheetState { nameTh: string; promptEn: string }
interface ProductSheet { productType: string; bindingEn: string; parts: ProductSheetPart[]; states: ProductSheetState[] }

export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [product, setProduct] = useState<Product | null>(null);
  const [catLabel, setCatLabel] = useState<string | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [reviews, setReviews] = useState<CustomerFeedback[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [editBrief, setEditBrief] = useState(false);
  const [showGalleryModal, setShowGalleryModal] = useState(false);

  // 🧩 Product Sheet state
  const [sheet, setSheet] = useState<ProductSheet | null>(null);
  const [sheetBusy, setSheetBusy] = useState(false);
  const [sheetMsg, setSheetMsg] = useState<string | null>(null);
  const [copiedSheet, setCopiedSheet] = useState<string | null>(null);

  useEffect(() => {
    api<{ sheet: ProductSheet | null }>(`/products/${id}/sheet`)
      .then((r) => setSheet(r.sheet))
      .catch(() => {});
  }, [id]);

  async function analyzeSheet() {
    const ids = assets.slice(0, 4).map((a) => a.id);
    if (ids.length === 0) {
      setSheetMsg("⚠ ต้องมีรูปสินค้าในคลังก่อน — เพิ่มรูปแล้วค่อยกดวิเคราะห์");
      return;
    }
    setSheetBusy(true);
    setSheetMsg(null);
    try {
      const res = await api<{ sheet: ProductSheet }>(`/products/${id}/sheet/analyze`, {
        method: "POST",
        body: JSON.stringify({ assetIds: ids }),
      });
      setSheet(res.sheet);
      setSheetMsg(`✨ วิเคราะห์จากรูป ${ids.length} รูปแล้ว — บันทึกให้อัตโนมัติ กดวิเคราะห์ใหม่ทับได้ตลอด`);
    } catch (e) {
      setSheetMsg("⚠ " + (e instanceof Error ? e.message : "วิเคราะห์ไม่สำเร็จ"));
    } finally {
      setSheetBusy(false);
    }
  }

  function copySheetText(key: string, text: string) {
    void navigator.clipboard.writeText(text);
    setCopiedSheet(key);
    setTimeout(() => setCopiedSheet((k) => (k === key ? null : k)), 1500);
  }

  function fullSheetText(s: ProductSheet): string {
    return [
      `PRODUCT BINDING — ${s.productType}`,
      s.bindingEn,
      "",
      "PARTS:",
      ...s.parts.map((pt) => `- ${pt.nameEn}: ${pt.promptEn}`),
      "",
      "STATES:",
      ...s.states.map((st) => `- ${st.nameTh}: ${st.promptEn}`),
    ].join("\n");
  }

  const reload = useCallback(() => {
    api<Product>(`/products/${id}`)
      .then(setProduct)
      .catch((e) => setError(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"));
    fetchEntityImageAssets("product", id)
      .then(setAssets)
      .catch(() => setAssets([]));
    fetchProductTopReviews(id)
      .then((r) => setReviews(r.items ?? []))
      .catch(() => setReviews([]));
  }, [id]);

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    reload();
  }, [router, reload]);

  // ป้ายหมวด: key → ชื่อไทย
  useEffect(() => {
    if (!product?.category) {
      setCatLabel(null);
      return;
    }
    api<{ items: ProductCategory[] } | ProductCategory[]>("/categories")
      .then((d) => {
        const items = Array.isArray(d) ? d : (d.items ?? []);
        setCatLabel(items.find((c) => c.key === product.category)?.label ?? product.category);
      })
      .catch(() => setCatLabel(product.category ?? null));
  }, [product?.category]);

  // โหลดรูป thumbnail (ต้องส่ง Bearer — ใช้ object URL)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const a of assets) {
        if (thumbs[a.id]) continue;
        try {
          const url = await fetchAssetObjectUrl(a.id);
          if (cancelled) return;
          setThumbs((t) => ({ ...t, [a.id]: url }));
        } catch {
          /* รูปเสีย — ข้าม */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets]);

  async function removeReview(fid: string) {
    if (!confirm("ลบรีวิวนี้ออกจากคลัง?")) return;
    try {
      await deleteFeedback(fid);
      setReviews((r) => r.filter((x) => x.id !== fid));
    } catch (e) {
      setError(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    }
  }

  // 📋 ก๊อปลิงก์ marketplace (CEO) — โชว์ ✓ แป๊บนึงแทน toast
  const copyLink = (key: string, url: string) => {
    void navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopiedLink(key);
        setTimeout(() => setCopiedLink((c) => (c === key ? null : c)), 1500);
      })
      .catch(() => setCopiedLink(null)); // browser ไม่ให้สิทธิ์ clipboard — ไม่ต้องพัง console
  };

  if (!product) {
    return (
      <AppShell title="สินค้า">
        <p className="px-2 py-10 text-center text-sm text-zinc-500">{error ?? "กำลังโหลด..."}</p>
      </AppShell>
    );
  }

  const st = PRODUCT_STATUS[product.status] ?? PRODUCT_STATUS.active;
  const risk = CLAIM_RISK[product.claimRiskLevel] ?? CLAIM_RISK.low;
  const brief: ReviewBrief = product.reviewBrief ?? {};
  const links = product.platformLinks ?? {};
  const hasBrief = hasReviewBrief(product.reviewBrief);

  return (
    <AppShell title={product.name}>
      <div className="space-y-4">
        {error && (
          <p className="rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">{error}</p>
        )}

        {/* ── หัวสินค้า: ข้อมูลหลักแสดงทันที ── */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="flex flex-wrap items-start gap-4">
            {thumbs[assets[0]?.id ?? ""] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumbs[assets[0].id]}
                alt={product.name}
                className="h-28 w-28 shrink-0 rounded-xl border border-zinc-800 object-cover"
              />
            ) : (
              <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-xl border border-dashed border-zinc-700 text-3xl">
                <ShoppingBag className="size-4" />
              </div>
            )}
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-amber-300">{product.displayCode}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] ${st.cls}`}>{st.label}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] ${risk.cls}`}>Claim: {risk.label}</span>
              </div>
              <h1 className="text-lg font-semibold text-zinc-100">{product.name}</h1>
              <p className="text-sm text-zinc-400">
                {catLabel && <span className="mr-3">{catLabel}</span>}
                {product.price != null && (
                  <span className="mr-3">
                    <Wallet className="size-4" /> {product.salePrice != null ? `฿${product.salePrice} (ปกติ ฿${product.price})` : `฿${product.price}`}
                  </span>
                )}
                {product.shopName && <span className="mr-3">{product.shopName}</span>}
                {product.rating != null && <span className="mr-3"><Star className="size-4" /> {product.rating}</span>}
                {product.soldMonth != null && <span>ขาย {product.soldMonth}/เดือน</span>}
              </p>
              {product.description && (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">{product.description}</p>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                {(
                  [
                    ["shopee", "Shopee", links.shopee],
                    ["tiktok_shop", "TikTok Shop", links.tiktok_shop],
                    ["lazada", "Lazada", links.lazada],
                    ["affiliate", "ลิงก์ Affiliate", product.affiliateUrl],
                  ] as const
                ).map(([key, label, url]) =>
                  url ? (
                    <span key={key} className="inline-flex overflow-hidden rounded-lg border border-zinc-700">
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-amber-300"
                      >
                        <LinkIcon className="size-4" /> {label}
                      </a>
                      <button
                        type="button"
                        onClick={() => copyLink(key, url)}
                        title={`ก๊อปลิงก์ ${label}`}
                        className="border-l border-zinc-700 px-2 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-amber-300"
                      >
                        {copiedLink === key ? <Check className="size-4" /> : ""}
                      </button>
                    </span>
                  ) : null,
                )}
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-2">
              <Link
                href={`/clip-jobs?createFor=${product.id}`}
                className="rounded-lg bg-amber-400 px-3 py-1.5 text-center text-sm font-semibold text-zinc-950 hover:bg-amber-300"
              >
                <Film className="size-4" /> ทำคลิป
              </Link>
              <Link
                href={`/prompts?entityType=product&entityId=${product.id}`}
                className="rounded-lg border border-zinc-700 px-3 py-1.5 text-center text-sm text-zinc-300 hover:bg-zinc-800"
              >
                <FileText className="size-4" /> Prompt
              </Link>
              <Link
                href={`/characters?productCategory=${encodeURIComponent(catLabel && product.category !== "other" ? catLabel : product.name)}&brandSafety=high&sortBy=gmv`}
                className="rounded-lg border border-zinc-700 px-3 py-1.5 text-center text-sm text-zinc-300 hover:bg-zinc-800"
              >
                <Clapperboard className="size-4" /> หา presenter
              </Link>
              <Link
                href={`/products?edit=${product.id}`}
                className="rounded-lg border border-zinc-700 px-3 py-1.5 text-center text-sm text-zinc-300 hover:bg-zinc-800"
              >
                <Pencil className="size-4" /> แก้ไขสินค้า
              </Link>
            </div>
          </div>
        </div>

        {/* ── 📋 Review Brief: แสดงเปิดทันที ── */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-amber-300">ข้อมูลรีวิว (Review Brief)</h2>
            <button
              onClick={() => setEditBrief((v) => !v)}
              className="rounded-lg border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
            >
              {editBrief ? "ปิดโหมดแก้ไข" : "แก้ไข / AI แตกฟิลด์"}
            </button>
          </div>

          {editBrief ? (
            <ProductBriefEditor
              productId={product.id}
              initial={product.reviewBrief}
              extractAssets={assets}
              onSaved={(b) => {
                setProduct((p) => (p ? { ...p, reviewBrief: b } : p));
                setEditBrief(false);
              }}
            />
          ) : !hasBrief ? (
            <p className="rounded-lg border border-dashed border-amber-400/40 bg-amber-400/5 px-3 py-3 text-sm text-amber-300">
              <TriangleAlert className="size-4" /> ยังไม่มีข้อมูลรีวิว — AI จะเดาจากชื่อสินค้า · กด &ldquo;แก้ไข&rdquo; เพื่อกรอก หรือดูดจากหน้า Shopee ผ่าน
              Extension
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
              {!!brief.highlights?.length && (
                <div className="md:col-span-2">
                  <p className="mb-1 text-xs font-semibold text-zinc-400"><Sparkles className="size-4" /> จุดเด่น / USP</p>
                  <div className="flex flex-wrap gap-1.5">
                    {brief.highlights.map((h, i) => (
                      <span key={i} className="rounded-full bg-amber-400/10 px-2.5 py-0.5 text-xs text-amber-300">
                        {h}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {brief.specs && (
                <div>
                  <p className="mb-1 text-xs font-semibold text-zinc-400">สรรพคุณ / สเปกหลัก</p>
                  <p className="whitespace-pre-wrap text-zinc-200">{brief.specs}</p>
                </div>
              )}
              {(brief.targetAudience || brief.painPoint) && (
                <div>
                  {brief.targetAudience && (
                    <p className="text-zinc-200">
                      <span className="text-xs font-semibold text-zinc-400"><Target className="size-4" /> กลุ่มเป้าหมาย: </span>
                      {brief.targetAudience}
                    </p>
                  )}
                  {brief.painPoint && (
                    <p className="mt-1 text-zinc-200">
                      <span className="text-xs font-semibold text-zinc-400">ปัญหาที่แก้: </span>
                      {brief.painPoint}
                    </p>
                  )}
                </div>
              )}
              {!!brief.howToUse?.length && (
                <div>
                  <p className="mb-1 text-xs font-semibold text-zinc-400">วิธีใช้</p>
                  <ol className="list-inside list-decimal space-y-0.5 text-zinc-200">
                    {brief.howToUse.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                </div>
              )}
              {(brief.promo || brief.cautions || brief.extraNote) && (
                <div className="space-y-1">
                  {brief.promo && (
                    <p className="text-zinc-200">
                      <span className="text-xs font-semibold text-zinc-400"><Tag className="size-4" /> โปรโมชั่น: </span>
                      {brief.promo}
                    </p>
                  )}
                  {brief.cautions && (
                    <p className="text-zinc-200">
                      <span className="text-xs font-semibold text-zinc-400"><TriangleAlert className="size-4" /> ข้อควรระวัง: </span>
                      {brief.cautions}
                    </p>
                  )}
                  {brief.extraNote && (
                    <p className="text-zinc-200">
                      <span className="text-xs font-semibold text-zinc-400">โน้ต: </span>
                      {brief.extraNote}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── 🧩 Product Sheet: แยกส่วนสินค้า (Flow-ready) ── */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-amber-300">🧩 Product Sheet — แยกส่วนสินค้า{sheet?.productType ? ` · ${sheet.productType}` : ""}</h2>
              <p className="text-[11px] text-zinc-500">
                AI อ่านรูปในคลัง แตกเป็นส่วนประกอบ + สถานะ (ปิด/เปิด/หยิบชิ้นใน/ถือในมือ) พร้อม prompt EN ต่อชิ้น ก๊อปเข้า Flow ได้เลย
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              {sheet && (
                <button
                  onClick={() => copySheetText("__all", fullSheetText(sheet))}
                  className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                >
                  {copiedSheet === "__all" ? <Check className="size-4 text-emerald-400" /> : null} คัดลอกทั้ง Sheet
                </button>
              )}
              <button
                onClick={() => void analyzeSheet()}
                disabled={sheetBusy}
                className="inline-flex items-center gap-1 rounded-lg bg-amber-400 px-3 py-1 text-xs font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
              >
                {sheetBusy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                {sheetBusy ? "กำลังวิเคราะห์..." : sheet ? "วิเคราะห์ใหม่จากรูป" : "✨ วิเคราะห์จากรูปสินค้า"}
              </button>
            </div>
          </div>
          {sheetMsg && <p className="mb-2 text-xs text-emerald-400">{sheetMsg}</p>}
          {!sheet ? (
            <p className="text-sm text-zinc-500">
              ยังไม่มี sheet — กดปุ่มวิเคราะห์ (ใช้รูป 4 รูปแรกจากคลังด้านล่าง)
            </p>
          ) : (
            <div className="space-y-3">
              {/* PRODUCT BINDING */}
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-xs font-semibold text-amber-300">🔒 PRODUCT BINDING — แนบทุก prompt</p>
                  <button
                    onClick={() => copySheetText("__bind", sheet.bindingEn)}
                    className="rounded-lg border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-zinc-800"
                  >
                    {copiedSheet === "__bind" ? "✓ คัดลอกแล้ว" : "คัดลอก"}
                  </button>
                </div>
                <p className="text-xs leading-relaxed text-zinc-300">{sheet.bindingEn}</p>
              </div>
              {/* PARTS */}
              <div>
                <p className="mb-1.5 text-xs font-semibold text-zinc-300">🧩 ส่วนประกอบ ({sheet.parts.length})</p>
                <div className="grid gap-2 md:grid-cols-2">
                  {sheet.parts.map((pt, i) => (
                    <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-2.5">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-zinc-200">{pt.nameTh} <span className="font-normal text-zinc-500">· {pt.nameEn}</span></p>
                        <button
                          onClick={() => copySheetText(`p${i}`, pt.promptEn)}
                          className="shrink-0 rounded-lg border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-zinc-800"
                        >
                          {copiedSheet === `p${i}` ? "✓" : "คัดลอก"}
                        </button>
                      </div>
                      <p className="text-[11px] leading-relaxed text-zinc-400">{pt.promptEn}</p>
                    </div>
                  ))}
                </div>
              </div>
              {/* STATES */}
              <div>
                <p className="mb-1.5 text-xs font-semibold text-zinc-300">🎬 สถานะ/ฉากโชว์ ({sheet.states.length})</p>
                <div className="grid gap-2 md:grid-cols-2">
                  {sheet.states.map((st, i) => (
                    <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-2.5">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-zinc-200">{st.nameTh}</p>
                        <button
                          onClick={() => copySheetText(`s${i}`, st.promptEn)}
                          className="shrink-0 rounded-lg border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-zinc-800"
                        >
                          {copiedSheet === `s${i}` ? "✓" : "คัดลอก"}
                        </button>
                      </div>
                      <p className="text-[11px] leading-relaxed text-zinc-400">{st.promptEn}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── 🖼️ แกลเลอรีรูป: แสดงทันที ── */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-amber-300"><ImageIcon className="size-4" /> คลังรูปสินค้า ({assets.length} รูป)</h2>
            <button
              onClick={() => setShowGalleryModal(true)}
              className="rounded-lg border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
            >
              เพิ่ม/จัดการรูป (ลากวาง)
            </button>
          </div>
          {assets.length === 0 ? (
            <p className="text-sm text-zinc-500">
              ยังไม่มีรูป — กด &ldquo;เพิ่ม/จัดการรูป&rdquo; หรือดูดจากหน้า Shopee ผ่าน Extension
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
              {assets.map((a) => (
                <a
                  key={a.id}
                  href={thumbs[a.id]}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={a.originalFilename}
                  className="block aspect-square overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950"
                >
                  {thumbs[a.id] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumbs[a.id]} alt={a.originalFilename} className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full items-center justify-center text-xs text-zinc-600"><Loader2 className="size-4" /></span>
                  )}
                </a>
              ))}
            </div>
          )}
        </div>

        {/* ── 💬 รีวิวลูกค้า 5★: แสดงทันที ── */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="mb-3 text-sm font-semibold text-amber-300">
            <MessageSquare className="size-4" /> รีวิวลูกค้า 4–5★ ในคลัง ({reviews.length} รายการ)
          </h2>
          {reviews.length === 0 ? (
            <p className="text-sm text-zinc-500">
              ยังไม่มีรีวิวในคลัง — ดูดจากหน้า Shopee ผ่าน Extension หรือวางข้อความในโหมดแก้ไข Brief
            </p>
          ) : (
            <div className="space-y-2">
              {reviews.map((r) => (
                <div key={r.id} className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-950/50 px-3 py-2.5">
                  <span className="shrink-0 text-xs text-amber-300">{r.rating ? `${r.rating}★` : "—"}</span>
                  <p className="min-w-0 flex-1 whitespace-pre-wrap text-sm leading-relaxed text-zinc-200">{r.text}</p>
                  <div className="flex shrink-0 items-center gap-2">
                    {r.themes?.[0] && (
                      <span className="rounded-full bg-sky-900/40 px-2 py-0.5 text-[11px] text-sky-300">
                        {r.themes[0]}
                      </span>
                    )}
                    <button
                      onClick={() => removeReview(r.id)}
                      title="ลบออกจากคลัง"
                      className="text-zinc-500 hover:text-red-400"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="text-xs text-zinc-500">
          <Link href="/products" className="text-sky-300 hover:underline">
            <ArrowLeft className="size-4" /> กลับหน้ารายการสินค้า
          </Link>
        </p>
      </div>

      {/* modal จัดการรูป (ลากวาง/ลิงก์/ไฟล์) — reuse ตัวเดิม */}
      {showGalleryModal && (
        <ReviewBriefModal
          product={product}
          onClose={() => {
            setShowGalleryModal(false);
            reload();
          }}
          onBriefSaved={(_, b) => setProduct((p) => (p ? { ...p, reviewBrief: b } : p))}
        />
      )}
    </AppShell>
  );
}
