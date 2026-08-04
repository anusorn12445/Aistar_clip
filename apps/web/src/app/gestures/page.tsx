"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Eye, Grab, Hand, RefreshCw, Timer } from "lucide-react";
import AppShell from "@/components/AppShell";
import ExternalCaptureModal from "@/components/ExternalCaptureModal";
import PromptViewerModal from "@/components/PromptViewerModal";
import { buildGesturePromptVariants } from "@/lib/promptBuilders";
import { api } from "@/lib/api";
import { uploadAsset } from "@/lib/assets";
import { mergeCaptureDraft, type LibraryCaptureDraft } from "@/lib/library-capture";
import {
  GESTURE_STATUS_LABEL,
  RISK_LABEL,
  type Gesture,
  type Paged,
  type ProductState,
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
        <span key={v} className="flex items-center gap-1 rounded-full bg-zinc-700 px-2 py-0.5 text-xs text-zinc-200">
          {v}
          <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} className="text-zinc-400 hover:text-red-300">
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
  key: "",
  category: "",
  description: "",
  naturalDurationSec: "",
  minDurationSec: "",
  maxDurationSec: "",
  minSpeedMultiplier: "",
  maxSpeedMultiplier: "",
  requiredHandCount: "",
  requiredProductState: "",
  resultingProductState: "",
  compatiblePackaging: [] as string[],
  compatibleMaterial: [] as string[],
  riskLevel: "low",
  promptTemplate: "",
  negativePrompt: "",
  status: "active",
};
type Form = typeof emptyForm;

function numOrUndef(s: string): number | undefined {
  if (s.trim() === "") return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function GestureCard({
  g,
  onEdit,
  onArchive,
  onViewPrompt,
}: {
  g: Gesture;
  onEdit: () => void;
  onArchive: () => void;
  onViewPrompt: () => void;
}) {
  const risk = RISK_LABEL[g.riskLevel] ?? RISK_LABEL.low;
  const st = GESTURE_STATUS_LABEL[g.status] ?? GESTURE_STATUS_LABEL.active;
  const dur = [g.minDurationSec, g.naturalDurationSec, g.maxDurationSec];
  const hasDur = dur.some((d) => d != null);
  return (
    <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 transition-colors hover:border-zinc-700">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium text-zinc-100">{g.name}</p>
          {g.key && <p className="font-mono text-[11px] text-zinc-500">{g.key}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-[11px] ${risk.cls}`}>{risk.label}</span>
          <span className={`rounded-full px-2 py-0.5 text-[11px] ${st.cls}`}>{st.label}</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {g.category && <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-300">{g.category}</span>}
        {g.requiredProductState && (
          <span className="rounded-full bg-blue-900/50 px-2 py-0.5 text-[11px] text-blue-200">
            need: {g.requiredProductState}
          </span>
        )}
        {g.resultingProductState && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-900/50 px-2 py-0.5 text-[11px] text-emerald-200">
            <ArrowRight className="size-4" /> {g.resultingProductState}
          </span>
        )}
        {g.requiredHandCount != null && (
          <span className="inline-flex items-center gap-1 rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-300">
            <Hand className="size-4" />×{g.requiredHandCount}
          </span>
        )}
        {hasDur && (
          <span className="inline-flex items-center gap-1 rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-300">
            <Timer className="size-4" /> {g.minDurationSec ?? "?"}/{g.naturalDurationSec ?? "?"}/{g.maxDurationSec ?? "?"}s
          </span>
        )}
      </div>
      {g.compatiblePackaging.length > 0 && (
        <p className="truncate text-xs text-zinc-500">แพ็กเกจ: {g.compatiblePackaging.join(", ")}</p>
      )}
      <div className="flex justify-end gap-1.5">
        <button type="button" onClick={onViewPrompt} className={`${btnGhost} inline-flex items-center gap-1`}>
          <Eye className="size-4" /> Prompt
        </button>
        <button type="button" onClick={onEdit} className={btnGhost}>
          แก้ไข
        </button>
        {g.status !== "archived" && (
          <button type="button" onClick={onArchive} className={`${btnGhost} hover:text-red-300`}>
            Archive
          </button>
        )}
      </div>
    </div>
  );
}

export default function GesturesPage() {
  const [fCategory, setFCategory] = useState("");
  const [fRisk, setFRisk] = useState("");
  const [fPackaging, setFPackaging] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [q, setQ] = useState("");

  const [data, setData] = useState<Paged<Gesture> | null>(null);
  const [states, setStates] = useState<ProductState[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Gesture | null>(null);
  const [form, setForm] = useState<Form>({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [showCapture, setShowCapture] = useState(false);
  // 👁️ ดู/ก๊อป Prompt ของ gesture ที่เลือก (shared PromptViewerModal)
  const [viewingPrompt, setViewingPrompt] = useState<Gesture | null>(null);

  const filters: Record<string, string> = {
    category: fCategory,
    riskLevel: fRisk,
    compatiblePackaging: fPackaging,
    status: fStatus,
    q,
  };
  const filterKey = JSON.stringify(filters);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => v && params.set(k, v));
      const res = await api<Paged<Gesture>>(`/gestures?${params.toString()}`);
      setData(res);
      setError(null);
    } catch (err) {
      setError(errMsg(err, "โหลด gesture library ไม่สำเร็จ"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 300);
    return () => clearTimeout(t);
  }, [load]);

  // ProductState list เพื่อ populate select required/resulting
  useEffect(() => {
    api<ProductState[]>("/product-states?status=active")
      .then(setStates)
      .catch(() => setStates([]));
  }, []);

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyForm });
    setShowForm(true);
  }

  // External Capture — เท draft ของ AI ลงฟอร์ม create เดิม (ผู้ใช้รีวิว/แก้ก่อนบันทึกปกติ)
  function applyCaptureDraft(draft: LibraryCaptureDraft) {
    setEditing(null);
    setForm(mergeCaptureDraft(emptyForm, draft.fields));
    setShowCapture(false);
    setShowForm(true);
  }

  function openEdit(g: Gesture) {
    setEditing(g);
    setForm({
      name: g.name,
      key: g.key ?? "",
      category: g.category ?? "",
      description: g.description ?? "",
      naturalDurationSec: g.naturalDurationSec?.toString() ?? "",
      minDurationSec: g.minDurationSec?.toString() ?? "",
      maxDurationSec: g.maxDurationSec?.toString() ?? "",
      minSpeedMultiplier: g.minSpeedMultiplier?.toString() ?? "",
      maxSpeedMultiplier: g.maxSpeedMultiplier?.toString() ?? "",
      requiredHandCount: g.requiredHandCount?.toString() ?? "",
      requiredProductState: g.requiredProductState ?? "",
      resultingProductState: g.resultingProductState ?? "",
      compatiblePackaging: g.compatiblePackaging,
      compatibleMaterial: g.compatibleMaterial,
      riskLevel: g.riskLevel,
      promptTemplate: g.promptTemplate ?? "",
      negativePrompt: g.negativePrompt ?? "",
      status: g.status,
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
        key: form.key || undefined,
        category: form.category || undefined,
        description: form.description || undefined,
        naturalDurationSec: numOrUndef(form.naturalDurationSec),
        minDurationSec: numOrUndef(form.minDurationSec),
        maxDurationSec: numOrUndef(form.maxDurationSec),
        minSpeedMultiplier: numOrUndef(form.minSpeedMultiplier),
        maxSpeedMultiplier: numOrUndef(form.maxSpeedMultiplier),
        requiredHandCount: numOrUndef(form.requiredHandCount),
        requiredProductState: form.requiredProductState || undefined,
        resultingProductState: form.resultingProductState || undefined,
        compatiblePackaging: form.compatiblePackaging,
        compatibleMaterial: form.compatibleMaterial,
        riskLevel: form.riskLevel,
        promptTemplate: form.promptTemplate || undefined,
        negativePrompt: form.negativePrompt || undefined,
        status: form.status,
      };
      if (editing) {
        const updated = await api<Gesture>(`/gestures/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        setEditing(updated);
      } else {
        const created = await api<Gesture>("/gestures", { method: "POST", body: JSON.stringify(body) });
        setEditing(created);
      }
      await load();
    } catch (err) {
      setError(errMsg(err, "บันทึกไม่สำเร็จ"));
    } finally {
      setSaving(false);
    }
  }

  async function handleFile(file: File) {
    if (!editing) return;
    setUploading(true);
    try {
      await uploadAsset(file, {
        assetType: "gesture_reference",
        entityType: "gesture",
        entityId: editing.id,
        linkRole: "reference",
      });
    } catch (err) {
      setError(errMsg(err, "อัปโหลดรูปไม่สำเร็จ"));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function archive(g: Gesture) {
    if (!window.confirm(`archive gesture "${g.name}" ?`)) return;
    try {
      await api(`/gestures/${g.id}/archive`, { method: "PATCH" });
      await load();
    } catch (err) {
      setError(errMsg(err, "archive ไม่สำเร็จ"));
    }
  }

  return (
    <AppShell title="Gesture Library">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหาชื่อ / key..."
            className={`${filterCls} min-w-48 flex-1`}
          />
          <input
            value={fCategory}
            onChange={(e) => setFCategory(e.target.value)}
            placeholder="หมวดท่า เช่น hold"
            className={`${filterCls} w-36`}
          />
          <FilterSelect
            value={fRisk}
            onChange={setFRisk}
            options={[
              { value: "", label: "ทุกระดับความเสี่ยง" },
              { value: "low", label: "เสี่ยงต่ำ" },
              { value: "medium", label: "เสี่ยงกลาง" },
              { value: "high", label: "เสี่ยงสูง" },
            ]}
          />
          <input
            value={fPackaging}
            onChange={(e) => setFPackaging(e.target.value)}
            placeholder="แพ็กเกจ เช่น bottle"
            className={`${filterCls} w-36`}
          />
          <FilterSelect
            value={fStatus}
            onChange={setFStatus}
            options={[
              { value: "", label: "ทุก status (ไม่รวม archived)" },
              { value: "active", label: "Active" },
              { value: "archived", label: "Archived" },
            ]}
          />
          <button onClick={openCreate} className={btnPrimary}>
            + เพิ่ม Gesture
          </button>
          <button onClick={() => setShowCapture(true)} className={`${btnCapture} inline-flex items-center gap-1`}>
            <RefreshCw className="size-4" /> สร้างจากภายนอก
          </button>
        </div>

        {showCapture && (
          <ExternalCaptureModal
            targetType="gesture"
            title="Gesture"
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
              {editing ? `แก้ไข gesture: ${editing.name}` : "สร้าง gesture ใหม่"}
            </p>
            <div className="grid grid-cols-3 gap-3">
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ชื่อท่า *" className={inputCls} />
              <input value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} placeholder="key (unique) เช่น hold_product" className={`${inputCls} font-mono`} />
              <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="หมวด เช่น hold/pour/apply" className={inputCls} />
            </div>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="คำอธิบายท่า" rows={2} className={`${inputCls} w-full`} />

            <div className="grid grid-cols-3 gap-3">
              <label className="space-y-1">
                <span className="text-xs text-zinc-500">ระยะเวลา min / natural / max (วินาที)</span>
                <div className="flex gap-2">
                  <input value={form.minDurationSec} onChange={(e) => setForm({ ...form, minDurationSec: e.target.value })} placeholder="min" type="number" step="0.1" className={`${inputCls} w-full`} />
                  <input value={form.naturalDurationSec} onChange={(e) => setForm({ ...form, naturalDurationSec: e.target.value })} placeholder="natural" type="number" step="0.1" className={`${inputCls} w-full`} />
                  <input value={form.maxDurationSec} onChange={(e) => setForm({ ...form, maxDurationSec: e.target.value })} placeholder="max" type="number" step="0.1" className={`${inputCls} w-full`} />
                </div>
              </label>
              <label className="space-y-1">
                <span className="text-xs text-zinc-500">ความเร็ว min / max (×)</span>
                <div className="flex gap-2">
                  <input value={form.minSpeedMultiplier} onChange={(e) => setForm({ ...form, minSpeedMultiplier: e.target.value })} placeholder="min" type="number" step="0.1" className={`${inputCls} w-full`} />
                  <input value={form.maxSpeedMultiplier} onChange={(e) => setForm({ ...form, maxSpeedMultiplier: e.target.value })} placeholder="max" type="number" step="0.1" className={`${inputCls} w-full`} />
                </div>
              </label>
              <label className="space-y-1">
                <span className="text-xs text-zinc-500">จำนวนมือที่ต้องใช้</span>
                <input value={form.requiredHandCount} onChange={(e) => setForm({ ...form, requiredHandCount: e.target.value })} placeholder="เช่น 1 หรือ 2" type="number" className={`${inputCls} w-full`} />
              </label>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <label className="space-y-1">
                <span className="text-xs text-zinc-500">ต้องการสถานะสินค้า (required)</span>
                <FilterSelect
                  value={form.requiredProductState}
                  onChange={(v) => setForm({ ...form, requiredProductState: v })}
                  className="w-full"
                  options={[
                    { value: "", label: "— ไม่ระบุ —" },
                    ...states.map((s) => ({ value: s.key, label: `${s.label} (${s.key})` })),
                  ]}
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-zinc-500">สถานะผลลัพธ์ (resulting)</span>
                <FilterSelect
                  value={form.resultingProductState}
                  onChange={(v) => setForm({ ...form, resultingProductState: v })}
                  className="w-full"
                  options={[
                    { value: "", label: "— ไม่ระบุ —" },
                    ...states.map((s) => ({ value: s.key, label: `${s.label} (${s.key})` })),
                  ]}
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-zinc-500">ระดับความเสี่ยง</span>
                <FilterSelect
                  value={form.riskLevel}
                  onChange={(v) => setForm({ ...form, riskLevel: v })}
                  className="w-full"
                  options={[
                    { value: "low", label: "เสี่ยงต่ำ" },
                    { value: "medium", label: "เสี่ยงกลาง" },
                    { value: "high", label: "เสี่ยงสูง" },
                  ]}
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-xs text-zinc-500">แพ็กเกจที่รองรับ</span>
                <ChipInput values={form.compatiblePackaging} onChange={(v) => setForm({ ...form, compatiblePackaging: v })} placeholder="bottle, tube..." />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-zinc-500">วัสดุที่รองรับ</span>
                <ChipInput values={form.compatibleMaterial} onChange={(v) => setForm({ ...form, compatibleMaterial: v })} placeholder="glass, plastic..." />
              </label>
            </div>

            <textarea value={form.promptTemplate} onChange={(e) => setForm({ ...form, promptTemplate: e.target.value })} placeholder="Prompt template" rows={2} className={`${inputCls} w-full font-mono`} />
            <textarea value={form.negativePrompt} onChange={(e) => setForm({ ...form, negativePrompt: e.target.value })} placeholder="Negative prompt (ถ้ามี)" rows={2} className={`${inputCls} w-full font-mono`} />

            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-500">สถานะ:</span>
              <FilterSelect
                value={form.status}
                onChange={(v) => setForm({ ...form, status: v })}
                options={[
                  { value: "active", label: "Active" },
                  { value: "archived", label: "Archived" },
                ]}
              />
              {editing && (
                <>
                  <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className={`${btnGhost} disabled:opacity-50`}>
                    {uploading ? "กำลังอัปโหลด..." : "อัปโหลดรูปอ้างอิง"}
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }} />
                </>
              )}
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex gap-2">
              <button type="submit" disabled={saving} className={btnPrimary}>
                {saving ? "กำลังบันทึก..." : editing ? "บันทึกการแก้ไข" : "สร้าง Gesture"}
              </button>
              <button type="button" onClick={() => { setShowForm(false); setEditing(null); }} className={btnGhost}>
                ปิด
              </button>
            </div>
          </form>
        )}

        {error && !showForm && <p className="text-sm text-red-400">{error}</p>}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {data?.items.map((g) => (
            <GestureCard
              key={g.id}
              g={g}
              onEdit={() => openEdit(g)}
              onArchive={() => archive(g)}
              onViewPrompt={() => setViewingPrompt(g)}
            />
          ))}
        </div>
        {viewingPrompt && (
          <PromptViewerModal
            title={`ดู/ก๊อป Prompt — ${viewingPrompt.name}`}
            variants={buildGesturePromptVariants(viewingPrompt)}
            onClose={() => setViewingPrompt(null)}
          />
        )}
        {data && data.items.length === 0 && (
          <div className="rounded-2xl border border-dashed border-zinc-800 p-12 text-center">
            <Grab className="mx-auto size-8 text-zinc-600" />
            <p className="mt-2 text-sm text-zinc-400">ยังไม่มี gesture ตาม filter ที่เลือก</p>
            <p className="mt-1 text-xs text-zinc-500">
              สร้างคลังท่าทางมือ-สินค้า พร้อมกฎสถานะสินค้าและ prompt template
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
