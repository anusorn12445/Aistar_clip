"use client";

import { useCallback, useEffect, useState } from "react";
import { Camera, Eye, Film, RefreshCw, Ruler, Target, Video } from "lucide-react";
import AppShell from "@/components/AppShell";
import ExternalCaptureModal from "@/components/ExternalCaptureModal";
import PromptViewerModal from "@/components/PromptViewerModal";
import { FilterSelect } from "@/components/ui/filter-select";
import { buildCameraPromptVariants } from "@/lib/promptBuilders";
import { mergeCaptureDraft, type LibraryCaptureDraft } from "@/lib/library-capture";
import {
  archiveCameraPreset,
  createCameraPreset,
  fetchCameraPresets,
  PRESET_STATUS_LABEL,
  updateCameraPreset,
  type CameraPreset,
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
  shotSize: "",
  angle: "",
  lens: "",
  focalLength: "",
  cameraMovement: "",
  movementSpeed: "",
  distance: "",
  focusTarget: "",
  depthOfField: "",
  stabilization: "",
  aspectRatio: "",
  safeArea: "",
  productVisibility: "",
  handVisibility: "",
  compatiblePackaging: [] as string[],
  promptTemplate: "",
  negativePrompt: "",
  status: "active",
};
type Form = typeof emptyForm;

function CameraCard({
  c,
  onEdit,
  onArchive,
  onViewPrompt,
}: {
  c: CameraPreset;
  onEdit: () => void;
  onArchive: () => void;
  onViewPrompt: () => void;
}) {
  const st = PRESET_STATUS_LABEL[c.status] ?? PRESET_STATUS_LABEL.active;
  return (
    <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 transition-colors hover:border-zinc-700">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium text-zinc-100">{c.name}</p>
          <p className="font-mono text-[11px] text-zinc-500">
            {c.displayCode}
            {c.key ? ` · ${c.key}` : ""}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${st.cls}`}>{st.label}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {c.shotSize && <span className="inline-flex items-center gap-1 rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-300"><Ruler className="size-4" /> {c.shotSize}</span>}
        {c.angle && <span className="inline-flex items-center gap-1 rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-300"><Camera className="size-4" /> {c.angle}</span>}
        {c.cameraMovement && <span className="inline-flex items-center gap-1 rounded-full bg-blue-900/50 px-2 py-0.5 text-[11px] text-blue-200"><Film className="size-4" /> {c.cameraMovement}</span>}
        {c.focusTarget && <span className="inline-flex items-center gap-1 rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-300"><Target className="size-4" /> {c.focusTarget}</span>}
        {c.productVisibility && <span className="rounded-full bg-emerald-900/50 px-2 py-0.5 text-[11px] text-emerald-200">product: {c.productVisibility}</span>}
      </div>
      {c.compatiblePackaging.length > 0 && (
        <p className="truncate text-xs text-zinc-500">แพ็กเกจ: {c.compatiblePackaging.join(", ")}</p>
      )}
      {c.promptTemplate && <p className="line-clamp-2 text-xs text-zinc-400">{c.promptTemplate}</p>}
      <div className="flex justify-end gap-1.5">
        <button type="button" onClick={onViewPrompt} className={`${btnGhost} inline-flex items-center gap-1`}>
          <Eye className="size-4" /> Prompt
        </button>
        <button type="button" onClick={onEdit} className={btnGhost}>
          แก้ไข
        </button>
        {c.status !== "archived" && (
          <button type="button" onClick={onArchive} className={`${btnGhost} hover:text-red-300`}>
            Archive
          </button>
        )}
      </div>
    </div>
  );
}

export default function CameraPresetsPage() {
  const [fShotSize, setFShotSize] = useState("");
  const [fAngle, setFAngle] = useState("");
  const [fMovement, setFMovement] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [q, setQ] = useState("");

  const [data, setData] = useState<Paged<CameraPreset> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CameraPreset | null>(null);
  const [form, setForm] = useState<Form>({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [showCapture, setShowCapture] = useState(false);
  // 👁️ ดู/ก๊อป Prompt ของ preset ที่เลือก (shared PromptViewerModal)
  const [viewingPrompt, setViewingPrompt] = useState<CameraPreset | null>(null);

  const filters: Record<string, string> = {
    shotSize: fShotSize,
    angle: fAngle,
    cameraMovement: fMovement,
    status: fStatus,
    q,
  };
  const filterKey = JSON.stringify(filters);

  const load = useCallback(async () => {
    try {
      setData(await fetchCameraPresets(filters));
      setError(null);
    } catch (err) {
      setError(errMsg(err, "โหลด camera library ไม่สำเร็จ"));
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

  function openEdit(c: CameraPreset) {
    setEditing(c);
    setForm({
      name: c.name,
      key: c.key ?? "",
      description: c.description ?? "",
      shotSize: c.shotSize ?? "",
      angle: c.angle ?? "",
      lens: c.lens ?? "",
      focalLength: c.focalLength ?? "",
      cameraMovement: c.cameraMovement ?? "",
      movementSpeed: c.movementSpeed ?? "",
      distance: c.distance ?? "",
      focusTarget: c.focusTarget ?? "",
      depthOfField: c.depthOfField ?? "",
      stabilization: c.stabilization ?? "",
      aspectRatio: c.aspectRatio ?? "",
      safeArea: c.safeArea ?? "",
      productVisibility: c.productVisibility ?? "",
      handVisibility: c.handVisibility ?? "",
      compatiblePackaging: c.compatiblePackaging,
      promptTemplate: c.promptTemplate ?? "",
      negativePrompt: c.negativePrompt ?? "",
      status: c.status,
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
        shotSize: form.shotSize || undefined,
        angle: form.angle || undefined,
        lens: form.lens || undefined,
        focalLength: form.focalLength || undefined,
        cameraMovement: form.cameraMovement || undefined,
        movementSpeed: form.movementSpeed || undefined,
        distance: form.distance || undefined,
        focusTarget: form.focusTarget || undefined,
        depthOfField: form.depthOfField || undefined,
        stabilization: form.stabilization || undefined,
        aspectRatio: form.aspectRatio || undefined,
        safeArea: form.safeArea || undefined,
        productVisibility: form.productVisibility || undefined,
        handVisibility: form.handVisibility || undefined,
        compatiblePackaging: form.compatiblePackaging,
        promptTemplate: form.promptTemplate || undefined,
        negativePrompt: form.negativePrompt || undefined,
        status: form.status,
      };
      if (editing) {
        await updateCameraPreset(editing.id, body);
      } else {
        await createCameraPreset(body);
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

  async function archive(c: CameraPreset) {
    if (!window.confirm(`archive มุมกล้อง "${c.name}" ?`)) return;
    try {
      await archiveCameraPreset(c.id);
      await load();
    } catch (err) {
      setError(errMsg(err, "archive ไม่สำเร็จ"));
    }
  }

  return (
    <AppShell title="Camera Presets">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อ / key / รหัส..." className={`${filterCls} min-w-48 flex-1`} />
          <input value={fShotSize} onChange={(e) => setFShotSize(e.target.value)} placeholder="shot size เช่น closeup" className={`${filterCls} w-40`} />
          <input value={fAngle} onChange={(e) => setFAngle(e.target.value)} placeholder="angle เช่น 45deg" className={`${filterCls} w-36`} />
          <input value={fMovement} onChange={(e) => setFMovement(e.target.value)} placeholder="movement เช่น orbit" className={`${filterCls} w-36`} />
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
            + เพิ่ม Camera
          </button>
          <button onClick={() => setShowCapture(true)} className={`${btnCapture} inline-flex items-center gap-1`}>
            <RefreshCw className="size-4" /> สร้างจากภายนอก
          </button>
        </div>

        {showCapture && (
          <ExternalCaptureModal
            targetType="camera_preset"
            title="Camera"
            onDraft={applyCaptureDraft}
            onClose={() => setShowCapture(false)}
          />
        )}

        {showForm && (
          <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl border border-amber-400/30 bg-zinc-900 p-6">
            <p className="text-sm text-zinc-400">{editing ? `แก้ไขมุมกล้อง: ${editing.name}` : "สร้างมุมกล้องใหม่"}</p>
            <div className="grid grid-cols-3 gap-3">
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ชื่อมุมกล้อง *" className={inputCls} />
              <input value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} placeholder="key (unique) เช่น macro" className={`${inputCls} font-mono`} />
              <FilterSelect
                value={form.status}
                onChange={(v) => setForm({ ...form, status: v })}
                options={[
                  { value: "active", label: "Active" },
                  { value: "archived", label: "Archived" },
                ]}
              />
            </div>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="คำอธิบาย" rows={2} className={`${inputCls} w-full`} />

            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">การจัดเฟรม</p>
            <div className="grid grid-cols-4 gap-3">
              <input value={form.shotSize} onChange={(e) => setForm({ ...form, shotSize: e.target.value })} placeholder="shot size" className={inputCls} />
              <input value={form.angle} onChange={(e) => setForm({ ...form, angle: e.target.value })} placeholder="angle" className={inputCls} />
              <input value={form.focusTarget} onChange={(e) => setForm({ ...form, focusTarget: e.target.value })} placeholder="focus target" className={inputCls} />
              <input value={form.aspectRatio} onChange={(e) => setForm({ ...form, aspectRatio: e.target.value })} placeholder="aspect ratio เช่น 9:16" className={inputCls} />
            </div>

            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">เลนส์ / การเคลื่อนกล้อง</p>
            <div className="grid grid-cols-4 gap-3">
              <input value={form.lens} onChange={(e) => setForm({ ...form, lens: e.target.value })} placeholder="lens" className={inputCls} />
              <input value={form.focalLength} onChange={(e) => setForm({ ...form, focalLength: e.target.value })} placeholder="focal length" className={inputCls} />
              <input value={form.cameraMovement} onChange={(e) => setForm({ ...form, cameraMovement: e.target.value })} placeholder="movement" className={inputCls} />
              <input value={form.movementSpeed} onChange={(e) => setForm({ ...form, movementSpeed: e.target.value })} placeholder="movement speed" className={inputCls} />
            </div>
            <div className="grid grid-cols-4 gap-3">
              <input value={form.distance} onChange={(e) => setForm({ ...form, distance: e.target.value })} placeholder="distance" className={inputCls} />
              <input value={form.depthOfField} onChange={(e) => setForm({ ...form, depthOfField: e.target.value })} placeholder="depth of field" className={inputCls} />
              <input value={form.stabilization} onChange={(e) => setForm({ ...form, stabilization: e.target.value })} placeholder="stabilization" className={inputCls} />
              <input value={form.safeArea} onChange={(e) => setForm({ ...form, safeArea: e.target.value })} placeholder="safe area" className={inputCls} />
            </div>

            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">การมองเห็น / ความเข้ากันได้</p>
            <div className="grid grid-cols-3 gap-3">
              <label className="space-y-1">
                <span className="text-xs text-zinc-500">product visibility</span>
                <FilterSelect
                  value={form.productVisibility}
                  onChange={(v) => setForm({ ...form, productVisibility: v })}
                  className="w-full"
                  options={[
                    { value: "", label: "— ไม่ระบุ —" },
                    { value: "required", label: "required" },
                    { value: "optional", label: "optional" },
                    { value: "hero", label: "hero" },
                  ]}
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-zinc-500">hand visibility</span>
                <FilterSelect
                  value={form.handVisibility}
                  onChange={(v) => setForm({ ...form, handVisibility: v })}
                  className="w-full"
                  options={[
                    { value: "", label: "— ไม่ระบุ —" },
                    { value: "required", label: "required" },
                    { value: "optional", label: "optional" },
                    { value: "hidden", label: "hidden" },
                  ]}
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-zinc-500">แพ็กเกจที่รองรับ (ว่าง = ทุกแพ็กเกจ)</span>
                <ChipInput values={form.compatiblePackaging} onChange={(v) => setForm({ ...form, compatiblePackaging: v })} placeholder="bottle, pump..." />
              </label>
            </div>

            <textarea value={form.promptTemplate} onChange={(e) => setForm({ ...form, promptTemplate: e.target.value })} placeholder="Prompt template" rows={2} className={`${inputCls} w-full font-mono`} />
            <textarea value={form.negativePrompt} onChange={(e) => setForm({ ...form, negativePrompt: e.target.value })} placeholder="Negative prompt (ถ้ามี)" rows={2} className={`${inputCls} w-full font-mono`} />

            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex gap-2">
              <button type="submit" disabled={saving} className={btnPrimary}>
                {saving ? "กำลังบันทึก..." : editing ? "บันทึกการแก้ไข" : "สร้าง Camera"}
              </button>
              <button type="button" onClick={() => { setShowForm(false); setEditing(null); }} className={btnGhost}>
                ปิด
              </button>
            </div>
          </form>
        )}

        {error && !showForm && <p className="text-sm text-red-400">{error}</p>}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {data?.items.map((c) => (
            <CameraCard
              key={c.id}
              c={c}
              onEdit={() => openEdit(c)}
              onArchive={() => archive(c)}
              onViewPrompt={() => setViewingPrompt(c)}
            />
          ))}
        </div>
        {viewingPrompt && (
          <PromptViewerModal
            title={`ดู/ก๊อป Prompt — ${viewingPrompt.name}`}
            variants={buildCameraPromptVariants(viewingPrompt)}
            onClose={() => setViewingPrompt(null)}
          />
        )}
        {data && data.items.length === 0 && (
          <div className="rounded-2xl border border-dashed border-zinc-800 p-12 text-center">
            <Video className="mx-auto size-8 text-zinc-600" />
            <p className="mt-2 text-sm text-zinc-400">ยังไม่มีมุมกล้องตาม filter ที่เลือก</p>
            <p className="mt-1 text-xs text-zinc-500">รัน seed เพื่อโหลด preset มาตรฐาน หรือกด &quot;+ เพิ่ม Camera&quot;</p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
