"use client";

// 🌐 ทุกแหล่ง — Prompt Hub: live reference รวม prompt จาก 6 คลัง (Location/Gesture/
// Camera/Lighting/Hand/Character Master Prompt) — อ่านสดจากต้นทาง ไม่ก๊อปอัตโนมัติ
//  - 👁️ ดู/ก๊อป → PromptViewerModal (5 คลัง compose ฝั่ง client จาก row.source,
//    character ใช้ characterVariants ที่ server compose ด้วย exports builder)
//  - 🔗 ไปที่ต้นทาง → deep-link ไปหน้าคลังต้นทาง (แก้ไขทำที่นั่นเท่านั้น)
//  - ⭐ เก็บเข้าคลังหลัก → snapshot เป็น Prompt/version (frozen, versionable)

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import CoverImage from "@/components/CoverImage";
import PromptViewerModal from "@/components/PromptViewerModal";
import { ArrowLeft, ArrowRight, Eye, Globe, Link as LinkIcon, Star, X } from "lucide-react";
import {
  buildCameraPromptVariants,
  buildGesturePromptVariants,
  buildHandPromptVariants,
  buildLightingPromptVariants,
  buildLocationPromptVariants,
  type PromptVariant,
} from "@/lib/promptBuilders";
import type { LocationItem } from "@/lib/library";
import type { CameraPreset, Gesture, HandProfile, LightingPreset } from "@/lib/interaction";
import {
  HUB_SOURCE_META,
  HUB_SOURCE_TYPES,
  fetchPromptHub,
  hubSourceHref,
  snapshotHubSource,
  type HubSourceType,
  type PromptHubList,
  type PromptHubRow,
} from "@/lib/prompts";

const inputCls =
  "rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-amber-400";

/** compose variants ให้ PromptViewerModal — 5 คลังใช้ client builders เดิม, character ใช้ของ server */
function variantsOf(row: PromptHubRow): PromptVariant[] {
  if (row.sourceType === "character") {
    return (row.characterVariants ?? []).map((v) => ({
      tool: v.tool,
      label: v.label,
      text: v.text,
    }));
  }
  const src = row.source ?? {};
  switch (row.sourceType) {
    case "location":
      return buildLocationPromptVariants(src as unknown as LocationItem);
    case "gesture":
      return buildGesturePromptVariants(src as unknown as Gesture);
    case "camera_preset":
      return buildCameraPromptVariants(src as unknown as CameraPreset);
    case "lighting_preset":
      return buildLightingPromptVariants(src as unknown as LightingPreset);
    case "hand":
      return buildHandPromptVariants(src as unknown as HandProfile);
    default:
      return [];
  }
}

export default function HubTab({
  onOpenInLibrary,
}: {
  /** หลัง snapshot สำเร็จ ผู้ใช้กดลิงก์ → สลับไปแท็บคลังหลัก + ค้นหาด้วยชื่อ prompt */
  onOpenInLibrary: (promptName: string) => void;
}) {
  const [q, setQ] = useState("");
  const [fType, setFType] = useState<HubSourceType | "">("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PromptHubList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [viewer, setViewer] = useState<PromptHubRow | null>(null);
  const [snapBusy, setSnapBusy] = useState<string | null>(null); // `${type}|${id}` ที่กำลัง snapshot
  const [toast, setToast] = useState<{ message: string; promptName: string } | null>(null);

  const load = useCallback(async (opts: { q: string; sourceType: HubSourceType | ""; page: number }) => {
    setLoading(true);
    try {
      const res = await fetchPromptHub({ q: opts.q, sourceType: opts.sourceType, page: opts.page });
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  // ค้นหาแบบ debounce 400ms (server-side q) — เปลี่ยน filter/หน้า โหลดทันที
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      void load({ q, sourceType: fType, page });
      return;
    }
    const t = setTimeout(() => void load({ q, sourceType: fType, page }), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  useEffect(() => {
    if (first.current) return;
    void load({ q, sourceType: fType, page });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fType, page]);

  async function handleSnapshot(row: PromptHubRow) {
    const key = `${row.sourceType}|${row.sourceId}`;
    setSnapBusy(key);
    setError(null);
    try {
      const res = await snapshotHubSource(row.sourceType, row.sourceId);
      setToast({
        message: `เก็บเข้าคลังหลักแล้ว (${res.versionLabel})`,
        promptName: res.prompt.name,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "เก็บเข้าคลังหลักไม่สำเร็จ");
    } finally {
      setSnapBusy(null);
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-6">
      <p className="text-xs text-zinc-500">
        <Globe className="size-4" /> รวม prompt จากทุกคลังแบบ <span className="text-zinc-300">live reference</span> — อ่านสดจากต้นทาง
        ไม่ก๊อปอัตโนมัติ · แก้ไขที่ต้นทางเท่านั้น · กด <Star className="size-4" /> เมื่ออยากได้สำเนา frozen เข้าคลังหลัก
      </p>

      {/* search + source chips */}
      <div className="space-y-3">
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder="ค้นหาชื่อ / โค้ด ข้ามทุกคลัง..."
          className={`${inputCls} w-full sm:max-w-md`}
        />
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              setFType("");
              setPage(1);
            }}
            className={`rounded-full border px-3 py-1 text-xs ${
              fType === ""
                ? "border-amber-400 bg-amber-400/10 text-amber-300"
                : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            }`}
          >
            ทั้งหมด
          </button>
          {HUB_SOURCE_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => {
                setFType(t);
                setPage(1);
              }}
              className={`rounded-full border px-3 py-1 text-xs ${
                fType === t
                  ? "border-amber-400 bg-amber-400/10 text-amber-300"
                  : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              }`}
            >
              {HUB_SOURCE_META[t].icon} {HUB_SOURCE_META[t].label}
            </button>
          ))}
        </div>
      </div>

      {/* toast หลัง snapshot สำเร็จ — ลิงก์สลับไปแท็บคลังหลัก + ค้นหาชื่อ prompt */}
      {toast && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-700/50 bg-emerald-900/20 px-4 py-2.5 text-sm text-emerald-200">
          <span><Star className="size-4" /> {toast.message}</span>
          <button
            onClick={() => onOpenInLibrary(toast.promptName)}
            className="inline-flex items-center gap-1 rounded-md border border-emerald-600/60 px-2 py-0.5 text-xs text-emerald-200 hover:bg-emerald-800/40"
          >
            ดูในคลังหลัก <ArrowRight className="size-4" />
          </button>
          <button
            onClick={() => setToast(null)}
            className="ml-auto text-emerald-300/60 hover:text-emerald-200"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
      {loading && !data && <p className="text-sm text-zinc-500">กำลังโหลด...</p>}

      {/* card grid */}
      {data && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.items.map((row) => {
              const meta = HUB_SOURCE_META[row.sourceType];
              const key = `${row.sourceType}|${row.sourceId}`;
              return (
                <div
                  key={key}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 transition-all hover:-translate-y-1 hover:border-amber-400/40 hover:shadow-xl hover:shadow-black/40"
                >
                  <CoverImage
                    assetId={row.thumbnailAssetId}
                    entityType={row.sourceType === "character" ? "character" : undefined}
                    name={row.name}
                    aspect="aspect-[16/7]"
                    className="rounded-none"
                  >
                    <span className="absolute left-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] text-zinc-200 backdrop-blur-sm">
                      {meta.icon} {meta.label}
                    </span>
                  </CoverImage>
                  <div className="flex flex-1 flex-col gap-2 px-3 py-2.5">
                    <div>
                      <p className="truncate text-sm font-semibold text-zinc-100" title={row.name}>
                        {row.name}
                      </p>
                      {row.code && (
                        <p className="font-mono text-[10px] text-zinc-500">{row.code}</p>
                      )}
                    </div>
                    <p className="line-clamp-3 flex-1 whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-zinc-400">
                      {row.preview || "—"}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        onClick={() => setViewer(row)}
                        className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-amber-300"
                      >
                        <Eye className="size-4" /> ดู/ก๊อป
                      </button>
                      <Link
                        href={hubSourceHref(row.sourceType, row.sourceId)}
                        className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-amber-300"
                      >
                        <LinkIcon className="size-4" /> ไปที่ต้นทาง
                      </Link>
                      <button
                        onClick={() => void handleSnapshot(row)}
                        disabled={snapBusy === key}
                        title="สำเนา frozen เข้าคลังหลัก (ทำ version ต่อได้)"
                        className="ml-auto rounded-md bg-amber-400/90 px-2 py-1 text-xs font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
                      >
                        {snapBusy === key ? "กำลังเก็บ..." : "เก็บเข้าคลังหลัก"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {data.items.length === 0 && !loading && (
            <div className="rounded-2xl border border-dashed border-zinc-800 px-4 py-14 text-center text-zinc-500">
              <p className="text-3xl"><Globe className="size-4" /></p>
              <p className="mt-2 text-sm">ไม่พบ prompt จากแหล่งที่เลือก — ลองเปลี่ยนคำค้นหรือ chip แหล่ง</p>
            </div>
          )}

          {/* pagination — สอดคล้องกับคลังอื่น */}
          <div className="flex items-center gap-3 text-xs text-zinc-500">
            <span>
              ทั้งหมด {data.total} รายการ · หน้า {data.page}/{totalPages}
            </span>
            {totalPages > 1 && (
              <span className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-md border border-zinc-700 px-2 py-1 text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
                >
                  <ArrowLeft className="size-4" /> ก่อนหน้า
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="inline-flex items-center gap-1 rounded-md border border-zinc-700 px-2 py-1 text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
                >
                  ถัดไป <ArrowRight className="size-4" />
                </button>
              </span>
            )}
          </div>
        </>
      )}

      {viewer && (
        <PromptViewerModal
          title={`${HUB_SOURCE_META[viewer.sourceType].icon} ${viewer.name}`}
          variants={variantsOf(viewer)}
          onClose={() => setViewer(null)}
        />
      )}
    </div>
  );
}
