"use client";

import { useCallback, useEffect, useState } from "react";
import {
  api,
  AUDIENCE_SPENDING_LABEL,
  audienceAgeGender,
  type AudienceGender,
  type AudienceSegment,
  type AudienceSpending,
} from "@/lib/api";
import { FilterSelect } from "@/components/ui/filter-select";
import { MapPin, MessageCircle, Smartphone, Users, X } from "lucide-react";

const inputCls =
  "w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none focus:border-amber-400";

const GENDER_OPTIONS: { value: AudienceGender; label: string }[] = [
  { value: "any", label: "ทุกเพศ" },
  { value: "female", label: "หญิง" },
  { value: "male", label: "ชาย" },
  { value: "mixed", label: "ผสม" },
];

const SPENDING_OPTIONS: { value: AudienceSpending; label: string }[] = [
  { value: "low", label: "ต่ำ" },
  { value: "medium", label: "กลาง" },
  { value: "high", label: "สูง" },
];

interface SegmentForm {
  name: string;
  description: string;
  ageMin: string;
  ageMax: string;
  gender: string;
  interests: string[];
  platforms: string[];
  spendingPower: string;
  region: string;
  painPoint: string;
}

const EMPTY_FORM: SegmentForm = {
  name: "",
  description: "",
  ageMin: "",
  ageMax: "",
  gender: "",
  interests: [],
  platforms: [],
  spendingPower: "",
  region: "",
  painPoint: "",
};

function toForm(s: AudienceSegment): SegmentForm {
  return {
    name: s.name,
    description: s.description ?? "",
    ageMin: s.ageMin != null ? String(s.ageMin) : "",
    ageMax: s.ageMax != null ? String(s.ageMax) : "",
    gender: s.gender ?? "",
    interests: s.interests ?? [],
    platforms: s.platforms ?? [],
    spendingPower: s.spendingPower ?? "",
    region: s.region ?? "",
    painPoint: s.painPoint ?? "",
  };
}

function formPayload(f: SegmentForm): Record<string, unknown> {
  const ageMin = f.ageMin.trim() === "" ? null : Number(f.ageMin);
  const ageMax = f.ageMax.trim() === "" ? null : Number(f.ageMax);
  return {
    name: f.name.trim(),
    description: f.description.trim() || null,
    ageMin,
    ageMax,
    gender: f.gender || null,
    interests: f.interests,
    platforms: f.platforms,
    spendingPower: f.spendingPower || null,
    region: f.region.trim() || null,
    painPoint: f.painPoint.trim() || null,
  };
}

// ── chip input (interests / platforms) ──
function ChipInput({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v || values.includes(v)) {
      setDraft("");
      return;
    }
    onChange([...values, v]);
    setDraft("");
  };
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-zinc-300">{label}</label>
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 p-2">
        {values.map((v) => (
          <span
            key={v}
            className="flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-xs text-amber-200"
          >
            {v}
            <button
              type="button"
              onClick={() => onChange(values.filter((x) => x !== v))}
              className="text-amber-300/70 hover:text-red-300"
            >
              <X className="size-3" />
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
          placeholder={values.length === 0 ? placeholder : "+ เพิ่ม"}
          className="min-w-[8rem] flex-1 bg-transparent px-1 py-0.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-600"
        />
      </div>
    </div>
  );
}

function SegmentFormPanel({
  form,
  setForm,
  onSave,
  onCancel,
  saving,
  title,
}: {
  form: SegmentForm;
  setForm: (f: SegmentForm) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  title: string;
}) {
  const patch = (p: Partial<SegmentForm>) => setForm({ ...form, ...p });
  return (
    <div className="space-y-3 rounded-xl border border-amber-400/40 bg-zinc-950/60 p-4">
      <p className="text-sm font-semibold text-amber-300">{title}</p>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1 md:col-span-2">
          <label className="text-xs font-medium text-zinc-300">ชื่อกลุ่ม *</label>
          <input
            value={form.name}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder="เช่น สาวออฟฟิศสายมู 25-35"
            maxLength={80}
            className={inputCls}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-300">อายุต่ำสุด</label>
          <input
            value={form.ageMin}
            onChange={(e) => patch({ ageMin: e.target.value })}
            inputMode="numeric"
            placeholder="เช่น 25"
            className={inputCls}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-300">อายุสูงสุด</label>
          <input
            value={form.ageMax}
            onChange={(e) => patch({ ageMax: e.target.value })}
            inputMode="numeric"
            placeholder="เช่น 35"
            className={inputCls}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-300">เพศ</label>
          <FilterSelect
            value={form.gender}
            onChange={(v) => patch({ gender: v })}
            className="w-full"
            options={[
              { value: "", label: "— ไม่ระบุ —" },
              ...GENDER_OPTIONS.map((g) => ({ value: g.value, label: g.label })),
            ]}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-300">กำลังซื้อ</label>
          <FilterSelect
            value={form.spendingPower}
            onChange={(v) => patch({ spendingPower: v })}
            className="w-full"
            options={[
              { value: "", label: "— ไม่ระบุ —" },
              ...SPENDING_OPTIONS.map((s) => ({ value: s.value, label: s.label })),
            ]}
          />
        </div>
        <ChipInput
          label="ความสนใจ / ไลฟ์สไตล์"
          values={form.interests}
          onChange={(v) => patch({ interests: v })}
          placeholder="พิมพ์แล้ว Enter เช่น มู, บิวตี้"
        />
        <ChipInput
          label="แพลตฟอร์มหลัก"
          values={form.platforms}
          onChange={(v) => patch({ platforms: v })}
          placeholder="พิมพ์แล้ว Enter เช่น TikTok"
        />
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-300">ภูมิภาค</label>
          <input
            value={form.region}
            onChange={(e) => patch({ region: e.target.value })}
            placeholder="เช่น กลาง, อีสาน"
            className={inputCls}
          />
        </div>
        <div className="space-y-1 md:col-span-2">
          <label className="text-xs font-medium text-zinc-300">Pain point / โน้ต</label>
          <input
            value={form.painPoint}
            onChange={(e) => patch({ painPoint: e.target.value })}
            placeholder="อยากปังแต่ไม่มีเวลา"
            className={inputCls}
          />
        </div>
        <div className="space-y-1 md:col-span-2">
          <label className="text-xs font-medium text-zinc-300">คำอธิบายกลุ่ม</label>
          <textarea
            value={form.description}
            onChange={(e) => patch({ description: e.target.value })}
            rows={2}
            className={`${inputCls} resize-y`}
          />
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={saving || !form.name.trim()}
          onClick={onSave}
          className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
        >
          {saving ? "กำลังบันทึก..." : "บันทึก"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
        >
          ยกเลิก
        </button>
      </div>
    </div>
  );
}

export default function AudienceSegmentsSection() {
  const [segments, setSegments] = useState<AudienceSegment[] | null>(null);
  const [unavailable, setUnavailable] = useState(false); // API build เก่า (404)
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState<SegmentForm>(EMPTY_FORM);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<SegmentForm>(EMPTY_FORM);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api<AudienceSegment[]>("/audience-segments");
      setSegments(res);
      setUnavailable(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (/404|Cannot (GET|POST|PATCH|DELETE)|not found/i.test(msg)) setUnavailable(true);
      else setError(msg || "โหลดกลุ่มผู้ชมไม่สำเร็จ");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ทำรายการไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  function validateAges(f: SegmentForm): string | null {
    for (const v of [f.ageMin, f.ageMax]) {
      if (v.trim() !== "" && (!Number.isInteger(Number(v)) || Number(v) < 0 || Number(v) > 120)) {
        return "อายุต้องเป็นตัวเลข 0-120";
      }
    }
    if (f.ageMin.trim() && f.ageMax.trim() && Number(f.ageMin) > Number(f.ageMax)) {
      return "อายุต่ำสุดต้องไม่มากกว่าอายุสูงสุด";
    }
    return null;
  }

  function saveAdd() {
    const err = validateAges(addForm);
    if (err) {
      setError(err);
      return;
    }
    void run(async () => {
      await api("/audience-segments", {
        method: "POST",
        body: JSON.stringify(formPayload(addForm)),
      });
      setAddForm(EMPTY_FORM);
      setAdding(false);
    });
  }

  function saveEdit() {
    const err = validateAges(editForm);
    if (err) {
      setError(err);
      return;
    }
    const id = editId;
    if (!id) return;
    void run(async () => {
      await api(`/audience-segments/${id}`, {
        method: "PATCH",
        body: JSON.stringify(formPayload(editForm)),
      });
      setEditId(null);
    });
  }

  function toggleArchive(s: AudienceSegment) {
    const status = s.status === "active" ? "archived" : "active";
    void run(() =>
      api(`/audience-segments/${s.id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    );
  }

  function remove(s: AudienceSegment) {
    if (!confirm(`ลบกลุ่ม "${s.name}"?`)) return;
    void run(() => api(`/audience-segments/${s.id}`, { method: "DELETE" }));
  }

  const visible = (segments ?? []).filter((s) => showArchived || s.status === "active");

  return (
    <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold"><Users className="size-4" /> กลุ่มผู้ชม (Audience Segment)</h2>
        <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-xs text-amber-300">
          Phase 1 — taxonomy กลาง
        </span>
        <label className="ml-auto flex items-center gap-1.5 text-xs text-zinc-400">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="accent-amber-400"
          />
          แสดงที่เก็บเข้ากรุ
        </label>
      </div>
      <p className="text-xs text-zinc-500">
        นิยามกลุ่มผู้ชมชุดกลางชุดเดียว — ทั้ง Character (กลุ่มผู้ติดตาม) และ Series (คนดูเป้าหมาย) จะเลือกจากชุดนี้
        เพื่อให้ทุกคน &ldquo;เห็นภาพคนดูตรงกัน&rdquo;
      </p>

      {unavailable && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          API build เก่า — ยังไม่มี endpoint จัดการกลุ่มผู้ชม กรุณา rebuild &amp; restart API :4000 แล้วลองใหม่
        </div>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {!unavailable && (
        <>
          <div className="space-y-2">
            {visible.map((s) =>
              editId === s.id ? (
                <SegmentFormPanel
                  key={s.id}
                  form={editForm}
                  setForm={setEditForm}
                  onSave={saveEdit}
                  onCancel={() => setEditId(null)}
                  saving={busy}
                  title={`แก้ไข: ${s.name}`}
                />
              ) : (
                <div
                  key={s.id}
                  className={`flex flex-wrap items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-950/50 px-4 py-3 ${
                    s.status === "archived" ? "opacity-60" : ""
                  }`}
                >
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-zinc-100">{s.name}</span>
                      {audienceAgeGender(s) && (
                        <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-300">
                          {audienceAgeGender(s)}
                        </span>
                      )}
                      {s.spendingPower && AUDIENCE_SPENDING_LABEL[s.spendingPower] && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] ${AUDIENCE_SPENDING_LABEL[s.spendingPower].cls}`}
                        >
                          {AUDIENCE_SPENDING_LABEL[s.spendingPower].label}
                        </span>
                      )}
                      {s.region && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">
                          <MapPin className="size-3" /> {s.region}
                        </span>
                      )}
                    </div>
                    {s.interests.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {s.interests.map((i) => (
                          <span
                            key={i}
                            className="rounded-full bg-amber-400/10 px-2 py-0.5 text-[10px] text-amber-200"
                          >
                            {i}
                          </span>
                        ))}
                      </div>
                    )}
                    {s.platforms.length > 0 && (
                      <p className="inline-flex items-center gap-1 text-[11px] text-zinc-500"><Smartphone className="size-3" /> {s.platforms.join(" · ")}</p>
                    )}
                    {s.painPoint && <p className="inline-flex items-center gap-1 text-[11px] text-zinc-500"><MessageCircle className="size-3" /> {s.painPoint}</p>}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">
                      ใช้อยู่ {s.usageCount} รายการ
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        disabled={busy}
                        onClick={() => {
                          setEditForm(toForm(s));
                          setEditId(s.id);
                          setAdding(false);
                        }}
                        className="rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                      >
                        แก้ไข
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => toggleArchive(s)}
                        className="rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                      >
                        {s.status === "active" ? "เก็บเข้ากรุ" : "กู้คืน"}
                      </button>
                      {s.usageCount === 0 ? (
                        <button
                          disabled={busy}
                          onClick={() => remove(s)}
                          className="rounded-lg border border-red-500/40 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10"
                        >
                          ลบ
                        </button>
                      ) : (
                        <span
                          title="มี Character/Series ใช้อยู่ — เก็บเข้ากรุแทน"
                          className="cursor-not-allowed rounded-lg border border-zinc-800 px-2 py-1 text-xs text-zinc-600"
                        >
                          ลบ
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ),
            )}
            {segments && visible.length === 0 && (
              <p className="py-4 text-center text-sm text-zinc-500">
                ยังไม่มีกลุ่มผู้ชม — กด &ldquo;+ เพิ่มกลุ่ม&rdquo; เพื่อสร้างกลุ่มแรก
              </p>
            )}
            {!segments && <p className="text-sm text-zinc-500">กำลังโหลด...</p>}
          </div>

          {adding ? (
            <SegmentFormPanel
              form={addForm}
              setForm={setAddForm}
              onSave={saveAdd}
              onCancel={() => {
                setAdding(false);
                setAddForm(EMPTY_FORM);
              }}
              saving={busy}
              title="+ กลุ่มผู้ชมใหม่"
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setAddForm(EMPTY_FORM);
                setAdding(true);
                setEditId(null);
              }}
              className="rounded-lg border border-amber-400/60 px-4 py-2 text-sm font-semibold text-amber-300 hover:bg-amber-400/10"
            >
              + เพิ่มกลุ่ม
            </button>
          )}
        </>
      )}
    </section>
  );
}
