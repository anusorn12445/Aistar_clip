"use client";

// 🔄 Turnaround Sheet (Character Sheet ข้อ 1) — รูปเดียวแนวนอนรวมทุกมุม (CEO directive)
// gen ครั้งเดียวได้ครบ 5 มุมในภาพเดียว เร็วกว่าแยก 5 รูปมาก
//  - "📋 ก๊อป prompt แผ่นรวมมุม" = Master Prompt + บล็อก TURNAROUND SHEET (3 ค่าย, Grok พก negative + --ar 16:9)
//  - "📷 วางรูป" = อัปโหลดแผ่นที่ gen แล้ว → link role 'turnaround_sheet' (แผ่นเดียวเสมอ อัปใหม่แทนที่)
//  - ชุดเก่าแบบแยก 5 มุม (ถ้าเคยทำไว้) ยังเปิดดูได้ใน "มุมแยกชุดเก่า"

import { useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { uploadAsset, type Asset } from "@/lib/assets";
import { AssetThumbImg } from "@/components/CoverPicker";
import PromptViewerModal from "@/components/PromptViewerModal";
import type { PromptVariant } from "@/lib/promptBuilders";
import {
  buildTurnaroundSheetPrompt,
  IMAGE_TOOLS,
  TURNAROUND_ANGLES,
  TURNAROUND_SHEET_ROLE,
  type MasterPromptBlueprint,
  type PromptCharacter,
} from "./imagePrompt";
import { Camera, Check, ClipboardList, FolderOpen, PersonStanding, RefreshCw } from "lucide-react";

export default function TurnaroundSection({
  characterId,
  character,
  blueprint,
  hasReference,
  assets,
  onAssetsChanged,
}: {
  characterId: string;
  character: PromptCharacter;
  blueprint: MasterPromptBlueprint | null;
  hasReference: boolean;
  assets: Asset[];
  onAssetsChanged: () => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const imageAssets = useMemo(
    () => assets.filter((a) => a.mimeType.startsWith("image/") && !a.archivedAt),
    [assets],
  );

  const assetForRole = (role: string): Asset | null =>
    imageAssets.find((a) =>
      a.links.some(
        (l) => l.entityType === "character" && l.entityId === characterId && l.linkRole === role,
      ),
    ) ?? null;

  const sheetAsset = assetForRole(TURNAROUND_SHEET_ROLE);
  // ชุดเก่าแบบแยกมุม — โชว์เฉพาะเมื่อเคยมีรูป (ตัวละครที่ทำไว้ก่อนเปลี่ยนเป็นแผ่นเดียว)
  const legacyAngles = TURNAROUND_ANGLES.map((a) => ({ ...a, asset: assetForRole(a.role) })).filter(
    (a) => a.asset,
  );

  const promptVariants: PromptVariant[] = IMAGE_TOOLS.map((t) => ({
    tool: t.id,
    label: t.label,
    hint: t.hint,
    text: buildTurnaroundSheetPrompt(t.id, character, blueprint, { hasReference }),
  }));

  async function linkExisting(assetId: string) {
    setBusy(true);
    setError(null);
    try {
      await api(`/assets/${assetId}/links`, {
        method: "POST",
        body: JSON.stringify({
          entityType: "character",
          entityId: characterId,
          linkRole: TURNAROUND_SHEET_ROLE,
        }),
      });
      await onAssetsChanged();
      setShowPicker(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ตั้งรูปแผ่น turnaround ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await uploadAsset(file, {
        assetType: "turnaround",
        entityType: "character",
        entityId: characterId,
        linkRole: TURNAROUND_SHEET_ROLE,
      });
      await onAssetsChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "อัปโหลดรูปไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="inline-flex items-center gap-2 text-lg font-semibold">
          <RefreshCw className="size-5" /> Turnaround Sheet (รูปเดียวรวมทุกมุม)
        </h3>
        {sheetAsset ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-300">
            <Check className="size-3.5" /> มีแผ่น reference แล้ว
          </span>
        ) : (
          <span className="text-xs text-zinc-500">ยังไม่มีแผ่น reference</span>
        )}
      </div>
      <p className="text-xs text-zinc-500">
        ก๊อป prompt แผ่นรวมมุม → วางใน ChatGPT/Grok พร้อมแนบรูป Reference → ได้ภาพแนวนอนภาพเดียวที่มีครบ 5
        มุม (หน้าตรง / ¾ / ข้าง / หลัง / เต็มตัว) → เอากลับมาวางที่นี่ — ใช้เป็น reference แนบมือตอน gen งานจริง
      </p>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {/* แผ่นเดียว แนวนอน */}
      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/60">
        <div className="relative aspect-video bg-zinc-800">
          {sheetAsset ? (
            <AssetThumbImg assetId={sheetAsset.id} name="Turnaround Sheet" />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-zinc-600">
              <span className="flex gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <PersonStanding key={i} className="size-8" />
                ))}
              </span>
              <span className="text-xs">ยังไม่มีแผ่น turnaround — ก๊อป prompt ไป gen แล้วเอารูปมาวาง</span>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2 p-3">
          <button
            onClick={() => setShowPrompt(true)}
            className="inline-flex items-center gap-1 rounded-lg border border-amber-400/40 px-3 py-1.5 text-sm text-amber-300 hover:bg-amber-400/10"
          >
            <ClipboardList className="size-4" /> ก๊อป prompt แผ่นรวมมุม
          </button>
          <button
            disabled={busy}
            onClick={() => fileInput.current?.click()}
            title="อัปโหลดแผ่นที่ gen แล้ว (แทนที่แผ่นเดิม)"
            className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
          >
            <Camera className="size-4" /> วางรูป
          </button>
          <button
            disabled={busy}
            onClick={() => setShowPicker((v) => !v)}
            title="เลือกจากรูปของตัวละครที่อัปโหลดไว้แล้ว"
            className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800 disabled:opacity-50"
          >
            <FolderOpen className="size-4" /> เลือกจากคลัง
          </button>
        </div>
      </div>

      {/* เลือกจากรูปของตัวละคร (Asset Gallery) */}
      {showPicker && (
        <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-zinc-300">เลือกรูปแผ่น Turnaround</p>
            <button
              onClick={() => setShowPicker(false)}
              className="rounded-md border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-400 hover:bg-zinc-800"
            >
              ปิด
            </button>
          </div>
          {imageAssets.length === 0 ? (
            <p className="text-xs text-zinc-500">ยังไม่มีรูปของตัวละคร — อัปโหลดที่ Asset Gallery ก่อน</p>
          ) : (
            <div className="grid max-h-48 grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-6">
              {imageAssets.map((a) => (
                <button
                  key={a.id}
                  disabled={busy}
                  onClick={() => void linkExisting(a.id)}
                  className="relative aspect-square overflow-hidden rounded-lg border border-zinc-700 hover:border-amber-300 disabled:opacity-50"
                >
                  <AssetThumbImg assetId={a.id} name={a.originalFilename} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ชุดเก่าแบบแยก 5 มุม — โชว์เฉพาะตัวละครที่เคยทำไว้ */}
      {legacyAngles.length > 0 && (
        <details className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
          <summary className="cursor-pointer text-xs text-zinc-400">
            มุมแยกชุดเก่า ({legacyAngles.length} มุม) — ระบบเปลี่ยนเป็นแผ่นเดียวแล้ว รูปเก่ายังอยู่ในคลัง
          </summary>
          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {legacyAngles.map((a) => (
              <div key={a.id} className="overflow-hidden rounded-lg border border-zinc-800">
                <div className="relative aspect-[3/4] bg-zinc-800">
                  <AssetThumbImg assetId={a.asset!.id} name={a.labelTh} />
                  <span className="absolute left-1 top-1 rounded-full bg-black/70 px-1.5 py-0.5 text-[10px] text-zinc-200">
                    {a.labelTh}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={handleUpload} />

      {showPrompt && (
        <PromptViewerModal
          title="Turnaround Sheet — แผ่นรวมทุกมุม (แนวนอน)"
          variants={promptVariants}
          onClose={() => setShowPrompt(false)}
        />
      )}
    </section>
  );
}
