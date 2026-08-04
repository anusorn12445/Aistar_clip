"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { FilterSelect } from "@/components/ui/filter-select";
import {
  type ProductState,
  type SequenceResult,
  type TransitionsResponse,
} from "@/lib/interaction";
import { ArrowRight, Check, ChevronDown, ChevronUp, FlaskConical, RefreshCw, TriangleAlert, X } from "lucide-react";

const inputCls =
  "w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none focus:border-amber-400";
const btnAmber =
  "rounded-lg bg-amber-400 px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50";
const btnGhost =
  "rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50";

// จัดการ taxonomy "สถานะสินค้า" (ProductState) + กฎการเปลี่ยนสถานะ + ทดสอบลำดับ
export default function ProductStatesSection() {
  const [states, setStates] = useState<ProductState[] | null>(null);
  const [transitions, setTransitions] = useState<{ from: string; to: string }[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const [adding, setAdding] = useState(false);
  const [addLabel, setAddLabel] = useState("");

  // transitions editor: from/to picker
  const [tFrom, setTFrom] = useState("");
  const [tTo, setTTo] = useState("");

  // validate-sequence tester
  const [seq, setSeq] = useState("");
  const [seqResult, setSeqResult] = useState<SequenceResult | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [list, tr] = await Promise.all([
        api<ProductState[]>("/product-states"),
        api<TransitionsResponse>("/product-states/transitions"),
      ]);
      setStates(list);
      setTransitions(
        tr.transitions
          .filter((t) => t.from && t.to)
          .map((t) => ({ from: t.from as string, to: t.to as string })),
      );
      setUnavailable(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (/404|Cannot (GET|POST|PUT|PATCH|DELETE)|not found/i.test(msg)) setUnavailable(true);
      else setError(msg || "โหลดสถานะสินค้าไม่สำเร็จ");
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

  function saveAdd() {
    const label = addLabel.trim();
    if (!label) return;
    void run(async () => {
      await api("/product-states", { method: "POST", body: JSON.stringify({ label }) });
      setAddLabel("");
      setAdding(false);
    });
  }

  function patchState(s: ProductState, body: Record<string, unknown>) {
    void run(() => api(`/product-states/${s.id}`, { method: "PATCH", body: JSON.stringify(body) }));
  }

  function removeState(s: ProductState) {
    if (!confirm(`ลบสถานะ "${s.label}"?`)) return;
    void run(() => api(`/product-states/${s.id}`, { method: "DELETE" }));
  }

  function move(index: number, dir: -1 | 1) {
    const list = visible;
    const target = index + dir;
    if (target < 0 || target >= list.length) return;
    const ids = list.map((s) => s.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    void run(() => api("/product-states/reorder", { method: "POST", body: JSON.stringify({ ids }) }));
  }

  function addTransition() {
    if (!tFrom || !tTo || tFrom === tTo) return;
    if (transitions.some((t) => t.from === tFrom && t.to === tTo)) return;
    const next = [...transitions, { from: tFrom, to: tTo }];
    void run(() =>
      api("/product-states/transitions", { method: "PUT", body: JSON.stringify({ transitions: next }) }),
    );
    setTFrom("");
    setTTo("");
  }

  function removeTransition(t: { from: string; to: string }) {
    const next = transitions.filter((x) => !(x.from === t.from && x.to === t.to));
    void run(() =>
      api("/product-states/transitions", { method: "PUT", body: JSON.stringify({ transitions: next }) }),
    );
  }

  async function testSequence() {
    setSeqResult(null);
    const stateKeys = seq
      .split(/[\s,>→]+/)
      .map((x) => x.trim())
      .filter(Boolean);
    try {
      const res = await api<SequenceResult>("/product-states/validate-sequence", {
        method: "POST",
        body: JSON.stringify({ stateKeys }),
      });
      setSeqResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ทดสอบลำดับไม่สำเร็จ");
    }
  }

  const visible = (states ?? []).filter((s) => showArchived || s.status === "active");
  const labelOf = (key: string) => states?.find((s) => s.key === key)?.label ?? key;

  return (
    <section className="space-y-5 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold"><RefreshCw className="size-4" /> สถานะสินค้า (Product State)</h2>
        <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-xs text-amber-300">
          state machine
        </span>
        <label className="ml-auto flex items-center gap-1.5 text-xs text-zinc-400">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="accent-amber-400" />
          แสดงที่เก็บเข้ากรุ
        </label>
      </div>
      <p className="text-xs text-zinc-500">
        นิยามสถานะของสินค้าในแต่ละช็อต (ยังไม่แกะ <ArrowRight className="inline size-3.5" /> แกะ <ArrowRight className="inline size-3.5" /> ใช้งาน <ArrowRight className="inline size-3.5" /> ผลลัพธ์) และกฎการเปลี่ยนสถานะ
        เพื่อกันลำดับที่ไม่สมเหตุผลในงาน interaction
      </p>

      {unavailable && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          API build เก่า — ยังไม่มี endpoint จัดการสถานะสินค้า กรุณา rebuild &amp; restart API :4000 แล้วลองใหม่
        </div>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {!unavailable && (
        <>
          {/* ── states list ── */}
          <div className="space-y-2">
            {visible.map((s, i) => (
              <div
                key={s.id}
                className={`flex flex-wrap items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/50 px-4 py-2.5 ${
                  s.status === "archived" ? "opacity-60" : ""
                }`}
              >
                <div className="flex flex-col">
                  <button disabled={busy || i === 0} onClick={() => move(i, -1)} className="text-zinc-500 hover:text-amber-300 disabled:opacity-30"><ChevronUp className="size-4" /></button>
                  <button disabled={busy || i === visible.length - 1} onClick={() => move(i, 1)} className="text-zinc-500 hover:text-amber-300 disabled:opacity-30"><ChevronDown className="size-4" /></button>
                </div>
                <span className="text-sm font-semibold text-zinc-100">{s.label}</span>
                <span className="rounded-full bg-zinc-800 px-2 py-0.5 font-mono text-[10px] text-zinc-500">{s.key}</span>
                {s.builtin && <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-500">builtin</span>}
                <label className="flex items-center gap-1 text-[11px] text-zinc-400">
                  <input type="checkbox" checked={s.isInitial} disabled={busy} onChange={(e) => patchState(s, { isInitial: e.target.checked })} className="accent-emerald-400" />
                  initial
                </label>
                <label className="flex items-center gap-1 text-[11px] text-zinc-400">
                  <input type="checkbox" checked={s.isTerminal} disabled={busy} onChange={(e) => patchState(s, { isTerminal: e.target.checked })} className="accent-red-400" />
                  terminal
                </label>
                <div className="ml-auto flex items-center gap-2">
                  <button disabled={busy} onClick={() => patchState(s, { status: s.status === "active" ? "archived" : "active" })} className={btnGhost}>
                    {s.status === "active" ? "เก็บเข้ากรุ" : "กู้คืน"}
                  </button>
                  {!s.builtin ? (
                    <button disabled={busy} onClick={() => removeState(s)} className="rounded-lg border border-red-500/40 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-50">
                      ลบ
                    </button>
                  ) : (
                    <span title="สถานะพื้นฐาน ลบไม่ได้" className="cursor-not-allowed rounded-lg border border-zinc-800 px-2 py-1 text-xs text-zinc-600">ลบ</span>
                  )}
                </div>
              </div>
            ))}
            {states && visible.length === 0 && <p className="py-4 text-center text-sm text-zinc-500">ยังไม่มีสถานะสินค้า</p>}
            {!states && <p className="text-sm text-zinc-500">กำลังโหลด...</p>}
          </div>

          {adding ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-400/40 bg-zinc-950/60 p-3">
              <input autoFocus value={addLabel} onChange={(e) => setAddLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveAdd()} placeholder="ชื่อสถานะ เช่น กำลังเทลงมือ" maxLength={60} className={`${inputCls} max-w-xs`} />
              <button type="button" disabled={busy || !addLabel.trim()} onClick={saveAdd} className={btnAmber}>บันทึก</button>
              <button type="button" onClick={() => { setAdding(false); setAddLabel(""); }} className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800">ยกเลิก</button>
            </div>
          ) : (
            <button type="button" onClick={() => setAdding(true)} className="rounded-lg border border-amber-400/60 px-4 py-2 text-sm font-semibold text-amber-300 hover:bg-amber-400/10">+ เพิ่มสถานะ</button>
          )}

          {/* ── transitions editor ── */}
          <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
            <p className="text-xs font-medium text-zinc-400">กฎการเปลี่ยนสถานะ (from <ArrowRight className="inline size-3.5" /> to)</p>
            <div className="flex flex-wrap items-center gap-2">
              <FilterSelect
                value={tFrom}
                onChange={setTFrom}
                className="max-w-40"
                options={[
                  { value: "", label: "จาก..." },
                  ...(states ?? []).map((s) => ({ value: s.key, label: s.label })),
                ]}
              />
              <ArrowRight className="size-3.5 text-zinc-500" />
              <FilterSelect
                value={tTo}
                onChange={setTTo}
                className="max-w-40"
                options={[
                  { value: "", label: "ไป..." },
                  ...(states ?? []).map((s) => ({ value: s.key, label: s.label })),
                ]}
              />
              <button type="button" disabled={busy || !tFrom || !tTo || tFrom === tTo} onClick={addTransition} className={btnAmber}>+ เพิ่มเส้น</button>
            </div>
            <div className="flex flex-wrap gap-2">
              {transitions.map((t) => (
                <span key={`${t.from}|${t.to}`} className="flex items-center gap-1.5 rounded-full bg-zinc-800 px-2.5 py-1 text-xs text-zinc-200">
                  {labelOf(t.from)} <ArrowRight className="size-3.5 text-zinc-500" /> {labelOf(t.to)}
                  <button type="button" disabled={busy} onClick={() => removeTransition(t)} className="text-zinc-500 hover:text-red-300"><X className="size-3.5" /></button>
                </span>
              ))}
              {transitions.length === 0 && <span className="text-xs text-zinc-500">ยังไม่มีเส้นเชื่อม</span>}
            </div>
          </div>

          {/* ── validate-sequence tester ── */}
          <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
            <p className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400"><FlaskConical className="size-3.5" /> ทดสอบลำดับสถานะ</p>
            <div className="flex flex-wrap items-center gap-2">
              <input value={seq} onChange={(e) => setSeq(e.target.value)} placeholder="เช่น sealed opened cap_removed in_use result" className={`${inputCls} max-w-xl flex-1 font-mono`} />
              <button type="button" onClick={() => void testSequence()} className={btnAmber}>ตรวจสอบ</button>
            </div>
            {seqResult && (
              <div className="space-y-1 text-xs">
                <p className={seqResult.ok ? "text-emerald-300" : "text-red-300"}>
                  {seqResult.ok ? <><Check className="inline size-3.5" /> ลำดับถูกต้อง</> : <><X className="inline size-3.5" /> ลำดับไม่ถูกต้อง</>}
                </p>
                {seqResult.errors.map((e, i) => (
                  <p key={i} className="text-red-400">
                    #{e.index}: {e.reason}
                  </p>
                ))}
                {seqResult.warnings.map((w, i) => (
                  <p key={i} className="inline-flex items-center gap-1 text-amber-300"><TriangleAlert className="size-3.5" /> {w}</p>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
