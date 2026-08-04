"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  Eye,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Music,
  Play,
  RefreshCw,
  Star,
  TriangleAlert,
  X,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import CoverImage from "@/components/CoverImage";
import EntityAvatar from "@/components/EntityAvatar";
import ExternalCaptureModal from "@/components/ExternalCaptureModal";
import PromptViewerModal from "@/components/PromptViewerModal";
import TieInProducts from "@/components/TieInProducts";
import { FilterSelect } from "@/components/ui/filter-select";
import { buildLocationPromptVariants, buildVoicePromptVariants } from "@/lib/promptBuilders";
import { mergeCaptureDraft, type LibraryCaptureDraft } from "@/lib/library-capture";
import { api, getToken, type Character, type CharacterList } from "@/lib/api";
import { formatFileSize, uploadAsset, type Asset, type AssetList } from "@/lib/assets";
import { primeEntityThumb, useAssetImage, useEntityThumb } from "@/lib/media";
import type { Prompt, PromptList } from "@/lib/prompts";
import {
  LEGAL_STATUS_LABEL,
  LEGAL_TRANSITIONS,
  LOCATION_STATUS_LABEL,
  QC_CATEGORIES,
  QC_CATEGORY_LABEL,
  QC_ENTITY_TYPES,
  RIGHT_ENTITY_TYPES,
  RISK_LABEL,
  SCORE_LABEL,
  VOICE_STATUS_LABEL,
  type LocationDetail,
  type LocationItem,
  type Paged,
  type QcReviewItem,
  type QcSummary,
  type RightItem,
  type VoiceProfile,
} from "@/lib/library";

const inputCls =
  "rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none focus:border-amber-400";
const filterCls =
  "rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-amber-400";
const btnPrimary =
  "rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50";
const btnGhost =
  "rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800";
const btnCapture =
  "rounded-lg border border-amber-400/40 px-4 py-2 text-sm text-amber-300 hover:bg-amber-400/10";

const TABS = [
  { key: "locations", label: "Locations" },
  { key: "voices", label: "Voice Profiles" },
  { key: "rights", label: "Rights" },
  { key: "qc", label: "QC Reviews" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("th-TH");
}

function Chip({ label, cls }: { label: string; cls: string }) {
  return <span className={`whitespace-nowrap rounded-full px-2 py-1 text-xs ${cls}`}>{label}</span>;
}

function errMsg(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

function splitComma(s: string): string[] {
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

// ─── shared: ปุ่มล้าง filter + จำนวน filter ที่ active ─────────
// ปุ่มสลับมุมมอง การ์ด/รายการ — จำค่าไว้ต่อแท็บใน localStorage (แบบเดียวกับหน้า Products)
function useViewMode(storageKey: string) {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved === "list" || saved === "grid") setViewMode(saved);
  }, [storageKey]);
  const changeView = (mode: "grid" | "list") => {
    setViewMode(mode);
    localStorage.setItem(storageKey, mode);
  };
  return { viewMode, changeView };
}

function ViewToggle({
  viewMode,
  onChange,
}: {
  viewMode: "grid" | "list";
  onChange: (mode: "grid" | "list") => void;
}) {
  return (
    <div className="ml-auto flex shrink-0 overflow-hidden rounded-lg border border-zinc-700">
      <button
        type="button"
        onClick={() => onChange("grid")}
        title="มุมมองการ์ด"
        className={`inline-flex items-center gap-1 px-3 py-1.5 text-sm ${
          viewMode === "grid" ? "bg-amber-400 font-semibold text-zinc-950" : "text-zinc-400 hover:bg-zinc-800"
        }`}
      >
        <LayoutGrid className="size-4" /> การ์ด
      </button>
      <button
        type="button"
        onClick={() => onChange("list")}
        title="มุมมองรายการ"
        className={`inline-flex items-center gap-1 border-l border-zinc-700 px-3 py-1.5 text-sm ${
          viewMode === "list" ? "bg-amber-400 font-semibold text-zinc-950" : "text-zinc-400 hover:bg-zinc-800"
        }`}
      >
        <List className="size-4" /> รายการ
      </button>
    </div>
  );
}

function ClearFilters({ count, onClear }: { count: number; onClear: () => void }) {
  return (
    <button
      type="button"
      onClick={onClear}
      disabled={count === 0}
      className={`rounded-lg border px-3 py-2 text-sm ${
        count > 0
          ? "border-amber-400/40 text-amber-300 hover:bg-amber-400/10"
          : "border-zinc-800 text-zinc-600"
      }`}
    >
      ล้าง filter{count > 0 ? ` (${count})` : ""}
    </button>
  );
}

function Pagination({
  data,
  onPage,
}: {
  data: { total: number; page: number; pageSize: number };
  onPage: (p: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));
  return (
    <div className="flex items-center gap-3 text-xs text-zinc-500">
      <span>
        ทั้งหมด {data.total} รายการ · หน้า {data.page}/{totalPages}
      </span>
      <button
        type="button"
        disabled={data.page <= 1}
        onClick={() => onPage(data.page - 1)}
        className="inline-flex items-center gap-1 rounded-md border border-zinc-700 px-2 py-1 hover:bg-zinc-800 disabled:opacity-40"
      >
        <ArrowLeft className="size-4" /> ก่อนหน้า
      </button>
      <button
        type="button"
        disabled={data.page >= totalPages}
        onClick={() => onPage(data.page + 1)}
        className="inline-flex items-center gap-1 rounded-md border border-zinc-700 px-2 py-1 hover:bg-zinc-800 disabled:opacity-40"
      >
        ถัดไป <ArrowRight className="size-4" />
      </button>
    </div>
  );
}

// ─── shared: เลือก entity ตาม entityType (character/prompt = select, อื่น ๆ = uuid) ──
function EntityPicker({
  entityType,
  value,
  onChange,
  characters,
  prompts,
  allowEmpty = false,
  required = false,
}: {
  entityType: string;
  value: string;
  onChange: (v: string) => void;
  characters: Character[];
  prompts: Prompt[];
  allowEmpty?: boolean;
  required?: boolean;
}) {
  if (entityType === "character" || entityType === "prompt") {
    const isChar = entityType === "character";
    return (
      <select
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
      >
        <option value="">{allowEmpty ? "ทุก entity" : `— เลือก ${entityType} —`}</option>
        {isChar
          ? characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.displayCode} — {c.nameTh}
              </option>
            ))
          : prompts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
      </select>
    );
  }
  return (
    <input
      required={required}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="entity UUID"
      className={`${inputCls} font-mono`}
    />
  );
}

function entityRef(
  entityType: string,
  entityId: string,
  characters: Character[],
  prompts: Prompt[],
): string {
  if (entityType === "character") {
    const c = characters.find((x) => x.id === entityId);
    if (c) return `${c.displayCode} — ${c.nameTh}`;
  }
  if (entityType === "prompt") {
    const p = prompts.find((x) => x.id === entityId);
    if (p) return p.name;
  }
  return `${entityId.slice(0, 8)}…`;
}

// ─── shared: media helpers ───────────────────────────────────

/** thumbnail เล็กใน gallery strip — โหลด blob (แนบ token) ผ่าน useAssetImage */
function GalleryThumb({ assetId, name }: { assetId: string; name: string }) {
  const url = useAssetImage(assetId);
  if (!url) return <div className="h-full w-full animate-pulse bg-zinc-800" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={name} className="h-full w-full object-cover" />;
}

// ═══ Tab 1: Locations ═══════════════════════════════════════

const emptyLocationForm = {
  name: "",
  type: "",
  regionStyle: "",
  mood: "",
  lighting: "",
  timeOfDay: "",
  prompt: "",
  negativePrompt: "",
  continuityNotes: "",
};

// เปลี่ยนปก location: server ไม่มี demotion logic ของ cover (มีเฉพาะ primary_reference)
// — จัดการฝั่ง client: ถอด cover link เดิมของรูปอื่นออก (แปลงเป็น reference) แล้วตั้งตัวใหม่เป็น cover
async function promoteLocationCover(locationId: string, target: Asset, assets: Asset[]) {
  const coverLinkFor = (a: Asset) =>
    a.links.find(
      (l) => l.entityType === "location" && l.entityId === locationId && l.linkRole === "cover",
    );
  for (const a of assets) {
    if (a.id === target.id) continue;
    const link = coverLinkFor(a);
    if (!link) continue;
    await api(`/assets/${a.id}/links/${link.id}`, { method: "DELETE" });
    const hasOtherLink = a.links.some(
      (l) => l.id !== link.id && l.entityType === "location" && l.entityId === locationId,
    );
    if (!hasOtherLink) {
      await api(`/assets/${a.id}/links`, {
        method: "POST",
        body: JSON.stringify({ entityType: "location", entityId: locationId, linkRole: "reference" }),
      });
    }
  }
  if (!coverLinkFor(target)) {
    await api(`/assets/${target.id}/links`, {
      method: "POST",
      body: JSON.stringify({ entityType: "location", entityId: locationId, linkRole: "cover" }),
    });
  }
  primeEntityThumb("location", locationId, target.id);
}

/** การ์ดรูป location — CoverImage hero + chips + ปุ่มอัปโหลดรูป + เปลี่ยนปก */
function LocationCard({
  loc,
  coverOverride,
  onEdit,
  onArchive,
  onCoverUploaded,
  onError,
  onViewPrompt,
}: {
  loc: LocationItem;
  /** assetId ที่เพิ่งอัปโหลด/ตั้งเป็นปกใน session นี้ — โชว์ทันทีไม่ต้อง refetch */
  coverOverride?: string;
  onEdit: () => void;
  onArchive: () => void;
  onCoverUploaded: (assetId: string) => void;
  onError: (msg: string) => void;
  onViewPrompt: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  // resolve thumb เองด้วย เพื่อรู้ว่ารูปแรกหรือยัง (ตัดสิน linkRole cover/reference)
  const resolvedThumb = useEntityThumb("location", coverOverride ? null : loc.id);
  const hasCover = Boolean(coverOverride ?? resolvedThumb);
  const st = LOCATION_STATUS_LABEL[loc.status] ?? LOCATION_STATUS_LABEL.active;

  // เปลี่ยนปกจากบนการ์ดโดยตรง (ไม่ต้องเข้าหน้าแก้ไข)
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerAssets, setPickerAssets] = useState<Asset[] | null>(null);
  const [pickerBusy, setPickerBusy] = useState(false);

  async function openPicker() {
    setPickerOpen(true);
    setPickerAssets(null);
    try {
      const res = await api<AssetList>(
        `/assets?entityType=location&entityId=${encodeURIComponent(loc.id)}`,
      );
      setPickerAssets(res.items.filter((a) => a.mimeType.startsWith("image/") && !a.archivedAt));
    } catch (err) {
      onError(errMsg(err, "โหลดรูปของ location ไม่สำเร็จ"));
      setPickerOpen(false);
    }
  }

  async function pickCover(target: Asset) {
    setPickerBusy(true);
    try {
      await promoteLocationCover(loc.id, target, pickerAssets ?? []);
      onCoverUploaded(target.id); // ใช้ coverOverride ให้การ์ดเปลี่ยนรูปทันที
      setPickerOpen(false);
    } catch (err) {
      onError(errMsg(err, "เปลี่ยนปกไม่สำเร็จ"));
    } finally {
      setPickerBusy(false);
    }
  }

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const asset = await uploadAsset(file, {
        assetType: "location_reference",
        entityType: "location",
        entityId: loc.id,
        linkRole: hasCover ? "reference" : "cover",
      });
      if (!hasCover) {
        primeEntityThumb("location", loc.id, asset.id);
        onCoverUploaded(asset.id);
      }
    } catch (err) {
      onError(errMsg(err, "อัปโหลดรูปไม่สำเร็จ"));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/40 transition-colors hover:border-zinc-700">
      <div className="relative">
      <button type="button" onClick={onEdit} className="block w-full text-left">
        <CoverImage
          assetId={coverOverride}
          entityType="location"
          entityId={loc.id}
          name={loc.name}
          aspect="aspect-video"
        >
          <span className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[11px] ${st.cls}`}>
            {st.label}
          </span>
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-zinc-950/90 via-zinc-950/40 to-transparent p-3 pt-10">
            <p className="truncate text-sm font-semibold text-white">{loc.name}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {loc.type && (
                <span className="rounded-full bg-zinc-950/70 px-2 py-0.5 text-[11px] text-zinc-200">
                  {loc.type}
                </span>
              )}
              {loc.timeOfDay && (
                <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[11px] text-amber-200">
                  {loc.timeOfDay}
                </span>
              )}
            </div>
          </div>
        </CoverImage>
      </button>
        {pickerOpen && (
          <div className="absolute inset-0 z-10 flex flex-col bg-zinc-950/95 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-300">เลือกรูปเป็นปกการ์ด</span>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-white"
              >
                <X className="size-4" /> ปิด
              </button>
            </div>
            {pickerAssets === null ? (
              <p className="text-xs text-zinc-500">กำลังโหลดรูป...</p>
            ) : pickerAssets.length === 0 ? (
              <p className="text-xs text-zinc-500">
                ยังไม่มีรูป — กด <Camera className="inline size-4 align-text-bottom" /> รูป เพื่ออัปโหลดก่อน
              </p>
            ) : (
              <div className="flex flex-1 flex-wrap content-start gap-2 overflow-y-auto">
                {pickerAssets.map((a) => {
                  const isCover = a.links.some(
                    (l) =>
                      l.entityType === "location" && l.entityId === loc.id && l.linkRole === "cover",
                  );
                  return (
                    <button
                      key={a.id}
                      type="button"
                      disabled={pickerBusy || isCover}
                      onClick={() => void pickCover(a)}
                      title={isCover ? "ปกปัจจุบัน" : "ตั้งเป็นปก"}
                      className={`relative h-16 w-24 overflow-hidden rounded-lg border ${
                        isCover ? "border-amber-400" : "border-zinc-700 hover:border-amber-300"
                      } disabled:cursor-default`}
                    >
                      <GalleryThumb assetId={a.id} name={loc.name} />
                      {isCover && (
                        <span className="absolute inset-x-0 bottom-0 inline-flex items-center justify-center gap-1 bg-amber-400/90 text-center text-[10px] font-medium text-amber-950">
                          <Star className="size-3 fill-current" /> ปก
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="space-y-2 p-3">
        <p className="truncate text-xs text-zinc-400" title={[loc.mood, loc.lighting].filter(Boolean).join(" · ")}>
          {[loc.mood, loc.lighting].filter(Boolean).join(" · ") || "—"}
        </p>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-zinc-600">อัปเดต {fmtDate(loc.updatedAt)}</span>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              title="อัปโหลดรูปฉาก (รูปแรก = ปกการ์ด)"
              className={`${btnGhost} inline-flex items-center gap-1 disabled:opacity-50`}
            >
              <Camera className="size-4" /> {uploading ? "กำลังอัปโหลด..." : "รูป"}
            </button>
            <button
              type="button"
              onClick={() => void openPicker()}
              title="เลือกรูปอื่นเป็นปกการ์ด"
              className={`${btnGhost} inline-flex items-center gap-1`}
            >
              <ImageIcon className="size-4" /> เปลี่ยนปก
            </button>
            <button
              type="button"
              onClick={onViewPrompt}
              title="ดู/ก๊อป prompt ฉากนี้ (ChatGPT/Gemini/Grok)"
              className={`${btnGhost} inline-flex items-center gap-1`}
            >
              <Eye className="size-4" /> Prompt
            </button>
            <button type="button" onClick={onEdit} className={btnGhost}>
              แก้ไข
            </button>
            {loc.status !== "archived" && (
              <button type="button" onClick={onArchive} className={`${btnGhost} hover:text-red-300`}>
                Archive
              </button>
            )}
          </div>
        </div>
      </div>
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
    </div>
  );
}

/** gallery strip รูปทั้งหมดของ location ใน edit panel + ปุ่มตั้งเป็นปก */
function LocationGallery({
  locationId,
  name,
  onCoverChanged,
  onError,
}: {
  locationId: string;
  name: string;
  onCoverChanged: (assetId: string) => void;
  onError: (msg: string) => void;
}) {
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<AssetList>(
        `/assets?entityType=location&entityId=${encodeURIComponent(locationId)}`,
      );
      setAssets(res.items.filter((a) => a.mimeType.startsWith("image/") && !a.archivedAt));
    } catch (err) {
      onError(errMsg(err, "โหลดรูปของ location ไม่สำเร็จ"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const coverLinkOf = (a: Asset) =>
    a.links.find(
      (l) => l.entityType === "location" && l.entityId === locationId && l.linkRole === "cover",
    );

  async function setCover(target: Asset) {
    setBusyId(target.id);
    try {
      await promoteLocationCover(locationId, target, assets ?? []);
      onCoverChanged(target.id);
      await load();
    } catch (err) {
      onError(errMsg(err, "ตั้งเป็นปกไม่สำเร็จ"));
    } finally {
      setBusyId(null);
    }
  }

  if (!assets) return <p className="text-xs text-zinc-500">กำลังโหลดรูป...</p>;
  if (assets.length === 0)
    return (
      <p className="text-xs text-zinc-500">
        ยังไม่มีรูปของ location นี้ — อัปโหลดรูปฉากเพื่อคุม continuity (ปุ่ม <Camera className="inline size-4 align-text-bottom" /> บนการ์ด)
      </p>
    );

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-zinc-400">รูปทั้งหมด ({assets.length})</p>
      <div className="flex flex-wrap gap-3">
        {assets.map((a) => {
          const isCover = Boolean(coverLinkOf(a));
          return (
            <div
              key={a.id}
              className={`w-36 overflow-hidden rounded-xl border ${
                isCover ? "border-amber-400/60" : "border-zinc-800"
              }`}
            >
              <div className="aspect-video">
                <GalleryThumb assetId={a.id} name={name} />
              </div>
              <div className="flex items-center justify-between gap-1 px-2 py-1.5">
                {isCover ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-300"><Star className="size-3 fill-current" /> ปกการ์ด</span>
                ) : (
                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => void setCover(a)}
                    className="text-[11px] text-zinc-400 hover:text-amber-300 disabled:opacity-50"
                  >
                    {busyId === a.id ? "กำลังตั้ง..." : "ตั้งเป็นปก"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LocationsTab({ syncUrl }: { syncUrl: (filters: Record<string, string>) => void }) {
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [fType, setFType] = useState(sp.get("type") ?? "");
  const [fRegion, setFRegion] = useState(sp.get("regionStyle") ?? "");
  const [fTime, setFTime] = useState(sp.get("timeOfDay") ?? "");
  const [fStatus, setFStatus] = useState(sp.get("status") ?? "");
  const [sortBy, setSortBy] = useState(sp.get("sortBy") ?? "");
  const [page, setPage] = useState(parseInt(sp.get("page") ?? "1", 10) || 1);

  const [data, setData] = useState<Paged<LocationItem> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<LocationDetail | null>(null);
  const [form, setForm] = useState({ ...emptyLocationForm });
  const [saving, setSaving] = useState(false);
  const [showCapture, setShowCapture] = useState(false);
  // ปกที่เพิ่งอัปโหลด/ตั้งใหม่ใน session นี้ (loc.id → assetId) — โชว์ทันทีโดยไม่ refetch
  const [covers, setCovers] = useState<Record<string, string>>({});
  // 👁️ ดู/ก๊อป Prompt ของ location ที่เลือก (shared PromptViewerModal)
  const [viewingPrompt, setViewingPrompt] = useState<LocationItem | null>(null);
  const { viewMode, changeView } = useViewMode("library.locations.viewMode");

  const filters: Record<string, string> = {
    q,
    type: fType,
    regionStyle: fRegion,
    timeOfDay: fTime,
    status: fStatus,
    sortBy,
    page: page > 1 ? String(page) : "",
  };
  const filterKey = JSON.stringify(filters);
  const activeCount = [q, fType, fRegion, fTime, fStatus].filter(Boolean).length;

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => v && params.set(k, v));
      const res = await api<Paged<LocationItem>>(`/locations?${params.toString()}`);
      setData(res);
      setError(null);
    } catch (err) {
      setError(errMsg(err, "โหลด locations ไม่สำเร็จ"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  useEffect(() => {
    const t = setTimeout(() => {
      syncUrl(filters);
      load();
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  function setFilter(setter: (v: string) => void) {
    return (v: string) => {
      setter(v);
      setPage(1);
    };
  }

  function clearFilters() {
    setQ("");
    setFType("");
    setFRegion("");
    setFTime("");
    setFStatus("");
    setPage(1);
  }

  // External Capture — เท draft ของ AI ลงฟอร์ม create เดิม (ผู้ใช้รีวิว/แก้ก่อนบันทึกปกติ)
  function applyCaptureDraft(draft: LibraryCaptureDraft) {
    setEditing(null);
    setForm(mergeCaptureDraft(emptyLocationForm, draft.fields));
    setShowCapture(false);
    setShowForm(true);
  }

  async function openEdit(id: string) {
    try {
      const detail = await api<LocationDetail>(`/locations/${id}`);
      setEditing(detail);
      setForm({
        name: detail.name,
        type: detail.type ?? "",
        regionStyle: detail.regionStyle ?? "",
        mood: detail.mood ?? "",
        lighting: detail.lighting ?? "",
        timeOfDay: detail.timeOfDay ?? "",
        prompt: detail.prompt ?? "",
        negativePrompt: detail.negativePrompt ?? "",
        continuityNotes: detail.continuityNotes ?? "",
      });
      setShowForm(true);
    } catch (err) {
      setError(errMsg(err, "โหลดรายละเอียดไม่สำเร็จ"));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body = {
        name: form.name,
        type: form.type || undefined,
        regionStyle: form.regionStyle || undefined,
        mood: form.mood || undefined,
        lighting: form.lighting || undefined,
        timeOfDay: form.timeOfDay || undefined,
        prompt: form.prompt || undefined,
        negativePrompt: form.negativePrompt || undefined,
        continuityNotes: form.continuityNotes || undefined,
      };
      if (editing) {
        await api<LocationItem>(`/locations/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      } else {
        await api<LocationItem>("/locations", { method: "POST", body: JSON.stringify(body) });
      }
      setShowForm(false);
      setEditing(null);
      setForm({ ...emptyLocationForm });
      await load();
    } catch (err) {
      setError(errMsg(err, "บันทึกไม่สำเร็จ"));
    } finally {
      setSaving(false);
    }
  }

  async function archive(loc: LocationItem) {
    if (!window.confirm(`archive location "${loc.name}" ?`)) return;
    try {
      await api<LocationItem>(`/locations/${loc.id}/archive`, { method: "PATCH" });
      await load();
    } catch (err) {
      setError(errMsg(err, "archive ไม่สำเร็จ"));
    }
  }

  return (
    <div className="space-y-4">
      {/* filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setFilter(setQ)(e.target.value)}
          placeholder="ค้นหาชื่อ / mood..."
          className={`${filterCls} min-w-48 flex-1`}
        />
        <input
          value={fType}
          onChange={(e) => setFilter(setFType)(e.target.value)}
          placeholder="ประเภท เช่น คาเฟ่"
          className={`${filterCls} w-36`}
        />
        <input
          value={fRegion}
          onChange={(e) => setFilter(setFRegion)(e.target.value)}
          placeholder="สไตล์ภูมิภาค"
          className={`${filterCls} w-36`}
        />
        <input
          value={fTime}
          onChange={(e) => setFilter(setFTime)(e.target.value)}
          placeholder="ช่วงเวลา เช่น golden hour"
          className={`${filterCls} w-44`}
        />
        <FilterSelect
          value={fStatus}
          onChange={setFilter(setFStatus)}
          options={[
            { value: "", label: "ทุก status (ไม่รวม archived)" },
            { value: "active", label: "Active" },
            { value: "archived", label: "Archived" },
          ]}
          className="w-fit"
        />
        <FilterSelect
          value={sortBy}
          onChange={setFilter(setSortBy)}
          options={[
            { value: "", label: "เรียงตามอัปเดตล่าสุด" },
            { value: "name", label: "เรียงตามชื่อ (ก-ฮ)" },
          ]}
          className="w-fit"
        />
        <ClearFilters count={activeCount} onClear={clearFilters} />
        <button
          onClick={() => {
            setEditing(null);
            setForm({ ...emptyLocationForm });
            setShowForm((v) => !v);
          }}
          className={btnPrimary}
        >
          + สร้าง Location
        </button>
        <button onClick={() => setShowCapture(true)} className={`${btnCapture} inline-flex items-center gap-1`}>
          <RefreshCw className="size-4" /> สร้างจากภายนอก
        </button>
        <ViewToggle viewMode={viewMode} onChange={changeView} />
      </div>

      {showCapture && (
        <ExternalCaptureModal
          targetType="location"
          title="Location"
          onDraft={applyCaptureDraft}
          onClose={() => setShowCapture(false)}
        />
      )}

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="space-y-3 rounded-2xl border border-amber-400/30 bg-zinc-900 p-6"
        >
          <p className="text-sm text-zinc-400">
            {editing
              ? `แก้ไข location: ${editing.name} — ใช้ใน ${editing.episodesCount} episode`
              : "สร้าง location ใหม่ (PRD §14)"}
          </p>
          <div className="grid grid-cols-3 gap-3">
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="ชื่อ location *"
              className={inputCls}
            />
            <input
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              placeholder="ประเภท เช่น คาเฟ่ / ริมทะเล"
              className={inputCls}
            />
            <input
              value={form.regionStyle}
              onChange={(e) => setForm({ ...form, regionStyle: e.target.value })}
              placeholder="สไตล์ภูมิภาค เช่น ไทยโมเดิร์น"
              className={inputCls}
            />
            <input
              value={form.mood}
              onChange={(e) => setForm({ ...form, mood: e.target.value })}
              placeholder="Mood เช่น อบอุ่น สดใส"
              className={inputCls}
            />
            <input
              value={form.lighting}
              onChange={(e) => setForm({ ...form, lighting: e.target.value })}
              placeholder="แสง เช่น soft window light"
              className={inputCls}
            />
            <input
              value={form.timeOfDay}
              onChange={(e) => setForm({ ...form, timeOfDay: e.target.value })}
              placeholder="ช่วงเวลา เช่น golden hour"
              className={inputCls}
            />
          </div>
          <textarea
            value={form.prompt}
            onChange={(e) => setForm({ ...form, prompt: e.target.value })}
            placeholder="Location prompt"
            rows={3}
            className={`${inputCls} w-full font-mono`}
          />
          <textarea
            value={form.negativePrompt}
            onChange={(e) => setForm({ ...form, negativePrompt: e.target.value })}
            placeholder="Negative prompt (ถ้ามี)"
            rows={2}
            className={`${inputCls} w-full font-mono`}
          />
          <textarea
            value={form.continuityNotes}
            onChange={(e) => setForm({ ...form, continuityNotes: e.target.value })}
            placeholder="Continuity notes เช่น โต๊ะไม้ตัวเดิมมุมซ้าย แก้วลายเดียวกันทุก EP"
            rows={2}
            className={`${inputCls} w-full`}
          />
          {editing && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
              <LocationGallery
                locationId={editing.id}
                name={editing.name}
                onCoverChanged={(assetId) =>
                  setCovers((m) => ({ ...m, [editing.id]: assetId }))
                }
                onError={setError}
              />
            </div>
          )}
          {/* 🛍️ สินค้า Tie-In — ผูกสินค้าจริงที่ tie-in กับโลเคชัน (ไม่บังคับ) */}
          {editing && <TieInProducts entity="location" entityId={editing.id} />}
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className={btnPrimary}>
              {saving ? "กำลังบันทึก..." : editing ? "บันทึกการแก้ไข" : "สร้าง Location"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setEditing(null);
              }}
              className={btnGhost}
            >
              ยกเลิก
            </button>
          </div>
        </form>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      {/* photo card grid — image-first ตาม CEO directive */}
      {viewMode === "grid" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data?.items.map((loc) => (
            <LocationCard
              key={loc.id}
              loc={loc}
              coverOverride={covers[loc.id]}
              onEdit={() => openEdit(loc.id)}
              onArchive={() => archive(loc)}
              onCoverUploaded={(assetId) => setCovers((m) => ({ ...m, [loc.id]: assetId }))}
              onError={setError}
              onViewPrompt={() => setViewingPrompt(loc)}
            />
          ))}
        </div>
      )}

      {/* list view — ตารางแน่น เห็นหลายโลเคชันพร้อมกัน */}
      {viewMode === "list" && data && data.items.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-zinc-800">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/60 text-left text-[11px] uppercase tracking-wider text-zinc-500">
                <th className="px-3 py-2.5 font-semibold">Location</th>
                <th className="px-3 py-2.5 font-semibold">ภูมิภาค/สไตล์</th>
                <th className="px-3 py-2.5 font-semibold">Mood</th>
                <th className="px-3 py-2.5 font-semibold">แสง · ช่วงเวลา</th>
                <th className="px-3 py-2.5 font-semibold">สถานะ</th>
                <th className="px-3 py-2.5 font-semibold">อัปเดต</th>
                <th className="px-3 py-2.5 text-right font-semibold">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((loc) => (
                <tr
                  key={loc.id}
                  onClick={() => void openEdit(loc.id)}
                  className="cursor-pointer border-b border-zinc-800/60 transition-colors last:border-0 hover:bg-zinc-800/40"
                >
                  <td className="px-3 py-2">
                    <p className="font-medium text-zinc-100">{loc.name}</p>
                    {loc.type && <p className="text-[11px] text-zinc-500">{loc.type}</p>}
                  </td>
                  <td className="px-3 py-2 text-zinc-300">{loc.regionStyle ?? "—"}</td>
                  <td className="px-3 py-2 text-zinc-300">{loc.mood ?? "—"}</td>
                  <td className="px-3 py-2 text-zinc-300">
                    {[loc.lighting, loc.timeOfDay].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] ${
                        loc.status === "archived"
                          ? "bg-zinc-800 text-zinc-400"
                          : "bg-emerald-400/15 text-emerald-300"
                      }`}
                    >
                      {loc.status === "archived" ? "Archived" : "Active"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-500">{fmtDate(loc.updatedAt)}</td>
                  <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setViewingPrompt(loc)}
                        title="ดู/ก๊อป prompt ฉากนี้ (ChatGPT/Gemini/Grok)"
                        className={`${btnGhost} inline-flex items-center gap-1`}
                      >
                        <Eye className="size-4" /> Prompt
                      </button>
                      <button type="button" onClick={() => void openEdit(loc.id)} className={btnGhost}>
                        แก้ไข
                      </button>
                      {loc.status !== "archived" && (
                        <button
                          type="button"
                          onClick={() => void archive(loc)}
                          className={`${btnGhost} hover:text-red-300`}
                        >
                          Archive
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && data.items.length === 0 && (
        <div className="rounded-2xl border border-dashed border-zinc-800 p-12 text-center">
          <Camera className="mx-auto size-8 text-zinc-600" />
          <p className="mt-2 text-sm text-zinc-400">ไม่พบ location ตาม filter ที่เลือก</p>
          <p className="mt-1 text-xs text-zinc-500">
            สร้าง location แล้วอัปโหลดรูปฉากเพื่อคุม continuity ของทุก EP
          </p>
        </div>
      )}
      {data && <Pagination data={data} onPage={setPage} />}
      {viewingPrompt && (
        <PromptViewerModal
          title={`ดู/ก๊อป Prompt — ${viewingPrompt.name}`}
          variants={buildLocationPromptVariants(viewingPrompt)}
          onClose={() => setViewingPrompt(null)}
        />
      )}
    </div>
  );
}

// ═══ Tab 2: Voice Profiles ══════════════════════════════════

const emptyVoiceForm = {
  characterId: "",
  voiceType: "",
  tone: "",
  accent: "",
  speakingSpeed: "",
  laughStyle: "",
  emotionalRange: "",
  sampleDialogues: "",
  aiVoiceModel: "",
  humanVoiceActor: "",
  usageRights: "",
};

/** ไฟล์เสียงตัวอย่าง 1 รายการ — โหลด blob เป็น object URL แล้วเล่นผ่าน <audio> */
function AudioSample({ asset }: { asset: Asset }) {
  const url = useAssetImage(asset.id); // generic blob hook — ใช้กับ audio ได้
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1 truncate text-xs text-zinc-300" title={asset.originalFilename}>
          <Music className="size-4 shrink-0" /> {asset.originalFilename}
        </p>
        <p className="text-[11px] text-zinc-600">
          {formatFileSize(asset.fileSize)} · {fmtDate(asset.createdAt)}
        </p>
      </div>
      {url ? (
        <audio controls preload="metadata" src={url} className="h-9 w-64 max-w-full" />
      ) : (
        <span className="inline-flex items-center gap-1 text-xs text-zinc-500"><Play className="size-4" /> กำลังโหลด...</span>
      )}
    </div>
  );
}

/** การ์ด voice profile — avatar ของ character เจ้าของเสียง + chips + เสียงตัวอย่าง */
function VoiceCard({
  v,
  onEdit,
  onStatus,
  onError,
  onViewPrompt,
}: {
  v: VoiceProfile;
  onEdit: () => void;
  onStatus: (status: string) => void;
  onError: (msg: string) => void;
  onViewPrompt: () => void;
}) {
  const st = VOICE_STATUS_LABEL[v.status] ?? VOICE_STATUS_LABEL.draft;
  const charName = v.character?.nameTh ?? `${v.characterId.slice(0, 8)}…`;
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [samples, setSamples] = useState<Asset[] | null>(null);

  const loadSamples = useCallback(async () => {
    try {
      const res = await api<AssetList>(
        `/assets?entityType=voice&entityId=${encodeURIComponent(v.id)}`,
      );
      setSamples(res.items.filter((a) => a.mimeType.startsWith("audio/") && !a.archivedAt));
    } catch {
      setSamples([]); // โหลดไม่ได้ = ยังไม่มีตัวอย่าง — ไม่ต้อง error ทั้งการ์ด
    }
  }, [v.id]);

  useEffect(() => {
    void loadSamples();
  }, [loadSamples]);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      await uploadAsset(file, {
        assetType: "voice_sample",
        entityType: "voice",
        entityId: v.id,
        linkRole: "reference",
      });
      await loadSamples();
    } catch (err) {
      onError(errMsg(err, "อัปโหลดไฟล์เสียงไม่สำเร็จ"));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const chips = [
    v.voiceType,
    v.tone && `โทน: ${v.tone}`,
    v.accent && `สำเนียง: ${v.accent}`,
    v.speakingSpeed && `ความเร็ว: ${v.speakingSpeed}`,
    v.aiVoiceModel && `AI: ${v.aiVoiceModel}`,
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 transition-colors hover:border-zinc-700">
      <div className="flex flex-wrap items-start gap-3">
        <EntityAvatar entityType="character" id={v.characterId} name={charName} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-zinc-100">
            {charName}{" "}
            {v.character && (
              <span className="font-mono text-xs text-zinc-500">{v.character.displayCode}</span>
            )}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {chips.length > 0 ? (
              chips.map((c) => (
                <span
                  key={c}
                  className="rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-300"
                >
                  {c}
                </span>
              ))
            ) : (
              <span className="text-xs text-zinc-600">ยังไม่ระบุรายละเอียดเสียง</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Chip label={st.label} cls={st.cls} />
          <button
            type="button"
            onClick={onViewPrompt}
            title="ดู/ก๊อป Voice Direction brief"
            className={`${btnGhost} inline-flex items-center gap-1`}
          >
            <Eye className="size-4" /> Prompt
          </button>
          <button type="button" onClick={onEdit} className={btnGhost}>
            แก้ไข
          </button>
          {v.status === "draft" && (
            <button
              type="button"
              onClick={() => onStatus("approved")}
              title="ต้องมีสิทธิ์ Approve ใน module voice"
              className="rounded-lg border border-emerald-700 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-900/40"
            >
              Approve
            </button>
          )}
          {v.status !== "archived" && (
            <button
              type="button"
              onClick={() => onStatus("archived")}
              className={`${btnGhost} hover:text-red-300`}
            >
              Archive
            </button>
          )}
        </div>
      </div>

      {/* เสียงตัวอย่าง */}
      <div className="space-y-2 border-t border-zinc-800/60 pt-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-zinc-400">
            เสียงตัวอย่าง{samples && samples.length > 0 ? ` (${samples.length})` : ""}
          </p>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className={`${btnGhost} inline-flex items-center gap-1 disabled:opacity-50`}
          >
            <Music className="size-4" /> {uploading ? "กำลังอัปโหลด..." : "อัปโหลดเสียง"}
          </button>
        </div>
        {samples === null ? (
          <p className="text-xs text-zinc-600">กำลังโหลดรายการเสียง...</p>
        ) : samples.length === 0 ? (
          <p className="text-xs text-zinc-500">
            ยังไม่มีเสียงตัวอย่าง — อัปโหลดไฟล์เสียงจาก ElevenLabs/บันทึกเองได้
          </p>
        ) : (
          <div className="space-y-2">
            {samples.map((a) => (
              <AudioSample key={a.id} asset={a} />
            ))}
          </div>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />
    </div>
  );
}

function VoicesTab({
  characters,
  syncUrl,
}: {
  characters: Character[];
  syncUrl: (filters: Record<string, string>) => void;
}) {
  const sp = useSearchParams();
  const [fCharacter, setFCharacter] = useState(sp.get("characterId") ?? "");
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [fStatus, setFStatus] = useState(sp.get("status") ?? "");
  const [page, setPage] = useState(parseInt(sp.get("page") ?? "1", 10) || 1);

  const [data, setData] = useState<Paged<VoiceProfile> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<VoiceProfile | null>(null);
  const [form, setForm] = useState({ ...emptyVoiceForm });
  const [saving, setSaving] = useState(false);
  // 👁️ ดู/ก๊อป Voice Direction ของ profile ที่เลือก (shared PromptViewerModal)
  const [viewingPrompt, setViewingPrompt] = useState<VoiceProfile | null>(null);
  const { viewMode, changeView } = useViewMode("library.voices.viewMode");

  const filters: Record<string, string> = {
    characterId: fCharacter,
    q,
    status: fStatus,
    page: page > 1 ? String(page) : "",
  };
  const filterKey = JSON.stringify(filters);
  const activeCount = [fCharacter, q, fStatus].filter(Boolean).length;

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => v && params.set(k, v));
      const res = await api<Paged<VoiceProfile>>(`/voices?${params.toString()}`);
      setData(res);
      setError(null);
    } catch (err) {
      setError(errMsg(err, "โหลด voice profiles ไม่สำเร็จ"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  useEffect(() => {
    const t = setTimeout(() => {
      syncUrl(filters);
      load();
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  function clearFilters() {
    setFCharacter("");
    setQ("");
    setFStatus("");
    setPage(1);
  }

  function openEdit(v: VoiceProfile) {
    setEditing(v);
    setForm({
      characterId: v.characterId,
      voiceType: v.voiceType ?? "",
      tone: v.tone ?? "",
      accent: v.accent ?? "",
      speakingSpeed: v.speakingSpeed ?? "",
      laughStyle: v.laughStyle ?? "",
      emotionalRange: v.emotionalRange.join(", "),
      sampleDialogues: v.sampleDialogues.join("\n"),
      aiVoiceModel: v.aiVoiceModel ?? "",
      humanVoiceActor: v.humanVoiceActor ?? "",
      usageRights: v.usageRights ?? "",
    });
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const base = {
        voiceType: form.voiceType || undefined,
        tone: form.tone || undefined,
        accent: form.accent || undefined,
        speakingSpeed: form.speakingSpeed || undefined,
        laughStyle: form.laughStyle || undefined,
        emotionalRange: splitComma(form.emotionalRange),
        sampleDialogues: form.sampleDialogues
          .split("\n")
          .map((x) => x.trim())
          .filter(Boolean),
        aiVoiceModel: form.aiVoiceModel || undefined,
        humanVoiceActor: form.humanVoiceActor || undefined,
        usageRights: form.usageRights || undefined,
      };
      if (editing) {
        await api<VoiceProfile>(`/voices/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(base),
        });
      } else {
        if (!form.characterId) throw new Error("กรุณาเลือก character");
        await api<VoiceProfile>("/voices", {
          method: "POST",
          body: JSON.stringify({ ...base, characterId: form.characterId }),
        });
      }
      setShowForm(false);
      setEditing(null);
      setForm({ ...emptyVoiceForm });
      await load();
    } catch (err) {
      setError(errMsg(err, "บันทึกไม่สำเร็จ"));
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(v: VoiceProfile, status: string) {
    if (status === "archived" && !window.confirm("archive voice profile นี้?")) return;
    try {
      await api<VoiceProfile>(`/voices/${v.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (err) {
      setError(errMsg(err, "เปลี่ยน status ไม่สำเร็จ"));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect
          value={fCharacter}
          onChange={(v) => {
            setFCharacter(v);
            setPage(1);
          }}
          options={[
            { value: "", label: "ทุก character" },
            ...characters.map((c) => ({ value: c.id, label: `${c.displayCode} — ${c.nameTh}` })),
          ]}
          className="w-fit"
        />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder="ค้นหา voice type / tone / สำเนียง..."
          className={`${filterCls} min-w-56 flex-1`}
        />
        <FilterSelect
          value={fStatus}
          onChange={(v) => {
            setFStatus(v);
            setPage(1);
          }}
          options={[
            { value: "", label: "ทุก status (ไม่รวม archived)" },
            { value: "draft", label: "Draft" },
            { value: "approved", label: "Approved" },
            { value: "archived", label: "Archived" },
          ]}
          className="w-fit"
        />
        <ClearFilters count={activeCount} onClear={clearFilters} />
        <button
          onClick={() => {
            setEditing(null);
            setForm({ ...emptyVoiceForm });
            setShowForm((v) => !v);
          }}
          className={btnPrimary}
        >
          + สร้าง Voice Profile
        </button>
        <ViewToggle viewMode={viewMode} onChange={changeView} />
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="space-y-3 rounded-2xl border border-amber-400/30 bg-zinc-900 p-6"
        >
          <p className="text-sm text-zinc-400">
            {editing
              ? `แก้ไข voice profile ของ ${editing.character?.nameTh ?? editing.characterId}`
              : "สร้าง voice profile ใหม่ (PRD §15)"}
          </p>
          <div className="grid grid-cols-3 gap-3">
            <FilterSelect
              disabled={!!editing}
              value={form.characterId}
              onChange={(v) => setForm({ ...form, characterId: v })}
              options={[
                { value: "", label: "— เลือก character * —" },
                ...characters.map((c) => ({ value: c.id, label: `${c.displayCode} — ${c.nameTh}` })),
              ]}
            />
            <input
              value={form.voiceType}
              onChange={(e) => setForm({ ...form, voiceType: e.target.value })}
              placeholder="Voice type เช่น เสียงใสวัยรุ่น"
              className={inputCls}
            />
            <input
              value={form.tone}
              onChange={(e) => setForm({ ...form, tone: e.target.value })}
              placeholder="Tone เช่น เป็นกันเอง ขี้เล่น"
              className={inputCls}
            />
            <input
              value={form.accent}
              onChange={(e) => setForm({ ...form, accent: e.target.value })}
              placeholder="สำเนียง เช่น กลาง / อีสานนิด ๆ"
              className={inputCls}
            />
            <input
              value={form.speakingSpeed}
              onChange={(e) => setForm({ ...form, speakingSpeed: e.target.value })}
              placeholder="ความเร็วการพูด"
              className={inputCls}
            />
            <input
              value={form.laughStyle}
              onChange={(e) => setForm({ ...form, laughStyle: e.target.value })}
              placeholder="สไตล์หัวเราะ"
              className={inputCls}
            />
          </div>
          <input
            value={form.emotionalRange}
            onChange={(e) => setForm({ ...form, emotionalRange: e.target.value })}
            placeholder="Emotional range คั่นด้วย , เช่น สดใส, เขิน, จริงจัง"
            className={`${inputCls} w-full`}
          />
          <textarea
            value={form.sampleDialogues}
            onChange={(e) => setForm({ ...form, sampleDialogues: e.target.value })}
            placeholder={"Sample dialogues — 1 บรรทัดต่อ 1 ประโยค"}
            rows={3}
            className={`${inputCls} w-full`}
          />
          <div className="grid grid-cols-3 gap-3">
            <input
              value={form.aiVoiceModel}
              onChange={(e) => setForm({ ...form, aiVoiceModel: e.target.value })}
              placeholder="AI voice model"
              className={inputCls}
            />
            <input
              value={form.humanVoiceActor}
              onChange={(e) => setForm({ ...form, humanVoiceActor: e.target.value })}
              placeholder="นักพากย์ (ถ้ามี)"
              className={inputCls}
            />
            <input
              value={form.usageRights}
              onChange={(e) => setForm({ ...form, usageRights: e.target.value })}
              placeholder="สิทธิ์การใช้เสียง"
              className={inputCls}
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className={btnPrimary}>
              {saving ? "กำลังบันทึก..." : editing ? "บันทึกการแก้ไข" : "สร้าง Voice Profile"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setEditing(null);
              }}
              className={btnGhost}
            >
              ยกเลิก
            </button>
          </div>
        </form>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      {/* audio-first voice cards */}
      {viewMode === "grid" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {data?.items.map((v) => (
            <VoiceCard
              key={v.id}
              v={v}
              onEdit={() => openEdit(v)}
              onStatus={(s) => changeStatus(v, s)}
              onError={setError}
              onViewPrompt={() => setViewingPrompt(v)}
            />
          ))}
        </div>
      )}

      {/* list view — ตารางแน่น เห็นหลายโปรไฟล์เสียงพร้อมกัน (ไฟล์เสียงฟังได้ในมุมมองการ์ด) */}
      {viewMode === "list" && data && data.items.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-zinc-800">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/60 text-left text-[11px] uppercase tracking-wider text-zinc-500">
                <th className="px-3 py-2.5 font-semibold">ตัวละคร</th>
                <th className="px-3 py-2.5 font-semibold">ประเภทเสียง</th>
                <th className="px-3 py-2.5 font-semibold">โทน</th>
                <th className="px-3 py-2.5 font-semibold">สำเนียง</th>
                <th className="px-3 py-2.5 font-semibold">AI Model</th>
                <th className="px-3 py-2.5 font-semibold">สถานะ</th>
                <th className="px-3 py-2.5 text-right font-semibold">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((v) => {
                const st = VOICE_STATUS_LABEL[v.status] ?? VOICE_STATUS_LABEL.draft;
                const charName = v.character?.nameTh ?? `${v.characterId.slice(0, 8)}…`;
                return (
                  <tr
                    key={v.id}
                    onClick={() => openEdit(v)}
                    className="cursor-pointer border-b border-zinc-800/60 transition-colors last:border-0 hover:bg-zinc-800/40"
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <EntityAvatar
                          entityType="character"
                          id={v.characterId}
                          name={charName}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-zinc-100">{charName}</p>
                          {v.character && (
                            <p className="font-mono text-[10px] text-zinc-500">
                              {v.character.displayCode}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-zinc-300">{v.voiceType ?? "—"}</td>
                    <td className="max-w-52 truncate px-3 py-2 text-zinc-300" title={v.tone ?? ""}>
                      {v.tone ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-zinc-300">{v.accent ?? "—"}</td>
                    <td className="max-w-44 truncate px-3 py-2 text-zinc-400" title={v.aiVoiceModel ?? ""}>
                      {v.aiVoiceModel ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <Chip label={st.label} cls={st.cls} />
                    </td>
                    <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setViewingPrompt(v)}
                          title="ดู/ก๊อป Voice Direction brief"
                          className={`${btnGhost} inline-flex items-center gap-1`}
                        >
                          <Eye className="size-4" /> Prompt
                        </button>
                        <button type="button" onClick={() => openEdit(v)} className={btnGhost}>
                          แก้ไข
                        </button>
                        {v.status === "draft" && (
                          <button
                            type="button"
                            onClick={() => changeStatus(v, "approved")}
                            className="rounded-lg border border-emerald-700 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-900/40"
                          >
                            Approve
                          </button>
                        )}
                        {v.status !== "archived" && (
                          <button
                            type="button"
                            onClick={() => changeStatus(v, "archived")}
                            className={`${btnGhost} hover:text-red-300`}
                          >
                            Archive
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {data && data.items.length === 0 && (
        <div className="rounded-2xl border border-dashed border-zinc-800 p-12 text-center">
          <Music className="mx-auto size-8 text-zinc-600" />
          <p className="mt-2 text-sm text-zinc-400">ไม่พบ voice profile ตาม filter ที่เลือก</p>
          <p className="mt-1 text-xs text-zinc-500">
            สร้าง voice profile ให้ตัวละคร แล้วอัปโหลดเสียงตัวอย่างจาก ElevenLabs/บันทึกเองได้
          </p>
        </div>
      )}
      {data && <Pagination data={data} onPage={setPage} />}
      {viewingPrompt && (
        <PromptViewerModal
          title={`ดู/ก๊อป Voice Direction — ${viewingPrompt.character?.nameTh ?? "voice profile"}`}
          variants={buildVoicePromptVariants(viewingPrompt)}
          onClose={() => setViewingPrompt(null)}
        />
      )}
    </div>
  );
}

// ═══ Tab 3: Rights ══════════════════════════════════════════

const emptyRightForm = {
  entityType: "character",
  entityId: "",
  owner: "",
  commercialUsage: false,
  usageScope: "",
  territory: "",
  duration: "",
  exclusivity: "",
  restrictedCategories: "",
  disclosureRequired: false,
  riskLevel: "low",
};

function RightsTab({
  characters,
  prompts,
  syncUrl,
}: {
  characters: Character[];
  prompts: Prompt[];
  syncUrl: (filters: Record<string, string>) => void;
}) {
  const sp = useSearchParams();
  const [fEntityType, setFEntityType] = useState(sp.get("entityType") ?? "");
  const [fEntityId, setFEntityId] = useState(sp.get("entityId") ?? "");
  const [fLegal, setFLegal] = useState(sp.get("legalStatus") ?? "");
  const [fRisk, setFRisk] = useState(sp.get("riskLevel") ?? "");
  const [fCommercial, setFCommercial] = useState(sp.get("commercialUsage") ?? "");
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [page, setPage] = useState(parseInt(sp.get("page") ?? "1", 10) || 1);

  const [data, setData] = useState<Paged<RightItem> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<RightItem | null>(null);
  const [form, setForm] = useState({ ...emptyRightForm });
  const [saving, setSaving] = useState(false);

  const filters: Record<string, string> = {
    entityType: fEntityType,
    entityId: fEntityId,
    legalStatus: fLegal,
    riskLevel: fRisk,
    commercialUsage: fCommercial,
    q,
    page: page > 1 ? String(page) : "",
  };
  const filterKey = JSON.stringify(filters);
  const activeCount = [fEntityType, fEntityId, fLegal, fRisk, fCommercial, q].filter(Boolean).length;

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => v && params.set(k, v));
      const res = await api<Paged<RightItem>>(`/rights?${params.toString()}`);
      setData(res);
      setError(null);
    } catch (err) {
      setError(errMsg(err, "โหลด rights ไม่สำเร็จ"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  useEffect(() => {
    const t = setTimeout(() => {
      syncUrl(filters);
      load();
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  function clearFilters() {
    setFEntityType("");
    setFEntityId("");
    setFLegal("");
    setFRisk("");
    setFCommercial("");
    setQ("");
    setPage(1);
  }

  function openEdit(r: RightItem) {
    setEditing(r);
    setForm({
      entityType: r.entityType,
      entityId: r.entityId,
      owner: r.owner,
      commercialUsage: r.commercialUsage,
      usageScope: r.usageScope ?? "",
      territory: r.territory ?? "",
      duration: r.duration ?? "",
      exclusivity: r.exclusivity ?? "",
      restrictedCategories: r.restrictedCategories.join(", "),
      disclosureRequired: r.disclosureRequired,
      riskLevel: r.riskLevel,
    });
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const base = {
        owner: form.owner,
        commercialUsage: form.commercialUsage,
        usageScope: form.usageScope || undefined,
        territory: form.territory || undefined,
        duration: form.duration || undefined,
        exclusivity: form.exclusivity || undefined,
        restrictedCategories: splitComma(form.restrictedCategories),
        disclosureRequired: form.disclosureRequired,
        riskLevel: form.riskLevel,
      };
      if (editing) {
        await api<RightItem>(`/rights/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(base),
        });
      } else {
        if (!form.entityId) throw new Error("กรุณาระบุ entity");
        await api<RightItem>("/rights", {
          method: "POST",
          body: JSON.stringify({ ...base, entityType: form.entityType, entityId: form.entityId }),
        });
      }
      setShowForm(false);
      setEditing(null);
      setForm({ ...emptyRightForm });
      await load();
    } catch (err) {
      setError(errMsg(err, "บันทึกไม่สำเร็จ"));
    } finally {
      setSaving(false);
    }
  }

  async function transition(r: RightItem, next: string) {
    if (
      (next === "archived" || next === "expired") &&
      !window.confirm(`เปลี่ยน legal status เป็น "${LEGAL_STATUS_LABEL[next]?.label ?? next}" ?`)
    )
      return;
    try {
      await api<RightItem>(`/rights/${r.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ legalStatus: next }),
      });
      await load();
    } catch (err) {
      setError(errMsg(err, "เปลี่ยน legal status ไม่สำเร็จ"));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect
          value={fEntityType}
          onChange={(v) => {
            setFEntityType(v);
            setFEntityId("");
            setPage(1);
          }}
          options={[
            { value: "", label: "ทุก entity type" },
            ...RIGHT_ENTITY_TYPES.map((t) => ({ value: t, label: t })),
          ]}
          className="w-fit"
        />
        {fEntityType && (
          <EntityPicker
            entityType={fEntityType}
            value={fEntityId}
            onChange={(v) => {
              setFEntityId(v);
              setPage(1);
            }}
            characters={characters}
            prompts={prompts}
            allowEmpty
          />
        )}
        <FilterSelect
          value={fLegal}
          onChange={(v) => {
            setFLegal(v);
            setPage(1);
          }}
          options={[
            { value: "", label: "ทุก legal status (ไม่รวม archived)" },
            ...Object.entries(LEGAL_STATUS_LABEL).map(([k, v]) => ({ value: k, label: v.label })),
          ]}
          className="w-fit"
        />
        <FilterSelect
          value={fRisk}
          onChange={(v) => {
            setFRisk(v);
            setPage(1);
          }}
          options={[
            { value: "", label: "ทุกระดับความเสี่ยง" },
            { value: "low", label: "เสี่ยงต่ำ" },
            { value: "medium", label: "เสี่ยงกลาง" },
            { value: "high", label: "เสี่ยงสูง" },
          ]}
          className="w-fit"
        />
        <FilterSelect
          value={fCommercial}
          onChange={(v) => {
            setFCommercial(v);
            setPage(1);
          }}
          options={[
            { value: "", label: "เชิงพาณิชย์: ทั้งหมด" },
            { value: "true", label: "ใช้เชิงพาณิชย์ได้" },
            { value: "false", label: "ใช้เชิงพาณิชย์ไม่ได้" },
          ]}
          className="w-fit"
        />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder="ค้นหา owner..."
          className={`${filterCls} min-w-40 flex-1`}
        />
        <ClearFilters count={activeCount} onClear={clearFilters} />
        <button
          onClick={() => {
            setEditing(null);
            setForm({ ...emptyRightForm });
            setShowForm((v) => !v);
          }}
          className={btnPrimary}
        >
          + สร้าง Rights
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="space-y-3 rounded-2xl border border-amber-400/30 bg-zinc-900 p-6"
        >
          <p className="text-sm text-zinc-400">
            {editing
              ? `แก้ไข rights ของ ${entityRef(editing.entityType, editing.entityId, characters, prompts)}`
              : "สร้าง rights record ใหม่ (PRD §16) — เริ่มที่ legal status = draft"}
          </p>
          <div className="grid grid-cols-3 gap-3">
            <FilterSelect
              disabled={!!editing}
              value={form.entityType}
              onChange={(v) => setForm({ ...form, entityType: v, entityId: "" })}
              options={RIGHT_ENTITY_TYPES.map((t) => ({ value: t, label: t }))}
            />
            {editing ? (
              <input
                disabled
                value={entityRef(editing.entityType, editing.entityId, characters, prompts)}
                className={`${inputCls} opacity-60`}
              />
            ) : (
              <EntityPicker
                entityType={form.entityType}
                value={form.entityId}
                onChange={(v) => setForm({ ...form, entityId: v })}
                characters={characters}
                prompts={prompts}
                required
              />
            )}
            <input
              required
              value={form.owner}
              onChange={(e) => setForm({ ...form, owner: e.target.value })}
              placeholder="เจ้าของสิทธิ์ *"
              className={inputCls}
            />
            <input
              value={form.usageScope}
              onChange={(e) => setForm({ ...form, usageScope: e.target.value })}
              placeholder="ขอบเขตการใช้ เช่น online only"
              className={inputCls}
            />
            <input
              value={form.territory}
              onChange={(e) => setForm({ ...form, territory: e.target.value })}
              placeholder="พื้นที่ เช่น ไทย / worldwide"
              className={inputCls}
            />
            <input
              value={form.duration}
              onChange={(e) => setForm({ ...form, duration: e.target.value })}
              placeholder="ระยะเวลา เช่น 1 ปี"
              className={inputCls}
            />
            <input
              value={form.exclusivity}
              onChange={(e) => setForm({ ...form, exclusivity: e.target.value })}
              placeholder="Exclusivity เช่น non-exclusive"
              className={inputCls}
            />
            <FilterSelect
              value={form.riskLevel}
              onChange={(v) => setForm({ ...form, riskLevel: v })}
              options={[
                { value: "low", label: "เสี่ยงต่ำ" },
                { value: "medium", label: "เสี่ยงกลาง" },
                { value: "high", label: "เสี่ยงสูง" },
              ]}
            />
            <input
              value={form.restrictedCategories}
              onChange={(e) => setForm({ ...form, restrictedCategories: e.target.value })}
              placeholder="หมวดต้องห้าม คั่นด้วย , เช่น เหล้า, การพนัน"
              className={inputCls}
            />
          </div>
          <div className="flex gap-6 text-sm text-zinc-300">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.commercialUsage}
                onChange={(e) => setForm({ ...form, commercialUsage: e.target.checked })}
                className="accent-amber-400"
              />
              ใช้เชิงพาณิชย์ได้
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.disclosureRequired}
                onChange={(e) => setForm({ ...form, disclosureRequired: e.target.checked })}
                className="accent-amber-400"
              />
              ต้องเปิดเผยว่าเป็น AI (disclosure)
            </label>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className={btnPrimary}>
              {saving ? "กำลังบันทึก..." : editing ? "บันทึกการแก้ไข" : "สร้าง Rights"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setEditing(null);
              }}
              className={btnGhost}
            >
              ยกเลิก
            </button>
          </div>
        </form>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="overflow-hidden rounded-2xl border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-left text-zinc-400">
            <tr>
              <th className="px-4 py-3 font-medium">Entity</th>
              <th className="px-4 py-3 font-medium">Owner</th>
              <th className="px-4 py-3 font-medium">เชิงพาณิชย์</th>
              <th className="px-4 py-3 font-medium">ความเสี่ยง</th>
              <th className="px-4 py-3 font-medium">Legal status</th>
              <th className="px-4 py-3 font-medium">เปลี่ยน status</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {data?.items.map((r) => {
              const legal = LEGAL_STATUS_LABEL[r.legalStatus] ?? LEGAL_STATUS_LABEL.draft;
              const risk = RISK_LABEL[r.riskLevel] ?? RISK_LABEL.low;
              const nexts = LEGAL_TRANSITIONS[r.legalStatus] ?? [];
              return (
                <tr key={r.id} className="hover:bg-zinc-900/50">
                  <td className="px-4 py-3">
                    <span className="mr-2 rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                      {r.entityType}
                    </span>
                    {entityRef(r.entityType, r.entityId, characters, prompts)}
                  </td>
                  <td className="px-4 py-3">{r.owner}</td>
                  <td className="px-4 py-3">
                    {r.commercialUsage ? (
                      <span className="inline-flex items-center gap-1 text-emerald-300"><Check className="size-4" /> ได้</span>
                    ) : (
                      <span className="text-zinc-500">ไม่ได้</span>
                    )}
                    {r.disclosureRequired && (
                      <span className="ml-2 inline-flex items-center gap-1 text-xs text-amber-300" title="ต้องเปิดเผยว่าเป็น AI">
                        AI <TriangleAlert className="size-4" />
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Chip label={risk.label} cls={risk.cls} />
                  </td>
                  <td className="px-4 py-3">
                    <Chip label={legal.label} cls={legal.cls} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {nexts.map((t) => (
                        <button
                          key={t}
                          onClick={() => transition(r, t)}
                          title={
                            t === "commercial_approved"
                              ? "ต้องมีสิทธิ์ Approve ใน module rights"
                              : undefined
                          }
                          className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${
                            t === "commercial_approved"
                              ? "border-emerald-700 text-emerald-300 hover:bg-emerald-900/40"
                              : "border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                          }`}
                        >
                          <ArrowRight className="size-4" /> {LEGAL_STATUS_LABEL[t]?.label ?? t}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => openEdit(r)} className={btnGhost}>
                      แก้ไข
                    </button>
                  </td>
                </tr>
              );
            })}
            {data && data.items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-zinc-500">
                  ไม่พบ rights record ตาม filter ที่เลือก
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {data && <Pagination data={data} onPage={setPage} />}
    </div>
  );
}

// ═══ Tab 4: QC Reviews ══════════════════════════════════════

const emptyQcForm = {
  entityType: "character",
  entityId: "",
  category: "character_consistency",
  score: 0,
  comment: "",
};

function QcTab({
  characters,
  prompts,
  syncUrl,
}: {
  characters: Character[];
  prompts: Prompt[];
  syncUrl: (filters: Record<string, string>) => void;
}) {
  const sp = useSearchParams();
  const [fEntityType, setFEntityType] = useState(sp.get("entityType") ?? "");
  const [fEntityId, setFEntityId] = useState(sp.get("entityId") ?? "");
  const [fCategory, setFCategory] = useState(sp.get("category") ?? "");
  const [fScoreMin, setFScoreMin] = useState(sp.get("scoreMin") ?? "");
  const [fScoreMax, setFScoreMax] = useState(sp.get("scoreMax") ?? "");
  const [fDateFrom, setFDateFrom] = useState(sp.get("dateFrom") ?? "");
  const [fDateTo, setFDateTo] = useState(sp.get("dateTo") ?? "");
  const [page, setPage] = useState(parseInt(sp.get("page") ?? "1", 10) || 1);

  const [data, setData] = useState<Paged<QcReviewItem> | null>(null);
  const [summary, setSummary] = useState<QcSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyQcForm });
  const [saving, setSaving] = useState(false);

  const filters: Record<string, string> = {
    entityType: fEntityType,
    entityId: fEntityId,
    category: fCategory,
    scoreMin: fScoreMin,
    scoreMax: fScoreMax,
    dateFrom: fDateFrom,
    dateTo: fDateTo,
    page: page > 1 ? String(page) : "",
  };
  const filterKey = JSON.stringify(filters);
  const activeCount = [fEntityType, fEntityId, fCategory, fScoreMin, fScoreMax, fDateFrom, fDateTo].filter(
    Boolean,
  ).length;

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => v && params.set(k, v));
      const res = await api<Paged<QcReviewItem>>(`/qc-reviews?${params.toString()}`);
      setData(res);
      setError(null);
      if (fEntityType && fEntityId) {
        const s = await api<QcSummary>(
          `/qc-reviews/summary?entityType=${encodeURIComponent(fEntityType)}&entityId=${encodeURIComponent(fEntityId)}`,
        );
        setSummary(s);
      } else {
        setSummary(null);
      }
    } catch (err) {
      setError(errMsg(err, "โหลด QC reviews ไม่สำเร็จ"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  useEffect(() => {
    const t = setTimeout(() => {
      syncUrl(filters);
      load();
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  function clearFilters() {
    setFEntityType("");
    setFEntityId("");
    setFCategory("");
    setFScoreMin("");
    setFScoreMax("");
    setFDateFrom("");
    setFDateTo("");
    setPage(1);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (!form.entityId) throw new Error("กรุณาระบุ entity");
      if (!form.score) throw new Error("กรุณาให้คะแนน 1–5");
      await api<QcReviewItem>("/qc-reviews", {
        method: "POST",
        body: JSON.stringify({
          entityType: form.entityType,
          entityId: form.entityId,
          category: form.category,
          score: form.score,
          comment: form.comment || undefined,
        }),
      });
      setShowForm(false);
      setForm({ ...emptyQcForm });
      await load();
    } catch (err) {
      setError(errMsg(err, "บันทึก review ไม่สำเร็จ"));
    } finally {
      setSaving(false);
    }
  }

  const scoreOptions = [5, 4, 3, 2, 1];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect
          value={fEntityType}
          onChange={(v) => {
            setFEntityType(v);
            setFEntityId("");
            setPage(1);
          }}
          options={[
            { value: "", label: "ทุก entity type" },
            ...QC_ENTITY_TYPES.map((t) => ({ value: t, label: t })),
          ]}
          className="w-fit"
        />
        {fEntityType && (
          <EntityPicker
            entityType={fEntityType}
            value={fEntityId}
            onChange={(v) => {
              setFEntityId(v);
              setPage(1);
            }}
            characters={characters}
            prompts={prompts}
            allowEmpty
          />
        )}
        <FilterSelect
          value={fCategory}
          onChange={(v) => {
            setFCategory(v);
            setPage(1);
          }}
          options={[
            { value: "", label: "ทุกหมวด QC" },
            ...QC_CATEGORIES.map((c) => ({ value: c, label: QC_CATEGORY_LABEL[c] })),
          ]}
          className="w-fit"
        />
        <FilterSelect
          value={fScoreMin}
          onChange={(v) => {
            setFScoreMin(v);
            setPage(1);
          }}
          options={[
            { value: "", label: "คะแนนต่ำสุด" },
            ...[1, 2, 3, 4, 5].map((s) => ({ value: String(s), label: `≥ ${s}` })),
          ]}
          className="w-fit"
        />
        <FilterSelect
          value={fScoreMax}
          onChange={(v) => {
            setFScoreMax(v);
            setPage(1);
          }}
          options={[
            { value: "", label: "คะแนนสูงสุด" },
            ...[1, 2, 3, 4, 5].map((s) => ({ value: String(s), label: `≤ ${s}` })),
          ]}
          className="w-fit"
        />
        <input
          type="date"
          value={fDateFrom}
          onChange={(e) => {
            setFDateFrom(e.target.value);
            setPage(1);
          }}
          className={filterCls}
          title="ตั้งแต่วันที่"
        />
        <input
          type="date"
          value={fDateTo}
          onChange={(e) => {
            setFDateTo(e.target.value);
            setPage(1);
          }}
          className={filterCls}
          title="ถึงวันที่"
        />
        <ClearFilters count={activeCount} onClear={clearFilters} />
        <button
          onClick={() => {
            setForm({ ...emptyQcForm });
            setShowForm((v) => !v);
          }}
          className={btnPrimary}
        >
          + ตรวจ QC
        </button>
      </div>

      {/* summary card เมื่อเลือก entity เจาะจง */}
      {summary && fEntityType && fEntityId && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <p className="text-xs text-zinc-500">
                สรุป QC ของ {entityRef(fEntityType, fEntityId, characters, prompts)}
              </p>
              <p className="text-2xl font-bold text-amber-300">
                {summary.avgScore ?? "—"}
                <span className="ml-1 text-sm font-normal text-zinc-500">
                  / 5 · {summary.count} review
                </span>
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(summary.byCategory).map(([cat, avg]) => {
                const rounded = Math.round(avg);
                const sc = SCORE_LABEL[rounded] ?? SCORE_LABEL[3];
                return (
                  <span key={cat} className={`rounded-full px-2 py-1 text-xs ${sc.cls}`}>
                    {QC_CATEGORY_LABEL[cat] ?? cat}: {avg}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="space-y-3 rounded-2xl border border-amber-400/30 bg-zinc-900 p-6"
        >
          <p className="text-sm text-zinc-400">บันทึกผลตรวจ QC (PRD §10)</p>
          <div className="grid grid-cols-3 gap-3">
            <FilterSelect
              value={form.entityType}
              onChange={(v) => setForm({ ...form, entityType: v, entityId: "" })}
              options={QC_ENTITY_TYPES.map((t) => ({ value: t, label: t }))}
            />
            <EntityPicker
              entityType={form.entityType}
              value={form.entityId}
              onChange={(v) => setForm({ ...form, entityId: v })}
              characters={characters}
              prompts={prompts}
              required
            />
            <FilterSelect
              value={form.category}
              onChange={(v) => setForm({ ...form, category: v })}
              options={QC_CATEGORIES.map((c) => ({ value: c, label: QC_CATEGORY_LABEL[c] }))}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-zinc-400">คะแนน:</span>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setForm({ ...form, score: s })}
                  title={SCORE_LABEL[s].label}
                  className={`leading-none ${
                    form.score >= s ? "text-amber-400" : "text-zinc-700 hover:text-zinc-500"
                  }`}
                >
                  <Star className="size-6 fill-current" />
                </button>
              ))}
            </div>
            {form.score > 0 && (
              <Chip label={SCORE_LABEL[form.score].label} cls={SCORE_LABEL[form.score].cls} />
            )}
          </div>
          <textarea
            value={form.comment}
            onChange={(e) => setForm({ ...form, comment: e.target.value })}
            placeholder="Comment เช่น หน้าตรง identity ดี แต่แสงหลุดโทน"
            rows={2}
            className={`${inputCls} w-full`}
          />
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className={btnPrimary}>
              {saving ? "กำลังบันทึก..." : "บันทึกผลตรวจ"}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className={btnGhost}>
              ยกเลิก
            </button>
          </div>
        </form>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      {/* คำอธิบายความหมาย score */}
      <div className="flex flex-wrap gap-2">
        {scoreOptions.map((s) => (
          <Chip key={s} label={SCORE_LABEL[s].label} cls={SCORE_LABEL[s].cls} />
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-left text-zinc-400">
            <tr>
              <th className="px-4 py-3 font-medium">Entity</th>
              <th className="px-4 py-3 font-medium">หมวด QC</th>
              <th className="px-4 py-3 font-medium">คะแนน</th>
              <th className="px-4 py-3 font-medium">Comment</th>
              <th className="px-4 py-3 font-medium">ผู้ตรวจ</th>
              <th className="px-4 py-3 font-medium">วันที่</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {data?.items.map((r) => {
              const sc = SCORE_LABEL[r.score] ?? SCORE_LABEL[3];
              return (
                <tr key={r.id} className="hover:bg-zinc-900/50">
                  <td className="px-4 py-3">
                    <span className="mr-2 rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                      {r.entityType}
                    </span>
                    {entityRef(r.entityType, r.entityId, characters, prompts)}
                  </td>
                  <td className="px-4 py-3 text-zinc-300">
                    {QC_CATEGORY_LABEL[r.category] ?? r.category}
                  </td>
                  <td className="px-4 py-3">
                    <Chip label={sc.label} cls={sc.cls} />
                  </td>
                  <td className="max-w-64 truncate px-4 py-3 text-zinc-400" title={r.comment ?? ""}>
                    {r.comment ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-zinc-300">{r.reviewerName ?? "—"}</td>
                  <td className="px-4 py-3 text-xs text-zinc-500">{fmtDate(r.createdAt)}</td>
                </tr>
              );
            })}
            {data && data.items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-zinc-500">
                  ยังไม่มีผลตรวจ QC ตาม filter ที่เลือก
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {data && <Pagination data={data} onPage={setPage} />}
    </div>
  );
}

// ═══ Page shell ═════════════════════════════════════════════

function LibraryInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const initialTab = sp.get("tab");
  const [tab, setTab] = useState<TabKey>(
    TABS.some((t) => t.key === initialTab) ? (initialTab as TabKey) : "locations",
  );
  const [characters, setCharacters] = useState<Character[]>([]);
  const [prompts, setPrompts] = useState<Prompt[]>([]);

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    api<CharacterList>("/characters")
      .then((r) => setCharacters(r.items))
      .catch(() => setCharacters([]));
    api<PromptList>("/prompts")
      .then((r) => setPrompts(r.items))
      .catch(() => setPrompts([]));
  }, [router]);

  const syncUrl = useCallback(
    (tabKey: TabKey) => (filters: Record<string, string>) => {
      const params = new URLSearchParams();
      params.set("tab", tabKey);
      Object.entries(filters).forEach(([k, v]) => v && params.set(k, v));
      router.replace(`/library?${params.toString()}`, { scroll: false });
    },
    [router],
  );

  return (
    <AppShell title="Library — Location / Voice / Rights / QC">
      <div className="space-y-5">
        <div className="flex gap-1 rounded-xl border border-zinc-800 bg-zinc-900/60 p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setTab(t.key);
                router.replace(`/library?tab=${t.key}`, { scroll: false });
              }}
              className={`flex-1 rounded-lg px-4 py-2 text-sm ${
                tab === t.key
                  ? "bg-amber-400/10 font-semibold text-amber-300"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "locations" && <LocationsTab syncUrl={syncUrl("locations")} />}
        {tab === "voices" && <VoicesTab characters={characters} syncUrl={syncUrl("voices")} />}
        {tab === "rights" && (
          <RightsTab characters={characters} prompts={prompts} syncUrl={syncUrl("rights")} />
        )}
        {tab === "qc" && (
          <QcTab characters={characters} prompts={prompts} syncUrl={syncUrl("qc")} />
        )}
      </div>
    </AppShell>
  );
}

export default function LibraryPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-950" />}>
      <LibraryInner />
    </Suspense>
  );
}
