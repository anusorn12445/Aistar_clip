"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Baby, Check, Eye, Hand, RefreshCw, TriangleAlert } from "lucide-react";
import AppShell from "@/components/AppShell";
import CoverImage from "@/components/CoverImage";
import ExternalCaptureModal from "@/components/ExternalCaptureModal";
import PromptViewerModal from "@/components/PromptViewerModal";
import { buildHandPromptVariants } from "@/lib/promptBuilders";
import { mergeCaptureDraft, type LibraryCaptureDraft } from "@/lib/library-capture";
import { api } from "@/lib/api";
import { primeEntityThumb, useEntityThumb } from "@/lib/media";
import { uploadAsset, type Asset, type AssetList } from "@/lib/assets";
import {
  HAND_CATEGORIES,
  HAND_STATUS_LABEL,
  type HandProfile,
  type Paged,
} from "@/lib/interaction";
import { FilterSelect } from "@/components/ui/filter-select";

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

function errMsg(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

// ─── ChipInput: array editor (Enter/comma เพื่อเพิ่ม, × เพื่อลบ) ──
function ChipInput({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  function add() {
    const v = draft.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setDraft("");
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5">
      {values.map((v) => (
        <span
          key={v}
          className="flex items-center gap-1 rounded-full bg-zinc-700 px-2 py-0.5 text-xs text-zinc-200"
        >
          {v}
          <button
            type="button"
            onClick={() => onChange(values.filter((x) => x !== v))}
            className="text-zinc-400 hover:text-red-300"
          >
            ×
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
        placeholder={placeholder}
        className="min-w-24 flex-1 bg-transparent px-1 py-0.5 text-sm outline-none"
      />
    </div>
  );
}

const emptyForm = {
  name: "",
  category: "adult_female",
  gender: "",
  ageGroup: "",
  skinTone: "",
  handSize: "",
  fingerLength: "",
  nailLength: "",
  nailShape: "",
  nailColor: "",
  nailStyle: "",
  sleeveStyle: "",
  skinTexture: "",
  dominantHand: "",
  accessories: [] as string[],
  allowedGestures: [] as string[],
  restrictedGestures: [] as string[],
  productCategorySuitability: [] as string[],
  isChild: false,
  policyFlag: "",
  complianceReviewed: false,
  status: "draft",
};
type Form = typeof emptyForm;

function HandCard({
  hand,
  onEdit,
  onArchive,
  onViewPrompt,
}: {
  hand: HandProfile;
  onEdit: () => void;
  onArchive: () => void;
  onViewPrompt: () => void;
}) {
  const st = HAND_STATUS_LABEL[hand.status] ?? HAND_STATUS_LABEL.draft;
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/40 transition-colors hover:border-zinc-700">
      <button type="button" onClick={onEdit} className="block w-full text-left">
        <CoverImage
          assetId={hand.thumbAssetId ?? undefined}
          entityType="hand"
          entityId={hand.id}
          name={hand.name}
          aspect="aspect-video"
        >
          <span className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[11px] ${st.cls}`}>
            {st.label}
          </span>
          {hand.isChild && (
            <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-orange-500/90 px-2 py-0.5 text-[11px] font-medium text-orange-950">
              <Baby className="size-4" /> มือเด็ก
            </span>
          )}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-zinc-950/90 via-zinc-950/40 to-transparent p-3 pt-10">
            <p className="truncate text-sm font-semibold text-white">
              {hand.name}{" "}
              <span className="font-mono text-[11px] text-zinc-400">{hand.displayCode}</span>
            </p>
            <div className="mt-1 flex flex-wrap gap-1">
              <span className="rounded-full bg-zinc-950/70 px-2 py-0.5 text-[11px] text-zinc-200">
                {hand.category}
              </span>
              {hand.productCategorySuitability.slice(0, 2).map((s) => (
                <span
                  key={s}
                  className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[11px] text-amber-200"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        </CoverImage>
      </button>
      <div className="flex items-center justify-between gap-2 p-3">
        <span className="text-[11px] text-zinc-600">
          {hand.isChild && !hand.complianceReviewed ? "รอตรวจ compliance" : hand.skinTone || "—"}
        </span>
        <div className="flex gap-1.5">
          <button type="button" onClick={onViewPrompt} className={`${btnGhost} inline-flex items-center gap-1`}>
            <Eye className="size-4" /> Prompt
          </button>
          <button type="button" onClick={onEdit} className={btnGhost}>
            แก้ไข
          </button>
          {hand.status !== "archived" && (
            <button type="button" onClick={onArchive} className={`${btnGhost} hover:text-red-300`}>
              Archive
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// อัปโหลด/แสดงรูปอ้างอิงของ hand ในฟอร์มแก้ไข
function HandReferenceUpload({
  handId,
  name,
  onError,
}: {
  handId: string;
  name: string;
  onError: (m: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const thumb = useEntityThumb("hand", handId);

  const load = useCallback(async () => {
    try {
      const res = await api<AssetList>(
        `/assets?entityType=hand&entityId=${encodeURIComponent(handId)}`,
      );
      setAssets(res.items.filter((a) => a.mimeType.startsWith("image/") && !a.archivedAt));
    } catch {
      setAssets([]);
    }
  }, [handId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const hasPrimary = (assets ?? []).length > 0;
      const asset = await uploadAsset(file, {
        assetType: "hand_reference",
        entityType: "hand",
        entityId: handId,
        linkRole: hasPrimary ? "reference" : "primary_reference",
      });
      if (!hasPrimary) primeEntityThumb("hand", handId, asset.id);
      await load();
    } catch (err) {
      onError(errMsg(err, "อัปโหลดรูปไม่สำเร็จ"));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium text-zinc-400">
          รูปอ้างอิงมือ{assets && assets.length > 0 ? ` (${assets.length})` : ""}
        </p>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className={`${btnGhost} disabled:opacity-50`}
        >
          {uploading ? "กำลังอัปโหลด..." : "อัปโหลดรูป"}
        </button>
      </div>
      <div className="h-32 w-48 overflow-hidden rounded-lg border border-zinc-800">
        <CoverImage entityType="hand" entityId={handId} assetId={thumb} name={name} aspect="aspect-video" />
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

export default function HandsPage() {
  const [fCategory, setFCategory] = useState("");
  const [fChild, setFChild] = useState("");
  const [fSuit, setFSuit] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [q, setQ] = useState("");

  const [data, setData] = useState<Paged<HandProfile> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<HandProfile | null>(null);
  const [form, setForm] = useState<Form>({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [showCapture, setShowCapture] = useState(false);
  // 👁️ ดู/ก๊อป Prompt ของ hand ที่เลือก (shared PromptViewerModal)
  const [viewingPrompt, setViewingPrompt] = useState<HandProfile | null>(null);

  const filters: Record<string, string> = {
    category: fCategory,
    isChild: fChild,
    productCategorySuitability: fSuit,
    status: fStatus,
    q,
  };
  const filterKey = JSON.stringify(filters);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => v && params.set(k, v));
      const res = await api<Paged<HandProfile>>(`/hands?${params.toString()}`);
      setData(res);
      setError(null);
    } catch (err) {
      setError(errMsg(err, "โหลด hand library ไม่สำเร็จ"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 300);
    return () => clearTimeout(t);
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyForm });
    setShowForm(true);
  }

  // External Capture — เท draft ของ AI ลงฟอร์ม create เดิม (ผู้ใช้รีวิว/แก้ก่อนบันทึกปกติ)
  // hand: isChild จาก AI ติดมาด้วย — ฟอร์มโชว์ให้ compliance รีวิวก่อนบันทึกเสมอ (status เริ่ม draft)
  function applyCaptureDraft(draft: LibraryCaptureDraft) {
    setEditing(null);
    setForm(mergeCaptureDraft(emptyForm, draft.fields));
    setShowCapture(false);
    setShowForm(true);
  }

  function openEdit(h: HandProfile) {
    setEditing(h);
    setForm({
      name: h.name,
      category: h.category,
      gender: h.gender ?? "",
      ageGroup: h.ageGroup ?? "",
      skinTone: h.skinTone ?? "",
      handSize: h.handSize ?? "",
      fingerLength: h.fingerLength ?? "",
      nailLength: h.nailLength ?? "",
      nailShape: h.nailShape ?? "",
      nailColor: h.nailColor ?? "",
      nailStyle: h.nailStyle ?? "",
      sleeveStyle: h.sleeveStyle ?? "",
      skinTexture: h.skinTexture ?? "",
      dominantHand: h.dominantHand ?? "",
      accessories: h.accessories,
      allowedGestures: h.allowedGestures,
      restrictedGestures: h.restrictedGestures,
      productCategorySuitability: h.productCategorySuitability,
      isChild: h.isChild,
      policyFlag: h.policyFlag ?? "",
      complianceReviewed: h.complianceReviewed,
      status: h.status,
    });
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body = {
        name: form.name,
        category: form.category,
        gender: form.gender || undefined,
        ageGroup: form.ageGroup || undefined,
        skinTone: form.skinTone || undefined,
        handSize: form.handSize || undefined,
        fingerLength: form.fingerLength || undefined,
        nailLength: form.nailLength || undefined,
        nailShape: form.nailShape || undefined,
        nailColor: form.nailColor || undefined,
        nailStyle: form.nailStyle || undefined,
        sleeveStyle: form.sleeveStyle || undefined,
        skinTexture: form.skinTexture || undefined,
        dominantHand: form.dominantHand || undefined,
        accessories: form.accessories,
        allowedGestures: form.allowedGestures,
        restrictedGestures: form.restrictedGestures,
        productCategorySuitability: form.productCategorySuitability,
        isChild: form.isChild,
        policyFlag: form.policyFlag || undefined,
        complianceReviewed: form.complianceReviewed,
        status: form.status,
      };
      if (editing) {
        const updated = await api<HandProfile>(`/hands/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        setEditing(updated);
      } else {
        const created = await api<HandProfile>("/hands", {
          method: "POST",
          body: JSON.stringify(body),
        });
        setEditing(created); // เปิดฟอร์มแก้ไขต่อ เพื่ออัปโหลดรูปได้
      }
      await load();
    } catch (err) {
      setError(errMsg(err, "บันทึกไม่สำเร็จ"));
    } finally {
      setSaving(false);
    }
  }

  async function archive(h: HandProfile) {
    if (!window.confirm(`archive hand "${h.name}" ?`)) return;
    try {
      await api(`/hands/${h.id}/archive`, { method: "PATCH" });
      await load();
    } catch (err) {
      setError(errMsg(err, "archive ไม่สำเร็จ"));
    }
  }

  return (
    <AppShell title="Hand Library">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหาชื่อ / HAND-code..."
            className={`${filterCls} min-w-48 flex-1`}
          />
          <FilterSelect
            value={fCategory}
            onChange={setFCategory}
            className="min-w-40"
            options={[{ value: "", label: "ทุกประเภท" }, ...HAND_CATEGORIES.map((c) => ({ value: c, label: c }))]}
          />
          <FilterSelect
            value={fChild}
            onChange={setFChild}
            options={[
              { value: "", label: "มือทั้งหมด" },
              { value: "true", label: "เฉพาะมือเด็ก" },
              { value: "false", label: "ไม่รวมมือเด็ก" },
            ]}
          />
          <input
            value={fSuit}
            onChange={(e) => setFSuit(e.target.value)}
            placeholder="เหมาะกับหมวดสินค้า"
            className={`${filterCls} w-40`}
          />
          <FilterSelect
            value={fStatus}
            onChange={setFStatus}
            options={[
              { value: "", label: "ทุก status (ไม่รวม archived)" },
              { value: "draft", label: "Draft" },
              { value: "active", label: "Active" },
              { value: "archived", label: "Archived" },
            ]}
          />
          <button onClick={openCreate} className={btnPrimary}>
            + เพิ่ม Hand
          </button>
          <button onClick={() => setShowCapture(true)} className={`${btnCapture} inline-flex items-center gap-1`}>
            <RefreshCw className="size-4" /> สร้างจากภายนอก
          </button>
        </div>

        {showCapture && (
          <ExternalCaptureModal
            targetType="hand"
            title="Hand"
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
              {editing ? `แก้ไข hand: ${editing.name} (${editing.displayCode})` : "สร้าง hand profile ใหม่"}
            </p>
            <div className="grid grid-cols-3 gap-3">
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="ชื่อมือ *"
                className={inputCls}
              />
              <FilterSelect
                value={form.category}
                onChange={(v) => setForm({ ...form, category: v })}
                options={HAND_CATEGORIES.map((c) => ({ value: c, label: c }))}
              />
              <FilterSelect
                value={form.dominantHand}
                onChange={(v) => setForm({ ...form, dominantHand: v })}
                options={[
                  { value: "", label: "ถนัดมือ (ไม่ระบุ)" },
                  { value: "left", label: "ซ้าย" },
                  { value: "right", label: "ขวา" },
                ]}
              />
              <input value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} placeholder="เพศ" className={inputCls} />
              <input value={form.ageGroup} onChange={(e) => setForm({ ...form, ageGroup: e.target.value })} placeholder="ช่วงอายุ" className={inputCls} />
              <input value={form.skinTone} onChange={(e) => setForm({ ...form, skinTone: e.target.value })} placeholder="สีผิว" className={inputCls} />
              <input value={form.handSize} onChange={(e) => setForm({ ...form, handSize: e.target.value })} placeholder="ขนาดมือ" className={inputCls} />
              <input value={form.fingerLength} onChange={(e) => setForm({ ...form, fingerLength: e.target.value })} placeholder="ความยาวนิ้ว" className={inputCls} />
              <input value={form.skinTexture} onChange={(e) => setForm({ ...form, skinTexture: e.target.value })} placeholder="ผิวสัมผัส" className={inputCls} />
              <input value={form.nailLength} onChange={(e) => setForm({ ...form, nailLength: e.target.value })} placeholder="ความยาวเล็บ" className={inputCls} />
              <input value={form.nailShape} onChange={(e) => setForm({ ...form, nailShape: e.target.value })} placeholder="ทรงเล็บ" className={inputCls} />
              <input value={form.nailColor} onChange={(e) => setForm({ ...form, nailColor: e.target.value })} placeholder="สีเล็บ" className={inputCls} />
              <input value={form.nailStyle} onChange={(e) => setForm({ ...form, nailStyle: e.target.value })} placeholder="สไตล์เล็บ" className={inputCls} />
              <input value={form.sleeveStyle} onChange={(e) => setForm({ ...form, sleeveStyle: e.target.value })} placeholder="สไตล์แขนเสื้อ" className={inputCls} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-xs text-zinc-500">เครื่องประดับ</span>
                <ChipInput values={form.accessories} onChange={(v) => setForm({ ...form, accessories: v })} placeholder="แหวน, นาฬิกา..." />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-zinc-500">เหมาะกับหมวดสินค้า</span>
                <ChipInput
                  values={form.productCategorySuitability}
                  onChange={(v) => setForm({ ...form, productCategorySuitability: v })}
                  placeholder="beauty, food..."
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-zinc-500">ท่าที่อนุญาต (gesture key)</span>
                <ChipInput values={form.allowedGestures} onChange={(v) => setForm({ ...form, allowedGestures: v })} placeholder="hold_product..." />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-zinc-500">ท่าที่ห้าม (gesture key)</span>
                <ChipInput values={form.restrictedGestures} onChange={(v) => setForm({ ...form, restrictedGestures: v })} placeholder="pour..." />
              </label>
            </div>

            {/* ── Child compliance panel ── */}
            <div
              className={`space-y-3 rounded-xl border p-4 ${
                form.isChild ? "border-orange-500/50 bg-orange-950/20" : "border-zinc-800 bg-zinc-950/40"
              }`}
            >
              <label className="flex items-center gap-2 text-sm text-zinc-200">
                <input
                  type="checkbox"
                  checked={form.isChild}
                  onChange={(e) => setForm({ ...form, isChild: e.target.checked })}
                  className="accent-orange-400"
                />
                <Baby className="size-4" /> มือเด็ก (isChild) — ต้องมี compliance ตามนโยบาย
              </label>
              {form.isChild && (
                <>
                  <input
                    value={form.policyFlag}
                    onChange={(e) => setForm({ ...form, policyFlag: e.target.value })}
                    placeholder="policyFlag * เช่น parental_consent / เหตุผลการใช้งานมือเด็ก"
                    className={`${inputCls} w-full`}
                  />
                  <label className="flex items-center gap-2 text-sm text-zinc-200">
                    <input
                      type="checkbox"
                      checked={form.complianceReviewed}
                      onChange={(e) => setForm({ ...form, complianceReviewed: e.target.checked })}
                      className="accent-emerald-400"
                    />
                    ผ่านการตรวจสอบ compliance แล้ว (complianceReviewed)
                  </label>
                  <p className="flex items-start gap-1 text-xs text-orange-300">
                    <TriangleAlert className="size-4 shrink-0" />
                    <span>
                      มือเด็กต้องระบุ policyFlag และต้อง complianceReviewed ={" "}
                      <Check className="inline size-4" /> ก่อนจึงตั้งสถานะเป็น Active ได้
                    </span>
                  </p>
                </>
              )}
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-500">สถานะ:</span>
              <FilterSelect
                value={form.status}
                onChange={(v) => setForm({ ...form, status: v })}
                options={[
                  { value: "draft", label: "Draft" },
                  { value: "active", label: "Active" },
                  { value: "archived", label: "Archived" },
                ]}
              />
            </div>

            {editing && (
              <HandReferenceUpload handId={editing.id} name={editing.name} onError={setError} />
            )}

            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex gap-2">
              <button type="submit" disabled={saving} className={btnPrimary}>
                {saving ? "กำลังบันทึก..." : editing ? "บันทึกการแก้ไข" : "สร้าง Hand"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditing(null);
                }}
                className={btnGhost}
              >
                ปิด
              </button>
            </div>
          </form>
        )}

        {error && !showForm && <p className="text-sm text-red-400">{error}</p>}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data?.items.map((h) => (
            <HandCard
              key={h.id}
              hand={h}
              onEdit={() => openEdit(h)}
              onArchive={() => archive(h)}
              onViewPrompt={() => setViewingPrompt(h)}
            />
          ))}
        </div>
        {viewingPrompt && (
          <PromptViewerModal
            title={`ดู/ก๊อป Prompt — ${viewingPrompt.name}`}
            variants={buildHandPromptVariants(viewingPrompt)}
            onClose={() => setViewingPrompt(null)}
          />
        )}
        {data && data.items.length === 0 && (
          <div className="rounded-2xl border border-dashed border-zinc-800 p-12 text-center">
            <Hand className="mx-auto size-8 text-zinc-600" />
            <p className="mt-2 text-sm text-zinc-400">ยังไม่มี hand profile ตาม filter ที่เลือก</p>
            <p className="mt-1 text-xs text-zinc-500">
              สร้างคลังมือที่ human curate ไว้ใช้ซ้ำในงาน product interaction
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
