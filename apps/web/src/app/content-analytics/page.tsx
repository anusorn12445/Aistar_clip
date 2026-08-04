"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BarChart3, Brain, Wallet } from "lucide-react";
import AppShell from "@/components/AppShell";
import { FilterSelect } from "@/components/ui/filter-select";
import {
  ContentInsight,
  INSIGHT_SCOPE_LABEL,
  InsightRankedBucket,
  InsightSynthesis,
  InsightTopPerformer,
  RoiResponse,
  fetchContentInsight,
  fetchContentInsights,
  fetchContentRoi,
  fetchInsightStatus,
  generateInsight,
  getToken,
} from "@/lib/api";

const SCOPES = ["overall", "platform", "character", "format", "time"] as const;
const PERF_METRICS = [
  { key: "views", label: "วิว" },
  { key: "gmv", label: "GMV" },
] as const;
type PerfMetricKey = (typeof PERF_METRICS)[number]["key"];

function fmt(dt: string): string {
  return new Date(dt).toLocaleString("th-TH", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function num(n: number): string {
  return n.toLocaleString("th-TH");
}

// inline bar (ไม่พึ่ง chart lib) — สไตล์เบาแบบเดิมของแอป
function Bar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
      <div className="h-full rounded-full bg-amber-400/70" style={{ width: `${pct}%` }} />
    </div>
  );
}

// ─── 💰 ROI ต่อคลิป — ต้นทุน AI (AI Usage) vs ผลงาน (deterministic) ──
// ฝั่งเงิน (GMV/กำไร/ROI) เห็นเฉพาะ CEO — server ส่ง null + ceo:false ให้ non-CEO

const ROI_PLATFORMS = [
  "tiktok",
  "facebook_reels",
  "instagram_reels",
  "youtube_shorts",
  "tiktok_shop",
  "shopee_video",
  "lazada",
  "line_oa",
] as const;
const ROI_SOURCE_TYPES = [
  { value: "", label: "ทุกที่มา" },
  { value: "affiliate", label: "affiliate" },
] as const;

function baht(n: number): string {
  return n.toLocaleString("th-TH", { maximumFractionDigits: 2 });
}

// แถบกำไรต่อแถว — เขียวกำไร / แดงขาดทุน (CEO) · non-CEO ใช้แถบวิวสีเหลืองแทน
function ProfitBar({ value, maxAbs }: { value: number; maxAbs: number }) {
  const pct = maxAbs > 0 ? Math.max(2, Math.round((Math.abs(value) / maxAbs) * 100)) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
      <div
        className={`h-full rounded-full ${value >= 0 ? "bg-emerald-400/70" : "bg-red-400/70"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function RoiSection({ from, to }: { from: string; to: string }) {
  const [platform, setPlatform] = useState("");
  const [sourceType, setSourceType] = useState("");
  // เก็บรวมใน state เดียว — effect เซ็ต state เฉพาะใน async callback (ตาม react-hooks rule)
  // ระหว่างรีเฟรช แสดงข้อมูลชุดเดิมค้างไว้ ไม่กระพริบ
  const [state, setState] = useState<{
    data: RoiResponse | null;
    error: string | null;
    loading: boolean;
  }>({ data: null, error: null, loading: true });

  useEffect(() => {
    let alive = true;
    fetchContentRoi({
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(platform ? { platform } : {}),
      ...(sourceType ? { sourceType } : {}),
    })
      .then((r) => {
        if (alive) setState({ data: r, error: null, loading: false });
      })
      .catch((e) => {
        if (alive)
          setState({
            data: null,
            error: e instanceof Error ? e.message : "โหลด ROI ไม่สำเร็จ",
            loading: false,
          });
      });
    return () => {
      alive = false;
    };
  }, [from, to, platform, sourceType]);

  const { data, error, loading } = state;
  const ceo = data?.ceo ?? false;
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const maxAbsProfit = useMemo(
    () => Math.max(...rows.map((r) => Math.abs(r.profit ?? 0)), 1),
    [rows],
  );
  const maxViews = useMemo(() => Math.max(...rows.map((r) => r.views), 1), [rows]);

  return (
    <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-200">
            <Wallet className="size-4" /> ROI ต่อคลิป (ต้นทุน AI vs ผลงาน)
          </h2>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            ต้นทุน = AI Usage ที่ผูกตรงกับคลิป · ต้นทุนอีพี (แชร์ทั้งอีพี) แสดงแยก ไม่รวมในกำไร
            · ใช้ช่วงวันที่ &ldquo;ตั้งแต่/ถึง&rdquo; ด้านบน
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect
            value={platform}
            onChange={setPlatform}
            options={[
              { value: "", label: "ทุกแพลตฟอร์ม" },
              ...ROI_PLATFORMS.map((p) => ({ value: p, label: p })),
            ]}
          />
          <div className="flex gap-1 rounded-lg border border-zinc-700 p-0.5 text-[11px]">
            {ROI_SOURCE_TYPES.map((s) => (
              <button
                key={s.value}
                onClick={() => setSourceType(s.value)}
                className={`rounded px-2 py-0.5 ${
                  sourceType === s.value
                    ? "bg-amber-400 text-zinc-900"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!ceo && data && (
        <p className="mb-3 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-[11px] text-zinc-500">
          GMV/กำไร เห็นเฉพาะผู้บริหาร
        </p>
      )}

      {error && (
        <div className="rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="p-6 text-center text-sm text-zinc-500">กำลังโหลด ROI...</div>
      )}

      {!error && data && rows.length === 0 && !loading && (
        <div className="rounded-lg border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-600">
          ยังไม่มีข้อมูล — บันทึกต้นทุนที่ AI Usage และผูกงานกับคอนเทนต์ก่อน
        </div>
      )}

      {!error && data && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-xs">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-[11px] text-zinc-500">
                <th className="py-2 pr-3 font-medium">ชื่อคลิป</th>
                <th className="py-2 pr-3 font-medium">platform</th>
                <th className="py-2 pr-3 text-right font-medium">ต้นทุน (บาท)</th>
                <th className="py-2 pr-3 text-right font-medium" title="ต้นทุนระดับอีพี — แชร์กันทุกคลิปในอีพี">
                  ต้นทุนอีพี*
                </th>
                <th className="py-2 pr-3 text-right font-medium">วิว</th>
                <th className="py-2 pr-3 text-right font-medium">บาท/วิว</th>
                {ceo && (
                  <>
                    <th className="py-2 pr-3 text-right font-medium">GMV</th>
                    <th className="py-2 pr-3 text-right font-medium">กำไร</th>
                    <th className="py-2 pr-3 text-right font-medium">ROI%</th>
                  </>
                )}
                <th className="w-28 py-2 font-medium">{ceo ? "กำไร" : "วิว"}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.contentItemId} className="border-b border-zinc-800/60">
                  <td className="max-w-[220px] py-2 pr-3">
                    <span className="block truncate text-zinc-200">{r.title}</span>
                    {r.sourceType && (
                      <span className="rounded bg-zinc-800 px-1 py-0.5 text-[10px] text-zinc-400">
                        {r.sourceType}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-zinc-400">{r.platform}</td>
                  <td className="py-2 pr-3 text-right text-zinc-200">{baht(r.cost)}</td>
                  <td className="py-2 pr-3 text-right text-zinc-500">
                    {r.episodeCost > 0 ? baht(r.episodeCost) : "—"}
                  </td>
                  <td className="py-2 pr-3 text-right text-zinc-200">{num(r.views)}</td>
                  <td className="py-2 pr-3 text-right text-zinc-400">
                    {r.costPerView == null ? "—" : r.costPerView.toLocaleString("th-TH", { maximumFractionDigits: 4 })}
                  </td>
                  {ceo && (
                    <>
                      <td className="py-2 pr-3 text-right text-zinc-200">
                        {r.gmv == null ? "—" : baht(r.gmv)}
                      </td>
                      <td
                        className={`py-2 pr-3 text-right font-medium ${
                          (r.profit ?? 0) >= 0 ? "text-emerald-300" : "text-red-300"
                        }`}
                      >
                        {r.profit == null ? "—" : baht(r.profit)}
                      </td>
                      <td
                        className={`py-2 pr-3 text-right ${
                          (r.roi ?? 0) >= 0 ? "text-emerald-300" : "text-red-300"
                        }`}
                      >
                        {r.roi == null
                          ? "—"
                          : `${(r.roi * 100).toLocaleString("th-TH", { maximumFractionDigits: 1 })}%`}
                      </td>
                    </>
                  )}
                  <td className="py-2">
                    {ceo ? (
                      <ProfitBar value={r.profit ?? 0} maxAbs={maxAbsProfit} />
                    ) : (
                      <Bar value={r.views} max={maxViews} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="text-[11px] font-semibold text-zinc-300">
                <td className="py-2 pr-3">
                  รวม ({num(data.count)} คลิป{data.count > rows.length ? ` · แสดง ${num(rows.length)}` : ""})
                </td>
                <td className="py-2 pr-3" />
                <td className="py-2 pr-3 text-right text-amber-300">
                  {baht(data.totals.totalCost)}
                </td>
                <td className="py-2 pr-3" />
                <td className="py-2 pr-3 text-right text-amber-300">
                  {num(data.totals.totalViews)}
                </td>
                <td className="py-2 pr-3" />
                {ceo && (
                  <>
                    <td className="py-2 pr-3 text-right text-amber-300">
                      {data.totals.totalGmv == null ? "—" : baht(data.totals.totalGmv)}
                    </td>
                    <td
                      className={`py-2 pr-3 text-right ${
                        (data.totals.totalProfit ?? 0) >= 0 ? "text-emerald-300" : "text-red-300"
                      }`}
                    >
                      {data.totals.totalProfit == null ? "—" : baht(data.totals.totalProfit)}
                    </td>
                    <td className="py-2 pr-3" />
                  </>
                )}
                <td className="py-2" />
              </tr>
            </tfoot>
          </table>
          <p className="mt-2 text-[10px] text-zinc-600">
            * ต้นทุนอีพี = AI Usage ที่ผูกกับอีพี/ช็อตของอีพีนั้น — แชร์กันทุกคลิปในอีพีเดียวกัน
            จึงไม่ถูกนำมาคิดกำไรต่อคลิป
          </p>
        </div>
      )}
    </div>
  );
}

function DimBlock({ title, buckets }: { title: string; buckets: InsightRankedBucket[] }) {
  if (!buckets || buckets.length === 0) return null;
  const max = Math.max(...buckets.map((b) => b.views), 1);
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <h3 className="mb-3 text-sm font-semibold text-zinc-200">{title}</h3>
      <div className="space-y-2.5">
        {buckets.map((b) => (
          <div key={b.key}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
              <span className="min-w-0 truncate text-zinc-300">{b.label}</span>
              <span className="shrink-0 text-zinc-500">
                {num(b.views)} วิว{b.gmv > 0 ? ` · GMV ${num(b.gmv)}` : ""}
              </span>
            </div>
            <Bar value={b.views} max={max} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ContentAnalyticsPage() {
  const router = useRouter();

  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [history, setHistory] = useState<ContentInsight[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // form
  const [scope, setScope] = useState<string>("overall");
  const [scopeRef, setScopeRef] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // result
  const [loading, setLoading] = useState(false);
  const [insight, setInsight] = useState<ContentInsight | null>(null);
  const [perfMetric, setPerfMetric] = useState<PerfMetricKey>("views");

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }, []);

  const loadHistory = useCallback(() => {
    fetchContentInsights({ pageSize: "12" })
      .then((r) => setHistory(r.items))
      .catch(() => setHistory([]));
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    fetchInsightStatus()
      .then((s) => setAiConfigured(s.configured))
      .catch(() => setAiConfigured(false));
    loadHistory();
  }, [router, loadHistory]);

  async function analyze() {
    setLoading(true);
    setError(null);
    try {
      const res = await generateInsight({
        scope,
        ...(scopeRef.trim() ? { scopeRef: scopeRef.trim() } : {}),
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
      });
      setInsight(res.insight);
      if (res.aiUnavailable) showToast("AI ยังไม่ได้ตั้งค่า — แสดงผลเชิงตัวเลข (deterministic) เท่านั้น");
      loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "วิเคราะห์ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  async function openInsight(id: string) {
    try {
      const r = await fetchContentInsight(id);
      setInsight(r);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      showToast(e instanceof Error ? e.message : "เปิดไม่สำเร็จ");
    }
  }

  const agg = insight?.insightJson?.aggregates ?? null;
  const synth: InsightSynthesis | null = insight?.insightJson?.synthesis ?? null;
  const aiAvailable = insight?.insightJson?.aiAvailable ?? false;

  const sortedPerformers = useMemo<InsightTopPerformer[]>(() => {
    if (!agg) return [];
    return [...agg.topPerformers].sort((a, b) =>
      perfMetric === "gmv" ? b.gmv - a.gmv || b.views - a.views : b.views - a.views || b.gmv - a.gmv,
    );
  }, [agg, perfMetric]);

  const perfMax = useMemo(() => {
    if (sortedPerformers.length === 0) return 1;
    return Math.max(
      ...sortedPerformers.map((p) => (perfMetric === "gmv" ? p.gmv : p.views)),
      1,
    );
  }, [sortedPerformers, perfMetric]);

  return (
    <AppShell title="Content Analytics">
      {toast && (
        <div className="fixed right-6 top-20 z-50 rounded-lg bg-amber-400 px-4 py-2 text-sm font-medium text-zinc-900 shadow-lg">
          {toast}
        </div>
      )}

      {aiConfigured === false && (
        <div className="mb-4 rounded-lg border border-amber-900 bg-amber-950/30 px-3 py-2 text-sm text-amber-300">
          AI ยังไม่ได้ตั้งค่า — ระบบยังวิเคราะห์เชิงตัวเลข (อันดับ/ค่าที่ดีที่สุด) ได้ แต่จะไม่มีบทสรุป/คำแนะนำจาก AI
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* left: controls + history */}
        <div className="space-y-5">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <label className="mb-1.5 block text-xs font-semibold text-zinc-400">ขอบเขต (scope)</label>
            <div className="mb-2 grid grid-cols-3 gap-1 rounded-lg border border-zinc-700 p-0.5 text-xs">
              {SCOPES.slice(0, 3).map((s) => (
                <button
                  key={s}
                  onClick={() => setScope(s)}
                  className={`rounded-md px-2 py-1.5 ${
                    scope === s ? "bg-amber-400 text-zinc-900" : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {INSIGHT_SCOPE_LABEL[s].label}
                </button>
              ))}
            </div>
            <div className="mb-3 grid grid-cols-2 gap-1 rounded-lg border border-zinc-700 p-0.5 text-xs">
              {SCOPES.slice(3).map((s) => (
                <button
                  key={s}
                  onClick={() => setScope(s)}
                  className={`rounded-md px-2 py-1.5 ${
                    scope === s ? "bg-amber-400 text-zinc-900" : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {INSIGHT_SCOPE_LABEL[s].label}
                </button>
              ))}
            </div>
            <p className="mb-3 text-[11px] text-zinc-500">{INSIGHT_SCOPE_LABEL[scope]?.desc}</p>

            {(scope === "platform" || scope === "format" || scope === "character") && (
              <>
                <label className="mb-1.5 block text-xs font-semibold text-zinc-400">
                  {scope === "platform"
                    ? "แพลตฟอร์ม (เช่น tiktok)"
                    : scope === "format"
                      ? "ฟอร์แมต (เช่น short_video)"
                      : "characterId"}{" "}
                  — ไม่ใส่ก็ได้
                </label>
                <input
                  value={scopeRef}
                  onChange={(e) => setScopeRef(e.target.value)}
                  placeholder="เจาะจงค่า scope (ไม่บังคับ)"
                  className="mb-3 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm outline-none focus:border-amber-400"
                />
              </>
            )}

            <div className="mb-3 grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-400">ตั้งแต่</label>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm outline-none focus:border-amber-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-400">ถึง</label>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm outline-none focus:border-amber-400"
                />
              </div>
            </div>

            <button
              onClick={analyze}
              disabled={loading}
              className="inline-flex w-full items-center justify-center gap-1 rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-900 disabled:opacity-50"
            >
              {loading ? "กำลังวิเคราะห์..." : <><BarChart3 className="size-3.5" /> วิเคราะห์</>}
            </button>
            <p className="mt-2 text-[11px] text-zinc-600">
              ตัวเลข/อันดับคำนวณจากข้อมูลจริง (deterministic) — AI แค่ช่วยตีความเป็นบทสรุป/คำแนะนำ
            </p>
          </div>

          {/* history */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <h2 className="mb-2 text-sm font-semibold text-zinc-200">ประวัติการวิเคราะห์</h2>
            {history.length === 0 ? (
              <p className="text-xs text-zinc-600">ยังไม่มี insight</p>
            ) : (
              <div className="space-y-1">
                {history.map((h) => (
                  <button
                    key={h.id}
                    onClick={() => openInsight(h.id)}
                    className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs hover:bg-zinc-800 ${
                      insight?.id === h.id ? "bg-zinc-800" : ""
                    }`}
                  >
                    <span className="min-w-0 truncate text-zinc-300">
                      <span className="text-amber-300">
                        {INSIGHT_SCOPE_LABEL[h.scope]?.label ?? h.scope}
                      </span>{" "}
                      · {h.sampleSize} คอนเทนต์
                    </span>
                    <span className="shrink-0 text-zinc-600">{fmt(h.createdAt)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* right: result */}
        <div className="space-y-5 lg:col-span-2">
          {error && (
            <div className="rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}

          {loading && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-8 text-center text-sm text-zinc-500">
              กำลังคำนวณ aggregates + ตีความด้วย AI...
            </div>
          )}

          {!loading && !insight && (
            <div className="rounded-xl border border-dashed border-zinc-800 p-10 text-center text-sm text-zinc-600">
              เลือกขอบเขต + ช่วงเวลา แล้วกด &ldquo;วิเคราะห์&rdquo; — insight จะขึ้นที่นี่
            </div>
          )}

          {!loading && insight && agg && (
            <>
              {agg.sampleSize === 0 ? (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-8 text-center text-sm text-zinc-500">
                  ไม่พบข้อมูลผลงาน (performance) ในช่วง/ขอบเขตที่เลือก — ลองขยายช่วงเวลาหรือเปลี่ยน scope
                </div>
              ) : (
                <>
                  {/* summary */}
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                    <div className="mb-1 flex items-center justify-between">
                      <h2 className="text-sm font-semibold text-zinc-200">สรุป</h2>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] ${
                          aiAvailable
                            ? "bg-emerald-900/60 text-emerald-200"
                            : "bg-zinc-800 text-zinc-400"
                        }`}
                      >
                        {aiAvailable ? "AI ตีความ" : "เชิงตัวเลข"}
                      </span>
                    </div>
                    <p className="text-sm text-zinc-300">{insight.summary}</p>
                  </div>

                  {/* KPI cards */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      { label: "คอนเทนต์ที่วิเคราะห์", value: num(agg.sampleSize) },
                      { label: "แพลตฟอร์มเด่น", value: agg.best.bestPlatform ?? "—" },
                      { label: "ฟอร์แมตเด่น", value: agg.best.bestFormat ?? "—" },
                      { label: "เวลาเด่น", value: agg.best.bestTime ?? "—" },
                    ].map((k) => (
                      <div
                        key={k.label}
                        className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3"
                      >
                        <p className="text-[11px] text-zinc-500">{k.label}</p>
                        <p className="mt-1 truncate text-base font-semibold text-amber-300">
                          {k.value}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* top performers */}
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <h2 className="text-sm font-semibold text-zinc-200">คอนเทนต์ที่เวิร์คสุด</h2>
                      <div className="flex gap-1 rounded-lg border border-zinc-700 p-0.5 text-[11px]">
                        {PERF_METRICS.map((m) => (
                          <button
                            key={m.key}
                            onClick={() => setPerfMetric(m.key)}
                            className={`rounded px-2 py-0.5 ${
                              perfMetric === m.key
                                ? "bg-amber-400 text-zinc-900"
                                : "text-zinc-400 hover:text-zinc-200"
                            }`}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2.5">
                      {sortedPerformers.map((p) => {
                        const val = perfMetric === "gmv" ? p.gmv : p.views;
                        return (
                          <div key={p.contentItemId}>
                            <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                              <span className="min-w-0 truncate text-zinc-200">
                                {p.title}
                                <span className="ml-1 text-zinc-600">
                                  [{[p.platform, p.format].filter(Boolean).join("/")}]
                                </span>
                              </span>
                              <span className="shrink-0 text-zinc-400">
                                {perfMetric === "gmv" ? `GMV ${num(p.gmv)}` : `${num(p.views)} วิว`}
                              </span>
                            </div>
                            <Bar value={val} max={perfMax} />
                            {p.hook && (
                              <p className="mt-1 truncate text-[11px] text-zinc-500">Hook: {p.hook}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* dimensions */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <DimBlock title="ตามแพลตฟอร์ม" buckets={agg.byPlatform} />
                    <DimBlock title="ตามฟอร์แมต" buckets={agg.byFormat} />
                    <DimBlock title="ตามตัวละคร" buckets={agg.byCharacter} />
                    <DimBlock title="ตามช่วงเวลา" buckets={agg.byHour} />
                  </div>

                  {/* patterns */}
                  {synth && synth.patterns.length > 0 && (
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                      <h2 className="mb-3 text-sm font-semibold text-zinc-200">แพตเทิร์นที่พบ</h2>
                      <div className="space-y-2">
                        {synth.patterns.map((p, i) => (
                          <div key={i} className="rounded-lg bg-zinc-800/50 p-3">
                            <p className="text-sm text-zinc-200">{p.signal}</p>
                            <p className="mt-1 text-xs text-zinc-400">{p.evidence}</p>
                            {p.metric && (
                              <span className="mt-1 inline-block rounded bg-amber-400/10 px-1.5 py-0.5 text-[10px] text-amber-300">
                                {p.metric}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* recommendations → ส่งเข้า Ideation */}
                  {synth && synth.recommendations.length > 0 && (
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                      <h2 className="mb-3 text-sm font-semibold text-zinc-200">
                        คำแนะนำ (ป้อนกลับเข้า Ideation)
                      </h2>
                      <div className="space-y-2">
                        {synth.recommendations.map((r, i) => (
                          <div
                            key={i}
                            className="flex items-start justify-between gap-3 rounded-lg bg-zinc-800/50 p-3"
                          >
                            <div className="min-w-0">
                              <p className="text-sm text-zinc-200">{r.action}</p>
                              {r.rationale && (
                                <p className="mt-1 text-xs text-zinc-500">{r.rationale}</p>
                              )}
                              {r.targetPlatform && (
                                <span className="mt-1 inline-block rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
                                  {r.targetPlatform}
                                </span>
                              )}
                            </div>
                            <Link
                              href={`/ideation?seedText=${encodeURIComponent(r.action)}${
                                r.targetPlatform
                                  ? `&platformHint=${encodeURIComponent(r.targetPlatform)}`
                                  : ""
                              }`}
                              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-zinc-700 px-3 py-1 text-xs text-amber-300 hover:border-amber-400"
                            >
                              <Brain className="size-3.5" /> ส่งเข้า Ideation
                            </Link>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* 💰 ROI ต่อคลิป — ต้นทุน AI vs ผลงาน (ใช้ from/to ชุดเดียวกับด้านบน) */}
      <RoiSection from={from} to={to} />
    </AppShell>
  );
}
