"use client";

// 📋 ข้อมูลรีวิว (Review Brief) ของสินค้า — modal เปิดจากการ์ด/แถวในหน้า Products
// ครึ่งบน: คลังรูปสินค้า — ลากวางหลายไฟล์ / ลากรูปจากแท็บอื่น (URL) / Ctrl+V / เลือกไฟล์ (multiple)
//   ทุกทางอัปโหลด "เพิ่มเข้าคลัง" ไม่ทับของเดิม · ⭐ ตั้งรูปหลัก (role cover เดิมของ Products)
//   · 🗑 ลบ (archive) · โชว์สถานะอัปโหลดรายไฟล์ (พลาด 1 ไฟล์ไม่ล้มทั้งชุด)
// ครึ่งล่าง: ฟอร์ม brief + 🤖 AI แตกฟิลด์ (ProductBriefEditor)

import { useCallback, useEffect, useRef, useState } from "react";
import { useAssetImage, primeEntityThumb } from "@/lib/media";
import { promoteCover, isCoverAsset } from "@/lib/cover";
import {
  archiveAsset,
  fetchEntityImageAssets,
  importAssetFromUrl,
  uploadAsset,
  type Asset,
} from "@/lib/assets";
import { Product, ReviewBrief } from "@/lib/catalog";
import ProductBriefEditor from "@/components/ProductBriefEditor";
import {
  CustomerFeedback,
  deleteFeedback,
  extractProductReviews,
  fetchProductTopReviews,
} from "@/lib/api";
import { reviewStars } from "@/components/ReviewVoicePicker";
import {
  CircleCheck,
  Download,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  Star,
  Trash2,
  X,
} from "lucide-react";

// สถานะอัปโหลดต่อไฟล์/ลิงก์ — โชว์ให้เห็นว่าไฟล์ไหนพลาด (ลาก 5 ไฟล์พลาด 1 ≠ พังทั้งชุด)
interface UploadJob {
  key: string;
  label: string;
  status: "uploading" | "done" | "error";
  error?: string;
}

const SOFT_WARN_COUNT = 12; // ไม่จำกัดจำนวนรูป — เตือนเบา ๆ เมื่อเกิน 12

function GalleryThumb({
  asset,
  isPrimary,
  onSetPrimary,
  onDelete,
  busy,
}: {
  asset: Asset;
  isPrimary: boolean;
  onSetPrimary: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const url = useAssetImage(asset.id);
  return (
    <div
      className={`group relative aspect-square overflow-hidden rounded-xl border ${
        isPrimary ? "border-amber-400 ring-1 ring-amber-400" : "border-zinc-800"
      }`}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={asset.originalFilename} className="h-full w-full object-cover" />
      ) : (
        <div className="h-full w-full animate-pulse bg-zinc-800" />
      )}
      {isPrimary && (
        <span className="absolute left-1 top-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] text-amber-300 backdrop-blur-sm">
          <Star className="size-4" /> รูปหลัก
        </span>
      )}
      <div className="absolute inset-x-1 bottom-1 flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        {!isPrimary && (
          <button
            type="button"
            onClick={onSetPrimary}
            disabled={busy}
            title="ตั้งเป็นรูปหลัก (ปกการ์ดสินค้า)"
            className="rounded-lg bg-black/70 px-1.5 py-1 text-xs text-amber-300 backdrop-blur-sm hover:bg-black/90 disabled:opacity-50"
          >
            <Star className="size-4" />
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          title="ลบรูปนี้ออกจากคลัง"
          className="rounded-lg bg-black/70 px-1.5 py-1 text-xs text-red-300 backdrop-blur-sm hover:bg-black/90 disabled:opacity-50"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
    </div>
  );
}

// ── 💬 รีวิวลูกค้า (4-5 ดาว) — วางก้อนรีวิวจากหน้า Shopee → AI แยกรายรีวิว คัดเก็บเฉพาะของดี ──
// คลังนี้ผูกกับตัวสินค้า (CustomerFeedback) — ตอนสร้าง Clip Job ค่อยติ๊กเลือกสูงสุด 5 ข้อเข้า prompt
function CustomerReviewsSection({ productId }: { productId: string }) {
  const [pasteText, setPasteText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [reviews, setReviews] = useState<CustomerFeedback[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; msg: string } | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showNotice = useCallback((kind: "ok" | "error", msg: string) => {
    setNotice({ kind, msg });
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 4000);
  }, []);

  const reloadReviews = useCallback(async () => {
    try {
      const r = await fetchProductTopReviews(productId);
      setReviews(r.items);
    } catch {
      setReviews([]);
    } finally {
      setLoaded(true);
    }
  }, [productId]);

  useEffect(() => {
    setLoaded(false);
    setPasteText("");
    setNotice(null);
    void reloadReviews();
  }, [productId, reloadReviews]);

  async function handleExtract() {
    const text = pasteText.trim();
    if (!text) return;
    setExtracting(true);
    try {
      const res = await extractProductReviews({ productId, text });
      showNotice("ok", `เก็บ ${res.saved} รีวิว (ข้าม ${res.skipped})`);
      setPasteText("");
      await reloadReviews();
    } catch (e) {
      showNotice("error", e instanceof Error ? e.message : "AI คัดรีวิวไม่สำเร็จ");
    } finally {
      setExtracting(false);
    }
  }

  async function handleDelete(r: CustomerFeedback) {
    if (!confirm("ลบรีวิวนี้ออกจากคลัง?")) return;
    try {
      await deleteFeedback(r.id);
      setReviews((prev) => prev.filter((x) => x.id !== r.id));
    } catch (e) {
      showNotice("error", e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
      <p className="text-xs font-semibold text-zinc-300">
<MessageSquare className="size-4" /> รีวิวลูกค้า (4–5 ดาว){" "}
        <span className="font-normal text-zinc-500">
          — คลังเสียงลูกค้าจริงของสินค้านี้ · ตอนสร้าง Clip Job ติ๊กเลือกได้สูงสุด 5 ข้อ
        </span>
      </p>

      <textarea
        value={pasteText}
        onChange={(e) => setPasteText(e.target.value)}
        rows={4}
        maxLength={20000}
        placeholder="วางรีวิวจากหน้า Shopee (ก๊อปมาหลายรีวิวรวดเดียวได้)..."
        className="w-full resize-y rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-sm outline-none focus:border-amber-400"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void handleExtract()}
          disabled={extracting || !pasteText.trim()}
          className="rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-semibold text-zinc-900 hover:bg-amber-300 disabled:opacity-50"
        >
          {extracting ? "AI กำลังคัดรีวิว..." : "AI คัดรีวิว 4–5 ดาวเก็บเข้าคลัง"}
        </button>
        {notice && (
          <span className={`text-[11px] ${notice.kind === "ok" ? "text-emerald-300" : "text-red-400"}`}>
            {notice.msg}
          </span>
        )}
      </div>

      {/* คลังรีวิวที่คัดแล้ว */}
      {!loaded ? (
        <p className="text-[11px] text-zinc-500"><Loader2 className="size-4" /> กำลังโหลดคลังรีวิว...</p>
      ) : reviews.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-700 px-2.5 py-2 text-[11px] text-zinc-500">
          ยังไม่มีรีวิวในคลัง — ก๊อปรีวิวจากหน้า Shopee มาวางด้านบน AI จะแยกรายรีวิว อ่านดาว
          แล้วเก็บเฉพาะ 4–5 ดาวที่มีประเด็นเด็ดไว้ใช้เป็นเสียงลูกค้าจริงตอนทำคลิป
        </p>
      ) : (
        <ul className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
          {reviews.map((r) => {
            const gem = r.themes[0]?.trim();
            return (
              <li
                key={r.id}
                className="flex items-start gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] text-amber-300">{reviewStars(r.rating)}</p>
                  <p className="text-xs text-zinc-200">{r.text}</p>
                  {gem && (
                    <span className="mt-0.5 inline-block rounded bg-amber-400/10 px-1.5 py-0.5 text-[10px] text-amber-300">
                      {gem}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void handleDelete(r)}
                  title="ลบรีวิวนี้ออกจากคลัง"
                  className="shrink-0 rounded-lg bg-black/40 px-1.5 py-1 text-xs text-red-300 hover:bg-black/70"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {loaded && reviews.length > 0 && (
        <p className="text-[11px] text-zinc-500">มี {reviews.length} รีวิวในคลัง</p>
      )}
    </div>
  );
}

export default function ReviewBriefModal({
  product,
  onClose,
  onBriefSaved,
}: {
  product: Product | null;
  onClose: () => void;
  /** แจ้ง parent ให้อัปเดต badge 📋 บนการ์ด (โดยไม่ต้อง reload ทั้งหน้า) */
  onBriefSaved?: (productId: string, brief: ReviewBrief) => void;
}) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [galleryBusy, setGalleryBusy] = useState(false);
  const [galleryError, setGalleryError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const jobSeq = useRef(0);

  const productId = product?.id ?? null;

  const reloadAssets = useCallback(async () => {
    if (!productId) return;
    setLoadingAssets(true);
    try {
      const items = await fetchEntityImageAssets("product", productId);
      setAssets(items);
    } catch {
      setAssets([]);
    } finally {
      setLoadingAssets(false);
    }
  }, [productId]);

  useEffect(() => {
    setAssets([]);
    setJobs([]);
    setGalleryError(null);
    if (productId) void reloadAssets();
  }, [productId, reloadAssets]);

  const pushJob = useCallback((label: string): string => {
    const key = `job-${++jobSeq.current}`;
    setJobs((prev) => [...prev, { key, label, status: "uploading" }]);
    return key;
  }, []);

  const finishJob = useCallback((key: string, status: "done" | "error", error?: string) => {
    setJobs((prev) => prev.map((j) => (j.key === key ? { ...j, status, error } : j)));
    // งานที่สำเร็จหายจากรายการเองใน 4 วิ (ที่พลาดค้างไว้ให้เห็น)
    if (status === "done") {
      setTimeout(() => setJobs((prev) => prev.filter((j) => j.key !== key)), 4000);
    }
  }, []);

  // ── (a) ไฟล์หลายตัว (drop/file picker/paste) — อัปโหลดขนานรายไฟล์ พลาดไฟล์ไหนโชว์ไฟล์นั้น ──
  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (!productId) return;
      const images = files.filter((f) => f.type.startsWith("image/"));
      if (images.length === 0) return;
      await Promise.all(
        images.map(async (file) => {
          const key = pushJob(file.name);
          try {
            await uploadAsset(file, {
              assetType: "product_image",
              entityType: "product",
              entityId: productId,
              linkRole: "review_image",
            });
            finishJob(key, "done");
          } catch (e) {
            finishJob(key, "error", e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ");
          }
        }),
      );
      await reloadAssets();
    },
    [productId, pushJob, finishJob, reloadAssets],
  );

  // ── (b) ลากรูปจากแท็บอื่น → ได้ URL (text/uri-list หรือ <img> ใน text/html) ──
  const importUrl = useCallback(
    async (url: string) => {
      if (!productId) return;
      const key = pushJob(url.length > 60 ? `${url.slice(0, 57)}...` : url);
      try {
        await importAssetFromUrl(url, {
          entityType: "product",
          entityId: productId,
          linkRole: "review_image",
        });
        finishJob(key, "done");
        await reloadAssets();
      } catch (e) {
        finishJob(key, "error", e instanceof Error ? e.message : "ดึงรูปจากลิงก์ไม่สำเร็จ");
      }
    },
    [productId, pushJob, finishJob, reloadAssets],
  );

  function extractDroppedUrl(dt: DataTransfer): string | null {
    // รูปที่ลากจากเว็บ: ลอง <img src> จาก text/html ก่อน (ตรงตัวรูปสุด) แล้วค่อย uri-list
    const html = dt.getData("text/html");
    const imgMatch = html?.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (imgMatch?.[1] && /^https?:\/\//i.test(imgMatch[1])) return imgMatch[1];
    const uriList = dt.getData("text/uri-list");
    const firstUri = uriList
      ?.split("\n")
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith("#"));
    if (firstUri && /^https?:\/\//i.test(firstUri)) return firstUri;
    const plain = dt.getData("text/plain")?.trim();
    if (plain && /^https?:\/\/\S+$/i.test(plain)) return plain;
    return null;
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length > 0) {
      await uploadFiles(files);
      return;
    }
    const url = extractDroppedUrl(e.dataTransfer);
    if (url) await importUrl(url);
    else setGalleryError("ลากมาแล้วไม่เจอรูป — ลองบันทึกรูปแล้วลากไฟล์มาแทน");
  }

  // ── (c) Ctrl+V รูปจาก clipboard — วางซ้ำกี่รอบก็เพิ่มเข้าคลังเรื่อย ๆ ──
  useEffect(() => {
    if (!productId) return;
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) =>
        f.type.startsWith("image/"),
      );
      if (files.length > 0) {
        e.preventDefault();
        void uploadFiles(files);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [productId, uploadFiles]);

  async function handleSetPrimary(asset: Asset) {
    if (!productId) return;
    setGalleryBusy(true);
    setGalleryError(null);
    try {
      await promoteCover("product", productId, asset, assets, "cover");
      primeEntityThumb("product", productId, asset.id);
      await reloadAssets();
    } catch (e) {
      setGalleryError(e instanceof Error ? e.message : "ตั้งรูปหลักไม่สำเร็จ");
    } finally {
      setGalleryBusy(false);
    }
  }

  async function handleDelete(asset: Asset) {
    if (!productId) return;
    if (!confirm(`ลบรูป "${asset.originalFilename}" ออกจากคลัง?`)) return;
    setGalleryBusy(true);
    setGalleryError(null);
    try {
      await archiveAsset(asset.id);
      await reloadAssets();
    } catch (e) {
      setGalleryError(e instanceof Error ? e.message : "ลบรูปไม่สำเร็จ");
    } finally {
      setGalleryBusy(false);
    }
  }

  if (!product) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="fixed inset-y-0 right-0 flex h-full w-full max-w-2xl flex-col space-y-4 overflow-y-auto border-l border-zinc-800 bg-zinc-900 p-5 shadow-2xl duration-200 animate-in slide-in-from-right"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-amber-300">
              ข้อมูลรีวิว — {product.name}
            </h2>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              <span className="font-mono">{product.displayCode}</span> · กรอกครั้งเดียว ใช้ทุก Clip Job
              — AI จะได้เลิกเดาจากชื่อสินค้า
            </p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-lg border border-zinc-700 px-2.5 py-1 text-sm text-zinc-400 hover:bg-zinc-800"
          >
            <X className="size-4" /> ปิด
          </button>
        </div>

        {/* ── คลังรูปสินค้า ── */}
        <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-zinc-300">
<ImageIcon className="size-4" /> คลังรูปสินค้า{" "}
              <span className="font-normal text-zinc-500">
                ({assets.length} รูป{assets.length > SOFT_WARN_COUNT ? " — เยอะแล้วนะ เกิน 12 รูป AI ใช้แค่ 4 รูปแรก" : ""})
              </span>
            </p>
            {loadingAssets && <span className="text-[11px] text-zinc-500"><Loader2 className="size-4" /> กำลังโหลด...</span>}
          </div>

          {/* dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => void handleDrop(e)}
            onClick={() => fileInputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${
              dragOver
                ? "border-amber-400 bg-amber-400/10"
                : "border-zinc-700 hover:border-zinc-500 hover:bg-zinc-900"
            }`}
          >
            <p className="text-2xl"><Download className="size-4" /></p>
            <p className="mt-1 text-sm text-zinc-300">
              ลากรูปมาวาง (ได้หลายรูป) / Ctrl+V / คลิกเลือกไฟล์
            </p>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              ลากรูปจากแท็บ Shopee มาวางตรง ๆ ก็ได้ — ระบบดึงจากลิงก์ให้เอง · ทุกรูปเพิ่มเข้าคลัง ไม่ทับของเดิม
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                void uploadFiles(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
          </div>

          {/* สถานะอัปโหลดรายไฟล์ */}
          {jobs.length > 0 && (
            <ul className="space-y-1">
              {jobs.map((j) => (
                <li
                  key={j.key}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1 text-[11px] ${
                    j.status === "error"
                      ? "bg-red-950/50 text-red-300"
                      : j.status === "done"
                        ? "bg-emerald-950/40 text-emerald-300"
                        : "bg-zinc-800/60 text-zinc-300"
                  }`}
                >
                  <span>{j.status === "uploading" ? <Loader2 className="size-4" /> : j.status === "done" ? <CircleCheck className="size-4" /> : <X className="size-4" />}</span>
                  <span className="min-w-0 flex-1 truncate">{j.label}</span>
                  {j.error && <span className="shrink-0 truncate">{j.error}</span>}
                  {j.status === "error" && (
                    <button
                      onClick={() => setJobs((prev) => prev.filter((x) => x.key !== j.key))}
                      className="shrink-0 text-red-400 hover:text-red-200"
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {galleryError && <p className="text-[11px] text-red-400">{galleryError}</p>}

          {/* thumbnails grid */}
          {assets.length > 0 && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
              {assets.map((a) => (
                <GalleryThumb
                  key={a.id}
                  asset={a}
                  isPrimary={isCoverAsset(a, "product", product.id)}
                  onSetPrimary={() => void handleSetPrimary(a)}
                  onDelete={() => void handleDelete(a)}
                  busy={galleryBusy}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── ฟอร์ม brief + AI extract ── */}
        <ProductBriefEditor
          productId={product.id}
          initial={product.reviewBrief ?? null}
          extractAssets={assets}
          onSaved={(brief) => onBriefSaved?.(product.id, brief)}
        />

        {/* ── 💬 รีวิวลูกค้า 4-5 ดาว — วางจาก Shopee ให้ AI คัดเก็บเข้าคลัง ── */}
        <CustomerReviewsSection productId={product.id} />
      </div>
    </div>
  );
}
