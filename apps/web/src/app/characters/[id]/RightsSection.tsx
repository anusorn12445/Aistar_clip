"use client";

import { useCallback, useEffect, useState } from "react";
import {
  api,
  LEGAL_STATUS_LABEL,
  RISK_LEVEL_LABEL,
  type Right,
  type RightList,
} from "@/lib/api";
import { Check, Scale, TriangleAlert } from "lucide-react";
import { FilterSelect } from "@/components/ui/filter-select";

interface FormState {
  owner: string;
  commercialUsage: boolean;
  usageScope: string;
  territory: string;
  duration: string;
  exclusivity: string;
  restrictedCategories: string; // comma separated
  disclosureRequired: boolean;
  riskLevel: string;
}

const EMPTY_FORM: FormState = {
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

function toForm(r: Right): FormState {
  return {
    owner: r.owner,
    commercialUsage: r.commercialUsage,
    usageScope: r.usageScope ?? "",
    territory: r.territory ?? "",
    duration: r.duration ?? "",
    exclusivity: r.exclusivity ?? "",
    restrictedCategories: r.restrictedCategories.join(", "),
    disclosureRequired: r.disclosureRequired,
    riskLevel: r.riskLevel,
  };
}

export default function RightsSection({ characterId }: { characterId: string }) {
  const [items, setItems] = useState<Right[] | null>(null);
  const [forbidden, setForbidden] = useState(false); // ไม่มีสิทธิ์ rights → degrade
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Right | "new" | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api<RightList>(
        `/rights?entityType=character&entityId=${characterId}`,
      );
      setItems(res.items);
      setForbidden(false);
      setError(null);
    } catch (err) {
      // 403 (ไม่มีสิทธิ์ rights) หรือ endpoint ยังไม่มี → degrade เป็นอ่านอย่างเดียว/ซ่อน
      setItems([]);
      setForbidden(true);
      setError(null);
      void err;
    }
  }, [characterId]);

  useEffect(() => {
    void load();
  }, [load]);

  function startEdit(r: Right | "new") {
    setForm(r === "new" ? EMPTY_FORM : toForm(r));
    setEditing(r);
    setError(null);
  }

  async function save() {
    if (!form.owner.trim()) return;
    setSaving(true);
    setError(null);
    const payload = {
      owner: form.owner.trim(),
      commercialUsage: form.commercialUsage,
      usageScope: form.usageScope.trim() || undefined,
      territory: form.territory.trim() || undefined,
      duration: form.duration.trim() || undefined,
      exclusivity: form.exclusivity.trim() || undefined,
      restrictedCategories: form.restrictedCategories
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      disclosureRequired: form.disclosureRequired,
      riskLevel: form.riskLevel,
    };
    try {
      if (editing === "new") {
        await api(`/rights`, {
          method: "POST",
          body: JSON.stringify({ entityType: "character", entityId: characterId, ...payload }),
        });
      } else if (editing) {
        await api(`/rights/${editing.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      }
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="inline-flex items-center gap-2 text-lg font-semibold">
          <Scale className="size-5" /> ลิขสิทธิ์ / สิทธิ์การใช้งาน
          {items && !forbidden && (
            <span className="text-sm font-normal text-zinc-500">({items.length})</span>
          )}
        </h3>
        {!forbidden && !editing && (
          <button
            onClick={() => startEdit("new")}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            + เพิ่มสิทธิ์
          </button>
        )}
      </div>

      {forbidden && (
        <p className="text-sm text-zinc-500">
          ไม่มีสิทธิ์เข้าถึงข้อมูลลิขสิทธิ์ หรือระบบยังไม่พร้อม
        </p>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      {editing && !forbidden && (
        <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="เจ้าของสิทธิ์ *">
              <input
                autoFocus
                value={form.owner}
                onChange={(e) => setForm({ ...form, owner: e.target.value })}
                placeholder="เช่น AISTAR Studio"
                className={inputCls}
              />
            </Field>
            <Field label="ขอบเขตการใช้ (usage scope)">
              <input
                value={form.usageScope}
                onChange={(e) => setForm({ ...form, usageScope: e.target.value })}
                placeholder="เช่น โฆษณาออนไลน์"
                className={inputCls}
              />
            </Field>
            <Field label="อาณาเขต (territory)">
              <input
                value={form.territory}
                onChange={(e) => setForm({ ...form, territory: e.target.value })}
                placeholder="เช่น ไทย, ทั่วโลก"
                className={inputCls}
              />
            </Field>
            <Field label="ระยะเวลา (duration)">
              <input
                value={form.duration}
                onChange={(e) => setForm({ ...form, duration: e.target.value })}
                placeholder="เช่น 1 ปี, ตลอดชีพ"
                className={inputCls}
              />
            </Field>
            <Field label="เงื่อนไข exclusivity">
              <input
                value={form.exclusivity}
                onChange={(e) => setForm({ ...form, exclusivity: e.target.value })}
                placeholder="เช่น exclusive, non-exclusive"
                className={inputCls}
              />
            </Field>
            <Field label="ระดับความเสี่ยง">
              <FilterSelect
                value={form.riskLevel}
                onChange={(v) => setForm({ ...form, riskLevel: v })}
                options={[
                  { value: "low", label: "ต่ำ" },
                  { value: "medium", label: "กลาง" },
                  { value: "high", label: "สูง" },
                ]}
                className="w-full"
              />
            </Field>
          </div>
          <Field label="หมวดหมู่ต้องห้าม (คั่นด้วย , )">
            <input
              value={form.restrictedCategories}
              onChange={(e) => setForm({ ...form, restrictedCategories: e.target.value })}
              placeholder="เช่น แอลกอฮอล์, การพนัน"
              className={inputCls}
            />
          </Field>
          <div className="flex flex-wrap gap-5">
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={form.commercialUsage}
                onChange={(e) => setForm({ ...form, commercialUsage: e.target.checked })}
                className="accent-amber-400"
              />
              ใช้เชิงพาณิชย์ได้
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={form.disclosureRequired}
                onChange={(e) => setForm({ ...form, disclosureRequired: e.target.checked })}
                className="accent-amber-400"
              />
              ต้องเปิดเผยว่าเป็น AI
            </label>
          </div>
          <div className="flex gap-2">
            <button
              disabled={!form.owner.trim() || saving}
              onClick={save}
              className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
            >
              {saving ? "กำลังบันทึก..." : "บันทึก"}
            </button>
            <button
              onClick={() => setEditing(null)}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      {items && items.length === 0 && !editing && !forbidden && (
        <p className="text-sm text-zinc-500">ยังไม่มีข้อมูลลิขสิทธิ์สำหรับตัวละครนี้</p>
      )}

      {items && items.length > 0 && (
        <div className="space-y-3">
          {items.map((r) => {
            const legal = LEGAL_STATUS_LABEL[r.legalStatus] ?? {
              label: r.legalStatus,
              cls: "bg-zinc-800 text-zinc-300",
            };
            const risk = RISK_LEVEL_LABEL[r.riskLevel] ?? {
              label: r.riskLevel,
              cls: "bg-zinc-800 text-zinc-300",
            };
            return (
              <div key={r.id} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{r.owner}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${legal.cls}`}>
                      {legal.label}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${risk.cls}`}>
                      {risk.label}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
                        r.commercialUsage
                          ? "bg-emerald-900 text-emerald-200"
                          : "bg-zinc-800 text-zinc-400"
                      }`}
                    >
                      {r.commercialUsage ? (
                        <>
                          เชิงพาณิชย์ <Check className="size-3.5" />
                        </>
                      ) : (
                        "ห้ามเชิงพาณิชย์"
                      )}
                    </span>
                    {r.disclosureRequired && (
                      <span className="rounded-full bg-sky-900 px-2 py-0.5 text-xs text-sky-200">
                        เปิดเผย AI
                      </span>
                    )}
                  </div>
                  {!forbidden && (
                    <button
                      onClick={() => startEdit(r)}
                      className="text-sm text-zinc-400 hover:text-amber-300"
                    >
                      แก้ไข
                    </button>
                  )}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-zinc-400 sm:grid-cols-4">
                  {r.usageScope && <Info k="ขอบเขต" v={r.usageScope} />}
                  {r.territory && <Info k="อาณาเขต" v={r.territory} />}
                  {r.duration && <Info k="ระยะเวลา" v={r.duration} />}
                  {r.exclusivity && <Info k="Exclusivity" v={r.exclusivity} />}
                </div>
                {r.restrictedCategories.length > 0 && (
                  <p className="mt-2 text-xs text-orange-300/80">
                    <TriangleAlert className="inline size-3.5 align-text-bottom" /> ห้าม: {r.restrictedCategories.join(", ")}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

const inputCls =
  "w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-amber-400";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-zinc-500">{label}</label>
      {children}
    </div>
  );
}

function Info({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <span className="text-zinc-600">{k}: </span>
      <span className="text-zinc-300">{v}</span>
    </div>
  );
}
