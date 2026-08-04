"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Clapperboard, Film, Smartphone, Image as ImageIcon, TriangleAlert, Check, X, type LucideIcon } from "lucide-react";
import AppShell from "@/components/AppShell";
import { FilterSelect } from "@/components/ui/filter-select";
import {
  aiLinkSearch,
  aiUsageSummary,
  AI_OUTPUT_TYPE_LABEL,
  AI_TOOL_UNIT_LABEL,
  createAiUsage,
  deleteAiUsage,
  getToken,
  getUser,
  listAiTools,
  listAiUsage,
  type AiLinkSearchResult,
  type AiOutputType,
  type AiTool,
  type AiUsageLog,
  type AiUsageSummary,
} from "@/lib/api";

const inputCls =
  "w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none focus:border-amber-400";
const labelCls = "block text-xs font-medium text-zinc-400 mb-1";

function baht(n: number | null | undefined): string {
  if (n == null) return "—";
  return `฿${n.toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;
}

function monthRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  // format จาก local components — เลี่ยง toISOString() (UTC) ที่เลื่อนวันในโซนไทย
  // (ต้นเดือน/ปลายเดือนหายไป 1 วัน)
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return { from: fmt(from), to: fmt(to) };
}

const ENTITY_ICON: Record<string, LucideIcon> = { episode: Clapperboard, shot: Film, content: Smartphone, image_request: ImageIcon };

function EntityIcon({ type, className }: { type: string; className?: string }) {
  const Icon = ENTITY_ICON[type];
  return Icon ? <Icon className={className ?? "inline size-3.5"} /> : null;
}

export default function AiUsagePage() {
  const router = useRouter();
  const [tools, setTools] = useState<AiTool[]>([]);
  const [summary, setSummary] = useState<AiUsageSummary | null>(null);
  const [logs, setLogs] = useState<AiUsageLog[]>([]);
  // เริ่มด้วยค่าว่างบน server แล้วค่อยคำนวณเดือนปัจจุบันหลัง mount — monthRange() ใช้ new Date()
  // (local TZ) ซึ่ง SSR (UTC บน Railway) กับเครื่องผู้ใช้ (Bangkok) ให้คนละวันได้ → hydration mismatch
  const [range, setRange] = useState<{ from: string; to: string }>({ from: "", to: "" });
  useEffect(() => {
    setRange(monthRange());
  }, []);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notReady, setNotReady] = useState(false);

  const load = useCallback(async () => {
    if (!range.from) return; // รอ range จริงหลัง mount ก่อน — กันยิง API ด้วยช่วงว่าง
    try {
      const [t, s, l] = await Promise.all([
        listAiTools(),
        aiUsageSummary(range),
        listAiUsage(range),
      ]);
      setTools(t);
      setSummary(s);
      setLogs(l);
      setLoadError(null);
      setNotReady(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ";
      // API ยังไม่ได้รีสตาร์ท → route ยังไม่ขึ้น
      if (msg.includes("Cannot GET") || msg.includes("404")) setNotReady(true);
      else setLoadError(msg);
    }
  }, [range]);

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    void load();
  }, [router, load]);

  const activeTools = useMemo(() => tools.filter((t) => t.status === "active"), [tools]);
  const ceo = summary?.ceo ?? false;
  // CEO: logs = ของทุกคน → คัดเฉพาะของตัวเองมาโชว์ในลิสต์ "บันทึกของฉัน" (จัดการ/ลบได้)
  // อ่าน user จาก localStorage หลัง mount เท่านั้น — อ่านตอน render ทำ hydration mismatch (React 19 ทิ้ง SSR tree)
  const [myId, setMyId] = useState<string | null>(null);
  useEffect(() => {
    setMyId(getUser()?.id ?? null);
  }, []);
  const myLogs = useMemo(
    () => (ceo && myId ? logs.filter((l) => l.userId === myId) : logs),
    [ceo, myId, logs],
  );

  return (
    <AppShell title="AI Usage / ต้นทุน AI">
      <div className="space-y-6">
        <p className="text-sm text-zinc-400">
          บันทึกต้นทุน token/credit ที่ใช้ต่อวัน — ทุกครั้งต้อง<b className="text-zinc-200">ผูกงานจริง</b>{" "}
          (Episode/Shot/Content) เทียบ &quot;ต้นทุน vs ผลงาน&quot; เป็นบาทข้ามทุก tool
        </p>

        {notReady && (
          <div className="rounded-2xl border border-amber-400/40 bg-amber-400/10 p-6 text-sm text-amber-200">
            ฟีเจอร์นี้พร้อมใช้งานหลัง API รีสตาร์ท (:4000) — รอสักครู่แล้วรีเฟรชหน้าอีกครั้ง
          </div>
        )}
        {loadError && (
          <div className="rounded-2xl border border-red-900 bg-red-950/40 p-6 text-sm text-red-200">
            {loadError}
          </div>
        )}

        {/* date-range filter */}
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className={labelCls}>ตั้งแต่</label>
            <input
              type="date"
              value={range.from}
              onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
              className={`${inputCls} w-auto`}
            />
          </div>
          <div>
            <label className={labelCls}>ถึง</label>
            <input
              type="date"
              value={range.to}
              onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
              className={`${inputCls} w-auto`}
            />
          </div>
          <button
            type="button"
            onClick={() => setRange(monthRange())}
            className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            เดือนนี้
          </button>
        </div>

        {/* summary cards */}
        {summary && (
          <div className="grid gap-4 sm:grid-cols-3">
            <SummaryCard label="ต้นทุน AI (ช่วงที่เลือก)" value={baht(summary.totals.costBaht)} sub={`${summary.totals.logs} รายการ`} />
            <SummaryCard label="ผลงานรวม" value={summary.totals.outputs.toLocaleString("th-TH")} sub="ชิ้น (คลิป/ภาพ)" />
            <SummaryCard label="ต้นทุนเฉลี่ย/ชิ้น" value={baht(summary.totals.avgCostPerOutput)} sub="บาท/ผลงาน" accent />
          </div>
        )}

        <RecordForm tools={activeTools} onSaved={load} />

        {/* tool comparison */}
        {summary && summary.perTool.length > 0 && <ToolComparison summary={summary} />}

        {/* CEO: per-person efficiency table + ลิสต์บันทึกของตัวเอง (จัดการ/ลบได้) | non-CEO: own logs */}
        {ceo && <PerPersonTable summary={summary!} />}
        {(!ceo || myLogs.length > 0) && <OwnLogs logs={ceo ? myLogs : logs} onDeleted={load} />}
      </div>
    </AppShell>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accent ? "text-amber-300" : "text-zinc-100"}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-zinc-600">{sub}</p>}
    </div>
  );
}

function ToolComparison({ summary }: { summary: AiUsageSummary }) {
  const rows = summary.perTool.filter((t) => t.costPerOutput != null);
  const max = Math.max(1, ...rows.map((r) => r.costPerOutput ?? 0));
  return (
    <section className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
      <h2 className="text-sm font-semibold">เทียบต้นทุนต่อชิ้น (บาท/ผลงาน) รายเครื่องมือ</h2>
      {rows.length === 0 ? (
        <p className="text-xs text-zinc-500">ยังไม่มีผลงานให้เทียบในช่วงนี้</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.tool} className="flex items-center gap-3">
              <span className="w-28 shrink-0 truncate text-xs text-zinc-300">{r.tool}</span>
              <div className="flex-1 rounded bg-zinc-800">
                <div
                  className="h-5 rounded bg-amber-400/70"
                  style={{ width: `${((r.costPerOutput ?? 0) / max) * 100}%` }}
                />
              </div>
              <span className="w-24 shrink-0 text-right text-xs tabular-nums text-zinc-300">
                {baht(r.costPerOutput)}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function PerPersonTable({ summary }: { summary: AiUsageSummary }) {
  return (
    <section className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold">ประสิทธิภาพรายคน</h2>
        <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10px] text-amber-300">
          CEO เท่านั้น
        </span>
      </div>
      {summary.perPerson.length === 0 ? (
        <p className="text-xs text-zinc-500">ยังไม่มีข้อมูลในช่วงนี้</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                <th className="py-2 pr-3">ชื่อ</th>
                <th className="py-2 pr-3 text-right">token/credit</th>
                <th className="py-2 pr-3 text-right">ผลงาน</th>
                <th className="py-2 pr-3 text-right">บาท/ชิ้น</th>
                <th className="py-2 pr-3 text-right">ต้นทุนรวม</th>
                <th className="py-2 pr-3 text-right">% ผูกงาน</th>
                <th className="py-2">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {summary.perPerson.map((p) => (
                <tr key={p.userId} className="border-b border-zinc-800/60">
                  <td className="py-2 pr-3 text-zinc-200">{p.name ?? p.userId.slice(0, 8)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-zinc-300">
                    {p.quantity.toLocaleString("th-TH")}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-zinc-300">{p.outputs}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-zinc-300">{baht(p.costPerOutput)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-zinc-300">{baht(p.costBaht)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-zinc-400">{p.linkedPct}%</td>
                  <td className="py-2">
                    {p.flag === "review" ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[11px] text-red-300">
                        <TriangleAlert className="size-3" /> ตรวจสอบ
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300">
                        <Check className="size-3" /> คุ้ม
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function OwnLogs({ logs, onDeleted }: { logs: AiUsageLog[]; onDeleted: () => void }) {
  async function del(id: string) {
    if (!confirm("ลบรายการนี้?")) return;
    try {
      await deleteAiUsage(id);
      onDeleted();
    } catch (err) {
      alert(err instanceof Error ? err.message : "ลบไม่สำเร็จ");
    }
  }
  return (
    <section className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
      <h2 className="text-sm font-semibold">บันทึกของฉัน</h2>
      {logs.length === 0 ? (
        <p className="text-xs text-zinc-500">ยังไม่มีรายการในช่วงนี้ — เริ่มบันทึกด้านบน</p>
      ) : (
        <div className="space-y-2">
          {logs.map((l) => (
            <div
              key={l.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-zinc-800 bg-zinc-950/40 p-3 text-sm"
            >
              <span className="text-xs text-zinc-500">{l.usedAt.slice(0, 10)}</span>
              <span className="font-medium text-zinc-200">{l.toolName}</span>
              <span className="text-zinc-400">
                {l.quantity.toLocaleString("th-TH")} {l.toolUnit} · {baht(l.costBaht)}
              </span>
              <span className="text-zinc-400">
                {l.outputsCount} {AI_OUTPUT_TYPE_LABEL[l.outputType]}
              </span>
              <span className="flex flex-wrap gap-1">
                {l.links.map((lk, i) => (
                  <span
                    key={lk.id ?? i}
                    className="rounded-full border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-300"
                  >
                    <EntityIcon type={lk.entityType} /> {lk.label ?? lk.entityId.slice(0, 8)}
                  </span>
                ))}
              </span>
              <button
                onClick={() => del(l.id)}
                className="ml-auto text-xs text-red-400 hover:text-red-300"
              >
                ลบ
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function RecordForm({ tools, onSaved }: { tools: AiTool[]; onSaved: () => void }) {
  const [aiToolId, setAiToolId] = useState("");
  // วันที่วันนี้เติมหลัง mount — new Date() ตอน render เสี่ยง hydration mismatch (SSR UTC vs เครื่องผู้ใช้)
  // และ toISOString() เป็น UTC ทำให้ช่วงเช้ามืดโซนไทยได้วันเมื่อวาน → ใช้ local date components แทน
  const [usedAt, setUsedAt] = useState("");
  useEffect(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    setUsedAt(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  }, []);
  const [quantity, setQuantity] = useState("");
  const [costOverride, setCostOverride] = useState<string | null>(null); // null = auto จากเรต
  const [outputsCount, setOutputsCount] = useState("1");
  const [outputType, setOutputType] = useState<AiOutputType>("video");
  const [note, setNote] = useState("");
  const [links, setLinks] = useState<AiLinkSearchResult[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const tool = tools.find((t) => t.id === aiToolId);
  const rate = tool?.blendedRate ?? null;
  const qtyNum = Number(quantity) || 0;
  const autoCost = rate != null ? Math.round(qtyNum * rate * 100) / 100 : null;
  // ค่าที่แสดง: override ถ้าผู้ใช้แก้เอง มิฉะนั้น auto จากเรต (derived — ไม่ต้องใช้ effect)
  const costDisplay = costOverride ?? (autoCost != null ? String(autoCost) : "");

  async function submit() {
    setErr(null);
    setMsg(null);
    if (!aiToolId) return setErr("เลือกเครื่องมือ AI ก่อน");
    if (qtyNum <= 0) return setErr("กรอกจำนวน token/credit");
    if (links.length === 0) return setErr("ต้องผูกงานอย่างน้อย 1 ชิ้น");
    setSaving(true);
    try {
      const res = await createAiUsage({
        aiToolId,
        usedAt: new Date(usedAt).toISOString(),
        quantity: qtyNum,
        outputsCount: Math.max(0, Math.round(Number(outputsCount) || 0)),
        outputType,
        note: note.trim() || undefined,
        costBaht: costOverride != null && costOverride !== "" ? Number(costOverride) : undefined,
        links: links.map((l) => ({ entityType: l.entityType, entityId: l.entityId, label: l.label })),
      });
      setMsg(res.rateWarning ? `บันทึกแล้ว — ${res.rateWarning}` : "บันทึกแล้ว");
      // reset
      setQuantity("");
      setCostOverride(null);
      setOutputsCount("1");
      setNote("");
      setLinks([]);
      onSaved();
      setTimeout(() => setMsg(null), 5000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
      <h2 className="text-sm font-semibold">บันทึกการใช้วันนี้</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls}>เครื่องมือ AI</label>
          <FilterSelect
            value={aiToolId}
            onChange={setAiToolId}
            className="w-full"
            options={[
              { value: "", label: "— เลือก —" },
              ...tools.map((t) => ({
                value: t.id,
                label: `${t.name} (${AI_TOOL_UNIT_LABEL[t.unit]})${
                  t.blendedRate != null ? ` · ${baht(t.blendedRate)}/${t.unit}` : " · ยังไม่มีเรต"
                }`,
              })),
            ]}
          />
        </div>
        <div>
          <label className={labelCls}>วันที่ใช้</label>
          <input type="date" value={usedAt} onChange={(e) => setUsedAt(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>จำนวน {tool ? `(${AI_TOOL_UNIT_LABEL[tool.unit]})` : "token/credit"}</label>
          <input
            type="number"
            min={0}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className={inputCls}
            placeholder="เช่น 120"
          />
        </div>
        <div>
          <label className={labelCls}>
            ต้นทุน (บาท){" "}
            <span className="text-zinc-600">
              {rate != null ? "· auto จากเรตเฉลี่ย แก้ได้" : "· ยังไม่มีเรต กรอกเอง"}
            </span>
          </label>
          <input
            type="number"
            min={0}
            value={costDisplay}
            onChange={(e) => setCostOverride(e.target.value)}
            className={inputCls}
            placeholder="0"
          />
        </div>
        <div>
          <label className={labelCls}>จำนวนผลงาน</label>
          <input
            type="number"
            min={0}
            value={outputsCount}
            onChange={(e) => setOutputsCount(e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>ประเภทผลงาน</label>
          <FilterSelect
            value={outputType}
            onChange={(v) => setOutputType(v as AiOutputType)}
            className="w-full"
            options={(["video", "image", "other"] as AiOutputType[]).map((o) => ({
              value: o,
              label: AI_OUTPUT_TYPE_LABEL[o],
            }))}
          />
        </div>
      </div>

      <WorkPicker links={links} onChange={setLinks} />

      <div>
        <label className={labelCls}>โน้ต (ถ้ามี)</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} placeholder="รายละเอียดเพิ่มเติม" />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={submit}
          disabled={saving}
          className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
        >
          {saving ? "กำลังบันทึก..." : "บันทึก"}
        </button>
        {msg && <span className="text-sm text-emerald-300">{msg}</span>}
        {err && <span className="text-sm text-red-400">{err}</span>}
      </div>
    </section>
  );
}

function WorkPicker({
  links,
  onChange,
}: {
  links: AiLinkSearchResult[];
  onChange: (l: AiLinkSearchResult[]) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<AiLinkSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!q.trim()) {
      setResults([]);
      return;
    }
    timer.current = setTimeout(async () => {
      try {
        const r = await aiLinkSearch(q.trim());
        setResults(r);
        setOpen(true);
      } catch {
        setResults([]);
      }
    }, 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q]);

  function add(r: AiLinkSearchResult) {
    if (!links.some((l) => l.entityType === r.entityType && l.entityId === r.entityId)) {
      onChange([...links, r]);
    }
    setQ("");
    setResults([]);
    setOpen(false);
  }

  return (
    <div>
      <label className={labelCls}>
        ผูกงานจริง <span className="text-red-400">*บังคับ</span>{" "}
        <span className="text-zinc-600">(Episode / Shot / Content — ค้นหาแล้วเลือก)</span>
      </label>
      <div className="flex flex-wrap gap-1 pb-2">
        {links.map((l, i) => (
          <span
            key={`${l.entityType}-${l.entityId}`}
            className="flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[11px] text-amber-200"
          >
            <EntityIcon type={l.entityType} /> {l.label}
            <button
              onClick={() => onChange(links.filter((_, idx) => idx !== i))}
              className="text-amber-300/70 hover:text-amber-100"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="relative">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          className={inputCls}
          placeholder="ค้นหา Episode (โค้ด/ชื่อ) หรือ Content..."
        />
        {open && results.length > 0 && (
          <div className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl">
            {results.map((r) => (
              <button
                key={`${r.entityType}-${r.entityId}`}
                onClick={() => add(r)}
                className="block w-full px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-800"
              >
                <EntityIcon type={r.entityType} className="mr-1 inline size-3.5" />
                {r.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
