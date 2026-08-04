"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AI_TOOL_UNIT_LABEL,
  createAiTool,
  createAiTopup,
  deleteAiTool,
  deleteAiTopup,
  listAiTools,
  listAiTopups,
  updateAiTool,
  type AiCreditTopup,
  type AiTool,
  type AiToolUnit,
} from "@/lib/api";
import { FilterSelect } from "@/components/ui/filter-select";
import { ArrowRight, Ticket } from "lucide-react";

const inputCls =
  "w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none focus:border-amber-400";

function baht(n: number | null | undefined): string {
  if (n == null) return "—";
  return `฿${n.toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;
}

export default function AiToolsSection() {
  const [tools, setTools] = useState<AiTool[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  // new-tool draft
  const [name, setName] = useState("");
  const [unit, setUnit] = useState<AiToolUnit>("credit");
  const [defaultRate, setDefaultRate] = useState("");

  const load = useCallback(async () => {
    try {
      setTools(await listAiTools());
      setUnavailable(false);
      setError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "โหลดไม่สำเร็จ";
      if (msg.includes("Cannot GET") || msg.includes("404")) setUnavailable(true);
      else if (!msg.includes("ต้องมีสิทธิ์") && !msg.includes("Forbidden")) setError(msg);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addTool() {
    if (!name.trim()) {
      setError("กรอกชื่อเครื่องมือก่อน");
      return;
    }
    try {
      await createAiTool({
        name: name.trim(),
        unit,
        defaultRateBaht: defaultRate ? Number(defaultRate) : undefined,
      });
      setName("");
      setDefaultRate("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "เพิ่มไม่สำเร็จ");
    }
  }

  async function toggleStatus(t: AiTool) {
    try {
      await updateAiTool(t.id, { status: t.status === "active" ? "archived" : "active" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "อัปเดตไม่สำเร็จ");
    }
  }

  async function removeTool(t: AiTool) {
    if (!confirm(`ลบ ${t.name}? (ลบไม่ได้ถ้ามี usage log ผูกอยู่)`)) return;
    try {
      await deleteAiTool(t.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ลบไม่สำเร็จ");
    }
  }

  if (unavailable) {
    return (
      <section className="space-y-2 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold"><Ticket className="size-4" /> AI Tools &amp; ต้นทุน</h2>
        <p className="text-xs text-zinc-500">พร้อมใช้งานหลัง API รีสตาร์ท — รอสักครู่แล้วรีเฟรช</p>
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
      <div className="flex items-center gap-2">
        <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold"><Ticket className="size-4" /> AI Tools &amp; ต้นทุน</h2>
      </div>
      <p className="text-xs text-zinc-500">
        จัดการเครื่องมือ AI + บันทึกการเติมเครดิต/จ่าย subscription จริง (baht + credit ที่ได้) <ArrowRight className="inline size-3.5" />
        ระบบคำนวณ <b className="text-zinc-300">เรตเฉลี่ยจริง (blended)</b> = Σบาท ÷ Σหน่วย ใช้ดีดต้นทุนให้ usage log
      </p>

      {/* add tool */}
      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
        <div className="flex-1 min-w-[160px]">
          <label className="mb-1 block text-[11px] text-zinc-500">ชื่อเครื่องมือ</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="Google Flow / Grok / Kling" />
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-zinc-500">หน่วย</label>
          <FilterSelect
            value={unit}
            onChange={(v) => setUnit(v as AiToolUnit)}
            className="w-auto"
            options={(["token", "credit", "flat"] as AiToolUnit[]).map((u) => ({
              value: u,
              label: AI_TOOL_UNIT_LABEL[u],
            }))}
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-zinc-500">เรตสำรอง (บาท/หน่วย)</label>
          <input
            type="number"
            min={0}
            value={defaultRate}
            onChange={(e) => setDefaultRate(e.target.value)}
            className={`${inputCls} w-32`}
            placeholder="ไม่บังคับ"
          />
        </div>
        <button
          onClick={addTool}
          className="rounded-lg bg-amber-400 px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300"
        >
          + เพิ่ม
        </button>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {/* tool list */}
      <div className="space-y-2">
        {tools.length === 0 && <p className="text-xs text-zinc-500">ยังไม่มีเครื่องมือ — เพิ่มด้านบน</p>}
        {tools.map((t) => (
          <div key={t.id} className="rounded-xl border border-zinc-800 bg-zinc-950/40">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 p-3 text-sm">
              <span className={`font-medium ${t.status === "active" ? "text-zinc-100" : "text-zinc-500 line-through"}`}>
                {t.name}
              </span>
              <span className="text-xs text-zinc-500">{AI_TOOL_UNIT_LABEL[t.unit]}</span>
              <span className="text-xs">
                เรตเฉลี่ย:{" "}
                <span className="font-semibold text-amber-300">{baht(t.blendedRate)}</span>
                <span className="text-zinc-600">
                  /{t.unit} ·{" "}
                  {t.rateSource === "ledger"
                    ? `จาก ${baht(t.totalTopupBaht)}/${t.totalTopupQuantity.toLocaleString("th-TH")} หน่วย`
                    : t.rateSource === "default"
                      ? "เรตสำรอง"
                      : "ยังไม่มีเรต"}
                </span>
              </span>
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={() => setExpanded(expanded === t.id ? null : t.id)}
                  className="rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                >
                  {expanded === t.id ? "ปิด" : "เติมเครดิต / ledger"}
                </button>
                <button onClick={() => toggleStatus(t)} className="text-xs text-zinc-400 hover:text-zinc-200">
                  {t.status === "active" ? "archive" : "เปิดใช้"}
                </button>
                <button onClick={() => removeTool(t)} className="text-xs text-red-400 hover:text-red-300">
                  ลบ
                </button>
              </div>
            </div>
            {expanded === t.id && <TopupLedger tool={t} onChanged={load} />}
          </div>
        ))}
      </div>
    </section>
  );
}

function TopupLedger({ tool, onChanged }: { tool: AiTool; onChanged: () => void }) {
  const [rows, setRows] = useState<AiCreditTopup[]>([]);
  // วันที่วันนี้เติมหลัง mount — new Date() ตอน render เสี่ยง hydration mismatch (SSR UTC vs เครื่องผู้ใช้)
  // และ toISOString() เป็น UTC ทำให้ช่วงเช้ามืดโซนไทยได้วันเมื่อวาน → ใช้ local date components แทน
  const [purchasedAt, setPurchasedAt] = useState("");
  useEffect(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    setPurchasedAt(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  }, []);
  const [amountBaht, setAmountBaht] = useState("");
  const [quantity, setQuantity] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await listAiTopups(tool.id));
    } catch {
      /* ignore */
    }
  }, [tool.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function add() {
    setErr(null);
    if (!amountBaht || !quantity) return setErr("กรอกบาทและจำนวนที่ได้");
    try {
      await createAiTopup(tool.id, {
        purchasedAt: new Date(purchasedAt).toISOString(),
        amountBaht: Number(amountBaht),
        quantity: Number(quantity),
      });
      setAmountBaht("");
      setQuantity("");
      await load();
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "เพิ่มไม่สำเร็จ");
    }
  }

  async function remove(id: string) {
    try {
      await deleteAiTopup(id);
      await load();
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    }
  }

  return (
    <div className="space-y-2 border-t border-zinc-800 bg-zinc-900/50 p-3">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-1 block text-[11px] text-zinc-500">วันที่เติม</label>
          <input type="date" value={purchasedAt} onChange={(e) => setPurchasedAt(e.target.value)} className={`${inputCls} w-auto`} />
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-zinc-500">จ่าย (บาท)</label>
          <input type="number" min={0} value={amountBaht} onChange={(e) => setAmountBaht(e.target.value)} className={`${inputCls} w-28`} />
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-zinc-500">ได้ ({AI_TOOL_UNIT_LABEL[tool.unit]})</label>
          <input type="number" min={0} value={quantity} onChange={(e) => setQuantity(e.target.value)} className={`${inputCls} w-28`} />
        </div>
        <button onClick={add} className="rounded-lg border border-amber-400/50 px-3 py-2 text-xs text-amber-300 hover:bg-amber-400/10">
          + บันทึกการเติม
        </button>
      </div>
      {err && <p className="text-xs text-red-400">{err}</p>}
      {rows.length > 0 && (
        <ul className="space-y-1">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 text-xs text-zinc-400">
              <span className="text-zinc-500">{r.purchasedAt.slice(0, 10)}</span>
              <span>{baht(r.amountBaht)}</span>
              <ArrowRight className="size-3.5 text-zinc-600" />
              <span>{r.quantity.toLocaleString("th-TH")} {tool.unit}</span>
              <span className="text-zinc-600">
                ({baht(r.quantity > 0 ? r.amountBaht / r.quantity : null)}/{tool.unit})
              </span>
              <button onClick={() => remove(r.id)} className="ml-auto text-red-400 hover:text-red-300">
                ลบ
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
