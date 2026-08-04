"use client";

// PromptExamples — แกลเลอรีตัวอย่างผลลัพธ์ของ prompt (รูป + วิดีโอ)
// - โหลดสื่อที่แนบกับ prompt ผ่าน polymorphic asset (entityType 'prompt')
// - อัปโหลดผลลัพธ์ที่ได้จาก prompt (รูปแรก = ปกการ์ด อัตโนมัติ; วิดีโอไม่เป็นปก)
// - คลิก tile → preview เต็มจอ (รูปขยาย / วิดีโอเล่นได้)
// - ตั้งเป็นปก (cover — เฉพาะรูป) / ลบ (unlink) แต่ละชิ้น
// mirror UX ของ LocationGallery ในหน้า library

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { formatFileSize, uploadAsset, type Asset, type AssetList } from "@/lib/assets";
import { primeEntityThumb, useAssetImage } from "@/lib/media";
import { promoteCover } from "@/lib/cover";
import { Clapperboard, Image as ImageIcon, Star, X } from "lucide-react";

function errMsg(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

const isVideoMime = (m: string) => m.startsWith("video/");

/** thumbnail รูปเดียวใน grid — โหลด blob (แนบ token) ผ่าน useAssetImage */
function ExampleThumb({ assetId, name }: { assetId: string; name: string }) {
  const url = useAssetImage(assetId);
  if (!url) return <div className="h-full w-full animate-pulse bg-zinc-800" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={name} className="h-full w-full object-cover" />;
}

/** tile วิดีโอ — ไม่โหลดไฟล์จริงใน grid (อาจใหญ่มาก) โชว์ placeholder + ปุ่มเล่น */
function VideoTile({ filename }: { filename: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-zinc-800 to-zinc-900">
      <span className="text-2xl"><Clapperboard className="size-4" /></span>
      <span className="max-w-full truncate px-2 text-[10px] text-zinc-500">{filename}</span>
    </div>
  );
}

/** lightbox ดูเต็ม — รูปขยาย / วิดีโอเล่น (โหลด blob แนบ token ตอนเปิดเท่านั้น) */
function PreviewOverlay({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const url = useAssetImage(asset.id);
  const video = isVideoMime(asset.mimeType);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/90 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-label={`ดูตัวอย่าง ${asset.originalFilename}`}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="ปิด"
        className="absolute right-4 top-4 rounded-full bg-zinc-800/80 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700"
      >
        <X className="size-4" /> ปิด (Esc)
      </button>
      <div className="max-h-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
        {!url ? (
          <p className="rounded-lg bg-zinc-900 px-6 py-4 text-sm text-zinc-400">
            กำลังโหลด{video ? "วิดีโอ" : "รูป"}...
          </p>
        ) : video ? (
          <video src={url} controls autoPlay className="max-h-[85vh] max-w-full rounded-xl" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={asset.originalFilename}
            className="max-h-[85vh] max-w-full rounded-xl object-contain"
          />
        )}
        <p className="mt-2 truncate text-center text-xs text-zinc-500">
          {asset.originalFilename} · {formatFileSize(asset.fileSize)}
        </p>
      </div>
    </div>
  );
}

export default function PromptExamples({
  promptId,
  name,
  onCoverChanged,
  onChanged,
  onError,
}: {
  promptId: string;
  name: string;
  /** assetId ปกใหม่ (หรือ null เมื่อไม่เหลือรูป) — ให้การ์ดอัปเดต thumbnail ทันที */
  onCoverChanged: (assetId: string | null) => void;
  /** มีการเพิ่ม/ลบรูป — ให้ list โหลดใหม่เพื่ออัปเดต badge จำนวนรูป */
  onChanged?: () => void;
  onError: (msg: string) => void;
}) {
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [preview, setPreview] = useState<Asset | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const coverLinkOf = (a: Asset) =>
    a.links.find(
      (l) => l.entityType === "prompt" && l.entityId === promptId && l.linkRole === "cover",
    );

  // primary thumbnail ปัจจุบัน: cover ก่อน ไม่งั้นรูปแรกสุด — เฉพาะรูป (วิดีโอเป็นปกไม่ได้)
  const bestAssetId = useCallback((list: Asset[]): string | null => {
    const images = list.filter((a) => !isVideoMime(a.mimeType));
    if (images.length === 0) return null;
    const cover = images.find((a) =>
      a.links.some(
        (l) => l.entityType === "prompt" && l.entityId === promptId && l.linkRole === "cover",
      ),
    );
    return (cover ?? images[images.length - 1]).id;
  }, [promptId]);

  const load = useCallback(async () => {
    try {
      const res = await api<AssetList>(
        `/assets?entityType=prompt&entityId=${encodeURIComponent(promptId)}`,
      );
      return res.items.filter(
        (a) =>
          (a.mimeType.startsWith("image/") || a.mimeType.startsWith("video/")) && !a.archivedAt,
      );
    } catch (err) {
      onError(errMsg(err, "โหลดตัวอย่างไม่สำเร็จ"));
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promptId]);

  const reload = useCallback(async () => {
    const list = await load();
    if (list) setAssets(list);
  }, [load]);

  // โหลดครั้งแรก — ใช้ async .then + cancelled flag (เลี่ยง setState แบบ sync ใน effect)
  useEffect(() => {
    let cancelled = false;
    void load().then((list) => {
      if (!cancelled && list) setAssets(list);
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      // วิดีโอไม่เป็นปกการ์ด (thumbnail รองรับเฉพาะรูป) — ผูกเป็น reference เสมอ
      const video = file.type.startsWith("video/");
      const hasCover = (assets ?? []).some((a) => coverLinkOf(a));
      const asset = await uploadAsset(file, {
        assetType: "prompt_example",
        entityType: "prompt",
        entityId: promptId,
        linkRole: video || hasCover ? "reference" : "cover",
      });
      if (!video && !hasCover) {
        primeEntityThumb("prompt", promptId, asset.id);
        onCoverChanged(asset.id);
      }
      await reload();
      onChanged?.();
    } catch (err) {
      onError(errMsg(err, "อัปโหลดตัวอย่างไม่สำเร็จ"));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  // ใช้ helper กลาง promoteCover (ถอด cover เดิม → reference, ตั้งรูปใหม่เป็น cover)
  async function setCover(target: Asset) {
    setBusyId(target.id);
    try {
      await promoteCover("prompt", promptId, target, assets ?? [], "cover");
      onCoverChanged(target.id);
      await reload();
      onChanged?.();
    } catch (err) {
      onError(errMsg(err, "ตั้งเป็นปกไม่สำเร็จ"));
    } finally {
      setBusyId(null);
    }
  }

  // ลบตัวอย่างออกจาก prompt = ถอด link ทั้งหมดของ asset นี้ที่ผูกกับ prompt
  async function remove(target: Asset) {
    if (!window.confirm("ลบตัวอย่างนี้ออกจาก prompt?")) return;
    setBusyId(target.id);
    try {
      const links = target.links.filter(
        (l) => l.entityType === "prompt" && l.entityId === promptId,
      );
      for (const l of links) {
        await api(`/assets/${target.id}/links/${l.id}`, { method: "DELETE" });
      }
      const remaining = (assets ?? []).filter((a) => a.id !== target.id);
      const nextCover = bestAssetId(remaining);
      primeEntityThumb("prompt", promptId, nextCover);
      onCoverChanged(nextCover);
      await reload();
      onChanged?.();
    } catch (err) {
      onError(errMsg(err, "ลบรูปไม่สำเร็จ"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-zinc-200">
          <ImageIcon className="size-4" /> ตัวอย่างผลลัพธ์{assets && assets.length > 0 ? ` (${assets.length})` : ""}
          <span className="ml-1 text-[11px] font-normal text-zinc-500">รูป + วิดีโอ</span>
        </p>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
        >
          {uploading ? "กำลังอัปโหลด..." : "+ อัปโหลดรูป/วิดีโอ"}
        </button>
      </div>

      {assets === null ? (
        <p className="text-xs text-zinc-500">กำลังโหลดตัวอย่าง...</p>
      ) : assets.length === 0 ? (
        <p className="text-xs text-zinc-500">
          ยังไม่มีตัวอย่าง — อัปโหลดรูปหรือคลิปผลลัพธ์ที่ได้จาก prompt นี้
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {assets.map((a) => {
            const isCover = Boolean(coverLinkOf(a));
            const video = isVideoMime(a.mimeType);
            return (
              <div
                key={a.id}
                className={`overflow-hidden rounded-xl border ${
                  isCover ? "border-amber-400/60" : "border-zinc-800"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setPreview(a)}
                  aria-label={`ดูตัวอย่าง ${a.originalFilename}`}
                  className="relative block aspect-square w-full cursor-zoom-in"
                >
                  {video ? (
                    <VideoTile filename={a.originalFilename} />
                  ) : (
                    <ExampleThumb assetId={a.id} name={name} />
                  )}
                  {video && (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="rounded-full bg-zinc-950/70 p-2.5 text-lg leading-none" />
                    </span>
                  )}
                  {isCover && (
                    <span className="absolute left-1.5 top-1.5 rounded-md bg-amber-400/90 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-950">
                      <Star className="size-4" /> ปก
                    </span>
                  )}
                </button>
                <div className="flex items-center justify-between gap-1 px-2 py-1.5">
                  {isCover ? (
                    <span className="text-[11px] font-medium text-amber-300">ปกการ์ด</span>
                  ) : video ? (
                    <span className="text-[11px] text-zinc-500"><Clapperboard className="size-4" /> วิดีโอ</span>
                  ) : (
                    <button
                      type="button"
                      disabled={busyId !== null}
                      onClick={() => void setCover(a)}
                      className="text-[11px] text-zinc-400 hover:text-amber-300 disabled:opacity-50"
                    >
                      {busyId === a.id ? "..." : "ตั้งเป็นปก"}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => void remove(a)}
                    className="text-[11px] text-zinc-500 hover:text-red-300 disabled:opacity-50"
                    title={`${formatFileSize(a.fileSize)}`}
                  >
                    ลบ
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />
      <p className="text-[11px] text-zinc-600">
        คลิกที่ตัวอย่างเพื่อดูเต็ม/เล่นคลิป · รูปแรก = ปกการ์ดอัตโนมัติ · วิดีโอไม่เป็นปก
      </p>

      {preview && <PreviewOverlay asset={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}
