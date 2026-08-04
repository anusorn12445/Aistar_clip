"use client";

import { useCallback, useEffect, useState } from "react";
import { Droplet, Drama, Eye, Lightbulb, RefreshCw, Thermometer } from "lucide-react";
import AppShell from "@/components/AppShell";
import ExternalCaptureModal from "@/components/ExternalCaptureModal";
import PromptViewerModal from "@/components/PromptViewerModal";
import { FilterSelect } from "@/components/ui/filter-select";
import { buildLightingPromptVariants } from "@/lib/promptBuilders";
import { mergeCaptureDraft, type LibraryCaptureDraft } from "@/lib/library-capture";
import {
  archiveLightingPreset,
  createLightingPreset,
  fetchLightingPresets,
  PRESET_STATUS_LABEL,
  updateLightingPreset,
  type LightingPreset,
  type Paged,
} from "@/lib/interaction";

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
  description: "",
  keyLight: "",
  fillLight: "",
  backLight: "",
  colorTemperature: "",
  contrast: "",
  shadowLevel: "",
  highlightControl: "",
  reflectiveProductRule: "",
  transparentProductRule: "",
  skinToneCompatibility: [] as string[],
  backgroundCompatibility: [] as string[],
  mood: "",
  promptTemplate: "",
  negativePrompt: "",
  status: "active",
};
type Form = typeof emptyForm;

function LightingCard({
  l,
  onEdit,
  onArchive,
  onViewPrompt,
}: {
  l: LightingPreset;
  onEdit: () => void;
  onArchive: () => void;
  onViewPrompt: () => void;
}) {
  const st = PRESET_STATUS_LABEL[l.status] ?? PRESET_STATUS_LABEL.active;
  return (
    <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 transition-colors hover:border-zinc-700">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium text-zinc-100">{l.name}</p>
          <p className="font-mono text-[11px] text-zinc-500">
            {l.displayCode}
            {l.key ? ` · ${l.key}` : ""}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${st.cls}`}>{st.label}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {l.mood && <span className="inline-flex items-center gap-1 rounded-full bg-amber-900/50 px-2 py-0.5 text-[11px] text-amber-200"><Drama className="size-4" /> {l.mood}</span>}
        {l.colorTemperature && <span className="inline-flex items-center gap-1 rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-300"><Thermometer className="size-4" /> {l.colorTemperature}</span>}
        {l.contrast && <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-300">contrast: {l.contrast}</span>}
        {l.shadowLevel && <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-300">shadow: {l.shadowLevel}</span>}
      </div>
      {l.reflectiveProductRule && <p className="line-clamp-2 text-xs text-cyan-300/80">{l.reflectiveProductRule}</p>}
      {l.transparentProductRule && <p className="flex items-center gap-1 text-xs text-blue-300/80"><Droplet className="size-4 shrink-0" /> {l.transparentProductRule}</p>}
      {l.promptTemplate && <p className="line-clamp-2 text-xs text-zinc-400">{l.promptTemplate}</p>}
      <div className="flex justify-end gap-1.5">
        <button type="button" onClick={onViewPrompt} className={`${btnGhost} inline-flex items-center gap-1`}>
          <Eye className="size-4" /> Prompt
        </button>
        <button type="button" onClick={onEdit} className={btnGhost}>
          แก้ไข
        </button>
        {l.status !== "archived" && (
          <button type="button" onClick={onArchive} className={`${btnGhost} hover:text-red-300`}>
            Archive
          </button>
        )}
      </div>
    </div>
  );
}

export default function LightingPresetsPage() {
  const [fMood, setFMood] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [q, setQ] = useState("");

  const [data, setData] = useState<Paged<LightingPreset> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<LightingPreset | null>(null);
  const [form, setForm] = useState<Form>({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [showCapture, setShowCapture] = useState(false);
  // 👁️ ดู/ก๊อป Prompt ของ preset ที่เลือก (shared PromptViewerModal)
  const [viewingPrompt, setViewingPrompt] = useState<LightingPreset | null>(null);

  const filters: Record<string, string> = { mood: fMood, status: fStatus, q };
  const filterKey = JSON.stringify(filters);

  const load = useCallback(async () => {
    try {
      setData(await fetchLightingPresets(filters));
      setError(null);
    } catch (err) {
      setError(errMsg(err, "โหลด lighting library ไม่สำเร็จ"));
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
  function applyCaptureDraft(draft: LibraryCaptureDraft) {
    setEditing(null);
    setForm(mergeCaptureDraft(emptyForm, draft.fields));
    setShowCapture(false);
    setShowForm(true);
  }

  function openEdit(l: LightingPreset) {
    setEditing(l);
    setForm({
      name: l.name,
      key: l.key ?? "",
      description: l.description ?? "",
      keyLight: l.keyLight ?? "",
      fillLight: l.fillLight ?? "",
      backLight: l.backLight ?? "",
      colorTemperature: l.colorTemperature ?? "",
      contrast: l.contrast ?? "",
      shadowLevel: l.shadowLevel ?? "",
      highlightControl: l.highlightControl ?? "",
      reflectiveProductRule: l.reflectiveProductRule ?? "",
      transparentProductRule: l.transparentProductRule ?? "",
      skinToneCompatibility: l.skinToneCompatibility,
      backgroundCompatibility: l.backgroundCompatibility,
      mood: l.mood ?? "",
      promptTemplate: l.promptTemplate ?? "",
      negativePrompt: l.negativePrompt ?? "",
      status: l.status,
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
        description: form.description || undefined,
        keyLight: form.keyLight || undefined,
        fillLight: form.fillLight || undefined,
        backLight: form.backLight || undefined,
        colorTemperature: form.colorTemperature || undefined,
        contrast: form.contrast || undefined,
        shadowLevel: form.shadowLevel || undefined,
        highlightControl: form.highlightControl || undefined,
        reflectiveProductRule: form.reflectiveProductRule || undefined,
        transparentProductRule: form.transparentProductRule || undefined,
        skinToneCompatibility: form.skinToneCompatibility,
        backgroundCompatibility: form.backgroundCompatibility,
        mood: form.mood || undefined,
        promptTemplate: form.promptTemplate || undefined,
        negativePrompt: form.negativePrompt || undefined,
        status: form.status,
      };
      if (editing) {
        await updateLightingPreset(editing.id, body);
      } else {
        await createLightingPreset(body);
      }
      setShowForm(false);
      setEditing(null);
      await load();
    } catch (err) {
      setError(errMsg(err, "บันทึกไม่สำเร็จ"));
    } finally {
      setSaving(false);
    }
  }

  async function archive(l: LightingPreset) {
    if (!window.confirm(`archive แสง "${l.name}" ?`)) return;
    try {
      await archiveLightingPreset(l.id);
      await load();
    } catch (err) {
      setError(errMsg(err, "archive ไม่สำเร็จ"));
    }
  }

  return (
    <AppShell title="Lighting Presets">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อ / key / รหัส..." className={`${filterCls} min-w-48 flex-1`} />
          <input value={fMood} onChange={(e) => setFMood(e.target.value)} placeholder="mood เช่น luxury" className={`${filterCls} w-40`} />
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
            + เพิ่ม Lighting
          </button>
          <button onClick={() => setShowCapture(true)} className={`${btnCapture} inline-flex items-center gap-1`}>
            <RefreshCw className="size-4" /> สร้างจากภายนอก
          </button>
        </div>

        {showCapture && (
          <ExternalCaptureModal
            targetType="lighting_preset"
            title="Lighting"
            onDraft={applyCaptureDraft}
            onClose={() => setShowCapture(false)}
          />
        )}

        {showForm && (
          <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl border border-amber-400/30 bg-zinc-900 p-6">
            <p className="text-sm text-zinc-400">{editing ? `แก้ไขแสง: ${editing.name}` : "สร้างแสงใหม่"}</p>
            <div className="grid grid-cols-3 gap-3">
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ชื่อแสง *" className={inputCls} />
              <input value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} placeholder="key (unique) เช่น golden_hour" className={`${inputCls} font-mono`} />
              <input value={form.mood} onChange={(e) => setForm({ ...form, mood: e.target.value })} placeholder="mood เช่น warm/luxury" className={inputCls} />
            </div>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="คำอธิบาย" rows={2} className={`${inputCls} w-full`} />

            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Light rig</p>
            <div className="grid grid-cols-3 gap-3">
              <input value={form.keyLight} onChange={(e) => setForm({ ...form, keyLight: e.target.value })} placeholder="key light" className={inputCls} />
              <input value={form.fillLight} onChange={(e) => setForm({ ...form, fillLight: e.target.value })} placeholder="fill light" className={inputCls} />
              <input value={form.backLight} onChange={(e) => setForm({ ...form, backLight: e.target.value })} placeholder="back light" className={inputCls} />
            </div>
            <div className="grid grid-cols-4 gap-3">
              <input value={form.colorTemperature} onChange={(e) => setForm({ ...form, colorTemperature: e.target.value })} placeholder="color temp เช่น 5600K" className={inputCls} />
              <input value={form.contrast} onChange={(e) => setForm({ ...form, contrast: e.target.value })} placeholder="contrast" className={inputCls} />
              <input value={form.shadowLevel} onChange={(e) => setForm({ ...form, shadowLevel: e.target.value })} placeholder="shadow level" className={inputCls} />
              <input value={form.highlightControl} onChange={(e) => setForm({ ...form, highlightControl: e.target.value })} placeholder="highlight control" className={inputCls} />
            </div>

            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">กฎสินค้าพิเศษ</p>
            <textarea value={form.reflectiveProductRule} onChange={(e) => setForm({ ...form, reflectiveProductRule: e.target.value })} placeholder="กฎสำหรับสินค้าสะท้อนแสง (ขวดแก้ว/โลหะ)" rows={2} className={`${inputCls} w-full`} />
            <textarea value={form.transparentProductRule} onChange={(e) => setForm({ ...form, transparentProductRule: e.target.value })} placeholder="กฎสำหรับสินค้าโปร่งใส (เซรั่ม/น้ำ)" rows={2} className={`${inputCls} w-full`} />

            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">ความเข้ากันได้</p>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-xs text-zinc-500">skin tone ที่เข้ากัน</span>
                <ChipInput values={form.skinToneCompatibility} onChange={(v) => setForm({ ...form, skinToneCompatibility: v })} placeholder="fair, olive..." />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-zinc-500">พื้นหลังที่เข้ากัน</span>
                <ChipInput values={form.backgroundCompatibility} onChange={(v) => setForm({ ...form, backgroundCompatibility: v })} placeholder="white, home..." />
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
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex gap-2">
              <button type="submit" disabled={saving} className={btnPrimary}>
                {saving ? "กำลังบันทึก..." : editing ? "บันทึกการแก้ไข" : "สร้าง Lighting"}
              </button>
              <button type="button" onClick={() => { setShowForm(false); setEditing(null); }} className={btnGhost}>
                ปิด
              </button>
            </div>
          </form>
        )}

        {error && !showForm && <p className="text-sm text-red-400">{error}</p>}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {data?.items.map((l) => (
            <LightingCard
              key={l.id}
              l={l}
              onEdit={() => openEdit(l)}
              onArchive={() => archive(l)}
              onViewPrompt={() => setViewingPrompt(l)}
            />
          ))}
        </div>
        {viewingPrompt && (
          <PromptViewerModal
            title={`ดู/ก๊อป Prompt — ${viewingPrompt.name}`}
            variants={buildLightingPromptVariants(viewingPrompt)}
            onClose={() => setViewingPrompt(null)}
          />
        )}
        {data && data.items.length === 0 && (
          <div className="rounded-2xl border border-dashed border-zinc-800 p-12 text-center">
            <Lightbulb className="mx-auto size-8 text-zinc-600" />
            <p className="mt-2 text-sm text-zinc-400">ยังไม่มีแสงตาม filter ที่เลือก</p>
            <p className="mt-1 text-xs text-zinc-500">รัน seed เพื่อโหลด preset มาตรฐาน หรือกด &quot;+ เพิ่ม Lighting&quot;</p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
