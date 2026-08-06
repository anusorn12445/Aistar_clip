"use client";

// 🎞️ UGC Studio v2 — Clip Job board (3 stages ตาม mockup ที่ CEO อนุมัติ)
// ① เลือกคอนเซปต์ (AI เสนอ 3 แบบ มี emoji · 🔄 ขอแนวใหม่ได้)
// ② Storyboard + Prompt (Resource Rail · เสียงพากย์ · พาดหัว · shot board มี sceneType ต่อฉาก)
// ③ 📦 ชุดพร้อมโพสต์ (ภาพนิ่ง/ลิงก์วิดีโอ/ข้อความขึ้นจอ/สคริปต์+แคปชั่น+CTA)
// วางผลกลับ: ภาพนิ่ง = อัปโหลด, วิดีโอ = ลิงก์ Google Drive (ไฟล์วิดีโอหนัก ไม่อัปเข้าระบบ)

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Ban,
  Bot,
  Check,
  Clapperboard,
  ClipboardList,
  Download,
  Drama,
  FileText,
  FolderOpen,
  Grab,
  Hand,
  Handshake,
  Image as ImageIcon,
  Library,
  Lightbulb,
  Link as LinkIcon,
  Loader2,
  MapPin,
  MessageSquare,
  Mic,
  Monitor,
  Package,
  Pencil,
  Play,
  RefreshCw,
  Shirt,
  Sparkles,
  Speech,
  Star,
  StickyNote,
  Tag,
  Target,
  TriangleAlert,
  Undo2,
  Video,
  X,
  ShoppingBag,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import CoverImage from "@/components/CoverImage";
import ProductBriefEditor from "@/components/ProductBriefEditor";
import PromptViewerModal from "@/components/PromptViewerModal";
import ReviewVoicePicker, { REVIEW_PICK_MAX } from "@/components/ReviewVoicePicker";
import { FilterSelect } from "@/components/ui/filter-select";
import { api, getToken } from "@/lib/api";
import { useAssetImage } from "@/lib/media";
import { uploadAsset, fetchAssetObjectUrl, fetchEntityImageAssets, downloadAssetFile, type Asset } from "@/lib/assets";
import { Product, hasReviewBrief } from "@/lib/catalog";
import { SECTION_LABEL, HandProfile, fetchAllHands } from "@/lib/interaction";
import type { PromptVariant } from "@/lib/promptBuilders";
import type { LocationItem, VoiceProfile } from "@/lib/library";
import {
  AiReviewFinding,
  BannedMatch,
  BannedWord,
  aiReviewBannedWords,
  fetchActiveBannedWords,
  normalizeCompliancePlatform,
  replaceMatches,
  scanText,
} from "@/lib/banned-words";
import {
  CLIP_JOB_STATUS_LABEL,
  CLIP_SHOT_STATUS_LABEL,
  CLIP_SUBJECT_LABEL,
  CTA_TYPE_LABEL,
  ClipJobDetail,
  ClipPackage,
  ClipShot,
  ClipShotInput,
  SCENE_TYPE_META,
  SubjectBrief,
  archiveClipJob,
  clipSceneHint,
  driveEmbedUrl,
  fetchClipJob,
  fetchClipPackage,
  fetchClipStatus,
  patchClipShot,
  planClipJob,
  proposeClipConcepts,
  recomposeClipShot,
  checkShotPolicy,
  autoFixShotPolicy,
  type PolicyCheck,
  replaceClipShots,
  updateClipJob,
} from "@/lib/clip-jobs";

// ── ภาพนิ่งของ shot (แนบ token → object URL) ──
function ShotStill({ assetId }: { assetId: string }) {
  const url = useAssetImage(assetId);
  if (!url) return <div className="h-full w-full animate-pulse bg-zinc-800" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="still" className="h-full w-full object-cover" />;
}

// ── 📋 ข้อมูลสินค้า (ดึงจากตัวสินค้า) — Review Brief + รูปรีวิว + โจทย์ระดับ job ──
// คลิกรูป = ก๊อปรูปเข้า clipboard (แปลงเป็น PNG) เอาไปวางใน Flow/ChatGPT ได้เลย
async function copyAssetImageToClipboard(assetId: string): Promise<void> {
  const url = await fetchAssetObjectUrl(assetId);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("โหลดรูปไม่สำเร็จ"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext("2d")?.drawImage(img, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("แปลงรูปไม่สำเร็จ"))), "image/png"),
    );
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
}

function ProductRefThumb({
  asset,
  onCopy,
  selected,
  onToggleSelect,
}: {
  asset: Asset;
  onCopy: () => void;
  /** โหมดติ๊กหลายรูป (CEO: เลือกหลายรูปแล้วโหลดรวดเดียว ลากเข้า Flow/ChatGPT) */
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const url = useAssetImage(asset.id);
  return (
    <span
      className={`relative block aspect-square w-16 shrink-0 overflow-hidden rounded-lg border ${
        selected ? "border-amber-400 ring-1 ring-amber-400" : "border-zinc-800 hover:border-amber-400/60"
      }`}
    >
      <button
        type="button"
        onClick={onCopy}
        title="คลิกเพื่อก๊อปรูปเข้า clipboard (เอาไปวางใน Flow ได้เลย)"
        className="block h-full w-full"
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={asset.originalFilename} className="h-full w-full object-cover" />
        ) : (
          <span className="block h-full w-full animate-pulse bg-zinc-800" />
        )}
      </button>
      {onToggleSelect && (
        <input
          type="checkbox"
          checked={selected ?? false}
          onChange={onToggleSelect}
          onClick={(e) => e.stopPropagation()}
          title="ติ๊กเพื่อเลือกหลายรูป"
          className="absolute left-1 top-1 h-4 w-4 accent-amber-400"
        />
      )}
    </span>
  );
}

// 🖼️ เลือกภาพนิ่งของ shot จากคลังรูปสินค้า (CEO: มีรูปในระบบแล้วไม่ต้องอัปใหม่ — ไม่พอใจค่อยอัปนอก)
function ProductImagePicker({
  productId,
  onPick,
  onClose,
}: {
  productId: string;
  onPick: (asset: Asset) => void;
  onClose: () => void;
}) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetchEntityImageAssets("product", productId)
      .then(setAssets)
      .catch(() => setAssets([]))
      .finally(() => setLoading(false));
  }, [productId]);
  return (
    <div className="absolute left-0 top-full z-30 mt-1 w-72 rounded-xl border border-zinc-700 bg-zinc-900 p-2.5 shadow-xl shadow-black/50">
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-[11px] font-semibold text-zinc-300">เลือกจากรูปสินค้า</p>
        <button onClick={onClose} className="text-xs text-zinc-500 hover:text-zinc-300"><X className="size-4" /></button>
      </div>
      {loading ? (
        <p className="py-3 text-center text-xs text-zinc-500"><Loader2 className="inline size-4 animate-spin" /> กำลังโหลด...</p>
      ) : assets.length === 0 ? (
        <p className="py-3 text-center text-xs text-zinc-500">ยังไม่มีรูปในคลังสินค้า — อัปโหลดจากเครื่องแทน</p>
      ) : (
        <div className="grid max-h-56 grid-cols-4 gap-1.5 overflow-y-auto">
          {assets.map((a) => (
            <PickerThumb key={a.id} asset={a} onPick={() => onPick(a)} />
          ))}
        </div>
      )}
    </div>
  );
}

function PickerThumb({ asset, onPick }: { asset: Asset; onPick: () => void }) {
  const url = useAssetImage(asset.id);
  return (
    <button
      type="button"
      onClick={onPick}
      title={asset.originalFilename}
      className="aspect-square overflow-hidden rounded-lg border border-zinc-800 hover:border-amber-400"
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={asset.originalFilename} className="h-full w-full object-cover" />
      ) : (
        <span className="block h-full w-full animate-pulse bg-zinc-800" />
      )}
    </button>
  );
}

function ProductReviewInfoCard({
  job,
  showToast,
  onJobUpdated,
}: {
  job: ClipJobDetail;
  showToast: (msg: string) => void;
  onJobUpdated: () => Promise<void>;
}) {
  const [product, setProduct] = useState<Product | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [expanded, setExpanded] = useState(false); // แผงเต็ม (แก้ brief + โจทย์ job)
  const jb = (job.subjectBrief ?? {}) as SubjectBrief;
  const [angle, setAngle] = useState(jb.angle ?? "");
  const [promo, setPromo] = useState(jb.promo ?? "");
  const [note, setNote] = useState(jb.note ?? "");
  const [reviewsSel, setReviewsSel] = useState<string[]>(jb.reviews ?? []); // 💬 เสียงลูกค้าที่เลือก
  const [imgSel, setImgSel] = useState<Set<string>>(new Set()); // 🖼️ ติ๊กหลายรูป → โหลดรวดเดียว
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [editingReviews, setEditingReviews] = useState(false); // เปิด checkbox list แก้การเลือก
  const [savingJb, setSavingJb] = useState(false);

  useEffect(() => {
    if (!job.productId) return;
    api<Product>(`/products/${job.productId}`)
      .then(setProduct)
      .catch(() => setProduct(null));
    fetchEntityImageAssets("product", job.productId)
      .then(setAssets)
      .catch(() => setAssets([]));
  }, [job.productId]);

  // sync draft โจทย์ job หลัง reload (แก้จากที่อื่น/แท็บอื่น)
  const jbKey = JSON.stringify([jb.angle ?? "", jb.promo ?? "", jb.note ?? "", jb.reviews ?? []]);
  useEffect(() => {
    setAngle(jb.angle ?? "");
    setPromo(jb.promo ?? "");
    setNote(jb.note ?? "");
    setReviewsSel(jb.reviews ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jbKey]);

  // PATCH subjectBrief ทั้งก้อน (angle/promo/note/reviews จาก state ที่ sync กับ job) — ไม่ clobber กัน
  async function saveJobBrief() {
    setSavingJb(true);
    try {
      await updateClipJob(job.id, {
        subjectBrief: {
          ...(angle.trim() ? { angle: angle.trim() } : {}),
          ...(promo.trim() ? { promo: promo.trim() } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
          ...(reviewsSel.length > 0 ? { reviews: reviewsSel.slice(0, REVIEW_PICK_MAX) } : {}),
        },
      });
      await onJobUpdated();
      showToast("บันทึกโจทย์ของคลิปนี้แล้ว");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSavingJb(false);
    }
  }

  if (!job.productId) return null;
  const brief = product?.reviewBrief ?? null;
  const briefReady = hasReviewBrief(brief);
  const highlights = (brief?.highlights ?? []).filter((h) => h.trim());
  const jobBriefSummary = [
    jb.angle?.trim() ? `${jb.angle.trim()}` : null,
    jb.promo?.trim() ? `${jb.promo.trim()}` : null,
    jb.note?.trim() ? `${jb.note.trim()}` : null,
  ].filter(Boolean);

  const inputCls =
    "w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm outline-none focus:border-amber-400";

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-zinc-200"><ClipboardList className="inline size-4" /> ข้อมูลสินค้า (ดึงจากตัวสินค้า)</h3>
        {product &&
          (briefReady ? (
            <span className="rounded-full bg-emerald-900/70 px-2 py-0.5 text-[11px] text-emerald-200">
              มีข้อมูลรีวิวแล้ว — จุดเด่น {highlights.length} ข้อ
            </span>
          ) : (
            <span className="rounded-full bg-amber-900/70 px-2 py-0.5 text-[11px] text-amber-200">
              <TriangleAlert className="inline size-4" /> ยังไม่มีข้อมูลรีวิว — AI จะเดาจากชื่อ
            </span>
          ))}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="ml-auto rounded-lg border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
        >
          {expanded ? "ซ่อน" : briefReady ? "ดู/แก้" : "กรอกเลย"}
        </button>
      </div>

      {/* สรุปย่อ (ตอนพับ) */}
      {!expanded && briefReady && (
        <p className="mt-2 line-clamp-2 text-xs text-zinc-400">
          <Sparkles className="inline size-4" /> {highlights.slice(0, 5).join(" · ")}
          {brief?.promo?.trim() ? ` · ${brief.promo.trim()}` : ""}
        </p>
      )}
      {!expanded && jobBriefSummary.length > 0 && (
        <p className="mt-1 truncate text-xs text-zinc-500">
          โจทย์ของคลิปนี้: {jobBriefSummary.join(" / ")}
        </p>
      )}

      {/* รูปรีวิวของสินค้า — คลิก = ก๊อปทีละรูป / ติ๊กหลายรูป → ⬇️ โหลดรวดเดียวแล้วลากทั้งก้อนเข้า Flow/ChatGPT */}
      {assets.length > 0 && (
        <>
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {assets.map((a) => (
              <ProductRefThumb
                key={a.id}
                asset={a}
                selected={imgSel.has(a.id)}
                onToggleSelect={() =>
                  setImgSel((s) => {
                    const n = new Set(s);
                    if (n.has(a.id)) n.delete(a.id);
                    else n.add(a.id);
                    return n;
                  })
                }
                onCopy={() => {
                  copyAssetImageToClipboard(a.id)
                    .then(() => showToast("ก๊อปรูปแล้ว — วางใน Flow/ChatGPT ได้เลย"))
                    .catch(() => showToast("ก๊อปรูปไม่สำเร็จ — ลองดาวน์โหลดแทน"));
                }}
              />
            ))}
          </div>
          {imgSel.size > 0 && (
            <div className="mt-1.5 flex items-center gap-2">
              <button
                disabled={bulkDownloading}
                onClick={async () => {
                  setBulkDownloading(true);
                  try {
                    const picked = assets.filter((a) => imgSel.has(a.id));
                    for (const a of picked) await downloadAssetFile(a);
                    showToast(`โหลด ${picked.length} รูปแล้ว — ลากทั้งก้อนจาก Downloads เข้า Flow/ChatGPT ได้เลย`);
                  } catch {
                    showToast("โหลดบางรูปไม่สำเร็จ");
                  } finally {
                    setBulkDownloading(false);
                  }
                }}
                className="rounded-lg bg-amber-400 px-2.5 py-1 text-xs font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
              >
                {bulkDownloading ? "กำลังโหลด..." : `โหลดรูปที่เลือก (${imgSel.size})`}
              </button>
              <button
                onClick={() => setImgSel(new Set())}
                className="rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800"
              >
                ล้างที่เลือก
              </button>
            </div>
          )}
        </>
      )}

      {/* 💬 เสียงลูกค้าที่เลือกเข้า prompt (subjectBrief.reviews) — chips + แก้การเลือก */}
      <div className="mt-2 rounded-xl border border-zinc-800 bg-zinc-950/40 p-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[11px] font-semibold text-zinc-400">
            <MessageSquare className="inline size-4" /> เสียงลูกค้าในคลิปนี้{" "}
            <span className="font-normal text-zinc-500">
              ({reviewsSel.length}/{REVIEW_PICK_MAX} — AI paraphrase เป็น hook/บทพูด)
            </span>
          </p>
          <button
            onClick={() => setEditingReviews((v) => !v)}
            className="ml-auto rounded-lg border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-zinc-800"
          >
            {editingReviews ? "ซ่อน" : "แก้การเลือก"}
          </button>
        </div>
        {reviewsSel.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {reviewsSel.map((r) => (
              <span
                key={r}
                title={r}
                className="max-w-full truncate rounded-lg bg-amber-400/10 px-2 py-0.5 text-[11px] text-amber-200"
              >
                <Star className="inline size-4" /> {r}
              </span>
            ))}
          </div>
        ) : (
          !editingReviews && (
            <p className="mt-1 text-[11px] text-zinc-600">
              ยังไม่ได้เลือก — กด &ldquo;แก้การเลือก&rdquo; เพื่อติ๊กรีวิวจริง 4-5 ดาวจากคลังของสินค้า
            </p>
          )
        )}
        {editingReviews && (
          <div className="mt-2 space-y-2">
            <ReviewVoicePicker
              productId={job.productId}
              productCode={product?.displayCode}
              selected={reviewsSel}
              onChange={setReviewsSel}
            />
            <div className="flex items-center gap-2">
              <button
                onClick={() => void saveJobBrief()}
                disabled={savingJb}
                className="rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-semibold text-zinc-900 hover:bg-amber-300 disabled:opacity-50"
              >
                {savingJb ? "กำลังบันทึก..." : "บันทึกการเลือก"}
              </button>
              <span className="text-[11px] text-zinc-500">
                <Lightbulb className="inline size-4" /> บันทึกแล้วกด &ldquo;<RefreshCw className="inline size-4" /> ขอแนวใหม่&rdquo; หรือแตก Storyboard ใหม่ เพื่อให้ AI ใช้เสียงลูกค้าชุดล่าสุด
              </span>
            </div>
          </div>
        )}
      </div>

      {expanded && (
        <div className="mt-3 space-y-3">
          {product ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
              <ProductBriefEditor
                productId={product.id}
                initial={product.reviewBrief ?? null}
                extractAssets={assets}
                onSaved={(b) => setProduct((cur) => (cur ? { ...cur, reviewBrief: b } : cur))}
              />
            </div>
          ) : (
            <p className="text-xs text-zinc-500"><Loader2 className="inline size-4 animate-spin" /> กำลังโหลดข้อมูลสินค้า...</p>
          )}

          {/* โจทย์ระดับ job — เฉพาะคลิปนี้ (PATCH job.subjectBrief) */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
            <p className="mb-2 text-xs font-semibold text-zinc-300">
              <Target className="inline size-4" /> โจทย์ของคลิปนี้ <span className="font-normal text-zinc-500">(เฉพาะ job นี้ — ไม่เก็บที่ตัวสินค้า)</span>
            </p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-zinc-400"><Clapperboard className="inline size-4" /> มุมที่อยากตี</label>
                <input value={angle} onChange={(e) => setAngle(e.target.value)} placeholder="เช่น เน้นใช้ก่อนออกแดด" className={inputCls} />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-zinc-400"><Tag className="inline size-4" /> โปร/ดีลช่วงนี้</label>
                <input value={promo} onChange={(e) => setPromo(e.target.value)} placeholder="เช่น 9.9 ลดเหลือ 199.-" className={inputCls} />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-zinc-400"><StickyNote className="inline size-4" /> โน้ตถึง AI</label>
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น อยากได้โทนตลก ๆ" className={inputCls} />
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={() => void saveJobBrief()}
                disabled={savingJb}
                className="rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-semibold text-zinc-900 hover:bg-amber-300 disabled:opacity-50"
              >
                {savingJb ? "กำลังบันทึก..." : "บันทึกโจทย์คลิปนี้"}
              </button>
              <span className="text-[11px] text-zinc-500">
                <Lightbulb className="inline size-4" /> แก้ข้อมูลแล้วกด &ldquo;<RefreshCw className="inline size-4" /> ขอแนวใหม่&rdquo; หรือ &ldquo;แตก Storyboard&rdquo; ใหม่ เพื่อให้ AI ใช้ข้อมูลล่าสุด
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 🚫 Banned Words scanner chips — ใต้ช่องข้อความพูด/ขึ้นจอทุกช่อง ──
// scan สดฝั่ง client ด้วย matcher ตัวเดียวกับ API (lib/banned-words.ts) — 🔴 ban กด [แทนที่] ได้, 🟡 risky = เตือน
function BannedScanChips({
  text,
  words,
  platform,
  onReplace,
}: {
  text: string | null | undefined;
  words: BannedWord[];
  platform?: string;
  onReplace?: (newText: string, match: BannedMatch) => void;
}) {
  const matches = scanText(text, words, platform);
  if (matches.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {matches.map((m) => (
        <span
          key={m.term}
          className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] ${
            m.severity === "ban"
              ? "bg-red-950/60 text-red-200 ring-1 ring-red-800"
              : "bg-amber-950/50 text-amber-200 ring-1 ring-amber-800/60"
          }`}
        >
          <span className={`size-2 rounded-full ${m.severity === "ban" ? "bg-red-500" : "bg-amber-500"}`} /> &ldquo;{m.term}&rdquo;
          {m.replacement && (
            <>
              <span className="inline-flex items-center gap-1 text-zinc-400"><ArrowRight className="size-3.5" /> แนะนำ: {m.replacement}</span>
              {onReplace && (
                <button
                  type="button"
                  onClick={() => onReplace(replaceMatches(text ?? "", [m]), m)}
                  className="rounded bg-zinc-100/10 px-1.5 py-0.5 font-semibold hover:bg-zinc-100/20"
                >
                  แทนที่
                </button>
              )}
            </>
          )}
        </span>
      ))}
    </div>
  );
}

// แปลง shot (detail) → payload replace-set โดยไม่ทำข้อมูลหาย (reorder/ลบ/เพิ่ม)
function toShotInput(s: ClipShot): ClipShotInput {
  return {
    section: s.section,
    title: s.title ?? undefined,
    sceneType: s.sceneType,
    voiceType: s.voiceType ?? undefined,
    onScreenText: s.onScreenText ?? undefined,
    gestureId: s.gestureId ?? undefined,
    handId: s.handId ?? undefined,
    cameraId: s.cameraId ?? undefined,
    lightingId: s.lightingId ?? undefined,
    durationSec: s.durationSec ?? undefined,
    dialogue: s.dialogue ?? undefined,
    stillPrompt: s.stillPrompt ?? undefined,
    motionPrompt: s.motionPrompt ?? undefined,
    negativePrompt: s.negativePrompt ?? undefined,
    stillAssetId: s.stillAssetId ?? undefined,
    videoUrl: s.videoUrl ?? undefined,
    status: s.status,
    note: s.note ?? undefined,
  };
}

interface CharacterOption {
  id: string;
  nameTh: string;
  displayCode: string;
}

interface WardrobeOption {
  id: string;
  name: string;
  description?: string | null;
}

// 🖍️ ShotSketch — ภาพสเก็ตช์ storyboard วาดจากข้อมูล shot (ชนิดฉาก/เห็นสินค้า/มุมกล้อง/บทพูด)
// โชว์แทน placeholder ตอนยังไม่มีภาพจริง — เห็นทันทีว่า prompt จะออกมาเป็นภาพแนวไหน
function ShotSketch({
  sceneType,
  showProduct,
  hasDialogue,
  cameraHint,
  section,
}: {
  sceneType: string;
  showProduct: boolean;
  hasDialogue: boolean;
  cameraHint: string;
  section: string;
}) {
  const topView = /top view|flat lay|มุมบน/i.test(cameraHint);
  const closeUp = /close|macro|โคลส|tight/i.test(cameraHint);
  const accent =
    section === "hook" ? "#f59e0b" : section === "cta" ? "#8b5cf6" : section === "result" ? "#10b981" : "#38bdf8";
  const ink = "#a1a1aa";
  const dim = "#52525b";
  const productBox = (x: number, y: number, w: number, h: number) => (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={3} fill="none" stroke={accent} strokeWidth={2.5} />
      <line x1={x + 3} y1={y + h * 0.35} x2={x + w - 3} y2={y + h * 0.35} stroke={accent} strokeWidth={1.5} />
      <line x1={x + 3} y1={y + h * 0.55} x2={x + w * 0.65} y2={y + h * 0.55} stroke={dim} strokeWidth={1.2} />
      <rect x={x + w * 0.3} y={y - 5} width={w * 0.4} height={5} fill="none" stroke={accent} strokeWidth={1.5} />
    </g>
  );
  return (
    <svg viewBox="0 0 90 160" className="h-full w-full">
      {/* เส้นขอบเฟรม + พื้นหลัง */}
      <rect x="2" y="2" width="86" height="156" rx="6" fill="none" stroke={dim} strokeWidth="1" strokeDasharray="3 3" />
      {sceneType === "presenter" ? (
        <g>
          {/* คนหันหน้ากล้อง: หัว + ไหล่ */}
          <circle cx="45" cy={closeUp ? 62 : 52} r={closeUp ? 22 : 16} fill="none" stroke={ink} strokeWidth="2.5" />
          <circle cx={45 - (closeUp ? 8 : 5.5)} cy={closeUp ? 58 : 49} r="1.8" fill={ink} />
          <circle cx={45 + (closeUp ? 8 : 5.5)} cy={closeUp ? 58 : 49} r="1.8" fill={ink} />
          <path d={closeUp ? "M 39 70 Q 45 75 51 70" : "M 41 58 Q 45 61 49 58"} fill="none" stroke={ink} strokeWidth="2" strokeLinecap="round" />
          <path d={closeUp ? "M 10 160 Q 12 105 45 100 Q 78 105 80 160" : "M 16 160 Q 18 82 45 76 Q 72 82 74 160"} fill="none" stroke={ink} strokeWidth="2.5" />
          {showProduct && productBox(54, closeUp ? 108 : 92, 20, 34)}
          {hasDialogue && (
            <g>
              <path d="M 62 22 Q 62 12 74 12 Q 86 12 86 21 Q 86 30 74 30 L 70 30 L 66 36 L 67 30 Q 62 29 62 22" fill="none" stroke={accent} strokeWidth="1.8" />
              <circle cx="70" cy="21" r="1.3" fill={accent} />
              <circle cx="75" cy="21" r="1.3" fill={accent} />
              <circle cx="80" cy="21" r="1.3" fill={accent} />
            </g>
          )}
        </g>
      ) : sceneType === "product_only" ? (
        <g>
          {topView ? (
            <g>
              {/* มุมบน: โต๊ะกลม + สินค้าจากด้านบน */}
              <ellipse cx="45" cy="80" rx="36" ry="30" fill="none" stroke={dim} strokeWidth="1.5" />
              <circle cx="45" cy="78" r="14" fill="none" stroke={accent} strokeWidth="2.5" />
              <circle cx="45" cy="78" r="6" fill="none" stroke={accent} strokeWidth="1.5" />
              <line x1="34" y1="100" x2="56" y2="100" stroke={dim} strokeWidth="1.2" />
            </g>
          ) : (
            <g>
              <line x1="10" y1="112" x2="80" y2="112" stroke={dim} strokeWidth="1.5" />
              {productBox(32, 58, 26, 54)}
              <line x1="18" y1="48" x2="24" y2="54" stroke={accent} strokeWidth="1.2" />
              <line x1="72" y1="48" x2="66" y2="54" stroke={accent} strokeWidth="1.2" />
            </g>
          )}
          {hasDialogue && (
            <g>
              <rect x="58" y="10" width="26" height="16" rx="6" fill="none" stroke={accent} strokeWidth="1.6" strokeDasharray="3 2" />
              <circle cx="66" cy="18" r="1.2" fill={accent} />
              <circle cx="71" cy="18" r="1.2" fill={accent} />
              <circle cx="76" cy="18" r="1.2" fill={accent} />
            </g>
          )}
        </g>
      ) : (
        <g>
          {/* เห็นแค่มือ: สองมือจากขอบล่าง */}
          {topView && <ellipse cx="45" cy="78" rx="36" ry="30" fill="none" stroke={dim} strokeWidth="1.2" />}
          <path d="M 12 160 Q 14 128 26 118 Q 33 112 38 116 L 34 124" fill="none" stroke={ink} strokeWidth="2.5" strokeLinecap="round" />
          <path d="M 78 160 Q 76 128 64 118 Q 57 112 52 116 L 56 124" fill="none" stroke={ink} strokeWidth="2.5" strokeLinecap="round" />
          {showProduct ? (
            productBox(34, 74, 22, 40)
          ) : (
            <circle cx="45" cy="92" r="13" fill="none" stroke={ink} strokeWidth="2" strokeDasharray="4 3" />
          )}
          {hasDialogue && (
            <g>
              <rect x="56" y="10" width="28" height="16" rx="6" fill="none" stroke={accent} strokeWidth="1.6" strokeDasharray="3 2" />
              <circle cx="64" cy="18" r="1.2" fill={accent} />
              <circle cx="70" cy="18" r="1.2" fill={accent} />
              <circle cx="76" cy="18" r="1.2" fill={accent} />
            </g>
          )}
        </g>
      )}
      {!showProduct && sceneType !== "product_only" && (
        <g>
          {/* ซ่อนสินค้า: กล่องขีดคร่อมุม */}
          <rect x="6" y="140" width="12" height="14" rx="2" fill="none" stroke={dim} strokeWidth="1.3" />
          <line x1="5" y1="155" x2="19" y2="139" stroke={dim} strokeWidth="1.5" />
        </g>
      )}
    </svg>
  );
}

export default function ClipJobBoardPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  // 🧪 QC พรอมป์ของ shot — เทียบ prompt กับสเปค (บท/เวลา/สัญญาเสียง/long take) + ปุ่มปรับอัตโนมัติ
  interface DeepQc {
    usageActionOk: boolean; usageActionIssue: string; suggestedActionEn: string;
    firstFrameOk: boolean; firstFrameIssue: string; suggestedFirstFrameEn: string;
    speechLockOk: boolean; speechLockIssue: string; suggestedSpeechFixEn: string;
    otherIssues: string[];
  }
  interface PromptQcResult {
    error?: string;
    pass?: boolean;
    issues?: string[];
    checklist?: { label: string; ok: boolean }[]; // 📋 ทุกข้อที่ตรวจพร้อมผล
    fixableCount?: number;
    needManualScriptTrim?: boolean;
    fixed?: boolean;
    issuesBefore?: string[];
    durationSec?: number;
    speechSec?: number;
    dialogueSyllables?: number;
    syllableBudget?: number;
    deep?: DeepQc;
  }
  const [qcShotId, setQcShotId] = useState<string | null>(null);
  const [qcBusy, setQcBusy] = useState(false);
  // 🧪 เก็บผล QC ราย shot — กด shot อื่นแล้วผลเก่าไม่หาย แสดงค้างทุกตัว
  const [qcResults, setQcResults] = useState<Record<string, PromptQcResult>>({});
  // ⏳ สถานะกำลังทำงาน — โชว์ overlay หมุน + ล็อกทั้งหน้ากันกดซ้อน
  const [working, setWorking] = useState<string | null>(null);

  async function runQc(shotId: string, fix = false, silent = false) {
    if (!silent) {
      setQcShotId(shotId);
      setQcBusy(true);
      setWorking(`qc:${shotId}`);
    }
    try {
      const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
      const token = getToken();
      const res = await fetch(`${base}/clip-jobs/${id}/shots/${shotId}/prompt-qc`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ fix, deep: true }), // 🔬 วิเคราะห์ลึกด้วย AI ทุกครั้ง
      });
      const data: PromptQcResult & { message?: string } = await res.json();
      if (!res.ok) throw new Error(data?.message ?? "QC ไม่สำเร็จ");
      setQcResults((m) => ({ ...m, [shotId]: data }));
      if (data.fixed) await reload();
    } catch (e) {
      setQcResults((m) => ({ ...m, [shotId]: { error: e instanceof Error ? e.message : "QC ไม่สำเร็จ" } }));
    } finally {
      if (!silent) {
        setQcBusy(false);
        setWorking(null);
      }
    }
  }

  // 🔍 Vision QC ภาพนิ่ง / ✂️ ตัดบท / 📊 ผลเจน / 🧪 QC ทั้งบอร์ด
  interface StillQcRes { matchScore: number; verdict: "pass" | "warn" | "fail"; diffs: string[]; fixHints: string[]; handsOk?: boolean; handIssue?: string }
  const [stillQc, setStillQc] = useState<{ shotId: string; busy: boolean; data?: StillQcRes; error?: string } | null>(null);
  const [trimRes, setTrimRes] = useState<{ shotId: string; busy: boolean; original?: string; trimmed?: string; budget?: number; trimmedSyllables?: number; error?: string } | null>(null);
  const [genLog, setGenLog] = useState<Record<string, { ok: boolean; reasons: string[] }>>({});
  const [genReasonPick, setGenReasonPick] = useState<string | null>(null); // shotId ที่กำลังเลือกสาเหตุพัง
  const [qcAll, setQcAll] = useState<{ busy: boolean; results?: { shotId: string; order: number; title: string; pass: boolean; issues: string[]; passesFixable?: boolean; warnings?: string[]; stalled?: boolean; rounds?: number }[]; passCount?: number; fixableCount?: number; total?: number } | null>(null);
  const [genStats, setGenStats] = useState<{ pass: number; fail: number; total: number; reasons: { reason: string; count: number }[] } | null>(null);
  const GEN_REASONS = ["สินค้าเพี้ยน", "ฉลากเพี้ยน", "พูดแถมนอกสคริปต์", "พูดเกินเวลา", "ตัดสลับฉากเอง", "มือ/นิ้วเพี้ยน", "หน้าเปลี่ยน", "อื่นๆ"];

  const rawPost = useCallback(async (path: string, body?: unknown) => {
    const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
    const token = getToken();
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await res.json()) as Record<string, unknown> & { message?: string };
    if (!res.ok) throw new Error(data?.message ?? "ทำรายการไม่สำเร็จ");
    return data;
  }, []);

  async function runStillQc(shotId: string) {
    setStillQc({ shotId, busy: true });
    setWorking(`still:${shotId}`);
    try {
      const data = (await rawPost(`/clip-jobs/${id}/shots/${shotId}/still-qc`)) as unknown as StillQcRes;
      setStillQc({ shotId, busy: false, data });
    } catch (e) {
      setStillQc({ shotId, busy: false, error: e instanceof Error ? e.message : "เทียบรูปไม่สำเร็จ" });
    } finally {
      setWorking(null);
    }
  }

  async function runTrim(shotId: string) {
    setTrimRes({ shotId, busy: true });
    setWorking(`trim:${shotId}`);
    try {
      const data = (await rawPost(`/clip-jobs/${id}/shots/${shotId}/trim-dialogue`)) as unknown as {
        original: string; trimmed: string; budget: number; trimmedSyllables: number;
      };
      setTrimRes({ shotId, busy: false, ...data });
    } catch (e) {
      setTrimRes({ shotId, busy: false, error: e instanceof Error ? e.message : "ตัดบทไม่สำเร็จ" });
    } finally {
      setWorking(null);
    }
  }

  async function applyTrim(shotId: string) {
    if (!trimRes?.trimmed) return;
    setWorking(`applytrim:${shotId}`);
    try {
      await api(`/clip-jobs/${id}/shots/${shotId}`, { method: "PATCH", body: JSON.stringify({ dialogue: trimRes.trimmed }) });
      await recomposeClipShot(id, shotId); // ใช้ helper เดิมของระบบ
      setTrimRes(null);
      await reload();
      showToast("ใช้บทใหม่ + recompose แล้ว");
      await runQc(shotId);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "ใช้บทใหม่ไม่สำเร็จ");
    } finally {
      setWorking(null);
    }
  }

  async function saveGenResult(shotId: string, ok: boolean, reasons: string[]) {
    setGenLog((m) => ({ ...m, [shotId]: { ok, reasons } }));
    try {
      await rawPost(`/clip-jobs/${id}/shots/${shotId}/gen-result`, { ok, reasons });
    } catch {
      showToast("บันทึกผลไม่สำเร็จ");
    }
  }

  async function runQcAll() {
    setQcAll({ busy: true });
    setWorking("qcall");
    try {
      const data = (await rawPost(`/clip-jobs/${id}/prompt-qc-all`, { fix: true, deep: true })) as unknown as {
        results: { shotId: string; order: number; title: string; pass: boolean; issues: string[]; passesFixable?: boolean; warnings?: string[]; stalled?: boolean; rounds?: number }[];
        passCount: number; fixableCount?: number; total: number;
      };
      setQcAll({ busy: false, ...data });
      const done = data.passCount;
      const fixable = data.fixableCount ?? data.passCount;
      const tot = data.total;
      showToast(
        done === tot
          ? `✅ วนแก้ครบทุก shot — เขียวหมดทั้ง ${tot} shot`
          : `✅ เครื่องแก้ครบ ${fixable}/${tot} shot — ⚠️ เหลือ ${tot - fixable} shot ที่ต้องทำเอง (เช่น วิเคราะห์ Product Sheet) — ดูแผงราย shot`,
      );
      await reload();
      // 📋 เติมแผง QC ละเอียดราย shot ทุกตัว (checklist+deep) — เหมือนไล่กดทีละ shot
      const ids = (data.results ?? []).map((r) => r.shotId);
      for (const sid of ids) {
        await runQc(sid, false, true); // silent — ไม่ยึด working, แค่เติม qcResults
      }
    } catch (e) {
      setQcAll({ busy: false });
      showToast(e instanceof Error ? e.message : "QC ทั้งบอร์ดไม่สำเร็จ");
    } finally {
      setWorking(null);
    }
  }

  async function loadGenStats() {
    try {
      const data = await api<{ pass: number; fail: number; total: number; reasons: { reason: string; count: number }[] }>("/clip-jobs/gen-stats");
      setGenStats(data);
    } catch {
      showToast("โหลดสถิติไม่สำเร็จ");
    }
  }

  const [job, setJob] = useState<ClipJobDetail | null>(null);
  const [pack, setPack] = useState<ClipPackage | null>(null);
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── 3 stages ตาม mockup ──
  const [stage, setStage] = useState<1 | 2 | 3>(1);
  const stageInitialized = useRef(false);
  const [selConcept, setSelConcept] = useState<number | null>(null);
  const [conceptBusy, setConceptBusy] = useState(false);

  const [planning, setPlanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploadingShot, setUploadingShot] = useState<string | null>(null);
  const [popupDraft, setPopupDraft] = useState<Record<string, string>>({}); // onScreenText ต่อ shot
  const [editingShot, setEditingShot] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<ClipShotInput>>({});
  const [promptModal, setPromptModal] = useState<{ title: string; variants: PromptVariant[] } | null>(null);
  // 🔴 live viewer: เก็บแค่ shotId+kind แล้วประกอบเนื้อหาใหม่ทุก render — toggle เห็น/ซ่อนสินค้า, recompose,
  // แก้ dialogue ฯลฯ จะสะท้อนใน modal ที่เปิดอยู่ทันที (ไม่ snapshot ค้าง)
  const [promptRef, setPromptRef] = useState<{ shotId: string; kind: "still" | "motion" } | null>(null);

  // Resource Rail options
  const [characters, setCharacters] = useState<CharacterOption[]>([]);
  const [hands, setHands] = useState<HandProfile[]>([]);
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [wardrobes, setWardrobes] = useState<WardrobeOption[]>([]);
  const [voices, setVoices] = useState<VoiceProfile[]>([]);

  // 🚫 Banned Words Compliance — คลังคำ (cache ต่อ session) + สถานะ AI ตรวจเนียน
  const [bannedWords, setBannedWords] = useState<BannedWord[]>([]);
  const [blockNotice, setBlockNotice] = useState<string | null>(null); // จาก complianceBlock ตอน approve shot
  const [aiFindings, setAiFindings] = useState<AiReviewFinding[] | null>(null);
  const [aiReviewing, setAiReviewing] = useState(false);

  // แก้ headline/script/caption/hashtags/affiliateLink/voiceSpec แบบ draft-then-save
  const [headlineDraft, setHeadlineDraft] = useState<string | null>(null);
  const [voiceSpecDraft, setVoiceSpecDraft] = useState<string | null>(null);
  const [scriptDraft, setScriptDraft] = useState<string | null>(null);
  const [captionDraft, setCaptionDraft] = useState<string | null>(null);
  const [hashtagsDraft, setHashtagsDraft] = useState<string | null>(null);
  const [linkDraft, setLinkDraft] = useState<string | null>(null);
  const [finalVideoDraft, setFinalVideoDraft] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }, []);

  // 📊 โหลดผลเจนที่บันทึกไว้ของ job นี้
  useEffect(() => {
    void (async () => {
      try {
        const res = await api<{ log: Record<string, { ok: boolean; reasons: string[] }> }>(`/clip-jobs/${id}/gen-log`);
        setGenLog(res.log ?? {});
      } catch {
        /* ไม่มี log ก็ไม่เป็นไร */
      }
    })();
  }, [id]);

  const reload = useCallback(
    () =>
      fetchClipJob(id)
        .then((j) => {
          setJob(j);
          // เปิดหน้าครั้งแรก: มี shots → ② Storyboard, ready/published → ③ package, ไม่งั้น ① คอนเซปต์
          if (!stageInitialized.current) {
            stageInitialized.current = true;
            if (j.status === "ready" || j.status === "published") setStage(3);
            else if (j.shots.length > 0) setStage(2);
            else setStage(1);
            setSelConcept(j.selectedConceptIndex ?? null);
          }
        })
        .catch((e: unknown) => setError(e instanceof Error ? e.message : "โหลดไม่สำเร็จ")),
    [id],
  );

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    void reload();
    fetchClipStatus()
      .then((s) => setAiConfigured(s.configured))
      .catch(() => setAiConfigured(false));
    fetchActiveBannedWords()
      .then(setBannedWords)
      .catch(() => setBannedWords([])); // API เก่า/ยังไม่ seed → สแกนฝั่ง client เงียบไป (แบนเนอร์จาก API ยังทำงาน)
    // Resource Rail options
    api<{ items: CharacterOption[] }>("/characters?pageSize=100")
      .then((r) => setCharacters(r.items))
      .catch(() => setCharacters([]));
    fetchAllHands()
      .then((h) => setHands(h.filter((x) => x.status === "active" && !x.isChild)))
      .catch(() => setHands([]));
    api<{ items: LocationItem[] }>("/locations")
      .then((r) => setLocations((r.items ?? []).filter((l) => l.status !== "archived")))
      .catch(() => setLocations([]));
  }, [router, reload]);

  // ตู้เสื้อผ้า + เสียงของตัวละครที่เลือก (character → wardrobe/voice ของตัวนั้น)
  useEffect(() => {
    if (!job?.characterId) {
      setWardrobes([]);
      api<{ items: VoiceProfile[] }>("/voices")
        .then((r) => setVoices(r.items ?? []))
        .catch(() => setVoices([]));
      return;
    }
    api<WardrobeOption[]>(`/characters/${job.characterId}/wardrobe`)
      .then((r) => setWardrobes(Array.isArray(r) ? r : []))
      .catch(() => setWardrobes([]));
    api<{ items: VoiceProfile[] }>(`/voices?characterId=${job.characterId}`)
      .then((r) => setVoices(r.items ?? []))
      .catch(() => setVoices([]));
  }, [job?.characterId]);

  function copyText(text: string, label: string) {
    void navigator.clipboard
      .writeText(text)
      .then(() => showToast(`คัดลอก${label}แล้ว`))
      .catch(() => showToast("คัดลอกไม่สำเร็จ — ลองคลิกที่หน้าเว็บก่อนแล้วกดใหม่"));
  }

  // ── ① concepts ──
  async function onProposeConcepts() {
    if (!job) return;
    setConceptBusy(true);
    setError(null);
    try {
      const r = await proposeClipConcepts(job.id);
      await reload();
      setSelConcept(null);
      showToast(`AI เสนอแนวใหม่แล้ว (ชุดที่ ${r.setIndex + 1}${r.capReached ? " — ชุดสุดท้าย" : ""})`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ขอคอนเซปต์ไม่สำเร็จ");
    } finally {
      setConceptBusy(false);
    }
  }

  async function onPlan(conceptIndex: number | null) {
    if (!job) return;
    if (conceptIndex == null) {
      setStage(1);
      showToast("เลือกคอนเซปต์ก่อนแตก Storyboard");
      return;
    }
    if (job.shots.length > 0 && !window.confirm("แตก Storyboard ใหม่จะลบ shot เดิมทั้งชุดแล้วสร้างใหม่ — ยืนยัน?")) {
      return;
    }
    setPlanning(true);
    setError(null);
    try {
      const j = await planClipJob(job.id, conceptIndex);
      setJob(j);
      setStage(2);
      showToast("แตก Storyboard เสร็จแล้ว");
    } catch (e) {
      setError(e instanceof Error ? e.message : "แตก Storyboard ไม่สำเร็จ");
      void reload();
    } finally {
      setPlanning(false);
    }
  }

  async function saveJob(fields: Record<string, unknown>, label: string) {
    if (!job) return;
    setBusy(true);
    try {
      await updateClipJob(job.id, fields);
      await reload();
      showToast(`บันทึก${label}แล้ว`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  // ── Resource Rail — เลือกตัวละครแล้วแนะนำเสียงของตัวนั้นให้เลย (ตาม mockup) ──
  async function onSelectCharacter(charId: string) {
    if (!job) return;
    setBusy(true);
    try {
      await updateClipJob(job.id, { characterId: charId || null, wardrobeId: null, voiceProfileId: null });
      if (charId) {
        const v = await api<{ items: VoiceProfile[] }>(`/voices?characterId=${charId}`).catch(() => ({ items: [] as VoiceProfile[] }));
        const suggest = (v.items ?? []).find((x) => x.status !== "archived");
        if (suggest) {
          await updateClipJob(job.id, { voiceProfileId: suggest.id });
          const c = characters.find((x) => x.id === charId);
          showToast(`เลือก ${c?.nameTh ?? "ตัวละคร"} → เสียงแนะนำ: ${suggest.voiceType ?? "เสียงหลัก"}`);
        } else {
          showToast("เลือกตัวละครแล้ว — ตัวนี้ยังไม่มี Voice Profile ใช้เสียง default");
        }
      } else {
        showToast("เอาตัวละครออกแล้ว — AI จะสร้างคนให้เหมาะตัวถูกรีวิว");
      }
      await reload();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function onPatchShot(shotId: string, body: Record<string, unknown>, label: string) {
    if (!job) return;
    try {
      const res = await patchClipShot(job.id, shotId, body);
      // 🚫 approve ครบแล้วแต่ติดคำต้องห้าม → job ค้าง review — บอกเหตุผลชัด ๆ
      if (res.complianceBlock) {
        setBlockNotice(
          `Shot ผ่านครบแล้ว แต่ job ยังไม่ขยับเป็น "พร้อมโพสต์" — ติดคำต้องห้าม: ${res.complianceBlock.terms
            .map((t) => `"${t}"`)
            .join(", ")} (แก้ให้หมดแล้วระบบจะเลื่อนสถานะให้เอง)`,
        );
      } else {
        setBlockNotice(null);
      }
      await reload();
      showToast(label);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    }
  }

  // ── 🤖 AI ตรวจเนียน — semantic review จับการเลี่ยงคำ/เคลมแฝง (script + dialogue + caption + ข้อความขึ้นจอ) ──
  async function onAiReview() {
    if (!job) return;
    const combined = [
      job.headline ?? "",
      job.script ?? "",
      ...job.shots.map((s) => s.dialogue ?? ""),
      ...job.shots.map((s) => s.onScreenText ?? ""),
      job.caption ?? "",
      job.hashtags.join(" "),
    ]
      .filter(Boolean)
      .join("\n");
    if (!combined.trim()) {
      showToast("ยังไม่มีข้อความให้ตรวจ — แตก Storyboard/เขียนสคริปต์ก่อน");
      return;
    }
    setAiReviewing(true);
    setAiFindings(null);
    try {
      const res = await aiReviewBannedWords(combined, job.platform);
      setAiFindings(res.findings);
      showToast(
        res.findings.length === 0
          ? "AI ไม่พบจุดเสี่ยงเพิ่มเติม"
          : `AI พบจุดเสี่ยง ${res.findings.length} จุด`,
      );
    } catch (e) {
      showToast(e instanceof Error ? e.message : "AI ตรวจไม่สำเร็จ");
    } finally {
      setAiReviewing(false);
    }
  }

  const [pickerShot, setPickerShot] = useState<string | null>(null); // 🖼️ shot ที่เปิด picker เลือกรูปสินค้า

  // เลือกรูปจากคลังสินค้าเป็นภาพนิ่งของ shot — reuse asset เดิม ไม่ต้องอัปซ้ำ
  async function onPickProductImage(shot: ClipShot, asset: Asset) {
    setPickerShot(null);
    try {
      await patchClipShot(job!.id, shot.id, {
        stillAssetId: asset.id,
        ...(shot.status === "pending" ? { status: "generated" } : {}),
      });
      await reload();
      showToast("ใช้รูปจากคลังสินค้าแล้ว");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "เลือกรูปไม่สำเร็จ");
    }
  }

  async function onUploadStill(shot: ClipShot, file: File | undefined) {
    if (!job || !file) return;
    setUploadingShot(shot.id);
    try {
      const asset = await uploadAsset(file, {
        assetType: "clip_still",
        entityType: "clip_shot",
        entityId: shot.id,
        linkRole: "deliverable",
      });
      await patchClipShot(job.id, shot.id, {
        stillAssetId: asset.id,
        ...(shot.status === "pending" ? { status: "generated" } : {}),
      });
      await reload();
      showToast("อัปโหลดภาพนิ่งแล้ว");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ");
    } finally {
      setUploadingShot(null);
    }
  }

  async function onReplace(shots: ClipShotInput[], label: string) {
    if (!job) return;
    setBusy(true);
    try {
      const j = await replaceClipShots(job.id, shots);
      setJob(j);
      showToast(label);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  function moveShot(index: number, dir: -1 | 1) {
    if (!job) return;
    const next = job.shots.map(toShotInput);
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    void onReplace(next, "สลับลำดับแล้ว");
  }

  function removeShot(index: number) {
    if (!job) return;
    if (!window.confirm(`ลบ shot #${index + 1}?`)) return;
    const next = job.shots.map(toShotInput).filter((_, i) => i !== index);
    void onReplace(next, "ลบ shot แล้ว");
  }

  function addShot() {
    if (!job) return;
    const next = [...job.shots.map(toShotInput), { section: "interaction", sceneType: "hands" } as ClipShotInput];
    void onReplace(next, "เพิ่ม shot แล้ว");
  }

  // Flow policy — ผลตรวจต่อ shot (key = shotId)
  const [policyMap, setPolicyMap] = useState<Record<string, PolicyCheck>>({});
  const [policyBusy, setPolicyBusy] = useState<string | null>(null);

  const runPolicyCheck = useCallback(
    async (shotId: string) => {
      if (!job) return;
      try {
        const res = await checkShotPolicy(job.id, shotId);
        setPolicyMap((m) => ({ ...m, [shotId]: res }));
      } catch {
        /* เงียบ — ไม่ต้องรบกวน */
      }
    },
    [job],
  );

  // ตรวจอัตโนมัติทุก shot ที่มี prompt แล้ว เมื่อโหลด/เปลี่ยน job
  useEffect(() => {
    if (!job) return;
    for (const s of job.shots) {
      if (s.stillPrompt || s.motionPrompt) void runPolicyCheck(s.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id, job?.shots.map((s) => s.stillPrompt + (s.motionPrompt ?? "")).join("|")]);

  async function onAutoFixPolicy(shotId: string) {
    if (!job) return;
    setPolicyBusy(shotId);
    try {
      await autoFixShotPolicy(job.id, shotId);
      await reload();
      await runPolicyCheck(shotId);
      showToast("แก้พรอมป์ให้ผ่าน Flow แล้ว");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "แก้ไม่สำเร็จ");
    } finally {
      setPolicyBusy(null);
    }
  }

  async function onRecompose(shotId: string) {
    if (!job) return;
    try {
      await recomposeClipShot(job.id, shotId);
      await reload();
      showToast("ประกอบ prompt ใหม่แล้ว");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "recompose ไม่สำเร็จ");
    }
  }

  function openPrompt(shot: ClipShot, kind: "still" | "motion") {
    setPromptRef({ shotId: shot.id, kind });
  }

  // ประกอบเนื้อหา modal จาก shot ปัจจุบัน (เรียกทุก render ของ modal → live เสมอ)
  function buildPromptModalContent(
    shot: ClipShot,
    kind: "still" | "motion",
  ): { title: string; variants: PromptVariant[] } {
    const text = kind === "still" ? shot.stillPrompt : shot.motionPrompt;
    const internal = shot.negativePrompt
      ? [{ label: "Negative prompt (Grok เท่านั้น)", text: shot.negativePrompt }]
      : [];
    // 🖥️ v2.1 — ฉาก screen ไม่ใช่ prompt คู่: stillPrompt = ใบสั่ง Capture, motion = โน้ตตัดต่อ+เสียง
    if (shot.sceneType === "screen") {
      return {
        title: `${kind === "still" ? "ใบสั่ง Capture หน้าจอจริง" : "โน้ตตัดต่อ + เสียง"} — ฉาก ${shot.shotOrder + 1}`,
        variants: [
          {
            tool: "text",
            label: kind === "still" ? "ใบสั่ง Capture (ห้าม AI gen UI)" : "โน้ตตัดต่อ screen rec (+Voice/Dialogue)",
            text: text ?? "",
            hint:
              kind === "still"
                ? "ส่งใบสั่งนี้ให้ทีมอัด screen record จากระบบจริง แล้วโยนไฟล์เข้าโฟลเดอร์ Drive ของงาน — ห้ามใช้ AI gen UI"
                : "ใช้ตอนตัดต่อ screen recording — เสียงพากย์ gen/อัดจากบล็อก Voice+Dialogue แล้ววางทับ",
            internal: [],
          },
        ],
      };
    }
    return {
      title: `${kind === "still" ? "Prompt ภาพนิ่ง" : "Prompt วิดีโอ (+เสียงพูด)"} — ฉาก ${shot.shotOrder + 1}`,
      variants: [
        {
          tool: "text",
          label: kind === "still" ? "ภาพนิ่ง (ChatGPT/Grok)" : "วิดีโอ (Kling/Veo — มีบล็อก Voice+Dialogue)",
          text: text ?? "",
          hint:
            kind === "still"
              ? "วางใน ChatGPT/Grok เพื่อ gen ภาพนิ่ง แล้วอัปโหลดกลับที่ shot นี้"
              : "ใช้ภาพนิ่งของ shot นี้เป็น first frame แล้ววาง prompt นี้ใน Kling/Veo (เสียงพูดอยู่ในบล็อก Dialogue)",
          internal,
        },
      ],
    };
  }

  // 🎬 ก๊อป Prompt ทั้งชุด — รวมทุกฉากเรียงลำดับในหน้าต่างเดียว (still + motion ต่อฉาก)
  // แก้ปัญหา "หาปุ่มก๊อปไม่เจอ": ปุ่มต่อ shot ยังอยู่ แต่ตัวนี้เห็นชัดระดับหัวงาน
  function openAllPrompts() {
    if (!job || job.shots.length === 0) return;
    const shots = [...job.shots].sort((a, b) => a.shotOrder - b.shotOrder);
    const block = (s: ClipShot, kind: "still" | "motion") => {
      const label =
        s.sceneType === "screen"
          ? kind === "still"
            ? "ใบสั่ง Capture (ห้าม AI gen UI)"
            : "โน้ตตัดต่อ + เสียง"
          : kind === "still"
            ? "Prompt ภาพนิ่ง → ChatGPT/Grok"
            : "Prompt วิดีโอ → Kling/Veo (ใช้ภาพนิ่งเป็น first frame)";
      return `【 ${label} 】\n${(kind === "still" ? s.stillPrompt : s.motionPrompt) ?? "(ยังไม่มี — กด recompose ที่ shot)"}`;
    };
    const perShot = (kind: "still" | "motion" | "both") =>
      shots
        .map((s) => {
          const head = `═══════ ฉาก ${s.shotOrder + 1}${s.title ? ` — ${s.title}` : ""} (${s.sceneType === "presenter" ? "มีตัวละคร" : s.sceneType === "screen" ? "หน้าจอ" : s.sceneType === "product_only" ? "ไม่มีคน" : "เห็นแค่มือ"}) ═══════`;
          const parts =
            kind === "both" ? [block(s, "still"), block(s, "motion")] : [block(s, kind)];
          return [head, ...parts].join("\n\n");
        })
        .join("\n\n");
    setPromptModal({
      title: `Prompt ทั้งชุด — ${job.shots.length} ฉาก (เรียงลำดับ)`,
      variants: [
        {
          tool: "text",
          label: "ครบชุด (นิ่ง+วิดีโอทุกฉาก)",
          text: perShot("both"),
          hint: "workflow: gen ภาพนิ่งทีละฉาก → ใช้เป็น first frame แล้ว gen วิดีโอด้วย prompt ของฉากนั้น → วางไฟล์/ลิงก์กลับที่ shot",
          internal: [],
        },
        {
          tool: "text",
          label: "เฉพาะภาพนิ่ง",
          text: perShot("still"),
          hint: "รอบแรก: gen ภาพนิ่งทุกฉากก่อน (ChatGPT/Grok)",
          internal: [],
        },
        {
          tool: "text",
          label: "เฉพาะวิดีโอ",
          text: perShot("motion"),
          hint: "รอบสอง: เอาภาพนิ่งแต่ละฉากเป็น first frame แล้ววาง prompt วิดีโอใน Kling/Veo",
          internal: [],
        },
      ],
    });
  }

  const openPackage = useCallback(async () => {
    if (!job) return;
    try {
      const p = await fetchClipPackage(job.id);
      setPack(p);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "โหลด package ไม่สำเร็จ");
    }
  }, [job, showToast]);

  // เข้าสเตจ ③ → โหลด package สดเสมอ
  useEffect(() => {
    if (stage === 3 && job) void openPackage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, job?.updatedAt]);

  async function downloadStill(assetId: string, order: number) {
    try {
      const url = await fetchAssetObjectUrl(assetId);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${job?.displayCode ?? "clip"}-shot-${order + 1}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch {
      showToast("ดาวน์โหลดไม่สำเร็จ");
    }
  }

  async function onArchive() {
    if (!job) return;
    if (!window.confirm("เก็บ Clip Job นี้เข้ากรุ?")) return;
    try {
      await archiveClipJob(job.id);
      router.push("/clip-jobs");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "เก็บเข้ากรุไม่สำเร็จ");
    }
  }

  const st = job ? CLIP_JOB_STATUS_LABEL[job.status] ?? { label: job.status, cls: "bg-zinc-700 text-zinc-200" } : null;
  const subj = job ? CLIP_SUBJECT_LABEL[job.subjectType] ?? { label: job.subjectType, icon: "🎬" } : null;
  const brief = job?.subjectBrief ?? null;
  // 🚫 compliance: platform สำหรับ scanner ฝั่ง client + ผล scan จาก API (แนบมากับ detail)
  const scanPlatform = normalizeCompliancePlatform(job?.platform);
  const compliance = job?.compliance ?? null;
  const banMatches = (compliance?.matches ?? []).filter((m) => m.severity === "ban");
  const riskyMatches = (compliance?.matches ?? []).filter((m) => m.severity === "risky");

  const conceptSets = job?.conceptsJson?.sets ?? [];
  const currentSetIndex = job?.conceptsJson?.current ?? Math.max(0, conceptSets.length - 1);
  const currentConcepts = conceptSets[currentSetIndex] ?? [];
  const capReached = conceptSets.length >= 5;

  // resource hint (ตาม mockup — สรุปว่า resource ที่เลือกมีผลกับ prompt ยังไง)
  const resHints: string[] = [];
  if (job?.character) resHints.push(`ฉากมีตัวละคร → ใช้ Master Prompt เต็มของ ${job.character.nameTh} (reference + Do's&Don'ts)`);
  if (job?.wardrobe) resHints.push(`ล็อคชุด "${job.wardrobe.name}" ทุกฉากที่มีตัวละคร`);
  if (job?.hand) resHints.push(`ฉากเห็นมือ → ใช้ descriptor มือ ${job.hand.name} เดิมทุกฉาก`);
  if (job?.location) resHints.push(`ทุกฉากฝัง prompt+continuity ของ ${job.location.name} → คลิปดูถ่ายที่เดียวกันจริง`);

  const stepBtn = (n: 1 | 2 | 3, label: string) => (
    <button
      key={n}
      onClick={() => setStage(n)}
      className={`flex-1 rounded-xl border px-2 py-2 text-center text-xs transition-colors sm:text-sm ${
        stage === n
          ? "border-amber-400 bg-amber-400/10 font-semibold text-amber-300"
          : stage > n
            ? "border-emerald-700/60 text-emerald-300"
            : "border-zinc-700 text-zinc-500 hover:bg-zinc-800"
      }`}
    >
      {label}
    </button>
  );

  return (
    <AppShell title={job ? job.name : "Clip Job"}>
      {toast && (
        <div className="fixed right-6 top-20 z-50 rounded-lg bg-amber-400 px-4 py-2 text-sm font-medium text-zinc-900 shadow-lg">
          {toast}
        </div>
      )}
      {(() => {
        // live: ประกอบจาก shot ปัจจุบันเสมอ — toggle/recompose สะท้อนทันทีแม้ modal เปิดค้าง
        const liveShot = promptRef && job ? job.shots.find((x) => x.id === promptRef.shotId) : null;
        const modal = liveShot && promptRef ? buildPromptModalContent(liveShot, promptRef.kind) : promptModal;
        if (!modal) return null;
        return (
          <PromptViewerModal
            title={modal.title}
            variants={modal.variants}
            onClose={() => {
              setPromptRef(null);
              setPromptModal(null);
            }}
          />
        );
      })()}

      {error && (
        <div className="mb-4 rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">{error}</div>
      )}

      {!job ? (
        <p className="text-sm text-zinc-500">กำลังโหลด...</p>
      ) : (
        <div className="space-y-5">
          {/* ── header ── */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
            <div className="flex flex-wrap items-start gap-4">
              {job.productId && (
                <div className="w-24 shrink-0 overflow-hidden rounded-xl">
                  <CoverImage
                    entityType="product"
                    entityId={job.productId}
                    name={job.product?.name ?? job.name}
                    aspect="aspect-square"
                  />
                </div>
              )}
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => copyText(job.displayCode, `รหัสงาน ${job.displayCode} `)}
                    title="คลิกเพื่อคัดลอก Clip ID"
                    className="inline-flex items-center gap-1 rounded font-mono text-xs text-amber-300 hover:bg-amber-400/10 hover:underline"
                  >
                    {job.displayCode} <span aria-hidden><ClipboardList className="inline size-3.5" /></span>
                  </button>
                  {st && <span className={`rounded-full px-2 py-0.5 text-[11px] ${st.cls}`}>{st.label}</span>}
                  {subj && (
                    <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-300">
                      {subj.icon} {subj.label}
                    </span>
                  )}
                  <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400">
                    {job.outputType === "stills" ? "ชุดภาพนิ่ง" : "วิดีโอ"}
                  </span>
                  <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400">
                    CTA: {CTA_TYPE_LABEL[job.ctaType]?.label ?? job.ctaType}
                  </span>
                  {job.client && (
                    <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400">
                      <Handshake className="inline size-4" /> {job.client.name}
                    </span>
                  )}
                </div>
                <p className="text-sm text-zinc-300">
                  {subj?.icon} {job.subject?.name ?? job.product?.name ?? brief?.name ?? "—"}{" "}
                  {job.product && <span className="font-mono text-[10px] text-zinc-500">({job.product.displayCode})</span>}
                  {brief?.category && <span className="ml-1 text-zinc-500">· {brief.category}</span>}
                  {brief?.address && <span className="ml-1 text-zinc-500">· <MapPin className="inline size-4" /> {brief.address}</span>}
                </p>
                <p className="text-xs text-zinc-500">
                  {job.platform ?? "—"} · {job.aspectRatio ?? "9:16"} ·{" "}
                  {job.targetDurationSec ? `เป้า ${job.targetDurationSec} วิ` : "ไม่กำหนดความยาว"}
                </p>
                {/* affiliate / booking link editable */}
                <div className="flex max-w-xl items-center gap-2 pt-1">
                  <input
                    value={linkDraft ?? job.affiliateLink ?? ""}
                    onChange={(e) => setLinkDraft(e.target.value)}
                    placeholder={job.ctaType === "booking" ? "ลิงก์จองที่พัก (OTA)..." : "ลิงก์ affiliate/ลิงก์ร้าน..."}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs outline-none focus:border-amber-400"
                  />
                  {linkDraft !== null && linkDraft !== (job.affiliateLink ?? "") ? (
                    <button
                      onClick={() => {
                        void saveJob({ affiliateLink: linkDraft }, "ลิงก์");
                        setLinkDraft(null);
                      }}
                      className="shrink-0 rounded-lg bg-amber-400 px-2 py-1 text-xs font-semibold text-zinc-900"
                    >
                      บันทึก
                    </button>
                  ) : (
                    job.affiliateLink && (
                      <button
                        onClick={() => copyText(job.affiliateLink ?? "", "ลิงก์")}
                        className="shrink-0 rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                      >
                        <ClipboardList className="size-4" />
                      </button>
                    )
                  )}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <div className="flex gap-2">
                  <button
                    onClick={onAiReview}
                    disabled={aiReviewing || aiConfigured === false}
                    title={
                      aiConfigured === false
                        ? "AI ยังไม่ได้ตั้งค่า — ตั้ง ANTHROPIC_API_KEY ใน Settings ก่อน"
                        : "AI ตรวจการเลี่ยงคำต้องห้าม/เคลมแฝง ใน script + บทพูด + ข้อความขึ้นจอ + caption"
                    }
                    className="rounded-lg border border-purple-700 px-3 py-1.5 text-xs text-purple-300 hover:bg-purple-900/30 disabled:opacity-50"
                  >
                    {aiReviewing ? "กำลังตรวจ..." : "AI ตรวจเนียน"}
                  </button>
                  <button
                    onClick={openAllPrompts}
                    disabled={!job || job.shots.length === 0}
                    title={
                      job && job.shots.length > 0
                        ? "รวม prompt ทุกฉากเรียงลำดับ — ก๊อปไป gen ภาพ/วิดีโอได้ทันที"
                        : "ต้องวางแผนให้มี shot ก่อน ถึงจะมี prompt ให้ก๊อป"
                    }
                    className="rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-40"
                  >
                    <Clapperboard className="inline size-4" /> ก๊อป Prompt ทั้งชุด
                  </button>
                  <button
                    onClick={onArchive}
                    className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800"
                  >
                    เก็บเข้ากรุ
                  </button>
                </div>
                {aiConfigured === false && (
                  <p className="max-w-[220px] text-right text-[10px] text-amber-300">
                    AI ยังไม่ได้ตั้งค่า — ตั้ง ANTHROPIC_API_KEY ใน Settings ก่อนถึงจะขอคอนเซปต์/แตก Storyboard ได้
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ── 3-stage stepper ── */}
          <div className="flex gap-2">
            {stepBtn(1, "① เลือกคอนเซปต์")}
            {stepBtn(2, "② Storyboard + Prompt")}
            {stepBtn(3, "③ ชุดพร้อมโพสต์")}
          </div>

          {/* ── 📋 ข้อมูลสินค้า (Review Brief + รูปรีวิว + โจทย์ระดับ job) — เฉพาะ job สินค้า ── */}
          {job.subjectType === "product" && job.productId && stage !== 3 && (
            <ProductReviewInfoCard job={job} showToast={showToast} onJobUpdated={reload} />
          )}

          {/* ── 🚫 compliance banner — HARD BLOCK: ban ค้าง = ห้ามพร้อมโพสต์ (risky = เตือน) ── */}
          {compliance?.hasBan && (
            <div className="rounded-2xl border border-red-800 bg-red-950/40 p-4">
              <p className="text-sm font-semibold text-red-200">
                <Ban className="inline size-4" /> ติดคำต้องห้าม {[...new Set(banMatches.map((m) => m.term))].length} คำ —
                ต้องแก้ให้หมดก่อนถึงจะพร้อมโพสต์ (บล็อกเด็ดขาด ไม่มี override)
              </p>
              <ul className="mt-2 space-y-1 text-xs text-red-200/90">
                {banMatches.map((m, i) => (
                  <li key={`${m.label}-${m.term}-${i}`}>
                    <span className="inline-block size-2 rounded-full bg-red-500" /> &ldquo;{m.term}&rdquo; ที่ <span className="font-medium">{m.label}</span>
                    {m.replacement && <span className="text-emerald-300"> — แนะนำใช้: {m.replacement}</span>}
                  </li>
                ))}
              </ul>
              {blockNotice && <p className="mt-2 text-xs text-amber-200">{blockNotice}</p>}
              <p className="mt-2 text-[11px] text-red-300/70">
                <Lightbulb className="inline size-4" /> กดปุ่ม [แทนที่] ที่ชิปใต้ช่องข้อความด้านล่าง หรือแก้เองแล้วบันทึก — แก้ครบแล้วสถานะจะเลื่อนให้อัตโนมัติ
              </p>
            </div>
          )}
          {!compliance?.hasBan && compliance?.hasRisky && (
            <div className="rounded-2xl border border-amber-800/60 bg-amber-950/30 px-4 py-3 text-xs text-amber-200">
              <span className="inline-block size-2 rounded-full bg-amber-500" /> มีคำเสี่ยงลดการมองเห็น {[...new Set(riskyMatches.map((m) => m.term))].length} คำ (
              {[...new Set(riskyMatches.map((m) => m.term))].map((t) => `"${t}"`).join(", ")}) —
              โพสต์ได้ แต่แนะนำให้ปรับ (ดูชิปใต้ช่องข้อความ)
            </div>
          )}

          {/* ── 🤖 AI ตรวจเนียน — ผลตรวจ semantic (เลี่ยงคำ/เคลมแฝง) ── */}
          {aiFindings !== null && (
            <div className="rounded-2xl border border-purple-800/60 bg-purple-950/20 p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-purple-200">
                  <Bot className="inline size-4" /> ผล AI ตรวจเนียน {aiFindings.length === 0 ? "— ไม่พบจุดเสี่ยง" : `— พบ ${aiFindings.length} จุด`}
                </h3>
                <button
                  onClick={() => setAiFindings(null)}
                  className="rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800"
                >
                  ปิด
                </button>
              </div>
              {aiFindings.length > 0 && (
                <div className="space-y-2">
                  {aiFindings.map((f, i) => (
                    <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-950/50 px-3 py-2 text-xs">
                      <p className="text-zinc-100">
                        <span className={`inline-block size-2 rounded-full ${f.severity === "ban" ? "bg-red-500" : "bg-amber-500"}`} /> &ldquo;{f.phrase}&rdquo;
                      </p>
                      <p className="mt-0.5 text-zinc-400">เหตุผล: {f.reason}</p>
                      <p className="mt-0.5 text-emerald-300">แนะนำ: {f.suggestion}</p>
                    </div>
                  ))}
                  <p className="text-[11px] text-purple-300/70">
                    <TriangleAlert className="inline size-4" /> AI ตรวจเป็นคำแนะนำเพิ่มเติม — การบล็อกจริงใช้คลังคำต้องห้าม (ban) เท่านั้น
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ═══ STAGE ①: Concepts ═══ */}
          {stage === 1 && (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold text-zinc-200"><Lightbulb className="inline size-4" /> AI เสนอคอนเซปต์คลิป — เลือก 1 แบบ</h2>
                {conceptSets.length > 0 && (
                  <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400">
                    ชุดที่ {currentSetIndex + 1}/{conceptSets.length}
                  </span>
                )}
              </div>

              {currentConcepts.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-zinc-800 p-10 text-center">
                  <p className="text-3xl"><Lightbulb className="mx-auto size-10" /></p>
                  <p className="mt-2 text-sm text-zinc-500">
                    ยังไม่มีคอนเซปต์ — ให้ AI เสนอ 3 แนวจากข้อมูล{subj?.label}ก่อน แล้วค่อยเลือกไปแตก Storyboard
                  </p>
                  <button
                    onClick={onProposeConcepts}
                    disabled={conceptBusy || aiConfigured === false}
                    className="mt-4 rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-900 disabled:opacity-50"
                  >
                    {conceptBusy ? "AI กำลังคิด..." : "ขอคอนเซปต์จาก AI"}
                  </button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    {currentConcepts.map((c, i) => (
                      <button
                        key={i}
                        onClick={() => setSelConcept(i)}
                        className={`rounded-2xl border p-3.5 text-left transition-colors ${
                          selConcept === i
                            ? "border-amber-400 bg-amber-400/10"
                            : "border-zinc-800 bg-zinc-950/60 hover:border-zinc-600"
                        }`}
                      >
                        <p className="text-sm font-bold text-zinc-100">
                          {i + 1}. {c.name}
                        </p>
                        <p className="mt-1 text-[11.5px] text-amber-300">{c.fit}</p>
                        <p className="mt-2 text-xs leading-relaxed text-zinc-300">{c.flow}</p>
                        <p className="mt-2 text-[11.5px] text-zinc-500">{c.highlight}</p>
                      </button>
                    ))}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button
                      onClick={onProposeConcepts}
                      disabled={conceptBusy || capReached || aiConfigured === false}
                      title={capReached ? "ขอแนวใหม่ได้สูงสุด 5 ชุดต่อ job" : undefined}
                      className="rounded-lg border border-amber-400/50 px-3 py-2 text-xs text-amber-300 hover:bg-amber-400/10 disabled:opacity-40"
                    >
                      {conceptBusy ? "กำลังขอ..." : "ขอแนวใหม่"}
                    </button>
                    <button
                      onClick={() => void onPlan(selConcept)}
                      disabled={selConcept === null || planning || aiConfigured === false}
                      className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-900 disabled:opacity-50"
                    >
                      {planning ? "AI กำลังแตก Storyboard..." : "ใช้คอนเซปต์นี้ → แตก Storyboard"}
                    </button>
                    <span className="text-[11px] text-zinc-500">
                      จำนวนฉากแนะนำ:{" "}
                      {job.targetDurationSec
                        ? `${job.targetDurationSec} วิ → ${clipSceneHint(job.targetDurationSec)} ฉาก`
                        : `45 วิ → ${clipSceneHint(45)} ฉาก`}
                    </span>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ═══ STAGE ②: Resource Rail + Storyboard ═══ */}
          {stage === 2 && (
            <>
              {/* Resource Rail */}
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
                <h3 className="mb-2 text-sm font-semibold text-zinc-200">
                  <Library className="inline size-4" /> Resource จากระบบ{" "}
                  <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-normal text-zinc-400">
                    ทุกช่อง default: ไม่เลือก — AI จัดให้เองถ้าเว้นว่าง
                  </span>
                </h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-zinc-500">
                      <Drama className="inline size-4" /> ตัวละคร (ฉากมีตัวละคร)
                    </label>
                    <FilterSelect
                      value={job.characterId ?? ""}
                      onChange={(v) => void onSelectCharacter(v)}
                      disabled={busy}
                      options={[
                        { value: "", label: "— ไม่เลือก (AI สร้างคนให้เหมาะ) —" },
                        ...characters.map((c) => ({
                          value: c.id,
                          label: `${c.nameTh} (${c.displayCode})`,
                        })),
                      ]}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-zinc-500">
                      <Shirt className="inline size-4" /> ชุด (จากตู้เสื้อผ้าตัวละคร)
                    </label>
                    <FilterSelect
                      value={job.wardrobeId ?? ""}
                      onChange={(v) => void saveJob({ wardrobeId: v || null }, "ชุด")}
                      disabled={busy || !job.characterId}
                      options={[
                        {
                          value: "",
                          label: job.characterId ? "— ไม่ล็อคชุด —" : "— เลือกตัวละครก่อน —",
                        },
                        ...wardrobes.map((w) => ({ value: w.id, label: w.name })),
                      ]}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-zinc-500">
                      <Hand className="inline size-4" /> โปรไฟล์มือ (ฉากเห็นแค่มือ)
                    </label>
                    <FilterSelect
                      value={job.handId ?? ""}
                      onChange={(v) => void saveJob({ handId: v || null }, "มือ")}
                      disabled={busy}
                      options={[
                        { value: "", label: "— ไม่เลือก (มือทั่วไปตามตัวถูกรีวิว) —" },
                        ...hands.map((h) => ({ value: h.id, label: `${h.name} (${h.displayCode})` })),
                      ]}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-zinc-500">
                      <MapPin className="inline size-4" /> Location (ทุกฉากถ่ายที่เดียวกัน)
                    </label>
                    <FilterSelect
                      value={job.locationId ?? ""}
                      onChange={(v) => void saveJob({ locationId: v || null }, "Location")}
                      disabled={busy}
                      options={[
                        { value: "", label: "— ไม่เลือก (AI เลือกฉากเอง) —" },
                        ...locations.map((l) => ({
                          value: l.id,
                          label: `${l.name}${l.timeOfDay ? ` (${l.timeOfDay})` : ""}`,
                        })),
                      ]}
                      className="w-full"
                    />
                  </div>
                </div>
                {resHints.length > 0 && (
                  <div className="mt-3 rounded-lg border border-dashed border-zinc-700 bg-zinc-950/70 px-3 py-2 text-[11px] leading-relaxed text-zinc-400">
                    {resHints.map((h, i) => (
                      <p key={i}>{h}</p>
                    ))}
                    {job.shots.length > 0 && (
                      <p className="mt-1 text-amber-300/80">
                        <TriangleAlert className="inline size-4" /> เปลี่ยน resource หลังแตก Storyboard แล้ว — กด <RefreshCw className="inline size-4" /> ที่ shot เพื่อประกอบ prompt ใหม่ หรือแตก Storyboard ใหม่
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Voice */}
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
                <h3 className="mb-2 text-sm font-semibold text-zinc-200"><Mic className="inline size-4" /> เสียงพากย์ของคลิปนี้</h3>
                {/* 🔊 ใช้เสียง / ไม่ใช้ — ปิด = prompt วิดีโอเป็น ambient ไม่มีบทพูด/พากย์ */}
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-zinc-400">ใช้เสียงพูดในคลิปนี้:</span>
                  {[
                    { on: true, label: "มีเสียงพูด" },
                    { on: false, label: "ไม่ใช้เสียง (ambient)" },
                  ].map((o) => {
                    const active = (job.useVoice !== false) === o.on;
                    return (
                      <button
                        key={String(o.on)}
                        type="button"
                        disabled={busy}
                        onClick={() => void saveJob({ useVoice: o.on }, "เสียงพูด")}
                        className={
                          active
                            ? "rounded-full border border-amber-400 bg-amber-400/15 px-3 py-1 text-xs font-semibold text-amber-300"
                            : "rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-400 hover:border-amber-500"
                        }
                      >
                        {o.label}
                      </button>
                    );
                  })}
                </div>
                {job.useVoice === false && (
                  <p className="mb-2 rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-1.5 text-[11px] text-amber-300">
                    🔇 คลิปนี้ไม่มีบทพูด — prompt วิดีโอทุกฉากเป็นเสียงบรรยากาศ (ambient) อย่างเดียว · ค่าเสียงด้านล่างจะไม่ถูกใช้
                  </p>
                )}
                <div className={`grid grid-cols-1 gap-3 md:grid-cols-2 ${job.useVoice === false ? "opacity-40" : ""}`}>
                  <div>
                    <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-zinc-500">
                      แหล่งเสียง (Voice Profiles)
                    </label>
                    <FilterSelect
                      value={job.voiceProfileId ?? ""}
                      onChange={(v) => void saveJob({ voiceProfileId: v || null }, "เสียงพากย์")}
                      disabled={busy}
                      options={[
                        { value: "", label: "🎙 เสียง Flow native (ไม่ใช่เสียง AISTAR) — Veo สร้างเองจาก Voice spec" },
                        ...voices
                          .filter((v) => v.status !== "archived")
                          .map((v) => ({
                            value: v.id,
                            label: `${v.voiceType ?? "เสียง"} ${v.character ? `— ${v.character.nameTh}` : ""}${v.tone ? ` · ${v.tone}` : ""}${v.accent ? ` · ${v.accent}` : ""}`,
                          })),
                      ]}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-zinc-500">
                      Voice spec (ใช้ในบล็อก Voice ของ Prompt วิดีโอทุกฉาก — แก้ได้)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        value={voiceSpecDraft ?? job.voiceSpec ?? ""}
                        onChange={(e) => setVoiceSpecDraft(e.target.value)}
                        placeholder="แตก Storyboard แล้วระบบจะประกอบให้ (หรือพิมพ์เอง)"
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs outline-none focus:border-amber-400"
                      />
                      {voiceSpecDraft !== null && voiceSpecDraft !== (job.voiceSpec ?? "") && (
                        <button
                          onClick={() => {
                            void saveJob({ voiceSpec: voiceSpecDraft }, "voice spec");
                            setVoiceSpecDraft(null);
                          }}
                          className="shrink-0 rounded-lg bg-amber-400 px-2 py-1.5 text-xs font-semibold text-zinc-900"
                        >
                          บันทึก
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* 🔗 โฟลเดอร์ Google Drive เดียวของงาน — ทีมโยนคลิปทุกฉาก+ตัวเต็มลงที่เดียว (CEO directive) */}
              <div className="rounded-2xl border border-sky-700/50 bg-zinc-900 p-4">
                  <h3 className="text-sm font-semibold text-sky-300"><LinkIcon className="inline size-4" /> โฟลเดอร์ Google Drive ของงานนี้ (คลิปทุกฉาก + ตัวเต็ม รวมที่เดียว)</h3>
                  <div className="mt-2 flex max-w-2xl items-center gap-2">
                    <input
                      value={finalVideoDraft ?? job.finalVideoUrl ?? ""}
                      onChange={(e) => setFinalVideoDraft(e.target.value)}
                      placeholder="วางลิงก์โฟลเดอร์ Google Drive..."
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm outline-none focus:border-sky-400"
                    />
                    {finalVideoDraft !== null && finalVideoDraft !== (job.finalVideoUrl ?? "") ? (
                      <button
                        onClick={() => void saveJob({ finalVideoUrl: finalVideoDraft }, "บันทึกโฟลเดอร์ Drive แล้ว")}
                        className="shrink-0 rounded-lg bg-sky-400 px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-sky-300"
                      >
                        บันทึก
                      </button>
                    ) : (
                      job.finalVideoUrl && (
                        <a
                          href={job.finalVideoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
                        >
                          <FolderOpen className="inline size-4" /> เปิดโฟลเดอร์
                        </a>
                      )
                    )}
                  </div>
                  <p className="mt-1.5 text-[11px] text-zinc-500">
                    ตั้งชื่อไฟล์ในโฟลเดอร์ตามเลขฉาก (scene1.mp4, scene2.mp4...) แล้วกดสถานะ "gen แล้ว/approve" ที่ shot ตามความคืบหน้า
                  </p>
                </div>

              {/* headline + script + caption + hashtags */}
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-zinc-200"><FileText className="inline size-4" /> คำพาดหัวหลัก (ฉากเปิด — ข้อความขึ้นจอ)</h3>
                  {headlineDraft !== null && headlineDraft !== (job.headline ?? "") && (
                    <button
                      onClick={() => {
                        void saveJob({ headline: headlineDraft }, "พาดหัว");
                        setHeadlineDraft(null);
                      }}
                      className="rounded bg-amber-400 px-2 py-0.5 text-[11px] font-semibold text-zinc-900"
                    >
                      บันทึก
                    </button>
                  )}
                </div>
                <input
                  value={headlineDraft ?? job.headline ?? ""}
                  onChange={(e) => setHeadlineDraft(e.target.value)}
                  placeholder="เช่น หม้ออบลมร้อนดีไซน์สวยที่น่ามีติดบ้าน"
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-amber-400"
                />
                <BannedScanChips
                  text={headlineDraft ?? job.headline}
                  words={bannedWords}
                  platform={scanPlatform}
                  onReplace={(newText) => {
                    setHeadlineDraft(null);
                    void saveJob({ headline: newText }, "พาดหัว (แทนคำต้องห้าม)");
                  }}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 lg:col-span-1">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-zinc-200"><Mic className="inline size-4" /> สคริปต์พูด</h3>
                    <div className="flex gap-1.5">
                      {scriptDraft !== null && scriptDraft !== (job.script ?? "") && (
                        <button
                          onClick={() => {
                            void saveJob({ script: scriptDraft }, "สคริปต์");
                            setScriptDraft(null);
                          }}
                          className="rounded bg-amber-400 px-2 py-0.5 text-[11px] font-semibold text-zinc-900"
                        >
                          บันทึก
                        </button>
                      )}
                      <button
                        onClick={() => copyText(scriptDraft ?? job.script ?? "", "สคริปต์")}
                        className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-zinc-800"
                      >
                        <ClipboardList className="size-4" />
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={scriptDraft ?? job.script ?? ""}
                    onChange={(e) => setScriptDraft(e.target.value)}
                    rows={7}
                    placeholder="เลือกคอนเซปต์แล้วแตก Storyboard เพื่อให้ AI เขียนให้ หรือพิมพ์เอง..."
                    className="w-full resize-y rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs leading-relaxed text-zinc-200 outline-none focus:border-amber-400"
                  />
                  <BannedScanChips
                    text={scriptDraft ?? job.script}
                    words={bannedWords}
                    platform={scanPlatform}
                    onReplace={(newText) => {
                      setScriptDraft(null);
                      void saveJob({ script: newText }, "สคริปต์ (แทนคำต้องห้าม)");
                    }}
                  />
                </div>
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 lg:col-span-1">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-zinc-200"><Pencil className="inline size-4" /> Caption</h3>
                    <div className="flex gap-1.5">
                      {captionDraft !== null && captionDraft !== (job.caption ?? "") && (
                        <button
                          onClick={() => {
                            void saveJob({ caption: captionDraft }, "แคปชัน");
                            setCaptionDraft(null);
                          }}
                          className="rounded bg-amber-400 px-2 py-0.5 text-[11px] font-semibold text-zinc-900"
                        >
                          บันทึก
                        </button>
                      )}
                      <button
                        onClick={() => copyText(captionDraft ?? job.caption ?? "", "แคปชัน")}
                        className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-zinc-800"
                      >
                        <ClipboardList className="size-4" />
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={captionDraft ?? job.caption ?? ""}
                    onChange={(e) => setCaptionDraft(e.target.value)}
                    rows={7}
                    className="w-full resize-y rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs leading-relaxed text-zinc-200 outline-none focus:border-amber-400"
                  />
                  <BannedScanChips
                    text={captionDraft ?? job.caption}
                    words={bannedWords}
                    platform={scanPlatform}
                    onReplace={(newText) => {
                      setCaptionDraft(null);
                      void saveJob({ caption: newText }, "แคปชัน (แทนคำต้องห้าม)");
                    }}
                  />
                </div>
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 lg:col-span-1">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-zinc-200"># Hashtags</h3>
                    <div className="flex gap-1.5">
                      {hashtagsDraft !== null && hashtagsDraft !== job.hashtags.join(" ") && (
                        <button
                          onClick={() => {
                            void saveJob(
                              { hashtags: hashtagsDraft.split(/\s+/).filter(Boolean) },
                              "แฮชแท็ก",
                            );
                            setHashtagsDraft(null);
                          }}
                          className="rounded bg-amber-400 px-2 py-0.5 text-[11px] font-semibold text-zinc-900"
                        >
                          บันทึก
                        </button>
                      )}
                      <button
                        onClick={() => copyText(hashtagsDraft ?? job.hashtags.join(" "), "แฮชแท็ก")}
                        className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-zinc-800"
                      >
                        <ClipboardList className="size-4" />
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={hashtagsDraft ?? job.hashtags.join(" ")}
                    onChange={(e) => setHashtagsDraft(e.target.value)}
                    rows={7}
                    placeholder="#แท็ก1 #แท็ก2 ..."
                    className="w-full resize-y rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs leading-relaxed text-zinc-200 outline-none focus:border-amber-400"
                  />
                  <BannedScanChips
                    text={hashtagsDraft ?? job.hashtags.join(" ")}
                    words={bannedWords}
                    platform={scanPlatform}
                    onReplace={(newText) => {
                      setHashtagsDraft(null);
                      void saveJob(
                        { hashtags: newText.split(/\s+/).filter(Boolean) },
                        "แฮชแท็ก (แทนคำต้องห้าม)",
                      );
                    }}
                  />
                </div>
              </div>

              {/* ── shot board ── */}
              <div className="space-y-3">
                <div className="sticky top-0 z-30 -mx-1 flex items-center justify-between gap-2 rounded-xl border border-zinc-800/60 bg-zinc-950/85 px-3 py-2 backdrop-blur">
                  <h2 className="text-sm font-semibold text-zinc-200">
                    <Clapperboard className="inline size-4" /> Shot Board{" "}
                    <span className="text-xs font-normal text-zinc-500">
                      ({job.doneCount ?? 0}/{job.shotCount ?? job.shots.length} ผ่านแล้ว)
                    </span>
                  </h2>
                  <div className="flex gap-2">
                    <button
                      onClick={() => void onPlan(job.selectedConceptIndex ?? selConcept)}
                      disabled={planning || aiConfigured === false}
                      className="rounded-lg border border-amber-400/50 px-3 py-1.5 text-xs text-amber-300 hover:bg-amber-400/10 disabled:opacity-50"
                    >
                      {planning ? "กำลังแตกใหม่..." : "แตก Storyboard ใหม่"}
                    </button>
                    <button
                      onClick={addShot}
                      disabled={busy}
                      className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-amber-400 disabled:opacity-50"
                    >
                      + เพิ่ม shot
                    </button>
                    <button
                      onClick={() => void runQcAll()}
                      disabled={working !== null}
                      className="rounded-lg border border-emerald-500/50 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50"
                      title="วนแก้ทุก shot ด้วย AI จนเขียวหมด/ติดหล่ม — เหมือนกด 🪄 ทีละ shot (ใช้โควต้า OpenAI · shot เยอะใช้เวลา)"
                    >
                      {working === "qcall" ? (
                        <><Loader2 className="inline size-3.5 animate-spin" /> กำลังวนแก้ทั้งบอร์ด...</>
                      ) : (
                        <>🪄 วนแก้ทุก shot</>
                      )}
                    </button>
                    <button
                      onClick={() => (genStats ? setGenStats(null) : void loadGenStats())}
                      className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-sky-500"
                    >
                      📊 สถิติพัง
                    </button>
                  </div>
                </div>
                {/* 🧪 สรุป QC ทั้งบอร์ด */}
                {qcAll?.results && (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-2.5 text-xs">
                    <p className="mb-1 font-semibold text-emerald-300">
                      🧪 ผ่าน {qcAll.passCount}/{qcAll.total} shot
                      <button onClick={() => setQcAll(null)} className="float-right text-zinc-500 hover:text-zinc-300">ปิด</button>
                    </p>
                    {qcAll.results.filter((r) => !r.pass).map((r) => (
                      <p key={r.shotId} className="text-amber-300">
                        ฉาก {r.order} {r.title}: {r.issues.join(" · ")}
                      </p>
                    ))}
                    {qcAll.passCount === qcAll.total && <p className="text-emerald-200">ทุก shot ผ่านเกณฑ์ — พร้อมเจน</p>}
                  </div>
                )}
                {/* 📊 สถิติจุดพังรวมทุก job */}
                {genStats && (
                  <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-2.5 text-xs">
                    <p className="mb-1 font-semibold text-sky-300">
                      📊 ผลเจนสะสม: ผ่าน {genStats.pass} · พัง {genStats.fail} ({genStats.total > 0 ? Math.round((genStats.pass / genStats.total) * 100) : 0}% ผ่าน)
                      <button onClick={() => setGenStats(null)} className="float-right text-zinc-500 hover:text-zinc-300">ปิด</button>
                    </p>
                    {genStats.reasons.length > 0 ? (
                      genStats.reasons.map((r) => (
                        <p key={r.reason} className="text-zinc-300">• {r.reason}: {r.count} ครั้ง</p>
                      ))
                    ) : (
                      <p className="text-zinc-500">ยังไม่มีข้อมูลจุดพัง — กดบันทึกผลใต้แต่ละ shot หลังเจน</p>
                    )}
                  </div>
                )}

                {job.shots.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-zinc-800 p-10 text-center text-sm text-zinc-600">
                    ยังไม่มี shot — กลับไปสเตจ ① เลือกคอนเซปต์ แล้วกด &ldquo;ใช้คอนเซปต์นี้ → แตก Storyboard&rdquo;
                  </div>
                )}

                {job.shots.map((s, index) => {
                  const sec = SECTION_LABEL[s.section] ?? { label: s.section, cls: "bg-zinc-800 text-zinc-300" };
                  const sst = CLIP_SHOT_STATUS_LABEL[s.status] ?? { label: s.status, cls: "bg-zinc-700 text-zinc-200" };
                  const typeMeta = SCENE_TYPE_META[s.sceneType] ?? SCENE_TYPE_META.hands;
                  const embed = driveEmbedUrl(s.videoUrl);
                  const isEditing = editingShot === s.id;
                  // 🖥️ v2.1 — ฉาก screen (เฉพาะ job software): capture จริง ไม่ใช่ AI gen
                  const isScreen = s.sceneType === "screen";
                  return (
                    <div
                      key={s.id}
                      className={`rounded-2xl border bg-zinc-900/60 p-4 ${
                        isScreen ? "border-dashed border-amber-400/60" : "border-zinc-800"
                      }`}
                    >
                      {isScreen && (
                        <p className="mb-3 rounded-lg bg-amber-400/10 px-2.5 py-1.5 text-xs font-semibold text-amber-300">
                          <Monitor className="inline size-4" /> CAPTURE จริง — ห้าม AI gen · อัด screen record จากระบบจริงตามใบสั่งด้านล่าง
                        </p>
                      )}
                      <div className="flex flex-wrap items-start gap-4">
                        {/* still thumbnail + upload */}
                        <div className="w-28 shrink-0 space-y-1.5">
                          <div className="aspect-[9/16] overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
                            {s.stillAssetId ? (
                              <ShotStill assetId={s.stillAssetId} />
                            ) : (
                              <div title="ภาพสเก็ตช์จาก prompt — แนวภาพที่จะเจนออกมา" className="h-full w-full p-1">
                                <ShotSketch
                                  sceneType={s.sceneType}
                                  showProduct={s.sceneType === "product_only" ? true : s.showProduct !== false}
                                  hasDialogue={Boolean((s.dialogue ?? "").trim())}
                                  cameraHint={`${s.camera?.name ?? ""} ${s.camera?.shotSize ?? ""} ${s.camera?.cameraMovement ?? ""} ${s.title ?? ""}`}
                                  section={s.section ?? ""}
                                />
                              </div>
                            )}
                          </div>
                          <label className="block cursor-pointer rounded-lg border border-zinc-700 px-2 py-1 text-center text-[11px] text-zinc-300 hover:bg-zinc-800">
                            {uploadingShot === s.id
                              ? "กำลังอัป..."
                              : isScreen
                                ? "อัป screenshot"
                                : "อัปโหลดภาพนิ่ง"}
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              disabled={uploadingShot === s.id}
                              onChange={(e) => {
                                void onUploadStill(s, e.target.files?.[0]);
                                e.target.value = "";
                              }}
                            />
                          </label>
                          {job.productId && !isScreen && (
                            <div className="relative">
                              <button
                                onClick={() => setPickerShot(pickerShot === s.id ? null : s.id)}
                                className="block w-full rounded-lg border border-zinc-700 px-2 py-1 text-center text-[11px] text-zinc-300 hover:bg-zinc-800"
                              >
                                <ShoppingBag className="inline size-4" /> จากรูปสินค้า
                              </button>
                              {pickerShot === s.id && (
                                <ProductImagePicker
                                  productId={job.productId}
                                  onPick={(a) => void onPickProductImage(s, a)}
                                  onClose={() => setPickerShot(null)}
                                />
                              )}
                            </div>
                          )}
                        </div>

                        {/* body */}
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs text-zinc-600">ฉาก {index + 1}</span>
                            {s.title && <span className="text-xs font-bold text-zinc-100">{s.title}</span>}
                            <span className={`rounded px-1.5 py-0.5 text-[11px] ${sec.cls}`}>{sec.label}</span>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] ${sst.cls}`}>{sst.label}</span>
                            {s.durationSec != null && <span className="text-[11px] text-zinc-500">{s.durationSec} วิ</span>}
                            {/* scene-type picker — 🖥️ หน้าจอ โผล่เฉพาะ job ซอฟต์แวร์ */}
                            <span className="ml-auto flex gap-1">
                              {Object.entries(SCENE_TYPE_META)
                                .filter(([t]) => t !== "screen" || job.subjectType === "software")
                                .map(([t, meta]) => (
                                <button
                                  key={t}
                                  onClick={() =>
                                    s.sceneType !== t &&
                                    void onPatchShot(s.id, { sceneType: t }, `เปลี่ยนประเภทฉากเป็น ${meta.label}`)
                                  }
                                  className={`rounded-lg border px-2 py-0.5 text-[11px] ${
                                    s.sceneType === t
                                      ? "border-amber-400 bg-amber-400/10 font-semibold text-amber-300"
                                      : "border-zinc-700 text-zinc-500 hover:bg-zinc-800"
                                  }`}
                                >
                                  {meta.icon} {meta.label}
                                </button>
                              ))}
                              {/* toggle เห็น/ซ่อนสินค้าในช็อตนี้ — patch แล้ว recompose ทันทีให้ prompt อัปเดตจริง */}
                              {s.sceneType !== "product_only" && s.sceneType !== "screen" && (
                                <button
                                  onClick={() =>
                                    void onPatchShot(
                                      s.id,
                                      { showProduct: s.showProduct === false },
                                      s.showProduct === false ? "ช็อตนี้กลับมาเห็นสินค้า" : "ช็อตนี้ซ่อนสินค้า",
                                    ).then(() => onRecompose(s.id))
                                  }
                                  title="เปิด/ปิดการเห็นสินค้าในช็อตนี้ (recompose อัตโนมัติ)"
                                  className={`rounded-lg border px-2 py-0.5 text-[11px] ${
                                    s.showProduct === false
                                      ? "border-rose-500/60 bg-rose-500/10 font-semibold text-rose-300"
                                      : "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                                  }`}
                                >
                                  {s.showProduct === false ? "🚫 ซ่อนสินค้า" : "📦 เห็นสินค้า"}
                                </button>
                              )}
                            </span>
                            <span className="flex gap-1">
                              <button
                                onClick={() => moveShot(index, -1)}
                                disabled={busy || index === 0}
                                className="rounded border border-zinc-700 px-1.5 py-0.5 text-[11px] text-zinc-400 hover:bg-zinc-800 disabled:opacity-30"
                              >
                                <ArrowUp className="size-4" />
                              </button>
                              <button
                                onClick={() => moveShot(index, 1)}
                                disabled={busy || index === job.shots.length - 1}
                                className="rounded border border-zinc-700 px-1.5 py-0.5 text-[11px] text-zinc-400 hover:bg-zinc-800 disabled:opacity-30"
                              >
                                <ArrowDown className="size-4" />
                              </button>
                              <button
                                onClick={() => removeShot(index)}
                                disabled={busy}
                                className="rounded border border-red-900 px-1.5 py-0.5 text-[11px] text-red-300 hover:bg-red-950/40 disabled:opacity-30"
                              >
                                <X className="size-4" />
                              </button>
                            </span>
                          </div>

                          {/* กฎประเภทฉาก + ประเภทเสียง (อัตโนมัติ) */}
                          <p className="rounded-lg border border-dashed border-zinc-700 bg-zinc-950/70 px-2.5 py-1.5 text-[11px] text-zinc-500">
                            {typeMeta.rule} · <Speech className="inline size-4" /> ประเภทเสียง: {typeMeta.voice} (อัตโนมัติ)
                          </p>

                          {/* library chips */}
                          <div className="flex flex-wrap gap-1.5">
                            {s.gesture && (
                              <span className="rounded bg-blue-900/50 px-1.5 py-0.5 text-[11px] text-blue-200">
                                <Grab className="inline size-4" /> {s.gesture.name}
                              </span>
                            )}
                            {s.hand && (
                              <span className="rounded bg-purple-900/50 px-1.5 py-0.5 text-[11px] text-purple-200">
                                <Hand className="inline size-4" /> {s.hand.name}
                              </span>
                            )}
                            {s.camera && (
                              <span className="rounded bg-cyan-900/50 px-1.5 py-0.5 text-[11px] text-cyan-200">
                                <Video className="inline size-4" /> {s.camera.name}
                              </span>
                            )}
                            {s.lighting && (
                              <span className="rounded bg-amber-900/50 px-1.5 py-0.5 text-[11px] text-amber-200">
                                <Lightbulb className="inline size-4" /> {s.lighting.name}
                              </span>
                            )}
                          </div>

                          {/* 💬 ข้อความขึ้นจอ + บทพูด */}
                          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                            <div>
                              <label className="mb-0.5 block text-[10.5px] text-zinc-500">
                                <MessageSquare className="inline size-4" /> ข้อความบนภาพ (ใส่ตอนตัดต่อ — ไม่ฝังใน prompt ภาพ)
                              </label>
                              <div className="flex items-center gap-1.5">
                                <input
                                  value={popupDraft[s.id] ?? s.onScreenText ?? ""}
                                  onChange={(e) => setPopupDraft((d) => ({ ...d, [s.id]: e.target.value }))}
                                  placeholder="1-4 คำ เช่น หนังกรอบมาก"
                                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs outline-none focus:border-amber-400"
                                />
                                {popupDraft[s.id] !== undefined && popupDraft[s.id] !== (s.onScreenText ?? "") && (
                                  <button
                                    onClick={() =>
                                      void onPatchShot(s.id, { onScreenText: popupDraft[s.id] }, "บันทึกข้อความขึ้นจอแล้ว").then(
                                        () =>
                                          setPopupDraft((d) => {
                                            const rest = { ...d };
                                            delete rest[s.id];
                                            return rest;
                                          }),
                                      )
                                    }
                                    className="shrink-0 rounded-lg bg-amber-400 px-2 py-1 text-xs font-semibold text-zinc-900"
                                  >
                                    บันทึก
                                  </button>
                                )}
                              </div>
                              <BannedScanChips
                                text={popupDraft[s.id] ?? s.onScreenText}
                                words={bannedWords}
                                platform={scanPlatform}
                                onReplace={(newText) =>
                                  void onPatchShot(s.id, { onScreenText: newText }, "แทนคำต้องห้ามในข้อความขึ้นจอแล้ว")
                                }
                              />
                            </div>
                            <div>
                              <label className="mb-0.5 block text-[10.5px] text-zinc-500"><Speech className="inline size-4" /> บทพูด (พูดจบก่อนหมดฉาก ~1 วิ · ~3.5 พยางค์/วิ)</label>
                              {s.dialogue ? (
                                <p className="rounded-lg bg-zinc-950/60 px-2 py-1 text-xs text-zinc-300">
                                  <MessageSquare className="inline size-4" /> &ldquo;{s.dialogue}&rdquo;
                                </p>
                              ) : (
                                <p className="text-[11px] text-zinc-600">— ไม่มีบทพูด (กด <Pencil className="inline size-4" /> แก้ไข เพื่อเพิ่ม)</p>
                              )}
                              <BannedScanChips
                                text={s.dialogue}
                                words={bannedWords}
                                platform={scanPlatform}
                                onReplace={(newText) =>
                                  void onPatchShot(s.id, { dialogue: newText }, "แทนคำต้องห้ามในบทพูดแล้ว")
                                }
                              />
                            </div>
                          </div>

                          {s.note && <p className="text-[11px] text-zinc-500"><FileText className="inline size-4" /> {s.note}</p>}

                          {/* actions */}
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            <button
                              onClick={() => openPrompt(s, "still")}
                              disabled={!s.stillPrompt}
                              className={`rounded-lg border px-2.5 py-1 text-xs disabled:opacity-40 ${
                                isScreen
                                  ? "border-amber-400/60 text-amber-300 hover:bg-amber-400/10"
                                  : "border-zinc-700 text-zinc-200 hover:border-amber-400"
                              }`}
                            >
                              {isScreen ? "ใบสั่ง Capture" : "Prompt ภาพนิ่ง"}
                            </button>
                            <button
                              onClick={() => openPrompt(s, "motion")}
                              disabled={!s.motionPrompt}
                              className="rounded-lg border border-zinc-700 px-2.5 py-1 text-xs text-zinc-200 hover:border-amber-400 disabled:opacity-40"
                            >
                              {isScreen ? "โน้ตตัดต่อ + เสียง" : "Prompt วิดีโอ (+เสียงพูด)"}
                            </button>
                            <button
                              onClick={() => onRecompose(s.id)}
                              title="ประกอบ prompt ใหม่ตาม sceneType/resource ปัจจุบันของ shot นี้"
                              className="rounded-lg border border-zinc-700 px-2.5 py-1 text-xs text-zinc-400 hover:bg-zinc-800"
                            >
                              <RefreshCw className="size-4" />
                            </button>
                            {/* 🧪 QC พรอมป์ — ตรวจ prompt เทียบสเปค + ปรับอัตโนมัติ */}
                            <button
                              onClick={() => void runQc(s.id)}
                              disabled={working !== null}
                              title="ตรวจ prompt ของ shot นี้เทียบสเปคปัจจุบัน: บทตรง / ความยาว / สัญญาเสียง / long take / เศษตกค้าง"
                              className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:border-emerald-400 disabled:opacity-50"
                            >
                              {working === `qc:${s.id}` ? (
                                <><Loader2 className="size-3.5 animate-spin" /> กำลังตรวจ...</>
                              ) : (
                                <>🧪 QC พรอมป์</>
                              )}
                            </button>
                            {/* 🔍 Vision QC — เทียบภาพนิ่งกับรูปสินค้าจริงก่อนเอาไปเจนวิดีโอ */}
                            {s.stillAssetId && s.showProduct !== false && (
                              <button
                                onClick={() => void runStillQc(s.id)}
                                disabled={working !== null}
                                title="AI เทียบภาพนิ่งของ shot กับรูปสินค้าจริง — ผ่านค่อยเอาไปเจนวิดีโอ กันเสียโควต้า"
                                className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:border-sky-400 disabled:opacity-50"
                              >
                                {working === `still:${s.id}` ? (
                                  <><Loader2 className="size-3.5 animate-spin" /> กำลังเทียบ...</>
                                ) : (
                                  <>🔍 เทียบรูปจริง</>
                                )}
                              </button>
                            )}
                            {stillQc?.shotId === s.id && !stillQc.busy && (stillQc.data || stillQc.error) && (
                              <div className={`w-full space-y-1 rounded-lg border p-2 text-xs ${
                                stillQc.error || stillQc.data?.verdict === "fail"
                                  ? "border-rose-500/40 bg-rose-500/5"
                                  : stillQc.data?.verdict === "warn"
                                    ? "border-amber-500/40 bg-amber-500/5"
                                    : "border-emerald-500/40 bg-emerald-500/5"
                              }`}>
                                {stillQc.error ? (
                                  <p className="text-rose-300">{stillQc.error}</p>
                                ) : stillQc.data ? (
                                  <>
                                    <p className={stillQc.data.verdict === "pass" ? "text-emerald-300" : stillQc.data.verdict === "warn" ? "text-amber-300" : "text-rose-300"}>
                                      🔍 ความตรงกับสินค้าจริง {stillQc.data.matchScore}/100 — {stillQc.data.verdict === "pass" ? "ใช้เจนวิดีโอต่อได้" : stillQc.data.verdict === "warn" ? "เสี่ยง — ดูจุดต่างก่อน" : "ห้ามใช้ — เจนภาพใหม่"}
                                    </p>
                                    {stillQc.data.handsOk === false && (
                                      <p className="font-semibold text-rose-300">🖐 มือ/นิ้วผิดปกติ: {stillQc.data.handIssue || "เกิน 2 มือหรือนิ้วเพี้ยน"} — ห้ามใช้ภาพนี้ เจนใหม่</p>
                                    )}
                                    {stillQc.data.diffs.map((d, i) => (
                                      <p key={i} className="text-zinc-300">• {d}</p>
                                    ))}
                                    {stillQc.data.fixHints.map((h, i) => (
                                      <p key={i} className="text-sky-300">💡 {h}</p>
                                    ))}
                                  </>
                                ) : null}
                              </div>
                            )}
                            {/* 📊 บันทึกผลเจนจริง — สะสมสถิติจุดพังไว้จูน prompt ต่อ */}
                            <div className="flex w-full flex-wrap items-center gap-1.5 text-[11px]">
                              <span className="text-zinc-500">ผลเจน:</span>
                              <button
                                onClick={() => { setGenReasonPick(null); void saveGenResult(s.id, true, []); }}
                                className={`rounded-full border px-2 py-0.5 ${genLog[s.id]?.ok === true ? "border-emerald-400 bg-emerald-500/20 text-emerald-200" : "border-zinc-700 text-zinc-400 hover:border-emerald-500"}`}
                              >
                                ✅ ผ่าน
                              </button>
                              <button
                                onClick={() => { setGenReasonPick(s.id); if (genLog[s.id]?.ok !== false) void saveGenResult(s.id, false, genLog[s.id]?.reasons ?? []); }}
                                className={`rounded-full border px-2 py-0.5 ${genLog[s.id]?.ok === false ? "border-rose-400 bg-rose-500/20 text-rose-200" : "border-zinc-700 text-zinc-400 hover:border-rose-500"}`}
                              >
                                ❌ พัง
                              </button>
                              {(genReasonPick === s.id || genLog[s.id]?.ok === false) && (
                                <span className="flex flex-wrap gap-1">
                                  {GEN_REASONS.map((r) => {
                                    const cur = genLog[s.id]?.reasons ?? [];
                                    const on = cur.includes(r);
                                    return (
                                      <button
                                        key={r}
                                        onClick={() => void saveGenResult(s.id, false, on ? cur.filter((x) => x !== r) : [...cur, r])}
                                        className={`rounded-full border px-1.5 py-0.5 text-[10px] ${on ? "border-amber-400 bg-amber-500/20 text-amber-200" : "border-zinc-700 text-zinc-500 hover:border-amber-500"}`}
                                      >
                                        {r}
                                      </button>
                                    );
                                  })}
                                </span>
                              )}
                            </div>
                            {qcResults[s.id] && (
                              <div className={`w-full space-y-1 rounded-lg border p-2 text-xs ${
                                qcResults[s.id].error ? "border-rose-500/50 bg-rose-500/5" : qcResults[s.id].pass ? "border-emerald-500/50 bg-emerald-500/5" : "border-amber-500/50 bg-amber-500/5"
                              }`}>
                                {qcResults[s.id].error ? (
                                  <p className="text-rose-300">⚠ {qcResults[s.id].error}</p>
                                ) : qcResults[s.id].pass ? (
                                  <p className="font-semibold text-emerald-300">
                                    ✅ พรอมป์ผ่านทุกข้อ{qcResults[s.id].fixed ? " (ปรับอัตโนมัติแล้ว)" : ""} · คลิป {qcResults[s.id].durationSec} วิ{qcResults[s.id].dialogueSyllables ? ` · บท ~${qcResults[s.id].dialogueSyllables} พยางค์` : ""}
                                  </p>
                                ) : (
                                  <>
                                    <p className="font-semibold text-amber-300">❌ พบปัญหา {qcResults[s.id].issues?.length} จุด{qcResults[s.id].fixed ? " (หลังปรับแล้ว)" : ""}</p>
                                    {qcResults[s.id].issues?.map((it, i) => (
                                      <p key={i} className="text-zinc-300">• {it}</p>
                                    ))}
                                    {!qcResults[s.id].fixed && (qcResults[s.id].fixableCount ?? 0) > 0 && (
                                      <button
                                        onClick={() => void runQc(s.id, true)}
                                        disabled={working !== null}
                                        className="mt-1 rounded-lg border border-emerald-500/60 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
                                      >
                                        🔧 {qcBusy ? "กำลังปรับ..." : "ปรับอัตโนมัติ (recompose)"}
                                      </button>
                                    )}
                                    {qcResults[s.id].needManualScriptTrim && (
                                      <div className="space-y-1">
                                        <p className="text-amber-300">✂️ บทยาวเกินงบ</p>
                                        <button
                                          onClick={() => void runTrim(s.id)}
                                          disabled={working !== null}
                                          className="rounded-lg border border-amber-400/50 px-2.5 py-1 text-xs text-amber-300 hover:bg-amber-400/10 disabled:opacity-50"
                                        >
                                          {working === `trim:${s.id}` ? (
                                            <><Loader2 className="inline size-3.5 animate-spin" /> กำลังตัด...</>
                                          ) : (
                                            <>✂️ AI ตัดบทให้ลงงบ</>
                                          )}
                                        </button>
                                        {trimRes?.shotId === s.id && !trimRes.busy && (trimRes.trimmed || trimRes.error) && (
                                          <div className="rounded-lg border border-zinc-700 bg-zinc-900/70 p-1.5">
                                            {trimRes.error ? (
                                              <p className="text-rose-300">{trimRes.error}</p>
                                            ) : (
                                              <>
                                                <p className="text-zinc-500">เดิม: {trimRes.original}</p>
                                                <p className="text-emerald-300">ใหม่ (~{trimRes.trimmedSyllables}/{trimRes.budget} พยางค์): {trimRes.trimmed}</p>
                                                <div className="mt-1 flex gap-1.5">
                                                  <button onClick={() => void applyTrim(s.id)} className="rounded border border-emerald-500/50 px-2 py-0.5 text-[11px] text-emerald-300 hover:bg-emerald-500/10">✓ ใช้บทนี้ + recompose</button>
                                                  <button onClick={() => void runTrim(s.id)} className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-400 hover:bg-zinc-800">↻ ตัดใหม่</button>
                                                  <button onClick={() => setTrimRes(null)} className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-500 hover:bg-zinc-800">ยกเลิก</button>
                                                </div>
                                              </>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </>
                                )}
                                {/* 🔬 วิเคราะห์ลึก (AI): แอ็กชันตรงสินค้า / เฟรมแรกเดโม่ / กันพูดมั่ว */}
                                {/* 📋 checklist เต็ม — ทุกข้อที่ตรวจพร้อม ✓/✗ (ทั้งเคสผ่านและไม่ผ่าน) */}
                                {!qcResults[s.id].error && qcResults[s.id].checklist && qcResults[s.id].checklist!.length > 0 && (
                                  <div className="grid grid-cols-1 gap-x-3 gap-y-0.5 border-t border-zinc-700/40 pt-1 sm:grid-cols-2">
                                    {qcResults[s.id].checklist!.map((ck) => (
                                      <p key={ck.label} className={ck.ok ? "text-[11px] text-emerald-400/70" : "text-[11px] font-semibold text-rose-300"}>
                                        {ck.ok ? "✓" : "✗"} {ck.label}
                                      </p>
                                    ))}
                                  </div>
                                )}
                                {!qcResults[s.id].error && qcResults[s.id].deep && (
                                  <div className="mt-1 space-y-1.5 border-t border-zinc-700/60 pt-1.5">
                                    <p className="text-[11px] font-semibold text-zinc-400">🔬 วิเคราะห์ลึก (AI) — ภาพ + วิดีโอ</p>
                                    {/* 🪄 แก้ทั้ง shot คลิกเดียว — AI เขียนบทไทย+action+เฟรมแรกใหม่ให้ตรงชนิดสินค้า (แก้ถึงต้นตอ ไม่ใช่แค่ปะ prompt) */}
                                    {(!qcResults[s.id].deep!.usageActionOk || !qcResults[s.id].deep!.firstFrameOk || !qcResults[s.id].deep!.speechLockOk) && (
                                      <button
                                        onClick={async () => {
                                          setWorking(`magic:${s.id}`);
                                          try {
                                            const r = (await rawPost(`/clip-jobs/${id}/shots/${s.id}/ai-fix`)) as unknown as {
                                              applied: { dialogueTh: string; dialogueSyllables: number; budget: number };
                                              deep?: DeepQc;
                                              passes?: boolean;
                                              passesFixable?: boolean;
                                              warnings?: string[];
                                              stalled?: boolean;
                                              rounds?: number;
                                              remaining?: string;
                                            };
                                            await reload();
                                            showToast(
                                              r.passes
                                                ? `✅ เขียวหมดทุกเกณฑ์ทั้งภาพ+วิดีโอ หลังวนแก้ ${r.rounds ?? 1} รอบ` +
                                                  (r.applied?.dialogueTh ? ` — บทใหม่: "${r.applied.dialogueTh}"` : "")
                                                : r.passesFixable
                                                  ? `✅ เครื่องแก้ทุกข้อที่แก้ได้แล้ว (${r.rounds ?? 0} รอบ) — ⚠️ เหลืองานที่ต้องทำเอง: ${(r.warnings ?? []).join(" / ")}`
                                                  : `⚠️ หยุดเพราะ${r.stalled ? "แก้ไม่ขยับ (ข้อเดิมซ้ำสองรอบ)" : "ครบเพดานนิรภัย " + (r.rounds ?? 10) + " รอบ"} — ที่เหลือ: ${r.remaining || "ดูในแผงด้านล่าง"}`,
                                            );
                                            // 🎯 ใช้ผลกรรมการที่ยืนยันแล้วจากเซิร์ฟเวอร์ — ไม่ทอยกรรมการใหม่ (กันผลแกว่ง)
                                            // ตรวจเกณฑ์กติกา (ฟรี/นิ่ง) รอบเดียวแล้วผนวก deep ที่ยืนยันแล้ว
                                            const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
                                            const token = getToken();
                                            const detRes = await fetch(`${base}/clip-jobs/${id}/shots/${s.id}/prompt-qc`, {
                                              method: "POST",
                                              headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                                              body: JSON.stringify({ fix: false, deep: false }),
                                            });
                                            const det = (await detRes.json()) as PromptQcResult;
                                            setQcShotId(s.id);
                                            setQcResults((m) => ({ ...m, [s.id]: { ...det, deep: r.deep } }));
                                          } catch (e) {
                                            showToast(e instanceof Error ? e.message : "แก้ไม่สำเร็จ");
                                          } finally {
                                            setWorking(null);
                                          }
                                        }}
                                        disabled={working !== null}
                                        className="w-full rounded-lg border border-fuchsia-400/60 bg-fuchsia-500/10 px-2.5 py-1.5 text-xs font-semibold text-fuchsia-300 hover:bg-fuchsia-500/20 disabled:opacity-50"
                                      >
                                        {working === `magic:${s.id}` ? (
                                          <><Loader2 className="inline size-3.5 animate-spin" /> กำลังวนแก้จนผ่านทุกเกณฑ์...</>
                                        ) : (
                                          <>🪄 วนแก้จนเขียวหมด (ไม่จำกัดรอบ · หยุดเมื่อผ่าน/ติดหล่ม)</>
                                        )}
                                      </button>
                                    )}
                                    {/* 🩹 ใช้คำแนะนำทั้งหมดในคลิกเดียว — ฝังเข้า prompt + recompose + ตรวจซ้ำ */}
                                    {(qcResults[s.id].deep!.suggestedActionEn || qcResults[s.id].deep!.suggestedFirstFrameEn || qcResults[s.id].deep!.suggestedSpeechFixEn) && (
                                      <button
                                        onClick={async () => {
                                          const d = qcResults[s.id].deep!;
                                          setWorking(`deepfix:${s.id}`);
                                          try {
                                            await rawPost(`/clip-jobs/${id}/shots/${s.id}/apply-deep-fix`, {
                                              actionEn: d.suggestedActionEn || undefined,
                                              firstFrameEn: d.suggestedFirstFrameEn || undefined,
                                              speechFixEn: d.suggestedSpeechFixEn || undefined,
                                            });
                                            await reload();
                                            showToast("ฝังคำแนะนำ AI + recompose แล้ว");
                                            await runQc(s.id);
                                          } catch (e) {
                                            showToast(e instanceof Error ? e.message : "ใช้คำแนะนำไม่สำเร็จ");
                                          } finally {
                                            setWorking(null);
                                          }
                                        }}
                                        disabled={working !== null}
                                        className="rounded-lg border border-violet-400/50 px-2.5 py-1 text-xs text-violet-300 hover:bg-violet-400/10 disabled:opacity-50"
                                      >
                                        🩹 ใช้คำแนะนำ AI ทั้งหมด + recompose
                                      </button>
                                    )}
                                    <p className={qcResults[s.id].deep!.usageActionOk ? "text-emerald-300" : "text-amber-300"}>
                                      {qcResults[s.id].deep!.usageActionOk ? "✅" : "❌"} แอ็กชันใช้สินค้าตรงชนิด{!qcResults[s.id].deep!.usageActionOk && qcResults[s.id].deep!.usageActionIssue ? ` — ${qcResults[s.id].deep!.usageActionIssue}` : ""}
                                    </p>
                                    {qcResults[s.id].deep!.suggestedActionEn && (
                                      <div className="rounded-lg border border-zinc-700 bg-zinc-900/70 p-1.5">
                                        <p className="text-[11px] text-zinc-300">{qcResults[s.id].deep!.suggestedActionEn}</p>
                                        <button onClick={() => { void navigator.clipboard.writeText(qcResults[s.id].deep!.suggestedActionEn); showToast("คัดลอกแล้ว"); }} className="mt-1 rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-400 hover:bg-zinc-800">คัดลอก action ที่ถูก</button>
                                      </div>
                                    )}
                                    <p className={qcResults[s.id].deep!.firstFrameOk ? "text-emerald-300" : "text-amber-300"}>
                                      {qcResults[s.id].deep!.firstFrameOk ? "✅" : "❌"} เฟรมแรกเดโม่ = กำลังใช้งาน{!qcResults[s.id].deep!.firstFrameOk && qcResults[s.id].deep!.firstFrameIssue ? ` — ${qcResults[s.id].deep!.firstFrameIssue}` : ""}
                                    </p>
                                    {qcResults[s.id].deep!.suggestedFirstFrameEn && (
                                      <div className="rounded-lg border border-zinc-700 bg-zinc-900/70 p-1.5">
                                        <p className="text-[11px] text-zinc-300">{qcResults[s.id].deep!.suggestedFirstFrameEn}</p>
                                        <button onClick={() => { void navigator.clipboard.writeText(qcResults[s.id].deep!.suggestedFirstFrameEn); showToast("คัดลอกแล้ว"); }} className="mt-1 rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-400 hover:bg-zinc-800">คัดลอกบรรทัดเฟรมแรก</button>
                                      </div>
                                    )}
                                    <p className={qcResults[s.id].deep!.speechLockOk ? "text-emerald-300" : "text-amber-300"}>
                                      {qcResults[s.id].deep!.speechLockOk ? "✅" : "❌"} ชุดกันพูดมั่ว{!qcResults[s.id].deep!.speechLockOk && qcResults[s.id].deep!.speechLockIssue ? ` — ${qcResults[s.id].deep!.speechLockIssue}` : ""}
                                    </p>
                                    {qcResults[s.id].deep!.suggestedSpeechFixEn && (
                                      <div className="rounded-lg border border-zinc-700 bg-zinc-900/70 p-1.5">
                                        <p className="text-[11px] text-zinc-300">{qcResults[s.id].deep!.suggestedSpeechFixEn}</p>
                                        <button onClick={() => { void navigator.clipboard.writeText(qcResults[s.id].deep!.suggestedSpeechFixEn); showToast("คัดลอกแล้ว"); }} className="mt-1 rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-400 hover:bg-zinc-800">คัดลอกบรรทัดเสริมล็อก</button>
                                      </div>
                                    )}
                                    {qcResults[s.id].deep!.otherIssues.length > 0 && qcResults[s.id].deep!.otherIssues.map((it, i) => (
                                      <p key={i} className="text-zinc-400">• {it}</p>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                            {/* 🛡️ Flow policy — badge เสี่ยง + ปุ่มแก้อัตโนมัติ */}
                            {policyMap[s.id] && policyMap[s.id].risk !== "none" && (
                              <button
                                onClick={() => void onAutoFixPolicy(s.id)}
                                disabled={policyBusy === s.id}
                                title={[
                                  ...policyMap[s.id].still.findings.map((f) => "• " + f.label),
                                  ...policyMap[s.id].motion.findings.map((f) => "• " + f.label),
                                ]
                                  .filter((v, i, a) => a.indexOf(v) === i)
                                  .join("\n")}
                                className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs disabled:opacity-50 ${
                                  policyMap[s.id].risk === "high"
                                    ? "border-rose-500/60 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"
                                    : "border-amber-500/60 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                                }`}
                              >
                                <TriangleAlert className="size-4" />
                                {policyBusy === s.id
                                  ? "กำลังแก้..."
                                  : policyMap[s.id].risk === "high"
                                    ? "เสี่ยง Flow บล็อก — แก้อัตโนมัติ"
                                    : "อาจติด Flow — แก้อัตโนมัติ"}
                              </button>
                            )}
                            {policyMap[s.id] && policyMap[s.id].risk === "none" && (s.stillPrompt || s.motionPrompt) && (
                              <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-600/40 px-2.5 py-1 text-xs text-emerald-400">
                                <ShieldCheck className="size-4" /> ผ่าน Flow
                              </span>
                            )}
                            <button
                              onClick={() => {
                                if (isEditing) {
                                  setEditingShot(null);
                                } else {
                                  setEditingShot(s.id);
                                  setEditDraft({
                                    dialogue: s.dialogue ?? "",
                                    note: s.note ?? "",
                                    stillPrompt: s.stillPrompt ?? "",
                                    motionPrompt: s.motionPrompt ?? "",
                                    negativePrompt: s.negativePrompt ?? "",
                                  });
                                }
                              }}
                              className="rounded-lg border border-zinc-700 px-2.5 py-1 text-xs text-zinc-400 hover:bg-zinc-800"
                            >
                              <Pencil className="inline size-4" /> แก้ไข
                            </button>
                            {s.status !== "generated" && s.status !== "approved" && (
                              <button
                                onClick={() => onPatchShot(s.id, { status: "generated" }, "อัปเดตสถานะแล้ว")}
                                className="rounded-lg border border-cyan-800 px-2.5 py-1 text-xs text-cyan-300 hover:bg-cyan-900/30"
                              >
                                gen แล้ว
                              </button>
                            )}
                            {s.status !== "approved" && (
                              <button
                                onClick={() => onPatchShot(s.id, { status: "approved" }, "อนุมัติ shot แล้ว")}
                                className="rounded-lg border border-emerald-800 px-2.5 py-1 text-xs text-emerald-300 hover:bg-emerald-900/30"
                              >
                                <Check className="inline size-4" /> ผ่าน
                              </button>
                            )}
                            {s.status === "approved" && (
                              <button
                                onClick={() => onPatchShot(s.id, { status: "generated" }, "ถอยสถานะแล้ว")}
                                className="rounded-lg border border-zinc-700 px-2.5 py-1 text-xs text-zinc-400 hover:bg-zinc-800"
                              >
                                <Undo2 className="inline size-4" /> ถอย
                              </button>
                            )}
                          </div>

                          {/* วิดีโอ: ใช้โฟลเดอร์ Drive เดียวของงาน (การ์ดเหนือ shot board) — ช่องนี้โชว์เฉพาะลิงก์เก่าราย shot */}
                          {s.videoUrl && !embed && (
                            <a
                              href={s.videoUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex w-fit rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                            >
                              <Play className="inline size-4" /> ลิงก์คลิปฉากนี้ (แบบเก่า)
                            </a>
                          )}
                          {embed && (
                            <div className="aspect-video max-w-md overflow-hidden rounded-xl border border-zinc-800">
                              <iframe
                                src={embed}
                                className="h-full w-full"
                                allow="autoplay"
                                title={`shot-${index + 1}-video`}
                              />
                            </div>
                          )}

                          {/* edit panel */}
                          {isEditing && (
                            <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                                <div>
                                  <label className="mb-0.5 block text-[11px] text-zinc-500">บทพูดท่อนนี้</label>
                                  <textarea
                                    value={(editDraft.dialogue as string) ?? ""}
                                    onChange={(e) => setEditDraft((d) => ({ ...d, dialogue: e.target.value }))}
                                    rows={2}
                                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs outline-none focus:border-amber-400"
                                  />
                                </div>
                                <div>
                                  <label className="mb-0.5 block text-[11px] text-zinc-500">โน้ต</label>
                                  <textarea
                                    value={(editDraft.note as string) ?? ""}
                                    onChange={(e) => setEditDraft((d) => ({ ...d, note: e.target.value }))}
                                    rows={2}
                                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs outline-none focus:border-amber-400"
                                  />
                                </div>
                              </div>
                              <div>
                                <label className="mb-0.5 block text-[11px] text-zinc-500">Prompt ภาพนิ่ง</label>
                                <textarea
                                  value={(editDraft.stillPrompt as string) ?? ""}
                                  onChange={(e) => setEditDraft((d) => ({ ...d, stillPrompt: e.target.value }))}
                                  rows={4}
                                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-[11px] outline-none focus:border-amber-400"
                                />
                              </div>
                              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                                <div>
                                  <label className="mb-0.5 block text-[11px] text-zinc-500">Prompt วิดีโอ</label>
                                  <textarea
                                    value={(editDraft.motionPrompt as string) ?? ""}
                                    onChange={(e) => setEditDraft((d) => ({ ...d, motionPrompt: e.target.value }))}
                                    rows={3}
                                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-[11px] outline-none focus:border-amber-400"
                                  />
                                </div>
                                <div>
                                  <label className="mb-0.5 block text-[11px] text-zinc-500">Negative prompt</label>
                                  <textarea
                                    value={(editDraft.negativePrompt as string) ?? ""}
                                    onChange={(e) => setEditDraft((d) => ({ ...d, negativePrompt: e.target.value }))}
                                    rows={3}
                                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-[11px] outline-none focus:border-amber-400"
                                  />
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => {
                                    void onPatchShot(s.id, editDraft as Record<string, unknown>, "บันทึก shot แล้ว");
                                    setEditingShot(null);
                                  }}
                                  className="rounded-lg bg-amber-400 px-3 py-1 text-xs font-semibold text-zinc-900"
                                >
                                  บันทึก
                                </button>
                                <button
                                  onClick={() => setEditingShot(null)}
                                  className="rounded-lg border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                                >
                                  ยกเลิก
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* clean → ไปสเตจ ③ */}
                {job.shots.length > 0 && !compliance?.hasBan && (
                  <div className="rounded-2xl border border-emerald-800/60 bg-emerald-950/10 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-emerald-300"><Check className="inline size-4" /> ผ่านตรวจคำต้องห้ามครบทุกฉาก</p>
                      <button
                        onClick={() => setStage(3)}
                        className="inline-flex items-center gap-1 rounded-lg bg-amber-400 px-4 py-1.5 text-xs font-semibold text-zinc-900 hover:bg-amber-300"
                      >
                        ไปดู <Package className="size-4" /> ชุดพร้อมโพสต์ <ArrowRight className="size-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ═══ STAGE ③: Package ═══ */}
          {stage === 3 && (
            <div className="rounded-2xl border border-emerald-800/60 bg-emerald-950/10 p-4">
              {!pack ? (
                <p className="text-sm text-zinc-500">กำลังโหลด package...</p>
              ) : (
                <>
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-emerald-300">
                      <Package className="inline size-4" /> ชุดพร้อมโพสต์ — {pack.job.displayCode}
                      {st && <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] ${st.cls}`}>{st.label}</span>}
                    </h2>
                    <button
                      onClick={() =>
                        copyText(
                          [
                            pack.script ?? "",
                            "",
                            pack.caption ?? "",
                            "",
                            pack.hashtags.join(" "),
                            "",
                            pack.affiliateLink ?? "",
                          ]
                            .join("\n")
                            .trim(),
                          "ทั้งชุด",
                        )
                      }
                      className="rounded-lg bg-emerald-500 px-3 py-1 text-xs font-semibold text-zinc-950 hover:bg-emerald-400"
                    >
                      <ClipboardList className="inline size-4" /> ก๊อปทั้งชุด
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {/* final video url (Drive) */}
                    <div className="md:col-span-2">
                      <label className="mb-1 block text-[11px] text-zinc-500">
                        <LinkIcon className="inline size-4" /> โฟลเดอร์ Google Drive (คลิปทุกฉาก + ตัวเต็ม)
                      </label>
                      <div className="flex max-w-2xl items-center gap-2">
                        <input
                          value={finalVideoDraft ?? job.finalVideoUrl ?? ""}
                          onChange={(e) => setFinalVideoDraft(e.target.value)}
                          placeholder="https://drive.google.com/file/d/..."
                          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs outline-none focus:border-emerald-400"
                        />
                        {finalVideoDraft !== null && finalVideoDraft !== (job.finalVideoUrl ?? "") && (
                          <button
                            onClick={() => {
                              void saveJob({ finalVideoUrl: finalVideoDraft }, "โฟลเดอร์ Drive").then(openPackage);
                              setFinalVideoDraft(null);
                            }}
                            className="shrink-0 rounded-lg bg-emerald-500 px-2.5 py-1.5 text-xs font-semibold text-zinc-950"
                          >
                            บันทึก
                          </button>
                        )}
                      </div>
                      {driveEmbedUrl(job.finalVideoUrl) && (
                        <div className="mt-2 aspect-video max-w-md overflow-hidden rounded-xl border border-zinc-800">
                          <iframe
                            src={driveEmbedUrl(job.finalVideoUrl) ?? undefined}
                            className="h-full w-full"
                            allow="autoplay"
                            title="final-video"
                          />
                        </div>
                      )}
                    </div>

                    {/* 💬 ข้อความขึ้นจอ (ใส่ตอนตัดต่อ) — headline + per-shot */}
                    <div className="md:col-span-2 rounded-xl border border-zinc-800 bg-zinc-950/50 p-2.5">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-[11px] font-medium text-zinc-400"><MessageSquare className="inline size-4" /> ข้อความขึ้นจอ (ใส่ตอนตัดต่อ)</span>
                        <button
                          onClick={() =>
                            copyText(
                              pack.onScreenTexts.map((t) => `${t.label}: ${t.text}`).join("\n"),
                              "ข้อความขึ้นจอ",
                            )
                          }
                          disabled={pack.onScreenTexts.length === 0}
                          className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
                        >
                          <ClipboardList className="size-4" />
                        </button>
                      </div>
                      {pack.onScreenTexts.length === 0 ? (
                        <p className="text-[11px] text-zinc-600">— ยังไม่มีข้อความขึ้นจอ (ใส่ได้ที่พาดหัว + ต่อฉากในสเตจ ②)</p>
                      ) : (
                        <p className="text-[11.5px] leading-relaxed text-zinc-300">
                          {pack.onScreenTexts.map((t, i) => (
                            <span key={i}>
                              {i > 0 && <span className="text-zinc-600"> · </span>}
                              <span className="text-zinc-500">{t.label}</span> &ldquo;{t.text}&rdquo;
                            </span>
                          ))}
                        </p>
                      )}
                    </div>

                    {/* 🖥️ v2.1 software — สายงานที่ 2: รายการต้อง capture จริง (แยกจาก AI-gen shots) */}
                    {(pack.captureShots?.length ?? 0) > 0 && (
                      <div className="md:col-span-2 rounded-xl border border-dashed border-amber-400/60 bg-amber-400/5 p-2.5">
                        <div className="mb-1.5 flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-amber-300">
                            <Monitor className="inline size-4" /> รายการต้อง capture จริง — {pack.captureShots!.length} ฉาก (ห้าม AI gen UI · ซ่อนข้อมูลลูกค้า PDPA)
                          </span>
                          <button
                            onClick={() =>
                              copyText(
                                pack
                                  .captureShots!.map((c) => `— ฉาก ${c.order + 1}${c.title ? ` ${c.title}` : ""} —\n${c.captureBrief ?? ""}`)
                                  .join("\n\n"),
                                "ใบสั่ง Capture ทั้งหมด",
                              )
                            }
                            className="rounded border border-amber-400/50 px-2 py-0.5 text-[11px] text-amber-300 hover:bg-amber-400/10"
                          >
                            <ClipboardList className="inline size-4" /> ก๊อปใบสั่งทั้งหมด
                          </button>
                        </div>
                        <div className="space-y-1.5">
                          {pack.captureShots!.map((c) => (
                            <div key={c.id} className="rounded-lg bg-zinc-950/60 px-2.5 py-1.5 text-[11px]">
                              <p className="text-zinc-200">
                                ฉาก {c.order + 1}
                                {c.title && <span className="font-semibold"> · {c.title}</span>}{" "}
                                <span className={c.videoUrl ? "text-emerald-300" : "text-amber-300/80"}>
                                  {c.videoUrl ? "มีลิงก์ screen rec แล้ว" : "รออัด screen rec (โยนเข้าโฟลเดอร์ Drive ของงาน)"}
                                </span>
                              </p>
                              {c.captureBrief && (
                                <p className="mt-0.5 whitespace-pre-wrap leading-relaxed text-zinc-400">{c.captureBrief}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 🔗 v2.1 software — ลิงก์สมัคร (signupUrl ก่อน affiliateLink) */}
                    {pack.signupUrl && (
                      <div className="md:col-span-2 rounded-xl border border-zinc-800 bg-zinc-950/50 p-2.5">
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-[11px] font-medium text-zinc-400"><LinkIcon className="inline size-4" /> ลิงก์สมัคร/ทดลองใช้ (แปะคอมเมนต์/ไบโอ)</span>
                          <button
                            onClick={() => copyText(pack.signupUrl ?? "", "ลิงก์สมัคร")}
                            className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-zinc-800"
                          >
                            <ClipboardList className="size-4" />
                          </button>
                        </div>
                        <p className="truncate text-[11.5px] text-cyan-300">{pack.signupUrl}</p>
                      </div>
                    )}

                    {/* stills */}
                    <div>
                      <p className="mb-1.5 text-[11px] text-zinc-500"><ImageIcon className="inline size-4" /> ภาพนิ่งทุก shot (กดดาวน์โหลดรายรูป)</p>
                      <div className="flex flex-wrap gap-2">
                        {pack.shots.filter((s) => s.stillAssetId).length === 0 && (
                          <p className="text-xs text-zinc-600">ยังไม่มีภาพนิ่งที่อัปโหลดกลับ</p>
                        )}
                        {pack.shots
                          .filter((s) => s.stillAssetId)
                          .map((s) => (
                            <button
                              key={s.id}
                              onClick={() => void downloadStill(s.stillAssetId as string, s.order)}
                              title={`ดาวน์โหลด shot ${s.order + 1}`}
                              className="w-16 overflow-hidden rounded-lg border border-zinc-700 hover:border-emerald-400"
                            >
                              <div className="aspect-[9/16]">
                                <ShotStill assetId={s.stillAssetId as string} />
                              </div>
                              <span className="block bg-zinc-900 py-0.5 text-center text-[10px] text-zinc-400">
                                <Download className="inline size-4" /> #{s.order + 1}
                              </span>
                            </button>
                          ))}
                      </div>
                    </div>

                    {/* video links */}
                    <div>
                      <p className="mb-1.5 text-[11px] text-zinc-500"><LinkIcon className="inline size-4" /> ลิงก์วิดีโอราย shot (แบบเก่า — งานใหม่ใช้โฟลเดอร์เดียวด้านบน)</p>
                      <div className="space-y-1">
                        {pack.shots.filter((s) => s.videoUrl).length === 0 && (
                          <p className="text-xs text-zinc-600">ยังไม่มีลิงก์วิดีโอ</p>
                        )}
                        {pack.shots
                          .filter((s) => s.videoUrl)
                          .map((s) => (
                            <div key={s.id} className="flex items-center gap-2 text-xs">
                              <span className="shrink-0 text-zinc-500">#{s.order + 1}</span>
                              <a
                                href={s.videoUrl as string}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="min-w-0 truncate text-cyan-300 hover:text-cyan-200"
                              >
                                {s.videoUrl}
                              </a>
                              <button
                                onClick={() => copyText(s.videoUrl as string, "ลิงก์")}
                                className="shrink-0 text-zinc-500 hover:text-amber-300"
                              >
                                <ClipboardList className="size-4" />
                              </button>
                            </div>
                          ))}
                      </div>
                    </div>

                    {/* copy rows */}
                    {(
                      [
                        ["สคริปต์", pack.script ?? ""],
                        ["Caption", pack.caption ?? ""],
                        ["# Hashtags", pack.hashtags.join(" ")],
                        [
                          `CTA (${CTA_TYPE_LABEL[pack.ctaType]?.label ?? pack.ctaType})`,
                          `${pack.ctaLine}${pack.affiliateLink ? `\n${pack.affiliateLink}` : ""}`,
                        ],
                      ] as [string, string][]
                    ).map(([label, text]) => (
                      <div key={label} className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-2.5">
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-[11px] font-medium text-zinc-400">{label}</span>
                          <button
                            onClick={() => copyText(text, label)}
                            disabled={!text}
                            className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
                          >
                            <ClipboardList className="size-4" />
                          </button>
                        </div>
                        <p className="max-h-24 overflow-y-auto whitespace-pre-wrap text-[11px] leading-relaxed text-zinc-300">
                          {text || "—"}
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          <p className="text-xs text-zinc-600">
            <Link href="/clip-jobs" className="inline-flex items-center gap-1 hover:text-amber-300">
              <ArrowLeft className="size-4" /> กลับหน้า Clip Jobs
            </Link>
          </p>
        </div>
      )}
    </AppShell>
  );
}
