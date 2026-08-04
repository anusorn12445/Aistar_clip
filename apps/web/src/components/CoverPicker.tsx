"use client";

// CoverPicker — ปุ่ม "🖼️ เปลี่ยนปก" ที่ใช้ซ้ำได้ทุกที่ที่มีภาพปก/hero
// เปิด overlay ตารางรูปของ entity → คลิกเลือกรูปเป็นปก (promoteCover) + อัปโหลดรูปใหม่ได้
//
// รองรับทั้ง role 'cover' (การ์ด/hero ทั่วไป) และ 'primary_reference' (portrait ตัวละคร)
// self-contained: ประกาศ type + thumb component ในไฟล์นี้เอง

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Star } from "lucide-react";
import { api } from "@/lib/api";
import { uploadAsset, type Asset, type AssetList } from "@/lib/assets";
import { useAssetImage, primeEntityThumb } from "@/lib/media";
import { promoteCover, isCoverAsset } from "@/lib/cover";

function errMsg(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

/** thumbnail เล็กในตารางเลือกปก — โหลด blob (แนบ token) ผ่าน useAssetImage */
export function AssetThumbImg({ assetId, name }: { assetId: string; name: string }) {
  const url = useAssetImage(assetId);
  if (!url) return <div className="h-full w-full animate-pulse bg-zinc-800" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={name} className="h-full w-full object-cover" />;
}

export default function CoverPicker({
  entityType,
  entityId,
  name,
  coverRole = "cover",
  assetType,
  onChanged,
  triggerClass,
  triggerLabel = "เปลี่ยนปก",
}: {
  entityType: string;
  entityId: string;
  name: string;
  /** 'cover' (ปกติ) หรือ 'primary_reference' (portrait ตัวละคร) */
  coverRole?: string;
  /** assetType ตอนอัปโหลดรูปใหม่ — default `${entityType}_cover` */
  assetType?: string;
  /** เรียกเมื่อปกเปลี่ยน/อัปโหลด — ส่ง assetId ใหม่ ให้ parent โชว์ทันที */
  onChanged?: (assetId: string) => void;
  triggerClass?: string;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const defaultTrigger =
    "rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800";

  async function loadAssets() {
    setAssets(null);
    setError(null);
    try {
      const res = await api<AssetList>(
        `/assets?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`,
      );
      setAssets(res.items.filter((a) => a.mimeType.startsWith("image/") && !a.archivedAt));
    } catch (err) {
      setError(errMsg(err, "โหลดรูปไม่สำเร็จ"));
    }
  }

  function openPicker() {
    setOpen(true);
    void loadAssets();
  }

  async function pick(target: Asset) {
    setBusy(true);
    setError(null);
    try {
      await promoteCover(entityType, entityId, target, assets ?? [], coverRole);
      onChanged?.(target.id);
      setOpen(false);
    } catch (err) {
      setError(errMsg(err, "เปลี่ยนปกไม่สำเร็จ"));
    } finally {
      setBusy(false);
    }
  }

  async function handleFile(file: File) {
    setUploading(true);
    setError(null);
    const imgs = assets ?? [];
    const isFirst = imgs.length === 0;
    try {
      const asset = await uploadAsset(file, {
        assetType: assetType ?? `${entityType}_cover`,
        entityType,
        entityId,
        // รูปแรก = ตั้งเป็นปกเลย, รูปถัด ๆ ไป = reference (ให้ผู้ใช้เลือกเอง)
        linkRole: isFirst ? coverRole : "reference",
      });
      await loadAssets();
      if (isFirst) {
        primeEntityThumb(entityType, entityId, asset.id);
        onChanged?.(asset.id);
      }
    } catch (err) {
      setError(errMsg(err, "อัปโหลดรูปไม่สำเร็จ"));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openPicker}
        title="เลือก/อัปโหลดรูปเป็นปก"
        className={triggerClass ?? defaultTrigger}
      >
        {triggerLabel}
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/70 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl border border-zinc-700 bg-zinc-900 p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-zinc-100">เปลี่ยนภาพปก</p>
                <p className="text-xs text-zinc-500">{name}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="rounded-lg border border-amber-400/40 px-3 py-1.5 text-xs text-amber-300 hover:bg-amber-400/10 disabled:opacity-50"
                >
                  {uploading ? "กำลังอัปโหลด..." : "อัปโหลดรูป"}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-sm text-zinc-400 hover:text-white"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            {error && <p className="mb-2 text-xs text-red-400">{error}</p>}

            {assets === null ? (
              <p className="py-8 text-center text-xs text-zinc-500">กำลังโหลดรูป...</p>
            ) : assets.length === 0 ? (
              <p className="py-8 text-center text-xs text-zinc-500">
                ยังไม่มีรูป — อัปโหลดก่อน
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
                {assets.map((a) => {
                  const isCover = isCoverAsset(a, entityType, entityId, coverRole);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      disabled={busy || isCover}
                      onClick={() => void pick(a)}
                      title={isCover ? "ปกปัจจุบัน" : "ตั้งเป็นปก"}
                      className={`relative aspect-square overflow-hidden rounded-lg border ${
                        isCover ? "border-amber-400" : "border-zinc-700 hover:border-amber-300"
                      } disabled:cursor-default`}
                    >
                      <AssetThumbImg assetId={a.id} name={name} />
                      {isCover && (
                        <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-0.5 bg-amber-400/90 text-center text-[10px] font-medium text-amber-950">
                          <Star className="size-3" /> ปก
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />
    </>
  );
}
