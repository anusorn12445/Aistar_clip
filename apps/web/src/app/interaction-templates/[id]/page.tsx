"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  CircleCheck,
  ClipboardList,
  Lightbulb,
  Package,
  TriangleAlert,
  Video,
  X,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import { FilterSelect } from "@/components/ui/filter-select";
import { api } from "@/lib/api";
import {
  archiveTemplate,
  cloneTemplate,
  fetchAllCameras,
  fetchAllGestures,
  fetchAllHands,
  fetchAllLightings,
  fetchPromptPackage,
  fetchTemplate,
  saveTemplateSteps,
  SECTION_LABEL,
  TEMPLATE_SECTIONS,
  TEMPLATE_STATUS_LABEL,
  validateTemplate,
  type CameraPreset,
  type Gesture,
  type HandProfile,
  type InteractionTemplate,
  type LightingPreset,
  type PromptPackage,
  type TemplateStepInput,
  type TemplateValidateResult,
} from "@/lib/interaction";

const inputCls =
  "rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none focus:border-amber-400";
const btnPrimary =
  "rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50";
const btnGhost =
  "rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50";

function errMsg(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

function numOrUndef(s: string): number | undefined {
  if (s.trim() === "") return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

// ── header form (meta ของเทมเพลต) ──
const emptyMeta = {
  name: "",
  description: "",
  productCategory: "",
  packagingType: "",
  materialType: "",
  platform: "",
  aspectRatio: "",
  storyboardType: "",
  targetDurationSec: "",
  defaultHandId: "",
  defaultCameraId: "",
  defaultLightingId: "",
  status: "draft",
  version: "v1",
};
type MetaForm = typeof emptyMeta;

// ── step row (editor local state — save = PUT replace-set ทั้งชุด) ──
type StepRow = {
  section: string;
  gestureId: string;
  handId: string;
  cameraId: string;
  lightingId: string;
  cameraNote: string;
  lightingNote: string;
  durationSec: string;
  required: boolean;
  note: string;
};

const emptyStep: StepRow = {
  section: "interaction",
  gestureId: "",
  handId: "",
  cameraId: "",
  lightingId: "",
  cameraNote: "",
  lightingNote: "",
  durationSec: "",
  required: true,
  note: "",
};

function CopyButton({ text, label = "copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className={`${btnGhost} inline-flex items-center gap-1`}
    >
      {copied ? (
        <>
          <Check className="size-4" /> copied
        </>
      ) : (
        <>
          <ClipboardList className="size-4" /> {label}
        </>
      )}
    </button>
  );
}

export default function InteractionTemplateDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();

  const [template, setTemplate] = useState<InteractionTemplate | null>(null);
  const [gestures, setGestures] = useState<Gesture[]>([]);
  const [hands, setHands] = useState<HandProfile[]>([]);
  const [cameras, setCameras] = useState<CameraPreset[]>([]);
  const [lightings, setLightings] = useState<LightingPreset[]>([]);
  const [meta, setMeta] = useState<MetaForm>({ ...emptyMeta });
  const [rows, setRows] = useState<StepRow[]>([]);
  const [dirtySteps, setDirtySteps] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [stepWarnings, setStepWarnings] = useState<string[]>([]);
  const [validation, setValidation] = useState<TemplateValidateResult | null>(null);
  const [validating, setValidating] = useState(false);
  const [pkg, setPkg] = useState<PromptPackage | null>(null);
  const [pkgOpen, setPkgOpen] = useState(false);

  const gestureById = new Map(gestures.map((g) => [g.id, g]));

  const load = useCallback(async () => {
    try {
      const t = await fetchTemplate(id);
      setTemplate(t);
      setMeta({
        name: t.name,
        description: t.description ?? "",
        productCategory: t.productCategory ?? "",
        packagingType: t.packagingType ?? "",
        materialType: t.materialType ?? "",
        platform: t.platform ?? "",
        aspectRatio: t.aspectRatio ?? "",
        storyboardType: t.storyboardType ?? "",
        targetDurationSec: t.targetDurationSec?.toString() ?? "",
        defaultHandId: t.defaultHandId ?? "",
        defaultCameraId: t.defaultCameraId ?? "",
        defaultLightingId: t.defaultLightingId ?? "",
        status: t.status,
        version: t.version,
      });
      setRows(
        (t.steps ?? []).map((s) => ({
          section: s.section,
          gestureId: s.gestureId ?? "",
          handId: s.handId ?? "",
          cameraId: s.cameraId ?? "",
          lightingId: s.lightingId ?? "",
          cameraNote: s.cameraNote ?? "",
          lightingNote: s.lightingNote ?? "",
          durationSec: s.durationSec?.toString() ?? "",
          required: s.required,
          note: s.note ?? "",
        })),
      );
      setDirtySteps(false);
      setError(null);
    } catch (err) {
      setError(errMsg(err, "โหลดเทมเพลตไม่สำเร็จ"));
    }
  }, [id]);

  useEffect(() => {
    void load();
    fetchAllGestures().then(setGestures).catch(() => setGestures([]));
    fetchAllHands().then(setHands).catch(() => setHands([]));
    fetchAllCameras().then(setCameras).catch(() => setCameras([]));
    fetchAllLightings().then(setLightings).catch(() => setLightings([]));
  }, [load]);

  // ── meta save (PATCH) ──
  async function saveMeta(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api<InteractionTemplate>(`/interaction-templates/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: meta.name,
          description: meta.description || undefined,
          productCategory: meta.productCategory || undefined,
          packagingType: meta.packagingType || undefined,
          materialType: meta.materialType || undefined,
          platform: meta.platform || undefined,
          aspectRatio: meta.aspectRatio || undefined,
          storyboardType: meta.storyboardType || undefined,
          targetDurationSec: numOrUndef(meta.targetDurationSec),
          defaultHandId: meta.defaultHandId || null,
          defaultCameraId: meta.defaultCameraId || null,
          defaultLightingId: meta.defaultLightingId || null,
          status: meta.status,
          version: meta.version || undefined,
        }),
      });
      await load();
    } catch (err) {
      setError(errMsg(err, "บันทึกไม่สำเร็จ"));
    } finally {
      setSaving(false);
    }
  }

  // ── step editor ──
  function patchRow(index: number, patch: Partial<StepRow>) {
    setRows((rs) => rs.map((r, i) => (i === index ? { ...r, ...patch } : r)));
    setDirtySteps(true);
    setValidation(null);
  }

  function moveRow(index: number, dir: -1 | 1) {
    setRows((rs) => {
      const next = [...rs];
      const j = index + dir;
      if (j < 0 || j >= next.length) return rs;
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
    setDirtySteps(true);
    setValidation(null);
  }

  function removeRow(index: number) {
    setRows((rs) => rs.filter((_, i) => i !== index));
    setDirtySteps(true);
    setValidation(null);
  }

  function addRow() {
    setRows((rs) => [...rs, { ...emptyStep }]);
    setDirtySteps(true);
    setValidation(null);
  }

  async function saveSteps() {
    setSaving(true);
    setError(null);
    setStepWarnings([]);
    try {
      const steps: TemplateStepInput[] = rows.map((r) => ({
        section: r.section,
        gestureId: r.gestureId || undefined,
        handId: r.handId || undefined,
        cameraId: r.cameraId || undefined,
        lightingId: r.lightingId || undefined,
        cameraNote: r.cameraNote || undefined,
        lightingNote: r.lightingNote || undefined,
        durationSec: numOrUndef(r.durationSec),
        required: r.required,
        note: r.note || undefined,
      }));
      const res = await saveTemplateSteps(id, steps);
      setStepWarnings(res.warnings ?? []);
      await load();
    } catch (err) {
      setError(errMsg(err, "บันทึก steps ไม่สำเร็จ"));
    } finally {
      setSaving(false);
    }
  }

  // ── ตรวจสูตร ──
  async function runValidate() {
    setValidating(true);
    try {
      setValidation(await validateTemplate(id));
    } catch (err) {
      setError(errMsg(err, "ตรวจสูตรไม่สำเร็จ"));
    } finally {
      setValidating(false);
    }
  }

  // ── prompt package ──
  async function openPackage() {
    try {
      setPkg(await fetchPromptPackage(id));
      setPkgOpen(true);
    } catch (err) {
      setError(errMsg(err, "โหลด prompt package ไม่สำเร็จ"));
    }
  }

  async function handleClone() {
    try {
      const copy = await cloneTemplate(id);
      router.push(`/interaction-templates/${copy.id}`);
    } catch (err) {
      setError(errMsg(err, "clone ไม่สำเร็จ"));
    }
  }

  async function handleArchive() {
    if (!template || !window.confirm(`archive เทมเพลต "${template.name}" ?`)) return;
    try {
      await archiveTemplate(id);
      router.push("/interaction-templates");
    } catch (err) {
      setError(errMsg(err, "archive ไม่สำเร็จ"));
    }
  }

  const st = TEMPLATE_STATUS_LABEL[template?.status ?? "draft"] ?? TEMPLATE_STATUS_LABEL.draft;
  const totalSec = rows.reduce((sum, r) => {
    const g = r.gestureId ? gestureById.get(r.gestureId) : undefined;
    return sum + (numOrUndef(r.durationSec) ?? g?.naturalDurationSec ?? 0);
  }, 0);

  return (
    <AppShell title={template ? template.name : "Interaction Template"}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/interaction-templates" className={`${btnGhost} inline-flex items-center gap-1`}>
            <ArrowLeft className="size-4" /> กลับรายการ
          </Link>
          {template && (
            <>
              <span className="font-mono text-xs text-zinc-500">
                {template.displayCode} · {template.version}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] ${st.cls}`}>{st.label}</span>
            </>
          )}
          <span className="flex-1" />
          <button type="button" onClick={() => void runValidate()} disabled={validating || dirtySteps} className={btnGhost} title={dirtySteps ? "บันทึก steps ก่อนตรวจ" : undefined}>
            {validating ? "กำลังตรวจ..." : "ตรวจสูตร"}
          </button>
          <button type="button" onClick={() => void openPackage()} disabled={dirtySteps} className={`${btnGhost} inline-flex items-center gap-1`} title={dirtySteps ? "บันทึก steps ก่อน" : undefined}>
            <Package className="size-4" /> Prompt Package
          </button>
          <button type="button" onClick={() => void handleClone()} className={btnGhost}>
            Clone
          </button>
          {template?.status !== "archived" && (
            <button type="button" onClick={() => void handleArchive()} className={`${btnGhost} hover:text-red-300`}>
              Archive
            </button>
          )}
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        {/* ── ผลตรวจสูตร ── */}
        {validation && (
          <div
            className={`space-y-1.5 rounded-2xl border p-4 ${
              validation.ok ? "border-emerald-700/50 bg-emerald-950/30" : "border-red-700/50 bg-red-950/30"
            }`}
          >
            <p className="flex items-center gap-1 text-sm font-medium">
              {validation.ok ? (
                <>
                  <CircleCheck className="size-4" /> สูตรผ่านการตรวจ
                </>
              ) : (
                <>
                  <X className="size-4" /> สูตรยังมีข้อผิดพลาด
                </>
              )}
            </p>
            {validation.errors.map((e, i) => (
              <p key={`e${i}`} className="text-sm text-red-300">
                • {e}
              </p>
            ))}
            {validation.warnings.map((w, i) => (
              <p key={`w${i}`} className="flex items-center gap-1 text-sm text-amber-300">
                <TriangleAlert className="size-4 shrink-0" /> {w}
              </p>
            ))}
          </div>
        )}

        {/* ── header / meta ── */}
        <form onSubmit={saveMeta} className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">ข้อมูลเทมเพลต</p>
          <div className="grid grid-cols-3 gap-3">
            <input required value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} placeholder="ชื่อเทมเพลต *" className={`${inputCls} col-span-2`} />
            <input value={meta.version} onChange={(e) => setMeta({ ...meta, version: e.target.value })} placeholder="version เช่น v1" className={inputCls} />
          </div>
          <textarea value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} placeholder="คำอธิบายสูตร" rows={2} className={`${inputCls} w-full`} />
          <div className="grid grid-cols-4 gap-3">
            <input value={meta.packagingType} onChange={(e) => setMeta({ ...meta, packagingType: e.target.value })} placeholder="แพ็กเกจ เช่น bottle" className={inputCls} />
            <input value={meta.materialType} onChange={(e) => setMeta({ ...meta, materialType: e.target.value })} placeholder="วัสดุ เช่น serum" className={inputCls} />
            <input value={meta.productCategory} onChange={(e) => setMeta({ ...meta, productCategory: e.target.value })} placeholder="หมวดสินค้า เช่น beauty" className={inputCls} />
            <input value={meta.storyboardType} onChange={(e) => setMeta({ ...meta, storyboardType: e.target.value })} placeholder="ชนิดคลิป เช่น how_to_use" className={inputCls} />
          </div>
          <div className="grid grid-cols-4 gap-3">
            <input value={meta.platform} onChange={(e) => setMeta({ ...meta, platform: e.target.value })} placeholder="platform เช่น tiktok" className={inputCls} />
            <input value={meta.aspectRatio} onChange={(e) => setMeta({ ...meta, aspectRatio: e.target.value })} placeholder="อัตราส่วน เช่น 9:16" className={inputCls} />
            <input value={meta.targetDurationSec} onChange={(e) => setMeta({ ...meta, targetDurationSec: e.target.value })} placeholder="ความยาวเป้าหมาย (วิ)" type="number" step="0.5" className={inputCls} />
            <FilterSelect
              value={meta.status}
              onChange={(v) => setMeta({ ...meta, status: v })}
              options={[
                { value: "draft", label: "Draft" },
                { value: "active", label: "Active" },
              ]}
            />
          </div>
          <label className="block space-y-1">
            <span className="text-xs text-zinc-500">มือ default ทั้งเทมเพลต (step override ได้)</span>
            <FilterSelect
              value={meta.defaultHandId}
              onChange={(v) => setMeta({ ...meta, defaultHandId: v })}
              className="w-full"
              options={[
                { value: "", label: "— ไม่ระบุ —" },
                ...hands.map((h) => ({ value: h.id, label: `${h.displayCode} · ${h.name}` })),
              ]}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="inline-flex items-center gap-1 text-xs text-zinc-500"><Video className="size-4" /> มุมกล้อง default (step override ได้)</span>
              <FilterSelect
                value={meta.defaultCameraId}
                onChange={(v) => setMeta({ ...meta, defaultCameraId: v })}
                className="w-full"
                options={[
                  { value: "", label: "— ไม่ระบุ —" },
                  ...cameras.map((c) => ({ value: c.id, label: `${c.name}${c.key ? ` (${c.key})` : ""}` })),
                ]}
              />
            </label>
            <label className="block space-y-1">
              <span className="inline-flex items-center gap-1 text-xs text-zinc-500"><Lightbulb className="size-4" /> แสง default (step override ได้)</span>
              <FilterSelect
                value={meta.defaultLightingId}
                onChange={(v) => setMeta({ ...meta, defaultLightingId: v })}
                className="w-full"
                options={[
                  { value: "", label: "— ไม่ระบุ —" },
                  ...lightings.map((l) => ({ value: l.id, label: `${l.name}${l.key ? ` (${l.key})` : ""}` })),
                ]}
              />
            </label>
          </div>
          <button type="submit" disabled={saving} className={btnPrimary}>
            {saving ? "กำลังบันทึก..." : "บันทึกข้อมูลเทมเพลต"}
          </button>
        </form>

        {/* ── step editor ── */}
        <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              ลำดับ Steps ({rows.length}) · รวม ~{Math.round(totalSec * 10) / 10} วิ
              {template?.targetDurationSec != null && ` / เป้าหมาย ${template.targetDurationSec} วิ`}
            </p>
            <button type="button" onClick={addRow} className={btnGhost}>
              + เพิ่ม step
            </button>
          </div>

          {rows.map((row, i) => {
            const g = row.gestureId ? gestureById.get(row.gestureId) : undefined;
            return (
              <div key={i} className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-6 text-center font-mono text-xs text-zinc-500">{i + 1}</span>
                  <FilterSelect
                    value={row.section}
                    onChange={(v) => patchRow(i, { section: v })}
                    options={TEMPLATE_SECTIONS.map((s) => ({ value: s, label: SECTION_LABEL[s]?.label ?? s }))}
                  />
                  <FilterSelect
                    value={row.gestureId}
                    onChange={(v) => patchRow(i, { gestureId: v })}
                    className="min-w-44 flex-1"
                    options={[
                      { value: "", label: "— ไม่มีท่า (โน้ตอย่างเดียว) —" },
                      ...gestures.map((gg) => ({ value: gg.id, label: `${gg.name}${gg.key ? ` (${gg.key})` : ""}` })),
                    ]}
                  />
                  {g?.requiredProductState && (
                    <span className="rounded-full bg-blue-900/50 px-2 py-0.5 text-[11px] text-blue-200">
                      need: {g.requiredProductState}
                    </span>
                  )}
                  {g?.resultingProductState && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-900/50 px-2 py-0.5 text-[11px] text-emerald-200">
                      <ArrowRight className="size-4" /> {g.resultingProductState}
                    </span>
                  )}
                  <span className="flex-1" />
                  <button type="button" onClick={() => moveRow(i, -1)} disabled={i === 0} className={btnGhost}>
                    <ArrowUp className="size-4" />
                  </button>
                  <button type="button" onClick={() => moveRow(i, 1)} disabled={i === rows.length - 1} className={btnGhost}>
                    <ArrowDown className="size-4" />
                  </button>
                  <button type="button" onClick={() => removeRow(i)} className={`${btnGhost} hover:text-red-300`}>
                    ลบ
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-2 pl-8">
                  <FilterSelect
                    value={row.handId}
                    onChange={(v) => patchRow(i, { handId: v })}
                    options={[
                      { value: "", label: "มือ: default ของเทมเพลต" },
                      ...hands.map((h) => ({ value: h.id, label: `${h.displayCode} · ${h.name}` })),
                    ]}
                  />
                  <FilterSelect
                    value={row.cameraId}
                    onChange={(v) => patchRow(i, { cameraId: v })}
                    options={[
                      { value: "", label: "ใช้ค่า default ของเทมเพลต" },
                      ...cameras.map((c) => ({ value: c.id, label: `${c.name}${c.key ? ` (${c.key})` : ""}` })),
                    ]}
                  />
                  <FilterSelect
                    value={row.lightingId}
                    onChange={(v) => patchRow(i, { lightingId: v })}
                    options={[
                      { value: "", label: "ใช้ค่า default ของเทมเพลต" },
                      ...lightings.map((l) => ({ value: l.id, label: `${l.name}${l.key ? ` (${l.key})` : ""}` })),
                    ]}
                  />
                  <div className="flex items-center gap-2">
                    <input
                      value={row.durationSec}
                      onChange={(e) => patchRow(i, { durationSec: e.target.value })}
                      placeholder={g?.naturalDurationSec != null ? `${g.naturalDurationSec} (natural)` : "วินาที"}
                      type="number"
                      step="0.1"
                      className={`${inputCls} w-full`}
                    />
                    <label className="flex shrink-0 items-center gap-1 text-xs text-zinc-400" title="step บังคับในสูตร">
                      <input type="checkbox" checked={row.required} onChange={(e) => patchRow(i, { required: e.target.checked })} className="accent-amber-400" />
                      จำเป็น
                    </label>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 pl-8">
                  <input value={row.cameraNote} onChange={(e) => patchRow(i, { cameraNote: e.target.value })} placeholder="โน้ตกล้องเพิ่มเติม (optional)" className={inputCls} />
                  <input value={row.lightingNote} onChange={(e) => patchRow(i, { lightingNote: e.target.value })} placeholder="โน้ตแสงเพิ่มเติม (optional)" className={inputCls} />
                  <input value={row.note} onChange={(e) => patchRow(i, { note: e.target.value })} placeholder="โน้ตเพิ่มเติม" className={inputCls} />
                </div>
              </div>
            );
          })}

          {rows.length === 0 && (
            <p className="rounded-xl border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-500">
              ยังไม่มี step — กด &quot;+ เพิ่ม step&quot; เพื่อเริ่มประกอบสูตรคลิป
            </p>
          )}

          {stepWarnings.map((w, i) => (
            <p key={i} className="flex items-center gap-1 text-sm text-amber-300">
              <TriangleAlert className="size-4 shrink-0" /> {w}
            </p>
          ))}

          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void saveSteps()} disabled={saving} className={btnPrimary}>
              {saving ? "กำลังบันทึก..." : "บันทึกลำดับ Steps"}
            </button>
            {dirtySteps && <span className="text-xs text-amber-300">มีการแก้ไขที่ยังไม่บันทึก</span>}
          </div>
        </div>

        {/* ── prompt package panel ── */}
        {pkgOpen && pkg && (
          <div className="space-y-3 rounded-2xl border border-amber-400/30 bg-zinc-900 p-5">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-2 text-sm font-medium"><Package className="size-4" /> Prompt Package — คัดลอกไปใช้กับ AI ภายนอก</p>
              <div className="flex gap-2">
                <CopyButton text={pkg.combined} label="copy ทั้งหมด" />
                <button type="button" onClick={() => setPkgOpen(false)} className={btnGhost}>
                  ปิด
                </button>
              </div>
            </div>
            {pkg.steps.map((s) => {
              const sec = SECTION_LABEL[s.section];
              return (
                <div key={s.order} className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-zinc-200">
                      {s.title}{" "}
                      {sec && <span className={`rounded-full px-2 py-0.5 text-[11px] ${sec.cls}`}>{sec.label}</span>}
                    </p>
                    <CopyButton text={s.prompt} />
                  </div>
                  <pre className="whitespace-pre-wrap rounded-lg bg-zinc-900 p-3 font-mono text-xs text-zinc-300">
                    {s.prompt}
                  </pre>
                  {s.negativePrompt && (
                    <p className="font-mono text-xs text-red-300/80">Negative: {s.negativePrompt}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
