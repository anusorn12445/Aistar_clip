"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import CoverPicker, { AssetThumbImg } from "@/components/CoverPicker";
import { FilterSelect } from "@/components/ui/filter-select";
import {
  api,
  fetchCharacterBlueprint,
  fetchCharacterBlueprints,
  getToken,
  verifyCharacterSpec,
  type Character,
  type CharacterBlueprint,
  type Creator,
  type SpecVerifyResult,
} from "@/lib/api";
import { gradientFor, initialOf, useAssetImage, useEntityThumb } from "@/lib/media";
import {
  ASSET_NEXT_ACTIONS,
  ASSET_STATUS_LABEL,
  downloadAssetFile,
  downloadEntityAssetsZip,
  fetchAssetObjectUrl,
  formatFileSize,
  uploadAsset,
  type Asset,
  type AssetList,
} from "@/lib/assets";
import TieInProducts from "@/components/TieInProducts";
import AudienceSection from "./AudienceSection";
import CategorySection from "./CategorySection";
import RelationshipSection from "./RelationshipSection";
import WardrobeSection, { type SheetPromptContext } from "./WardrobeSection";
import ExpressionSection from "./ExpressionSection";
import PoseSection from "./PoseSection";
import RightsSection from "./RightsSection";
import TurnaroundSection from "./TurnaroundSection";
import DosDontsSection from "./DosDontsSection";
import { useMasterBlueprint } from "./useMasterBlueprint";
import {
  buildMasterPromptFor,
  buildPromptFor,
  hasEthnicity,
  IMAGE_TOOLS,
  type ImageTool,
} from "./imagePrompt";
import {
  ArrowLeft,
  Archive,
  BookOpen,
  Check,
  CircleHelp,
  ClipboardList,
  Compass,
  Download,
  Eye,
  FileText,
  FlaskConical,
  Image as ImageIcon,
  Lightbulb,
  Link as LinkIcon,
  Loader2,
  Mail,
  MessageSquare,
  Package,
  Palette,
  Pencil,
  Phone,
  Pin,
  RotateCcw,
  Search,
  Sparkles,
  Star,
  Trash2,
  TriangleAlert,
  Undo2,
  Wallet,
  X,
  ChevronDown,
  ScanFace,
} from "lucide-react";

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-zinc-700 text-zinc-200" },
  internal_review: { label: "รอตรวจ", cls: "bg-blue-900 text-blue-200" },
  revision_needed: { label: "ต้องแก้", cls: "bg-orange-900 text-orange-200" },
  approved: { label: "Approved", cls: "bg-emerald-900 text-emerald-200" },
  production_ready: { label: "Production Ready", cls: "bg-amber-900 text-amber-200" },
  rejected: { label: "Rejected", cls: "bg-red-900 text-red-200" },
  archived: { label: "Archived", cls: "bg-zinc-800 text-zinc-500" },
};

// ปุ่ม action ต่อ status ตาม state machine §D.2 (ฝั่ง API เช็คซ้ำอีกชั้น)
const CHARACTER_ACTIONS: Record<string, { to: string; label: string; primary?: boolean }[]> = {
  draft: [{ to: "internal_review", label: "ส่งตรวจ", primary: true }],
  internal_review: [
    { to: "approved", label: "อนุมัติ", primary: true },
    { to: "revision_needed", label: "ต้องแก้" },
  ],
  revision_needed: [{ to: "draft", label: "กลับไปแก้ (Draft)", primary: true }],
  approved: [{ to: "production_ready", label: "Production Ready", primary: true }],
  production_ready: [],
  rejected: [],
  archived: [],
};

// Phase 4: ผลเช็คความซ้ำจาก AI Similarity Checker
interface SimilarityItem {
  characterId: string;
  displayCode: string;
  name: string;
  similarityScore: number;
  overlappingTraits: string[];
  riskNote: string;
  flagged: boolean;
}

interface SimilarityResult {
  items: SimilarityItem[];
  summary: string;
  comparedCount: number;
}

const ASSET_TYPES = [
  { value: "face_reference", label: "Face Reference" },
  { value: "full_body", label: "Full Body" },
  { value: "expression_sheet", label: "Expression Sheet" },
  { value: "outfit", label: "Outfit" },
  { value: "other", label: "อื่น ๆ" },
];

// thumbnail ต้องแนบ token — โหลดเป็น blob แล้วเสียบ object URL
function AssetThumb({ asset }: { asset: Asset }) {
  const [url, setUrl] = useState<string | null>(null);
  const isImage = asset.mimeType.startsWith("image/");

  useEffect(() => {
    if (!isImage) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    fetchAssetObjectUrl(asset.id)
      .then((u) => {
        if (cancelled) {
          URL.revokeObjectURL(u);
          return;
        }
        objectUrl = u;
        setUrl(u);
      })
      .catch(() => setUrl(null));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [asset.id, isImage]);

  if (isImage && url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={asset.originalFilename}
        className="h-40 w-full object-cover"
      />
    );
  }
  return (
    <div className="flex h-40 w-full flex-col items-center justify-center gap-2 text-zinc-600">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-10 w-10">
        <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
        <path d="M14 3v5h5" />
      </svg>
      <span className="max-w-full truncate px-2 text-xs">{asset.mimeType}</span>
    </div>
  );
}

type BibleJson = Record<string, unknown>;
type CharacterBible = Omit<Character, "persona"> & {
  persona: BibleJson | null;
  visualDna?: BibleJson | null;
  commerceProfile?: BibleJson | null;
  voiceProfile?: BibleJson | null;
  age?: number | null;
  gender?: string | null;
  region?: string | null;
  roleLabel?: string | null;
  // Blueprint (พิมพ์เขียว) ที่ใช้สร้าง — Master Prompt viewer ดึง houseRules มากำกับ
  blueprintId?: string | null;
  // API build ใหม่แนบ tags มากับ GET /characters/:id — build เก่าไม่มี ก็แค่ไม่โชว์
  tags?: { id: string; name: string }[];
  // Do's & Don'ts (Character Sheet) — ฝังเข้า DIRECTIVE ของทุก prompt ที่ก๊อป
  dos?: string[];
  donts?: string[];
};

interface TagOption {
  id: string;
  name: string;
  useCount: number;
}

const BIBLE_SECTIONS: { key: "persona" | "visualDna" | "commerceProfile" | "voiceProfile"; title: string }[] = [
  { key: "persona", title: "บุคลิก (Persona)" },
  { key: "visualDna", title: "Visual DNA" },
  { key: "commerceProfile", title: "Commerce Profile" },
  { key: "voiceProfile", title: "Voice Profile" },
];

function bibleValue(v: unknown): string {
  if (v == null || v === "") return "—";
  if (Array.isArray(v)) return v.map((x) => String(x)).join(" · ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

// 👁️ Image Prompt Viewer — ดู/แก้/ก๊อป prompt gen รูปแยกตาม tool (ChatGPT/Gemini/Grok)
// prompt สร้างจาก visualDna แบบ pure function (ดู imagePrompt.ts) — v2 นำหน้าด้วย ethnicity
// และตัดข้อความ "avoid real people/celebrity/IP" ออกจาก ChatGPT/Gemini เพื่อไม่ให้ติด content policy
//
// Verified Prompt downstream:
// - 🧭 Master Prompt (default ON) — ห่อ spec ด้วย DIRECTIVE (กฎเหล็ก + houseRules จาก
//   blueprint ของตัวละคร) + MUST-KEEP ใน copy เดียว / OFF = spec เดิมเป๊ะ ๆ
// - 📌 รูป Reference — ล็อกรูป 1 รูปต่อตัวละคร (linkRole prompt_reference, server กัน
//   ซ้ำให้) เป็น ground truth ของหน้า — ก๊อป prompt แล้วลากรูปแนบไปที่ค่ายนอกคู่กัน
function ImagePromptViewer({
  character,
  assets,
  onAssetsChanged,
  onClose,
}: {
  character: CharacterBible;
  assets: Asset[];
  onAssetsChanged: () => Promise<void>;
  onClose: () => void;
}) {
  const [tool, setTool] = useState<ImageTool>("chatgpt");
  const [master, setMaster] = useState(true); // Master Prompt เปิดเป็นค่าเริ่มต้น
  const [blueprint, setBlueprint] = useState<CharacterBlueprint | null>(null);
  const [text, setText] = useState<string>("");
  const [dirty, setDirty] = useState(false);
  const [copied, setCopied] = useState(false);
  const [refBusy, setRefBusy] = useState(false);
  const [refError, setRefError] = useState<string | null>(null);
  const [refPickerOpen, setRefPickerOpen] = useState(false);

  const missingEthnicity = !hasEthnicity(character.visualDna);

  const imageAssets = useMemo(
    () => assets.filter((a) => a.mimeType.startsWith("image/") && !a.archivedAt),
    [assets],
  );
  // รูป Reference ที่ล็อกไว้ = asset ที่ถือ link prompt_reference กับตัวละครนี้
  const refAsset = useMemo(
    () =>
      imageAssets.find((a) =>
        a.links.some(
          (l) =>
            l.entityType === "character" &&
            l.entityId === character.id &&
            l.linkRole === "prompt_reference",
        ),
      ) ?? null,
    [imageAssets, character.id],
  );

  // blueprint ของตัวละคร (blueprintId) — ใช้ไม่ได้/ไม่มี → fallback default ที่ active
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (character.blueprintId) {
        try {
          const bp = await fetchCharacterBlueprint(character.blueprintId);
          if (bp.status === "active") {
            if (!cancelled) setBlueprint(bp);
            return;
          }
        } catch {
          // archived/หาย/API เก่า — ตกไปใช้ default ด้านล่าง
        }
      }
      try {
        const list = await fetchCharacterBlueprints({ status: "active" });
        if (!cancelled) setBlueprint(list.find((b) => b.isDefault) ?? null);
      } catch {
        if (!cancelled) setBlueprint(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [character.blueprintId]);

  // prompt ที่ระบบสร้าง ณ ตอนนี้ — Master ON = 3 ชั้น, OFF = spec เดิมเป๊ะ ๆ
  const built = master
    ? buildMasterPromptFor(tool, character, blueprint, { hasReference: !!refAsset })
    : buildPromptFor(tool, character);

  // sync textarea กับค่าที่ระบบสร้าง ตราบใดที่ผู้ใช้ยังไม่แก้เอง (dirty)
  useEffect(() => {
    if (!dirty) setText(built);
  }, [built, dirty]);

  function switchTool(next: ImageTool) {
    if (next === tool) return;
    setTool(next);
    setDirty(false);
    setCopied(false);
  }

  function resetToBuilt() {
    setText(built);
    setDirty(false);
  }

  function copyPrompt() {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  async function setReference(asset: Asset) {
    setRefBusy(true);
    setRefError(null);
    try {
      // server enforce ตัวเดียวต่อตัวละคร: demote prompt_reference ตัวเดิมเป็น reference ให้เอง
      await api(`/assets/${asset.id}/links`, {
        method: "POST",
        body: JSON.stringify({
          entityType: "character",
          entityId: character.id,
          linkRole: "prompt_reference",
        }),
      });
      await onAssetsChanged();
      setRefPickerOpen(false);
      setDirty(false); // rebuild prompt ให้ DIRECTIVE มีกฎรูปแนบ
    } catch (err) {
      setRefError(err instanceof Error ? err.message : "ตั้งรูป Reference ไม่สำเร็จ");
    } finally {
      setRefBusy(false);
    }
  }

  async function clearReference() {
    if (!refAsset) return;
    const link = refAsset.links.find(
      (l) =>
        l.entityType === "character" &&
        l.entityId === character.id &&
        l.linkRole === "prompt_reference",
    );
    if (!link) return;
    setRefBusy(true);
    setRefError(null);
    try {
      await api(`/assets/${refAsset.id}/links/${link.id}`, { method: "DELETE" });
      // ถ้ารูปไม่เหลือ link กับตัวละครนี้เลย ใส่ reference กลับ — กันรูปหลุดจาก gallery
      const hasOther = refAsset.links.some(
        (l) => l.id !== link.id && l.entityType === "character" && l.entityId === character.id,
      );
      if (!hasOther) {
        await api(`/assets/${refAsset.id}/links`, {
          method: "POST",
          body: JSON.stringify({
            entityType: "character",
            entityId: character.id,
            linkRole: "reference",
          }),
        });
      }
      await onAssetsChanged();
      setDirty(false);
    } catch (err) {
      setRefError(err instanceof Error ? err.message : "เอารูป Reference ออกไม่สำเร็จ");
    } finally {
      setRefBusy(false);
    }
  }

  // เปิดรูปเต็มในแท็บใหม่ (asset ต้องแนบ token — โหลดเป็น blob แล้วเปิด object URL)
  async function openFullImage() {
    if (!refAsset) return;
    try {
      const url = await fetchAssetObjectUrl(refAsset.id);
      window.open(url, "_blank");
    } catch {
      setRefError("เปิดรูปเต็มไม่สำเร็จ");
    }
  }

  const v = (character.visualDna ?? {}) as BibleJson;
  const antiClone = Array.isArray(v.anti_clone_rules) ? (v.anti_clone_rules as unknown[]) : [];
  const negativePrompt = typeof v.negative_prompt === "string" ? v.negative_prompt : "";
  const hasInternal = antiClone.length > 0 || negativePrompt.length > 0;

  const activeHint = IMAGE_TOOLS.find((t) => t.id === tool)?.hint ?? "";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="fixed inset-y-0 right-0 flex h-full w-full max-w-2xl flex-col space-y-4 overflow-y-auto border-l border-zinc-800 bg-zinc-900 p-6 shadow-2xl duration-200 animate-in slide-in-from-right"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="inline-flex items-center gap-2 text-lg font-semibold">
            <Eye className="size-5" /> ดู/ก๊อป Prompt ภาพ
          </h3>
          <button
            onClick={onClose}
            className="rounded-lg border border-zinc-700 px-2.5 py-1 text-sm text-zinc-400 hover:bg-zinc-800"
          >
            ปิด
          </button>
        </div>

        {/* Tool tabs */}
        <div className="flex flex-wrap gap-2">
          {IMAGE_TOOLS.map((t) => (
            <button
              key={t.id}
              onClick={() => switchTool(t.id)}
              className={`rounded-lg border px-3 py-1.5 text-sm ${
                tool === t.id
                  ? "border-amber-400 bg-amber-400/10 text-amber-300"
                  : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-zinc-500">{activeHint}</p>

        {/* 🧭 Master Prompt toggle — ON (default) = DIRECTIVE + SPEC + MUST-KEEP, OFF = spec เดิม */}
        <div className="space-y-1 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex cursor-pointer select-none items-center gap-2 text-sm font-medium text-zinc-200">
              <input
                type="checkbox"
                checked={master}
                onChange={(e) => {
                  setMaster(e.target.checked);
                  setDirty(false);
                  setCopied(false);
                }}
                className="h-4 w-4 accent-amber-400"
              />
              <Compass className="size-4" /> Master Prompt (กรอบกำกับเต็ม)
            </label>
            {master && blueprint && (
              <span className="text-[11px] text-zinc-500">
                {blueprint.houseRules?.trim()
                  ? `กฎสตูดิโอจาก blueprint: ${blueprint.name}`
                  : `blueprint: ${blueprint.name} (ไม่มีกฎเพิ่มเติม)`}
              </span>
            )}
          </div>
          <p className="text-[11px] text-zinc-500">
            {master
              ? "ครบชุดกฎเหล็กล็อกตัวตน + สเปก + MUST-KEEP ในก๊อปเดียว — วางที่ค่ายนอกได้เลย"
              : "ปิดอยู่ — ได้เฉพาะ spec แบบเดิม (ไม่มีกรอบกำกับ)"}
          </p>
        </div>

        {/* 📌 รูป Reference — ล็อกหน้า 1 รูปต่อตัวละคร แนบคู่ prompt ตอน gen */}
        <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-300">
              <Pin className="size-4" /> รูป Reference (ล็อกหน้าให้นิ่ง)
            </p>
            <div className="flex flex-wrap gap-1.5">
              {refAsset ? (
                <>
                  <button
                    onClick={() => void openFullImage()}
                    className="inline-flex items-center gap-1 rounded-md border border-amber-400/40 px-2 py-1 text-[11px] text-amber-300 hover:bg-amber-400/10"
                  >
                    <Download className="size-3.5" /> เปิดรูปเต็ม
                  </button>
                  <button
                    disabled={refBusy}
                    onClick={() => setRefPickerOpen((v) => !v)}
                    className="rounded-md border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                  >
                    เปลี่ยน
                  </button>
                  <button
                    disabled={refBusy}
                    onClick={() => void clearReference()}
                    className="inline-flex items-center gap-1 rounded-md border border-zinc-800 px-2 py-1 text-[11px] text-zinc-500 hover:bg-zinc-800 hover:text-red-300 disabled:opacity-50"
                  >
                    <X className="size-3.5" /> เอาออก
                  </button>
                </>
              ) : (
                <button
                  disabled={refBusy}
                  onClick={() => setRefPickerOpen((v) => !v)}
                  className="rounded-md border border-amber-400/60 px-2.5 py-1 text-[11px] font-semibold text-amber-300 hover:bg-amber-400/10 disabled:opacity-50"
                >
                  เลือกจากรูปของตัวละคร
                </button>
              )}
            </div>
          </div>

          {refError && <p className="text-xs text-red-400">{refError}</p>}

          {refAsset ? (
            <div className="flex items-center gap-3">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-amber-400/60">
                <AssetThumbImg assetId={refAsset.id} name={character.nameTh} />
              </div>
              <p className="text-[11px] leading-relaxed text-amber-200/90">
                ก๊อป prompt แล้วลากรูปนี้แนบไปด้วย — หน้าจะนิ่งขึ้นมาก
                {master && (
                  <span className="text-zinc-500"> (DIRECTIVE ใส่กฎรูปแนบให้ในตัวแล้ว)</span>
                )}
              </p>
            </div>
          ) : (
            <p className="text-[11px] text-zinc-500">
              ยังไม่ได้ล็อกรูป — เลือกรูปของตัวละคร 1 รูปเป็น ground truth ของหน้า
              แล้วลากแนบคู่กับ prompt ทุกครั้งที่ gen
            </p>
          )}

          {refPickerOpen &&
            (imageAssets.length === 0 ? (
              <p className="text-xs text-zinc-500">
                ยังไม่มีรูปของตัวละคร — อัปโหลดที่ Asset Gallery ก่อน
              </p>
            ) : (
              <div className="grid max-h-48 grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-6">
                {imageAssets.map((a) => {
                  const isRef = a.id === refAsset?.id;
                  return (
                    <button
                      key={a.id}
                      disabled={refBusy || isRef}
                      onClick={() => void setReference(a)}
                      title={isRef ? "รูป Reference ปัจจุบัน" : "ตั้งเป็นรูป Reference"}
                      className={`relative aspect-square overflow-hidden rounded-lg border ${
                        isRef ? "border-amber-400" : "border-zinc-700 hover:border-amber-300"
                      } disabled:cursor-default`}
                    >
                      <AssetThumbImg assetId={a.id} name={a.originalFilename} />
                      {isRef && (
                        <span className="absolute inset-x-0 bottom-0 inline-flex items-center justify-center gap-1 bg-amber-400/90 text-center text-[10px] font-medium text-amber-950">
                          <Pin className="size-3" /> ใช้อยู่
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
        </div>

        {missingEthnicity && (
          <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            ยังไม่ได้ระบุเชื้อชาติ — ใช้ค่าเริ่มต้น &ldquo;Thai&rdquo; · เพิ่มฟิลด์ ethnicity ใน Visual DNA
            เพื่อความแม่นยำ
          </p>
        )}

        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setDirty(true);
          }}
          rows={12}
          className="w-full resize-y rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs leading-relaxed text-zinc-200 outline-none focus:border-amber-400"
        />

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={copyPrompt}
            className="inline-flex items-center gap-1 rounded-lg bg-amber-400 px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-amber-300"
          >
            {copied ? (
              <>
                คัดลอกแล้ว <Check className="size-4" />
              </>
            ) : (
              <>
                <ClipboardList className="size-4" /> ก๊อป
              </>
            )}
          </button>
          {dirty && (
            <button
              onClick={resetToBuilt}
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              <RotateCcw className="size-4" /> รีเซ็ตเป็นค่าที่ระบบสร้าง
            </button>
          )}
        </div>

        {/* ข้อมูลภายใน — ไม่ยัดลง ChatGPT/Gemini prompt (policy-sensitive) แต่ให้คนเห็น */}
        {hasInternal && (
          <details className="group rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-medium text-zinc-400 [&::-webkit-details-marker]:hidden">
              <span>ข้อมูลภายใน (ไม่รวมใน ChatGPT/Gemini prompt)</span>
              <ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-2 space-y-2 text-xs text-zinc-400">
              {antiClone.length > 0 && (
                <div>
                  <p className="font-medium text-zinc-300">anti-clone rules:</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    {antiClone.map((r, i) => (
                      <li key={i}>{String(r)}</li>
                    ))}
                  </ul>
                </div>
              )}
              {negativePrompt && (
                <div>
                  <p className="font-medium text-zinc-300">negative prompt:</p>
                  <p className="mt-0.5">{negativePrompt}</p>
                  <p className="mt-1 text-[11px] text-zinc-600">
                    ใช้อัตโนมัติเฉพาะ tab Grok — ChatGPT/Gemini ไม่รองรับ negative prompt
                  </p>
                </div>
              )}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

// ── 🧪 ตรวจรูปกับสเปก (Verify) — round-trip diff: รูปที่ gen มาจากค่ายนอก vs visualDna ──
// label ไทยต่อ key ของ Visual DNA (ต่อยอด VISUAL_ROWS ของ ReverseCapture ให้ครบทุก key)
const VISUAL_DNA_TH: Record<string, string> = {
  ethnicity: "เชื้อชาติ",
  face_shape: "รูปหน้า",
  eyes: "ดวงตา",
  eyebrows: "คิ้ว",
  nose: "จมูก",
  lips: "ริมฝีปาก",
  skin_tone: "สีผิว",
  distinctive_features: "จุดเด่นเฉพาะตัว",
  body_type: "รูปร่าง",
  height_impression: "ส่วนสูง",
  posture: "ท่าทาง",
  hair_style: "ทรงผม",
  makeup_style: "การแต่งหน้า",
  fashion_style: "สไตล์แต่งตัว",
  color_palette: "โทนสีประจำตัว",
  shot_type: "ประเภทช็อต",
  camera_angle: "มุมกล้อง",
  lens: "เลนส์",
  depth_of_field: "ระยะชัด",
  lighting: "การจัดแสง",
  background_setting: "ฉากหลัง",
  art_style: "สไตล์ภาพ",
  color_grade: "โทนภาพ",
  mood: "อารมณ์ภาพ",
  aspect_ratio: "อัตราส่วนภาพ",
  quality_tags: "quality tags",
};

const VERDICT_UI: Record<string, { icon: React.ReactNode; rowCls: string; iconCls: string }> = {
  match: {
    icon: <Check className="size-4" />,
    rowCls: "border-emerald-500/30 bg-emerald-500/5",
    iconCls: "text-emerald-300",
  },
  mismatch: {
    icon: <X className="size-4" />,
    rowCls: "border-red-500/30 bg-red-500/5",
    iconCls: "text-red-300",
  },
  uncertain: {
    icon: <CircleHelp className="size-4" />,
    rowCls: "border-zinc-800 bg-zinc-900/40",
    iconCls: "text-zinc-500",
  },
};

function dnaLabel(key: string): string {
  return VISUAL_DNA_TH[key] ?? key.replace(/_/g, " ");
}

// modal: วาง/อัปโหลดรูปที่ gen มา → POST /ai/character-spec-verify → score + checklist ต่อฟิลด์
// UX วางรูปแบบเดียวกับ ExternalCaptureModal (paste / drag / คลิกเลือกไฟล์)
function SpecVerifyModal({
  character,
  onClose,
}: {
  character: CharacterBible;
  onClose: () => void;
}) {
  const [images, setImages] = useState<{ assetId: string; preview: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SpecVerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // revoke object URLs ตอน unmount เท่านั้น
    return () => {
      setImages((prev) => {
        prev.forEach((im) => URL.revokeObjectURL(im.preview));
        return prev;
      });
    };
  }, []);

  async function addFiles(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (list.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of list) {
        // upload แบบไม่ผูก entity — รูปตรวจสอบไม่ควรโผล่ใน gallery ของตัวละคร
        const asset = await uploadAsset(file, { assetType: "character_reference" });
        setImages((prev) => [...prev, { assetId: asset.id, preview: URL.createObjectURL(file) }]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "อัปโหลดรูปไม่สำเร็จ");
    } finally {
      setUploading(false);
    }
  }

  function onPaste(e: React.ClipboardEvent) {
    const files = Array.from(e.clipboardData.items)
      .filter((i) => i.kind === "file" && i.type.startsWith("image/"))
      .map((i) => i.getAsFile())
      .filter((f): f is File => f != null);
    if (files.length > 0) {
      e.preventDefault();
      void addFiles(files);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) void addFiles(e.dataTransfer.files);
  }

  async function runVerify() {
    if (images.length === 0) {
      setError("วางรูปที่ gen มาอย่างน้อย 1 รูปก่อนตรวจ");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await verifyCharacterSpec({
        characterId: character.id,
        imageAssetIds: images.map((im) => im.assetId),
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI ตรวจรูปไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  const mismatched = result?.fields.filter((f) => f.verdict === "mismatch") ?? [];
  const scoreCls =
    result?.score == null
      ? "bg-zinc-800 text-zinc-300"
      : result.score >= 80
        ? "bg-emerald-900 text-emerald-200"
        : result.score >= 50
          ? "bg-amber-900 text-amber-200"
          : "bg-red-900 text-red-200";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="fixed inset-y-0 right-0 flex h-full w-full max-w-2xl flex-col space-y-4 overflow-y-auto border-l border-zinc-800 bg-zinc-900 p-6 shadow-2xl duration-200 animate-in slide-in-from-right"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="inline-flex items-center gap-2 text-lg font-semibold">
              <FlaskConical className="size-5" /> ตรวจรูปกับสเปก
            </h3>
            <p className="mt-1 text-sm text-zinc-400">
              วางรูปที่ gen มาจาก ChatGPT/Gemini/Grok — AI จะเทียบกับ Visual DNA ของ{" "}
              <span className="text-zinc-200">{character.nameTh}</span> ทีละฟิลด์
              ว่าหน้า/ลุคยังตรงตัวละครเดิมไหม
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-zinc-700 px-2.5 py-1 text-sm text-zinc-400 hover:bg-zinc-800"
          >
            ปิด
          </button>
        </div>

        {/* image paste / drop / pick zone — pattern เดียวกับ ExternalCaptureModal */}
        <div
          onPaste={onPaste}
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
          tabIndex={0}
          className="cursor-pointer rounded-lg border border-dashed border-zinc-700 bg-zinc-950/40 px-4 py-6 text-center text-sm text-zinc-400 outline-none hover:border-amber-400/50 focus:border-amber-400/50"
        >
          <ImageIcon className="inline size-4 align-text-bottom" /> วางรูปที่ gen มา (Ctrl/⌘+V), ลากรูปมาวาง, หรือคลิกเพื่อเลือกไฟล์
          {uploading && <span className="ml-2 text-amber-300">กำลังอัปโหลด...</span>}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) void addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {images.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {images.map((im) => (
              <div
                key={im.assetId}
                className="relative h-24 w-20 overflow-hidden rounded-lg border border-zinc-700"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={im.preview} alt="" className="h-full w-full object-cover" />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setImages((prev) => prev.filter((x) => x.assetId !== im.assetId));
                  }}
                  className="absolute right-1 top-1 inline-flex items-center rounded bg-black/70 px-1 text-[10px] text-white hover:bg-red-600"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={() => void runVerify()}
          disabled={busy || uploading}
          className="inline-flex items-center gap-1 rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
        >
          <FlaskConical className="size-4" />
          {busy ? "AI กำลังเทียบสเปก..." : "ตรวจเทียบสเปก"}
        </button>

        {error && <p className="text-sm text-red-400">{error}</p>}

        {result && (
          <div className="space-y-3 rounded-xl border border-amber-400/30 bg-zinc-950/40 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-sm font-semibold ${scoreCls}`}>
                {result.score != null
                  ? `ตรงสเปก ${result.score}%`
                  : "ยังสรุปคะแนนไม่ได้ — ตัดสินจากรูปได้ไม่พอ"}
              </span>
              <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
                <Check className="size-3.5" /> {result.fields.filter((f) => f.verdict === "match").length} ·{" "}
                <X className="size-3.5" /> {mismatched.length} · <CircleHelp className="size-3.5" />{" "}
                {result.fields.filter((f) => f.verdict === "uncertain").length} (ไม่ถ่วงคะแนน)
              </span>
            </div>

            {result.summary && <p className="text-sm text-zinc-300">{result.summary}</p>}

            <div className="max-h-72 space-y-1.5 overflow-y-auto">
              {result.fields.map((f) => {
                const ui = VERDICT_UI[f.verdict] ?? VERDICT_UI.uncertain;
                return (
                  <div
                    key={f.key}
                    className={`rounded-lg border px-3 py-2 text-xs ${ui.rowCls}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-4 shrink-0 text-sm font-bold ${ui.iconCls}`}>
                        {ui.icon}
                      </span>
                      <span className="font-medium text-zinc-200">{dnaLabel(f.key)}</span>
                      <span className="font-mono text-[10px] text-zinc-600">{f.key}</span>
                    </div>
                    <div className="mt-1 grid grid-cols-1 gap-1 pl-6 sm:grid-cols-2">
                      <p className="text-zinc-400">
                        <span className="text-zinc-600">สเปก:</span> {f.expected || "—"}
                      </p>
                      <p className="text-zinc-400">
                        <span className="text-zinc-600">ในรูป:</span>{" "}
                        {f.observed || "มองไม่เห็น/ตัดสินไม่ได้"}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {mismatched.length > 0 && (
              <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                <Lightbulb className="inline size-4 align-text-bottom" /> จุดที่หลุด — เพิ่มน้ำหนักใน prompt รอบหน้า:{" "}
                {mismatched.map((f) => `${dnaLabel(f.key)} (${f.expected})`).join(" · ")}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function BibleCard({ title, data }: { title: string; data: BibleJson | null | undefined }) {
  const entries = data ? Object.entries(data) : [];
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
      <h4 className="mb-2 text-sm font-semibold text-amber-300">{title}</h4>
      {entries.length === 0 ? (
        <p className="text-sm text-zinc-600">
          ยังไม่มีข้อมูล — ใช้ปุ่ม <Sparkles className="inline size-4 align-text-bottom" /> ด้านบนให้ AI ร่างได้
        </p>
      ) : (
        <dl className="space-y-1.5">
          {entries.map(([k, v]) => (
            <div key={k} className="text-sm">
              <dt className="inline font-medium text-zinc-400">{k.replace(/_/g, " ")}: </dt>
              <dd className="inline text-zinc-200">{bibleValue(v)}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

// รูป character เล็ก ๆ ประจำ header (CEO: "ควรมีรูป แต่ไม่ต้องใหญ่มาก")
// ใช้ thumb เดียวกับหน้า list (primary_reference / รูปแรก) — ไม่มีรูป = gradient + อักษรแรก
function CharacterPortrait({
  id,
  name,
  onClick,
  assetIdOverride,
}: {
  id: string;
  name: string;
  onClick: () => void;
  assetIdOverride?: string | null;
}) {
  const thumbId = useEntityThumb("character", assetIdOverride ? null : id);
  const url = useAssetImage(assetIdOverride ?? thumbId);
  return (
    <button
      type="button"
      onClick={onClick}
      title="ดูรูปใน Asset Gallery"
      className="h-20 w-20 shrink-0 select-none overflow-hidden rounded-xl border border-zinc-800 transition hover:border-amber-400/60"
      style={url ? undefined : { background: gradientFor(name) }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={name} className="h-full w-full object-cover" />
      ) : (
        <span className="text-2xl font-semibold text-white/90">{initialOf(name)}</span>
      )}
    </button>
  );
}

// ── Manual edit — แถวแก้ไขค่าใน Bible JSON ──
// เก็บชนิดเดิมไว้ (array joined ด้วย " · ", object เป็น JSON string, number)
// เพื่อให้ save กลับได้หน้าตาเหมือนก่อนแก้
interface EditRow {
  key: string;
  value: string;
  wasArray: boolean;
  wasJson: boolean;
  wasNumber: boolean;
  isNew: boolean; // แถวที่เพิ่มใหม่ — แก้ชื่อ key ได้
}

function toEditRows(data: BibleJson | null | undefined): EditRow[] {
  if (!data) return [];
  return Object.entries(data).map(([key, v]) => {
    if (Array.isArray(v)) {
      return { key, value: v.map((x) => String(x)).join(" · "), wasArray: true, wasJson: false, wasNumber: false, isNew: false };
    }
    if (v != null && typeof v === "object") {
      return { key, value: JSON.stringify(v), wasArray: false, wasJson: true, wasNumber: false, isNew: false };
    }
    return {
      key,
      value: v == null ? "" : String(v),
      wasArray: false,
      wasJson: false,
      wasNumber: typeof v === "number",
      isNew: false,
    };
  });
}

// key ที่พิมพ์เอง → snake_case (เว้นวรรค → _, ตัวพิมพ์เล็ก)
function snakeKey(s: string): string {
  return s.trim().replace(/\s+/g, "_").toLowerCase();
}

function rowsToJson(rows: EditRow[]): BibleJson {
  const out: BibleJson = {};
  for (const r of rows) {
    const key = snakeKey(r.key);
    const value = r.value.trim();
    if (!key || !value) continue; // key/ค่าว่าง = ตัด field นี้ทิ้ง
    if (r.wasArray) {
      out[key] = value.split("·").map((x) => x.trim()).filter(Boolean);
    } else if (r.wasJson) {
      try {
        out[key] = JSON.parse(value);
      } catch {
        out[key] = value;
      }
    } else if (r.wasNumber && Number.isFinite(Number(value))) {
      out[key] = Number(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

// ── 🎨 ผู้สร้าง (Creator) — freelance/ทีมใน พร้อม contact ไว้ตามตัว ──
const EMPTY_CREATOR_FORM = { name: "", phone: "", line: "", email: "", portfolio: "", rateNote: "", notes: "" };
type CreatorForm = typeof EMPTY_CREATOR_FORM;

function creatorPayload(form: CreatorForm, forUpdate: boolean): Record<string, unknown> {
  const payload: Record<string, unknown> = { name: form.name.trim() };
  for (const k of ["phone", "line", "email", "portfolio", "rateNote", "notes"] as const) {
    const v = form[k].trim();
    // update: ส่ง null เพื่อล้างค่าเดิมได้ / create: ส่งเฉพาะที่กรอก
    if (v) payload[k] = v;
    else if (forUpdate) payload[k] = null;
  }
  return payload;
}

function CreatorCard({
  creator,
  onLink,
  onReload,
}: {
  creator: Creator | null | undefined;
  onLink: (creatorId: string | null) => Promise<void>;
  onReload: () => Promise<void>;
}) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [q, setQ] = useState("");
  const [options, setOptions] = useState<Creator[] | null>(null); // null = กำลังโหลด
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<CreatorForm>(EMPTY_CREATOR_FORM);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<CreatorForm>(EMPTY_CREATOR_FORM);
  const [lineCopied, setLineCopied] = useState(false);

  // โหลดตัวเลือกเมื่อเปิด picker + debounce ตอนพิมพ์ค้นหา
  useEffect(() => {
    if (!pickerOpen) return;
    let cancelled = false;
    const t = setTimeout(() => {
      api<Creator[]>(`/creators${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`)
        .then((res) => {
          if (cancelled) return;
          setOptions(Array.isArray(res) ? res : []);
        })
        .catch(() => {
          if (cancelled) return;
          setOptions([]);
          setErr("โหลดรายชื่อผู้สร้างไม่สำเร็จ (API อาจยังเป็น build เก่า)");
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [pickerOpen, q]);

  async function run(fn: () => Promise<void>, fallbackMsg: string) {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : fallbackMsg);
    } finally {
      setBusy(false);
    }
  }

  const selectCreator = (creatorId: string | null) =>
    run(async () => {
      await onLink(creatorId);
      setPickerOpen(false);
      setCreateOpen(false);
    }, "บันทึกผู้สร้างไม่สำเร็จ");

  const createAndLink = () => {
    if (!form.name.trim()) {
      setErr("กรุณากรอกชื่อผู้สร้าง");
      return;
    }
    return run(async () => {
      const created = await api<Creator>("/creators", {
        method: "POST",
        body: JSON.stringify(creatorPayload(form, false)),
      });
      await onLink(created.id);
      setPickerOpen(false);
      setCreateOpen(false);
      setForm(EMPTY_CREATOR_FORM);
    }, "สร้างผู้สร้างใหม่ไม่สำเร็จ");
  };

  const saveContact = () => {
    if (!creator) return;
    if (!editForm.name.trim()) {
      setErr("กรุณากรอกชื่อผู้สร้าง");
      return;
    }
    return run(async () => {
      await api(`/creators/${creator.id}`, {
        method: "PATCH",
        body: JSON.stringify(creatorPayload(editForm, true)),
      });
      await onReload();
      setEditOpen(false);
    }, "แก้ไขข้อมูลผู้สร้างไม่สำเร็จ");
  };

  const formField = (
    state: CreatorForm,
    setState: (f: CreatorForm) => void,
    key: keyof CreatorForm,
    label: string,
    placeholder = "",
  ) => (
    <label className="block text-xs text-zinc-400">
      {label}
      <input
        value={state[key]}
        onChange={(e) => setState({ ...state, [key]: e.target.value })}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-amber-400"
      />
    </label>
  );

  return (
    <section className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="inline-flex items-center gap-2 text-lg font-semibold">
          <Palette className="size-5" /> ผู้สร้าง (Creator)
        </h3>
        {creator && !editOpen && (
          <div className="flex items-center gap-2">
            <button
              disabled={busy}
              onClick={() => {
                setEditForm({
                  name: creator.name,
                  phone: creator.phone ?? "",
                  line: creator.line ?? "",
                  email: creator.email ?? "",
                  portfolio: creator.portfolio ?? "",
                  rateNote: creator.rateNote ?? "",
                  notes: creator.notes ?? "",
                });
                setErr(null);
                setEditOpen(true);
              }}
              className="rounded-lg border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
            >
              แก้ไข
            </button>
            <button
              disabled={busy}
              onClick={() => {
                setErr(null);
                setPickerOpen((v) => !v);
              }}
              className="rounded-lg border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
            >
              เปลี่ยน
            </button>
            <button
              disabled={busy}
              onClick={() => void selectCreator(null)}
              className="rounded-lg border border-zinc-800 px-2.5 py-1 text-xs text-zinc-500 hover:bg-zinc-800 hover:text-red-300 disabled:opacity-50"
            >
              เอาออก
            </button>
          </div>
        )}
      </div>

      {err && <p className="text-sm text-red-400">{err}</p>}

      {creator && !editOpen && (
        <div className="space-y-1.5 text-sm">
          <p className="font-semibold text-zinc-100">{creator.name}</p>
          {creator.phone && (
            <p>
              <a href={`tel:${creator.phone}`} className="inline-flex items-center gap-1 text-zinc-300 hover:text-amber-300">
                <Phone className="size-4" /> {creator.phone}
              </a>
            </p>
          )}
          {creator.line && (
            <p className="flex items-center gap-2 text-zinc-300">
              <MessageSquare className="size-4" /> LINE: {creator.line}
              <button
                onClick={() => {
                  void navigator.clipboard.writeText(creator.line ?? "");
                  setLineCopied(true);
                  setTimeout(() => setLineCopied(false), 2000);
                }}
                className="rounded-md border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-400 hover:bg-zinc-800"
              >
                {lineCopied ? (
                  <span className="inline-flex items-center gap-1">
                    คัดลอกแล้ว <Check className="size-3" />
                  </span>
                ) : (
                  "คัดลอก"
                )}
              </button>
            </p>
          )}
          {creator.email && (
            <p>
              <a href={`mailto:${creator.email}`} className="inline-flex items-center gap-1 text-zinc-300 hover:text-amber-300">
                <Mail className="size-4" /> {creator.email}
              </a>
            </p>
          )}
          {creator.portfolio && (
            <p>
              <a
                href={creator.portfolio}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-zinc-300 hover:text-amber-300"
              >
                <LinkIcon className="size-4" /> ผลงาน: {creator.portfolio}
              </a>
            </p>
          )}
          {creator.rateNote && (
            <p className="flex items-center gap-1 text-zinc-400">
              <Wallet className="size-4" /> {creator.rateNote}
            </p>
          )}
          {creator.notes && (
            <p className="flex items-center gap-1 text-zinc-500">
              <FileText className="size-4" /> {creator.notes}
            </p>
          )}
        </div>
      )}

      {creator && editOpen && (
        <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {formField(editForm, setEditForm, "name", "ชื่อ *")}
            {formField(editForm, setEditForm, "phone", "เบอร์โทร")}
            {formField(editForm, setEditForm, "line", "LINE ID")}
            {formField(editForm, setEditForm, "email", "อีเมล")}
            {formField(editForm, setEditForm, "portfolio", "ลิงก์ผลงาน", "https://...")}
            {formField(editForm, setEditForm, "rateNote", "เรตราคา/เงื่อนไข")}
            {formField(editForm, setEditForm, "notes", "โน้ตเพิ่มเติม")}
          </div>
          <div className="flex gap-2">
            <button
              disabled={busy}
              onClick={() => void saveContact()}
              className="rounded-lg bg-amber-400 px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
            >
              {busy ? "กำลังบันทึก..." : "บันทึก"}
            </button>
            <button
              disabled={busy}
              onClick={() => setEditOpen(false)}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800 disabled:opacity-50"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      {!creator && !pickerOpen && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-zinc-500">ยังไม่ระบุผู้สร้าง</p>
          <button
            disabled={busy}
            onClick={() => {
              setErr(null);
              setPickerOpen(true);
            }}
            className="rounded-lg border border-amber-400/60 px-3 py-1.5 text-sm font-semibold text-amber-300 hover:bg-amber-400/10 disabled:opacity-50"
          >
            + ระบุผู้สร้าง
          </button>
        </div>
      )}

      {pickerOpen && (
        <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
          {!createOpen ? (
            <>
              <div className="flex items-center gap-2">
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="ค้นหาชื่อผู้สร้าง..."
                  className="flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-amber-400"
                />
                <button
                  disabled={busy}
                  onClick={() => {
                    setErr(null);
                    setCreateOpen(true);
                  }}
                  className="rounded-lg border border-amber-400/60 px-3 py-1.5 text-sm text-amber-300 hover:bg-amber-400/10 disabled:opacity-50"
                >
                  ＋ สร้างใหม่
                </button>
                <button
                  disabled={busy}
                  onClick={() => setPickerOpen(false)}
                  className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800 disabled:opacity-50"
                >
                  ปิด
                </button>
              </div>
              {options === null ? (
                <p className="text-sm text-zinc-500">กำลังโหลด...</p>
              ) : options.length === 0 ? (
                <p className="text-sm text-zinc-500">ไม่พบผู้สร้าง — กด ＋ สร้างใหม่ ได้เลย</p>
              ) : (
                <div className="max-h-56 space-y-1 overflow-y-auto">
                  {options
                    .filter((o) => o.id !== creator?.id)
                    .map((o) => (
                      <button
                        key={o.id}
                        disabled={busy}
                        onClick={() => void selectCreator(o.id)}
                        className="flex w-full items-center justify-between rounded-lg border border-zinc-800 px-3 py-2 text-left text-sm text-zinc-200 hover:border-amber-400/60 hover:bg-zinc-900 disabled:opacity-50"
                      >
                        <span>
                          {o.name}
                          {o.line && <span className="ml-2 text-xs text-zinc-500">LINE: {o.line}</span>}
                        </span>
                        <span className="text-xs text-zinc-500">{o.characterCount ?? 0} ตัวละคร</span>
                      </button>
                    ))}
                </div>
              )}
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-amber-300">＋ สร้างผู้สร้างใหม่</p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {formField(form, setForm, "name", "ชื่อ *", "เช่น พี่หนึ่ง Freelance")}
                {formField(form, setForm, "phone", "เบอร์โทร")}
                {formField(form, setForm, "line", "LINE ID")}
                {formField(form, setForm, "email", "อีเมล")}
                {formField(form, setForm, "portfolio", "ลิงก์ผลงาน", "https://...")}
                {formField(form, setForm, "rateNote", "เรตราคา/เงื่อนไข")}
              </div>
              <div className="flex gap-2">
                <button
                  disabled={busy}
                  onClick={() => void createAndLink()}
                  className="rounded-lg bg-amber-400 px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
                >
                  {busy ? "กำลังบันทึก..." : "สร้างและระบุเป็นผู้สร้าง"}
                </button>
                <button
                  disabled={busy}
                  onClick={() => setCreateOpen(false)}
                  className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800 disabled:opacity-50"
                >
                  กลับไปค้นหา
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

export default function CharacterDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [character, setCharacter] = useState<CharacterBible | null>(null);
  const [assets, setAssets] = useState<AssetList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assetError, setAssetError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [portraitOverride, setPortraitOverride] = useState<string | null>(null);
  const [uploadType, setUploadType] = useState("face_reference");
  // ⬇️ โหลดทุกไฟล์ในคลังเป็น zip เดียว
  const [zipBusy, setZipBusy] = useState(false);
  async function handleDownloadAllZip() {
    if (!character) return;
    setZipBusy(true);
    try {
      await downloadEntityAssetsZip("character", character.id, `${character.displayCode}_gallery`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ดาวน์โหลด zip ไม่สำเร็จ");
    } finally {
      setZipBusy(false);
    }
  }
  const [exporting, setExporting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Phase 4 AI: consistency QC ต่อ asset + similarity check ของ character
  const [aiQcBusyId, setAiQcBusyId] = useState<string | null>(null);
  const [aiQcResults, setAiQcResults] = useState<Record<string, { score: number; verdict: string }>>({});
  const [simBusy, setSimBusy] = useState(false);
  const [simResult, setSimResult] = useState<SimilarityResult | null>(null);
  const [aiFillBusy, setAiFillBusy] = useState(false);
  const [promptViewerOpen, setPromptViewerOpen] = useState(false);
  const [specVerifyOpen, setSpecVerifyOpen] = useState(false);
  // วิเคราะห์ตัวละครจากรูป → เติม Bible
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeMsg, setAnalyzeMsg] = useState<string | null>(null);

  const [generatingBible, setGeneratingBible] = useState(false);

  async function onGenerateBible() {
    if (!character) return;
    const overwrite = confirm(
      "ให้ AI คิด Character Bible ให้ตัวละครนี้\n\nOK = เขียนทับของเดิมทั้งหมด (สร้างใหม่จากศูนย์)\nCancel = เติมเฉพาะช่องที่ยังว่าง (ของเดิมไม่หาย)",
    );
    setGeneratingBible(true);
    setAnalyzeMsg(null);
    try {
      const res = await api<{
        applied: {
          persona: string[];
          visualDna: string[];
          commerceProfile: string[];
          voiceProfile: string[];
          scalars: string[];
        };
      }>(`/ai/characters/${character.id}/generate-bible`, {
        method: "POST",
        body: JSON.stringify({ mode: overwrite ? "overwrite" : "fill_empty" }),
      });
      const a = res.applied;
      const n = a.persona.length + a.visualDna.length + a.commerceProfile.length + a.voiceProfile.length + a.scalars.length;
      setAnalyzeMsg(
        n === 0
          ? "ทุกช่องมีข้อมูลอยู่แล้ว — ลองโหมดเขียนทับถ้าต้องการให้ AI คิดใหม่"
          : `AI ร่างให้แล้ว — เติม ${n} ฟิลด์: Persona ${a.persona.length}, Visual DNA ${a.visualDna.length}, Commerce ${a.commerceProfile.length}, Voice ${a.voiceProfile.length}` +
              (a.scalars.length ? `, ข้อมูลหลัก ${a.scalars.length}` : ""),
      );
      await load();
    } catch (e) {
      setAnalyzeMsg("⚠ " + (e instanceof Error ? e.message : "ให้ AI ร่างไม่สำเร็จ"));
    } finally {
      setGeneratingBible(false);
    }
  }

  async function onAnalyzeFromImage() {
    if (!character) return;
    const overwrite = confirm(
      "ให้ผลวิเคราะห์จากรูป \"เขียนทับ\" Visual DNA เดิมไหม?\n\nOK = เขียนทับ (ยึดรูปเป็นหลัก)\nCancel = เติมเฉพาะช่องที่ยังว่าง (ค่าเดิมไม่หาย)",
    );
    setAnalyzing(true);
    setAnalyzeMsg(null);
    try {
      const res = await api<{
        applied: {
          persona: string[];
          visualDna: string[];
          commerceProfile: string[];
          voiceProfile: string[];
          scalars: string[];
        };
        confidence: string;
      }>(`/ai/characters/${character.id}/analyze-image`, {
        method: "POST",
        body: JSON.stringify({ mode: overwrite ? "overwrite" : "fill_empty" }),
      });
      const a = res.applied;
      const n =
        a.visualDna.length + a.persona.length + a.commerceProfile.length + a.voiceProfile.length + a.scalars.length;
      const parts = [
        `Visual DNA ${a.visualDna.length}`,
        `Persona ${a.persona.length}`,
        `Commerce ${a.commerceProfile.length}`,
        `Voice ${a.voiceProfile.length}`,
        ...(a.scalars.length ? [`ข้อมูลหลัก ${a.scalars.length}`] : []),
      ];
      setAnalyzeMsg(
        n === 0
          ? `วิเคราะห์เสร็จ (ความมั่นใจ: ${res.confidence}) — ทุกช่องมีข้อมูลอยู่แล้ว ไม่มีอะไรต้องเติม (ลองโหมดเขียนทับถ้าต้องการอัปเดตจากรูปใหม่)`
          : `วิเคราะห์สำเร็จ (ความมั่นใจ: ${res.confidence}) — อัปเดต ${n} ฟิลด์: ${parts.join(", ")}`,
      );
      await load();
    } catch (e) {
      setAnalyzeMsg("⚠ " + (e instanceof Error ? e.message : "วิเคราะห์ไม่สำเร็จ"));
    } finally {
      setAnalyzing(false);
    }
  }
  const [aiConfigured, setAiConfigured] = useState(false);

  // tags — chips + input autocomplete จาก GET /tags
  const [tagInput, setTagInput] = useState("");
  const [tagBusy, setTagBusy] = useState(false);
  const [tagOptions, setTagOptions] = useState<TagOption[]>([]);

  // ✏️ manual edit — แก้โปรไฟล์พื้นฐาน + Bible เองได้ทุก field (ไม่ต้องพึ่ง AI)
  const [editing, setEditing] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editBasic, setEditBasic] = useState({
    nameTh: "",
    nameEn: "",
    nickname: "",
    age: "",
    gender: "",
    region: "",
    roleLabel: "",
    universe: "",
    series: "",
  });
  const [editBible, setEditBible] = useState<Record<(typeof BIBLE_SECTIONS)[number]["key"], EditRow[]>>({
    persona: [],
    visualDna: [],
    commerceProfile: [],
    voiceProfile: [],
  });

  const loadTagOptions = useCallback(() => {
    api<TagOption[]>("/tags?entityType=character")
      .then((t) => setTagOptions(Array.isArray(t) ? t : []))
      .catch(() => setTagOptions([]));
  }, []);

  useEffect(() => {
    loadTagOptions();
  }, [loadTagOptions]);

  async function handleAddTag() {
    const name = tagInput.trim();
    if (!name || !character) return;
    setTagBusy(true);
    setError(null);
    try {
      const res = await api<{ tags: { id: string; name: string }[] }>(
        `/characters/${id}/tags`,
        { method: "POST", body: JSON.stringify({ name }) },
      );
      setCharacter((c) => (c ? { ...c, tags: res.tags } : c));
      setTagInput("");
      loadTagOptions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "เพิ่ม tag ไม่สำเร็จ");
    } finally {
      setTagBusy(false);
    }
  }

  async function handleRemoveTag(tagId: string) {
    setTagBusy(true);
    setError(null);
    try {
      const res = await api<{ tags: { id: string; name: string }[] }>(
        `/characters/${id}/tags/${tagId}`,
        { method: "DELETE" },
      );
      setCharacter((c) => (c ? { ...c, tags: res.tags } : c));
      loadTagOptions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ลบ tag ไม่สำเร็จ");
    } finally {
      setTagBusy(false);
    }
  }

  useEffect(() => {
    api<{ configured: boolean }>("/ai/status")
      .then((s) => setAiConfigured(s.configured))
      .catch(() => setAiConfigured(false));
  }, []);

  // โหลดแยกกัน — asset โหลดพังไม่ควรทำให้ header ของ character หายไปด้วย
  const load = useCallback(async () => {
    const [c, a] = await Promise.allSettled([
      api<CharacterBible>(`/characters/${id}`),
      api<AssetList>(`/assets?entityType=character&entityId=${id}`),
    ]);
    if (c.status === "fulfilled") {
      setCharacter(c.value);
      setError(null);
    } else {
      setError(c.reason instanceof Error ? c.reason.message : "โหลดข้อมูลไม่สำเร็จ");
    }
    if (a.status === "fulfilled") {
      setAssets(a.value);
      setAssetError(null);
    } else {
      setAssetError(a.reason instanceof Error ? a.reason.message : "โหลด asset ไม่สำเร็จ");
    }
  }, [id]);

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    load();
  }, [router, load]);

  // PATCH creatorId (string = ระบุ/เปลี่ยน, null = เอาออก) — error โยนกลับให้ CreatorCard โชว์
  const linkCreator = useCallback(
    async (creatorId: string | null) => {
      await api(`/characters/${id}`, { method: "PATCH", body: JSON.stringify({ creatorId }) });
      await load();
    },
    [id, load],
  );

  function openEdit() {
    if (!character) return;
    setEditBasic({
      nameTh: character.nameTh ?? "",
      nameEn: character.nameEn ?? "",
      nickname: character.nickname ?? "",
      age: character.age != null ? String(character.age) : "",
      gender: character.gender ?? "",
      region: character.region ?? "",
      roleLabel: character.roleLabel ?? "",
      universe: character.universe ?? "",
      series: character.series ?? "",
    });
    setEditBible({
      persona: toEditRows(character.persona),
      visualDna: toEditRows(character.visualDna),
      commerceProfile: toEditRows(character.commerceProfile),
      voiceProfile: toEditRows(character.voiceProfile),
    });
    setEditError(null);
    setEditing(true);
  }

  function updateBibleRow(section: keyof typeof editBible, index: number, patch: Partial<EditRow>) {
    setEditBible((prev) => ({
      ...prev,
      [section]: prev[section].map((r, i) => (i === index ? { ...r, ...patch } : r)),
    }));
  }

  function addBibleRow(section: keyof typeof editBible) {
    setEditBible((prev) => ({
      ...prev,
      [section]: [
        ...prev[section],
        { key: "", value: "", wasArray: false, wasJson: false, wasNumber: false, isNew: true },
      ],
    }));
  }

  // v2 Visual DNA keys — เติมแถวว่างให้ตัวละครเก่ากรอกเองได้โดยไม่ต้อง re-run AI
  function addSuggestedVisualDnaRows() {
    const suggested = [
      "ethnicity",
      "shot_type",
      "camera_angle",
      "lens",
      "depth_of_field",
      "lighting",
      "background_setting",
      "art_style",
      "color_grade",
      "mood",
      "aspect_ratio",
    ];
    setEditBible((prev) => {
      const existing = new Set(prev.visualDna.map((r) => snakeKey(r.key)));
      const toAdd = suggested
        .filter((k) => !existing.has(k))
        .map((k) => ({ key: k, value: "", wasArray: false, wasJson: false, wasNumber: false, isNew: true }));
      // quality_tags เป็น array — คั่นด้วย ·
      if (!existing.has("quality_tags")) {
        toAdd.push({ key: "quality_tags", value: "", wasArray: true, wasJson: false, wasNumber: false, isNew: true });
      }
      return { ...prev, visualDna: [...prev.visualDna, ...toAdd] };
    });
  }

  function removeBibleRow(section: keyof typeof editBible, index: number) {
    setEditBible((prev) => ({
      ...prev,
      [section]: prev[section].filter((_, i) => i !== index),
    }));
  }

  async function saveEdit() {
    if (!character) return;
    const nameTh = editBasic.nameTh.trim();
    if (!nameTh) {
      setEditError("กรุณากรอกชื่อภาษาไทย");
      return;
    }
    const ageStr = editBasic.age.trim();
    const age = ageStr === "" ? null : Number(ageStr);
    if (age != null && (!Number.isInteger(age) || age < 18 || age > 120)) {
      setEditError("อายุต้องเป็นตัวเลข 18-120 ปี (commerce character ต้อง ≥ 18)");
      return;
    }
    setSavingEdit(true);
    setEditError(null);
    try {
      const patch: Record<string, unknown> = {
        nameTh,
        nameEn: editBasic.nameEn.trim() || null,
        nickname: editBasic.nickname.trim() || null,
        age,
        gender: editBasic.gender || null,
        region: editBasic.region.trim() || null,
        roleLabel: editBasic.roleLabel.trim() || null,
        universe: editBasic.universe.trim() || null,
        series: editBasic.series.trim() || null,
        // optimistic locking — ถ้ามีคนแก้ตัดหน้า จะได้ 409 ข้อความไทยจาก API
        expectedUpdatedAt: character.updatedAt,
      };
      for (const s of BIBLE_SECTIONS) {
        const rows = editBible[s.key];
        const orig = character[s.key];
        // ส่ง section เมื่อมีแถวให้บันทึก หรือของเดิมมีข้อมูล (ลบทุกแถว = ล้าง section)
        if (rows.length > 0 || (orig && Object.keys(orig).length > 0)) {
          patch[s.key] = rowsToJson(rows);
        }
      }
      await api(`/characters/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
      await load();
      setEditing(false);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSavingEdit(false);
    }
  }

  async function changeCharacterStatus(next: string) {
    setBusy(true);
    setError(null);
    try {
      await api<Character>(`/characters/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: next }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "เปลี่ยน status ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // เลือกไฟล์เดิมซ้ำได้
    if (!file) return;
    setUploading(true);
    setAssetError(null);
    try {
      await uploadAsset(file, {
        assetType: uploadType,
        entityType: "character",
        entityId: id,
        linkRole: "reference",
      });
      await load();
    } catch (err) {
      setAssetError(err instanceof Error ? err.message : "อัปโหลดไม่สำเร็จ");
    } finally {
      setUploading(false);
    }
  }

  async function setPrimaryReference(assetId: string) {
    setBusy(true);
    setAssetError(null);
    try {
      await api(`/assets/${assetId}/links`, {
        method: "POST",
        body: JSON.stringify({ entityType: "character", entityId: id, linkRole: "primary_reference" }),
      });
      await load();
    } catch (err) {
      setAssetError(err instanceof Error ? err.message : "ตั้ง primary reference ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function changeAssetStatus(assetId: string, next: string) {
    setBusy(true);
    setAssetError(null);
    try {
      await api(`/assets/${assetId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: next }),
      });
      await load();
    } catch (err) {
      setAssetError(err instanceof Error ? err.message : "เปลี่ยน status ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  // Phase 4: AI ตรวจ consistency ของรูปเทียบ Visual DNA (บันทึกเป็น QcReview ด้วย save=true)
  async function aiCheckConsistency(assetId: string) {
    setAiQcBusyId(assetId);
    setAssetError(null);
    try {
      const res = await api<{ score: number; verdict: string }>(
        `/ai/qc/assets/${assetId}/consistency`,
        { method: "POST", body: JSON.stringify({ characterId: id, save: true }) },
      );
      setAiQcResults((prev) => ({ ...prev, [assetId]: { score: res.score, verdict: res.verdict } }));
    } catch (err) {
      setAssetError(err instanceof Error ? err.message : "AI ตรวจ consistency ไม่สำเร็จ");
    } finally {
      setAiQcBusyId(null);
    }
  }

  // Phase 4: AI เช็คความซ้ำกับตัวละครอื่นทั้งหมด
  async function aiCheckSimilarity() {
    setSimBusy(true);
    setError(null);
    try {
      const res = await api<SimilarityResult>(`/ai/characters/${id}/similarity`, { method: "POST" });
      setSimResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI เช็คความซ้ำไม่สำเร็จ");
    } finally {
      setSimBusy(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    setError(null);
    try {
      const job = await api<{ id: string }>(`/characters/${id}/export`, {
        method: "POST",
        body: JSON.stringify({ format: "zip" }),
      });
      let status = "queued";
      for (let i = 0; i < 40 && status !== "done" && status !== "failed"; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        const j = await api<{ status: string }>(`/exports/${job.id}`);
        status = j.status;
      }
      if (status !== "done") throw new Error("Export ไม่สำเร็จ ลองใหม่อีกครั้ง");
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api"}/exports/${job.id}/download`,
        { headers: { Authorization: `Bearer ${getToken()}` } },
      );
      if (!res.ok) throw new Error("ดาวน์โหลดไม่สำเร็จ");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${character?.displayCode ?? "character"}_package.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export ไม่สำเร็จ");
    } finally {
      setExporting(false);
    }
  }

  async function handleAiFill(sections: string[]) {
    if (!character) return;
    setAiFillBusy(true);
    setError(null);
    try {
      const res = await api<{
        draft: Record<string, BibleJson> & {
          suggested: { age?: number; gender?: string; region?: string; roleLabel?: string };
        };
      }>("/ai/characters/draft", {
        method: "POST",
        body: JSON.stringify({
          nameTh: character.nameTh,
          nameEn: character.nameEn || undefined,
          oneLineConcept:
            (character.persona?.one_line_concept as string | undefined) || `AI Talent ชื่อ ${character.nameTh}`,
          universe: character.universe || undefined,
          sections,
        }),
      });
      const patch: Record<string, unknown> = {};
      for (const s of sections) {
        if (res.draft[s]) patch[s] = res.draft[s];
      }
      // คงคอนเซ็ปต์เดิมไว้ ไม่ให้ AI ทับ
      const origConcept = character.persona?.one_line_concept;
      if (patch.persona && origConcept) {
        patch.persona = { ...(patch.persona as BibleJson), one_line_concept: origConcept };
      }
      const sug = res.draft.suggested ?? {};
      if (!character.age && sug.age) patch.age = sug.age;
      if (!character.gender && sug.gender) patch.gender = sug.gender;
      if (!character.region && sug.region) patch.region = sug.region;
      if (!character.roleLabel && sug.roleLabel) patch.roleLabel = sug.roleLabel;
      await api(`/characters/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI ร่าง Bible ไม่สำเร็จ");
    } finally {
      setAiFillBusy(false);
    }
  }

  // 🗑 ลบ asset ออกจากคลัง = soft-delete (archived) — กู้คืนได้โดย admin
  async function archiveAsset(asset: Asset) {
    if (!confirm("ลบรูปนี้ออกจากคลัง? (เก็บถาวร กู้คืนได้โดย admin)")) return;
    await changeAssetStatus(asset.id, "archived");
  }

  // ⬇️ ดาวน์โหลดไฟล์ asset (ภาพ/วิดีโอ/ไฟล์อื่น) — blob แนบ token + <a download>
  async function handleDownloadAsset(asset: Asset) {
    setAssetError(null);
    try {
      await downloadAssetFile(asset);
    } catch (err) {
      setAssetError(err instanceof Error ? err.message : "ดาวน์โหลดไม่สำเร็จ");
    }
  }

  // ── Character Sheet context — blueprint + รูป Reference ล็อกหน้า (prompt_reference) ──
  const blueprint = useMasterBlueprint(character?.blueprintId);
  const hasPromptReference = useMemo(
    () =>
      (assets?.items ?? []).some(
        (a) =>
          a.mimeType.startsWith("image/") &&
          !a.archivedAt &&
          a.links.some(
            (l) =>
              l.entityType === "character" && l.entityId === id && l.linkRole === "prompt_reference",
          ),
      ),
    [assets, id],
  );
  const promptContext: SheetPromptContext | undefined = character
    ? { character, blueprint, hasReference: hasPromptReference }
    : undefined;

  const st = character ? (STATUS_LABEL[character.status] ?? STATUS_LABEL.draft) : null;
  const actions = character ? (CHARACTER_ACTIONS[character.status] ?? []) : [];

  return (
    <AppShell
      title="Character Detail"
      actions={
        <div className="flex items-center gap-2">
          <button
            disabled={simBusy || !character}
            onClick={aiCheckSimilarity}
            className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800 disabled:opacity-50"
          >
            {simBusy ? (
              "AI กำลังเช็คความซ้ำ..."
            ) : (
              <>
                <Search className="size-4" /> เช็คความซ้ำ
              </>
            )}
          </button>
          <button
            disabled={exporting || !character}
            onClick={handleExport}
            className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800 disabled:opacity-50"
          >
            {exporting ? (
              "กำลังสร้าง package..."
            ) : (
              <>
                <Package className="size-4" /> Export Package
              </>
            )}
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        <Link href="/characters" className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-amber-300">
          <ArrowLeft className="size-4" /> กลับหน้ารายการ
        </Link>

        {error && <p className="text-sm text-red-400">{error}</p>}

        {character && st && (
          <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                {/* รูปเล็กประจำตัว — คลิกเลื่อนไปดูรูปเต็มใน Asset Gallery + ปุ่มเลือกรูปหลัก */}
                <div className="relative shrink-0">
                  <CharacterPortrait
                    id={id}
                    name={character.nameTh}
                    assetIdOverride={portraitOverride}
                    onClick={() =>
                      document.getElementById("asset-gallery")?.scrollIntoView({ behavior: "smooth" })
                    }
                  />
                  <div className="absolute -bottom-2 left-1/2 -translate-x-1/2">
                    <CoverPicker
                      entityType="character"
                      entityId={id}
                      name={character.nameTh}
                      coverRole="primary_reference"
                      assetType="character_reference"
                      onChanged={(assetId) => {
                        setPortraitOverride(assetId);
                        void load();
                      }}
                      triggerClass="whitespace-nowrap rounded-full bg-zinc-950/85 px-2 py-0.5 text-[10px] text-zinc-100 ring-1 ring-zinc-700 hover:bg-zinc-950"
                      triggerLabel="รูปหลัก"
                    />
                  </div>
                </div>
              <div>
                <p className="font-mono text-xs text-amber-300">{character.displayCode}</p>
                <h2 className="mt-1 text-2xl font-bold">
                  {character.nameTh}
                  {character.nickname && (
                    <span className="ml-2 text-lg font-normal text-amber-300/80">&ldquo;{character.nickname}&rdquo;</span>
                  )}
                  {character.nameEn && (
                    <span className="ml-2 text-lg font-normal text-zinc-500">({character.nameEn})</span>
                  )}
                </h2>
                <p className="mt-1 text-sm text-zinc-400">
                  {(character.persona?.one_line_concept as string | undefined) ?? "ยังไม่มีคอนเซ็ปต์"}
                </p>
                {(() => {
                  const bits = [
                    character.age != null ? `อายุ ${character.age}` : null,
                    character.gender,
                    character.region,
                    character.roleLabel,
                    character.universe,
                    character.series,
                  ].filter(Boolean);
                  return bits.length > 0 ? (
                    <p className="mt-1 text-xs text-zinc-500">{bits.join(" · ")}</p>
                  ) : null;
                })()}
                {/* tags — chips ลบได้ + ช่องเพิ่มพร้อม autocomplete */}
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {(character.tags ?? []).map((t) => (
                    <span
                      key={t.id}
                      className="flex items-center gap-1 rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300"
                    >
                      #{t.name}
                      <button
                        disabled={tagBusy}
                        onClick={() => handleRemoveTag(t.id)}
                        title="ลบ tag นี้"
                        className="inline-flex items-center text-zinc-500 hover:text-red-300 disabled:opacity-50"
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                  <input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void handleAddTag();
                      }
                    }}
                    list="tag-suggestions"
                    disabled={tagBusy}
                    placeholder="+ เพิ่ม tag..."
                    className="w-32 rounded-full border border-dashed border-zinc-700 bg-transparent px-2.5 py-0.5 text-xs text-zinc-300 outline-none placeholder:text-zinc-600 focus:border-amber-400 disabled:opacity-50"
                  />
                  <datalist id="tag-suggestions">
                    {tagOptions
                      .filter((t) => !(character.tags ?? []).some((ct) => ct.id === t.id))
                      .map((t) => (
                        <option key={t.id} value={t.name} />
                      ))}
                  </datalist>
                </div>
              </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`rounded-full px-3 py-1 text-xs ${st.cls}`}>{st.label}</span>
                <span className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-400">
                  {character.version}
                </span>
                <button
                  onClick={() => (editing ? setEditing(false) : openEdit())}
                  className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm ${
                    editing
                      ? "border-amber-400 text-amber-300"
                      : "border-zinc-700 text-zinc-200 hover:bg-zinc-800"
                  }`}
                >
                  <Pencil className="size-4" /> แก้ไข
                </button>
              </div>
            </div>

            {/* archived → banner + ปุ่มกู้คืน (แทน action ปกติ) */}
            {(character.status === "archived" || character.archivedAt) && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-orange-800/60 bg-orange-950/30 px-4 py-3 text-sm text-orange-200">
                <span>
                  <Archive className="inline size-4 align-text-bottom" /> ตัวละครนี้ถูกเก็บ (archived) แล้ว — จะไม่โผล่ในรายการปกติ
                </span>
                <button
                  disabled={busy}
                  onClick={() => changeCharacterStatus("draft")}
                  className="inline-flex items-center gap-1 rounded-lg border border-orange-500/60 px-3 py-1.5 text-sm font-semibold text-orange-200 hover:bg-orange-500/10 disabled:opacity-50"
                >
                  {busy ? (
                    "กำลังกู้คืน..."
                  ) : (
                    <>
                      <Undo2 className="size-4" /> กู้คืนเป็น Draft
                    </>
                  )}
                </button>
              </div>
            )}

            {actions.length > 0 && (
              <div className="flex flex-wrap gap-2 border-t border-zinc-800 pt-4">
                {actions.map((a) =>
                  a.primary ? (
                    <button
                      key={a.to}
                      disabled={busy}
                      onClick={() => changeCharacterStatus(a.to)}
                      className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
                    >
                      {a.label}
                    </button>
                  ) : (
                    <button
                      key={a.to}
                      disabled={busy}
                      onClick={() => changeCharacterStatus(a.to)}
                      className="rounded-lg border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-800 disabled:opacity-50"
                    >
                      {a.label}
                    </button>
                  ),
                )}
                {character.status !== "archived" && (
                  <button
                    disabled={busy}
                    onClick={() => changeCharacterStatus("archived")}
                    className="rounded-lg border border-zinc-800 px-4 py-2 text-sm text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-50"
                  >
                    Archive
                  </button>
                )}
              </div>
            )}
          </section>
        )}

        {/* ✏️ edit panel — inline ใต้ header (แก้โปรไฟล์พื้นฐาน + Bible ทุก field) */}
        {character && editing && (
          <section className="space-y-5 rounded-2xl border border-amber-400/40 bg-zinc-900 p-6">
            <h3 className="inline-flex items-center gap-2 text-lg font-semibold">
              <Pencil className="size-5" /> แก้ไขข้อมูล Character
            </h3>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <label className="block text-xs text-zinc-400">
                ชื่อ (ไทย) *
                <input
                  value={editBasic.nameTh}
                  onChange={(e) => setEditBasic({ ...editBasic, nameTh: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-200 outline-none focus:border-amber-400"
                />
              </label>
              <label className="block text-xs text-zinc-400">
                ชื่อ (อังกฤษ)
                <input
                  value={editBasic.nameEn}
                  onChange={(e) => setEditBasic({ ...editBasic, nameEn: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-200 outline-none focus:border-amber-400"
                />
              </label>
              <label className="block text-xs text-zinc-400">
                ชื่อเล่น
                <input
                  value={editBasic.nickname}
                  onChange={(e) => setEditBasic({ ...editBasic, nickname: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-200 outline-none focus:border-amber-400"
                />
              </label>
              <label className="block text-xs text-zinc-400">
                อายุ (18-120)
                <input
                  value={editBasic.age}
                  onChange={(e) => setEditBasic({ ...editBasic, age: e.target.value })}
                  inputMode="numeric"
                  placeholder="เช่น 22"
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-amber-400"
                />
              </label>
              <label className="block text-xs text-zinc-400">
                เพศ
                <FilterSelect
                  value={editBasic.gender}
                  onChange={(v) => setEditBasic({ ...editBasic, gender: v })}
                  options={[
                    { value: "", label: "— ไม่ระบุ —" },
                    { value: "หญิง", label: "หญิง" },
                    { value: "ชาย", label: "ชาย" },
                    { value: "ไม่ระบุ", label: "ไม่ระบุ" },
                  ]}
                  className="mt-1 w-full"
                />
              </label>
              <label className="block text-xs text-zinc-400">
                ภูมิภาค
                <input
                  value={editBasic.region}
                  onChange={(e) => setEditBasic({ ...editBasic, region: e.target.value })}
                  placeholder="เช่น อีสาน"
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-amber-400"
                />
              </label>
              <label className="block text-xs text-zinc-400">
                บทบาท (Role)
                <input
                  value={editBasic.roleLabel}
                  onChange={(e) => setEditBasic({ ...editBasic, roleLabel: e.target.value })}
                  placeholder="เช่น นางเอกสายรีวิว"
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-amber-400"
                />
              </label>
              <label className="block text-xs text-zinc-400">
                Universe
                <input
                  value={editBasic.universe}
                  onChange={(e) => setEditBasic({ ...editBasic, universe: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-200 outline-none focus:border-amber-400"
                />
              </label>
              <label className="block text-xs text-zinc-400">
                Series
                <input
                  value={editBasic.series}
                  onChange={(e) => setEditBasic({ ...editBasic, series: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-200 outline-none focus:border-amber-400"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {BIBLE_SECTIONS.map((s) => (
                <div key={s.key} className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
                  <h4 className="text-sm font-semibold text-amber-300">{s.title}</h4>
                  {editBible[s.key].length === 0 && (
                    <p className="text-xs text-zinc-600">ยังไม่มี field — กด + เพิ่ม field ด้านล่าง</p>
                  )}
                  {editBible[s.key].map((row, i) => (
                    <div key={i} className="flex items-start gap-2">
                      {row.isNew ? (
                        <input
                          value={row.key}
                          onChange={(e) => updateBibleRow(s.key, i, { key: e.target.value })}
                          placeholder="ชื่อ field (snake_case)"
                          className="w-36 shrink-0 rounded-lg border border-dashed border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 outline-none placeholder:text-zinc-600 focus:border-amber-400"
                        />
                      ) : (
                        <span
                          className="w-36 shrink-0 break-words pt-1.5 text-xs font-medium text-zinc-400"
                          title={row.wasArray ? "หลายค่า — คั่นด้วย ·" : undefined}
                        >
                          {row.key.replace(/_/g, " ")}
                          {row.wasArray && <span className="ml-1 text-zinc-600">(คั่นด้วย ·)</span>}
                        </span>
                      )}
                      <textarea
                        value={row.value}
                        onChange={(e) => updateBibleRow(s.key, i, { value: e.target.value })}
                        rows={Math.min(4, Math.max(1, Math.ceil(row.value.length / 45)))}
                        className="min-h-[32px] flex-1 resize-y rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-amber-400"
                      />
                      <button
                        onClick={() => removeBibleRow(s.key, i)}
                        title="ลบ field นี้"
                        className="pt-1.5 text-zinc-600 hover:text-red-300"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => addBibleRow(s.key)}
                      className="rounded-lg border border-dashed border-zinc-700 px-2.5 py-1 text-xs text-zinc-400 hover:border-amber-400/60 hover:text-amber-300"
                    >
                      + เพิ่ม field
                    </button>
                    {s.key === "visualDna" && (
                      <button
                        onClick={addSuggestedVisualDnaRows}
                        title="เติมฟิลด์ v2 (ethnicity, lighting, shot ฯลฯ) สำหรับ gen รูปแม่นขึ้น"
                        className="rounded-lg border border-dashed border-amber-400/50 px-2.5 py-1 text-xs text-amber-300 hover:bg-amber-400/10"
                      >
                        + เพิ่มฟิลด์แนะนำ (v2)
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {editError && <p className="text-sm text-red-400">{editError}</p>}

            <div className="flex gap-2 border-t border-zinc-800 pt-4">
              <button
                disabled={savingEdit}
                onClick={() => void saveEdit()}
                className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
              >
                {savingEdit ? "กำลังบันทึก..." : "บันทึก"}
              </button>
              <button
                disabled={savingEdit}
                onClick={() => setEditing(false)}
                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-800 disabled:opacity-50"
              >
                ยกเลิก
              </button>
            </div>
          </section>
        )}

        {/* 🎨 ผู้สร้าง (freelance/ทีมใน) — contact ไว้ตามตัวได้ */}
        {character && <CreatorCard creator={character.creator} onLink={linkCreator} onReload={load} />}

        {character && (
          <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="inline-flex items-center gap-2 text-lg font-semibold">
                <BookOpen className="size-5" /> Character Bible
              </h3>
              <div className="flex flex-wrap items-center gap-2">
              {character.visualDna && Object.keys(character.visualDna).length > 0 && (
                <button
                  onClick={() => setPromptViewerOpen(true)}
                  className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
                >
                  <Eye className="size-4" /> ดู/ก๊อป Prompt ภาพ
                </button>
              )}
              {aiConfigured && (
                <button
                  onClick={() => void onGenerateBible()}
                  disabled={generatingBible || analyzing}
                  title="ให้ AI คิดและร่าง Character Bible ให้ครบทุกช่อง (Persona / Visual DNA / Commerce / Voice) จากชื่อและบริบทของตัวละคร"
                  className="inline-flex items-center gap-1 rounded-lg bg-amber-400 px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
                >
                  <Sparkles className="size-4" /> {generatingBible ? "AI กำลังคิด..." : "ให้ AI ร่าง Bible"}
                </button>
              )}
              {aiConfigured && (
                <button
                  onClick={() => void onAnalyzeFromImage()}
                  disabled={analyzing || generatingBible}
                  title="ให้ AI อ่านรูปในแกลเลอรีของตัวละคร แล้วแตกรายละเอียด (Visual DNA/Persona) ลง Bible อัตโนมัติ"
                  className="inline-flex items-center gap-1 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-1.5 text-sm text-amber-300 hover:bg-amber-500/20 disabled:opacity-50"
                >
                  <ScanFace className="size-4" /> {analyzing ? "กำลังวิเคราะห์..." : "วิเคราะห์จากรูป"}
                </button>
              )}
              {aiConfigured &&
                character.visualDna &&
                Object.keys(character.visualDna).length > 0 && (
                  <button
                    onClick={() => setSpecVerifyOpen(true)}
                    title="วางรูปที่ gen มาจากค่ายนอก แล้วให้ AI เทียบกับ Visual DNA ทีละฟิลด์"
                    className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
                  >
                    <FlaskConical className="size-4" /> ตรวจรูปกับสเปก
                  </button>
                )}
              {analyzeMsg && (
                <p className={`w-full text-xs ${analyzeMsg.startsWith("⚠") ? "text-rose-400" : "text-emerald-400"}`}>
                  {analyzeMsg}
                </p>
              )}
              {aiConfigured &&
                (() => {
                  const missing = BIBLE_SECTIONS.filter(
                    (s) => !character[s.key] || Object.keys(character[s.key] ?? {}).length <= (s.key === "persona" ? 1 : 0),
                  ).map((s) => s.key);
                  if (missing.length === 0) return null;
                  return (
                    <button
                      disabled={aiFillBusy}
                      onClick={() => handleAiFill(missing)}
                      className="inline-flex items-center gap-1 rounded-lg border border-amber-400/60 px-3 py-1.5 text-sm font-semibold text-amber-300 hover:bg-amber-400/10 disabled:opacity-50"
                    >
                      <Sparkles className="size-4" />
                      {aiFillBusy ? "AI กำลังร่าง Bible... (1-2 นาที)" : `ให้ AI ร่างส่วนที่ขาด (${missing.length} ส่วน)`}
                    </button>
                  );
                })()}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {BIBLE_SECTIONS.map((s) => (
                <BibleCard key={s.key} title={s.title} data={character[s.key]} />
              ))}
            </div>
          </section>
        )}

        {/* 🎭 ประเภทตัวละคร — taxonomy กลาง (เลือกได้หลายประเภท) */}
        {character && (
          <CategorySection
            characterId={character.id}
            initial={(character.categories ?? []).map((c) => ({ id: c.id, label: c.label }))}
          />
        )}

        {/* 👥 กลุ่มผู้ติดตาม — อ้างอิง taxonomy กลาง (Audience Segment) */}
        {character && (
          <AudienceSection
            characterId={character.id}
            aiHint={
              typeof character.commerceProfile?.audience_fit === "string"
                ? (character.commerceProfile.audience_fit as string)
                : null
            }
          />
        )}

        {/* 🛍️ สินค้า Tie-In — ผูกสินค้าจริงที่ tie-in กับตัวละคร (ไม่บังคับ) */}
        {character && <TieInProducts entity="character" entityId={character.id} />}

        {/* 🚫 Do's & Don'ts — กฎประจำตัวละคร ฝังเข้า DIRECTIVE ของทุก prompt ที่ก๊อป */}
        {character && (
          <DosDontsSection
            characterId={character.id}
            initialDos={character.dos ?? []}
            initialDonts={character.donts ?? []}
            onSaved={load}
          />
        )}

        {/* 🔄 Turnaround Sheet — ชุด reference 5 มุม (Character Sheet ข้อ 1) */}
        {character && (
          <TurnaroundSection
            characterId={character.id}
            character={character}
            blueprint={blueprint}
            hasReference={hasPromptReference}
            assets={assets?.items ?? []}
            onAssetsChanged={load}
          />
        )}

        {/* PRD §5.2 — sections ประจำตัวละคร (+ Character Sheet: prompt/รูปมาตรฐานต่อรายการ) */}
        {character && <RelationshipSection characterId={character.id} />}
        {character && <WardrobeSection characterId={character.id} promptContext={promptContext} />}
        {character && <ExpressionSection characterId={character.id} promptContext={promptContext} />}
        {character && <PoseSection characterId={character.id} promptContext={promptContext} />}
        {character && <RightsSection characterId={character.id} />}

        {simResult && (
          <section className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
            <div className="flex items-start justify-between gap-3">
              <h3 className="inline-flex items-center gap-2 text-lg font-semibold">
                <Search className="size-5" /> ผลเช็คความซ้ำ (AI)
                <span className="text-sm font-normal text-zinc-500">
                  เทียบกับ {simResult.comparedCount} ตัวละคร
                </span>
              </h3>
              <button
                onClick={() => setSimResult(null)}
                className="rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800"
              >
                ปิด
              </button>
            </div>
            <p className="text-sm text-zinc-400">{simResult.summary}</p>
            {simResult.items.length === 0 ? (
              <p className="text-sm text-zinc-500">ยังไม่มีตัวละครอื่นให้เปรียบเทียบ</p>
            ) : (
              <div className="space-y-2">
                {simResult.items.map((item) => (
                  <div
                    key={item.characterId}
                    className={`rounded-xl border p-3 ${
                      item.flagged ? "border-orange-700 bg-orange-950/30" : "border-zinc-800 bg-zinc-950/50"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      {item.flagged && (
                        <span title="ความคล้ายสูง ต้องรีวิว" className="inline-flex items-center text-orange-400">
                          <TriangleAlert className="size-4" />
                        </span>
                      )}
                      <span className="font-mono text-xs text-amber-300">{item.displayCode}</span>
                      <span className="text-sm font-semibold">{item.name}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          item.flagged ? "bg-orange-900 text-orange-200" : "bg-zinc-800 text-zinc-300"
                        }`}
                      >
                        คล้าย {item.similarityScore}/100
                      </span>
                    </div>
                    {item.overlappingTraits.length > 0 && (
                      <p className="mt-1 text-xs text-zinc-400">
                        ทับซ้อน: {item.overlappingTraits.join(" · ")}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-zinc-500">{item.riskNote}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <section id="asset-gallery" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-semibold">
              Asset Gallery
              {assets && <span className="ml-2 text-sm font-normal text-zinc-500">({assets.total})</span>}
            </h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={zipBusy || !assets || assets.total === 0}
                onClick={() => void handleDownloadAllZip()}
                title="ดาวน์โหลดทุกไฟล์ในคลังเป็น zip เดียว"
                className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
              >
                {zipBusy ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> กำลังรวมไฟล์...
                  </>
                ) : (
                  <>
                    <Download className="size-4" /> โหลดทั้งหมด (ZIP)
                  </>
                )}
              </button>
              <FilterSelect
                value={uploadType}
                onChange={setUploadType}
                options={ASSET_TYPES.map((t) => ({ value: t.value, label: t.label }))}
                className="w-fit"
              />
              <input ref={fileInput} type="file" className="hidden" onChange={handleUpload} />
              <button
                disabled={uploading}
                onClick={() => fileInput.current?.click()}
                className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
              >
                {uploading ? "กำลังอัปโหลด..." : "+ อัปโหลด Asset"}
              </button>
            </div>
          </div>

          {assetError && <p className="text-sm text-red-400">{assetError}</p>}

          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {assets?.items.map((asset) => {
              const ast = ASSET_STATUS_LABEL[asset.status] ?? ASSET_STATUS_LABEL.uploaded;
              const isPrimary = asset.links.some(
                (l) => l.entityType === "character" && l.entityId === id && l.linkRole === "primary_reference",
              );
              const nextActions = ASSET_NEXT_ACTIONS[asset.status] ?? [];
              return (
                <div
                  key={asset.id}
                  className={`overflow-hidden rounded-2xl border bg-zinc-900 ${
                    isPrimary ? "border-amber-400" : "border-zinc-800"
                  }`}
                >
                  <div className="relative bg-zinc-950">
                    <AssetThumb asset={asset} />
                    {isPrimary && (
                      <span className="absolute left-2 top-2 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-semibold text-zinc-950">
                        Primary Ref
                      </span>
                    )}
                  </div>
                  <div className="space-y-2 p-3">
                    <p className="truncate text-xs text-zinc-300" title={asset.originalFilename}>
                      {asset.originalFilename}
                    </p>
                    <div className="flex flex-wrap items-center gap-1">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] ${ast.cls}`}>{ast.label}</span>
                      <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-400">
                        {asset.assetType}
                      </span>
                      <span className="text-[10px] text-zinc-500">{formatFileSize(asset.fileSize)}</span>
                    </div>
                    <div className="flex flex-wrap gap-1 pt-1">
                      {!isPrimary && asset.status !== "archived" && (
                        <button
                          disabled={busy}
                          onClick={() => setPrimaryReference(asset.id)}
                          className="rounded-md border border-amber-400/40 px-2 py-1 text-[11px] text-amber-300 hover:bg-amber-400/10 disabled:opacity-50"
                        >
                          ตั้งเป็น Primary Reference
                        </button>
                      )}
                      {nextActions.map((a) => (
                        <button
                          key={a.to}
                          disabled={busy}
                          onClick={() => changeAssetStatus(asset.id, a.to)}
                          className="rounded-md border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                        >
                          {a.label}
                        </button>
                      ))}
                      {asset.mimeType.startsWith("image/") && (
                        <button
                          disabled={aiQcBusyId !== null}
                          onClick={() => aiCheckConsistency(asset.id)}
                          className="inline-flex items-center gap-1 rounded-md border border-violet-500/50 px-2 py-1 text-[11px] text-violet-300 hover:bg-violet-500/10 disabled:opacity-50"
                        >
                          {aiQcBusyId === asset.id ? (
                            "AI กำลังตรวจ..."
                          ) : (
                            <>
                              <Sparkles className="size-3.5" /> AI ตรวจ consistency
                            </>
                          )}
                        </button>
                      )}
                      <button
                        title="ดาวน์โหลดไฟล์นี้"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDownloadAsset(asset);
                        }}
                        className="inline-flex items-center rounded-md border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800"
                      >
                        <Download className="size-3.5" />
                      </button>
                      {asset.status !== "archived" && (
                        <button
                          title="ลบออกจากคลัง (เก็บถาวร กู้คืนได้โดย admin)"
                          disabled={busy}
                          onClick={(e) => {
                            e.stopPropagation();
                            void archiveAsset(asset);
                          }}
                          className="inline-flex items-center rounded-md border border-zinc-800 px-2 py-1 text-[11px] text-zinc-500 hover:bg-zinc-800 hover:text-red-300 disabled:opacity-50"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>
                    {aiQcResults[asset.id] && (
                      <div className="rounded-lg border border-violet-500/40 bg-violet-500/10 p-2">
                        <p className="flex items-center gap-1 text-[11px] font-semibold text-violet-300">
                          AI QC: {aiQcResults[asset.id].score}/5
                          <span className="inline-flex">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star
                                key={i}
                                className={`size-3.5 ${
                                  i < aiQcResults[asset.id].score
                                    ? "fill-violet-300 text-violet-300"
                                    : "text-zinc-600"
                                }`}
                              />
                            ))}
                          </span>
                        </p>
                        <p className="mt-0.5 text-[11px] text-zinc-300">{aiQcResults[asset.id].verdict}</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {assets && assets.items.length === 0 && (
            <div className="rounded-2xl border border-dashed border-zinc-800 py-14 text-center text-sm text-zinc-500">
              ยังไม่มี asset — อัปโหลดรูป reference ตัวแรกด้วยปุ่ม &ldquo;+ อัปโหลด Asset&rdquo;
              <br />
              <span className="text-xs">ต้องมี primary reference ก่อนถึงจะ approve character ได้</span>
            </div>
          )}
        </section>
      </div>

      {character && promptViewerOpen && (
        <ImagePromptViewer
          character={character}
          assets={assets?.items ?? []}
          onAssetsChanged={load}
          onClose={() => setPromptViewerOpen(false)}
        />
      )}
      {character && specVerifyOpen && (
        <SpecVerifyModal character={character} onClose={() => setSpecVerifyOpen(false)} />
      )}
    </AppShell>
  );
}
